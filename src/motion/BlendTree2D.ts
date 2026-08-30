import * as THREE from 'three';
import { ClipState } from './ClipState';
import { MixerState } from './MixerState';
import type { MotionEventPayload } from './types';

export type BlendTree2DType = 'cartesian' | 'directional' | 'freeform';

export interface BlendTree2DEntry {
  position: THREE.Vector2;
  state: ClipState;
}

/**
 * BlendTree2D — 2D Cartesian / Directional blend tree for 2D locomotion and aim spaces.
 */
export class BlendTree2D extends MixerState {
  readonly parameterX: string;
  readonly parameterY: string;
  readonly blendType: BlendTree2DType;
  private entries: BlendTree2DEntry[] = [];

  constructor(
    id: string,
    name: string,
    parameterX: string,
    parameterY: string,
    blendType: BlendTree2DType = 'cartesian',
  ) {
    super(id, name);
    this.parameterX = parameterX;
    this.parameterY = parameterY;
    this.blendType = blendType;
  }

  addEntry(x: number, y: number, state: ClipState): this {
    this.entries.push({ position: new THREE.Vector2(x, y), state });
    this.addChild(state, 0);
    return this;
  }

  /**
   * Set 2D parameter coordinates and calculate normalized barycentric / distance weights.
   */
  setParameterValues(x: number, y: number): void {
    const target = new THREE.Vector2(x, y);
    const n = this.entries.length;
    if (n === 0) return;

    if (n === 1) {
      this.children[0].weight = 1.0;
      return;
    }

    // Inverse distance weighting with threshold falloff
    let totalWeight = 0;
    const weights: number[] = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      const dist = target.distanceTo(this.entries[i].position);
      if (dist < 1e-4) {
        // Exact match
        for (let j = 0; j < n; j++) {
          this.children[j].weight = j === i ? 1.0 : 0.0;
        }
        return;
      }
      const w = 1.0 / Math.pow(dist, 2);
      weights[i] = w;
      totalWeight += w;
    }

    // Normalize weights
    if (totalWeight > 0) {
      for (let i = 0; i < n; i++) {
        this.children[i].weight = weights[i] / totalWeight;
      }
    }
  }

  override update(dt: number): MotionEventPayload[] {
    if (this.status !== 'playing') return [];

    this.fadeGroup.update(dt);
    const masterWeight = this.weight;
    if (masterWeight <= 0) return [];

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
        child.state.fadeGroup.weight = 0;
        child.state.action.setEffectiveWeight(0);
      }
    }

    return allEvents;
  }
}
