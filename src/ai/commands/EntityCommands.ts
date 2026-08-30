import type { CommandMap, CmdCtx } from './BridgeContext';
import { GLOBAL_CHUNK } from '../../streaming/chunkMath';
import * as THREE from 'three';
import type { AICommand } from '../AIBridge';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';
import type { EntityId } from '../../ecs/SceneManager';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('spawn_entity', (cmd: Extract<AICommand, { type: 'spawn_entity' }>) => {
    void ctx.trackAsync(spawnEntity(cmd, ctx));
  });

  map.set('spawn_smart', (cmd: Extract<AICommand, { type: 'spawn_smart' }>) => {
    void ctx.trackAsync(spawnSmart(cmd, ctx));
  });

  map.set('destroy_entity', (cmd: Extract<AICommand, { type: 'destroy_entity' }>) => {
    ctx.sceneManager.requestDestroy(cmd.entityId, 'cascade');
  });

  map.set('set_transform', (cmd: Extract<AICommand, { type: 'set_transform' }>) => {
    setTransform(cmd, ctx);
  });

  map.set('parent_entity', (cmd: Extract<AICommand, { type: 'parent_entity' }>) => {
    ctx.sceneManager.parentEntity(cmd.entityId, cmd.parentId);
  });

  map.set('set_entity_name', (cmd: Extract<AICommand, { type: 'set_entity_name' }>) => {
    ctx.entityNames.set(cmd.entityId, cmd.name);
  });

  map.set('tag_entity', (cmd: Extract<AICommand, { type: 'tag_entity' }>) => {
    ctx.sceneManager.addTag(cmd.entityId, cmd.tag);
  });

  map.set('remove_tag', (cmd: Extract<AICommand, { type: 'remove_tag' }>) => {
    ctx.sceneManager.removeTag(cmd.entityId, cmd.tag);
  });

  map.set('spawn_group', (cmd: Extract<AICommand, { type: 'spawn_group' }>) => {
    for (const p of cmd.positions) {
      ctx.sceneManager.requestSpawn(new THREE.Vector3(p[0], p[1], p[2]), cmd.blueprint, { chunkId: GLOBAL_CHUNK });
    }
  });

  map.set('scatter', (cmd: Extract<AICommand, { type: 'scatter' }>) => {
    const rng = mulberry32(cmd.seed ?? (Math.random() * 0xffffffff) >>> 0);
    const cx = cmd.center[0], cy = cmd.center[1], cz = cmd.center[2];
    for (let i = 0; i < cmd.count; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * cmd.radius;
      ctx.sceneManager.requestSpawn(
        new THREE.Vector3(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r),
        cmd.blueprint,
        { chunkId: GLOBAL_CHUNK },
      );
    }
  });

  map.set('clear_scene', () => {
    const sm = ctx.sceneManager as unknown as {
      entities: Set<EntityId>;
      requestDestroy: (id: EntityId) => void;
    };
    for (const id of [...sm.entities]) sm.requestDestroy(id);
    ctx.entityNames.clear();
    ctx.followers.length = 0;
    ctx.worldOrigin.offset.set(0, 0, 0);
    ctx.viewport.camera.position.set(0, 5, 12);
    ctx.viewport.camera.lookAt(0, 0, 0);
    ctx.sceneManager.requestSpawn(
      new THREE.Vector3(0, -0.5, 0),
      { kind: 'box', params: { hx: 50, hy: 0.5, hz: 50, dynamic: false, color: 0x181a1f } },
      { chunkId: GLOBAL_CHUNK },
    );
  });

  map.set('play_animation', (cmd: Extract<AICommand, { type: 'play_animation' }>) => {
    playAnimation(cmd, ctx);
  });

  map.set('set_material', (cmd: Extract<AICommand, { type: 'set_material' }>) => {
    setMaterial(cmd, ctx);
  });
}

async function spawnEntity(cmd: Extract<AICommand, { type: 'spawn_entity' }>, ctx: CmdCtx): Promise<void> {
  const assetId = cmd.glbPath;
  const worldPos = new THREE.Vector3(cmd.x, cmd.y, cmd.z);

  if (cmd.blueprint) {
    const blueprintAsset = cmd.blueprint.params?.assetId;
    if (typeof blueprintAsset === 'string' && ctx.manifest.get(blueprintAsset)) {
      await ctx.manifest.preload([blueprintAsset]);
    }
    ctx.sceneManager.requestSpawn(worldPos, cmd.blueprint, {
      chunkId: GLOBAL_CHUNK,
      rootMotion: cmd.params?.rootMotion ?? false,
      guid: cmd.guid,
    });
    return;
  }

  if (['box', 'sphere', 'light', 'extrusion'].includes(assetId)) {
    const blueprint = { kind: assetId, params: cmd.params ?? {} };
    ctx.sceneManager.requestSpawn(worldPos, blueprint, { chunkId: GLOBAL_CHUNK, rootMotion: false, guid: cmd.guid });
    return;
  }

  try {
    let existing = ctx.manifest.get(assetId);
    if (!existing) {
      const isCharacter = /\/characters\//i.test(cmd.glbPath);
      ctx.manifest.register({ id: assetId, path: cmd.glbPath, type: isCharacter ? 'character' : 'misc', tags: [] });
      existing = ctx.manifest.get(assetId);
    }
    await ctx.manifest.preload([assetId]);
    const isChar = existing?.type === 'character';
    const blueprint = isChar
      ? { kind: 'character', params: { ...cmd.params, assetId } }
      : { kind: 'glbInstance', params: { ...cmd.params, assetId } };
    ctx.sceneManager.requestSpawn(worldPos, blueprint, {
      chunkId: GLOBAL_CHUNK,
      rootMotion: cmd.params?.rootMotion ?? isChar,
      guid: cmd.guid,
    });
  } catch (err) {
    console.warn(`[AIBridge] spawn_entity('${cmd.glbPath}') failed:`, err);
  }
}

