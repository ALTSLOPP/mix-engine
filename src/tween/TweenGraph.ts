import * as THREE from 'three';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { Tween } from './Tween';
import { TweenValueAdapter } from './TweenValueAdapter';
import type { ConflictPolicy, PhysicsPolicy, TweenInterruptionReason } from './types';

export class TweenGraph {
  readonly entityId?: number;
  readonly rb?: RigidBodyComponent;
  readonly root: any;

  private activeTweens = new Set<Tween>();
  private tweensByProperty = new Map<string, Tween[]>();
  private queuedTweens = new Map<string, Tween[]>();

  constructor(
    root: any,
    options: {
      entityId?: number;
      rb?: RigidBodyComponent;
    } = {},
  ) {
    this.root = root;
    this.entityId = options.entityId;
    this.rb = options.rb;
  }

  addTween(tween: Tween): boolean {
    const propKey = tween.property;
    const policy = tween.conflictPolicy;

    let propList = this.tweensByProperty.get(propKey);
    if (!propList) {
      propList = [];
      this.tweensByProperty.set(propKey, propList);
    }

    if (propList.length > 0) {
      switch (policy) {
        case 'reject_if_busy':
          tween.kill('validation_failure');
          return false;

        case 'queue': {
          let queue = this.queuedTweens.get(propKey);
          if (!queue) {
            queue = [];
            this.queuedTweens.set(propKey, queue);
          }
          queue.push(tween);
          tween.pause();
          return true;
        }

        case 'highest_priority': {
          const currentTop = propList[0];
          if (tween.priority > currentTop.priority) {
            currentTop.kill('replaced');
            propList.length = 0;
            this.activeTweens.delete(currentTop);
          } else {
            tween.kill('validation_failure');
            return false;
          }
          break;
        }

        case 'complete_previous': {
          for (const existing of [...propList]) {
            existing.complete();
            this.activeTweens.delete(existing);
          }
          propList.length = 0;
          break;
        }

        case 'cancel_previous': {
          for (const existing of [...propList]) {
            existing.kill('cancelled');
            this.activeTweens.delete(existing);
          }
          propList.length = 0;
          break;
        }

        case 'blend':
        case 'additive':
        case 'multiply':
          // Keep both active and blend during evaluation
          break;

        case 'replace':
        default: {
          for (const existing of [...propList]) {
            existing.kill('replaced');
            this.activeTweens.delete(existing);
          }
          propList.length = 0;
          break;
        }
      }
    }

    propList.push(tween);
    this.activeTweens.add(tween);
    return true;
  }

  removeTween(tween: Tween): void {
    this.activeTweens.delete(tween);
    const propList = this.tweensByProperty.get(tween.property);
    if (propList) {
      const idx = propList.indexOf(tween);
      if (idx >= 0) propList.splice(idx, 1);
      if (propList.length === 0) {
        this.tweensByProperty.delete(tween.property);

        // Check if there is a queued tween waiting
        const queue = this.queuedTweens.get(tween.property);
        if (queue && queue.length > 0) {
          const next = queue.shift()!;
          if (queue.length === 0) this.queuedTweens.delete(tween.property);
          next.play();
          this.addTween(next);
        }
      }
    }
  }

  update(normalDt: number, unscaledDt = normalDt, fixedDt = normalDt): void {
    if (this.activeTweens.size === 0) return;

    const compositeBases = new Map<string, unknown>();
    for (const [property, tweens] of this.tweensByProperty) {
      if (tweens.length < 2) continue;
      const policy = tweens[tweens.length - 1].conflictPolicy;
      if (policy !== 'blend' && policy !== 'additive' && policy !== 'multiply') continue;
      compositeBases.set(property, TweenValueAdapter.cloneValue(TweenValueAdapter.getNestedProperty(tweens[0].target, property)));
      for (const tween of tweens) {
        if (tween.fromValue === undefined) tween.captureInitialValue();
      }
    }

    const finishedTweens: Tween[] = [];
    for (const tw of [...this.activeTweens]) {
      const dt = tw.updateMode === 'unscaled'
        ? unscaledDt
        : tw.updateMode === 'fixed'
          ? fixedDt
          : tw.updateMode === 'manual'
            ? 0
            : normalDt;
      const completed = tw.update(dt);
      if (completed || tw.status === 'completed' || tw.status === 'killed') {
        finishedTweens.push(tw);
      }
    }


    for (const [property, base] of compositeBases) {
      const tweens = this.tweensByProperty.get(property)?.filter((tw) => tw.status !== 'killed') ?? [];
      if (tweens.length === 0) continue;
      const policy = tweens[tweens.length - 1].conflictPolicy;
      let result: any;
      const pluginResult = TweenValueAdapter.combineValues(base, tweens.map((tween) => tween.currentValue), policy as 'blend' | 'additive' | 'multiply');
      if (pluginResult !== undefined) {
        result = pluginResult;
      } else if (policy === 'blend') {
        result = TweenValueAdapter.cloneValue(tweens[0].currentValue);
        for (let i = 1; i < tweens.length; i++) {
          result = TweenValueAdapter.interpolate(result, tweens[i].currentValue, 1 / (i + 1));
        }
      } else if (policy === 'additive') {
        result = TweenValueAdapter.cloneValue(base);
        for (const tween of tweens) {
          result = TweenValueAdapter.addValues(result, TweenValueAdapter.diffValues(tween.fromValue, tween.currentValue));
        }
      } else {
        result = TweenGraph.multiplyComposite(base, tweens);
      }
      TweenValueAdapter.setNestedProperty(tweens[0].target, property, result);
    }

    for (const tween of finishedTweens) this.removeTween(tween);

    // Synchronize physics if RigidBodyComponent is present
    this.syncPhysics(normalDt);
  }

