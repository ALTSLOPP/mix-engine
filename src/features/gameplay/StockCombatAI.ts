import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { CoverNode } from './CoverPeekingSystem';

export type CombatAIArchetype = 'grunt' | 'heavy' | 'mage' | 'boss' | 'shooter';

export interface CombatAIConfig {
  archetype: CombatAIArchetype;
  aggroRadius: number;
  attackRange: number;
  circlingRadius: number;
  circlingSpeed: number;
  moveSpeed: number;
  attackCooldown: number;
  windupDuration: number;
  attackDamage: number;
  poiseDamage: number;
  knockbackForce: number;
  attackAnimation: string;
  telegraphRadius?: number;
  expReward: number;
}

export const STOCK_COMBAT_ARCHETYPES: Record<CombatAIArchetype, CombatAIConfig> = {
  grunt: {
    archetype: 'grunt',
    aggroRadius: 18.0,
    attackRange: 2.2,
    circlingRadius: 4.5,
    circlingSpeed: 1.5,
    moveSpeed: 3.5,
    attackCooldown: 2.0,
    windupDuration: 0.35,
    attackDamage: 15,
    poiseDamage: 20,
    knockbackForce: 4.0,
    attackAnimation: 'Hook Punch',
    expReward: 35,
  },
  heavy: {
    archetype: 'heavy',
    aggroRadius: 16.0,
    attackRange: 3.0,
    circlingRadius: 5.0,
    circlingSpeed: 0.8,
    moveSpeed: 2.2,
    attackCooldown: 3.2,
    windupDuration: 0.8,
    attackDamage: 38,
    poiseDamage: 65,
    knockbackForce: 10.0,
    attackAnimation: 'Great Sword Slash',
    telegraphRadius: 3.2,
    expReward: 80,
  },
  mage: {
    archetype: 'mage',
    aggroRadius: 22.0,
    attackRange: 14.0,
    circlingRadius: 10.0,
    circlingSpeed: 1.2,
    moveSpeed: 2.8,
    attackCooldown: 4.0,
    windupDuration: 1.0,
    attackDamage: 30,
    poiseDamage: 30,
    knockbackForce: 6.0,
    attackAnimation: 'Standing 2H Magic Attack 03',
    telegraphRadius: 2.5,
    expReward: 65,
  },
  boss: {
    archetype: 'boss',
    aggroRadius: 30.0,
    attackRange: 4.0,
    circlingRadius: 6.0,
    circlingSpeed: 1.0,
    moveSpeed: 3.2,
    attackCooldown: 2.5,
    windupDuration: 0.6,
    attackDamage: 50,
    poiseDamage: 90,
    knockbackForce: 14.0,
    attackAnimation: 'Punch To Elbow Combo',
    telegraphRadius: 4.5,
    expReward: 500,
  },
  shooter: {
    archetype: 'shooter',
    aggroRadius: 32.0,
    attackRange: 22.0,
    circlingRadius: 14.0,
    circlingSpeed: 1.4,
    moveSpeed: 3.8,
    attackCooldown: 2.2,
    windupDuration: 0.25,
    attackDamage: 24,
    poiseDamage: 25,
    knockbackForce: 5.0,
    attackAnimation: 'firing rifle',
    expReward: 60,
  },
};

export class StockCombatAIController {
  private readonly unsubscribe: Array<() => void> = [];

  private state: 'idle' | 'approach' | 'circle' | 'windup' | 'attack' | 'recover' | 'cover_seek' | 'in_cover' | 'peek_fire' | 'reloading' | 'dead' = 'idle';
  private stateTimer = 0;
  private attackCooldownTimer = 0;
  private circleAngle = Math.random() * Math.PI * 2;
  private hasTelegraphed = false;
  private reservedCover: CoverNode | null = null;
  private burstShotsRemaining = 0;
  private burstTimer = 0;

  private readonly _tempVec = new THREE.Vector3();
  private readonly _toPlayer = new THREE.Vector3();

  constructor(
    private readonly engine: Engine,
    public readonly entityId: EntityId,
    private config: CombatAIConfig = STOCK_COMBAT_ARCHETYPES.grunt,
  ) {
    this.bindEvents();
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    this.releaseCover();
    this.engine.gameplayFeatures?.encounterAI.releaseAttackToken(this.entityId);
    this.engine.gameplayFeatures?.hitboxes.closeHitboxesForEntity(this.entityId);
    this.state = 'dead';
  }

