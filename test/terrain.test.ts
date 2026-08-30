import { describe, it, expect } from 'vitest';
import {
  Heightmap, brushWeight, applyRaise, applySmooth, applyFlatten, applyRamp, applyNoise
} from '../src/terrain/Heightmap';
import { makeFbm, mulberry32 } from '../src/terrain/noise';
import { erodeThermal, erodeHydraulic } from '../src/terrain/erosion';

describe('brushWeight', () => {
  it('matches the worked-number table', () => {
    expect(brushWeight(0, 1.5, 0)).toBeCloseTo(1, 6);
    expect(brushWeight(1, 1.5, 0)).toBeCloseTo(0.259, 2);
    expect(brushWeight(1.4142, 1.5, 0)).toBeCloseTo(0.010, 2);
    expect(brushWeight(2, 1.5, 0)).toBe(0);
  });
  it('hardness makes a flat top and is monotonic', () => {
    expect(brushWeight(1, 5, 1)).toBe(1);                 // inside inner radius
    expect(brushWeight(2, 5, 0)).toBeGreaterThan(brushWeight(3, 5, 0));
  });
});

describe('applyRaise', () => {
  it('raises the centre by amount and leaves far vertices untouched', () => {
    const hm = new Heightmap(7, 6);                       // step 1, half 3
    applyRaise(hm, 0, 0, 2, 0, 1, +1);
    expect(hm.heights[hm.idx(3, 3)]).toBeCloseTo(1, 6);   // centre, w=1
    expect(hm.heights[hm.idx(0, 0)]).toBe(0);             // corner, d>R
  });
});

describe('applySmooth (read-before-write)', () => {
  it('lowers a spike and raises its neighbour', () => {
    const hm = new Heightmap(7, 6);
    hm.heights[hm.idx(3, 3)] = 9;
    applySmooth(hm, 0, 0, 2.5, 0, 1);
    expect(hm.heights[hm.idx(3, 3)]).toBeLessThan(9);
    expect(hm.heights[hm.idx(4, 3)]).toBeGreaterThan(0);
  });
});

describe('applyFlatten', () => {
  it('converges toward the target', () => {
    const hm = new Heightmap(7, 6);
    for (let k = 0; k < hm.heights.length; k++) hm.heights[k] = 5;
    for (let n = 0; n < 50; n++) applyFlatten(hm, 0, 0, 2, 0, 1, 2);  // target 2
    expect(hm.heights[hm.idx(3, 3)]).toBeCloseTo(2, 1);
  });
});

describe('applyRamp', () => {
  it('interpolates height linearly along the segment', () => {
    const hm = new Heightmap(21, 20);                     // step 1, half 10, x in [-10,10]
    applyRamp(hm, { x: -5, y: 0, z: 0 }, { x: 5, y: 10, z: 0 }, 2, 1);
    const at = (x: number) => hm.heights[hm.idx(x + 10, 10)]; // z=0 row is j=10
    expect(at(-5)).toBeCloseTo(0, 1);
    expect(at(0)).toBeCloseTo(5, 1);
    expect(at(5)).toBeCloseTo(10, 1);
  });
});

describe('noise', () => {
  it('is deterministic for a fixed seed and bounded', () => {
    const a = makeFbm(42), b = makeFbm(42);
    expect(a(1.3, 2.7, 0.1)).toBeCloseTo(b(1.3, 2.7, 0.1), 6);
    expect(Math.abs(a(9.1, -4.2, 0.05))).toBeLessThanOrEqual(1);
  });
});

describe('erosion', () => {
  it('thermal conserves total height', () => {
    const res = 16, h = new Float32Array(res * res);
    const rng = mulberry32(1); for (let i = 0; i < h.length; i++) h[i] = rng() * 10;
    const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);
    const before = sum(h);
    erodeThermal(h, res, 0.5, 0.5, 10, { i0: 0, i1: res - 1, j0: 0, j1: res - 1 });
    expect(sum(h)).toBeCloseTo(before, 2);
  });
  it('hydraulic produces no NaN and changes the field', () => {
    const res = 32, h = new Float32Array(res * res);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) h[j * res + i] = (res - i) * 0.5; // slope
    const copy = Float32Array.from(h);
    erodeHydraulic(h, res, {
      iterations: 500, maxLifetime: 30, inertia: 0.05, capacityFactor: 4, minCapacity: 0.01,
      depositSpeed: 0.3, erodeSpeed: 0.3, evaporateSpeed: 0.01, gravity: 4, erosionRadius: 3,
      startSpeed: 1, startWater: 1,
    }, mulberry32(7), { i0: 1, i1: res - 2, j0: 1, j1: res - 2 });
    expect(h.every(Number.isFinite)).toBe(true);
    expect(h.some((v, k) => v !== copy[k])).toBe(true);
  });
});

describe('Heightmap.sampleLocal', () => {
  it('bilinearly samples between vertices', () => {
    const hm = new Heightmap(5, 4);                       // step 1, half 2
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) hm.heights[hm.idx(i, j)] = i * 1 - 2; // = local x
    expect(hm.sampleLocal(0.5, 0)).toBeCloseTo(0.5, 6);
  });
});

describe('Heightmap base64 (terrain persistence)', () => {
  it('round-trips heights exactly', () => {
    const hm = new Heightmap(17, 32);
    const rng = mulberry32(3);
    for (let k = 0; k < hm.heights.length; k++) hm.heights[k] = (rng() - 0.5) * 20;
    const restored = new Heightmap(17, 32);
    expect(restored.fromBase64(hm.toBase64())).toBe(true);
    expect(Array.from(restored.heights)).toEqual(Array.from(hm.heights));
  });

  it('ignores a resolution mismatch instead of corrupting the field', () => {
    const hm = new Heightmap(17, 32);
    hm.heights[0] = 5;
    const wrongSize = new Heightmap(9, 32);
    expect(wrongSize.fromBase64(hm.toBase64())).toBe(false); // different byte length → no-op
    expect(wrongSize.heights[0]).toBe(0);
  });
});
