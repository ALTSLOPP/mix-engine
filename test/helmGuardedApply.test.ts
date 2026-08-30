import { describe, expect, it } from 'vitest';
import { ATOMIC_SCENE_COMMANDS, preflightCommands } from '../src/helm/CommandPreflight';
import { HELM_MANIFEST } from '../src/helm/manifest';
import { HelmBridge } from '../src/helm/HelmBridge';
import * as THREE from 'three';
import { resolveCommandRefs, resolveEntityRef } from '../src/helm/EntityRefs';

describe('HELM Guarded Apply preflight', () => {
  it('resolves stable names and GUIDs while refusing ambiguous tags', () => {
    const entities = [
      { id: 7, guid: 'guid-hero', name: 'hero', tags: ['player', 'combatant'] },
      { id: 9, guid: 'guid-rival', name: 'rival', tags: ['combatant'] },
    ];
    expect(resolveEntityRef('@hero', entities)).toEqual(expect.objectContaining({ ok: true, id: 7 }));
    expect(resolveEntityRef('guid:guid-rival', entities)).toEqual(expect.objectContaining({ ok: true, id: 9 }));
    const ambiguous = resolveEntityRef('tag:combatant', entities);
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.candidates).toHaveLength(2);
    expect(ambiguous.error).toMatch(/refusing an ambiguous edit/i);
  });

  it('normalizes only entity-reference fields, including nested and array refs', () => {
    const entities = [
      { id: 2, guid: 'g-parent', name: 'parent', tags: ['anchor'] },
      { id: 3, guid: 'g-child', name: 'child', tags: [] },
    ];
    const result = resolveCommandRefs({
      type: 'example', id: '@parent', entityId: '@child', parentId: 'tag:anchor',
      entityIds: ['guid:g-parent', { name: 'child' }], nested: { targetEntityId: '@parent' },
    }, entities);
    expect(result.errors).toEqual([]);
    expect(result.commands[0]).toEqual(expect.objectContaining({
      id: '@parent', entityId: 3, parentId: 2, entityIds: [2, 3], nested: { targetEntityId: 2 },
    }));
    expect(result.resolved).toHaveLength(5);
  });

  it('accepts a complete scene command and produces an IDE-readable plan', () => {
    const result = preflightCommands({ type: 'spawn_entity', x: 0, y: 2, z: 0, glbPath: 'hero' }, true);
    expect(result.valid).toBe(true);
    expect(result.atomicSafe).toBe(true);
    expect(result.plan).toEqual([{
      index: 0,
      type: 'spawn_entity',
      known: true,
      effect: 'scene',
      atomicSafe: true,
    }]);
  });

  it('blocks malformed commands before mutation and suggests close command names', () => {
    const result = preflightCommands([
      { type: 'spawn_entitty', x: 0, y: 0, z: 0, glbPath: 'box' },
      { type: 'set_transform', entityId: 4 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues[0].suggestion).toContain('spawn_entity');
    // position and rotation are optional, but entityId is required.
    expect(result.issues.some((issue) => issue.path.endsWith('.entityId'))).toBe(false);
  });

  it('reports missing required parameters with an exact JSON path', () => {
    const result = preflightCommands({ type: 'spawn_entity', x: 0, y: 1, z: 2 });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: 'commands[0].glbPath',
      message: expect.stringContaining("Missing required parameter 'glbPath'"),
    }));
  });

  it('refuses false atomicity for runtime and external side effects', () => {
    const result = preflightCommands({ type: 'play_sound', src: 'impact.ogg' }, true);
    expect(result.valid).toBe(false);
    expect(result.atomicSafe).toBe(false);
    expect(result.issues[0].suggestion).toContain('atomic:false');
  });

  it('keeps the rollback-safe allowlist synchronized with the manifest', () => {
    const documented = new Set(HELM_MANIFEST.commands.map((command) => command.type));
    for (const type of ATOMIC_SCENE_COMMANDS) expect(documented.has(type), type).toBe(true);
    expect(HELM_MANIFEST.ops.map((entry) => entry.op)).toEqual(expect.arrayContaining(['plan', 'apply']));
  });

  it('rolls back a failed postcondition and deduplicates a successful IDE retry', async () => {
    const records = new Map<number, any>();
    const names = new Map<number, string>();
    const tags = new Map<number, string[]>();
    let nextId = 1;
    const makeBody = (position: THREE.Vector3) => ({
      mesh: new THREE.Object3D(),
      rapierBody: {
        isFixed: () => true, isKinematic: () => false, setBodyType: () => {},
      },
      additionalMass: 0,
      teleport(pos: THREE.Vector3, quat: THREE.Quaternion) { this.mesh.position.copy(pos); this.mesh.quaternion.copy(quat); },
      rescaleCollider: () => {}, setAdditionalMass: () => {},
    });
    const spawn = (position: THREE.Vector3, blueprint: any) => {
      const id = nextId++;
      const rb = makeBody(position); rb.mesh.position.copy(position);
      records.set(id, { rb, blueprint, guid: `guid-${id}`, parent: undefined });
      return id;
    };
    const initialId = spawn(new THREE.Vector3(0, 0, 0), { kind: 'box', params: { hx: 1, hy: 1, hz: 1, dynamic: false } });
    names.set(initialId, 'origin');

    const deferredDestroy = new Set<number>();
    const sceneManager: any = {
      allEntityIds: () => [...records.keys()],
      get entityCount() { return records.size; },
      getRigidBody: (id: number) => records.get(id)?.rb ?? null,
      getBlueprint: (id: number) => records.get(id)?.blueprint,
      getGuid: (id: number) => records.get(id)?.guid,
      ensureGuid: (id: number) => records.get(id).guid,
      setGuid: (id: number, guid: string) => { records.get(id).guid = guid; },
      getParent: (id: number) => records.get(id)?.parent,
      parentEntity: (id: number, parent: number) => { records.get(id).parent = parent; },
      spawnNow: (position: THREE.Vector3, blueprint: any) => spawn(position, blueprint),
      requestDestroy: (id: number) => deferredDestroy.add(id),
      flushDeferredOperations: () => { for (const id of deferredDestroy) { records.delete(id); names.delete(id); tags.delete(id); } deferredDestroy.clear(); },
      hasPendingDeferredOps: () => false,
    };
    const ai: any = {
      pendingCommandCount: 0, inFlightAsync: 0,
      executeAll(commands: any[]) {
        for (const command of commands) {
          if (command.type === 'set_transform') records.get(command.entityId).rb.mesh.position.set(command.position.x, command.position.y, command.position.z);
          if (command.type === 'spawn_entity') spawn(new THREE.Vector3(command.x, command.y, command.z), { kind: 'box', params: { assetId: command.glbPath } });
        }
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
    const bridge = new HelmBridge(engine, ai);
    try {
      const failed = await bridge.handle({
        id: 'a', op: 'apply', settleMs: 0,
        commands: { type: 'set_transform', entityId: '@origin', position: { x: 9, y: 0, z: 0 } },
        expects: [{ kind: 'entity_near', name: 'missing', position: [9, 0, 0], radius: 0.1 }],
      });
      expect(failed.ok).toBe(false);
      expect(failed.rolledBack).toBe(true);
      expect(records.size).toBe(1);
      expect([...records.values()][0].rb.mesh.position.x).toBe(0);
      expect((failed.data as any).refs.resolved[0]).toEqual(expect.objectContaining({ ref: '@origin', id: 1 }));

      const restoredId = [...records.keys()][0];
      const resolved = await bridge.handle({ id: 'resolve', op: 'resolve', ref: '@origin' });
      expect((resolved.data as any).entity.id).toBe(restoredId);
      expect((resolved.data as any).entity.guid).toBe('guid-1');

      const request = {
        id: 'b', op: 'apply' as const, requestKey: 'spawn-crate-v1', settleMs: 0,
        commands: { type: 'spawn_entity' as const, x: 2, y: 0, z: 0, glbPath: 'crate' },
      };
      const first = await bridge.handle(request);
      const afterFirst = records.size;
      const retry = await bridge.handle({ ...request, id: 'c' });
      expect(first.ok).toBe(true);
      expect(retry.replayed).toBe(true);
      expect(records.size).toBe(afterFirst);
    } finally {
      bridge.dispose();
    }
  });
});
