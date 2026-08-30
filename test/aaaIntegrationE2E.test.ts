import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CommandRegistry,
  BatchPlanner,
  DataflowResolver,
} from '../src/commands';
import {
  SceneStateHasher,
  TransactionCoordinator,
  TransactionJournal,
  EditLeaseManager,
  CapabilityGuard,
  ReleaseValidator,
} from '../src/authoring';
import {
  ProjectCompiler,
  ProjectReconciler,
  createEmptyProject,
  type ProjectDocument,
  type EntityRecord,
} from '../src/project';
import {
  AssetDatabase,
  AssetCooker,
} from '../src/assets';
import {
  WorldPartitioner,
  StreamingBundler,
  CHUNK_SIZE,
} from '../src/streaming';
import {
  PerformanceProfiler,
  RegressionHarness,
} from '../src/diagnostics';
import {
  RenderGraph,
  type RenderPassNode,
} from '../src/rendering/RenderGraph';
import {
  MaterialNodeGraphCompiler,
  type MaterialGraph,
} from '../src/materials/MaterialNodeGraph';
import type { AICommand } from '../src/ai/AIBridge';

describe('MIX Engine Master AAA IDE-First E2E Pipeline Integration Test', () => {
  it('executes a complete end-to-end authoring, reconciliation, cooking, partitioning, and rollback workflow', async () => {
    // 1. Declarative Project Document Authoring
    const projectDoc: ProjectDocument = {
      ...createEmptyProject('E2E AAA Game'),
      environment: {
        timeOfDay: 17.5,
        fogDensity: 0.015,
        fogColor: '#ffaa77',
      },
      scenes: {
        main: [
          {
            guid: 'g-player',
            name: 'PlayerCharacter',
            tags: ['player', 'controllable'],
            blueprint: { kind: 'character', params: { assetId: 'hero.glb' } },
            transform: { position: [0, 1, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
            components: { Health: { current: 100, max: 100 } },
          },
          {
            guid: 'g-sword',
            name: 'Excalibur',
            parentGuid: 'g-player',
            blueprint: { kind: 'weapon', params: { assetId: 'sword.glb' } },
            transform: { position: [0, 1.8, 0.4], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
          },
          {
            guid: 'g-outpost',
            name: 'GuardTower',
            blueprint: { kind: 'building', params: { assetId: 'tower.glb' } },
            transform: { position: [CHUNK_SIZE + 50, 0, CHUNK_SIZE + 50], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
          },
        ],
      },
    };

    // 2. Project Compiler: Compile document to command stream
    const compiledCommands = ProjectCompiler.compileDocument(projectDoc, 'main');
    expect(compiledCommands.length).toBeGreaterThan(0);

    // 3. Security Capability Guard
    for (const cmd of compiledCommands) {
      const auth = CapabilityGuard.isCommandAllowed(['admin'], cmd.type);
      expect(auth.allowed).toBe(true);
    }

    // 4. Batch Planning & Dataflow Analysis
    const batchItems = compiledCommands.map((c, i) => ({
      id: `cmd-${i}`,
      command: c,
    }));
    const batchPlan = BatchPlanner.plan(batchItems);
    expect(batchPlan.valid).toBe(true);
    expect(batchPlan.executionOrder.length).toBe(compiledCommands.length);

    // 5. Multi-Agent Edit Lease Lock
    const leaseManager = new EditLeaseManager();
    const playerLease = leaseManager.acquireLease('g-player', 'agent-gemini-1');
    expect(playerLease.ok).toBe(true);
    expect(leaseManager.canEdit('g-player', 'agent-gemini-1')).toBe(true);
    expect(leaseManager.canEdit('g-player', 'agent-claude-2')).toBe(false);

    // 6. Live Scene State Hashing & Transaction Journal
    const journal = new TransactionJournal();
    const liveEntities = projectDoc.scenes['main'];
    const initialHash = SceneStateHasher.hashState({ entities: liveEntities });
    expect(initialHash).toHaveLength(16);

    const txRecord = journal.recordStart({
      transactionId: 'tx-e2e-001',
      requestKey: 'req-e2e-1',
      commands: compiledCommands,
      beforeStateHash: initialHash,
    });
    expect(txRecord.status).toBe('active');

    // 7. Project Reconciler (Minimal delta computation)
    const modifiedDesired: EntityRecord[] = [
      ...liveEntities.filter((e) => e.guid !== 'g-outpost' && e.guid !== 'g-player'), // remove outpost; replace player below
      {
        guid: 'g-player',
        name: 'PlayerSuperHero', // modified name
        tags: ['player', 'controllable', 'level10'], // modified tags
        blueprint: { kind: 'character', params: { assetId: 'hero.glb' } },
        transform: { position: [0, 5, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] }, // modified position
        components: { Health: { current: 200, max: 200 } },
      },
      {
        guid: 'g-castle', // added castle
        name: 'RoyalCastle',
        blueprint: { kind: 'castle', params: {} },
        transform: { position: [100, 0, 100], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
    ];

    const reconReport = ProjectReconciler.reconcile(modifiedDesired, liveEntities);
    expect(reconReport.addedGuids).toEqual(['g-castle']);
    expect(reconReport.removedGuids).toEqual(['g-outpost']);
    expect(reconReport.modifiedGuids).toEqual(['g-player']);
    expect(reconReport.unchangedGuids).toEqual(['g-sword']);

    // 8. Asset Database & Cooker
    const assetDb = new AssetDatabase();
    const tex = assetDb.registerAsset('textures/hero_albedo.png');
    const mat = assetDb.registerAsset('materials/hero.mat', {
      guid: 'g-mat-hero',
      type: 'material',
      version: 1,
      dependencies: [tex.guid],
    });
    assetDb.registerAsset('models/hero.glb', {
      guid: 'g-mesh-hero',
      type: 'mesh',
      version: 1,
      dependencies: [mat.guid],
    });

    const cookResult = AssetCooker.cook(assetDb);
    expect(cookResult.ok).toBe(true);
    expect(cookResult.manifest?.totalAssets).toBe(3);

    // 9. World Spatial Partitioning & Local Bundling
    const partition = WorldPartitioner.partition(liveEntities, CHUNK_SIZE);
    expect(partition.cells.has('0|0')).toBe(true);
    expect(partition.cells.has('1|1')).toBe(true);

    const worldBundle = StreamingBundler.bundleWorld(partition);
    expect(worldBundle.totalChunks).toBe(2);
    expect(worldBundle.chunks['0|0'].entities).toHaveLength(2); // hero + child sword
    expect(worldBundle.chunks['1|1'].entities).toHaveLength(1); // tower

    // 10. Performance Profiler & Golden Baseline Regression Check
    const profiler = new PerformanceProfiler(60);
    profiler.beginFrame(1000);
    profiler.mark('physics', 1002);
    profiler.mark('render', 1010);
    const perfReport = profiler.endFrame({ drawCalls: 30, triangles: 8000, entityCount: 3 });

    const regressionCheck = RegressionHarness.compareWithBaseline(perfReport, perfReport, 0.1);
    expect(regressionCheck.passed).toBe(true);

    // 11. RenderGraph and Material Node Graph Compiler
    const renderGraph = new RenderGraph();
    renderGraph.addPass({ name: 'DepthPass', inputs: [], outputs: ['Depth'], execute: () => {} });
    renderGraph.addPass({ name: 'ColorPass', inputs: ['Depth'], outputs: ['HDR'], execute: () => {} });
    const orderedPasses = renderGraph.compile();
    expect(orderedPasses.map((p) => p.name)).toEqual(['DepthPass', 'ColorPass']);

    const shaderGraph: MaterialGraph = {
      name: 'ProceduralPbr',
      nodes: [
        { id: 'albedoConst', type: 'constant_vec3', params: { value: [0.8, 0.2, 0.1] } },
        { id: 'master', type: 'pbr_surface', inputs: { albedo: { nodeId: 'albedoConst' } } },
      ],
      outputNodeId: 'master',
    };
    const compiledShader = MaterialNodeGraphCompiler.compile(shaderGraph);
    expect(compiledShader.fragmentShader).toContain('gl_FragColor');

    // 12. Pre-flight Release Validation
    const releaseReport = ReleaseValidator.validate({
      project: projectDoc,
      assetDb,
      journal,
    });
    expect(releaseReport.valid).toBe(true);
    expect(releaseReport.errors).toHaveLength(0);

    // 13. Verified Canonical State Preservation
    const recomputedInitialHash = SceneStateHasher.hashState({ entities: projectDoc.scenes['main'] });
    expect(recomputedInitialHash).toBe(initialHash);

    // 14. Integrated HelmBridge Execution: RBAC, Leases, GUIDs, and Rollback
    const mockRecords = new Map<number, any>();
    const mockNames = new Map<number, string>();
    const mockTags = new Map<number, string[]>();
    let e2eNextId = 1;
    const makeMockBody = (position: THREE.Vector3) => ({
      mesh: new THREE.Object3D().translateX(position.x).translateY(position.y).translateZ(position.z),
      rapierBody: { isFixed: () => true, isKinematic: () => false, setBodyType: () => {} },
      additionalMass: 0,
      teleport(pos: THREE.Vector3, quat: THREE.Quaternion) { this.mesh.position.copy(pos); this.mesh.quaternion.copy(quat); },
      rescaleCollider: () => {}, setAdditionalMass: () => {},
    });
    const mockSpawn = (position: THREE.Vector3, blueprint: any, options: any = {}) => {
      const id = e2eNextId++;
      const rb = makeMockBody(position);
      mockRecords.set(id, { rb, blueprint, guid: options.guid ?? `guid-${id}`, parent: undefined });
      return id;
    };

    const deferredDestroy = new Set<number>();
    const mockSceneManager: any = {
      allEntityIds: () => [...mockRecords.keys()],
      get entityCount() { return mockRecords.size; },
      getRigidBody: (id: number) => mockRecords.get(id)?.rb ?? null,
      getBlueprint: (id: number) => mockRecords.get(id)?.blueprint,
      getGuid: (id: number) => mockRecords.get(id)?.guid,
      getEntityByGuid: (guid: string) => {
        for (const [id, rec] of mockRecords) if (rec.guid === guid) return id;
        return undefined;
      },
      ensureGuid: (id: number) => mockRecords.get(id)?.guid ?? `guid-${id}`,
      setGuid: (id: number, guid: string) => { if (mockRecords.has(id)) mockRecords.get(id).guid = guid; },
      getParent: (id: number) => mockRecords.get(id)?.parent,
      getParentGuid: (id: number) => {
        const pId = mockRecords.get(id)?.parent;
        return pId !== undefined ? mockRecords.get(pId)?.guid : undefined;
      },
      parentEntity: (id: number, parent: number) => { if (mockRecords.has(id)) mockRecords.get(id).parent = parent; },
      spawnNow: (pos: THREE.Vector3, bp: any, opts: any) => mockSpawn(pos, bp, opts),
      requestSpawn: (pos: THREE.Vector3, bp: any, opts: any) => mockSpawn(pos, bp, opts),
      requestDestroy: (id: number) => deferredDestroy.add(id),
      flushDeferredOperations: () => {
        for (const id of deferredDestroy) { mockRecords.delete(id); mockNames.delete(id); mockTags.delete(id); }
        deferredDestroy.clear();
      },
      hasPendingDeferredOps: () => false,
      getComponent: () => null,
      getTags: (id: number) => mockTags.get(id) ?? [],
    };

    const mockAiBridge: any = {
      pendingCommandCount: 0, inFlightAsync: 0,
      execute(command: any) { this.executeAll([command]); },
      executeAll(commands: any[]) {
        for (const cmd of commands) {
          if (cmd.type === 'set_transform') {
            const rec = mockRecords.get(cmd.entityId);
            if (rec) rec.rb.mesh.position.set(cmd.position?.x ?? 0, cmd.position?.y ?? 0, cmd.position?.z ?? 0);
          } else if (cmd.type === 'spawn_entity') {
            mockSpawn(new THREE.Vector3(cmd.x, cmd.y, cmd.z), { kind: 'box', params: { assetId: cmd.glbPath } }, { guid: cmd.guid });
          } else if (cmd.type === 'set_entity_name') {
            mockNames.set(cmd.entityId, cmd.name);
          } else if (cmd.type === 'tag_entity') {
            mockTags.set(cmd.entityId, [...(mockTags.get(cmd.entityId) ?? []), cmd.tag]);
          }
        }
      },
      getEntityName: (id: number) => mockNames.get(id),
      getEntityTags: (id: number) => mockTags.get(id) ?? [],
      setEntityName: (id: number, name: string) => mockNames.set(id, name),
      addEntityTag: (id: number, tag: string) => mockTags.set(id, [...(mockTags.get(id) ?? []), tag]),
    };

    const mockEngine: any = {
      sceneManager: mockSceneManager,
      viewport: { camera: new THREE.PerspectiveCamera(), scene: new THREE.Scene() },
      worldOrigin: { toWorldSpaceInto: (out: THREE.Vector3, v: THREE.Vector3) => out.copy(v), toEngineSpaceInto: (out: THREE.Vector3, v: THREE.Vector3) => out.copy(v) },
      physicsWorld: { RAPIER: { RigidBodyType: { Fixed: 0, Dynamic: 1, KinematicPositionBased: 2 } } },
      gizmo: { detach: () => {} },
      manifest: { preload: async () => {} },
      sky: { timeOfDay: 12 },
      fog: { density: 0.01 },
    };

    const { HelmBridge } = await import('../src/helm/HelmBridge');
    const helm = new HelmBridge(mockEngine, mockAiBridge);

    // 14a. RBAC Enforcement at Command Dispatch
    const viewerForbidden = await helm.handle({
      id: 'req-rbac-test',
      op: 'do',
      roles: ['viewer'], // viewer only has read caps
      commands: [{ type: 'clear_scene' }],
    });
    expect(viewerForbidden.ok).toBe(false);
    expect(viewerForbidden.error).toMatch(/Authorization or edit lease check failed/i);

    // 14b. GUID Preservation in Spawn & Addressability
    const adminSpawn = await helm.handle({
      id: 'req-spawn-test',
      op: 'do',
      roles: ['admin'],
      commands: [
        { type: 'spawn_entity', guid: 'g-player', x: 0, y: 1, z: 0, glbPath: 'hero.glb' },
      ],
    });
    expect(adminSpawn.ok).toBe(true);
    const playerEntityId = mockSceneManager.getEntityByGuid('g-player');
    expect(playerEntityId).toBeDefined();

    // Now move the spawned entity via GUID reference (separate call since entity must exist for ref resolution)
    const moveResult = await helm.handle({
      id: 'req-move-test',
      op: 'do',
      roles: ['admin'],
      commands: [
        { type: 'set_transform', entityId: playerEntityId!, position: { x: 0, y: 10, z: 0 } },
      ],
    });
    expect(moveResult.ok).toBe(true);
    expect(mockRecords.get(playerEntityId!).rb.mesh.position.y).toBe(10);

    // 14c. Multi-Agent Edit Lease Enforcement
    helm.leases.acquireLease('g-player', 'agent-gemini-1');
    const foreignEdit = await helm.handle({
      id: 'req-lease-test',
      op: 'do',
      roles: ['admin'],
      agentId: 'agent-claude-2',
      commands: [{ type: 'set_transform', entityId: playerEntityId!, position: { x: 0, y: 50, z: 0 } }],
    });
    expect(foreignEdit.ok).toBe(false);
    expect(foreignEdit.error).toMatch(/Edit lease violation/i);

    // 14d. Atomic Apply & Rollback
    const failedApply = await helm.handle({
      id: 'req-atomic-test',
      op: 'apply',
      roles: ['admin'],
      atomic: true,
      commands: [{ type: 'spawn_entity', guid: 'g-temp', x: 10, y: 10, z: 10, glbPath: 'temp.glb' }],
      expects: [{ kind: 'entity_exists', name: 'NonExistentEntity' }],
    });
    expect(failedApply.ok).toBe(false);
    expect(failedApply.rolledBack).toBe(true);
  });
});
