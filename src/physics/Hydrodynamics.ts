import * as THREE from 'three';

export interface HydrodynamicParams {
  fluidDensity?: number; // kg/m^3 (default 1000 for water)
  linearDrag?: number;   // Linear resistance (default 0.8)
  quadraticDrag?: number;// High-speed turbulent resistance (default 0.2)
  angularDrag?: number;  // Rotational stabilization (default 0.6)
  gravity?: number;      // m/s^2 (default 9.81)
}

export interface BuoyancyResult {
  force: THREE.Vector3;
  submersionRatio: number; // 0 = completely dry, 1 = completely submerged
  isSubmerged: boolean;
  waterHeight: number;
}

/**
 * Hydrodynamics.ts — Physical buoyancy and fluid resistance simulation over Gerstner wave water.
 */
export class Hydrodynamics {
  fluidDensity: number;
  linearDrag: number;
  quadraticDrag: number;
  angularDrag: number;
  gravity: number;

  constructor(params: HydrodynamicParams = {}) {
    this.fluidDensity = params.fluidDensity ?? 1000.0;
    this.linearDrag = params.linearDrag ?? 0.8;
    this.quadraticDrag = params.quadraticDrag ?? 0.2;
    this.angularDrag = params.angularDrag ?? 0.6;
    this.gravity = params.gravity ?? 9.81;
  }

  /**
   * Compute buoyant lift force and hydrodynamic drag for an object at world coordinates.
   */
  computeForces(
    worldPos: THREE.Vector3,
    boundingHeight: number,
    volume: number,
    waterHeight: number,
    velocity?: THREE.Vector3,
  ): BuoyancyResult {
    const bottomY = worldPos.y - boundingHeight / 2;
    const topY = worldPos.y + boundingHeight / 2;

    let submersionRatio = 0;
    if (topY <= waterHeight) {
      // Entirely underwater
      submersionRatio = 1.0;
    } else if (bottomY >= waterHeight) {
      // Completely out of water
      submersionRatio = 0.0;
    } else if (boundingHeight > 0) {
      // Partially submerged
      submersionRatio = (waterHeight - bottomY) / boundingHeight;
    }

    submersionRatio = THREE.MathUtils.clamp(submersionRatio, 0, 1);
    const isSubmerged = submersionRatio > 0.01;

    const force = new THREE.Vector3(0, 0, 0);

    if (isSubmerged) {
      // Archimedes buoyant force: F_up = rho * V_sub * g
      const displacedVolume = volume * submersionRatio;
      const buoyantMagnitude = this.fluidDensity * displacedVolume * this.gravity * 0.001; // Scaled to game units
      force.y += buoyantMagnitude;

      // Hydrodynamic fluid drag: -v * (linearDrag + quadraticDrag * |v|) * submersionRatio
      if (velocity) {
        const speed = velocity.length();
        const dragFactor = (this.linearDrag + this.quadraticDrag * speed) * submersionRatio;
        force.x -= velocity.x * dragFactor;
        force.y -= velocity.y * dragFactor;
        force.z -= velocity.z * dragFactor;
      }
    }

    return {
      force,
      submersionRatio,
      isSubmerged,
      waterHeight,
    };
  }
}
