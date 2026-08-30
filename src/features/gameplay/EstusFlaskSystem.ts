import type { Engine } from '../../engine/Engine';
import type { EstusFlaskConfig, EstusFlaskState } from './types';

export class EstusFlaskSystem {
  private config: EstusFlaskConfig;
  private readonly state: EstusFlaskState;

  constructor(private readonly engine: Engine, initialConfig: EstusFlaskConfig) {
    this.config = { ...initialConfig };
    this.state = {
      crimsonFlasksRemaining: this.config.maxCrimsonFlasks,
      ceruleanFlasksRemaining: this.config.maxCeruleanFlasks,
      isDrinking: false,
      drinkTimer: 0,
      activeFlaskType: null,
    };
  }

  setConfig(config: Partial<EstusFlaskConfig>): void {
    this.config = { ...this.config, ...config };
    this.state.crimsonFlasksRemaining = Math.min(this.state.crimsonFlasksRemaining, this.config.maxCrimsonFlasks);
    this.state.ceruleanFlasksRemaining = Math.min(this.state.ceruleanFlasksRemaining, this.config.maxCeruleanFlasks);
    if (!this.config.enabled) { this.state.isDrinking = false; this.state.activeFlaskType = null; this.state.drinkTimer = 0; }
  }

  getConfig(): Readonly<EstusFlaskConfig> {
    return this.config;
  }

  getState(): Readonly<EstusFlaskState> {
    return this.state;
  }

  get crimsonRemaining(): number {
    return this.state.crimsonFlasksRemaining;
  }

  get ceruleanRemaining(): number {
    return this.state.ceruleanFlasksRemaining;
  }

  get isDrinking(): boolean {
    return this.state.isDrinking;
  }

  drinkFlask(type: 'crimson' | 'cerulean'): boolean {
    if (!this.config.enabled || this.state.isDrinking) return false;

    if (type === 'crimson' && this.state.crimsonFlasksRemaining <= 0) return false;
    if (type === 'cerulean' && this.state.ceruleanFlasksRemaining <= 0) return false;

    const drinker = this.engine.player.getPossessedId();
    if (drinker === null || !this.engine.sceneManager.getRigidBody(drinker)) return false;
    this.state.isDrinking = true;
    this.state.drinkTimer = this.config.drinkDuration;
    this.state.activeFlaskType = type;

    if (type === 'crimson') {
      this.state.crimsonFlasksRemaining--;
    } else {
      this.state.ceruleanFlasksRemaining--;
    }

    const playerEntityId = this.engine.player.getPossessedId();
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    if (playerRb) {
      this.engine.burstVfx(type === 'crimson' ? 'heal' : 'glow', playerRb.mesh.position, 15);
    }

    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.7, loop: false });
    this.engine.sceneManager.events.emit('flask_used', { type });
    return true;
  }

  refillFlasks(): void {
    this.state.crimsonFlasksRemaining = this.config.maxCrimsonFlasks;
    this.state.ceruleanFlasksRemaining = this.config.maxCeruleanFlasks;
    this.engine.sceneManager.events.emit('flasks_refilled', {});
  }

  update(dt: number): void {
    if (!this.config.enabled || !this.state.isDrinking) return;

    this.state.drinkTimer -= dt;
    if (this.state.drinkTimer <= 0) {
      this.state.isDrinking = false;

      const playerEntityId = this.engine.player.getPossessedId();
      if (playerEntityId !== null) {
        if (this.state.activeFlaskType === 'crimson') {
          const health = this.engine.combat.getHealth(playerEntityId);
          if (health) {
            health.hp = Math.min(health.maxHp, health.hp + this.config.crimsonHealAmount);
          }
        } else if (this.state.activeFlaskType === 'cerulean') {
          if (this.engine.gameplayFeatures?.abilities) {
            this.engine.gameplayFeatures.abilities.restoreMp(this.config.ceruleanMpAmount);
          }
        }
      }

      this.state.activeFlaskType = null;
    }
  }
}
