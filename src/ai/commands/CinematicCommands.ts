import type { CommandMap, CmdCtx } from './BridgeContext';
import * as THREE from 'three';
import { Path } from '../../cinematic/Path';
import type { AICommand } from '../AIBridge';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('cinematic_play', (cmd: Extract<AICommand, { type: 'cinematic_play' }>) => {
    ctx.cinematic.play(cmd.sequence);
  });

  map.set('cinematic_stop', () => {
    ctx.cinematic.stop();
  });

  map.set('cutscene_play', (cmd: Extract<AICommand, { type: 'cutscene_play' }>) => {
    if (ctx.cutsceneDirector) {
      ctx.cutsceneDirector.play(cmd.sequence);
    } else {
      console.warn('AIBridge: cutscene_play ignored because CutsceneDirector is missing.');
    }
  });

  map.set('cutscene_stop', () => {
    ctx.cutsceneDirector?.stop();
  });

  map.set('cutscene_subtitle', (cmd: Extract<AICommand, { type: 'cutscene_subtitle' }>) => {
    ctx.cutsceneDirector?.showSubtitle(cmd.text, cmd.speaker, cmd.duration);
  });

  map.set('set_camera', (cmd: Extract<AICommand, { type: 'set_camera' }>) => {
    const cam = ctx.viewport.camera;
    ctx.worldOrigin.toEngineSpaceInto(ctx._engPos, new THREE.Vector3(cmd.position[0], cmd.position[1], cmd.position[2]));
    cam.position.copy(ctx._engPos);
    if (cmd.lookAt) {
      ctx.worldOrigin.toEngineSpaceInto(ctx._v, new THREE.Vector3(cmd.lookAt[0], cmd.lookAt[1], cmd.lookAt[2]));
      cam.lookAt(ctx._v);
    }
    if (cmd.fov) {
      cam.fov = cmd.fov;
      cam.updateProjectionMatrix();
    }
  });

  map.set('focus_entity', (cmd: Extract<AICommand, { type: 'focus_entity' }>) => {
    const rb = ctx.sceneManager.getComponent<RigidBodyComponent>(cmd.entityId, 'rigidBody');
    if (!rb) return;
    const target = rb.mesh.position;
    const cam = ctx.viewport.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const offset = fwd.multiplyScalar(-8); offset.y += 3.5;
    cam.position.copy(target).add(offset);
    cam.lookAt(target);
  });

  map.set('follow_path', (cmd: Extract<AICommand, { type: 'follow_path' }>) => {
    if (cmd.points.length < 2) return;
    const path = new Path(cmd.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), cmd.loop ?? false);
    for (let i = 0; i < ctx.followers.length; i++) {
      if (ctx.followers[i].entityId === cmd.entityId) {
        ctx.followers.splice(i, 1);
        break;
      }
    }
    ctx.followers.push({
      entityId: cmd.entityId,
      path,
      speed: cmd.speed ?? 2.5,
      t: 0,
      loop: cmd.loop ?? false,
      lookAlongPath: cmd.lookAlongPath ?? true,
    });
  });

  map.set('screenshot', (cmd: Extract<AICommand, { type: 'screenshot' }>) => {
    void ctx.captureScreenshot(cmd.filename ?? `mix_${Date.now()}`, cmd.width, cmd.height);
  });
}
