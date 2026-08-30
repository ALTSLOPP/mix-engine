import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';

export interface HitStopRequest {
  durationSeconds: number;
  timeScale: number; // e.g. 0.05 for near freeze
}

export interface ImpactFeedbackParams {
  attackerId: EntityId | null;
  targetId: EntityId;
  hitPosition: THREE.Vector3;
  hitNormal?: THREE.Vector3;
  damage: number;
  isCritical?: boolean;
  hitStop?: HitStopRequest;
  flashColor?: string;
  recoilImpulse?: number;
  vfxType?: string;
}

export class CombatImpactFeedback {
  private hitStopTimer = 0;
  private previousTimeScale = 1.0;
  private isHitStopActive = false;

  constructor(private readonly engine: Engine) {}

  triggerImpact(params: ImpactFeedbackParams): void {
    const { attackerId, targetId, hitPosition, damage, isCritical } = params;

    // 1. Visual Burst VFX
    const vfx = (params.vfxType ?? (isCritical ? 'fire' : 'sparks')) as any;
    this.engine.burstVfx(vfx, hitPosition, isCritical ? 24 : 12);

    // 2. Audio Cue
    const sound = isCritical
      ? '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav'
      : '/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav';
    this.engine.audio.play(sound, { volume: isCritical ? 1.0 : 0.7, loop: false });

    // 3. Screen Trauma / Camera Shake
    this.engine.effects.shake({
      trauma: isCritical ? 0.35 : 0.15,
      duration: isCritical ? 0.25 : 0.15,
    });

    // 4. Hit-Stop Timescale slowdown (presentation only)
    if (params.hitStop) {
      this.triggerHitStop(params.hitStop.durationSeconds, params.hitStop.timeScale);
    } else if (isCritical) {
      this.triggerHitStop(0.08, 0.05); // 80ms freeze on critical hit
    }

    // 5. Flash Effect
    if (params.flashColor) {
      this.engine.effects.flash({
        color: params.flashColor,
        intensity: 0.6,
        duration: 0.15,
        mode: 'fade',
      });
    }

    // 6. Recoil / Knockback on Target Mesh
    if (params.recoilImpulse && params.recoilImpulse > 0) {
      const targetRb = this.engine.sceneManager.getRigidBody(targetId);
      if (targetRb) {
        const pushDir = params.hitNormal
          ? params.hitNormal.clone().negate()
          : (attackerId !== null
              ? targetRb.mesh.position.clone().sub(hitPosition).normalize()
              : new THREE.Vector3(0, 0, 1));
        pushDir.y = 0.1;
        pushDir.normalize();

        const currentPos = targetRb.mesh.position.clone();
        targetRb.setNextKinematicTranslation?.(currentPos.addScaledVector(pushDir, params.recoilImpulse * 0.05));
      }
    }

    // 7. Emit UI Callout Event (Floating Combat Text)
    this.engine.sceneManager.events.emit('combat_callout', {
      targetId,
      position: hitPosition,
      damage,
      isCritical: !!isCritical,
    });
  }

  private triggerHitStop(duration: number, scale: number): void {
    if (!this.isHitStopActive) {
      this.previousTimeScale = this.engine.time?.timeScale ?? 1.0;
    }
    this.isHitStopActive = true;
    this.hitStopTimer = duration;
    if (this.engine.time?.setTimeScale) {
      this.engine.time.setTimeScale(scale);
    } else if (this.engine.time) {
      (this.engine.time as any).timeScale = scale;
    }
  }

  update(dt: number): void {
    if (this.isHitStopActive) {
      this.hitStopTimer -= dt;
      if (this.hitStopTimer <= 0) {
        this.isHitStopActive = false;
        if (this.engine.time?.setTimeScale) {
          this.engine.time.setTimeScale(this.previousTimeScale);
        } else if (this.engine.time) {
          (this.engine.time as any).timeScale = this.previousTimeScale;
        }
      }
    }
  }

  dispose(): void {
    if (this.isHitStopActive && this.engine.time) {
      if (this.engine.time.setTimeScale) {
        this.engine.time.setTimeScale(this.previousTimeScale);
      } else {
        (this.engine.time as any).timeScale = this.previousTimeScale;
      }
    }
    this.isHitStopActive = false;
  }
}