  setConfig(config: Partial<CombatAIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<CombatAIConfig> {
    return this.config;
  }

  getState(): string {
    return this.state;
  }

  private releaseCover(): void {
    if (this.reservedCover) {
      this.engine.gameplayFeatures?.cover.releaseCover(this.reservedCover.id);
      this.reservedCover = null;
    }
  }

  private bindEvents(): void {
    // Stagger reaction
    this.unsubscribe.push(this.engine.sceneManager.events.on('gameplay_stagger', (e: any) => {
      if (e?.targetId === this.entityId) {
        this.state = 'recover';
        this.stateTimer = e.duration ?? 1.2;
        if (this.engine.gameplayFeatures?.isFeatureEnabled('enemy_boss_ai')) {
          this.engine.gameplayFeatures.encounterAI.releaseAttackToken(this.entityId);
        }
      }
    }));

    // Death
    this.unsubscribe.push(this.engine.sceneManager.events.on('combat_death', (e: any) => {
      if (e?.entityId === this.entityId) {
        this.onDeath();
      }
    }));
  }

  private onDeath(): void {
    this.state = 'dead';
    this.releaseCover();
    this.engine.gameplayFeatures?.encounterAI.releaseAttackToken(this.entityId);
    this.engine.gameplayFeatures?.hitboxes.closeHitboxesForEntity(this.entityId);

    const rb = this.engine.sceneManager.getRigidBody(this.entityId);
    if (rb) {
      const asm = this.engine.findAnimationStateMachine(rb);
      if (asm) asm.transition('die', 0.2);
    }
  }

  update(dt: number): void {
    if (this.state === 'dead') return;

    const selfRb = this.engine.sceneManager.getRigidBody(this.entityId);
    if (!selfRb) {
      this.onDeath();
      return;
    }

    const health = this.engine.combat.getHealth(this.entityId);
    if (health && health.hp <= 0) {
      this.onDeath();
      return;
    }

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return;
    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return;

    const selfPos = selfRb.mesh.position;
    const playerPos = playerRb.mesh.position;

    this._toPlayer.subVectors(playerPos, selfPos);
    this._toPlayer.y = 0;
    const distToPlayer = this._toPlayer.length();

    if (distToPlayer > this.config.aggroRadius) {
      this.engine.gameplayFeatures?.encounterAI.releaseAttackToken(this.entityId);
      this.state = 'idle';
      this.releaseCover();
      return;
    }

    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= dt;
    }

    // Orient towards player
    if (distToPlayer > 0.1 && this.state !== 'recover' && this.state !== 'in_cover') {
      const targetAngle = Math.atan2(this._toPlayer.x, this._toPlayer.z);
      const delta = Math.atan2(Math.sin(targetAngle - selfRb.mesh.rotation.y), Math.cos(targetAngle - selfRb.mesh.rotation.y));
      selfRb.mesh.rotation.y += delta * Math.min(1, dt * 8);
      selfRb.setNextKinematicRotation(selfRb.mesh.quaternion);
    }

    const asm = this.engine.findAnimationStateMachine(selfRb);
    const encounterAI = this.engine.gameplayFeatures?.encounterAI;
    const coverSystem = this.engine.gameplayFeatures?.cover;

    // Shooter Cover-Aware AI Logic
    if (this.config.archetype === 'shooter') {
      switch (this.state) {
        case 'idle':
        case 'approach': {
          // Check if cover is nearby and player is visible
          if (coverSystem) {
            const bestCover = coverSystem.findBestCover(selfPos, playerPos, this.entityId);
            if (bestCover && coverSystem.reserveCover(bestCover.id, this.entityId)) {
              this.reservedCover = bestCover;
              this.state = 'cover_seek';
              break;
            }
          }
          if (distToPlayer <= this.config.attackRange) {
            this.state = 'peek_fire';
            this.burstShotsRemaining = 3;
            this.burstTimer = 0.15;
          } else {
            this._toPlayer.normalize().multiplyScalar(this.config.moveSpeed * dt);
            selfRb.setNextKinematicTranslation(selfPos.clone().add(this._toPlayer));
            if (asm) asm.transition('run', 0.2);
          }
          break;
        }

        case 'cover_seek': {
          if (!this.reservedCover) {
            this.state = 'approach';
            break;
          }
          const toCover = this.reservedCover.position.clone().sub(selfPos);
          toCover.y = 0;
          const distToCover = toCover.length();

          if (distToCover <= 0.8) {
            this.state = 'in_cover';
            this.stateTimer = 1.8; // stay in cover before peeking
            if (asm) asm.transition('idle', 0.2);
          } else {
            toCover.normalize().multiplyScalar(this.config.moveSpeed * dt);
            selfRb.setNextKinematicTranslation(selfPos.clone().add(toCover));
            if (asm) asm.transition('run', 0.2);
          }
          break;
        }

        case 'in_cover': {
          this.stateTimer -= dt;
          if (this.stateTimer <= 0) {
            this.state = 'peek_fire';
            this.burstShotsRemaining = 3;
            this.burstTimer = 0.15;
          }
          break;
        }

        case 'peek_fire': {
          this.burstTimer -= dt;
          if (this.burstTimer <= 0) {
            this.burstTimer = 0.15;
            this.burstShotsRemaining--;

            // Line-of-sight check against solid geometry
            const eyePos = selfPos.clone().add(new THREE.Vector3(0, 1.6, 0));
            const targetEye = playerPos.clone().add(new THREE.Vector3(0, 1.4, 0));
            const dir = targetEye.clone().sub(eyePos).normalize();
            const hit = this.engine.physicsWorld.raycastExcludeBody(eyePos, dir, distToPlayer, selfRb.rapierBody);

            if (!hit || hit.toi >= distToPlayer - 0.4) {
              // Clear line of sight: fire shot
              this.engine.burstVfx('muzzle_flash', eyePos.clone().addScaledVector(dir, 0.5), 6);
              this.engine.audio.play('/assets/fps-starter/audio/ak47-single.wav', { volume: 0.7, loop: false });
              this.engine.combat.applyDamage(this.entityId, playerEntityId, this.config.attackDamage);
            }

            if (asm) asm.transition(this.config.attackAnimation, 0.05);

            if (this.burstShotsRemaining <= 0) {
              this.state = 'reloading';
              this.stateTimer = 2.0;
            }
          }
          break;
        }

        case 'reloading': {
          this.stateTimer -= dt;
          if (this.stateTimer <= 0) {
            if (this.reservedCover) {
              this.state = 'in_cover';
              this.stateTimer = 1.5;
            } else {
              this.state = 'approach';
            }
          }
          break;
        }
      }
      return;
    }

    // Standard Melee / Grunt / Boss Combat AI
    switch (this.state) {
      case 'idle':
      case 'approach': {
        if (distToPlayer <= this.config.attackRange && this.attackCooldownTimer <= 0) {
          const hasToken = encounterAI ? encounterAI.requestAttackToken(this.entityId) : true;
          if (hasToken) {
            this.state = 'windup';
            this.stateTimer = this.config.windupDuration;
            this.hasTelegraphed = false;
            if (asm) asm.transition('idle', 0.15);
          } else {
            this.state = 'circle';
          }
        } else if (distToPlayer > this.config.attackRange) {
          this._toPlayer.normalize().multiplyScalar(this.config.moveSpeed * dt);
          const nextPos = selfPos.clone().add(this._toPlayer);
          selfRb.setNextKinematicTranslation(nextPos);
          if (asm) asm.transition('run', 0.2);
        } else {
          this.state = 'circle';
        }
        break;
      }

      case 'circle': {
        this.circleAngle += this.config.circlingSpeed * dt;
        const targetX = playerPos.x + Math.cos(this.circleAngle) * this.config.circlingRadius;
        const targetZ = playerPos.z + Math.sin(this.circleAngle) * this.config.circlingRadius;
        this._tempVec.set(targetX - selfPos.x, 0, targetZ - selfPos.z);
        const moveLen = this._tempVec.length();

        if (moveLen > 0.2) {
          this._tempVec.normalize().multiplyScalar(this.config.moveSpeed * 0.7 * dt);
          selfRb.setNextKinematicTranslation(selfPos.clone().add(this._tempVec));
          if (asm) asm.transition('walk', 0.2);
        }

        if (this.attackCooldownTimer <= 0) {
          const hasToken = encounterAI ? encounterAI.requestAttackToken(this.entityId) : true;
          if (hasToken) {
            this.state = 'approach';
          }
        }
        break;
      }

      case 'windup': {
        this.stateTimer -= dt;
        if (!this.hasTelegraphed && this.config.telegraphRadius && this.config.telegraphRadius > 0) {
          this.hasTelegraphed = true;
          if (encounterAI) {
            encounterAI.spawnTelegraph(
              this.entityId,
              playerPos.clone(),
              this.config.telegraphRadius,
              this.config.windupDuration
            );
          }
        }

        if (this.stateTimer <= 0) {
          this.state = 'attack';
          this.stateTimer = 0.5;
          if (asm) asm.transition(this.config.attackAnimation, 0.1);
        }
        break;
      }

      case 'attack': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (distToPlayer <= this.config.attackRange + 0.8) {
            this.engine.combat.applyDamage(this.entityId, playerEntityId, this.config.attackDamage);
          }
          this.state = 'recover';
          this.stateTimer = 0.6;
          this.attackCooldownTimer = this.config.attackCooldown;
          if (encounterAI) encounterAI.releaseAttackToken(this.entityId);
        }
        break;
      }

      case 'recover': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'circle';
        }
        break;
      }
    }
  }
}
