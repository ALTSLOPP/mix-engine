/**
 * MultiTargetCamera — Smart framing and lock-on camera controller for arena combat.
 *
 * Dynamically frames N combatant entities within camera viewport using bounding sphere math.
 */

import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';

export interface FramingCameraConfig {
  minDistance?: number; // default 6
  maxDistance?: number; // default 35
  padding?: number; // extra framing margin (default 1.4)
  verticalOffset?: number; // default 1.5
  smoothSpeed?: number; // damping speed (default 5.0)
  pitchDeg?: number; // pitch angle in degrees (default 15)
  fov?: number; // default 50
  minHeight?: number; // minimum Y floor height to prevent clipping (default 1.0)
}

export class MultiTargetCamera {
  private readonly targetIds: EntityId[] = [];
  private readonly config: Required<FramingCameraConfig>;

  private readonly _targetPositions: THREE.Vector3[] = [];
  private readonly _centroid = new THREE.Vector3();
  private readonly _desiredPos = new THREE.Vector3();
  private readonly _currentPos = new THREE.Vector3();
  private readonly _currentLookAt = new THREE.Vector3();
  private readonly _desiredLookAt = new THREE.Vector3();

  constructor(config: FramingCameraConfig = {}) {
    this.config = {
      minDistance: config.minDistance ?? 6,
      maxDistance: config.maxDistance ?? 35,
      padding: config.padding ?? 1.4,
      verticalOffset: config.verticalOffset ?? 1.5,
      smoothSpeed: config.smoothSpeed ?? 5.0,
      pitchDeg: config.pitchDeg ?? 15,
      fov: config.fov ?? 50,
      minHeight: config.minHeight ?? 1.0,
    };
  }

  /**
   * Sets the list of entity IDs to keep framed in the camera viewport.
   */
  setTargets(entityIds: EntityId[]): void {
    this.targetIds.length = 0;
    this.targetIds.push(...entityIds);
  }

  /**
   * Adds a target entity.
   */
  addTarget(entityId: EntityId): void {
    if (!this.targetIds.includes(entityId)) {
      this.targetIds.push(entityId);
    }
  }

  /**
   * Removes a target entity.
   */
  removeTarget(entityId: EntityId): void {
    const idx = this.targetIds.indexOf(entityId);
    if (idx !== -1) this.targetIds.splice(idx, 1);
  }

  get hasTargets(): boolean { return this.targetIds.length > 0; }

  /**
   * Instantly snaps the camera to desired framing position without damping lag.
   */
  snap(camera?: THREE.PerspectiveCamera): void {
    this._currentPos.copy(this._desiredPos);
    this._currentLookAt.copy(this._desiredLookAt);
    if (camera) {
      camera.position.copy(this._currentPos);
      camera.lookAt(this._currentLookAt);
    }
  }

  /**
   * Updates camera position and orientation based on live target positions.
   */
  update(camera: THREE.PerspectiveCamera, sceneManager: SceneManager, deltaSec: number): void {
    this._targetPositions.length = 0;

    for (const id of this.targetIds) {
      const rb = sceneManager.getRigidBody(id);
      if (rb) {
        this._targetPositions.push(rb.mesh.position.clone());
      }
    }

    if (this._targetPositions.length === 0) return;
    if (camera.fov !== this.config.fov) {
      camera.fov = this.config.fov;
      camera.updateProjectionMatrix();
    }

    // 1. Calculate Centroid
    this._centroid.set(0, 0, 0);
    for (const p of this._targetPositions) {
      this._centroid.add(p);
    }
    this._centroid.divideScalar(this._targetPositions.length);

    // 2. Calculate Bounding Radius from Centroid
    let maxDistSq = 0;
    for (const p of this._targetPositions) {
      const dSq = this._centroid.distanceToSquared(p);
      if (dSq > maxDistSq) maxDistSq = dSq;
    }
    const radius = Math.max(1.0, Math.sqrt(maxDistSq));

    // 3. Compute Required Camera Distance
    const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * Math.max(camera.aspect, 0.0001));
    const limitingHalfFov = Math.min(halfVerticalFov, halfHorizontalFov);
    const calculatedDist = (radius * this.config.padding) / Math.tan(limitingHalfFov);
    const targetDist = THREE.MathUtils.clamp(
      calculatedDist,
      this.config.minDistance,
      this.config.maxDistance
    );

    // 4. Calculate Desired Camera Position with Pitch Offset & Floor Clamp
    const pitchRad = THREE.MathUtils.degToRad(this.config.pitchDeg);
    const heightOffset = targetDist * Math.sin(pitchRad) + this.config.verticalOffset;
    const horizontalDist = targetDist * Math.cos(pitchRad);

    const targetY = Math.max(this.config.minHeight, this._centroid.y + heightOffset);

    this._desiredPos.set(
      this._centroid.x,
      targetY,
      this._centroid.z + horizontalDist
    );

    this._desiredLookAt.set(
      this._centroid.x,
      this._centroid.y + this.config.verticalOffset * 0.5,
      this._centroid.z
    );

    // 5. Smooth Interpolation (Damping)
    const t = 1 - Math.exp(-Math.max(0, deltaSec) * this.config.smoothSpeed);
    if (this._currentPos.lengthSq() === 0) {
      this._currentPos.copy(this._desiredPos);
      this._currentLookAt.copy(this._desiredLookAt);
    } else {
      this._currentPos.lerp(this._desiredPos, t);
      this._currentLookAt.lerp(this._desiredLookAt, t);
    }

    camera.position.copy(this._currentPos);
    camera.lookAt(this._currentLookAt);
  }

  /**
   * Resets camera smoothing memory.
   */
  reset(): void {
    this._currentPos.set(0, 0, 0);
    this._currentLookAt.set(0, 0, 0);
    this.targetIds.length = 0;
  }
}
