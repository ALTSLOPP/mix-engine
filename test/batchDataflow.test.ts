import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HelmBridge } from '../src/helm/HelmBridge';
import { BatchPlanner, DataflowResolver } from '../src/commands';

describe('DataflowResolver Unit Tests', () => {
  it('extracts all referenced binding names from nested objects and arrays', () => {
    const command = {
      type: 'parent_entity',
      entityId: { $ref: 'child.created[0].id' },
      parentId: { $ref: 'parent.id' },
      nested: [
        { target: { $ref: 'extra.result.entityId' } },
      ],
    };

    const refs = DataflowResolver.extractRefs(command);
    expect(refs.sort()).toEqual(['child', 'extra', 'parent'].sort());
  });

  it('safely resolves nested property paths and array indices without eval', () => {
    const bindings = new Map<string, unknown>([
      ['hero', { id: 42, created: [{ id: 42, name: 'Hero' }], data: { score: 100 } }],
    ]);

    expect(DataflowResolver.resolvePath('hero.id', bindings)).toEqual({ value: 42, found: true });
    expect(DataflowResolver.resolvePath('hero.created[0].id', bindings)).toEqual({ value: 42, found: true });
    expect(DataflowResolver.resolvePath('hero.created[0].name', bindings)).toEqual({ value: 'Hero', found: true });
    expect(DataflowResolver.resolvePath('hero.data.score', bindings)).toEqual({ value: 100, found: true });
  });

  it('rejects prototype pollution attempts in $ref path navigation', () => {
    const bindings = new Map<string, unknown>([['hero', { id: 1 }]]);

    const res1 = DataflowResolver.resolvePath('hero.__proto__.polluted', bindings);
    expect(res1.found).toBe(false);
    expect(res1.error).toContain('forbidden property');

    const res2 = DataflowResolver.resolvePath('hero.constructor.prototype', bindings);
    expect(res2.found).toBe(false);
    expect(res2.error).toContain('forbidden property');
  });

  it('deeply resolves $ref objects inside arbitrary payloads', () => {
    const bindings = new Map<string, unknown>([
      ['hero', { id: 10 }],
      ['sword', { id: 20 }],
    ]);

    const payload = {
      type: 'parent_entity',
      entityId: { $ref: 'sword.id' },
      parentId: { $ref: 'hero.id' },
    };

    const { resolved, errors } = DataflowResolver.resolveRefs(payload, bindings);
    expect(errors).toHaveLength(0);
    expect(resolved).toEqual({
      type: 'parent_entity',
      entityId: 20,
      parentId: 10,
    });
  });
});

