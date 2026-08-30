// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ParticleEmitter } from '../src/vfx/ParticleEmitter';

/**
 * Regression for the position-buffer stride bug: the CPU writer indexed the position
 * array with a stride of 4 floats/particle while the GPU `position` attribute read it
 * with itemSize 3, so every particle past index 0 rendered at a neighbour's coordinates.
 * The core invariant is `array.length === count * itemSize`.
 */
describe('ParticleEmitter buffer layout', () => {
  it('keeps the position attribute self-consistent (array.length === count * itemSize)', () => {
    const scene = new THREE.Scene();
    const em = new ParticleEmitter(scene, new THREE.Vector3(0, 0, 0), { preset: 'sparks', maxParticles: 128 });
    const pos = em.points.geometry.attributes.position as THREE.BufferAttribute;
    expect(pos.itemSize).toBe(3);
    expect(pos.count).toBe(128);
    expect(pos.array.length).toBe(pos.count * pos.itemSize);
    em.dispose();
  });

  it('writes distinct, finite positions for burst particles (no collapse to one point)', () => {
    const scene = new THREE.Scene();
    const em = new ParticleEmitter(scene, new THREE.Vector3(0, 2, 0), { preset: 'sparks', loop: false, maxParticles: 64 });
    em.burst(20);
    for (let i = 0; i < 4; i++) em.update(0.05); // integrate a few frames

    const pos = em.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const seen = new Set<string>();
    let alive = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      if (x !== 0 || y !== 0 || z !== 0) { alive++; seen.add(`${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`); }
    }
    expect(alive).toBeGreaterThan(5);
    // Distinct positions prove particles aren't all sampling the same misaligned slot.
    expect(seen.size).toBeGreaterThan(5);
    em.dispose();
  });
});
