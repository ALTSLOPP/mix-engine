import * as THREE from 'three';
import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('joint_create', (cmd: Extract<AICommand, { type: 'joint_create' }>) => {
    const jointSys = (ctx as any).jointSystem;
    if (!jointSys) return null;
    return jointSys.requestCreateJoint({
      type: cmd.jointType,
      entityA: cmd.entityA,
      entityB: cmd.entityB,
      anchorA: cmd.anchorA,
      anchorB: cmd.anchorB,
      axisA: cmd.axisA,
      axisB: cmd.axisB,
      limits: cmd.limits,
      motor: cmd.motor,
      breakForce: cmd.breakForce,
    });
  });

  map.set('joint_remove', (cmd: Extract<AICommand, { type: 'joint_remove' }>) => {
    const jointSys = (ctx as any).jointSystem;
    if (!jointSys) return false;
    jointSys.requestRemoveJoint(cmd.jointId);
    return true;
  });

  map.set('joints_list', (_cmd: Extract<AICommand, { type: 'joints_list' }>) => {
    const jointSys = (ctx as any).jointSystem;
    if (!jointSys) return [];
    return jointSys.allJoints().map((j: any) => ({
      id: j.id,
      config: j.config,
    }));
  });

  map.set('ragdoll_create', (cmd: Extract<AICommand, { type: 'ragdoll_create' }>) => {
    const ragdollBuilder = (ctx as any).ragdollBuilder;
    if (!ragdollBuilder) return null;
    const pos = new THREE.Vector3(cmd.x ?? 0, cmd.y ?? 0, cmd.z ?? 0);
    ctx.worldOrigin.toEngineSpaceInto(pos, pos);
    ragdollBuilder.requestHumanoidRagdoll(cmd.rootEntity, pos);
    return true;
  });

  map.set('ragdoll_spawn', (cmd: Extract<AICommand, { type: 'ragdoll_spawn' }>) => {
    const ragdollBuilder = ctx.ragdollBuilder;
    if (!ragdollBuilder) return false;
    const pos = new THREE.Vector3(cmd.x ?? 0, cmd.y ?? 0, cmd.z ?? 0);
    ctx.worldOrigin.toEngineSpaceInto(pos, pos);
    ragdollBuilder.requestHumanoidRagdoll(cmd.rootEntity, pos);
    return true;
  });

  map.set('ragdoll_set_active', (cmd: Extract<AICommand, { type: 'ragdoll_set_active' }>) => {
    const ragdollBuilder = (ctx as any).ragdollBuilder;
    if (!ragdollBuilder) return;
    ragdollBuilder.requestSetRagdollActive(cmd.rootEntity, cmd.active);
  });

  map.set('ragdoll_set_dynamic', (cmd: Extract<AICommand, { type: 'ragdoll_set_dynamic' }>) => {
    const ragdollBuilder = ctx.ragdollBuilder;
    if (!ragdollBuilder) return false;
    ragdollBuilder.requestSetRagdollActive(cmd.rootEntity, cmd.dynamic);
    return true;
  });

  map.set('ragdoll_destroy', (cmd: Extract<AICommand, { type: 'ragdoll_destroy' }>) => {
    const ragdollBuilder = (ctx as any).ragdollBuilder;
    if (!ragdollBuilder) return;
    ragdollBuilder.requestDestroyRagdoll(cmd.rootEntity);
  });
}
