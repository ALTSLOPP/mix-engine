import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { ComboConfig, ComboState, ComboStep } from './types';
import type { AnimationStateMachine } from '../../animation/AnimationStateMachine';

export class ComboSystem {
  private readonly unsubscribe: Array<() => void> = [];

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  private config: ComboConfig;
  private readonly state: ComboState = {
    currentStepIndex: -1,
    currentChain: 'none',
    isInCancelWindow: false,
    canBufferInput: false,
    bufferedAction: null,
    comboCount: 0,
    comboScore: 0,
    comboRank: 'D',
    comboTimer: 0,
  };

  private stepTimeElapsed = 0;
  private currentStepDuration = 0;
  private inputBufferTimer = 0;

  constructor(private readonly engine: Engine, initialConfig: ComboConfig) {
    this.config = { ...initialConfig };
    this.bindCombatEvents();
  }

  setConfig(config: Partial<ComboConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.interruptAttack(); this.resetCombo(); }
  }

  getConfig(): Readonly<ComboConfig> {
    return this.config;
  }

  getState(): Readonly<ComboState> {
    return this.state;
  }

  get isAttacking(): boolean {
    return this.state.currentChain !== 'none' && this.state.currentStepIndex >= 0;
  }

  get canCancel(): boolean {
    return this.state.isInCancelWindow;
  }

  private bindCombatEvents(): void {
    this.unsubscribe.push(this.engine.sceneManager.events.on('gameplay_hit', (e: any) => {
      const playerId = this.engine.player.getPossessedId();
      if (playerId !== null && e?.attackerId === playerId) {
        this.incrementCombo(e.damage ?? 20);
      }
    }));
  }

  incrementCombo(damageDealt: number): void {
    if (!this.config.enabled || !Number.isFinite(damageDealt) || damageDealt <= 0) return;
    this.state.comboCount++;
    this.state.comboScore += Math.floor(damageDealt * (1 + this.state.comboCount * 0.1));
    this.state.comboTimer = this.config.comboResetDelay;
    this.updateComboRank();

    // Broadcast combo update event for HUD
    this.engine.sceneManager.events.emit('combo_update', {
      count: this.state.comboCount,
      score: this.state.comboScore,
      rank: this.state.comboRank,
    });
  }

  resetCombo(): void {
    this.state.comboCount = 0;
    this.state.comboScore = 0;
    this.state.comboRank = 'D';
    this.state.comboTimer = 0;
  }

  bufferAction(action: 'light' | 'heavy' | 'dodge' | 'ability_1' | 'ability_2' | 'ability_3' | 'ability_4'): void {
    if (!this.config.enabled) return;
    this.state.bufferedAction = action;
    this.inputBufferTimer = this.config.inputBufferDuration;
  }

  executeLightAttack(asm: AnimationStateMachine, isRunning = false, isDodging = false): boolean {
    if (!this.config.enabled) return false;

    // Running attack variant
    if (isRunning && this.state.currentChain === 'none') {
      return this.playStep(asm, 'running', 0, this.config.runningAttack);
    }

    // Dodge counter variant
    if (isDodging) {
      return this.playStep(asm, 'dodge', 0, this.config.dodgeAttack);
    }

    // Standard light chain progression
    if (this.state.currentChain === 'light') {
      const nextIdx = (this.state.currentStepIndex + 1) % this.config.lightCombo.length;
      return this.playStep(asm, 'light', nextIdx, this.config.lightCombo[nextIdx]);
    } else {
      // Start light chain
      return this.playStep(asm, 'light', 0, this.config.lightCombo[0]);
    }
  }

  executeHeavyAttack(asm: AnimationStateMachine): boolean {
    if (!this.config.enabled) return false;

    if (this.state.currentChain === 'heavy') {
      const nextIdx = (this.state.currentStepIndex + 1) % this.config.heavyCombo.length;
      return this.playStep(asm, 'heavy', nextIdx, this.config.heavyCombo[nextIdx]);
    } else {
      // Branch transition from light or fresh heavy start
      return this.playStep(asm, 'heavy', 0, this.config.heavyCombo[0]);
    }
  }

  interruptAttack(): void {
    this.state.currentChain = 'none';
    this.state.currentStepIndex = -1;
    this.state.isInCancelWindow = false;
    this.state.canBufferInput = false;
    this.state.bufferedAction = null;
    this.stepTimeElapsed = 0;
  }

  private playStep(
    asm: AnimationStateMachine,
    chain: 'light' | 'heavy' | 'running' | 'dodge',
    stepIndex: number,
    step: ComboStep,
  ): boolean {
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null || !step) return false;

    this.state.currentChain = chain;
    this.state.currentStepIndex = stepIndex;
    this.state.isInCancelWindow = false;
    this.state.canBufferInput = false;
    this.state.bufferedAction = null;

    // Transition animation
    asm.transition(step.animation, 0.12);

    // Approximate step duration (default 0.75s if not driven by clip length)
    this.currentStepDuration = 0.75;
    this.stepTimeElapsed = 0;

    // Trigger audio
    if (step.audio) {
      this.engine.audio.play(step.audio, { volume: 0.85, loop: false });
    }

    // Open timed hitbox for this step
    const timedHitboxes = (this.engine as any).gameplayFeatures?.getSystem('timed_hitboxes');
    if (timedHitboxes) {
      timedHitboxes.openHitbox({
        attackerId: playerEntityId,
        damage: 25 * step.damageMultiplier,
        poiseDamage: step.poiseDamage,
        knockbackForce: step.knockbackForce,
        duration: 0.35,
      });
    }

    return true;
  }

  update(dt: number, asm?: AnimationStateMachine | null): void {
    if (!this.config.enabled) return;
    // Expire inputs before considering the cancel window.
    if (this.inputBufferTimer > 0) {
      this.inputBufferTimer -= dt;
      if (this.inputBufferTimer <= 0) this.state.bufferedAction = null;
    }
    // 1. Combo decay timer
    if (this.state.comboTimer > 0) {
      this.state.comboTimer -= dt;
      if (this.state.comboTimer <= 0) {
        this.resetCombo();
      }
    }

    // 2. Active attack step progression
    if (this.isAttacking) {
      this.stepTimeElapsed += dt;
      const progressNorm = Math.min(1.0, this.stepTimeElapsed / Math.max(0.1, this.currentStepDuration));

      const activeStep = this.getCurrentStep();
      const cancelThreshold = activeStep?.cancelStartNorm ?? 0.55;

      if (progressNorm >= cancelThreshold) {
        this.state.isInCancelWindow = true;
        this.state.canBufferInput = true;

        // Process buffered action if queued
        if (this.state.bufferedAction && asm) {
          const action = this.state.bufferedAction;
          this.state.bufferedAction = null;
          this.inputBufferTimer = 0;
          if (action === 'light') {
            this.executeLightAttack(asm);
            return;
          } else if (action === 'heavy') {
            this.executeHeavyAttack(asm);
            return;
          }
        }
      }

      if (this.stepTimeElapsed >= this.currentStepDuration) {
        // Attack step completed naturally, return to neutral
        this.state.currentChain = 'none';
        this.state.currentStepIndex = -1;
        this.state.isInCancelWindow = false;
        this.state.canBufferInput = false;
        if (asm && asm.currentState !== 'idle' && asm.currentState !== 'run' && asm.currentState !== 'walk') {
          asm.transition('idle', 0.2);
        }
      }
    }


  }

  private getCurrentStep(): ComboStep | null {
    if (this.state.currentChain === 'light') {
      return this.config.lightCombo[this.state.currentStepIndex] ?? null;
    } else if (this.state.currentChain === 'heavy') {
      return this.config.heavyCombo[this.state.currentStepIndex] ?? null;
    } else if (this.state.currentChain === 'running') {
      return this.config.runningAttack;
    } else if (this.state.currentChain === 'dodge') {
      return this.config.dodgeAttack;
    }
    return null;
  }

  private updateComboRank(): void {
    const count = this.state.comboCount;
    if (count >= 25) this.state.comboRank = 'SSS';
    else if (count >= 16) this.state.comboRank = 'S';
    else if (count >= 10) this.state.comboRank = 'A';
    else if (count >= 5) this.state.comboRank = 'B';
    else if (count >= 2) this.state.comboRank = 'C';
    else this.state.comboRank = 'D';
  }
}
