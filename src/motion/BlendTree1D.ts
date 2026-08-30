import * as THREE from 'three';
import { ClipState } from './ClipState';
import { MixerState } from './MixerState';
import type { MotionEventPayload } from './types';

export interface BlendTree1DEntry {
  threshold: number;
  state: ClipState;
}

/**
 * BlendTree1D — 1D linear parameter-driven blend tree (e.g. idle -> walk -> run).
 */
export class BlendTree1D extends MixerState {
  parameterName: string;
  private entries: BlendTree1DEntry[] = [];

  constructor(id: string, name: string, parameterName: string) {
    super(id, name);
    this.parameterName = parameterName;
  }

  addEntry(threshold: number, state: ClipState): this {
    this.entries.push({ threshold, state });
    this.entries.sort((a, b) => a.threshold - b.threshold);
    this.addChild(state, 0);
    return this;
  }

  override update(dt: number): MotionEventPayload[] {
    if (this.status !== 'playing') return [];

    this.fadeGroup.update(dt);
    const masterWeight = this.weight;
    if (masterWeight <= 0) return [];

    // Calculate parameter-based weights
    // Note: Parameter evaluation will be passed from parameter store or set directly
    const allEvents: MotionEventPayload[] = [];
    const effectiveDt = dt * this.speed;

    // Advance normalized time
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
        child.state.fadeGroup.weight = 0;
        child.state.action.setEffectiveWeight(0);
      }
    }

    return allEvents;
  }

  /**
   * Set parameter value and calculate child weights via 1D linear interpolation.
   */
  setParameterValue(val: number): void {
    const n = this.entries.length;
    if (n === 0) return;

    if (n === 1) {
      this.children[0].weight = 1.0;
      return;
    }

    // Clamp or find interval
    if (val <= this.entries[0].threshold) {
      for (let i = 0; i < n; i++) {
        this.children[i].weight = i === 0 ? 1.0 : 0.0;
      }
      return;
    }

    if (val >= this.entries[n - 1].threshold) {
      for (let i = 0; i < n; i++) {
        this.children[i].weight = i === n - 1 ? 1.0 : 0.0;
      }
      return;
    }

    // Interpolate between entry i and i + 1
    for (let i = 0; i < n - 1; i++) {
      const t0 = this.entries[i].threshold;
      const t1 = this.entries[i + 1].threshold;
      if (val >= t0 && val <= t1) {
        const range = t1 - t0;
        const factor = range > 1e-5 ? (val - t0) / range : 0;

        for (let j = 0; j < n; j++) {
          if (j === i) this.children[j].weight = 1 - factor;
          else if (j === i + 1) this.children[j].weight = factor;
          else this.children[j].weight = 0;
        }
        return;
      }
    }
  }
}