  private static multiplyComposite(base: any, tweens: Tween[]): any {
    if (base instanceof THREE.Quaternion) {
      const result = base.clone().normalize();
      for (const tween of tweens) {
        if (!(tween.fromValue instanceof THREE.Quaternion) || !(tween.currentValue instanceof THREE.Quaternion)) continue;
        const delta = tween.fromValue.clone().invert().multiply(tween.currentValue).normalize();
        result.multiply(delta).normalize();
      }
      return result;
    }
    if (typeof base === 'number') {
      let result = base;
      for (const tween of tweens) {
        const from = Number(tween.fromValue);
        const current = Number(tween.currentValue);
        result *= Math.abs(from) > 1e-12 ? current / from : current;
      }
      return result;
    }
    // For structured values, multiply component-wise through the adapter's
    // plain-object interpolation support while retaining the original type.
    const result = TweenValueAdapter.cloneValue(base);
    for (const key of ['x', 'y', 'z', 'w', 'r', 'g', 'b']) {
      if (result && typeof result[key] === 'number') {
        for (const tween of tweens) {
          const from = tween.fromValue?.[key];
          const current = tween.currentValue?.[key];
          if (typeof current === 'number') result[key] *= typeof from === 'number' && Math.abs(from) > 1e-12 ? current / from : current;
        }
      }
    }
    return result;
  }

  updateManual(dt: number): void {
    for (const tw of [...this.activeTweens]) {
      if (tw.updateMode !== 'manual') continue;
      const completed = tw.update(dt);
      if (completed || tw.status === 'completed' || tw.status === 'killed') this.removeTween(tw);
    }
    this.syncPhysics(dt);
  }

  private syncPhysics(dt = 1 / 60): void {
    if (!this.rb) return;

    const mesh = this.rb.mesh;
    const body = this.rb.rapierBody;
    const policies = new Set(Array.from(this.activeTweens, (tween) => tween.physicsPolicy));
    if (policies.size === 0) return;

    const position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
    const rotation = { x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w };

    if (policies.has('teleport')) {
      // Teleport is authoritative: clear velocity and interpolation buffers when
      // the concrete component is available, rather than pretending it is a
      // kinematic target.
      if (typeof (this.rb as any).teleport === 'function') {
        this.rb.teleport(mesh.position, mesh.quaternion);
      } else {
        body.setTranslation(position, true);
        body.setRotation(rotation, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }

    const wantsKinematic = policies.has('kinematic') || policies.has('physics_safe_rotation');
    if (body.isKinematic() && wantsKinematic) {
      if (policies.has('kinematic')) body.setNextKinematicTranslation(position);
      const safeQ = mesh.quaternion.clone().normalize();
      if (policies.has('kinematic') || policies.has('physics_safe_rotation')) {
        body.setNextKinematicRotation({ x: safeQ.x, y: safeQ.y, z: safeQ.z, w: safeQ.w });
      }
      return;
    }

    if (!body.isKinematic() && (policies.has('dynamic_target') || policies.has('dynamic_force') || policies.has('physics_safe_rotation'))) {
      const current = body.translation();
      const invDt = 1 / Math.max(dt, 1e-5);
      const error = { x: position.x - current.x, y: position.y - current.y, z: position.z - current.z };
      if (policies.has('dynamic_target')) {
        body.setLinvel({ x: error.x * invDt, y: error.y * invDt, z: error.z * invDt }, true);
      } else if (policies.has('dynamic_force')) {
        const stiffness = Math.max(1, body.mass() * invDt * invDt);
        body.addForce({ x: error.x * stiffness, y: error.y * stiffness, z: error.z * stiffness }, true);
      }

      if (policies.has('physics_safe_rotation')) {
        const currentQ = body.rotation();
        const currentQuat = new THREE.Quaternion(currentQ.x, currentQ.y, currentQ.z, currentQ.w);
        const targetQuat = mesh.quaternion.clone().normalize();
        if (currentQuat.dot(targetQuat) < 0) targetQuat.set(-targetQuat.x, -targetQuat.y, -targetQuat.z, -targetQuat.w);
        const delta = currentQuat.clone().invert().multiply(targetQuat).normalize();
        const angle = 2 * Math.acos(Math.min(1, Math.max(-1, delta.w)));
        const scale = angle > Math.PI ? angle - Math.PI * 2 : angle;
        const axisScale = Math.abs(Math.sin(angle * 0.5)) > 1e-5 ? scale / Math.sin(angle * 0.5) : 0;
        body.setAngvel({ x: delta.x * axisScale * invDt, y: delta.y * axisScale * invDt, z: delta.z * axisScale * invDt }, true);
      }
    }
  }

  killAll(reason: TweenInterruptionReason = 'manual_kill'): void {
    for (const tw of [...this.activeTweens]) {
      tw.kill(reason);
    }
    for (const [_, queue] of this.queuedTweens) {
      for (const tw of queue) {
        tw.kill(reason);
      }
    }
    this.activeTweens.clear();
    this.tweensByProperty.clear();
    this.queuedTweens.clear();
  }

  pauseAll(): void {
    for (const tw of this.activeTweens) {
      tw.pause();
    }
  }

  resumeAll(): void {
    for (const tw of this.activeTweens) {
      tw.resume();
    }
  }

  get activeTweenList(): ReadonlyArray<Tween> {
    return Array.from(this.activeTweens);
  }

  dispose(): void {
    this.killAll('destroyed_target');
  }
}
