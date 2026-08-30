import * as THREE from 'three';
import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('morph_set', (cmd: Extract<AICommand, { type: 'morph_set' }>) => {
    const morphSys = (ctx as any).morphSystem;
    const rb = ctx.sceneManager.getRigidBody(cmd.entityId);
    if (!morphSys || !rb) return false;

    let targetMesh: THREE.Mesh | null = null;
    rb.mesh.traverse((child) => {
      if (!targetMesh && (child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetDictionary) {
        targetMesh = child as THREE.Mesh;
      }
    });

    if (!targetMesh) return false;
    return morphSys.setWeight(targetMesh, cmd.morph, cmd.weight, cmd.duration);
  });

  map.set('morph_set_weight', (cmd: Extract<AICommand, { type: 'morph_set_weight' }>) => {
    const morphSys = ctx.morphSystem;
    const rb = ctx.sceneManager.getRigidBody(cmd.entityId);
    if (!morphSys || !rb) return false;
    let targetMesh: THREE.Mesh | null = null;
    rb.mesh.traverse((child) => {
      if (!targetMesh && (child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetDictionary) {
        targetMesh = child as THREE.Mesh;
      }
    });
    return targetMesh ? morphSys.setWeight(targetMesh, cmd.morph, cmd.weight, cmd.duration) : false;
  });

  map.set('morph_get', (cmd: Extract<AICommand, { type: 'morph_get' }>) => {
    const morphSys = (ctx as any).morphSystem;
    const rb = ctx.sceneManager.getRigidBody(cmd.entityId);
    if (!morphSys || !rb) return null;

    let targetMesh: THREE.Mesh | null = null;
    rb.mesh.traverse((child) => {
      if (!targetMesh && (child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetDictionary) {
        targetMesh = child as THREE.Mesh;
      }
    });

    if (!targetMesh) return null;
    return morphSys.getWeight(targetMesh, cmd.morph);
  });

  map.set('morphs_list', (cmd: Extract<AICommand, { type: 'morphs_list' }>) => {
    const morphSys = (ctx as any).morphSystem;
    const rb = ctx.sceneManager.getRigidBody(cmd.entityId);
    if (!morphSys || !rb) return [];

    let targetMesh: THREE.Mesh | null = null;
    rb.mesh.traverse((child) => {
      if (!targetMesh && (child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetDictionary) {
        targetMesh = child as THREE.Mesh;
      }
    });

    if (!targetMesh) return [];
    return morphSys.listMorphs(targetMesh);
  });

  map.set('anim_event_add', (cmd: Extract<AICommand, { type: 'anim_event_add' }>) => {
    const eventBridge = (ctx as any).animEventBridge;
    if (!eventBridge) return;
    eventBridge.addMarker({
      stateName: cmd.state,
      normalizedTime: cmd.normalizedTime,
      eventName: cmd.event,
      payload: cmd.payload,
    });
  });

  map.set('ik_aim_target', (cmd: Extract<AICommand, { type: 'ik_aim_target' }>) => {
    const worldTarget = new THREE.Vector3(cmd.target.x, cmd.target.y, cmd.target.z);
    if (ctx.setAimIKTarget) return ctx.setAimIKTarget(cmd.entityId, worldTarget, cmd.weight ?? 1.0);
    const aimSolver = (ctx as any).getAimIKSolver?.(cmd.entityId);
    if (!aimSolver) return false;
    const targetPos = worldTarget;
    ctx.worldOrigin.toEngineSpaceInto(targetPos, targetPos);
    aimSolver.aimAt(targetPos, cmd.weight ?? 1.0);
    return true;
  });
}
