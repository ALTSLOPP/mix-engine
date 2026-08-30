import * as THREE from 'three';
import type { AICommand } from '../AIBridge';
import { EnvironmentQuery, EqsGenerators } from '../EnvironmentQuery';
import { WebSocketTransport } from '../../network/NetTransport';
import type { CommandMap, CmdCtx } from './BridgeContext';

/** Command surface for systems that used to exist only as directly-importable classes. */
export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('navmesh_build_multilayer', (cmd: Extract<AICommand, { type: 'navmesh_build_multilayer' }>) => {
    if (!ctx.nav) throw new Error('navigation system unavailable');
    return ctx.nav.buildMultiLayerNavMesh({
      center: new THREE.Vector3(cmd.centerX, 0, cmd.centerZ),
      size: cmd.size,
      cellSize: cmd.cellSize,
      agentRadius: cmd.agentRadius,
      agentHeight: cmd.agentHeight,
      maxSlopeDeg: cmd.maxSlopeDeg,
      maxStepHeight: cmd.maxStepHeight,
    });
  });

  map.set('eqs_query', (cmd: Extract<AICommand, { type: 'eqs_query' }>) => {
    const querier = new THREE.Vector3(...cmd.querier);
    const target = cmd.target ? new THREE.Vector3(...cmd.target) : undefined;
    let items: THREE.Vector3[];
    switch (cmd.generator.kind) {
      case 'grid': items = EqsGenerators.grid(querier, cmd.generator.extent, cmd.generator.spacing); break;
      case 'ring': items = EqsGenerators.ring(querier, cmd.generator.radius, cmd.generator.count); break;
      case 'donut': items = EqsGenerators.donut(querier, cmd.generator.inner, cmd.generator.outer, cmd.generator.rings, cmd.generator.pointsPerRing); break;
    }
    const fromEngine = new THREE.Vector3();
    const toEngine = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const result = EnvironmentQuery.run({ items, tests: cmd.tests }, {
      querier,
      target,
      nav: ctx.nav?.activeGrid ?? undefined,
      lineOfSight: (from, to) => {
        ctx.worldOrigin.toEngineSpaceInto(fromEngine, from);
        ctx.worldOrigin.toEngineSpaceInto(toEngine, to);
        dir.subVectors(toEngine, fromEngine);
        const distance = dir.length();
        if (distance <= 1e-6) return true;
        dir.multiplyScalar(1 / distance);
        const hit = ctx.physicsWorld.raycast(fromEngine, dir, distance, true);
        return !hit || hit.toi >= distance - 0.05;
      },
    });
    return {
      generated: result.generated,
      survived: result.survived,
      best: result.best ? {
        position: result.best.position.toArray(),
        score: result.best.score,
        breakdown: result.best.breakdown,
      } : null,
      items: result.items.map((item) => ({ position: item.position.toArray(), score: item.score, breakdown: item.breakdown })),
    };
  });

  map.set('buoyancy_add', (cmd: Extract<AICommand, { type: 'buoyancy_add' }>) =>
    ({ added: ctx.buoyancy?.add(cmd.entityId, { volume: cmd.volume, height: cmd.height }) ?? false }));
  map.set('buoyancy_remove', (cmd: Extract<AICommand, { type: 'buoyancy_remove' }>) =>
    ({ removed: ctx.buoyancy?.remove(cmd.entityId) ?? false }));
  map.set('buoyancy_status', (cmd: Extract<AICommand, { type: 'buoyancy_status' }>) => ({
    submersion: ctx.buoyancy?.submersionOf(cmd.entityId) ?? null,
    swimming: ctx.buoyancy?.isSwimming(cmd.entityId) ?? false,
  }));

  map.set('active_ragdoll_attach', (cmd: Extract<AICommand, { type: 'active_ragdoll_attach' }>) => ({
    attached: !!ctx.activeRagdolls?.attach(cmd.entityId, {
      muscleStiffness: cmd.muscleStiffness,
      muscleDamping: cmd.muscleDamping,
      defaultStrength: cmd.strength,
    }),
  }));
  map.set('active_ragdoll_knockdown', (cmd: Extract<AICommand, { type: 'active_ragdoll_knockdown' }>) =>
    ({ knockedDown: ctx.activeRagdolls?.knockdown(cmd.entityId, cmd.seconds) ?? false }));
  map.set('active_ragdoll_strength', (cmd: Extract<AICommand, { type: 'active_ragdoll_strength' }>) =>
    ({ changed: ctx.activeRagdolls?.setStrength(cmd.entityId, cmd.strength) ?? false }));

  map.set('spring_bone_add', (cmd: Extract<AICommand, { type: 'spring_bone_add' }>) => {
    const root = ctx.sceneManager.getRigidBody(cmd.entityId)?.mesh;
    if (!root || !ctx.springBones) return { added: false, missing: cmd.bones };
    const bones = cmd.bones.map((name) => root.getObjectByName(name)).filter((bone): bone is THREE.Object3D => !!bone);
    if (bones.length !== cmd.bones.length || bones.length === 0) {
      return { added: false, missing: cmd.bones.filter((name) => !root.getObjectByName(name)) };
    }
    ctx.springBones.addChain(cmd.entityId, bones, {
      stiffness: cmd.stiffness,
      damping: cmd.damping,
      inertia: cmd.inertia,
      radius: cmd.radius,
      gravity: cmd.gravity ? new THREE.Vector3(...cmd.gravity) : undefined,
    });
    return { added: true, bones: cmd.bones };
  });
  map.set('spring_bone_collider', (cmd: Extract<AICommand, { type: 'spring_bone_collider' }>) => {
    const root = ctx.sceneManager.getRigidBody(cmd.entityId)?.mesh;
    if (!root || !ctx.springBones) return { added: false };
    const follow = cmd.bone ? root.getObjectByName(cmd.bone) ?? null : root;
    if (!follow) return { added: false, missing: cmd.bone };
    const center = new THREE.Vector3(...(cmd.offset ?? [0, 0, 0]));
    follow.localToWorld(center);
    ctx.springBones.addCollider(cmd.entityId, center, cmd.radius, follow);
    return { added: true };
  });
  map.set('spring_bone_capsule', (cmd: Extract<AICommand, { type: 'spring_bone_capsule' }>) => {
    const root = ctx.sceneManager.getRigidBody(cmd.entityId)?.mesh;
    const start = root?.getObjectByName(cmd.startBone);
    const end = root?.getObjectByName(cmd.endBone);
    if (!ctx.springBones || !start || !end) return { added: false, missing: [!start ? cmd.startBone : null, !end ? cmd.endBone : null].filter(Boolean) };
    ctx.springBones.addCapsuleCollider(cmd.entityId, start, end, cmd.radius);
    return { added: true };
  });
  map.set('spring_bone_remove', (cmd: Extract<AICommand, { type: 'spring_bone_remove' }>) => {
    ctx.springBones?.removeRig(cmd.entityId);
    return { removed: !!ctx.springBones };
  });

  map.set('foot_ik_set', (cmd: Extract<AICommand, { type: 'foot_ik_set' }>) => {
    if (!ctx.footIK) return { enabled: false, reason: 'system unavailable' };
    if (!cmd.enabled) return { enabled: false, changed: ctx.footIK.setEnabled(cmd.entityId, false) };
    const solver = ctx.footIK.attach(cmd.entityId, cmd);
    return { enabled: !!solver, reason: solver ? undefined : 'humanoid leg bones not found' };
  });

  map.set('chunk_deltas_export', () => ({ data: ctx.chunkDeltas?.serialize() ?? '{}' }));
  map.set('chunk_deltas_import', (cmd: Extract<AICommand, { type: 'chunk_deltas_import' }>) => {
    ctx.chunkDeltas?.deserialize(cmd.data);
    return { imported: !!ctx.chunkDeltas };
  });
  map.set('chunk_deltas_clear', () => { ctx.chunkDeltas?.clear(); return { cleared: !!ctx.chunkDeltas }; });

  map.set('hlod_create', (cmd: Extract<AICommand, { type: 'hlod_create' }>) => {
    if (!ctx.hlod) return { created: false, reason: 'system unavailable' };
    const sources = cmd.entityIds.map((id) => ctx.sceneManager.getRigidBody(id)?.mesh).filter((o): o is THREE.Object3D => !!o);
    if (sources.length === 0) return { created: false, reason: 'no valid source entities' };
    const items = sources.map((source) => ({ position: source.getWorldPosition(new THREE.Vector3()), scale: source.getWorldScale(new THREE.Vector3()) }));
    const prototype = cmd.prototypeEntityId !== undefined
      ? ctx.sceneManager.getRigidBody(cmd.prototypeEntityId)?.mesh ?? null
      : sources[0];
    const handle = ctx.hlod.createCluster(cmd.id, items, prototype, {
      nearDistance: cmd.nearDistance,
      farDistance: cmd.farDistance,
    }, { views: cmd.views, tileSize: cmd.tileSize });
    if (handle) ctx.hlod.bindSources(cmd.id, sources);
    return { created: !!handle, id: cmd.id, sourceCount: sources.length, atlas: !!handle?.atlas };
  });
  map.set('hlod_remove', (cmd: Extract<AICommand, { type: 'hlod_remove' }>) => ({ removed: ctx.hlod?.removeCluster(cmd.id) ?? false }));
  map.set('hlod_list', () => ctx.hlod?.list().map((h) => ({ id: h.id, sources: h.sources.length, atlas: !!h.atlas, impostorVisible: h.impostorVisible })) ?? []);

  map.set('network_host', (cmd: Extract<AICommand, { type: 'network_host' }>) => { ctx.network?.host(new WebSocketTransport(cmd.url)); return ctx.network?.getStats(); });
  map.set('network_join', (cmd: Extract<AICommand, { type: 'network_join' }>) => { ctx.network?.join(new WebSocketTransport(cmd.url)); return ctx.network?.getStats(); });
  map.set('network_disconnect', () => { ctx.network?.disconnect(); return ctx.network?.getStats(); });
  map.set('network_replicate', (cmd: Extract<AICommand, { type: 'network_replicate' }>) => ({
    changed: cmd.enabled === false ? ctx.network?.unreplicate(cmd.entityId) ?? false : ctx.network?.replicate(cmd.entityId) ?? false,
  }));
  map.set('network_local_player', (cmd: Extract<AICommand, { type: 'network_local_player' }>) => { ctx.network?.setLocalPlayer(cmd.entityId); return ctx.network?.getStats(); });
  map.set('network_status', () => ctx.network?.getStats() ?? { role: 'offline', connected: false });

  map.set('gpu_particles_start', async (cmd: Extract<AICommand, { type: 'gpu_particles_start' }>) => {
    if (!ctx.gpuParticles) return { running: false, reason: 'system unavailable' };
    ctx.gpuParticles.mount(ctx.viewport.scene);
    ctx.gpuParticles.setEmitterPosition(cmd.x ?? 0, cmd.y ?? 0, cmd.z ?? 0);
    await ctx.gpuParticles.init();
    return ctx.gpuParticles.status();
  });
  map.set('gpu_particles_stop', () => { ctx.gpuParticles?.stop(); return ctx.gpuParticles?.status(); });
  map.set('gpu_particles_status', () => ctx.gpuParticles?.status() ?? { supported: false, running: false });

  map.set('prefab_register', (cmd: Extract<AICommand, { type: 'prefab_register' }>) => {
    ctx.prefabs?.register(cmd.prefab);
    return { registered: !!ctx.prefabs, name: cmd.prefab.name };
  });
  map.set('prefab_spawn', (cmd: Extract<AICommand, { type: 'prefab_spawn' }>) => {
    const root = ctx.prefabs?.spawn(
      cmd.name,
      new THREE.Vector3(...cmd.position),
      cmd.rotation ? new THREE.Quaternion(...cmd.rotation) : new THREE.Quaternion(),
      cmd.variant,
    ) ?? null;
    return { rootEntity: root, instance: root !== null ? ctx.prefabs?.getInstance(root) : null };
  });
  map.set('prefab_unpack', (cmd: Extract<AICommand, { type: 'prefab_unpack' }>) => ctx.prefabs?.unpack(cmd.rootEntity) ?? null);
  map.set('prefab_list', () => ctx.prefabs?.listPrefabs() ?? []);
  map.set('prefab_instances', () => ctx.prefabs?.listInstances() ?? []);
  map.set('profiler_set', (cmd: Extract<AICommand, { type: 'profiler_set' }>) => { if (ctx.profiler) ctx.profiler.enabled = cmd.enabled; return { enabled: ctx.profiler?.enabled ?? false }; });
  map.set('profiler_status', () => ({ enabled: ctx.profiler?.enabled ?? false, latest: ctx.profiler?.latest() ?? null }));
  map.set('profiler_history', (cmd: Extract<AICommand, { type: 'profiler_history' }>) => ctx.profiler?.history(cmd.limit) ?? []);
  map.set('profiler_clear', () => { ctx.profiler?.clear(); return { cleared: !!ctx.profiler }; });
  map.set('selection_set', (cmd: Extract<AICommand, { type: 'selection_set' }>) => { ctx.selection?.set(cmd.entityIds.filter((id) => ctx.sceneManager.hasEntity(id)), cmd.primary); ctx.selectionChanged?.(); return { entityIds: ctx.selection?.list() ?? [], primary: ctx.selection?.primary ?? null }; });
  map.set('selection_add', (cmd: Extract<AICommand, { type: 'selection_add' }>) => { if (ctx.sceneManager.hasEntity(cmd.entityId)) ctx.selection?.add(cmd.entityId); ctx.selectionChanged?.(); return { entityIds: ctx.selection?.list() ?? [], primary: ctx.selection?.primary ?? null }; });
  map.set('selection_toggle', (cmd: Extract<AICommand, { type: 'selection_toggle' }>) => { if (ctx.sceneManager.hasEntity(cmd.entityId)) ctx.selection?.toggle(cmd.entityId); ctx.selectionChanged?.(); return { entityIds: ctx.selection?.list() ?? [], primary: ctx.selection?.primary ?? null }; });
  map.set('selection_clear', () => { ctx.selection?.clear(); ctx.selectionChanged?.(); return { entityIds: [], primary: null }; });
  map.set('selection_get', () => ({ entityIds: ctx.selection?.list() ?? [], primary: ctx.selection?.primary ?? null }));
}
