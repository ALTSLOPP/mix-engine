import * as THREE from 'three';
import type { RagdollInstance, RagdollPart } from './RagdollBuilder';
import type { SceneManager } from '../ecs/SceneManager';
import type { RigidBodyComponent } from './RigidBodyComponent';

export interface ActiveRagdollConfig {
  muscleStiffness?: number; // 10 to 500
  muscleDamping?: number;   // 1 to 50
  defaultStrength?: number; // 0 (limp) to 1 (fully motorized)
}

/**
 * ActiveRagdoll.ts — Motorized physical ragdoll driving physical bodies towards animated target poses.
 * Supports partial hit reaction flinches, impulse absorption, and smooth recovery get-up transitions.
 */
export class ActiveRagdoll {
  readonly ragdoll: RagdollInstance;
  private readonly sceneManager: SceneManager;
  muscleStiffness: number;
  muscleDamping: number;
  strength: number; // 0 = limp ragdoll, 1 = full muscle drive

  private isLimp = false;
  private timeSinceKnockdown = 0;
  private knockdownDuration = 0;
  /** Seconds spent ramping muscle strength back up once a knockdown expires. */
  getUpBlendSeconds = 0.5;

  constructor(
    ragdoll: RagdollInstance,
    sceneManager: SceneManager,
    config: ActiveRagdollConfig = {},
  ) {
    this.ragdoll = ragdoll;
    this.sceneManager = sceneManager;
    this.muscleStiffness = config.muscleStiffness ?? 150;
    this.muscleDamping = config.muscleDamping ?? 15;
    this.strength = config.defaultStrength ?? 1.0;
  }

  /** Set muscle strength factor (0 = full ragdoll collapse, 1 = strong motor tracking). */
  setStrength(strength: number): void {
    this.strength = THREE.MathUtils.clamp(strength, 0, 1);
    this.isLimp = this.strength <= 0.05;
  }

  /** Apply a physical impact impulse to a specific ragdoll part (e.g. 'head', 'chest', 'upperArmL'). */
  applyHitImpulse(partName: string, impulse: THREE.Vector3): boolean {
    const part = this.ragdoll.parts.find((p) => p.name === partName);
    if (!part) return false;

    const rb = this.sceneManager.getComponent<RigidBodyComponent>(part.entityId, 'rigidBody');
    if (!rb) return false;

    try {
      rb.rapierBody.applyImpulse(
        { x: impulse.x, y: impulse.y, z: impulse.z },
        true,
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Knock down character into ragdoll for a duration. */
  knockdown(durationSeconds = 2.0): void {
    this.setStrength(0.0);
    this.timeSinceKnockdown = 0;
    this.knockdownDuration = Math.max(0, durationSeconds);
  }

  /** Drive joint motors toward target animation bone transforms. */
  update(dt: number, targetBoneMap?: Map<string, THREE.Quaternion>): void {
    if (dt <= 0) return;

    if (this.strength <= 0.05) {
      this.timeSinceKnockdown += dt;
      // durationSeconds used to be ignored entirely, so a knockdown never ended.
      // Once it expires, ramp strength back up so the get-up blends instead of snapping.
      if (this.knockdownDuration > 0 && this.timeSinceKnockdown >= this.knockdownDuration) {
        const t = (this.timeSinceKnockdown - this.knockdownDuration) / Math.max(1e-3, this.getUpBlendSeconds);
        this.setStrength(Math.min(1, t));
        if (this.strength >= 1) this.knockdownDuration = 0;
      }
      return;
    }

    if (!targetBoneMap) return;

    for (const part of this.ragdoll.parts) {
      const targetRot = targetBoneMap.get(part.boneName);
      if (!targetRot) continue;

      const rb = this.sceneManager.getComponent<RigidBodyComponent>(part.entityId, 'rigidBody');
      if (!rb) continue;

      try {
        const body = rb.rapierBody;
        const currentRot = body.rotation();
        const currentQuat = new THREE.Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w);

        // Compute shortest angular error quaternion
        const deltaQuat = targetRot.clone().multiply(currentQuat.clone().invert());
        // q and -q are the same rotation, but w < 0 makes the acos() below report the
        // long way round (> PI) with a flipped axis — the limb torques away from the
        // target instead of toward it. Flip to the shortest arc first.
        if (deltaQuat.w < 0) {
          deltaQuat.set(-deltaQuat.x, -deltaQuat.y, -deltaQuat.z, -deltaQuat.w);
        }
        const angle = 2 * Math.acos(THREE.MathUtils.clamp(deltaQuat.w, -1, 1));

        if (angle > 0.01) {
          const axis = new THREE.Vector3(deltaQuat.x, deltaQuat.y, deltaQuat.z).normalize();
          const angvel = body.angvel();
          const currentAngVel = new THREE.Vector3(angvel.x, angvel.y, angvel.z);

          // PD torque controller: Torque = stiffness * angle * axis - damping * angvel
          const torque = axis
            .multiplyScalar(this.muscleStiffness * angle * this.strength)
            .sub(currentAngVel.multiplyScalar(this.muscleDamping * this.strength));

          body.applyTorqueImpulse(
            { x: torque.x * dt, y: torque.y * dt, z: torque.z * dt },
            true,
          );
        }
      } catch {
        // Safe fallback
      }
    }
  }

  /** Check if character ragdoll has settled stably on the floor. */
  isResting(): boolean {
    for (const part of this.ragdoll.parts) {
      const rb = this.sceneManager.getComponent<RigidBodyComponent>(part.entityId, 'rigidBody');
      if (!rb) continue;
      try {
        const linvel = rb.rapierBody.linvel();
        const speedSq = linvel.x * linvel.x + linvel.y * linvel.y + linvel.z * linvel.z;
        if (speedSq > 0.1) return false;
      } catch {
        return false;
      }
    }
    return true;
  }
}
