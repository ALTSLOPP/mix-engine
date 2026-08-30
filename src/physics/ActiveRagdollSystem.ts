import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { RagdollBuilder } from './RagdollBuilder';
import { ActiveRagdoll, type ActiveRagdollConfig } from './ActiveRagdoll';

interface ActiveRagdollRecord {
  entityId: EntityId;
  ragdoll: ActiveRagdoll;
  /** Skeleton the muscle motors track. Null means "hold the pose it was created in". */
  skeletonRoot: THREE.Object3D | null;
  /** Reused per-frame target map so a 15-bone ragdoll doesn't allocate every step. */
  targets: Map<string, THREE.Quaternion>;
}

/**
 * ActiveRagdollSystem.ts — owns every {@link ActiveRagdoll} and ticks it.
 *
 * ActiveRagdoll was previously constructible but unreachable: nothing built one and
 * nothing called `update()`, so the muscle motors never ran and a knockdown never
 * recovered no matter how correct the PD controller was. This system registers them
 * against entities, samples the animated skeleton for target bone rotations each
 * fixed step, and drives the motors.
 *
 * It ticks in the FIXED step, not the render step — the torque impulses it applies
 * must land on the same cadence Rapier integrates at, or muscle stiffness becomes
 * frame-rate dependent.
 */
export class ActiveRagdollSystem {
  private readonly records = new Map<EntityId, ActiveRagdollRecord>();

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly ragdollBuilder: RagdollBuilder,
  ) {}

  get count(): number {
    return this.records.size;
  }

  /**
   * Motorize an existing ragdoll. The ragdoll itself must already have been built
   * (`ragdoll_create` / RagdollBuilder.createHumanoidRagdoll).
   *
   * @param skeletonRoot object whose descendant bones name the target pose. When
   *        omitted the ragdoll holds whatever pose it had at registration.
   */
  attach(
    entityId: EntityId,
    config: ActiveRagdollConfig = {},
    skeletonRoot: THREE.Object3D | null = null,
  ): ActiveRagdoll | null {
    const instance = this.ragdollBuilder.getRagdoll(entityId);
    if (!instance) return null;

    const existing = this.records.get(entityId);
    if (existing) {
      if (config.muscleStiffness !== undefined) existing.ragdoll.muscleStiffness = config.muscleStiffness;
      if (config.muscleDamping !== undefined) existing.ragdoll.muscleDamping = config.muscleDamping;
      if (config.defaultStrength !== undefined) existing.ragdoll.setStrength(config.defaultStrength);
      if (skeletonRoot) existing.skeletonRoot = skeletonRoot;
      return existing.ragdoll;
    }

    const ragdoll = new ActiveRagdoll(instance, this.sceneManager, config);
    const resolvedRoot = skeletonRoot ?? this.findSkeletonRoot(entityId);
    this.records.set(entityId, {
      entityId,
      ragdoll,
      skeletonRoot: resolvedRoot,
      targets: new Map(),
    });
    return ragdoll;
  }

  detach(entityId: EntityId): boolean {
    return this.records.delete(entityId);
  }

  get(entityId: EntityId): ActiveRagdoll | undefined {
    return this.records.get(entityId)?.ragdoll;
  }

  /** Collapse a character into a limp ragdoll that gets back up after `seconds`. */
  knockdown(entityId: EntityId, seconds = 2.0): boolean {
    const rec = this.records.get(entityId);
    if (!rec) return false;
    rec.ragdoll.knockdown(seconds);
    return true;
  }

  setStrength(entityId: EntityId, strength: number): boolean {
    const rec = this.records.get(entityId);
    if (!rec) return false;
    rec.ragdoll.setStrength(strength);
    return true;
  }

  applyHitImpulse(entityId: EntityId, partName: string, impulse: THREE.Vector3): boolean {
    const rec = this.records.get(entityId);
    if (!rec) return false;
    return rec.ragdoll.applyHitImpulse(partName, impulse);
  }

  isResting(entityId: EntityId): boolean | null {
    const rec = this.records.get(entityId);
    return rec ? rec.ragdoll.isResting() : null;
  }

  /** Fixed-rate tick. Call from the Engine's physics substep, before `world.step()`. */
  fixedStep(dt: number): void {
    if (dt <= 0 || this.records.size === 0) return;
    for (const rec of this.records.values()) {
      const targets = this.sampleTargets(rec);
      rec.ragdoll.update(dt, targets);
    }
  }

  /** Drop records whose entity or ragdoll has gone away. */
  prune(): void {
    for (const [entityId] of this.records) {
      if (!this.ragdollBuilder.getRagdoll(entityId)) this.records.delete(entityId);
    }
  }

  clear(): void {
    this.records.clear();
  }

  // --- Internals ------------------------------------------------------------

  /**
   * Read the animated skeleton's world-space bone rotations into the reused target map.
   * Returns undefined when there is no skeleton to track, which puts the ragdoll into
   * "hold current pose" mode rather than torquing toward garbage.
   */
  private sampleTargets(rec: ActiveRagdollRecord): Map<string, THREE.Quaternion> | undefined {
    if (!rec.skeletonRoot) return undefined;
    let found = 0;
    for (const part of rec.ragdoll.ragdoll.parts) {
      const bone = rec.skeletonRoot.getObjectByName(part.boneName);
      if (!bone) continue;
      let q = rec.targets.get(part.boneName);
      if (!q) {
        q = new THREE.Quaternion();
        rec.targets.set(part.boneName, q);
      }
      bone.getWorldQuaternion(q);
      found++;
    }
    return found > 0 ? rec.targets : undefined;
  }

  private findSkeletonRoot(entityId: EntityId): THREE.Object3D | null {
    const rb = this.sceneManager.getRigidBody(entityId);
    if (!rb) return null;
    let skeletonRoot: THREE.Object3D | null = null;
    rb.mesh.traverse((child) => {
      if (skeletonRoot) return;
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        skeletonRoot = rb.mesh;
      }
    });
    return skeletonRoot;
  }
}
