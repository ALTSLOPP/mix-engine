import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { BloodstainData, BloodstainSoulsConfig, BloodstainState } from './types';

export class BloodstainSystem {
  private readonly unsubscribe: Array<() => void> = [];

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  private config: BloodstainSoulsConfig;
  private readonly state: BloodstainState = {
    activeBloodstain: null,
    totalCollectedSouls: 0,
  };

  private readonly _playerPos = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: BloodstainSoulsConfig) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  setConfig(config: Partial<BloodstainSoulsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<BloodstainSoulsConfig> {
    return this.config;
  }

  getState(): Readonly<BloodstainState> {
    return this.state;
  }

  get souls(): number {
    return this.state.totalCollectedSouls;
  }

  get hasBloodstain(): boolean {
    return this.state.activeBloodstain !== null;
  }

  get bloodstain(): BloodstainData | null {
    return this.state.activeBloodstain;
  }

  addSouls(amount: number): void {
    if (!this.config.enabled || !Number.isFinite(amount) || amount <= 0) return;
    this.state.totalCollectedSouls += amount;
    this.engine.sceneManager.events.emit('souls_gained', { amount, total: this.state.totalCollectedSouls });
  }

  spendSouls(amount: number): boolean {
    if (!this.config.enabled || !Number.isFinite(amount) || amount <= 0 || this.state.totalCollectedSouls < amount) return false;
    this.state.totalCollectedSouls -= amount;
    this.engine.sceneManager.events.emit('souls_spent', { amount, remaining: this.state.totalCollectedSouls });
    return true;
  }

  private bindEvents(): void {
    this.unsubscribe.push(this.engine.sceneManager.events.on('player_death', () => {
      if (!this.config.enabled) return;
      this.onPlayerDeath();
    }));

    this.unsubscribe.push(this.engine.sceneManager.events.on('combat_death', (payload: any) => {
      if (!this.config.enabled) return;
      const id = payload?.entityId;
      const playerId = this.engine.player.getPossessedId();
      const credited = payload?.attackerId === playerId || this.engine.sceneManager.hasTag(payload?.attackerId, 'companion');
      if (playerId !== null && credited && id !== undefined && this.engine.sceneManager.hasTag(id, 'enemy')) {
        this.addSouls(50);
      }
    }));
  }

  onPlayerDeath(): void {
    if (!this.config.enabled) return;
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    const deathPos = playerRb ? playerRb.mesh.position.clone() : new THREE.Vector3();

    if (this.state.activeBloodstain !== null) {
      // Overwrite / lose old bloodstain
      this.engine.sceneManager.events.emit('bloodstain_lost', { lostSouls: this.state.activeBloodstain.soulsAmount });
    }

    const droppedSouls = this.state.totalCollectedSouls;
    this.state.totalCollectedSouls = 0;

    this.state.activeBloodstain = {
      position: deathPos,
      soulsAmount: droppedSouls,
      timestamp: Date.now(),
    };

    this.engine.burstVfx('magic', deathPos, 25);
    this.engine.sceneManager.events.emit('bloodstain_dropped', { bloodstain: this.state.activeBloodstain });
  }

  recoverBloodstain(): boolean {
    if (!this.config.enabled || !this.state.activeBloodstain) return false;

    const recovered = this.state.activeBloodstain.soulsAmount;
    this.state.totalCollectedSouls += recovered;
    const pos = this.state.activeBloodstain.position;
    this.state.activeBloodstain = null;

    this.engine.burstVfx('glow', pos, 30);
    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.9, loop: false });
    this.engine.sceneManager.events.emit('bloodstain_recovered', { recoveredSouls: recovered });
    return true;
  }

  update(_dt: number): void {
    if (!this.config.enabled || !this.state.activeBloodstain) return;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return;

    const health = this.engine.combat.getHealth(playerEntityId);
    if (!health || health.hp <= 0) return;
    this._playerPos.copy(playerRb.mesh.position);
    if (this._playerPos.distanceTo(this.state.activeBloodstain.position) <= this.config.pickupRadius) {
      this.recoverBloodstain();
    }
  }
}
