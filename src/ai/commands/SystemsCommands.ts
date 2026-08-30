import type { CommandMap, CmdCtx } from './BridgeContext';
import * as THREE from 'three';
import type { AICommand } from '../AIBridge';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';
import type { WheelSpec } from '../../physics/VehiclePhysics';
import { getWeaponProfile } from '../../ecs/WeaponProfiles';

export function register(map: CommandMap, ctx: CmdCtx): void {
  // ─── Culling ───────────────────────────────────────────────────────────
  map.set('cull_enable', (cmd: Extract<AICommand, { type: 'cull_enable' }>) => {
    if (!ctx.culling) { console.warn('[AIBridge] cull_enable: culling system unavailable'); return; }
    if (cmd.enabled) {
      if (cmd.occlusion !== undefined) ctx.culling.setOcclusionEnabled(cmd.occlusion);
      if (cmd.hierarchicalFrustum !== undefined) ctx.culling.setHierarchicalFrustum(cmd.hierarchicalFrustum);
      ctx.culling.enable();
    } else {
      ctx.culling.disable();
    }
  });

  map.set('cull_rebuild', () => {
    if (!ctx.culling) return;
    ctx.culling.rebuildBVH();
  });

  map.set('cull_set_occluder', (cmd: Extract<AICommand, { type: 'cull_set_occluder' }>) => {
    const rb = ctx.sceneManager.getRigidBody(cmd.entityId);
    if (rb) rb.mesh.userData.occluder = cmd.occluder;
    if (ctx.culling) ctx.culling.rebuildBVH();
  });

  map.set('cull_set_exclude', (cmd: Extract<AICommand, { type: 'cull_set_exclude' }>) => {
    const rb = ctx.sceneManager.getRigidBody(cmd.entityId);
    if (rb) rb.mesh.userData.cullExclude = cmd.exclude;
    if (ctx.culling) ctx.culling.rebuildBVH();
  });

  map.set('cull_status', () => {
    if (!ctx.culling) return;
    ctx.setQueryResult({ ...ctx.culling.stats, enabled: ctx.culling.isEnabled });
  });

  // ─── Vehicles ──────────────────────────────────────────────────────────
  map.set('add_vehicle', (cmd: Extract<AICommand, { type: 'add_vehicle' }>) => {
    if (!ctx.vehicles) { console.warn('[AIBridge] add_vehicle: vehicle system unavailable'); return; }
    const wheels: WheelSpec[] = cmd.wheels.map((w) => ({
      attach: new THREE.Vector3(w.attach[0], w.attach[1], w.attach[2]),
      suspensionRestLength: w.suspensionRestLength ?? 0.3,
      springStiffness: w.springStiffness ?? 30000,
      springDamping: w.springDamping ?? 4000,
      radius: w.radius,
      maxTravel: w.maxTravel ?? 0.2,
      lateralFriction: w.lateralFriction ?? 1.5,
      longitudinalFriction: w.longitudinalFriction ?? 1.2,
      driven: w.driven ?? false,
      steered: w.steered ?? false,
    }));
    ctx.vehicles.addVehicle(cmd.entityId, { wheels, spec: cmd.spec });
  });

  map.set('set_vehicle_input', (cmd: Extract<AICommand, { type: 'set_vehicle_input' }>) => {
    if (!ctx.vehicles) return;
    ctx.vehicles.setVehicleInput(cmd.entityId, {
      throttle: cmd.throttle,
      brake: cmd.brake,
      steer: cmd.steer,
      handbrake: cmd.handbrake,
    });
  });

  map.set('remove_vehicle', (cmd: Extract<AICommand, { type: 'remove_vehicle' }>) => {
    if (!ctx.vehicles) return;
    ctx.vehicles.removeVehicle(cmd.entityId);
  });

  map.set('vehicle_status', (cmd: Extract<AICommand, { type: 'vehicle_status' }>) => {
    if (!ctx.vehicles) return;
    ctx.setQueryResult(cmd.entityId !== undefined
      ? ctx.vehicles.getVehicleInfo(cmd.entityId)
      : ctx.vehicles.listVehicles());
  });

  // ─── LOD ───────────────────────────────────────────────────────────────
  map.set('lod_enable', (cmd: Extract<AICommand, { type: 'lod_enable' }>) => {
    if (!ctx.lod) { console.warn('[AIBridge] lod_enable: LOD system unavailable'); return; }
    if (cmd.enabled) ctx.lod.enable(); else ctx.lod.disable();
    ctx.setQueryResult({ enabled: ctx.lod.isEnabled, registered: ctx.lod.registeredCount });
  });

  map.set('lod_register', (cmd: Extract<AICommand, { type: 'lod_register' }>) => {
    if (!ctx.lod) return;
    const count = ctx.lod.registerEntity(cmd.entityId, { distances: cmd.distances, ratios: cmd.ratios });
    ctx.setQueryResult({ entityId: cmd.entityId, lodObjects: count });
  });

  map.set('lod_unregister', (cmd: Extract<AICommand, { type: 'lod_unregister' }>) => {
    if (!ctx.lod) return;
    ctx.lod.unregisterEntity(cmd.entityId);
  });

  // ─── Combat ────────────────────────────────────────────────────────────
  map.set('combat_add_health', (cmd: Extract<AICommand, { type: 'combat_add_health' }>) => {
    if (!ctx.combat) return;
    ctx.combat.addHealth(cmd.entityId, cmd.hp, cmd.faction, cmd.damageMultiplier);
  });

  map.set('combat_add_hitbox', (cmd: Extract<AICommand, { type: 'combat_add_hitbox' }>) => {
    if (!ctx.combat) return;
    ctx.combat.addHitbox(cmd.entityId, cmd.colliderHandle, cmd.part, cmd.multiplier);
  });

  map.set('combat_equip_weapon', (cmd: Extract<AICommand, { type: 'combat_equip_weapon' }>) => {
    if (!ctx.combat) return;
    if (typeof cmd.weapon === 'string') {
      const profile = getWeaponProfile(cmd.weapon);
      if (!profile) { console.warn(`[AIBridge] combat_equip_weapon: unknown weapon profile "${cmd.weapon}"`); return; }
      ctx.combat.equipWeapon(cmd.entityId, profile);
    } else {
      ctx.combat.equipWeapon(cmd.entityId, cmd.weapon);
    }
  });

  map.set('combat_fire', (cmd: Extract<AICommand, { type: 'combat_fire' }>) => {
    if (!ctx.combat) return;
    const origin = new THREE.Vector3(cmd.originX, cmd.originY, cmd.originZ);
    const dir = new THREE.Vector3(cmd.dirX, cmd.dirY, cmd.dirZ);
    ctx.combat.fire(cmd.entityId, origin, dir);
  });

  map.set('combat_apply_damage', (cmd: Extract<AICommand, { type: 'combat_apply_damage' }>) => {
    if (!ctx.combat) return;
    ctx.combat.applyDamage(cmd.attackerId ?? null, cmd.targetId, cmd.amount, cmd.damageType);
  });

  map.set('combat_status', () => {
    if (!ctx.combat) return;
    ctx.setQueryResult(ctx.combat.getCombatInfo());
  });

  // ─── Asset import ──────────────────────────────────────────────────────
  map.set('register_asset', (cmd: Extract<AICommand, { type: 'register_asset' }>) => {
    ctx.manifest.register({ id: cmd.id, path: cmd.path, type: cmd.assetType ?? 'misc', tags: [] });
  });

  map.set('preload_assets', (cmd: Extract<AICommand, { type: 'preload_assets' }>) => {
    void ctx.trackAsync(ctx.manifest.preload(cmd.ids));
  });

  map.set('import_asset', (cmd: Extract<AICommand, { type: 'import_asset' }>) => {
    if (!ctx.assetImporter) return;
    void ctx.trackAsync(importAsset(cmd, ctx));
  });

  map.set('import_list', () => {
    if (!ctx.assetImporter) return;
    void ctx.assetImporter.listCached().then((ids) => { ctx.setQueryResult({ cached: ids }); });
  });

  map.set('import_clear', (cmd: Extract<AICommand, { type: 'import_clear' }>) => {
    if (!ctx.assetImporter) return;
    void ctx.assetImporter.clearCache(cmd.id);
  });
}

async function importAsset(cmd: Extract<AICommand, { type: 'import_asset' }>, ctx: CmdCtx): Promise<void> {
  if (!ctx.assetImporter) return;
  try {
    const buffer = await ctx.assetImporter.importAsset(cmd.id, cmd.url);
    const blob = new Blob([buffer]);
    const blobUrl = URL.createObjectURL(blob);
    ctx.manifest.register({ id: cmd.id, path: blobUrl, type: cmd.assetType ?? 'misc', tags: ['imported'] });
    ctx.setQueryResult({ id: cmd.id, url: cmd.url, cached: true, size: buffer.byteLength });
  } catch (err) {
    console.warn(`[AIBridge] import_asset('${cmd.id}', '${cmd.url}') failed:`, err);
    ctx.setQueryResult({ id: cmd.id, url: cmd.url, error: (err as Error).message });
  }
}
