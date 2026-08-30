import * as THREE from 'three';
import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import type { CharacterLocomotor } from '../../character/CharacterLocomotor';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('kcc_set_params', (cmd: Extract<AICommand, { type: 'kcc_set_params' }>) => {
    const locomotor = (ctx as any).getLocomotor?.(cmd.entityId);
    if (locomotor) {
      locomotor.setParams(cmd.params);
    }
  });

  map.set('kcc_get_params', (cmd: Extract<AICommand, { type: 'kcc_get_params' }>) => {
    const locomotor = (ctx as any).getLocomotor?.(cmd.entityId) as CharacterLocomotor | undefined;
    return locomotor ? locomotor.params : null;
  });

  map.set('kcc_teleport', (cmd: Extract<AICommand, { type: 'kcc_teleport' }>) => {
    const locomotor = (ctx as any).getLocomotor?.(cmd.entityId) as CharacterLocomotor | undefined;
    const targetPos = new THREE.Vector3(cmd.x, cmd.y, cmd.z);
    ctx.worldOrigin.toEngineSpaceInto(targetPos, targetPos);
    if (locomotor) {
      locomotor.teleport(targetPos);
    } else {
      const rb = ctx.sceneManager.getRigidBody(cmd.entityId);
      if (rb) rb.teleport(targetPos);
    }
  });

  map.set('kcc_get_telemetry', (cmd: Extract<AICommand, { type: 'kcc_get_telemetry' }>) => {
    const locomotor = (ctx as any).getLocomotor?.(cmd.entityId) as CharacterLocomotor | undefined;
    return locomotor ? locomotor.getTelemetry() : null;
  });

  map.set('kcc_telemetry_get', (cmd: Extract<AICommand, { type: 'kcc_telemetry_get' }>) => {
    const locomotor = ctx.getLocomotor?.(cmd.entityId) as CharacterLocomotor | undefined;
    return locomotor ? locomotor.getTelemetry() : null;
  });

  map.set('kcc_get_state', (cmd: Extract<AICommand, { type: 'kcc_get_state' }>) => {
    const locomotor = (ctx as any).getLocomotor?.(cmd.entityId) as CharacterLocomotor | undefined;
    return locomotor ? locomotor.getState() : null;
  });
}
