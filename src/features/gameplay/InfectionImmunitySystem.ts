import type { Engine } from '../../engine/Engine';
import type { InfectionConfig, InfectionStage, InfectionState } from './types';

export const DEFAULT_INFECTION_CONFIG: InfectionConfig = {
  enabled: true,
  biteInfectionAmount: 15,
  acidInfectionRatePerSec: 20,
  passiveDecayRatePerSec: 0.5,
  tickDamageCritical: 5,
  antiobioticHealAmount: 40,
};

export class InfectionImmunitySystem {
  private config: InfectionConfig;
  private readonly unsubs: Array<() => void> = [];
  private tickCooldown = 0;

  private readonly state: InfectionState = {
    infectionPercent: 0,
    currentStage: 'none',
    hasImmunityBoost: false,
    immunityTimeRemaining: 0,
  };

  constructor(private readonly engine: Engine, initialConfig: InfectionConfig = DEFAULT_INFECTION_CONFIG) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    // Listen for zombie attacks on player
    const u1 = events.on('zombie_attacked', () => {
      this.addInfection(this.config.biteInfectionAmount);
    });

    if (u1) this.unsubs.push(u1);
  }

  setConfig(config: Partial<InfectionConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.state.infectionPercent = 0;
      this.state.currentStage = 'none';
    }
  }

  getConfig(): Readonly<InfectionConfig> {
    return this.config;
  }

  getState(): Readonly<InfectionState> {
    return this.state;
  }

  addInfection(amount: number): void {
    if (!this.config.enabled || this.state.hasImmunityBoost) return;

    this.state.infectionPercent = Math.min(100, Math.max(0, this.state.infectionPercent + amount));
    this.evaluateStage();

    this.engine.sceneManager?.events?.emit('infection_changed', {
      infectionPercent: this.state.infectionPercent,
      stage: this.state.currentStage,
    });

    if (this.state.infectionPercent >= 100) {
      this.triggerZombification();
    }
  }

  applyAntidote(amount = this.config.antiobioticHealAmount): void {
    this.state.infectionPercent = Math.max(0, this.state.infectionPercent - amount);
    this.evaluateStage();
    this.engine.sceneManager?.events?.emit('antidote_applied', {
      infectionPercent: this.state.infectionPercent,
      stage: this.state.currentStage,
    });
  }

  grantImmunityBoost(durationSec: number): void {
    this.state.hasImmunityBoost = true;
    this.state.immunityTimeRemaining = durationSec;
    this.engine.sceneManager?.events?.emit('immunity_boost_started', { durationSec });
  }

  private evaluateStage(): void {
    const p = this.state.infectionPercent;
    let nextStage: InfectionStage = 'none';

    if (p >= 100) nextStage = 'fatal';
    else if (p >= 75) nextStage = 'critical';
    else if (p >= 50) nextStage = 'moderate';
    else if (p >= 25) nextStage = 'mild';

    if (nextStage !== this.state.currentStage) {
      this.state.currentStage = nextStage;
      this.engine.sceneManager?.events?.emit('infection_stage_changed', { stage: nextStage });
    }
  }

  private triggerZombification(): void {
    const playerEntityId = this.engine.player?.getPossessedId?.() ?? 1;
    this.engine.combat?.applyDamage?.(null, playerEntityId, 9999);
    this.engine.sceneManager?.events?.emit('player_zombified', {});
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    // Immunity timer
    if (this.state.hasImmunityBoost) {
      this.state.immunityTimeRemaining -= dt;
      if (this.state.immunityTimeRemaining <= 0) {
        this.state.hasImmunityBoost = false;
        this.state.immunityTimeRemaining = 0;
        this.engine.sceneManager?.events?.emit('immunity_boost_ended', {});
      }
    } else if (this.config.passiveDecayRatePerSec > 0 && this.state.infectionPercent > 0) {
      // Passive natural recovery if not critical
      if (this.state.currentStage === 'mild' || this.state.currentStage === 'none') {
        this.state.infectionPercent = Math.max(0, this.state.infectionPercent - this.config.passiveDecayRatePerSec * dt);
        this.evaluateStage();
      }
    }

    // Critical infection tick damage
    if (this.state.currentStage === 'critical') {
      this.tickCooldown -= dt;
      if (this.tickCooldown <= 0) {
        this.tickCooldown = 1.0;
        const playerEntityId = this.engine.player?.getPossessedId?.() ?? 1;
        this.engine.combat?.applyDamage?.(null, playerEntityId, this.config.tickDamageCritical);
      }
    }
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      infectionPercent: this.state.infectionPercent,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    if (typeof data.enabled === 'boolean') this.config.enabled = data.enabled;
    if (typeof data.infectionPercent === 'number') {
      this.state.infectionPercent = data.infectionPercent;
      this.evaluateStage();
    }
  }
}
