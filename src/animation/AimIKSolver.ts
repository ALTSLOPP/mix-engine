import * as THREE from 'three';

export interface AimBoneConfig {
  bone: THREE.Bone;
  weight: number;
}

export interface AimIKLimits {
  maxYaw?: number; // radians (default 1.2)
  maxPitch?: number; // radians (default 0.8)
}

export class AimIKSolver {
  private readonly _bonePos = new THREE.Vector3();
  private readonly _dirToTarget = new THREE.Vector3();
  private readonly _boneForward = new THREE.Vector3(0, 0, 1);
  private readonly _targetQuat = new THREE.Quaternion();

  constructor(
    private readonly bones: AimBoneConfig[],
    private readonly limits: AimIKLimits = {},
  ) {}

  aimAt(targetWorldPos: THREE.Vector3, weight = 1.0): void {
    if (weight <= 0) return;

    const maxYaw = this.limits.maxYaw ?? 1.2;
    const maxPitch = this.limits.maxPitch ?? 0.8;

    for (const entry of this.bones) {
      const bone = entry.bone;
      const boneWeight = entry.weight * weight;
      if (boneWeight <= 0) continue;

      bone.getWorldPosition(this._bonePos);
      this._dirToTarget.subVectors(targetWorldPos, this._bonePos).normalize();

      // Compute local angles
      const yaw = Math.atan2(this._dirToTarget.x, this._dirToTarget.z);
      const clampedYaw = THREE.MathUtils.clamp(yaw, -maxYaw, maxYaw);

      const horizDist = Math.hypot(this._dirToTarget.x, this._dirToTarget.z);
      const pitch = Math.atan2(this._dirToTarget.y, horizDist);
      const clampedPitch = THREE.MathUtils.clamp(pitch, -maxPitch, maxPitch);

      this._targetQuat.setFromEuler(new THREE.Euler(-clampedPitch, clampedYaw, 0, 'YXZ'));
      bone.quaternion.slerp(this._targetQuat, boneWeight);
      bone.quaternion.normalize();
    }
  }
}