describe('BatchPlanner Unit Tests', () => {
  it('plans plain AICommands with zero dependencies', () => {
    const batch = [
      { type: 'spawn_entity', x: 0, y: 0, z: 0, glbPath: 'box' },
      { type: 'set_time_of_day', hour: 14 },
    ];

    const plan = BatchPlanner.plan(batch);
    expect(plan.valid).toBe(true);
    expect(plan.nodes).toHaveLength(2);
    expect(plan.executionOrder).toEqual([0, 1]);
    expect(plan.bindings.size).toBe(0);
  });

  it('detects duplicate binding alias declarations', () => {
    const batch = [
      { command: { type: 'spawn_entity', x: 0, y: 0, z: 0, glbPath: 'box' }, as: 'entityA' },
      { command: { type: 'spawn_entity', x: 1, y: 0, z: 0, glbPath: 'box' }, as: 'entityA' },
    ];

    const plan = BatchPlanner.plan(batch);
    expect(plan.valid).toBe(false);
    expect(plan.errors.some((e) => e.includes('Duplicate binding alias'))).toBe(true);
  });

  it('detects undeclared binding references', () => {
    const batch = [
      {
        command: {
          type: 'set_entity_name',
          entityId: { $ref: 'ghost.id' },
          name: 'Spooky',
        },
      },
    ];

    const plan = BatchPlanner.plan(batch);
    expect(plan.valid).toBe(false);
    expect(plan.errors.some((e) => e.includes("undeclared binding 'ghost'"))).toBe(true);
  });

  it('topologically sorts dependent nodes into valid execution order', () => {
    const batch = [
      {
        command: {
          type: 'set_entity_name',
          entityId: { $ref: 'hero.id' },
          name: 'Warrior',
        },
        as: 'nameStep',
      },
      {
        command: {
          type: 'spawn_entity',
          x: 0,
          y: 0,
          z: 0,
          glbPath: 'hero',
        },
        as: 'hero',
      },
    ];

    const plan = BatchPlanner.plan(batch);
    expect(plan.valid).toBe(true);
    // hero (index 1) must execute before nameStep (index 0)
    expect(plan.executionOrder).toEqual([1, 0]);
  });

  it('detects circular dependency cycles between nodes', () => {
    const batch = [
      {
        command: { type: 'set_transform', entityId: { $ref: 'b.id' } },
        as: 'a',
      },
      {
        command: { type: 'set_transform', entityId: { $ref: 'a.id' } },
        as: 'b',
      },
    ];

    const plan = BatchPlanner.plan(batch);
    expect(plan.valid).toBe(false);
    expect(plan.errors.some((e) => e.includes('Circular dependency cycle'))).toBe(true);
  });
});

