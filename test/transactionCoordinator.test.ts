import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SceneStateHasher } from '../src/authoring/SceneStateHasher';
import { TransactionJournal } from '../src/authoring/TransactionJournal';
import { TransactionCoordinator } from '../src/authoring/TransactionCoordinator';
import { InverseFactory } from '../src/authoring/InverseOperation';
import { EntityTransactionAdapter, ComponentTransactionAdapter } from '../src/authoring/adapters';

describe('SceneStateHasher Unit Tests', () => {
  it('generates byte-identical hash regardless of object key order', () => {
    const stateA = {
      entities: [
        { guid: 'g-1', name: 'Hero', position: [0, 1, 0] as [number, number, number], tags: ['player'] },
        { guid: 'g-2', name: 'Sword', position: [0, 2, 0] as [number, number, number] },
      ],
    };

    const stateB = {
      entities: [
        { position: [0, 2, 0] as [number, number, number], guid: 'g-2', name: 'Sword' },
        { tags: ['player'], guid: 'g-1', position: [0, 1, 0] as [number, number, number], name: 'Hero' },
      ],
    };

    const hashA = SceneStateHasher.hashState(stateA);
    const hashB = SceneStateHasher.hashState(stateB);
    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(16);
  });

  it('detects subtle modifications in transform or identity', () => {
    const base = {
      entities: [{ guid: 'g-1', name: 'Hero', position: [0, 1, 0] as [number, number, number] }],
    };
    const modifiedPos = {
      entities: [{ guid: 'g-1', name: 'Hero', position: [0, 1.001, 0] as [number, number, number] }],
    };
    const modifiedName = {
      entities: [{ guid: 'g-1', name: 'SuperHero', position: [0, 1, 0] as [number, number, number] }],
    };

    const hashBase = SceneStateHasher.hashState(base);
    const hashPos = SceneStateHasher.hashState(modifiedPos);
    const hashName = SceneStateHasher.hashState(modifiedName);

    expect(hashBase).not.toBe(hashPos);
    expect(hashBase).not.toBe(hashName);
    expect(SceneStateHasher.hashState({ entities: [{ guid: 'g', position: [0, 1, 0] }] }))
      .not.toBe(SceneStateHasher.hashState({ entities: [{ guid: 'g', position: [0, 1.0000000001, 0] }] }));
  });
});

describe('TransactionJournal Unit Tests', () => {
  it('tracks active, committed, and rolled back transactions', () => {
    const journal = new TransactionJournal();
    const entry = journal.recordStart({
      transactionId: 'tx-100',
      requestKey: 'req-key-1',
      commands: [{ type: 'spawn_entity', x: 0, y: 0, z: 0, glbPath: 'box' }],
      beforeStateHash: 'hash-before-100',
    });

    expect(entry.status).toBe('active');
    expect(journal.getByRequestKey('req-key-1')?.transactionId).toBe('tx-100');

    journal.recordCommit('tx-100', 'hash-after-100', []);
    expect(journal.get('tx-100')?.status).toBe('committed');
    expect(journal.get('tx-100')?.afterStateHash).toBe('hash-after-100');
  });

  it('detects dangling uncommitted transactions on boot', () => {
    const journal = new TransactionJournal();
    journal.recordStart({
      transactionId: 'tx-active-1',
      commands: [{ type: 'set_transform', entityId: 1 }],
      beforeStateHash: 'h1',
    });

    const dangling = journal.detectDanglingTransactions();
    expect(dangling).toHaveLength(1);
    expect(dangling[0].transactionId).toBe('tx-active-1');
  });

  it('rehydrates executable inverse operations from durable JSON', () => {
    const journal = new TransactionJournal();
    journal.recordStart({ transactionId: 'tx-durable', commands: [], beforeStateHash: 'before' });
    journal.addInverse('tx-durable', InverseFactory.spawnInverse('g-created', 7));

    const loaded = new TransactionJournal();
    loaded.deserialize(journal.serialize());
    const inverse = loaded.get('tx-durable')?.inverses[0];
    let destroyed: number | undefined;
    inverse?.execute({
      sceneManager: { getEntityByGuid: () => 7, destroyNow: (id: number) => { destroyed = id; } },
      engine: {}, aiBridge: {},
    } as any);
    expect(destroyed).toBe(7);
  });
});

