import * as THREE from 'three';
import { ClipState } from './ClipState';
import { MotionState } from './MotionState';
import type { MotionEventPayload } from './types';

export interface SequenceStage {
  name: string;
  state: ClipState;
  fadeDuration?: number;
  comboWindow?: [number, number]; // [startNormalized, endNormalized]
  recoveryTransition?: string; // fallback state if no input in combo window
}

/**
 * SequenceState — Multi-stage animation sequences with combo windows and branching.
 */
export class SequenceState extends MotionState {
  private stages: SequenceStage[] = [];
  private currentStageIndex = 0;
  private queuedNextStage = false;
  private isComboWindowOpen = false;

  constructor(id: string, name: string) {
    super(id, name);
  }

  addStage(stage: SequenceStage): this {
    this.stages.push(stage);
    this.recalculateDuration();
    return this;
  }

  private recalculateDuration(): void {
    let total = 0;
    for (const s of this.stages) {
      total += s.state.duration;
    }
    this._duration = total;
  }

  get currentStage(): SequenceStage | null {
    return this.stages[this.currentStageIndex] ?? null;
  }

  /**
   * Signal user input to advance combo to the next stage if inside the combo window.
   */
  triggerCombo(): boolean {
    if (this.isComboWindowOpen) {
      this.queuedNextStage = true;
      return true;
    }
    return false;
  }

  override play(): this {
    super.play();
    this.currentStageIndex = 0;
    this.queuedNextStage = false;
    if (this.stages[0]) {
      this.stages[0].state.play();
      this.stages[0].state.fadeIn(0.1);
    }
    return this;
  }

  override stop(): this {
    super.stop();
    for (const s of this.stages) {
      s.state.stop();
    }
    this.currentStageIndex = 0;
    this.queuedNextStage = false;
    return this;
  }

  override update(dt: number): MotionEventPayload[] {
    if (this.status !== 'playing' || this.stages.length === 0) return [];

    this.fadeGroup.update(dt);
    const masterWeight = this.weight;
    if (masterWeight <= 0) return [];

    const stage = this.stages[this.currentStageIndex];
    if (!stage) {
      this.status = 'completed';
      return [];
    }

    stage.state.fadeGroup.weight = masterWeight;
    const events = stage.state.update(dt);

    // Evaluate combo window
    if (stage.comboWindow) {
      const nt = stage.state.normalizedTime;
      this.isComboWindowOpen = nt >= stage.comboWindow[0] && nt <= stage.comboWindow[1];
    } else {
      this.isComboWindowOpen = false;
    }

    // Check stage completion
    if (stage.state.status === 'completed' || stage.state.normalizedTime >= 0.98) {
      if (this.queuedNextStage && this.currentStageIndex + 1 < this.stages.length) {
        // Transition to next combo stage
        const nextIdx = this.currentStageIndex + 1;
        const nextStage = this.stages[nextIdx];

        stage.state.fadeOut(nextStage.fadeDuration ?? 0.15, 'linear', () => stage.state.stop());
        nextStage.state.setTime(0);
        nextStage.state.play();
        nextStage.state.fadeIn(nextStage.fadeDuration ?? 0.15);

        this.currentStageIndex = nextIdx;
        this.queuedNextStage = false;
      } else if (this.loop && this.stages.length > 1) {
        // Loop sequence from beginning
        const nextStage = this.stages[0];
        stage.state.fadeOut(0.15, 'linear', () => stage.state.stop());
        nextStage.state.setTime(0);
        nextStage.state.play();
        nextStage.state.fadeIn(0.15);
        this.currentStageIndex = 0;
      } else {
        this.status = 'completed';
      }
    }

    return events;
  }

  override extractRootDelta(out: THREE.Vector3): THREE.Vector3 {
    const stage = this.stages[this.currentStageIndex];
    if (stage) {
      return stage.state.extractRootDelta(out);
    }
    return out.set(0, 0, 0);
  }

  override dispose(): void {
    for (const s of this.stages) {
      s.state.dispose();
    }
    this.stages = [];
  }
}
