import type { Engine } from '../../engine/Engine';
import type { GobbleGumConfig, GobbleGumState, GobbleGumType } from './types';

export const DEFAULT_GOBBLEGUM_CONFIG: GobbleGumConfig = {
  enabled: true,
  shoppingFreeDurationSec: 60.0,
  inPlainSightDurationSec: 10.0,
  alchemicalDurationSec: 60.0,
};

export class GobbleGumSystem {
  private config: GobbleGumConfig;
  private readonly unsubs: Array<() => void> = [];

  private readonly state: GobbleGumState = {
    activeGums: {
      shopping_free: 0,
      perkaholic: 0,
      in_plain_sight: 0,
      alchemical_antithesis: 0,
      self_medication: 0,
    },
    remainingCharges: {
      shopping_free: 2,
      perkaholic: 1,
      in_plain_sight: 3,
      alchemical_antithesis: 2,
      self_medication: 3,
    },
  };

  constructor(private readonly engine: Engine, initialConfig: GobbleGumConfig = DEFAULT_GOBBLEGUM_CONFIG) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    // Self-medication revive on kill
    const u1 = events.on('zombie_killed', () => {
      const playerId = this.engine.player?.getPossessedId?.() ?? null;
      if (this.config.enabled && playerId !== null && this.state.remainingCharges.self_medication > 0) {
        const playerHealth = this.engine.combat?.getHealth?.(playerId);
        if (playerHealth && playerHealth.hp <= 0) {
          playerHealth.hp = playerHealth.maxHp;
          this.state.remainingCharges.self_medication--;
          this.engine.sceneManager?.events?.emit('self_medication_triggered', {
            remaining: this.state.remainingCharges.self_medication,
          });
        }
      }
    });

    if (u1) this.unsubs.push(u1);
  }

  setConfig(config: Partial<GobbleGumConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<GobbleGumConfig> {
    return this.config;
  }

  getState(): Readonly<GobbleGumState> {
    return this.state;
  }

  isGumActive(type: GobbleGumType): boolean {
    return this.config.enabled && (this.state.activeGums[type] ?? 0) > 0;
  }

  chewGum(type: GobbleGumType): boolean {
    if (!this.config.enabled || (this.state.remainingCharges[type] ?? 0) <= 0) {
      return false;
    }

    this.state.remainingCharges[type]--;

    if (type === 'perkaholic') {
      const perks = (this.engine.gameplayFeatures as any)?.perkVending;
      if (perks) {
        for (const p of ['juggernog', 'speed_cola', 'quick_revive', 'double_tap', 'stamin_up', 'deadshot', 'mule_kick'] as any[]) {
          perks.applyPerkEffects?.(p);
        }
      }
      this.engine.sceneManager?.events?.emit('perkaholic_activated', {});
    } else if (type === 'shopping_free') {
      this.state.activeGums.shopping_free = this.config.shoppingFreeDurationSec;
      this.engine.sceneManager?.events?.emit('shopping_free_started', { durationSec: this.config.shoppingFreeDurationSec });
    } else if (type === 'in_plain_sight') {
      this.state.activeGums.in_plain_sight = this.config.inPlainSightDurationSec;
      this.engine.sceneManager?.events?.emit('in_plain_sight_started', { durationSec: this.config.inPlainSightDurationSec });
    } else if (type === 'alchemical_antithesis') {
      this.state.activeGums.alchemical_antithesis = this.config.alchemicalDurationSec;
      this.engine.sceneManager?.events?.emit('alchemical_started', { durationSec: this.config.alchemicalDurationSec });
    }

    this.engine.audio?.play?.('/assets/audio/gobblegum_chew.wav', { volume: 0.9 });
    this.engine.sceneManager?.events?.emit('gobblegum_consumed', { type });

    return true;
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    for (const [key, remaining] of Object.entries(this.state.activeGums)) {
      const type = key as GobbleGumType;
      if (remaining > 0) {
        const next = remaining - dt;
        this.state.activeGums[type] = Math.max(0, next);
        if (next <= 0) {
          this.engine.sceneManager?.events?.emit('gobblegum_expired', { type });
        }
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
      remainingCharges: { ...this.state.remainingCharges },
      activeGums: { ...this.state.activeGums },
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    for (const key of Object.keys(this.state.activeGums) as GobbleGumType[]) this.state.activeGums[key] = 0;
    if (data.activeGums) Object.assign(this.state.activeGums, data.activeGums);
    if (typeof data.enabled === 'boolean') this.config.enabled = data.enabled;
    if (data.remainingCharges && typeof data.remainingCharges === 'object') {
      this.state.remainingCharges = { ...(data.remainingCharges as any) };
    }
  }
}
