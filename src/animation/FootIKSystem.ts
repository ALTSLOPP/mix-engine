import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import { FootIKSolver, type FootIKConfig, type LegChain } from './FootIKSolver';

/** Bone-name hints used to find a humanoid's legs. Mixamo names first, then UE/generic. */
const LEG_BONE_HINTS = {
  leftHip: ['mixamorigLeftUpLeg', 'LeftUpLeg', 'thigh_l', 'UpperLeg_L', 'LeftUpperLeg'],
  leftKnee: ['mixamorigLeftLeg', 'LeftLeg', 'calf_l', 'LowerLeg_L', 'LeftLowerLeg'],
  leftFoot: ['mixamorigLeftFoot', 'LeftFoot', 'foot_l', 'Foot_L'],
  rightHip: ['mixamorigRightUpLeg', 'RightUpLeg', 'thigh_r', 'UpperLeg_R', 'RightUpperLeg'],
  rightKnee: ['mixamorigRightLeg', 'RightLeg', 'calf_r', 'LowerLeg_R', 'RightLowerLeg'],
  rightFoot: ['mixamorigRightFoot', 'RightFoot', 'foot_r', 'Foot_R'],
  hips: ['mixamorigHips', 'Hips', 'pelvis', 'Pelvis', 'Root'],
} as const;

export interface FootIKAttachOptions extends FootIKConfig {
  /** Override automatic bone discovery. */
  leftLeg?: LegChain;
  rightLeg?: LegChain;
  hipsBone?: THREE.Bone;
}

interface FootIKRecord {
  entityId: EntityId;
  solver: FootIKSolver;
  enabled: boolean;
}

/**
 * FootIKSystem.ts — registry + tick for {@link FootIKSolver}.
 *
 * The solver existed but nothing constructed it and nothing called `update()`, so
 * characters kept floating over slopes and clipping into stairs. This system finds the
 * leg chains on a character's skeleton, holds one solver per entity, and ticks them
 * after the animation mixers have written their pose (foot IK is a post-pass — running
 * it before the mixer would just be overwritten).
 */
export class FootIKSystem {
  private readonly records = new Map<EntityId, FootIKRecord>();

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly physicsWorld: PhysicsWorld,
  ) {}

  get count(): number {
    return this.records.size;
  }

  /**
   * Enable grounded foot IK on a character.
   * @returns the solver, or null if the entity has no recognisable humanoid leg chain.
   */
  attach(entityId: EntityId, opts: FootIKAttachOptions = {}): FootIKSolver | null {
    const existing = this.records.get(entityId);
    if (existing) {
      existing.enabled = true;
      return existing.solver;
    }

    const rb = this.sceneManager.getRigidBody(entityId);
    if (!rb) return null;

    const leftLeg = opts.leftLeg ?? this.findLeg(rb.mesh, 'left');
    const rightLeg = opts.rightLeg ?? this.findLeg(rb.mesh, 'right');
    const hips = opts.hipsBone ?? this.findBone(rb.mesh, LEG_BONE_HINTS.hips);
    if (!leftLeg || !rightLeg || !hips) return null;

    const solver = new FootIKSolver(this.physicsWorld, leftLeg, rightLeg, hips, {
      rayLength: opts.rayLength,
      footOffset: opts.footOffset,
      maxPelvisDrop: opts.maxPelvisDrop,
      smoothSpeed: opts.smoothSpeed,
    });
    this.records.set(entityId, { entityId, solver, enabled: true });
    return solver;
  }

  setEnabled(entityId: EntityId, enabled: boolean): boolean {
    const rec = this.records.get(entityId);
    if (!rec) return false;
    rec.enabled = enabled;
    return true;
  }

  detach(entityId: EntityId): boolean {
    return this.records.delete(entityId);
  }

  get(entityId: EntityId): FootIKSolver | undefined {
    return this.records.get(entityId)?.solver;
  }

  /** Render-rate tick. Run AFTER the animation mixers have posed the skeleton. */
  update(dt: number): void {
    if (dt <= 0 || this.records.size === 0) return;
    for (const rec of this.records.values()) {
      if (!rec.enabled) continue;
      if (!this.sceneManager.getRigidBody(rec.entityId)) {
        this.records.delete(rec.entityId);
        continue;
      }
      try {
        rec.solver.update(dt);
      } catch (err) {
        // A malformed rig must not take the frame down; disable that one character.
        console.warn(`[FootIKSystem] solver error on entity ${rec.entityId}, disabling:`, err);
        rec.enabled = false;
      }
    }
  }

  clear(): void {
    this.records.clear();
  }

  // --- Bone discovery -------------------------------------------------------

  private findLeg(root: THREE.Object3D, side: 'left' | 'right'): LegChain | null {
    const hip = this.findBone(root, side === 'left' ? LEG_BONE_HINTS.leftHip : LEG_BONE_HINTS.rightHip);
    const knee = this.findBone(root, side === 'left' ? LEG_BONE_HINTS.leftKnee : LEG_BONE_HINTS.rightKnee);
    const foot = this.findBone(root, side === 'left' ? LEG_BONE_HINTS.leftFoot : LEG_BONE_HINTS.rightFoot);
    if (!hip || !knee || !foot) return null;
    return { hipBone: hip, kneeBone: knee, footBone: foot };
  }

  private findBone(root: THREE.Object3D, names: readonly string[]): THREE.Bone | null {
    for (const name of names) {
      const found = root.getObjectByName(name);
      if (found) return found as THREE.Bone;
    }
    // Fall back to a case-insensitive suffix match — rigs often carry namespace prefixes.
    let match: THREE.Bone | null = null;
    const lowered = names.map((n) => n.toLowerCase());
    root.traverse((child) => {
      if (match) return;
      const cn = child.name.toLowerCase();
      if (lowered.some((n) => cn.endsWith(n))) match = child as THREE.Bone;
    });
    return match;
  }
}
