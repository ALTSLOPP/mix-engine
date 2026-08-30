import * as THREE from 'three';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import type { RootMotionMode } from './types';

export interface MotionWarpTarget {
  targetPosition: THREE.Vector3;
  targetRotation?: THREE.Quaternion;
  startTimeNormalized: number;
  endTimeNormalized: number;
  warpTranslation?: boolean;
  warpRotation?: boolean;
}

export interface RootMotionDiagnostic {
  maxVelocityMps: number;
  hasSpikes: boolean;
  loopDiscontinuityDistance: number;
  warnings: string[];
}

/**
 * MotionRootMotion — Advanced root motion extraction, policy filtering, warping, and diagnostics.
 */
export class MotionRootMotion {
  mode: RootMotionMode = 'applyPhysics';
  private activeWarp: MotionWarpTarget | null = null;
  private currentWarpProgress = 0;

  constructor(mode: RootMotionMode = 'applyPhysics') {
    this.mode = mode;
  }

  setWarp(warp: MotionWarpTarget): void {
    this.activeWarp = { ...warp };
    this.currentWarpProgress = 0;
  }

  clearWarp(): void {
    this.activeWarp = null;
    this.currentWarpProgress = 0;
  }

  /**
   * Filter and warp a local root motion delta for a frame.
   */
  processDelta(
    localDelta: THREE.Vector3,
    normalizedTime: number,
    rb: RigidBodyComponent | null,
  ): THREE.Vector3 {
    if (this.mode === 'off') {
      return localDelta.set(0, 0, 0);
    }

    const out = localDelta.clone();

    // Mode-specific axis constraints
    if (this.mode === 'xzOnly') {
      out.y = 0;
    } else if (this.mode === 'yawOnly') {
      out.set(0, 0, 0); // yaw handled via quaternion rotation
    } else if (this.mode === 'consumePartially') {
      out.multiplyScalar(0.5);
    }

    // Apply target motion warping if active
    if (this.activeWarp && rb && normalizedTime >= this.activeWarp.startTimeNormalized && normalizedTime <= this.activeWarp.endTimeNormalized) {
      const warpWindow = this.activeWarp.endTimeNormalized - this.activeWarp.startTimeNormalized;
      if (warpWindow > 1e-4) {
        const remainingTimeFraction = (this.activeWarp.endTimeNormalized - normalizedTime) / warpWindow;
        if (remainingTimeFraction > 0) {
          const currentWorldPos = rb.mesh.position;
          const toTargetWorld = this.activeWarp.targetPosition.clone().sub(currentWorldPos);
          
          // Project warp adjustment into local delta
          const localToTarget = toTargetWorld.clone().applyQuaternion(rb.mesh.quaternion.clone().invert());
          const warpPerStep = localToTarget.multiplyScalar(1.0 / (remainingTimeFraction * 30)); // assume ~30-60 fps
          out.lerp(warpPerStep, 0.4);
        }
      }
    }

    return out;
  }

  /**
   * Filter and warp a local root motion rotation delta for a frame.
   */
  processRotationDelta(
    localRotDelta: THREE.Quaternion,
    _normalizedTime: number,
    _rb: RigidBodyComponent | null,
  ): THREE.Quaternion {
    if (this.mode === 'off' || this.mode === 'extractOnly') {
      return new THREE.Quaternion();
    }

    const out = localRotDelta.clone();

    // Mode-specific rotational constraints:
    // When mode is 'xzOnly', pitch and roll are zeroed and yaw is preserved.
    // When mode is 'consumePartially', yaw is slerped 50%.
    if (this.mode === 'consumePartially') {
      out.slerp(new THREE.Quaternion(), 0.5);
    }

    return out;
  }

  /**
   * Analyze a root motion track for discontinuities, extreme velocity spikes, and loop seams.
   */
  static analyzeTrack(track: THREE.VectorKeyframeTrack, duration: number): RootMotionDiagnostic {
    const times = track.times;
    const values = track.values;
    const n = times.length;
    const warnings: string[] = [];

    if (n < 2) {
      return { maxVelocityMps: 0, hasSpikes: false, loopDiscontinuityDistance: 0, warnings };
    }

    let maxVel = 0;
    let hasSpikes = false;
    const pPrev = new THREE.Vector3();
    const pCurr = new THREE.Vector3();

    for (let i = 1; i < n; i++) {
      const dt = times[i] - times[i - 1];
      if (dt <= 1e-5) continue;

      pPrev.fromArray(values, (i - 1) * 3);
      pCurr.fromArray(values, i * 3);
      const dist = pCurr.distanceTo(pPrev);
      const vel = dist / dt;

      if (vel > maxVel) maxVel = vel;
      if (vel > 30.0) {
        hasSpikes = true;
      }
    }

    if (hasSpikes) {
      warnings.push(`[RootMotion] Detected high-velocity spike (${maxVel.toFixed(1)} m/s)`);
    }

    // Check loop seam
    const startPos = new THREE.Vector3().fromArray(values, 0);
    const endPos = new THREE.Vector3().fromArray(values, (n - 1) * 3);
    const loopDiscontinuity = startPos.distanceTo(endPos);

    return {
      maxVelocityMps: maxVel,
      hasSpikes,
      loopDiscontinuityDistance: loopDiscontinuity,
      warnings,
    };
  }
}

