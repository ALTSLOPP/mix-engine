import * as THREE from 'three';

export interface TwoBoneIKSolveResult {
  rootQuat: THREE.Quaternion;
  midQuat: THREE.Quaternion;
}

export class TwoBoneIKSolver {
  private static readonly _rootToTarget = new THREE.Vector3();
  private static readonly _rootToMid = new THREE.Vector3();
  private static readonly _midToEnd = new THREE.Vector3();
  private static readonly _poleVec = new THREE.Vector3();
  private static readonly _bendNormal = new THREE.Vector3();
  private static readonly _axis = new THREE.Vector3();

  /**
   * Analytically solve two-bone inverse kinematics (e.g. thigh->calf->foot or upperArm->foreArm->hand).
   */
  static solve(
    rootPos: THREE.Vector3,
    midPos: THREE.Vector3,
    endPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    polePos?: THREE.Vector3,
  ): TwoBoneIKSolveResult {
    const l1 = rootPos.distanceTo(midPos);
    const l2 = midPos.distanceTo(endPos);

    if (l1 < 1e-4 || l2 < 1e-4) {
      return { rootQuat: new THREE.Quaternion(), midQuat: new THREE.Quaternion() };
    }

    this._rootToTarget.subVectors(targetPos, rootPos);
    const d = THREE.MathUtils.clamp(this._rootToTarget.length(), 1e-4, l1 + l2 - 1e-4);
    this._rootToTarget.normalize();

    // Law of cosines
    const cosAlpha = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const alpha = Math.acos(THREE.MathUtils.clamp(cosAlpha, -1, 1));

    const cosBeta = (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2);
    const beta = Math.acos(THREE.MathUtils.clamp(cosBeta, -1, 1));

    // Determine bend plane normal
    if (polePos) {
      this._poleVec.subVectors(polePos, rootPos);
      this._bendNormal.crossVectors(this._rootToTarget, this._poleVec);
    } else {
      this._rootToMid.subVectors(midPos, rootPos);
      this._bendNormal.crossVectors(this._rootToTarget, this._rootToMid);
    }

    if (this._bendNormal.lengthSq() < 1e-4) {
      if (Math.abs(this._rootToTarget.y) < 0.99) {
        this._bendNormal.crossVectors(this._rootToTarget, new THREE.Vector3(0, 1, 0));
      } else {
        this._bendNormal.crossVectors(this._rootToTarget, new THREE.Vector3(1, 0, 0));
      }
    }
    this._bendNormal.normalize();

    // Mid bone flexion angle (relative to straight extension)
    const midAngle = Math.PI - beta;
    const midQuat = new THREE.Quaternion().setFromAxisAngle(this._bendNormal, midAngle);

    // Root rotation toward target plus alpha angle
    this._axis.crossVectors(this._bendNormal, this._rootToTarget).normalize();
    const rootDir = this._rootToTarget.clone().applyAxisAngle(this._bendNormal, alpha);
    const origDir = this._rootToMid.subVectors(midPos, rootPos).normalize();
    const rootQuat = new THREE.Quaternion().setFromUnitVectors(origDir, rootDir);

    return { rootQuat, midQuat };
  }
}
