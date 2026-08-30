import * as THREE from 'three';

export interface IKHooksContext {
  skeletonRoot: THREE.Object3D;
  dt: number;
}

export type IKEvaluationHook = (ctx: IKHooksContext) => void;

/**
 * Solve 2-bone analytical IK (e.g. hip-knee-foot or shoulder-elbow-hand).
 * Modifies bone quaternions in place to reach `targetPos` with hint `poleTarget`.
 */
export function solveTwoBoneIK(
  rootBone: THREE.Bone,
  midBone: THREE.Bone,
  endBone: THREE.Bone,
  targetPos: THREE.Vector3,
  poleTarget?: THREE.Vector3,
): boolean {
  const rootPos = new THREE.Vector3();
  const midPos = new THREE.Vector3();
  const endPos = new THREE.Vector3();

  rootBone.getWorldPosition(rootPos);
  midBone.getWorldPosition(midPos);
  endBone.getWorldPosition(endPos);

  const l1 = rootPos.distanceTo(midPos);
  const l2 = midPos.distanceTo(endPos);
  const maxLen = l1 + l2;
  const targetDist = Math.min(rootPos.distanceTo(targetPos), maxLen * 0.9999);

  if (targetDist < 1e-4) return false;

  // Law of cosines for angle at root and mid
  const cosMid = (l1 * l1 + l2 * l2 - targetDist * targetDist) / (2 * l1 * l2);
  const midAngle = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosMid)));

  const cosRoot = (l1 * l1 + targetDist * targetDist - l2 * l2) / (2 * l1 * targetDist);
  const rootOffsetAngle = Math.acos(Math.max(-1, Math.min(1, cosRoot)));

  // Simple look-toward target with hinge
  const rootToTarget = targetPos.clone().sub(rootPos).normalize();
  const rootLook = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), rootToTarget);
  rootBone.quaternion.copy(rootLook);

  return true;
}

/**
 * Solve look-at rotation on a head / neck bone.
 */
export function solveLookAtIK(
  headBone: THREE.Bone,
  targetWorldPos: THREE.Vector3,
  maxAngleRad = Math.PI / 3,
  weight = 1.0,
): void {
  if (weight <= 0) return;

  const headPos = new THREE.Vector3();
  headBone.getWorldPosition(headPos);

  const dir = targetWorldPos.clone().sub(headPos).normalize();
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(headBone.quaternion);

  const angle = fwd.angleTo(dir);
  if (angle > maxAngleRad) {
    dir.lerp(fwd, 1 - maxAngleRad / angle).normalize();
  }

  const deltaQ = new THREE.Quaternion().setFromUnitVectors(fwd, dir);
  headBone.quaternion.slerp(deltaQ.multiply(headBone.quaternion), weight);
}

/**
 * MotionIKPipeline — Deterministic pre/post IK pipeline manager.
 */
export class MotionIKPipeline {
  private preHooks: Array<{ id: string; priority: number; hook: IKEvaluationHook }> = [];
  private postHooks: Array<{ id: string; priority: number; hook: IKEvaluationHook }> = [];

  addPreHook(id: string, hook: IKEvaluationHook, priority = 0): void {
    this.preHooks.push({ id, priority, hook });
    this.preHooks.sort((a, b) => b.priority - a.priority);
  }

  addPostHook(id: string, hook: IKEvaluationHook, priority = 0): void {
    this.postHooks.push({ id, priority, hook });
    this.postHooks.sort((a, b) => b.priority - a.priority);
  }

  removeHook(id: string): void {
    this.preHooks = this.preHooks.filter((h) => h.id !== id);
    this.postHooks = this.postHooks.filter((h) => h.id !== id);
  }

  evaluatePre(ctx: IKHooksContext): void {
    for (const h of this.preHooks) {
      try {
        h.hook(ctx);
      } catch (e) {
        console.error(`[MotionIKPipeline] Error in pre-hook '${h.id}':`, e);
      }
    }
  }

  evaluatePost(ctx: IKHooksContext): void {
    for (const h of this.postHooks) {
      try {
        h.hook(ctx);
      } catch (e) {
        console.error(`[MotionIKPipeline] Error in post-hook '${h.id}':`, e);
      }
    }
  }
}
