import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { AnimationStateMachine } from '../../animation/AnimationStateMachine';
import type { PostureState, PostureVisceralConfig } from './types';

export class PostureVisceralSystem {
  private readonly unsubscribe: Array<() => void> = [];

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  private config: PostureVisceralConfig;
  private readonly entityPostures = new Map<EntityId, PostureState>();
  private readonly _playerPos = new THREE.Vector3();
  private readonly _targetPos = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: PostureVisceralConfig) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  setConfig(config: Partial<PostureVisceralConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.entityPostures.clear(); }
  }

  getConfig(): Readonly<PostureVisceralConfig> {
    return this.config;
  }

  getPosture(entityId: EntityId): PostureState | undefined {
    return this.entityPostures.get(entityId);
  }

  private getOrCreatePosture(entityId: EntityId): PostureState {
    let state = this.entityPostures.get(entityId);
    if (!state) {
      state = {
        currentPosture: 0,
        maxPosture: this.config.maxPosture,
        isBroken: false,
        breakTimer: 0,
        decayDelayTimer: 0,
      };
      this.entityPostures.set(entityId, state);
    }
    return state;
  }

  private bindEvents(): void {
    this.unsubscribe.push(this.engine.sceneManager.events.on('gameplay_hit', (hit: any) => {
      if (hit?.targetId != null && hit.poiseDamage > 0) this.applyPostureDamage(hit.targetId, hit.poiseDamage);
    }));
    // Parries deal massive posture damage
    this.unsubscribe.push(this.engine.sceneManager.events.on('parry_success', (payload: any) => {
      if (!this.config.enabled) return;
      const attackerId = payload?.attackerId;
      if (attackerId !== undefined && attackerId !== null) {
        this.applyPostureDamage(attackerId, this.config.parryPostureDamage);
      }
    }));
  }

  applyPostureDamage(entityId: EntityId, amount: number): boolean {
    if (!this.config.enabled || !Number.isFinite(amount) || amount <= 0) return false;

    const posture = this.getOrCreatePosture(entityId);
    if (posture.isBroken) return false;

    posture.currentPosture = Math.min(posture.maxPosture, posture.currentPosture + amount);
    posture.decayDelayTimer = this.config.postureDecayDelay;

    this.engine.sceneManager.events.emit('posture_damaged', {
      entityId,
      current: posture.currentPosture,
      max: posture.maxPosture,
    });

    if (posture.currentPosture >= posture.maxPosture) {
      this.breakPosture(entityId, posture);
      return true;
    }

    return false;
  }

  private breakPosture(entityId: EntityId, posture: PostureState): void {
    posture.isBroken = true;
    posture.breakTimer = this.config.vulnerableDuration;

    const rb = this.engine.sceneManager.getRigidBody(entityId);
    if (rb) {
      this.engine.burstVfx('sparks', rb.mesh.position, 25);
      this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 1.0, loop: false });
    }

    this.engine.sceneManager.events.emit('posture_broken', { entityId });
  }

  getExecutableTarget(): EntityId | null {
    if (!this.config.enabled) return null;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return null;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return null;

    this._playerPos.copy(playerRb.mesh.position);

    for (const [entityId, state] of this.entityPostures) {
      if (!state.isBroken || entityId === playerEntityId) continue;

      const rb = this.engine.sceneManager.getRigidBody(entityId);
      if (!rb) continue;

      this._targetPos.copy(rb.mesh.position);
      if (this._playerPos.distanceTo(this._targetPos) <= this.config.visceralRange) {
        return entityId;
      }
    }
    return null;
  }

  executeVisceral(asm?: AnimationStateMachine | null): boolean {
    if (!this.config.enabled) return false;

    const targetId = this.getExecutableTarget();
    if (targetId === null) return false;

    const playerEntityId = this.engine.player.getPossessedId();
    const targetRb = this.engine.sceneManager.getRigidBody(targetId);
    if (!targetRb) return false;

    // Reset posture
    const posture = this.entityPostures.get(targetId);
    if (posture) {
      posture.isBroken = false;
      posture.currentPosture = 0;
      posture.breakTimer = 0;
    }

    // Play Execution Animation & Invulnerability
    if (asm) {
      asm.transition('Great Sword Slash', 0.1);
    }

    const baseDamage = 100;
    const criticalDamage = Math.round(baseDamage * this.config.visceralDamageMultiplier);

    this.engine.effects.shake({ trauma: 0.5, duration: 0.4 });
    this.engine.burstVfx('blood', targetRb.mesh.position, 40);
    this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 1.0, loop: false });

    this.engine.combat.applyDamage(playerEntityId, targetId, criticalDamage);
    this.engine.sceneManager.events.emit('visceral_executed', {
      targetId,
      damage: criticalDamage,
    });
    return true;
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    for (const [entityId, state] of this.entityPostures) {
      if (!this.engine.sceneManager.getRigidBody(entityId)) { this.entityPostures.delete(entityId); continue; }
      if (state.isBroken) {
        state.breakTimer -= dt;
        if (state.breakTimer <= 0) {
          state.isBroken = false;
          state.currentPosture = 0;
        }
      } else if (state.currentPosture > 0) {
        if (state.decayDelayTimer > 0) {
          state.decayDelayTimer -= dt;
        } else {
          state.currentPosture = Math.max(0, state.currentPosture - this.config.postureDecayRate * dt);
        }
      }
    }
  }
}
