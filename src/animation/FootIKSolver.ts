import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { TwoBoneIKSolver } from './TwoBoneIKSolver';

export interface LegChain {
  hipBone: THREE.Bone;
  kneeBone: THREE.Bone;
  footBone: THREE.Bone;
}

export interface FootIKConfig {
  rayLength?: number;
  footOffset?: number;
  maxPelvisDrop?: number;
  smoothSpeed?: number;
}

export class FootIKSolver {
  private readonly _leftTarget = new THREE.Vector3();
  private readonly _rightTarget = new THREE.Vector3();
  private readonly _leftFootPos = new THREE.Vector3();
  private readonly _rightFootPos = new THREE.Vector3();
  private readonly _leftOrigin = new THREE.Vector3();
  private readonly _rightOrigin = new THREE.Vector3();
  private readonly _hipPos = new THREE.Vector3();
  private readonly _kneePos = new THREE.Vector3();
  private readonly _down = new THREE.Vector3(0, -1, 0);

  pelvisOffset = 0;

  /** The pelvis Y we last wrote, and the value it was derived from. Used to undo our
   *  own offset when nothing else (an animation mixer) has rewritten the bone since —
   *  without this, `position.y += offset` compounds every frame and the character
   *  sinks through the floor. */
  private lastWrittenY: number | null = null;
  private lastBaseY = 0;

  constructor(
    private readonly physicsWorld: PhysicsWorld,
    private readonly leftLeg: LegChain,
    private readonly rightLeg: LegChain,
    private readonly hipsBone: THREE.Bone,
    private readonly config: FootIKConfig = {},
  ) {}

  update(dt: number): void {
    // If the pelvis still holds exactly what we wrote last frame, no mixer has
    // re-posed it — restore the pre-offset value before applying a new one.
    if (this.lastWrittenY !== null && Math.abs(this.hipsBone.position.y - this.lastWrittenY) < 1e-9) {
      this.hipsBone.position.y = this.lastBaseY;
    }
    const basePelvisY = this.hipsBone.position.y;

    const rayLen = this.config.rayLength ?? 1.5;
    const footOffset = this.config.footOffset ?? 0.08;
    const maxDrop = this.config.maxPelvisDrop ?? 0.4;
    const smoothSpeed = this.config.smoothSpeed ?? 15.0;

    // Get current world positions
    this.leftLeg.footBone.getWorldPosition(this._leftFootPos);
    this._leftOrigin.set(this._leftFootPos.x, this._leftFootPos.y + 0.5, this._leftFootPos.z);
    const leftHit = this.physicsWorld.raycast(this._leftOrigin, this._down, rayLen);

    this.rightLeg.footBone.getWorldPosition(this._rightFootPos);
    this._rightOrigin.set(this._rightFootPos.x, this._rightFootPos.y + 0.5, this._rightFootPos.z);
    const rightHit = this.physicsWorld.raycast(this._rightOrigin, this._down, rayLen);

    const leftTargetY = leftHit ? this._leftOrigin.y - leftHit.toi + footOffset : this._leftFootPos.y;
    const rightTargetY = rightHit ? this._rightOrigin.y - rightHit.toi + footOffset : this._rightFootPos.y;

    // Pelvis drop target based on lowest foot
    const targetDrop = Math.min(
      Math.min(leftTargetY - this._leftFootPos.y, rightTargetY - this._rightFootPos.y),
      0,
    );
    const clampedDrop = Math.max(targetDrop, -maxDrop);
    this.pelvisOffset = THREE.MathUtils.lerp(this.pelvisOffset, clampedDrop, Math.min(smoothSpeed * dt, 1));
    this.hipsBone.position.y = basePelvisY + this.pelvisOffset;
    this.lastBaseY = basePelvisY;
    this.lastWrittenY = this.hipsBone.position.y;

    // Solve left leg
    this.leftLeg.hipBone.getWorldPosition(this._hipPos);
    this.leftLeg.kneeBone.getWorldPosition(this._kneePos);
    this.leftLeg.footBone.getWorldPosition(this._leftFootPos);
    this._leftTarget.set(this._leftFootPos.x, leftTargetY, this._leftFootPos.z);

    const leftSolve = TwoBoneIKSolver.solve(this._hipPos, this._kneePos, this._leftFootPos, this._leftTarget);
    this.leftLeg.hipBone.quaternion.multiply(leftSolve.rootQuat);
    this.leftLeg.kneeBone.quaternion.multiply(leftSolve.midQuat);

    // Solve right leg
    this.rightLeg.hipBone.getWorldPosition(this._hipPos);
    this.rightLeg.kneeBone.getWorldPosition(this._kneePos);
    this.rightLeg.footBone.getWorldPosition(this._rightFootPos);
    this._rightTarget.set(this._rightFootPos.x, rightTargetY, this._rightFootPos.z);

    const rightSolve = TwoBoneIKSolver.solve(this._hipPos, this._kneePos, this._rightFootPos, this._rightTarget);
    this.rightLeg.hipBone.quaternion.multiply(rightSolve.rootQuat);
    this.rightLeg.kneeBone.quaternion.multiply(rightSolve.midQuat);
  }
}
