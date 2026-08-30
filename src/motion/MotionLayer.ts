import * as THREE from 'three';
import { FadeGroup } from './FadeGroup';
import type { MotionMask } from './MotionMask';
import type { MotionState } from './MotionState';
import type { EasingType, LayerBlendMode, MotionEventPayload, MotionLayerInfo } from './types';

const _identityQ = new THREE.Quaternion();

/**
 * MotionLayer — Animation layer managing active states, layer weight, blending mode, masking,
 * rotational root motion extraction, queue interruption policies, and automated memory pruning.
 */
export class MotionLayer {
  readonly index: number;
  name: string;
  blendMode: LayerBlendMode = 'override';
  mask: MotionMask | null = null;

  readonly fadeGroup = new FadeGroup(1.0);
  private states = new Map<string, MotionState>();
  private activeStateId: string | null = null;
  private playQueue: Array<{ stateId: string; fade: number; easing: EasingType }> = [];

  private layerRootDelta = new THREE.Vector3();
  private layerAppliedRootDelta = new THREE.Vector3();
  private layerRootRotDelta = new THREE.Quaternion();
  private layerAppliedRootRotDelta = new THREE.Quaternion();

  private tempVec = new THREE.Vector3();
  private tempQuat = new THREE.Quaternion();

  constructor(index: number, name: string, blendMode: LayerBlendMode = 'override', mask: MotionMask | null = null) {
    this.index = index;
    this.name = name;
    this.blendMode = blendMode;
    this.mask = mask;
  }

  get weight(): number {
    return this.fadeGroup.weight;
  }

  set weight(val: number) {
    this.fadeGroup.weight = Math.max(0, val);
    this.fadeGroup.targetWeight = this.fadeGroup.weight;
  }

  get targetWeight(): number {
    return this.fadeGroup.targetWeight;
  }

  get currentState(): MotionState | null {
    return this.activeStateId ? this.states.get(this.activeStateId) ?? null : null;
  }

  get queuedCount(): number {
    return this.playQueue.length;
  }

  addState(state: MotionState): void {
    state.layerIndex = this.index;
    this.states.set(state.id, state);
  }

  getState(id: string): MotionState | null {
    return this.states.get(id) ?? null;
  }

  getAllStates(): MotionState[] {
    return Array.from(this.states.values());
  }

  removeState(id: string): boolean {
    const state = this.states.get(id);
    if (!state) return false;
    state.stop();
    state.dispose();
    if (this.activeStateId === id) {
      this.activeStateId = null;
    }
    return this.states.delete(id);
  }

  play(stateId: string, fade = 0.2, easing: EasingType = 'linear'): MotionState | null {
    const nextState = this.states.get(stateId);
    if (!nextState) {
      console.warn(`[MotionLayer] State '${stateId}' not found on layer '${this.name}'`);
      return null;
    }

    if (this.activeStateId && this.activeStateId !== stateId) {
      const prevState = this.states.get(this.activeStateId);
      if (prevState) {
        if (fade > 0) {
          prevState.fadeOut(fade, easing, () => {
            if (this.activeStateId !== prevState.id) {
              prevState.stop();
            }
          });
        } else {
          prevState.stop();
        }
      }
    }

    this.activeStateId = stateId;
    nextState.play();
    if (fade > 0) {
      nextState.fadeIn(fade, easing);
    } else {
      nextState.weight = 1.0;
    }

    return nextState;
  }

  /**
   * Queue a state to play immediately after the currently active state completes.
   */
  queue(stateId: string, fade = 0.2, easing: EasingType = 'linear'): MotionState | null {
    const state = this.states.get(stateId);
    if (!state) {
      console.warn(`[MotionLayer] State '${stateId}' not found on layer '${this.name}'`);
      return null;
    }

    const current = this.currentState;
    if (!current || current.status === 'completed' || current.status === 'stopped') {
      return this.play(stateId, fade, easing);
    }

    this.playQueue.push({ stateId, fade, easing });
    return state;
  }

  clearQueue(): void {
    this.playQueue = [];
  }

