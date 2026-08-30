import * as THREE from 'three';
import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { TweenTargetResolver } from '../../tween/TweenTargetResolver';
import { TweenSerializer } from '../../tween/TweenSerializer';
import { TweenEase } from '../../tween/TweenEase';

function resolveTargetEntity(ctx: CmdCtx, ref?: string | number): number | undefined {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') return ctx.resolveEntity(ref);
  return ctx.getSelectedEntityId?.() ?? undefined;
}

export function register(map: CommandMap, ctx: CmdCtx): void {
  // --- tween_to ---
  map.set('tween_to', (cmd: Extract<AICommand, { type: 'tween_to' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    try {
      const entityId = cmd.entityId !== undefined ? resolveTargetEntity(ctx, cmd.entityId) : undefined;
      const target = entityId !== undefined ? entityId : cmd.target;

      if (target === undefined) {
        ctx.setQueryResult({
          ok: false,
          error: 'No target specified (provide entityId, target name, or select an entity)',
        });
        return;
      }

      const handle = director.to(target, cmd.property, cmd.to, {
        duration: cmd.duration ?? 1.0,
        delay: cmd.delay,
        ease: cmd.ease,
        loops: cmd.loops,
        loopType: cmd.loopType,
        conflictPolicy: cmd.conflictPolicy,
        id: cmd.id,
      });

      ctx.setQueryResult({
        ok: true,
        id: handle.id,
        status: handle.status,
        duration: handle.duration,
      });
    } catch (err) {
      ctx.setQueryResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- tween_from ---
  map.set('tween_from', (cmd: Extract<AICommand, { type: 'tween_from' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    try {
      const entityId = cmd.entityId !== undefined ? resolveTargetEntity(ctx, cmd.entityId) : undefined;
      const target = entityId !== undefined ? entityId : cmd.target;

      if (target === undefined) {
        ctx.setQueryResult({ ok: false, error: 'No target specified' });
        return;
      }

      const handle = director.from(target, cmd.property, cmd.from, {
        duration: cmd.duration ?? 1.0,
        delay: cmd.delay,
        ease: cmd.ease,
        loops: cmd.loops,
        loopType: cmd.loopType,
        conflictPolicy: cmd.conflictPolicy,
        id: cmd.id,
      });

      ctx.setQueryResult({
        ok: true,
        id: handle.id,
        status: handle.status,
        duration: handle.duration,
      });
    } catch (err) {
      ctx.setQueryResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- tween_from_to ---
  map.set('tween_from_to', (cmd: Extract<AICommand, { type: 'tween_from_to' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    try {
      const entityId = cmd.entityId !== undefined ? resolveTargetEntity(ctx, cmd.entityId) : undefined;
      const target = entityId !== undefined ? entityId : cmd.target;

      if (target === undefined) {
        ctx.setQueryResult({ ok: false, error: 'No target specified' });
        return;
      }

      const handle = director.fromTo(target, cmd.property, cmd.from, cmd.to, {
        duration: cmd.duration ?? 1.0,
        delay: cmd.delay,
        ease: cmd.ease,
        loops: cmd.loops,
        loopType: cmd.loopType,
        conflictPolicy: cmd.conflictPolicy,
        id: cmd.id,
      });

      ctx.setQueryResult({
        ok: true,
        id: handle.id,
        status: handle.status,
        duration: handle.duration,
      });
    } catch (err) {
      ctx.setQueryResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- tween_move ---
  map.set('tween_move', (cmd: Extract<AICommand, { type: 'tween_move' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    if (!rb) {
      ctx.setQueryResult({ ok: false, error: `Entity ${entityId} has no RigidBodyComponent` });
      return;
    }

    const toVec = new THREE.Vector3(cmd.x ?? rb.mesh.position.x, cmd.y ?? rb.mesh.position.y, cmd.z ?? rb.mesh.position.z);
    const handle = director.move(rb.mesh, toVec, {
      duration: cmd.duration ?? 1.0,
      ease: cmd.ease,
      loops: cmd.loops,
      loopType: cmd.loopType,
      conflictPolicy: cmd.conflictPolicy,
      physicsPolicy: rb.rapierBody.isKinematic() ? 'kinematic' : 'dynamic_target',
      id: cmd.id,
    });

    ctx.setQueryResult({ ok: true, id: handle.id, entityId, targetPosition: [toVec.x, toVec.y, toVec.z] });
  });

  // --- tween_rotate ---
  map.set('tween_rotate', (cmd: Extract<AICommand, { type: 'tween_rotate' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    if (!rb) {
      ctx.setQueryResult({ ok: false, error: `Entity ${entityId} has no RigidBodyComponent` });
      return;
    }

    const toEuler = new THREE.Euler(
      cmd.x !== undefined ? cmd.x : rb.mesh.rotation.x,
      cmd.y !== undefined ? cmd.y : rb.mesh.rotation.y,
      cmd.z !== undefined ? cmd.z : rb.mesh.rotation.z,
    );

    const handle = director.rotate(rb.mesh, toEuler, {
      duration: cmd.duration ?? 1.0,
      ease: cmd.ease,
      loops: cmd.loops,
      loopType: cmd.loopType,
      conflictPolicy: cmd.conflictPolicy,
      physicsPolicy: rb.rapierBody.isKinematic() ? 'kinematic' : 'physics_safe_rotation',
      id: cmd.id,
    });

    ctx.setQueryResult({ ok: true, id: handle.id, entityId });
  });

  // --- tween_scale ---
  map.set('tween_scale', (cmd: Extract<AICommand, { type: 'tween_scale' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    if (!rb) {
      ctx.setQueryResult({ ok: false, error: `Entity ${entityId} has no RigidBodyComponent` });
      return;
    }

    const toScale = cmd.scale !== undefined
      ? cmd.scale
      : {
          x: cmd.x ?? rb.mesh.scale.x,
          y: cmd.y ?? rb.mesh.scale.y,
          z: cmd.z ?? rb.mesh.scale.z,
        };

    const handle = director.scale(rb.mesh, toScale, {
      duration: cmd.duration ?? 1.0,
      ease: cmd.ease,
      loops: cmd.loops,
      loopType: cmd.loopType,
      conflictPolicy: cmd.conflictPolicy,
      id: cmd.id,
    });

    ctx.setQueryResult({ ok: true, id: handle.id, entityId });
  });

  // --- tween_punch ---
  map.set('tween_punch', (cmd: Extract<AICommand, { type: 'tween_punch' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    if (!rb) {
      ctx.setQueryResult({ ok: false, error: `Entity ${entityId} has no RigidBodyComponent` });
      return;
    }

    const punchVec = new THREE.Vector3(cmd.x ?? 0, cmd.y ?? 1, cmd.z ?? 0);
    const handle = director.punch(rb.mesh, cmd.property ?? 'position', punchVec, {
      duration: cmd.duration ?? 0.5,
      vibrato: cmd.vibrato ?? 10,
      elasticity: cmd.elasticity ?? 1.0,
    });

    ctx.setQueryResult({ ok: true, id: handle.id, entityId });
  });

  // --- tween_shake ---
  map.set('tween_shake', (cmd: Extract<AICommand, { type: 'tween_shake' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    const target = entityId !== undefined ? ctx.sceneManager.getRigidBody(entityId)?.mesh : ctx.viewport.camera;

    if (!target) {
      ctx.setQueryResult({ ok: false, error: 'Target not found' });
      return;
    }

    const strength = new THREE.Vector3(cmd.x ?? 0.5, cmd.y ?? 0.5, cmd.z ?? 0.5);
    const handle = director.shake(target, cmd.property ?? 'position', strength, {
      duration: cmd.duration ?? 0.5,
      frequency: cmd.frequency ?? 25,
      fadeOut: cmd.fadeOut ?? true,
    });

    ctx.setQueryResult({ ok: true, id: handle.id });
  });

  // --- tween_sequence_create ---
  map.set('tween_sequence_create', (cmd: Extract<AICommand, { type: 'tween_sequence_create' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const seq = director.sequence({
      id: cmd.sequenceId,
      timeScale: cmd.timeScale,
      loops: cmd.loops,
      loopType: cmd.loopType,
      autoPlay: cmd.autoPlay ?? false,
    });

    ctx.setQueryResult({ ok: true, sequenceId: seq.id });
  });

  // --- tween_sequence_append ---
  map.set('tween_sequence_append', (cmd: Extract<AICommand, { type: 'tween_sequence_append' }>) => {
    const director = ctx.tweenDirector;
    const seq = director?.activeSequences.find((s) => s.id === cmd.sequenceId);
    if (!seq) {
      ctx.setQueryResult({ ok: false, error: `Sequence '${cmd.sequenceId}' not found` });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    const target = entityId !== undefined ? ctx.sceneManager.getRigidBody(entityId)?.mesh : undefined;
    if (!target) {
      ctx.setQueryResult({ ok: false, error: 'Target entity not found' });
      return;
    }

    if (cmd.op === 'move') {
      const toVec = new THREE.Vector3(cmd.x ?? 0, cmd.y ?? 0, cmd.z ?? 0);
      seq.appendMove(target, toVec, cmd.duration ?? 1.0, cmd.ease);
    } else if (cmd.op === 'rotate') {
      const toEuler = new THREE.Euler(cmd.x ?? 0, cmd.y ?? 0, cmd.z ?? 0);
      seq.appendRotate(target, toEuler, cmd.duration ?? 1.0, cmd.ease);
    } else if (cmd.op === 'scale') {
      const toScale = cmd.scale ?? { x: cmd.x ?? 1, y: cmd.y ?? 1, z: cmd.z ?? 1 };
      seq.appendScale(target, toScale, cmd.duration ?? 1.0, cmd.ease);
    }

    ctx.setQueryResult({ ok: true, sequenceId: seq.id, duration: seq.duration });
  });

  // --- tween_sequence_join ---
  map.set('tween_sequence_join', (cmd: Extract<AICommand, { type: 'tween_sequence_join' }>) => {
    const director = ctx.tweenDirector;
    const seq = director?.activeSequences.find((s) => s.id === cmd.sequenceId);
    if (!seq) {
      ctx.setQueryResult({ ok: false, error: `Sequence '${cmd.sequenceId}' not found` });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    const target = entityId !== undefined ? ctx.sceneManager.getRigidBody(entityId)?.mesh : undefined;
    if (!target) {
      ctx.setQueryResult({ ok: false, error: 'Target entity not found' });
      return;
    }

    if (cmd.op === 'move') {
      const toVec = new THREE.Vector3(cmd.x ?? 0, cmd.y ?? 0, cmd.z ?? 0);
      seq.joinMove(target, toVec, cmd.duration ?? 1.0, cmd.ease);
    } else if (cmd.op === 'rotate') {
      const toEuler = new THREE.Euler(cmd.x ?? 0, cmd.y ?? 0, cmd.z ?? 0);
      seq.joinRotate(target, toEuler, cmd.duration ?? 1.0, cmd.ease);
    } else if (cmd.op === 'scale') {
      const toScale = cmd.scale ?? { x: cmd.x ?? 1, y: cmd.y ?? 1, z: cmd.z ?? 1 };
      seq.joinScale(target, toScale, cmd.duration ?? 1.0, cmd.ease);
    }

    ctx.setQueryResult({ ok: true, sequenceId: seq.id, duration: seq.duration });
  });

  // --- tween_sequence_marker ---
  map.set('tween_sequence_marker', (cmd: Extract<AICommand, { type: 'tween_sequence_marker' }>) => {
    const director = ctx.tweenDirector;
    const seq = director?.activeSequences.find((s) => s.id === cmd.sequenceId);
    if (!seq) {
      ctx.setQueryResult({ ok: false, error: `Sequence '${cmd.sequenceId}' not found` });
      return;
    }

    seq.addMarker(cmd.name, cmd.time ?? seq.duration);
    ctx.setQueryResult({ ok: true, sequenceId: seq.id, markerName: cmd.name });
  });

  // --- tween_sequence_play ---
  map.set('tween_sequence_play', (cmd: Extract<AICommand, { type: 'tween_sequence_play' }>) => {
    const director = ctx.tweenDirector;
    const seq = director?.activeSequences.find((s) => s.id === cmd.sequenceId);
    if (!seq) {
      ctx.setQueryResult({ ok: false, error: `Sequence '${cmd.sequenceId}' not found` });
      return;
    }

    seq.play();
    ctx.setQueryResult({ ok: true, sequenceId: seq.id, status: seq.status });
  });

  // --- Global / Target Controls ---
  map.set('tween_pause', (cmd: Extract<AICommand, { type: 'tween_pause' }>) => {
    const director = ctx.tweenDirector;
    if (cmd.id) {
      const seq = director?.activeSequences.find((s) => s.id === cmd.id);
      const tw = director?.activeTweens.find((t) => t.id === cmd.id);
      seq?.pause();
      tw?.pause();
    } else {
      director?.pauseAll();
    }
    ctx.setQueryResult({ ok: true });
  });

  map.set('tween_resume', (cmd: Extract<AICommand, { type: 'tween_resume' }>) => {
    const director = ctx.tweenDirector;
    if (cmd.id) {
      const seq = director?.activeSequences.find((s) => s.id === cmd.id);
      const tw = director?.activeTweens.find((t) => t.id === cmd.id);
      seq?.resume();
      tw?.resume();
    } else {
      director?.resumeAll();
    }
    ctx.setQueryResult({ ok: true });
  });

  map.set('tween_cancel', (cmd: Extract<AICommand, { type: 'tween_cancel' }>) => {
    const director = ctx.tweenDirector;
    if (cmd.id) {
      const seq = director?.activeSequences.find((s) => s.id === cmd.id);
      const tw = director?.activeTweens.find((t) => t.id === cmd.id);
      seq?.kill('cancelled');
      tw?.kill('cancelled');
    } else if (cmd.entityId !== undefined) {
      director?.killTarget(cmd.entityId, 'cancelled');
    } else {
      director?.killAll('cancelled');
    }
    ctx.setQueryResult({ ok: true });
  });

  map.set('tween_complete', (cmd: Extract<AICommand, { type: 'tween_complete' }>) => {
    const director = ctx.tweenDirector;
    if (cmd.id) {
      const seq = director?.activeSequences.find((s) => s.id === cmd.id);
      const tw = director?.activeTweens.find((t) => t.id === cmd.id);
      seq?.complete();
      tw?.complete();
    } else {
      director?.activeTweens.forEach((t) => t.complete());
      director?.activeSequences.forEach((s) => s.complete());
    }
    ctx.setQueryResult({ ok: true });
  });

  // --- Diagnostics and Validation ---
  map.set('tween_inspect', () => {
    const director = ctx.tweenDirector;
    const report = director ? director.inspect() : null;
    ctx.setQueryResult({ ok: true, report });
  });

  map.set('tween_validate', (cmd: Extract<AICommand, { type: 'tween_validate' }>) => {
    const result = TweenSerializer.validate(cmd.sequenceJson);
    ctx.setQueryResult(result);
  });

  // --- Specialized High-Level Commands ---
  map.set('tween_camera', (cmd: Extract<AICommand, { type: 'tween_camera' }>) => {
    const director = ctx.tweenDirector;
    const camera = ctx.viewport.camera;
    if (!director || !camera) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector or Camera unavailable' });
      return;
    }

    if (cmd.x !== undefined || cmd.y !== undefined || cmd.z !== undefined) {
      const targetPos = new THREE.Vector3(
        cmd.x ?? camera.position.x,
        cmd.y ?? camera.position.y,
        cmd.z ?? camera.position.z,
      );
      director.move(camera, targetPos, { duration: cmd.duration ?? 1.0, ease: cmd.ease });
    }

    if (cmd.fov !== undefined && 'fov' in camera) {
      director.to(camera, 'fov', cmd.fov, {
        duration: cmd.duration ?? 1.0,
        ease: cmd.ease,
        onUpdate: () => (camera as THREE.PerspectiveCamera).updateProjectionMatrix(),
      });
    }

    if (cmd.lookAt) {
      const lookAtVec = new THREE.Vector3(cmd.lookAt[0], cmd.lookAt[1], cmd.lookAt[2]);
      director.lookAt(camera, lookAtVec, { duration: cmd.duration ?? 1.0, ease: cmd.ease });
    }

    ctx.setQueryResult({ ok: true });
  });

  map.set('tween_color', (cmd: Extract<AICommand, { type: 'tween_color' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    const targetObj = rb?.mesh;
    if (!targetObj) {
      ctx.setQueryResult({ ok: false, error: `Entity ${entityId} mesh not found` });
      return;
    }

    const prop = cmd.property ?? 'material.color';
    const handle = director.to(targetObj, prop, cmd.color, {
      duration: cmd.duration ?? 1.0,
      ease: cmd.ease,
    });

    ctx.setQueryResult({ ok: true, id: handle.id, entityId });
  });

  map.set('tween_material', (cmd: Extract<AICommand, { type: 'tween_material' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    const targetObj = rb?.mesh;
    if (!targetObj) {
      ctx.setQueryResult({ ok: false, error: `Entity ${entityId} mesh not found` });
      return;
    }

    const mat = (targetObj as THREE.Mesh).material ?? targetObj;
    const handle = director.material(mat, {
      opacity: cmd.opacity,
      roughness: cmd.roughness,
      metalness: cmd.metalness,
      emissive: cmd.emissive,
      emissiveIntensity: cmd.emissiveIntensity,
    }, {
      duration: cmd.duration ?? 1.0,
      ease: cmd.ease,
    });

    ctx.setQueryResult({ ok: true, id: handle.id, entityId });
  });

  map.set('tween_audio', (cmd: Extract<AICommand, { type: 'tween_audio' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const dummyAudio = { volume: 1.0 };
    const handle = director.audioFade(dummyAudio, cmd.volume, {
      duration: cmd.duration ?? 1.0,
      ease: cmd.ease,
    });

    ctx.setQueryResult({ ok: true, id: handle.id, trackId: cmd.trackId, volume: cmd.volume });
  });

  map.set('tween_path', (cmd: Extract<AICommand, { type: 'tween_path' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId === undefined) {
      ctx.setQueryResult({ ok: false, error: 'Entity not found' });
      return;
    }

    const rb = ctx.sceneManager.getRigidBody(entityId);
    const targetObj = rb?.mesh;
    if (!targetObj) {
      ctx.setQueryResult({ ok: false, error: `Entity ${entityId} mesh not found` });
      return;
    }

    const waypoints = cmd.waypoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const handle = director.followPath(targetObj, waypoints, {
      duration: cmd.duration ?? 2.0,
      ease: cmd.ease,
      orientToPath: cmd.autoRotate ?? true,
      physicsPolicy: rb.rapierBody.isKinematic() ? 'kinematic' : 'dynamic_target',
      pathOptions: {
        lookAhead: cmd.lookAhead,
      },
    });

    ctx.setQueryResult({ ok: true, id: handle.id, entityId });
  });

  map.set('tween_seek', (cmd: Extract<AICommand, { type: 'tween_seek' }>) => {
    const director = ctx.tweenDirector;
    const seq = director?.activeSequences.find((s) => s.id === cmd.id);
    const tw = director?.activeTweens.find((t) => t.id === cmd.id);

    if (seq) {
      if (cmd.time !== undefined) seq.seek(cmd.time);
      else if (cmd.progress !== undefined) seq.seek(cmd.progress * seq.duration);
      ctx.setQueryResult({ ok: true, id: seq.id, elapsed: seq.elapsed, progress: seq.progress });
      return;
    }

    if (tw) {
      if (cmd.time !== undefined) tw.seek(cmd.time);
      else if (cmd.progress !== undefined) tw.seek(cmd.progress * tw.duration);
      ctx.setQueryResult({ ok: true, id: tw.id, elapsed: tw.elapsed, progress: tw.progress });
      return;
    }

    ctx.setQueryResult({ ok: false, error: `Tween or sequence '${cmd.id}' not found` });
  });

  map.set('tween_reverse', (cmd: Extract<AICommand, { type: 'tween_reverse' }>) => {
    const director = ctx.tweenDirector;
    const seq = director?.activeSequences.find((s) => s.id === cmd.id);
    const tw = director?.activeTweens.find((t) => t.id === cmd.id);

    if (seq) {
      seq.reverse();
      ctx.setQueryResult({ ok: true, id: seq.id, reversed: seq.isReversed });
      return;
    }

    if (tw) {
      tw.reverse();
      ctx.setQueryResult({ ok: true, id: tw.id, reversed: tw.isReversed });
      return;
    }

    ctx.setQueryResult({ ok: false, error: `Tween or sequence '${cmd.id}' not found` });
  });

  // --- High-Level Orchestration Command: tween_effect_create ---
  map.set('tween_effect_create', (cmd: Extract<AICommand, { type: 'tween_effect_create' }>) => {
    const director = ctx.tweenDirector;
    if (!director) {
      ctx.setQueryResult({ ok: false, error: 'TweenDirector unavailable' });
      return;
    }

    try {
      const seq = director.sequence({ id: cmd.effectId, autoPlay: cmd.autoPlay ?? true });

      for (const step of cmd.steps) {
        const entityId = resolveTargetEntity(ctx, step.entityId);
        const rb = entityId !== undefined ? ctx.sceneManager.getRigidBody(entityId) : null;
        const target = rb?.mesh ?? null;

        if (step.op === 'marker' && step.name) {
          seq.appendMarker(step.name, step.offset);
        } else if (step.op === 'interval') {
          seq.appendInterval(step.duration ?? 0.5);
        } else if (target) {
          if (step.op === 'move' && Array.isArray(step.to)) {
            const toVec = new THREE.Vector3(step.to[0], step.to[1], step.to[2]);
            if (step.join) seq.joinMove(target, toVec, step.duration, step.ease);
            else seq.appendMove(target, toVec, step.duration, step.ease);
          } else if (step.op === 'rotate' && Array.isArray(step.to)) {
            const toEuler = new THREE.Euler(step.to[0], step.to[1], step.to[2]);
            if (step.join) seq.joinRotate(target, toEuler, step.duration, step.ease);
            else seq.appendRotate(target, toEuler, step.duration, step.ease);
          } else if (step.op === 'scale') {
            const toScale = Array.isArray(step.to)
              ? new THREE.Vector3(step.to[0], step.to[1], step.to[2])
              : step.to;
            if (step.join) seq.joinScale(target, toScale, step.duration, step.ease);
            else seq.appendScale(target, toScale, step.duration, step.ease);
          } else if (step.op === 'material' && (target as any).material) {
            const mat = Array.isArray((target as any).material) ? (target as any).material[0] : (target as any).material;
            const tw = director.to(mat, step.property, step.to, {
              duration: step.duration,
              ease: step.ease,
              autoPlay: false,
            });
            if (step.join) seq.join(tw.node as any);
            else seq.append(tw.node as any);
          }
        }
      }

      ctx.setQueryResult({
        ok: true,
        effectId: seq.id,
        duration: seq.duration,
        status: seq.status,
      });
    } catch (err) {
      ctx.setQueryResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
