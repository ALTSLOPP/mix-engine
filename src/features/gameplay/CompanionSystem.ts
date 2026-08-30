import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { CompanionSummonConfig } from './types';

export class CompanionSystem {
  private config: CompanionSummonConfig;
  private companionEntityId: EntityId | null = null;
  private attackTimer = 0;
  private healCooldownTimer = 0;
  private targetEnemyId: EntityId | null = null;

  private readonly _tempDir = new THREE.Vector3();
  private readonly _companionPos = new THREE.Vector3();
  private readonly _playerPos = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: CompanionSummonConfig) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<CompanionSummonConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { if (this.companionEntityId !== null) this.engine.sceneManager.requestDestroy(this.companionEntityId); this.companionEntityId = null; this.targetEnemyId = null; }
  }

  getConfig(): Readonly<CompanionSummonConfig> {
    return this.config;
  }

  get isSummoned(): boolean {
    return this.companionEntityId !== null;
  }

  summonCompanion(): boolean {
    if (!this.config.enabled) return false;

    if (this.companionEntityId !== null) {
      // Dismiss
      this.engine.sceneManager.requestDestroy(this.companionEntityId);
      this.companionEntityId = null;
      this.engine.sceneManager.events.emit('companion_dismissed', {});
      return false;
    }

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    const spawnPos = playerRb.mesh.position.clone().add(new THREE.Vector3(1.5, 0, 1.5));
    const compId = this.engine.sceneManager.spawnNow(spawnPos, {
      kind: 'box',
      params: { hx: 0.4, hy: 0.4, hz: 0.6, color: 0x00f0ff },
    });

    this.engine.sceneManager.addTag(compId, 'companion');
    this.engine.combat.addHealth(compId, 200, 'player');
    this.companionEntityId = compId;

    this.engine.burstVfx('magic', spawnPos, 20);
    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.8, loop: false });
    this.engine.sceneManager.events.emit('companion_summoned', { entityId: compId });
    return true;
  }

  update(dt: number): void {
    if (!this.config.enabled || this.companionEntityId === null) return;

    const compRb = this.engine.sceneManager.getRigidBody(this.companionEntityId);
    if (!compRb) {
      this.companionEntityId = null;
      return;
    }

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return;

    this._companionPos.copy(compRb.mesh.position);
    this._playerPos.copy(playerRb.mesh.position);

    // Emergency Revive/Heal Check (with 15s cooldown)
    if (this.healCooldownTimer > 0) {
      this.healCooldownTimer -= dt;
    }

    const playerHealth = this.engine.combat.getHealth(playerEntityId);
    if (
      this.healCooldownTimer <= 0 &&
      playerHealth &&
      (playerHealth.hp / playerHealth.maxHp) * 100 <= this.config.reviveThresholdHpPercent
    ) {
      playerHealth.hp = Math.min(playerHealth.maxHp, playerHealth.hp + 30);
      this.healCooldownTimer = 15.0;
      this.engine.burstVfx('heal', playerRb.mesh.position, 20);
      this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.9, loop: false });
      this.engine.sceneManager.events.emit('companion_healed_player', { amount: 30 });
    }

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
    }

    // Find closest enemy within aggro radius
    let closestDist = this.config.aggroRadius;
    this.targetEnemyId = null;

    const allEntities = this.engine.sceneManager.allEntityIds();
    for (const id of allEntities) {
      if (id === playerEntityId || id === this.companionEntityId) continue;
      if (!this.engine.sceneManager.hasTag(id, 'enemy')) continue;

      const enemyRb = this.engine.sceneManager.getRigidBody(id);
      if (!enemyRb) continue;

      const dist = this._companionPos.distanceTo(enemyRb.mesh.position);
      if (dist < closestDist) {
        closestDist = dist;
        this.targetEnemyId = id;
      }
    }

    if (this.targetEnemyId !== null && this.config.commandMode !== 'passive') {
      // Attack target enemy
      const enemyRb = this.engine.sceneManager.getRigidBody(this.targetEnemyId);
      if (enemyRb) {
        this._tempDir.subVectors(enemyRb.mesh.position, this._companionPos);
        const dist = this._tempDir.length();

        if (dist > 1.8) {
          this._tempDir.normalize();
          compRb.setNextKinematicTranslation(
            this._companionPos.clone().addScaledVector(this._tempDir, Math.min(6.0 * dt, dist - 1.8)),
          );
        } else if (this.attackTimer <= 0) {
          // Strike enemy
          this.engine.combat.applyDamage(this.companionEntityId, this.targetEnemyId, this.config.attackDamage);
          this.engine.burstVfx('sparks', enemyRb.mesh.position, 10);
          this.attackTimer = this.config.attackCooldown;
        }
      }
    }
 else {
      // Follow Player
      const distToPlayer = this._companionPos.distanceTo(this._playerPos);
      if (distToPlayer > this.config.followDistance) {
        this._tempDir.subVectors(this._playerPos, this._companionPos).normalize();
        compRb.setNextKinematicTranslation(
          this._companionPos.clone().addScaledVector(this._tempDir, Math.min(5.0 * dt, distToPlayer - this.config.followDistance)),
        );
      }
    }
  }
}
