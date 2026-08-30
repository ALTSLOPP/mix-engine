import * as THREE from 'three';
import { ClipState } from './ClipState';
import { MotionState } from './MotionState';
import type { MotionEventPayload } from './types';

export interface MixerChild {
  state: ClipState;
  weight: number;
}

/**
 * MixerState — Abstract base state for multi-clip blend trees with normalized time synchronization.
 */
export abstract class MixerState extends MotionState {
  protected children: MixerChild[] = [];
  protected syncNormalizedTime = true;

  constructor(id: string, name: string) {
    super(id, name);
  }

  addChild(state: ClipState, initialWeight = 0): void {
    this.children.push({ state, weight: initialWeight });
    this.recalculateDuration();
  }

  protected recalculateDuration(): void {
    let maxDur = 0;
    for (const c of this.children) {
      if (c.state.duration > maxDur) {
        maxDur = c.state.duration;
      }
    }
    this._duration = maxDur;
  }

  override play(): this {
    super.play();
    for (const c of this.children) {
      c.state.play();
    }
    return this;
  }

  override pause(): this {
    super.pause();
    for (const c of this.children) {
      c.state.pause();
    }
    return this;
  }

  override resume(): this {
    super.resume();
    for (const c of this.children) {
      c.state.resume();
    }
    return this;
  }

  override stop(): this {
    super.stop();
    for (const c of this.children) {
      c.state.stop();
    }
    return this;
  }

  override setTime(time: number): this {
    super.setTime(time);
    const nt = this.normalizedTime;
    for (const c of this.children) {
      if (this.syncNormalizedTime) {
        c.state.setNormalizedTime(nt);
      } else {
        c.state.setTime(time);
      }
    }
    return this;
  }

  override extractRootDelta(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, 0);
    const temp = new THREE.Vector3();
    let totalW = 0;

    for (const c of this.children) {
      if (c.weight > 0) {
        c.state.extractRootDelta(temp);
        out.addScaledVector(temp, c.weight);
        totalW += c.weight;
      }
    }

    if (totalW > 1.0) {
      out.divideScalar(totalW);
    }
    return out;
  }

  override dispose(): void {
    for (const c of this.children) {
      c.state.dispose();
    }
    this.children = [];
  }
}