  stop(fade = 0.2): void {
    this.clearQueue();
    if (this.activeStateId) {
      const cur = this.states.get(this.activeStateId);
      if (cur) {
        if (fade > 0) {
          cur.fadeOut(fade, 'linear', () => cur.stop());
        } else {
          cur.stop();
        }
      }
      this.activeStateId = null;
    }
  }

  update(dt: number): MotionEventPayload[] {
    this.fadeGroup.update(dt);
    const layerW = this.weight;
    const allEvents: MotionEventPayload[] = [];

    this.layerRootDelta.set(0, 0, 0);
    this.layerAppliedRootDelta.set(0, 0, 0);
    this.layerRootRotDelta.identity();
    this.layerAppliedRootRotDelta.identity();

    const statesToPrune: string[] = [];

    for (const state of this.states.values()) {
      if (state.status === 'playing' || state.weight > 0) {
        state.layerWeight = layerW;
        const events = state.update(dt);
        allEvents.push(...events);

        // Accumulate translation root motion delta
        if (layerW > 0 && state.rootMotionMode !== 'off') {
          state.extractRootDelta(this.tempVec);
          this.layerRootDelta.addScaledVector(this.tempVec, layerW);

          if (state.rootMotionMode !== 'extractOnly') {
            if (state.rootMotionMode === 'xzOnly') this.tempVec.y = 0;
            if (state.rootMotionMode === 'yawOnly') this.tempVec.set(0, 0, 0);
            if (state.rootMotionMode === 'consumePartially') this.tempVec.multiplyScalar(0.5);
            this.layerAppliedRootDelta.addScaledVector(this.tempVec, layerW);
          }

          // Accumulate rotation root motion delta
          state.extractRootRotationDelta(this.tempQuat);
          if (this.tempQuat.x !== 0 || this.tempQuat.y !== 0 || this.tempQuat.z !== 0 || this.tempQuat.w !== 1) {
            this.tempQuat.slerp(_identityQ, 1 - layerW);
            this.layerRootRotDelta.multiply(this.tempQuat);
            if (state.rootMotionMode !== 'extractOnly') {
              this.layerAppliedRootRotDelta.multiply(this.tempQuat);
            }
          }
        }
      }

      // Check if state is inactive, faded out, not queued, and non-persistent -> prune
      const isQueued = this.playQueue.some((q) => q.stateId === state.id);
      if (
        !isQueued &&
        !state.isPersistent &&
        state.id !== this.activeStateId &&
        state.weight <= 0.0001 &&
        (state.status === 'stopped' || state.status === 'completed')
      ) {
        statesToPrune.push(state.id);
      }
    }

    // Check if current active state completed and advance queue
    if (this.activeStateId && this.playQueue.length > 0) {
      const cur = this.states.get(this.activeStateId);
      if (cur && (cur.status === 'completed' || cur.status === 'stopped')) {
        const next = this.playQueue.shift()!;
        this.play(next.stateId, next.fade, next.easing);
      }
    }

    // Prune expired transient states
    for (const pruneId of statesToPrune) {
      this.removeState(pruneId);
    }

    return allEvents;
  }




  extractRootDelta(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.layerRootDelta);
  }

  extractAppliedRootDelta(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.layerAppliedRootDelta);
  }

  extractRootRotationDelta(out: THREE.Quaternion): THREE.Quaternion {
    return out.copy(this.layerRootRotDelta);
  }

  extractAppliedRootRotationDelta(out: THREE.Quaternion): THREE.Quaternion {
    return out.copy(this.layerAppliedRootRotDelta);
  }

  getInfo(): MotionLayerInfo {
    const activeStatesList = Array.from(this.states.values())
      .filter((s) => s.status === 'playing' || s.weight > 0)
      .map((s) => s.getInfo());

    return {
      index: this.index,
      name: this.name,
      weight: this.weight,
      targetWeight: this.targetWeight,
      blendMode: this.blendMode,
      maskName: this.mask?.name,
      activeStateId: this.activeStateId,
      activeStates: activeStatesList,
    };
  }

  dispose(): void {
    this.clearQueue();
    for (const s of this.states.values()) {
      s.dispose();
    }
    this.states.clear();
    this.activeStateId = null;
  }
}
