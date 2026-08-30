import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Path } from '../src/cinematic/Path';

describe('Path.sampleUniform', () => {
  it('produces ~uniform arc-length spacing for equal t-steps (non-uniform control points)', () => {
    // Native-t spacing is non-uniform in arc length here: two short segments then a long
    // one (arc lengths ~1, 1, 6). Arc-length reparam must even out the per-step distance.
    // (With the getPointAt double-reparam bug this ratio blows up to several hundred %.)
    const path = new Path([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(8, 0, 0),
    ]);
    const N = 40;
    const out = new THREE.Vector3();
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) { path.sampleUniform(i / N, out); samples.push(out.clone()); }
    const dists: number[] = [];
    for (let i = 1; i < samples.length; i++) dists.push(samples[i].distanceTo(samples[i - 1]));
    const avg = dists.reduce((s, v) => s + v, 0) / dists.length;
    const maxDev = Math.max(...dists.map((d) => Math.abs(d - avg)));
    // Correct reparam keeps every step within 10% of the mean (in practice <1%).
    expect(maxDev / avg).toBeLessThan(0.1);
  });

  it('hits the path endpoints at t=0 and t=1', () => {
    const path = new Path([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    path.sampleUniform(0, a);
    path.sampleUniform(1, b);
    expect(a.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(0.3);
    expect(b.distanceTo(new THREE.Vector3(10, 0, 0))).toBeLessThan(0.3);
  });
});

describe('Path.tangentUniform', () => {
  it('writes the unit tangent into out (not the position sample)', () => {
    // A straight +X path: the tangent is (1,0,0) everywhere. The old implementation
    // sampled the position into `out` and returned the tangent in a private temp, so
    // callers reading `out` got the position (garbage) instead of the direction.
    const path = new Path([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);
    const out = new THREE.Vector3();
    path.tangentUniform(0.5, out);
    expect(out.x).toBeCloseTo(1, 1);
    expect(Math.abs(out.y)).toBeLessThan(1e-6);
    expect(Math.abs(out.z)).toBeLessThan(1e-6);
  });

  it('returns a unit-length tangent', () => {
    const path = new Path([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(3, 4, 0),
      new THREE.Vector3(6, 0, 0),
    ]);
    const out = new THREE.Vector3();
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      path.tangentUniform(t, out);
      expect(out.length()).toBeCloseTo(1, 3);
    }
  });
});
