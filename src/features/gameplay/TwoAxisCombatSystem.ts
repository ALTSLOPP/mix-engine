import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type {
  TwoAxisCombatConfig,
  TwoAxisCombatState,
  CombatMovementMode,
  CombatAction,
  FramePhase,
} from './types';

export class TwoAxisCombatSystem {
  private readonly unsubscribe: Array<() => void> = [];
  private config: TwoAxisCombatConfig;
  private readonly entityStates = new Map<EntityId, TwoAxisCombatState>();

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    this.entityStates.clear();
  }

  constructor(private readonly engine: Engine, initialConfig: TwoAxisCombatConfig) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  setConfig(patch: Partial<TwoAxisCombatConfig>): void {
    this.config = { ...this.config, ...patch };
    if (!this.config.enabled) {
      this.entityStates.clear();
    }
  }

  getConfig(): Readonly<TwoAxisCombatConfig> {
    return this.config;
  }

  getState(entityId: EntityId): TwoAxisCombatState {
    let state = this.entityStates.get(entityId);
    if (!state) {
      state = {
        movementMode: 'grounded',
        action: 'idle',
        phase: 'startup',
        currentKi: 50,
        maxKi: this.config.maxKi,
        isChargingKi: false,
        hitStopTimer: 0,
        actionTimer: 0,
        actionDuration: 0,
        cancelWindowOpen: false,
        comboStep: 0,
      };
      this.entityStates.set(entityId, state);
    }
    return state;
  }

  setMovementMode(entityId: EntityId, mode: CombatMovementMode): void {
    const state = this.getState(entityId);
    if (state.movementMode !== mode) {
      state.movementMode = mode;
      this.engine.sceneManager.events.emit('two_axis_movement_changed', { entityId, mode });
    }
  }

  /**
   * Action Legality & Transition Evaluator
   */
  canTransitionToAction(state: TwoAxisCombatState, nextAction: CombatAction): boolean {
    if (state.action === 'dead') return false;
    if (state.action === 'downed' && nextAction !== 'idle' && nextAction !== 'hit_stun') return false;

    // Hit stun always overrides any current non-dead action
    if (nextAction === 'hit_stun' || nextAction === 'dead') return true;

    // Idle allows any action
    if (state.action === 'idle') return true;

    // If currently performing an action, check cancel window
    if (this.config.enableCancelWindows && state.cancelWindowOpen) {
      // Dodges/Dashes, Guards, and Special Channels have high cancel priority
      if (['dash', 'guard', 'teleport_windup', 'omen_channel'].includes(nextAction)) {
        return true;
      }
      // Melee string progression
      if (state.action === 'melee_string' && nextAction === 'melee_string') {
        return true;
      }
    }

    return false;
  }

  requestAction(
    entityId: EntityId,
    nextAction: CombatAction,
    options: { duration?: number; comboStep?: number; kiCost?: number } = {},
  ): boolean {
    if (!this.config.enabled) return false;
    const state = this.getState(entityId);

    // Check Ki resource cost
    const kiCost = options.kiCost ?? 0;
    if (kiCost > 0 && state.currentKi < kiCost) {
      return false;
    }

    if (!this.canTransitionToAction(state, nextAction)) {
      return false;
    }

    // Deduct Ki if applicable
    if (kiCost > 0) {
      state.currentKi -= kiCost;
    }

    // Apply action state
    state.action = nextAction;
    state.phase = 'startup';
    state.actionDuration = options.duration ?? 0.6;
    state.actionTimer = 0;
    state.cancelWindowOpen = false;
    state.comboStep = options.comboStep ?? (nextAction === 'melee_string' ? state.comboStep + 1 : 0);
    state.isChargingKi = nextAction === 'charging';

    this.engine.sceneManager.events.emit('two_axis_action_started', {
      entityId,
      action: nextAction,
      movementMode: state.movementMode,
      comboStep: state.comboStep,
    });

    return true;
  }

  startChargingKi(entityId: EntityId): boolean {
    return this.requestAction(entityId, 'charging', { duration: 9999 });
  }

  stopChargingKi(entityId: EntityId): void {
    const state = this.getState(entityId);
    if (state.action === 'charging') {
      state.action = 'idle';
      state.isChargingKi = false;
    }
  }

  triggerHitStop(entityId: EntityId, duration?: number): void {
    const state = this.getState(entityId);
    const stopDur = duration ?? this.config.hitStopDuration;
    state.hitStopTimer = stopDur;
    this.engine.sceneManager.events.emit('hitstop_triggered', { entityId, duration: stopDur });
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    for (const [entityId, state] of this.entityStates) {
      // 1. Process Hit Stop
      if (state.hitStopTimer > 0) {
        state.hitStopTimer -= dt;
        continue; // Actor is frozen during hit stop
      }

      // 2. Process Ki charging & resource regeneration
      if (state.isChargingKi) {
        state.currentKi = Math.min(state.maxKi, state.currentKi + this.config.kiChargeRate * dt);
      }

      // 3. Process Action Phase Timeline (Startup -> Active -> Recovery)
      if (state.action !== 'idle') {
        state.actionTimer += dt;
        const normTime = state.actionDuration > 0 ? state.actionTimer / state.actionDuration : 1.0;

        if (normTime < 0.3) {
          state.phase = 'startup';
          state.cancelWindowOpen = false;
        } else if (normTime < 0.7) {
          state.phase = 'active';
          state.cancelWindowOpen = false;
        } else if (normTime < 1.0) {
          state.phase = 'recovery';
          state.cancelWindowOpen = true;
        } else {
          // Action complete, return to idle
          state.action = 'idle';
          state.phase = 'startup';
          state.cancelWindowOpen = false;
          state.isChargingKi = false;
          this.engine.sceneManager.events.emit('two_axis_action_ended', { entityId });
        }
      }
    }
  }

  private bindEvents(): void {
    this.unsubscribe.push(
      this.engine.sceneManager.events.on('gameplay_hit', (hit: any) => {
        if (!this.config.enabled || !hit?.targetId) return;
        this.triggerHitStop(hit.targetId);
        if (hit.attackerId) this.triggerHitStop(hit.attackerId);
      }),
    );
  }
}
