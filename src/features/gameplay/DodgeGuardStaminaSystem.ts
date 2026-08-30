import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { DodgeGuardStaminaConfig, DodgeGuardStaminaState } from './types';
import type { AnimationStateMachine } from '../../animation/AnimationStateMachine';

export class DodgeGuardStaminaSystem {
  private config: DodgeGuardStaminaConfig;
  private readonly state: DodgeGuardStaminaState = {
    currentStamina: 100,
    isDodging: false,
    isInvulnerable: false,
    dodgeTimeRemaining: 0,
    dodgeDirection: new THREE.Vector3(),
    isBlocking: false,
    isParryWindowActive: false,
    parryTimeRemaining: 0,
    isGuardBroken: false,
    guardBreakTimeRemaining: 0,
    staminaRegenDelayRemaining: 0,
  };

  private readonly _tempDir = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: DodgeGuardStaminaConfig) {
    this.config = { ...initialConfig };
    this.state.currentStamina = this.config.maxStamina;
  }

  setConfig(config: Partial<DodgeGuardStaminaConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.state.isDodging = false; this.state.isInvulnerable = false; this.state.isBlocking = false; this.state.isParryWindowActive = false; this.state.isGuardBroken = false; }
    this.state.currentStamina = Math.min(this.state.currentStamina, this.config.maxStamina);
  }

  getConfig(): Readonly<DodgeGuardStaminaConfig> {
    return this.config;
  }

  getState(): Readonly<DodgeGuardStaminaState> {
    return this.state;
  }

  get isDodging(): boolean {
    return this.state.isDodging;
  }

  get isInvulnerable(): boolean {
    return this.state.isInvulnerable;
  }

  get isBlocking(): boolean {
    return this.state.isBlocking;
  }

  get isParrying(): boolean {
    return this.state.isParryWindowActive;
  }

  get currentStamina(): number {
    return this.state.currentStamina;
  }

  get maxStamina(): number {
    return this.config.maxStamina;
  }

  // ── Stamina Management ───────────────────────────────────────────────────

  consumeStamina(amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (!this.config.enabled) return true;
    if (this.state.isGuardBroken) return false;
    if (this.state.currentStamina < amount) return false;

    this.state.currentStamina = Math.max(0, this.state.currentStamina - amount);
    this.state.staminaRegenDelayRemaining = this.config.staminaRegenDelay;

    if (this.state.currentStamina <= 0 && this.state.isBlocking) {
      this.triggerGuardBreak();
    }
    return true;
  }

  // ── Dodge Implementation ─────────────────────────────────────────────────

  executeDodge(asm: AnimationStateMachine, moveInput: { x: number; y: number }, cameraYaw: number): boolean {
    if (!this.config.enabled) return false;
    if (this.state.isDodging || this.state.isGuardBroken) return false;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    if (!this.consumeStamina(this.config.dodgeStaminaCost)) return false;

    // Calculate world dodge direction relative to camera
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);

    const hasInput = moveInput.x !== 0 || moveInput.y !== 0;
    if (hasInput) {
      this.state.dodgeDirection
        .set(0, 0, 0)
        .addScaledVector(forward, -moveInput.y)
        .addScaledVector(right, moveInput.x)
        .normalize();
    } else {
      // Default backflip/backdash if no direction pressed
      this.state.dodgeDirection.copy(forward).negate();
    }

    this.state.isDodging = true;
    this.state.isInvulnerable = true;
    this.state.dodgeTimeRemaining = this.config.dodgeDuration;

    // Pick dodge animation (Dodging Left, Dodging Right, Backflip, or roll)
    let animName = 'Dodging Left(1)';
    if (moveInput.x > 0.3) animName = 'Dodging Right';
    else if (moveInput.y > 0.3 || !hasInput) animName = 'Backflip';
    else if (moveInput.x < -0.3) animName = 'Dodging Left(1)';

    asm.transition(animName, 0.1);

    // Audio & VFX
    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.7, loop: false });
    if (this.config.dodgeTrailVfx) {
      this.engine.effects.shake({ trauma: 0.15, duration: 0.2 });
    }

    return true;
  }

  // ── Blocking & Parrying ──────────────────────────────────────────────────

  startBlock(asm: AnimationStateMachine): void {
    if (!this.config.enabled || this.state.isDodging || this.state.isGuardBroken) return;
    if (this.state.isBlocking) return;

    this.state.isBlocking = true;
    this.state.isParryWindowActive = true;
    this.state.parryTimeRemaining = this.config.parryWindowDuration;

    asm.transition('Standing Block Idle', 0.15);
  }

  stopBlock(asm: AnimationStateMachine): void {
    if (!this.state.isBlocking) return;

    this.state.isBlocking = false;
    this.state.isParryWindowActive = false;
    this.state.parryTimeRemaining = 0;

    if (!this.state.isGuardBroken) {
      asm.transition('idle', 0.2);
    }
  }

  /**
   * Evaluates incoming hit against block/parry stance.
   * Returns: 'parried' | 'blocked' | 'hit'
   */
  evaluateIncomingHit(attackerId: number | null, hitPos: THREE.Vector3, rawDamage: number): {
    outcome: 'parried' | 'blocked' | 'hit';
    mitigatedDamage: number;
  } {
    if (!this.config.enabled) return { outcome: 'hit', mitigatedDamage: rawDamage };

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return { outcome: 'hit', mitigatedDamage: rawDamage };

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return { outcome: 'hit', mitigatedDamage: rawDamage };

    // 1. Invulnerability (during dodge i-frames)
    if (this.state.isInvulnerable) {
      return { outcome: 'blocked', mitigatedDamage: 0 };
    }

    // 2. Blocking / Parrying check
    if (!this.state.isBlocking || this.state.isGuardBroken) {
      return { outcome: 'hit', mitigatedDamage: rawDamage };
    }

    // Angle check (is hit coming from front arc?)
    const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerRb.mesh.quaternion);
    const attackerRb = attackerId !== null ? this.engine.sceneManager.getRigidBody(attackerId) : null;
    const toHit = this._tempDir.subVectors(attackerRb?.mesh.position ?? hitPos, playerRb.mesh.position);
    toHit.y = 0;
    toHit.normalize();
    const dot = playerForward.dot(toHit);
    const minDot = Math.cos(THREE.MathUtils.degToRad(this.config.blockAngleDegrees * 0.5));

    if (dot < minDot) {
      // Hit from behind! Block bypassed.
      return { outcome: 'hit', mitigatedDamage: rawDamage };
    }

    // 3. Perfect Parry Window
    if (this.state.isParryWindowActive) {
      this.triggerSuccessfulParry(attackerId, hitPos);
      return { outcome: 'parried', mitigatedDamage: 0 };
    }

    // 4. Standard Block
    const staminaDrain = Math.max(10, rawDamage * 0.5);
    if (!this.consumeStamina(staminaDrain)) {
      this.state.currentStamina = 0;
      this.triggerGuardBreak();
      return { outcome: 'hit', mitigatedDamage: rawDamage };
    }

    // Audio & Block spark
    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 1.0, loop: false });
    this.engine.effects.hit({
      position: hitPos,
      intensity: 0.6,
      color: '#00f0ff',
      vfx: 'sparks',
    });

    const mitigatedDamage = rawDamage * (1 - this.config.blockDamageReduction);
    return { outcome: 'blocked', mitigatedDamage };
  }

  private triggerSuccessfulParry(attackerId: number | null, hitPos: THREE.Vector3): void {
    // 1. Attacker Stagger
    if (attackerId !== null) {
      this.engine.sceneManager.events.emit('gameplay_stagger', {
        targetId: attackerId,
        duration: 1.8,
        reactionType: 'stagger',
      });
    }

    // 2. Hitstop & Camera Flash
    this.engine.timeDilation.triggerHitstop?.({ timeScale: 0.05, durationMs: this.config.parryHitstopDuration * 1000 });

    // 3. Audio & Golden Glint VFX
    this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 1.2, loop: false });
    this.engine.effects.flash({ color: '#ffd479', intensity: 0.7, duration: 0.15, mode: 'pulse' });
    this.engine.effects.hit({
      position: hitPos,
      intensity: 1.0,
      color: '#ffd479',
      vfx: 'sparks',
    });

    // 4. Emit event for counter bonus
    this.engine.sceneManager.events.emit('parry_success', {
      attackerId,
      critMultiplier: this.config.parryCounterCritMultiplier,
    });
  }

  private triggerGuardBreak(): void {
    this.state.isBlocking = false;
    this.state.isGuardBroken = true;
    this.state.isParryWindowActive = false;
    this.state.parryTimeRemaining = 0;
    this.state.guardBreakTimeRemaining = this.config.guardBreakStunDuration;

    this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYKICK.wav', { volume: 1.0, loop: false });
    this.engine.effects.flash({ color: '#ef4444', intensity: 0.5, duration: 0.2, mode: 'pulse' });

    this.engine.sceneManager.events.emit('guard_break', {});
  }

  // ── Engine Loop Update ───────────────────────────────────────────────────

  update(dt: number, asm?: AnimationStateMachine | null): void {
    if (!this.config.enabled) return;

    // 1. Dodge state advancement & translation impulse
    if (this.state.isDodging) {
      const movementDt = Math.min(dt, this.state.dodgeTimeRemaining);
      this.state.dodgeTimeRemaining -= dt;

      const iframesRemaining = this.config.dodgeDuration - this.config.dodgeIframesDuration;
      if (this.state.dodgeTimeRemaining <= iframesRemaining) {
        this.state.isInvulnerable = false;
      }

      const playerEntityId = this.engine.player.getPossessedId();
      if (playerEntityId !== null) {
        const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
        if (playerRb) {
          const moveDelta = this.state.dodgeDirection.clone().multiplyScalar(this.config.dodgeSpeed * movementDt);
          const nextPos = playerRb.mesh.position.clone().add(moveDelta);
          playerRb.setNextKinematicTranslation(nextPos);
        }
      }

      if (this.state.dodgeTimeRemaining <= 0) {
        this.state.isDodging = false;
        this.state.isInvulnerable = false;
        if (asm && !this.state.isBlocking) {
          asm.transition('idle', 0.2);
        }
      }
    }

    // 2. Parry window timer
    if (this.state.isParryWindowActive) {
      this.state.parryTimeRemaining -= dt;
      if (this.state.parryTimeRemaining <= 0) {
        this.state.isParryWindowActive = false;
      }
    }

    // 3. Guard break recovery timer
    if (this.state.isGuardBroken) {
      this.state.guardBreakTimeRemaining -= dt;
      if (this.state.guardBreakTimeRemaining <= 0) {
        this.state.isGuardBroken = false;
        if (asm) asm.transition('idle', 0.2);
      }
    }

    // 4. Stamina regeneration
    if (!this.state.isBlocking && !this.state.isDodging) {
      if (this.state.staminaRegenDelayRemaining > 0) {
        this.state.staminaRegenDelayRemaining -= dt;
        if (this.state.staminaRegenDelayRemaining < 0) {
          const leftoverDt = -this.state.staminaRegenDelayRemaining;
          this.state.staminaRegenDelayRemaining = 0;
          this.state.currentStamina = Math.min(
            this.config.maxStamina,
            this.state.currentStamina + this.config.staminaRegenRate * leftoverDt,
          );
        }
      } else {
        this.state.currentStamina = Math.min(
          this.config.maxStamina,
          this.state.currentStamina + this.config.staminaRegenRate * dt,
        );
      }
    } else if (this.state.isBlocking) {
      // Drain minor stamina while holding guard stance
      if (!this.consumeStamina(this.config.blockStaminaDrainRate * dt)) {
        this.state.currentStamina = 0;
        this.triggerGuardBreak();
      }
    }
  }
}