async function spawnSmart(cmd: Extract<AICommand, { type: 'spawn_smart' }>, ctx: CmdCtx): Promise<void> {
  if (!ctx.assets) {
    console.warn('[AIBridge] spawn_smart: semantic asset registry unavailable');
    ctx.setQueryResult({ matched: false, reason: 'registry unavailable' });
    return;
  }
  const resolution = ctx.assets.resolve(cmd.query);
  if (!resolution) {
    ctx.setQueryResult({ matched: false, query: cmd.query, reason: 'no matching asset' });
    return;
  }
  try {
    if (ctx.manifest.get(resolution.assetId)) await ctx.manifest.preload([resolution.assetId]);
    ctx.sceneManager.requestSpawn(
      new THREE.Vector3(cmd.x, cmd.y, cmd.z),
      {
        kind: 'semanticInstance',
        params: {
          assetId: resolution.assetId,
          dynamic: cmd.dynamic ?? true,
          scale: cmd.scale ?? 1,
          compound: cmd.compound ?? true,
          ...resolution.material,
        },
      },
      { chunkId: GLOBAL_CHUNK },
    );
    ctx.setQueryResult({
      matched: true, query: cmd.query, assetId: resolution.assetId,
      score: +resolution.score.toFixed(3), material: resolution.material,
    });
  } catch (err) {
    console.warn(`[AIBridge] spawn_smart('${cmd.query}') failed:`, err);
    ctx.setQueryResult({ matched: false, query: cmd.query, reason: String(err) });
  }
}

function setTransform(cmd: Extract<AICommand, { type: 'set_transform' }>, ctx: CmdCtx): void {
  const rb = ctx.sceneManager.getComponent<RigidBodyComponent>(cmd.entityId, 'rigidBody');
  if (!rb) {
    console.warn(`[AIBridge] set_transform: entity ${cmd.entityId} has no rigid body`);
    return;
  }
  let rotation: THREE.Quaternion | undefined;
  if (cmd.rotation) {
    rotation = ctx._quat.set(cmd.rotation.x, cmd.rotation.y, cmd.rotation.z, cmd.rotation.w);
  }
  if (cmd.position) {
    ctx.worldOrigin.toEngineSpaceInto(ctx._engPos, ctx._engPos.set(cmd.position.x, cmd.position.y, cmd.position.z));
    rb.teleport(ctx._engPos, rotation);
  } else if (rotation) {
    rb.teleport(rb.mesh.position, rotation);
  }
  if (cmd.scale) {
    rb.mesh.scale.set(cmd.scale.x, cmd.scale.y, cmd.scale.z);
    rb.rescaleCollider();
    rb.mesh.updateMatrixWorld(true);
  }
}

function playAnimation(cmd: Extract<AICommand, { type: 'play_animation' }>, ctx: CmdCtx): void {
  const rb = ctx.sceneManager.getComponent<RigidBodyComponent>(cmd.entityId, 'rigidBody');
  if (!rb) return;
  const asm = (ctx.sceneManager as unknown as { findAnimationStateMachine?: (rb: RigidBodyComponent) => any })
    .findAnimationStateMachine?.(rb);
  if (!asm) {
    console.warn(`[AIBridge] play_animation: no animation state machine for entity ${cmd.entityId}`);
    return;
  }
  asm.transition(cmd.state, cmd.fade ?? 0.3);
}

function setMaterial(cmd: Extract<AICommand, { type: 'set_material' }>, ctx: CmdCtx): void {
  const rb = ctx.sceneManager.getComponent<RigidBodyComponent>(cmd.entityId, 'rigidBody');
  if (!rb) return;

  const blueprint = ctx.sceneManager.getBlueprint(cmd.entityId);
  if (blueprint) {
    if (cmd.color !== undefined) blueprint.params.color = cmd.color;
    if (cmd.roughness !== undefined) blueprint.params.roughness = cmd.roughness;
    if (cmd.metalness !== undefined) blueprint.params.metalness = cmd.metalness;
    if (cmd.emissive !== undefined) blueprint.params.emissive = cmd.emissive;
    if (cmd.emissiveIntensity !== undefined) blueprint.params.emissiveIntensity = cmd.emissiveIntensity;
    if (cmd.transparent !== undefined) blueprint.params.transparent = cmd.transparent;
    if (cmd.opacity !== undefined) blueprint.params.opacity = cmd.opacity;
  }

  rb.mesh.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mat = m as THREE.MeshStandardMaterial;
      if (!mat || !mat.isMaterial) continue;
      if (cmd.color !== undefined) mat.color.set(cmd.color as THREE.ColorRepresentation);
      if (cmd.roughness !== undefined) mat.roughness = THREE.MathUtils.clamp(cmd.roughness, 0, 1);
      if (cmd.metalness !== undefined) mat.metalness = THREE.MathUtils.clamp(cmd.metalness, 0, 1);
      if (cmd.emissive !== undefined) {
        mat.emissive.set(cmd.emissive as THREE.ColorRepresentation);
        mat.emissiveIntensity = cmd.emissiveIntensity ?? mat.emissiveIntensity;
      } else if (cmd.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = cmd.emissiveIntensity;
      }
      if (cmd.transparent !== undefined) mat.transparent = cmd.transparent;
      if (cmd.opacity !== undefined) {
        mat.transparent = mat.transparent || cmd.opacity < 1;
        mat.opacity = THREE.MathUtils.clamp(cmd.opacity, 0, 1);
      }
      mat.needsUpdate = true;
    }
  });
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
