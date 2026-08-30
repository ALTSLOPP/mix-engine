import type { Engine } from '../../engine/Engine';
import type { KillstreakConfig, KillstreakRewardDef, KillstreakState } from './types';

export class KillstreakSystem {
  private readonly unsubscribe: Array<() => void> = [];

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  private config: KillstreakConfig;
  private readonly state: KillstreakState = {
    currentStreak: 0,
    highestStreak: 0,
    timeSinceLastKill: 0,
    activeBuffs: new Set<string>(),
    radarActiveUntil: 0,
  };

  constructor(private readonly engine: Engine, initialConfig: KillstreakConfig) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  setConfig(config: Partial<KillstreakConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.resetStreak(); this.state.radarActiveUntil = 0; this.state.activeBuffs.clear(); }
  }

  getConfig(): Readonly<KillstreakConfig> {
    return this.config;
  }

  getState(): Readonly<KillstreakState> {
    return this.state;
  }

  get currentStreak(): number {
    return this.state.currentStreak;
  }

  get isRadarActive(): boolean {
    return performance.now() < this.state.radarActiveUntil;
  }

  private bindEvents(): void {
    this.unsubscribe.push(this.engine.sceneManager.events.on('player_death', () => this.resetStreak()));
    this.unsubscribe.push(this.engine.sceneManager.events.on('combat_death', (payload: any) => {
      if (!this.config.enabled) return;
      const id = payload?.entityId;
      const playerId = this.engine.player.getPossessedId();
      const credited = payload?.attackerId === playerId || this.engine.sceneManager.hasTag(payload?.attackerId, 'companion');
      if (playerId !== null && credited && id !== undefined && this.engine.sceneManager.hasTag(id, 'enemy')) {
        this.registerKill();
      }
    }));
  }

  registerKill(): void {
    if (!this.config.enabled) return;

    this.state.currentStreak++;
    this.state.timeSinceLastKill = 0;

    if (this.state.currentStreak > this.state.highestStreak) {
      this.state.highestStreak = this.state.currentStreak;
    }

    // Check reward unlock
    const reward = this.config.rewards.find((r) => r.streakCount === this.state.currentStreak);
    if (reward) {
      this.triggerReward(reward);
    }

    this.engine.sceneManager.events.emit('killstreak_achieved', {
      streak: this.state.currentStreak,
      highestStreak: this.state.highestStreak,
      reward: reward?.name,
    });
  }

  resetStreak(): void {
    this.state.currentStreak = 0;
    this.state.timeSinceLastKill = 0;
  }

  triggerReward(reward: KillstreakRewardDef): void {
    this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 1.0, loop: false });

    if (reward.type === 'uav_radar') {
      this.state.radarActiveUntil = performance.now() + reward.duration * 1000;
    } else if (reward.type === 'health_pack') {
      const playerEntityId = this.engine.player.getPossessedId();
      if (playerEntityId !== null) {
        const health = this.engine.combat.getHealth(playerEntityId);
        if (health) health.hp = Math.min(health.maxHp, health.hp + 50);
        const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
        if (playerRb) this.engine.burstVfx('heal', playerRb.mesh.position, 20);
      }
    } else if (reward.type === 'airstrike') {
      this.engine.effects.shake({ trauma: 0.6, duration: 0.8 });
      // Bombard enemies
      const allEntities = this.engine.sceneManager.allEntityIds();
      for (const id of allEntities) {
        if (this.engine.sceneManager.hasTag(id, 'enemy')) {
          const rb = this.engine.sceneManager.getRigidBody(id);
          if (rb) {
            this.engine.burstVfx('explosion', rb.mesh.position, 30);
            this.engine.combat.applyDamage(this.engine.player.getPossessedId(), id, 100, 'explosion');
          }
        }
      }
    }

    this.engine.sceneManager.events.emit('killstreak_reward_unlocked', { reward });
  }

  update(dt: number): void {
    if (!this.config.enabled || this.state.currentStreak === 0) return;

    this.state.timeSinceLastKill += dt;
    if (this.state.timeSinceLastKill >= this.config.streakResetTime) {
      this.resetStreak();
    }
  }
}
