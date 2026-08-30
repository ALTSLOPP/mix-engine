import * as THREE from 'three';
import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('fog_set_params', (cmd: Extract<AICommand, { type: 'fog_set_params' }>) => {
    const fog = (ctx as any).volumetricFog;
    if (!fog) return false;

    if (cmd.density !== undefined) fog.density = cmd.density;
    if (cmd.heightFalloff !== undefined) fog.heightFalloff = cmd.heightFalloff;
    if (cmd.groundLevel !== undefined) fog.groundLevel = cmd.groundLevel;
    if (cmd.color !== undefined) fog.color.set(cmd.color);
    if (cmd.anisotropy !== undefined) fog.anisotropy = cmd.anisotropy;
    return true;
  });

  map.set('fog_volume_add', (cmd: Extract<AICommand, { type: 'fog_volume_add' }>) => {
    const fog = (ctx as any).volumetricFog;
    if (!fog) return false;

    const pos = new THREE.Vector3(cmd.position.x, cmd.position.y, cmd.position.z);

    fog.addFogVolume({
      id: cmd.id,
      position: pos,
      radius: cmd.radius,
      density: cmd.density,
      color: new THREE.Color(cmd.color ?? 0xffffff),
    });
    return true;
  });

  map.set('decal_spawn', (cmd: Extract<AICommand, { type: 'decal_spawn' }>) => {
    const decalSys = (ctx as any).decalSystem;
    if (!decalSys) return false;

    const pos = new THREE.Vector3(cmd.position.x, cmd.position.y, cmd.position.z);
    const norm = new THREE.Vector3(cmd.normal.x, cmd.normal.y, cmd.normal.z);
    ctx.worldOrigin.toEngineSpaceInto(pos, pos);

    decalSys.spawnDecal({
      position: pos,
      normal: norm,
      size: cmd.size,
      color: cmd.color,
      lifespan: cmd.lifespan,
    });
    return true;
  });

  map.set('mesh_fracture', (cmd: Extract<AICommand, { type: 'mesh_fracture' }>) => {
    const fracturer = (ctx as any).meshFracturer;
    if (!fracturer) return [];

    let epicenter: THREE.Vector3 | undefined;
    if (cmd.epicenter) {
      epicenter = new THREE.Vector3(cmd.epicenter.x, cmd.epicenter.y, cmd.epicenter.z);
      ctx.worldOrigin.toEngineSpaceInto(epicenter, epicenter);
    }

    fracturer.requestFractureEntity(cmd.entityId, epicenter, {
      pieces: cmd.pieces,
      explosionImpulse: cmd.impulse,
      shardLifespan: cmd.lifespan,
    });
    return true;
  });
}
