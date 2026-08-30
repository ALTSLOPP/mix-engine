import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import { setGameplaySlowMotion } from './GameplaySlowMotion';
import type { TimeMechanicsConfig } from './types';

interface TimeSnapshot {
  time: number;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  hp: number;
}

export class TimeMechanicsSystem {
  private readonly unsubscribe: Array<() => void> = [];

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  private config: TimeMechanicsConfig;
  private isBulletTimeActive = false;
  private bulletTimeTimer = 0;
  private elapsed = 0;
  private recordedPlayerId: number | null = null;
  private bulletTimeCooldownTimer = 0;
  private readonly historySnapshots: TimeSnapshot[] = [];

  constructor(private readonly engine: Engine, initialConfig: TimeMechanicsConfig) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  setConfig(config: Partial<TimeMechanicsConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) this.historySnapshots.length = 0;
    else if (this.isBulletTimeActive) setGameplaySlowMotion(this.engine.timeDilation, this, this.config.bulletTimeScale);
    if (!this.config.enabled && this.isBulletTimeActive) {
      this.deactivateBulletTime();
    }
  }

  getConfig(): Readonly<TimeMechanicsConfig> {
    return this.config;
  }

  get inBulletTime(): boolean {
    return this.isBulletTimeActive;
  }

  get cooldownRemaining(): number {
    return this.bulletTimeCooldownTimer;
  }

  private bindEvents(): void {
    // Trigger bullet time on perfect dodge / parry if enabled
    this.unsubscribe.push(this.engine.sceneManager.events.on('parry_success', () => {
      if (this.config.enabled && this.config.triggerOnPerfectDodge && this.bulletTimeCooldownTimer <= 0) {
        this.activateBulletTime();
      }
    }));
  }

  activateBulletTime(): boolean {
    if (!this.config.enabled || this.isBulletTimeActive || this.bulletTimeCooldownTimer > 0) {
      return false;
    }

    this.isBulletTimeActive = true;
    this.bulletTimeTimer = this.config.bulletTimeDuration;
    this.bulletTimeCooldownTimer = this.config.bulletTimeCooldown;

    // Slow down global time scale
    setGameplaySlowMotion(this.engine.timeDilation, this, this.config.bulletTimeScale);

    this.engine.effects.flash({ color: '#00f0ff', duration: 0.2 });
    this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 0.6, loop: false });
    return true;
  }

  deactivateBulletTime(): void {
    if (!this.isBulletTimeActive) return;
    this.isBulletTimeActive = false;
    setGameplaySlowMotion(this.engine.timeDilation, this, null);
  }

  rewindTime(): boolean {
    if (!this.config.enabled || this.historySnapshots.length < 2) return false;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null || playerEntityId !== this.recordedPlayerId) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    // Grab state from 3 seconds ago
    const oldestSnapshot = this.historySnapshots[0];
    playerRb.setNextKinematicTranslation(oldestSnapshot.position);
    playerRb.setNextKinematicRotation(oldestSnapshot.rotation);

    const health = this.engine.combat.getHealth(playerEntityId);
    if (health) health.hp = Math.min(health.maxHp, Math.max(health.hp, oldestSnapshot.hp));

    this.engine.burstVfx('magic', oldestSnapshot.position, 25);
    this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 0.9, loop: false });
    this.historySnapshots.length = 0;
    return true;
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (this.bulletTimeCooldownTimer > 0) {
      this.bulletTimeCooldownTimer = Math.max(0, this.bulletTimeCooldownTimer - dt);
    }

    if (this.isBulletTimeActive) {
      this.bulletTimeTimer -= dt;
      if (this.bulletTimeTimer <= 0) {
        this.deactivateBulletTime();
      }
    }

    // Record position snapshots for rewind buffer
    this.elapsed += dt;
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId !== this.recordedPlayerId) {
      this.historySnapshots.length = 0;
      this.recordedPlayerId = playerEntityId;
    }
    if (playerEntityId !== null) {
      const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
      const health = this.engine.combat.getHealth(playerEntityId);
      if (playerRb && health) {
        this.historySnapshots.push({
          time: this.elapsed,
          position: playerRb.mesh.position.clone(),
          rotation: playerRb.mesh.quaternion.clone(),
          hp: health.hp,
        });

        // Retain max snapshots covering rewindDuration
        while (this.historySnapshots.length > 1 && this.historySnapshots[0].time < this.elapsed - this.config.rewindDuration) {
          this.historySnapshots.shift();
        }
      }
    }
  }
}
