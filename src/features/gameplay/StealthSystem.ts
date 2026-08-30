import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { StealthConfig } from './types';
import type { AnimationStateMachine } from '../../animation/AnimationStateMachine';

export class StealthSystem {
  private config: StealthConfig;
  private isCrouching = false;
  private readonly enemyDetectionLevels = new Map<EntityId, number>(); // 0.0 to 1.0
  private nearestBackstabTarget: EntityId | null = null;

  private readonly _playerPos = new THREE.Vector3();
  private readonly _enemyPos = new THREE.Vector3();
  private readonly _toPlayer = new THREE.Vector3();
  private readonly _enemyForward = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: StealthConfig) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<StealthConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.isCrouching = false; this.nearestBackstabTarget = null; this.enemyDetectionLevels.clear(); }
  }

  getConfig(): Readonly<StealthConfig> {
    return this.config;
  }

  get crouching(): boolean {
    return this.isCrouching;
  }

  get backstabTarget(): EntityId | null {
    return this.nearestBackstabTarget;
  }

  toggleCrouch(asm?: AnimationStateMachine | null): boolean {
    if (!this.config.enabled) return false;
    this.isCrouching = !this.isCrouching;

    if (asm) {
      if (this.isCrouching) {
        asm.transition('walk', 0.2);
      } else {
        asm.transition('idle', 0.2);
      }
    }

    this.engine.sceneManager.events.emit('stealth_stance_changed', {
      crouching: this.isCrouching,
    });
    return this.isCrouching;
  }

  executeBackstab(asm?: AnimationStateMachine | null): boolean {
    // Revalidate proximity and facing at input time, not just at the last HUD update.
    this.update(0);
    if (!this.config.enabled || this.nearestBackstabTarget === null) return false;

    const targetId = this.nearestBackstabTarget;
    const targetRb = this.engine.sceneManager.getRigidBody(targetId);
    if (!targetRb) return false;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    // Trigger critical assassination damage
    const baseDamage = 60;
    const critDamage = baseDamage * this.config.backstabDamageMultiplier;

    this.engine.combat.applyDamage(playerEntityId, targetId, critDamage);

    // Play execution animation
    if (asm) {
      asm.transition(this.config.executionAnimation, 0.1);
    }

    // Audio & Camera Shake
    this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 0.9, loop: false });
    this.engine.effects.shake({ trauma: 0.25, duration: 0.3 });
    this.engine.burstVfx('blood', targetRb.mesh.position, 20);

    this.engine.sceneManager.events.emit('stealth_backstab_success', {
      targetId,
      damage: critDamage,
    });

    this.nearestBackstabTarget = null;
    return true;
  }

  update(dt: number): void {
    if (!this.config.enabled) {
      this.nearestBackstabTarget = null;
      return;
    }

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) {
      this.nearestBackstabTarget = null;
      return;
    }

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) { this.nearestBackstabTarget = null; return; }

    this._playerPos.copy(playerRb.mesh.position);
    this.nearestBackstabTarget = null;
    let closestBackstabDist = Infinity;

    const allEntities = this.engine.sceneManager.allEntityIds();
    for (const id of allEntities) {
      if (id === playerEntityId) continue;
      const isEnemy = this.engine.sceneManager.hasTag(id, 'enemy');
      if (!isEnemy) continue;

      const enemyRb = this.engine.sceneManager.getRigidBody(id);
      if (!enemyRb) continue;
      const health = this.engine.combat.getHealth(id);
      if (!health || health.hp <= 0) continue;

      this._enemyPos.copy(enemyRb.mesh.position);
      this._toPlayer.subVectors(this._playerPos, this._enemyPos);
      const dist = this._toPlayer.length();

      if (dist > this.config.detectionRange) {
        this.enemyDetectionLevels.set(id, 0);
        continue;
      }

      this._toPlayer.y = 0;
      this._toPlayer.normalize();

      // Enemy forward direction
      this._enemyForward.set(0, 0, 1).applyQuaternion(enemyRb.mesh.quaternion);
      this._enemyForward.y = 0;
      this._enemyForward.normalize();

      const dot = this._enemyForward.dot(this._toPlayer);
      const angleDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dot, -1, 1)));

      // 1. Detection Meter Progression (if player is in front vision cone)
      let currentAwareness = this.enemyDetectionLevels.get(id) ?? 0;
      if (angleDeg <= this.config.detectionAngle * 0.5) {
        const detectionSpeed = this.isCrouching ? this.config.detectionSpeed * 0.4 : this.config.detectionSpeed;
        currentAwareness = Math.min(1.0, currentAwareness + detectionSpeed * dt);
      } else {
        currentAwareness = Math.max(0.0, currentAwareness - dt * 0.5);
      }
      this.enemyDetectionLevels.set(id, currentAwareness);

      // 2. Check Backstab Opportunity (behind enemy: dot < -0.5, within backstabRange, and enemy unaware)
      if (
        dist <= this.config.backstabRange &&
        angleDeg >= 180 - this.config.backstabAngleThreshold &&
        currentAwareness < 0.6 &&
        dist < closestBackstabDist
      ) {
        closestBackstabDist = dist;
        this.nearestBackstabTarget = id;
      }
    }
  }
}
