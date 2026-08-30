import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

/**
 * Handles velocity inheritance and momentum transfer when standing on moving platforms.
 */
export class PlatformRider {
  private lastGroundBody: RAPIER.RigidBody | null = null;
  private lastGroundPos = new THREE.Vector3();
  readonly platformVelocity = new THREE.Vector3();

  update(
    physicsWorld: PhysicsWorld,
    groundColliderHandle: number | null,
    fixedDt: number,
  ): void {
    if (groundColliderHandle === null || groundColliderHandle === undefined) {
      this.lastGroundBody = null;
      this.platformVelocity.set(0, 0, 0);
      return;
    }

    const groundBody = physicsWorld.rapierBodyFromColliderHandle(groundColliderHandle);
    if (!groundBody) {
      this.lastGroundBody = null;
      this.platformVelocity.set(0, 0, 0);
      return;
    }

    const currentPos = groundBody.translation();
    if (this.lastGroundBody === groundBody && fixedDt > 0) {
      this.platformVelocity.set(
        (currentPos.x - this.lastGroundPos.x) / fixedDt,
        (currentPos.y - this.lastGroundPos.y) / fixedDt,
        (currentPos.z - this.lastGroundPos.z) / fixedDt,
      );
    } else {
      this.platformVelocity.set(0, 0, 0);
    }

    this.lastGroundBody = groundBody;
    this.lastGroundPos.set(currentPos.x, currentPos.y, currentPos.z);
  }

  reset(): void {
    this.lastGroundBody = null;
    this.platformVelocity.set(0, 0, 0);
  }
}
