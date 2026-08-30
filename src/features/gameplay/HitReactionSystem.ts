import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { HitReactionConfig, HitReactionState, HitReactionType } from './types';

export class HitReactionSystem {
  private readonly unsubscribe: Array<() => void> = [];

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  private config: HitReactionConfig;
  private readonly entityStates = new Map<EntityId, HitReactionState>();

  constructor(private readonly engine: Engine, initialConfig: HitReactionConfig) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  setConfig(config: Partial<HitReactionConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.entityStates.clear(); }
  }

  getConfig(): Readonly<HitReactionConfig> {
    return this.config;
  }

  private bindEvents(): void {
    this.unsubscribe.push(this.engine.sceneManager.events.on('gameplay_hit', (payload: any) => {
      if (!this.config.enabled || payload?.targetId == null) return;
      this.applyHitImpact(
        payload.targetId,
        payload.damage ?? 20,
        payload.poiseDamage ?? 25,
        payload.knockbackForce ?? 5,
        payload.knockbackDir,
      );
    }));

    this.unsubscribe.push(this.engine.sceneManager.events.on('gameplay_stagger', (payload: any) => {
      if (!this.config.enabled || payload?.targetId == null) return;
      this.triggerReaction(payload.targetId, payload.reactionType ?? 'stagger', payload.duration ?? 1.5);
    }));
  }

  getOrCreateState(entityId: EntityId): HitReactionState {
    let state = this.entityStates.get(entityId);
    if (!state) {
      state = {
        currentPoise: this.config.defaultPoise,
        poiseRegenDelayRemaining: 0,
        reactionType: 'none',
        reactionTimeRemaining: 0,
        knockbackVelocity: new THREE.Vector3(),
        isLaunched: false,
        isGrounded: true,
      };
      this.entityStates.set(entityId, state);
    }
    return state;
  }

  applyHitImpact(
    targetId: EntityId,
    damage: number,
    poiseDamage: number,
    knockbackForce: number,
    knockbackDir?: THREE.Vector3,
  ): void {
    if (!this.config.enabled) return;

    const state = this.getOrCreateState(targetId);
    state.currentPoise -= poiseDamage;
    state.poiseRegenDelayRemaining = this.config.poiseRegenDelay;

    const targetRb = this.engine.sceneManager.getRigidBody(targetId);
    if (!targetRb) return;

    // Hitstop freeze
    if (this.config.hitstopDuration > 0) {
      this.engine.timeDilation.triggerHitstop?.({ targetEntityIds: [targetId], timeScale: 0.1, durationMs: this.config.hitstopDuration * 1000 });
    }

    // Determine reaction type based on poise break
    if (state.currentPoise <= 0) {
      // Poise broken! Heavy Stagger or Launch
      state.currentPoise = this.config.defaultPoise;

      if (knockbackForce > 10.0) {
        // Vertical launch into juggle
        this.triggerLaunch(targetId, state, knockbackForce, knockbackDir);
      } else {
        this.triggerReaction(targetId, 'stagger', 1.2);
        if (knockbackDir) {
          state.knockbackVelocity.copy(knockbackDir).multiplyScalar(knockbackForce);
        }
      }
    } else {
      // Poise held: minor flinch or armor through
      if (damage > 30) {
        this.triggerReaction(targetId, 'flinch_light', 0.35);
      }
      if (knockbackDir) {
        state.knockbackVelocity.copy(knockbackDir).multiplyScalar(knockbackForce * 0.4);
      }
    }
  }

  triggerReaction(entityId: EntityId, type: HitReactionType, duration: number): void {
    const state = this.getOrCreateState(entityId);
    state.reactionType = type;
    state.reactionTimeRemaining = duration;

    const rb = this.engine.sceneManager.getRigidBody(entityId);
    if (!rb) return;

    const asm = this.engine.findAnimationStateMachine(rb);
    if (asm) {
      if (type === 'flinch_light' || type === 'flinch_heavy') {
        asm.transition('hit', 0.08);
      } else if (type === 'stagger') {
        asm.transition('hit', 0.12);
      } else if (type === 'knockdown') {
        asm.transition('die', 0.15);
      }
    }
  }

  private triggerLaunch(
    entityId: EntityId,
    state: HitReactionState,
    force: number,
    dir?: THREE.Vector3,
  ): void {
    state.isLaunched = true;
    state.isGrounded = false;
    state.reactionType = 'launch';
    state.reactionTimeRemaining = 1.5;

    state.knockbackVelocity.set(0, force * 0.85, 0);
    if (dir) {
      state.knockbackVelocity.x += dir.x * force * 0.5;
      state.knockbackVelocity.z += dir.z * force * 0.5;
    }

    const rb = this.engine.sceneManager.getRigidBody(entityId);
    if (rb) {
      const asm = this.engine.findAnimationStateMachine(rb);
      if (asm) asm.transition('jump', 0.1);
    }
  }

  update(dt: number): void {
    if (!this.config.enabled || this.entityStates.size === 0) return;

    for (const [entityId, state] of this.entityStates) {
      const rb = this.engine.sceneManager.getRigidBody(entityId);
      if (!rb) {
        this.entityStates.delete(entityId);
        continue;
      }

      // 1. Reaction duration progression
      if (state.reactionTimeRemaining > 0) {
        state.reactionTimeRemaining -= dt;
        if (state.reactionTimeRemaining <= 0) {
          state.reactionType = 'none';
          const asm = this.engine.findAnimationStateMachine(rb);
          if (asm && asm.currentState === 'hit') {
            asm.transition('idle', 0.2);
          }
        }
      }

      // 2. Knockback / Launch physics integration
      if (state.isLaunched || state.knockbackVelocity.lengthSq() > 0.01) {
        if (state.isLaunched) {
          // Gravity pull on launched entities
          state.knockbackVelocity.y -= this.config.launchGravity * dt;
        }

        const delta = state.knockbackVelocity.clone().multiplyScalar(dt);
        const nextPos = rb.mesh.position.clone().add(delta);

        // Ground floor collision clamp
        if (state.isLaunched && nextPos.y <= 0.9) {
          nextPos.y = 0.9;
          state.isLaunched = false;
          state.isGrounded = true;
          state.knockbackVelocity.y = 0;
          this.triggerReaction(entityId, 'flinch_heavy', 0.5);
        }

        rb.setNextKinematicTranslation(nextPos);

        // Apply friction decay
        const friction = Math.exp(-this.config.knockbackFriction * dt);
        state.knockbackVelocity.x *= friction;
        state.knockbackVelocity.z *= friction;
      }

      // 3. Poise regeneration
      if (state.currentPoise < this.config.defaultPoise) {
        if (state.poiseRegenDelayRemaining > 0) {
          state.poiseRegenDelayRemaining -= dt;
        } else {
          state.currentPoise = Math.min(
            this.config.defaultPoise,
            state.currentPoise + this.config.poiseRegenRate * dt,
          );
        }
      }
    }
  }
}
