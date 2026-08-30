import * as THREE from 'three';
import { ClipState } from './ClipState';
import { MixerState } from './MixerState';
import type { MotionEventPayload } from './types';

export interface Directional8WayClips {
  idle?: ClipState;
  forward: ClipState;
  backward: ClipState;
  left: ClipState;
  right: ClipState;
  forwardLeft?: ClipState;
  forwardRight?: ClipState;
  backwardLeft?: ClipState;
  backwardRight?: ClipState;
}

/**
 * DirectionalMixer — Directional locomotion mixer with smooth angle/velocity blending and foot-phase sync.
 */
export class DirectionalMixer extends MixerState {
  private clips: Directional8WayClips;
  private currentDirection = new THREE.Vector2(0, 0); // [X: strafe, Y: forward]
  private smoothedDirection = new THREE.Vector2(0, 0);
  private dampingSpeed = 10.0;

  constructor(id: string, name: string, clips: Directional8WayClips) {
    super(id, name);
    this.clips = clips;

    if (clips.idle) this.addChild(clips.idle, 1.0);
    this.addChild(clips.forward, 0);
    this.addChild(clips.backward, 0);
    this.addChild(clips.left, 0);
    this.addChild(clips.right, 0);
    if (clips.forwardLeft) this.addChild(clips.forwardLeft, 0);
    if (clips.forwardRight) this.addChild(clips.forwardRight, 0);
    if (clips.backwardLeft) this.addChild(clips.backwardLeft, 0);
    if (clips.backwardRight) this.addChild(clips.backwardRight, 0);
  }

  /**
   * Set velocity input: `strafe` (-1 = left, 1 = right), `forward` (-1 = back, 1 = forward).
   */
  setDirection(strafe: number, forward: number): void {
    this.currentDirection.set(strafe, forward);
  }

  override update(dt: number): MotionEventPayload[] {
    if (this.status !== 'playing') return [];

    this.fadeGroup.update(dt);
    const masterWeight = this.weight;
    if (masterWeight <= 0) return [];

    // Smooth direction vector
    this.smoothedDirection.lerp(this.currentDirection, Math.min(1, dt * this.dampingSpeed));
    const speed = this.smoothedDirection.length();

    // Compute weights based on angle
    this.calculateWeights(this.smoothedDirection.x, this.smoothedDirection.y, speed);

    const allEvents: MotionEventPayload[] = [];
    const effectiveDt = dt * this.speed;

    this._time += effectiveDt;
    if (this._duration > 0 && this.loop && this._time >= this._duration) {
      this._time = this._time % this._duration;
    }

    const nt = this.normalizedTime;

    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      if (child.weight > 0.001) {
        child.state.setNormalizedTime(nt);
        child.state.fadeGroup.weight = child.weight * masterWeight;
        const events = child.state.update(dt);
        allEvents.push(...events);
      } else {
        child.state.action.setEffectiveWeight(0);
      }
    }

    return allEvents;
  }

  private calculateWeights(strafe: number, forward: number, speed: number): void {
    // Reset all weights
    for (const c of this.children) c.weight = 0;

    if (speed < 0.05) {
      if (this.clips.idle) {
        this.setChildWeight(this.clips.idle, 1.0);
      }
      return;
    }

    // Blend out idle
    const locomotionWeight = Math.min(1.0, speed);
    if (this.clips.idle) {
      this.setChildWeight(this.clips.idle, 1.0 - locomotionWeight);
    }

    const angle = Math.atan2(strafe, forward); // -PI to +PI (0 = forward, PI/2 = right, -PI/2 = left, +/-PI = back)

    // Compute directional distribution
    const fwdWeight = Math.max(0, Math.cos(angle)) * locomotionWeight;
    const backWeight = Math.max(0, -Math.cos(angle)) * locomotionWeight;
    const rightWeight = Math.max(0, Math.sin(angle)) * locomotionWeight;
    const leftWeight = Math.max(0, -Math.sin(angle)) * locomotionWeight;

    this.setChildWeight(this.clips.forward, fwdWeight);
    this.setChildWeight(this.clips.backward, backWeight);
    this.setChildWeight(this.clips.right, rightWeight);
    this.setChildWeight(this.clips.left, leftWeight);
  }

  private setChildWeight(clipState: ClipState, weight: number): void {
    for (const child of this.children) {
      if (child.state === clipState) {
        child.weight = weight;
        return;
      }
    }
  }
}
