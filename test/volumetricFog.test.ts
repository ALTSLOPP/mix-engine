import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VolumetricFogSystem } from '../src/rendering/VolumetricFogSystem';

describe('Volumetric Fog & Atmospheric Density (S12)', () => {
  it('computes exponential height falloff density', () => {
    const fog = new VolumetricFogSystem({
      density: 0.05,
      heightFalloff: 0.1,
      groundLevel: 0,
    });

    // At ground level (y=0), density should be base density
    const groundDensity = fog.sampleDensity(new THREE.Vector3(0, 0, 0));
    expect(groundDensity).toBeCloseTo(0.05, 4);

    // At y=10m, density should decay by exp(-0.1 * 10) = exp(-1) ≈ 0.3678 * 0.05 ≈ 0.01839
    const highDensity = fog.sampleDensity(new THREE.Vector3(0, 10, 0));
    expect(highDensity).toBeCloseTo(0.05 * Math.exp(-1), 4);
    expect(highDensity).toBeLessThan(groundDensity);
  });

  it('accumulates density from local fog volumes and computes phase function', () => {
    const fog = new VolumetricFogSystem({
      density: 0.0,
      anisotropy: 0.5,
    });

    fog.addFogVolume({
      id: 'smoke_puff',
      position: new THREE.Vector3(10, 0, 10),
      radius: 5.0,
      density: 0.2,
      color: new THREE.Color(0xffffff),
    });

    // Center of volume
    const centerDensity = fog.sampleDensity(new THREE.Vector3(10, 0, 10));
    expect(centerDensity).toBeCloseTo(0.2, 3);

    // Outside radius
    const outsideDensity = fog.sampleDensity(new THREE.Vector3(20, 0, 10));
    expect(outsideDensity).toBe(0);

    // Henyey-Greenstein forward vs backward scattering
    const forwardPhase = fog.computePhaseFunction(1.0); // theta = 0 (cosTheta = 1)
    const backwardPhase = fog.computePhaseFunction(-1.0); // theta = PI (cosTheta = -1)
    expect(forwardPhase).toBeGreaterThan(backwardPhase);
  });
});
