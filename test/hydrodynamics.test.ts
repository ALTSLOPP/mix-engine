import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Hydrodynamics } from '../src/physics/Hydrodynamics';

describe('Hydrodynamics Physical Buoyancy and Fluid Drag', () => {
  it('computes zero force when completely out of water', () => {
    const hydro = new Hydrodynamics({ fluidDensity: 1000 });
    const pos = new THREE.Vector3(0, 10, 0); // 10m above water
    const waterY = 0;

    const result = hydro.computeForces(pos, 1.0, 1.0, waterY, new THREE.Vector3(0, -5, 0));
    expect(result.submersionRatio).toBe(0);
    expect(result.isSubmerged).toBe(false);
    expect(result.force.y).toBe(0);
  });

  it('computes upward buoyant lift and fluid drag when submerged', () => {
    const hydro = new Hydrodynamics({
      fluidDensity: 1000,
      linearDrag: 1.0,
    });

    const pos = new THREE.Vector3(0, -1, 0); // 1m underwater
    const waterY = 0;
    const velocity = new THREE.Vector3(2, -4, 0);

    const result = hydro.computeForces(pos, 1.0, 1.0, waterY, velocity);
    expect(result.submersionRatio).toBe(1.0);
    expect(result.isSubmerged).toBe(true);

    // Buoyant force must be upward (+Y)
    expect(result.force.y).toBeGreaterThan(0);

    // Horizontal fluid drag must oppose velocity (+X velocity -> -X drag force)
    expect(result.force.x).toBeLessThan(0);
  });

  it('correctly calculates partial submersion fractional ratio', () => {
    const hydro = new Hydrodynamics();
    const pos = new THREE.Vector3(0, 0, 0); // Center at water surface
    const boundingHeight = 2.0; // Extends from Y=-1 to Y=+1
    const waterY = 0;

    const result = hydro.computeForces(pos, boundingHeight, 1.0, waterY);
    // Submerged from Y=-1 to Y=0 -> exactly 50% submerged
    expect(result.submersionRatio).toBeCloseTo(0.5);
    expect(result.isSubmerged).toBe(true);
    expect(result.force.y).toBeGreaterThan(0);
  });
});