describe('Universal Transaction Coordinator Rollback & Fuzz Testing', () => {
  let records: Map<number, { id: number; guid: string; rb: any; bp: any; parentGuid?: string }>;
  let names: Map<number, string>;
  let tags: Map<number, string[]>;
  let components: Map<number, Record<string, any>>;
  let stateVars: Map<string, unknown>;
  let nextId: number;

  let sceneManager: any;
  let aiBridge: any;
  let engine: any;
  let coordinator: TransactionCoordinator;

  beforeEach(() => {
    nextId = 1;
    records = new Map();
    names = new Map();
    tags = new Map();
    components = new Map();
    stateVars = new Map();

    const spawn = (pos: THREE.Vector3, bp: any, guid?: string) => {
      const id = nextId++;
      const mesh = new THREE.Mesh();
      mesh.position.copy(pos);
      const assignedGuid = guid ?? `guid-${id}`;
      const rb = {
        mesh,
        rapierBody: {
          isFixed: () => false,
          isKinematic: () => false,
          translation: () => ({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }),
          rotation: () => ({ x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w }),
        },
      };
      records.set(id, { id, guid: assignedGuid, rb, bp });
      return id;
    };

    sceneManager = {
      entityCount: () => records.size,
      allEntityIds: () => [...records.keys()],
      getGuid: (id: number) => records.get(id)?.guid,
      setGuid: (id: number, g: string) => { const r = records.get(id); if (r) r.guid = g; },
      getEntityByGuid: (guid: string) => {
        for (const [id, r] of records.entries()) {
          if (r.guid === guid) return id;
        }
        return undefined;
      },
      getParentGuid: (id: number) => records.get(id)?.parentGuid,
      getBlueprint: (id: number) => records.get(id)?.bp ?? { kind: 'box' },
      getRigidBody: (id: number) => records.get(id)?.rb,
      spawnNow: (pos: THREE.Vector3, bp: any) => spawn(pos, bp),
      spawnEntity: (bp: any, x: number, y: number, z: number) => spawn(new THREE.Vector3(x, y, z), bp),
      destroyNow: (id: number) => {
        records.delete(id);
        names.delete(id);
        tags.delete(id);
        components.delete(id);
      },
      destroyEntity: (id: number) => {
        records.delete(id);
        names.delete(id);
        tags.delete(id);
        components.delete(id);
      },
    };

    aiBridge = {
      getEntityName: (id: number) => names.get(id),
      getEntityTags: (id: number) => tags.get(id) ?? [],
      setEntityName: (id: number, name: string) => names.set(id, name),
      addEntityTag: (id: number, tag: string) => tags.set(id, [...(tags.get(id) ?? []), tag]),
      execute: (cmd: any) => {
        if (cmd.type === 'spawn_entity') spawn(new THREE.Vector3(cmd.x ?? 0, cmd.y ?? 0, cmd.z ?? 0), { kind: cmd.glbPath });
        if (cmd.type === 'set_transform') {
          const rb = records.get(cmd.entityId)?.rb;
          if (rb && cmd.position) rb.mesh.position.set(cmd.position.x, cmd.position.y, cmd.position.z);
        }
        if (cmd.type === 'set_entity_name') names.set(cmd.entityId, cmd.name);
        if (cmd.type === 'tag_entity') tags.set(cmd.entityId, [...(tags.get(cmd.entityId) ?? []), cmd.tag]);
        if (cmd.type === 'component_add') {
          if (!components.has(cmd.entityId)) components.set(cmd.entityId, {});
          components.get(cmd.entityId)![cmd.component] = cmd.props;
        }
        if (cmd.type === 'component_remove') {
          if (components.has(cmd.entityId)) delete components.get(cmd.entityId)![cmd.component];
        }
        if (cmd.type === 'set_state') stateVars.set(cmd.key, cmd.value);
        if (cmd.type === 'remove_state') stateVars.delete(cmd.key);
      },
    };

    engine = {
      sceneManager,
      aiBridge,
    };

    coordinator = new TransactionCoordinator(engine, aiBridge);
  });

  it('restores hash-identical state when rolling back fine-grained mutations', async () => {
    // Seed initial scene with 2 entities
    const id1 = sceneManager.spawnEntity({ kind: 'hero' }, 0, 0, 0);
    aiBridge.setEntityName(id1, 'BaseHero');
    aiBridge.addEntityTag(id1, 'hero_tag');

    const id2 = sceneManager.spawnEntity({ kind: 'tree' }, 5, 0, 5);
    aiBridge.setEntityName(id2, 'Oak');

    const initialHash = coordinator.computeStateHash();

    // Start transaction
    const txId = coordinator.beginTransaction([
      { type: 'spawn_entity', x: 10, y: 0, z: 10, glbPath: 'enemy' },
      { type: 'set_transform', entityId: id1, position: { x: 99, y: 99, z: 99 } },
      { type: 'set_entity_name', entityId: id1, name: 'MutatedHero' },
    ]);

    // Record inverse for entity1 transform
    const transInv = EntityTransactionAdapter.captureTransform(sceneManager, id1);
    if (transInv) coordinator.recordInverse(txId, transInv);

    // Record inverse for entity1 name
    const idInv = EntityTransactionAdapter.captureIdentity(sceneManager, aiBridge, id1);
    if (idInv) coordinator.recordInverse(txId, idInv);

    // Apply mutations
    aiBridge.execute({ type: 'set_transform', entityId: id1, position: { x: 99, y: 99, z: 99 } });
    aiBridge.execute({ type: 'set_entity_name', entityId: id1, name: 'MutatedHero' });

    // Spawn 3rd entity and record its spawn inverse
    const id3 = sceneManager.spawnEntity({ kind: 'enemy' }, 10, 0, 10);
    const spawnInv = EntityTransactionAdapter.captureSpawn(sceneManager, id3);
    coordinator.recordInverse(txId, spawnInv);

    // Verify state was mutated
    const mutatedHash = coordinator.computeStateHash();
    expect(mutatedHash).not.toBe(initialHash);
    expect(records.size).toBe(3);
    expect(names.get(id1)).toBe('MutatedHero');

    // Trigger rollback
    const rollbackRes = await coordinator.rollback(txId, 'intentional test abort');
    expect(rollbackRes.success).toBe(true);
    expect(rollbackRes.hashMatched).toBe(true);

    // Verify hash-identical restoration
    const restoredHash = coordinator.computeStateHash();
    expect(restoredHash).toBe(initialHash);
    expect(records.size).toBe(2);
    expect(names.get(id1)).toBe('BaseHero');
    expect(records.get(id1)?.rb.mesh.position.x).toBe(0);
  });

  it('passes 50-command seeded fuzz rollback test to byte-identical project state', async () => {
    // Seed initial scene
    for (let i = 0; i < 5; i++) {
      const id = sceneManager.spawnEntity({ kind: `prop_${i}` }, i * 2, 0, i * 2);
      aiBridge.setEntityName(id, `Entity_${i}`);
      aiBridge.addEntityTag(id, `tag_${i % 2}`);
    }

    const baselineHash = coordinator.computeStateHash();
    const txId = coordinator.beginTransaction([], 'fuzz-test-key');

    // Deterministic PRNG
    let seed = 12345;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // Execute 50 randomized mutations and record inverse operations
    const createdIds: number[] = [];
    for (let step = 0; step < 50; step++) {
      const opChoice = Math.floor(random() * 4);
      const currentIds = sceneManager.allEntityIds();

      if (opChoice === 0 || currentIds.length === 0) {
        // Spawn
        const x = Math.round(random() * 100);
        const y = Math.round(random() * 10);
        const z = Math.round(random() * 100);
        const newId = sceneManager.spawnEntity({ kind: `fuzz_${step}` }, x, y, z);
        createdIds.push(newId);
        coordinator.recordInverse(txId, EntityTransactionAdapter.captureSpawn(sceneManager, newId));
      } else if (opChoice === 1) {
        // Transform
        const targetId = currentIds[Math.floor(random() * currentIds.length)];
        const inv = EntityTransactionAdapter.captureTransform(sceneManager, targetId);
        if (inv) coordinator.recordInverse(txId, inv);
        aiBridge.execute({
          type: 'set_transform',
          entityId: targetId,
          position: { x: random() * 50, y: random() * 5, z: random() * 50 },
        });
      } else if (opChoice === 2) {
        // Name
        const targetId = currentIds[Math.floor(random() * currentIds.length)];
        const inv = EntityTransactionAdapter.captureIdentity(sceneManager, aiBridge, targetId);
        if (inv) coordinator.recordInverse(txId, inv);
        aiBridge.execute({
          type: 'set_entity_name',
          entityId: targetId,
          name: `Fuzzed_${step}`,
        });
      } else {
        // Component
        const targetId = currentIds[Math.floor(random() * currentIds.length)];
        const beforeProps = components.get(targetId)?.['FuzzComp'] ?? null;
        const inv = ComponentTransactionAdapter.captureComponent(sceneManager, targetId, 'FuzzComp', beforeProps);
        if (inv) coordinator.recordInverse(txId, inv);
        aiBridge.execute({
          type: 'component_add',
          entityId: targetId,
          component: 'FuzzComp',
          props: { value: step },
        });
      }
    }

    const fuzzedHash = coordinator.computeStateHash();
    expect(fuzzedHash).not.toBe(baselineHash);

    // Rollback entire 50-step sequence
    const rollbackRes = await coordinator.rollback(txId);
    expect(rollbackRes.success).toBe(true);
    expect(rollbackRes.hashMatched).toBe(true);

    const postRollbackHash = coordinator.computeStateHash();
    expect(postRollbackHash).toBe(baselineHash);
    expect(sceneManager.allEntityIds().length).toBe(5);
  });
});
