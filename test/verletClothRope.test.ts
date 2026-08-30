import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VerletClothRope } from '../src/physics/VerletClothRope';

describe('Verlet Cloth & Rope Physics Simulation (S13)', () => {
  it('simulates pinned rope sagging under gravity with distance constraints', () => {
    const rope = new VerletClothRope();

    // Particle 0 pinned at (0, 10, 0)
    const p0 = rope.addParticle(new THREE.Vector3(0, 10, 0), true);
    // Particle 1 free at (0, 9, 0)
    const p1 = rope.addParticle(new THREE.Vector3(0, 9, 0), false);
    // Particle 2 free at (0, 8, 0)
    const p2 = rope.addParticle(new THREE.Vector3(0, 8, 0), false);

    rope.addConstraint(p0, p1, 1.0);
    rope.addConstraint(p1, p2, 1.0);

    // Step simulation forward
    for (let i = 0; i < 30; i++) {
      rope.step(0.016, 5);
    }

    // Pinned particle hasn't moved
    expect(rope.particles[0].pos.y).toBeCloseTo(10.0, 4);

    // Free particles fall but maintain constraint length (~1.0m apart)
    const d01 = rope.particles[0].pos.distanceTo(rope.particles[1].pos);
    const d12 = rope.particles[1].pos.distanceTo(rope.particles[2].pos);

    expect(d01).toBeCloseTo(1.0, 2);
    expect(d12).toBeCloseTo(1.0, 2);
  });

  it('generates cloth grid and pushes particles outside collision spheres', () => {
    const cloth = VerletClothRope.createClothGrid(2.0, 2.0, 4, 4, true);

    expect(cloth.particles.length).toBe(25); // (4+1)*(4+1)
    expect(cloth.constraints.length).toBeGreaterThan(30);

    // Place collision sphere at center of hanging cloth
    cloth.addCollisionSphere(new THREE.Vector3(0, -1, 0), 0.5);

    for (let i = 0; i < 20; i++) {
      cloth.step(0.016, 4);
    }

    // Ensure all particles are at or outside sphere radius
    for (const p of cloth.particles) {
      if (!p.pinned) {
        const dist = p.pos.distanceTo(new THREE.Vector3(0, -1, 0));
        expect(dist).toBeGreaterThanOrEqual(0.48); // within small numerical tolerance
      }
    }
  });
});
