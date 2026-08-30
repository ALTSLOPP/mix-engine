import { describe, it, expect } from 'vitest';
import { windGust, WindSystem } from '../src/world/WindSystem';
import { placeFoliage, treeGeometry, bushGeometry, type FoliageRule } from '../src/world/FoliageSystem';
import { mulberry32 } from '../src/terrain/noise';

describe('windGust', () => {
  it('is exactly 1 with zero gustiness, and bounded by ±gustiness otherwise', () => {
    for (let t = 0; t < 20; t += 0.37) expect(windGust(t, 0)).toBeCloseTo(1, 9);
    const g = 0.4;
    for (let t = 0; t < 50; t += 0.13) {
      const v = windGust(t, g);
      expect(v).toBeGreaterThanOrEqual(1 - g - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + g + 1e-9);
    }
  });
  it('is deterministic', () => {
    expect(windGust(3.21, 0.5)).toBe(windGust(3.21, 0.5));
  });
});

describe('WindSystem', () => {
  const fakeEngine = { addUpdateHook: () => () => {} } as any;

  it('normalizes direction and applies strength to the wind vector', () => {
    const w = new WindSystem(fakeEngine);
    w.set({ dirX: 3, dirZ: 4, strength: 2, gustiness: 0 });
    expect(w.dir.length()).toBeCloseTo(1, 6);
    expect(w.dir.x).toBeCloseTo(0.6, 6);
    expect(w.dir.y).toBeCloseTo(0.8, 6);
    // gustiness 0 ⇒ current strength is exactly the base strength.
    expect(w.current()).toBeCloseTo(2, 6);
    const v = w.vector();
    expect(v.length()).toBeCloseTo(2, 6);
  });

  it('ignores a zero direction (keeps a valid unit vector)', () => {
    const w = new WindSystem(fakeEngine);
    w.set({ dirX: 0, dirZ: 0 });
    expect(w.dir.length()).toBeCloseTo(1, 6);
  });
});

describe('foliage geometry (regression: indexed Cylinder + non-indexed Icosahedron must merge)', () => {
  it('treeGeometry merges trunk + canopy into one valid vertex-coloured geometry', () => {
    const g = treeGeometry();
    expect(g).toBeTruthy();
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    expect(pos).toBeTruthy();
    expect(col).toBeTruthy();
    expect(pos.count).toBeGreaterThan(0);
    expect(col.count).toBe(pos.count); // a colour per vertex (needed by vertexColors)
    expect(g.getAttribute('uv')).toBeUndefined(); // uv dropped so all parts share one attribute set
  });
  it('bushGeometry is valid too', () => {
    const g = bushGeometry();
    expect(g.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('placeFoliage', () => {
  const region = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const rule: FoliageRule = {
    layer: 0, weightThreshold: 0.5, maxSlope: 0.6, minHeight: 1, maxHeight: 90,
    density: 0.02, maxCount: 5000, minScale: 0.8, maxScale: 1.6,
  };
  const rng = () => mulberry32(1)(); // fresh deterministic stream per call is fine for counts

  it('places instances on valid ground (weight ok, gentle, in height band)', () => {
    const out = placeFoliage(rule, region, () => 1, () => 0.1, () => 20, mulberry32(1));
    expect(out.length).toBeGreaterThan(0);
    for (const inst of out) {
      expect(inst.scale).toBeGreaterThanOrEqual(rule.minScale);
      expect(inst.scale).toBeLessThanOrEqual(rule.maxScale);
    }
  });

  it('rejects everything below the trigger weight', () => {
    const out = placeFoliage(rule, region, () => 0.2, () => 0, () => 20, mulberry32(1));
    expect(out).toHaveLength(0);
  });

  it('rejects steep ground (cliffs)', () => {
    const out = placeFoliage(rule, region, () => 1, () => 2.0, () => 20, mulberry32(1));
    expect(out).toHaveLength(0);
  });

  it('rejects below the waterline and above the peak band', () => {
    expect(placeFoliage(rule, region, () => 1, () => 0, () => 0, mulberry32(1))).toHaveLength(0);   // underwater
    expect(placeFoliage(rule, region, () => 1, () => 0, () => 200, mulberry32(1))).toHaveLength(0); // too high
  });

  it('honours maxCount', () => {
    const capped: FoliageRule = { ...rule, density: 1, maxCount: 25 };
    const out = placeFoliage(capped, region, () => 1, () => 0, () => 20, mulberry32(1));
    expect(out.length).toBeLessThanOrEqual(25);
  });
});