describe('HELM Intra-Batch Dataflow End-to-End Acceptance Test', () => {
  it('executes full multi-step dataflow batch in one round-trip', async () => {
    let nextId = 1;
    const records = new Map<number, { id: number; guid: string; rb: any; bp: any; parentId?: number }>();
    const names = new Map<number, string>();
    const tags = new Map<number, string[]>();
    const components = new Map<number, Record<string, any>>();

    const spawn = (pos: THREE.Vector3, bp: any) => {
      const id = nextId++;
      const mesh = new THREE.Mesh();
      mesh.position.copy(pos);
      const rb = {
        mesh,
        rapierBody: {
          isFixed: () => false,
          isKinematic: () => false,
          translation: () => ({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }),
          rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
        },
      };
      records.set(id, { id, guid: `guid-${id}`, rb, bp });
      return id;
    };

    const sceneManager: any = {
      entityCount: () => records.size,
      allEntityIds: () => [...records.keys()],
      getGuid: (id: number) => records.get(id)?.guid,
      getBlueprint: (id: number) => records.get(id)?.bp,
      getRigidBody: (id: number) => records.get(id)?.rb,
      getTags: (id: number) => tags.get(id) ?? [],
      addTag: (id: number, tag: string) => tags.set(id, [...(tags.get(id) ?? []), tag]),
      hasPendingDeferredOps: () => false,
    };

    const ai: any = {
      pendingCommandCount: 0,
      inFlightAsync: 0,
      lastQueryResult: undefined,
      execute(command: any) {
        if (command.type === 'spawn_entity') {
          spawn(new THREE.Vector3(command.x ?? 0, command.y ?? 0, command.z ?? 0), { kind: command.glbPath });
        } else if (command.type === 'set_entity_name') {
          names.set(command.entityId, command.name);
        } else if (command.type === 'tag_entity') {
          tags.set(command.entityId, [...(tags.get(command.entityId) ?? []), command.tag]);
        } else if (command.type === 'component_add') {
          if (!components.has(command.entityId)) components.set(command.entityId, {});
          components.get(command.entityId)![command.component] = command.props;
        } else if (command.type === 'parent_entity') {
          const childRec = records.get(command.entityId);
          const parentRec = records.get(command.parentId);
          if (childRec && parentRec) {
            childRec.parentId = command.parentId;
            parentRec.rb.mesh.add(childRec.rb.mesh);
          }
        }
      },
      executeAll(commands: any[]) {
        for (const c of commands) this.execute(c);
      },
      getEntityName: (id: number) => names.get(id),
      getEntityTags: (id: number) => tags.get(id) ?? [],
      setEntityName: (id: number, name: string) => names.set(id, name),
      addEntityTag: (id: number, tag: string) => tags.set(id, [...(tags.get(id) ?? []), tag]),
    };

    const engine: any = {
      sceneManager,
      worldOrigin: {
        toWorldSpaceInto: (out: THREE.Vector3, value: THREE.Vector3) => out.copy(value),
      },
      gizmo: { attached: null, detach: () => {} },
      physicsWorld: { RAPIER: { RigidBodyType: { Fixed: 0, KinematicPositionBased: 1, Dynamic: 2 } } },
    };

    const helm = new HelmBridge(engine, ai);

    // Acceptance test specified in prompt:
    // 1. Spawn an entity as "hero"
    // 2. Name it
    // 3. Tag it
    // 4. Attach a component
    // 5. Parent another newly spawned entity to it
    // 6. Assert both exist and are correctly structured
    const batch = [
      {
        command: {
          type: 'spawn_entity',
          x: 0,
          y: 1,
          z: 0,
          glbPath: 'hero',
        },
        as: 'hero',
      },
      {
        command: {
          type: 'set_entity_name',
          entityId: { $ref: 'hero.created[0].id' },
          name: 'PlayerHero',
        },
        as: 'namedHero',
      },
      {
        command: {
          type: 'tag_entity',
          entityId: { $ref: 'hero.id' },
          tag: 'player_hero',
        },
      },
      {
        command: {
          type: 'component_add',
          entityId: { $ref: 'hero.id' },
          component: 'Health',
          props: { hp: 100 },
        },
      },
      {
        command: {
          type: 'spawn_entity',
          x: 0,
          y: 2,
          z: 0,
          glbPath: 'sword',
        },
        as: 'sword',
      },
      {
        command: {
          type: 'parent_entity',
          entityId: { $ref: 'sword.id' },
          parentId: { $ref: 'hero.id' },
        },
      },
    ];

    const res = await helm.handle({
      id: 'batch-test-1',
      op: 'apply',
      commands: batch as any,
      settleMs: 0,
      atomic: false,
      expects: [
        { kind: 'entity_exists', name: 'PlayerHero' },
        { kind: 'entity_exists', tag: 'player_hero' },
        { kind: 'no_errors' },
      ],
    });

    if (!res.ok) {
      console.error('Apply failed:', res.error, res.errors);
    }
    expect(res.ok).toBe(true);
    expect(res.created).toBeDefined();
    expect(res.created!.length).toBe(2);

    // Verify per-command results
    expect(res.commandResults).toBeDefined();
    expect(res.commandResults!.length).toBe(6);

    // Verify bindings were captured
    expect(res.bindings).toBeDefined();
    expect(res.bindings!['hero']).toBeDefined();
    expect(res.bindings!['sword']).toBeDefined();

    const heroId = (res.bindings!['hero'] as any).id;
    const swordId = (res.bindings!['sword'] as any).id;
    expect(heroId).toBeGreaterThan(0);
    expect(swordId).toBeGreaterThan(0);
    expect(heroId).not.toBe(swordId);

    // Verify scene state
    expect(ai.getEntityName(heroId)).toBe('PlayerHero');
    expect(ai.getEntityTags(heroId)).toContain('player_hero');
    expect(components.get(heroId)?.['Health']).toEqual({ hp: 100 });

    const swordRecord = records.get(swordId);
    const heroRecord = records.get(heroId);
    expect(swordRecord).toBeDefined();
    expect(heroRecord).toBeDefined();
    expect(swordRecord!.rb.mesh.parent).toBe(heroRecord!.rb.mesh);
  });

  it('handles authored forward references via topological sorting', async () => {
    let nextId = 100;
    const records = new Map<number, { id: number; guid: string; rb: any }>();
    const names = new Map<number, string>();

    const spawn = () => {
      const id = nextId++;
      const mesh = new THREE.Mesh();
      const rb = { mesh, rapierBody: { isFixed: () => false, isKinematic: () => false, translation: () => ({ x: 0, y: 0, z: 0 }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) } };
      records.set(id, { id, guid: `guid-${id}`, rb });
      return id;
    };

    const sceneManager: any = {
      entityCount: () => records.size,
      allEntityIds: () => [...records.keys()],
      getGuid: (id: number) => records.get(id)?.guid,
      getBlueprint: () => ({ kind: 'hero' }),
      getRigidBody: (id: number) => records.get(id)?.rb,
      getTags: () => [],
      hasPendingDeferredOps: () => false,
    };

    const ai: any = {
      pendingCommandCount: 0, inFlightAsync: 0,
      execute(cmd: any) {
        if (cmd.type === 'spawn_entity') spawn();
        if (cmd.type === 'set_entity_name') names.set(cmd.entityId, cmd.name);
      },
      executeAll(cmds: any[]) { for (const c of cmds) this.execute(c); },
      getEntityName: (id: number) => names.get(id),
      getEntityTags: () => [],
      setEntityName: (id: number, name: string) => names.set(id, name),
    };

    const engine: any = {
      sceneManager,
      worldOrigin: { toWorldSpaceInto: (out: THREE.Vector3, v: THREE.Vector3) => out.copy(v) },
      gizmo: { attached: null, detach: () => {} },
      physicsWorld: { RAPIER: { RigidBodyType: { Fixed: 0, KinematicPositionBased: 1, Dynamic: 2 } } },
    };

    const helm = new HelmBridge(engine, ai);

    // Authored with naming before spawn (forward dependency)
    const forwardBatch = [
      {
        command: { type: 'set_entity_name', entityId: { $ref: 'target.id' }, name: 'ForwardHero' },
        as: 'nameStep',
      },
      {
        command: { type: 'spawn_entity', x: 0, y: 0, z: 0, glbPath: 'hero' },
        as: 'target',
      },
    ];

    const res = await helm.handle({
      id: 'forward-ref-test',
      op: 'apply',
      commands: forwardBatch as any,
      settleMs: 0,
      atomic: false,
    });

    expect(res.ok).toBe(true);
    expect(res.created?.length).toBe(1);
    const spawnedId = res.created![0].id;
    expect(names.get(spawnedId)).toBe('ForwardHero');
  });

  it('reports failed $ref resolution with exact command index and path', async () => {
    const sceneManager: any = {
      entityCount: () => 0,
      allEntityIds: () => [],
      getTags: () => [],
      hasPendingDeferredOps: () => false,
    };
    const ai: any = {
      pendingCommandCount: 0, inFlightAsync: 0,
      execute() {},
      executeAll() {},
      getEntityName: () => undefined,
      getEntityTags: () => [],
    };
    const engine: any = {
      sceneManager,
      worldOrigin: { toWorldSpaceInto: (out: THREE.Vector3, v: THREE.Vector3) => out.copy(v) },
      gizmo: { attached: null, detach: () => {} },
      physicsWorld: { RAPIER: { RigidBodyType: { Fixed: 0, KinematicPositionBased: 1, Dynamic: 2 } } },
    };

    const helm = new HelmBridge(engine, ai);
    const brokenBatch = [
      {
        command: { type: 'spawn_entity', x: 0, y: 0, z: 0, glbPath: 'ghost' },
        as: 'ghost',
      },
      {
        command: { type: 'set_transform', entityId: { $ref: 'ghost.nonExistentProp.id' } },
      },
    ];

    const res = await helm.handle({
      id: 'broken-ref-test',
      op: 'apply',
      commands: brokenBatch as any,
      settleMs: 0,
      atomic: false,
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain('Failed to resolve $ref at command index 1');
  });
});

