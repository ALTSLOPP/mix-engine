import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { BonfireCheckpointConfig, BonfireDef, BonfireState } from './types';

export class BonfireCheckpointSystem {
  private config: BonfireCheckpointConfig;
  private readonly state: BonfireState = {
    lastRestedBonfireId: null,
    isResting: false,
    discoveredCount: 0,
  };

  private readonly _playerPos = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: BonfireCheckpointConfig) {
    this.config = { ...initialConfig, bonfires: initialConfig.bonfires.map(b => ({ ...b, position: new THREE.Vector3(b.position.x, b.position.y, b.position.z) })) };
    this.state.discoveredCount = this.config.bonfires.filter((b) => b.discovered).length;
  }

  setConfig(config: Partial<BonfireCheckpointConfig>): void {
    this.config = { ...this.config, ...config, bonfires: (config.bonfires ?? this.config.bonfires).map(b => ({ ...b, position: new THREE.Vector3(b.position.x, b.position.y, b.position.z) })) };
    this.state.discoveredCount = this.config.bonfires.filter(b => b.discovered).length;
    if (!this.config.enabled) { this.leaveBonfire(); }
  }

  getConfig(): Readonly<BonfireCheckpointConfig> {
    return this.config;
  }

  getState(): Readonly<BonfireState> {
    return this.state;
  }

  get bonfires(): readonly BonfireDef[] {
    return this.config.bonfires;
  }

  get isResting(): boolean {
    return this.state.isResting;
  }

  getNearbyBonfire(): BonfireDef | null {
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return null;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return null;

    this._playerPos.copy(playerRb.mesh.position);

    for (const b of this.config.bonfires) {
      if (this._playerPos.distanceTo(b.position) <= this.config.interactionRadius) {
        return b;
      }
    }
    return null;
  }

  restAtBonfire(bonfireId?: string): boolean {
    if (!this.config.enabled) return false;

    const targetBonfire = bonfireId
      ? this.config.bonfires.find((b) => b.id === bonfireId)
      : this.getNearbyBonfire();

    if (!targetBonfire) return false;

    targetBonfire.discovered = true;
    this.state.lastRestedBonfireId = targetBonfire.id;
    this.state.isResting = true;
    this.state.discoveredCount = this.config.bonfires.filter((b) => b.discovered).length;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId !== null) {
      // 1. Heal Player
      if (this.config.healOnRest) {
        const health = this.engine.combat.getHealth(playerEntityId);
        if (health) health.hp = health.maxHp;
      }

      // 2. Restore Flasks
      if (this.config.restoreFlasksOnRest && this.engine.gameplayFeatures?.flasks) {
        this.engine.gameplayFeatures.flasks.refillFlasks();
      }

      // 3. Restore MP
      if (this.engine.gameplayFeatures?.abilities) {
        this.engine.gameplayFeatures.abilities.restoreMp(this.engine.gameplayFeatures.abilities.maxMp);
      }
    }

    // 4. VFX & Audio
    this.engine.burstVfx('fire', targetBonfire.position, 25);
    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.8, loop: false });

    // 5. Emit Events (e.g. to respawn non-boss world enemies)
    this.engine.sceneManager.events.emit('bonfire_rested', { bonfire: targetBonfire });
    if (this.config.respawnEnemiesOnRest) {
      this.engine.sceneManager.events.emit('bonfire_respawn_enemies', {});
    }

    return true;
  }

  leaveBonfire(): void {
    if (!this.state.isResting) return;
    this.state.isResting = false;
    this.engine.sceneManager.events.emit('bonfire_left', {});
  }

  fastTravel(bonfireId: string): boolean {
    if (!this.config.enabled) return false;
    const bonfire = this.config.bonfires.find((b) => b.id === bonfireId && b.discovered);
    if (!bonfire) return false;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    playerRb.setNextKinematicTranslation(bonfire.position.clone().add(new THREE.Vector3(0, 0.5, 1.0)));
    this.restAtBonfire(bonfire.id);
    return true;
  }

  update(_dt: number): void {
    // Proximity beacon VFX could tick here
  }
}
