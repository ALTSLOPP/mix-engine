import { describe, it, expect } from 'vitest';
import { placeScatter } from '../src/terrain/TerrainScatter';
import { mulberry32 } from '../src/terrain/noise';

describe('placeScatter (pure kernel)', () => {
  const region = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const type = { layer: 0, weightThreshold: 0.5, maxSlope: 1, density: 0.25, maxCount: 100000, minScale: 1, maxScale: 2 };

  it('only places where the trigger layer weight ≥ threshold', () => {
    // weight is high only for x > 0
    const res = placeScatter(type, region, (x) => (x > 0 ? 1 : 0), () => 0, mulberry32(1));
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((i) => i.x > 0)).toBe(true);
  });

  it('rejects steep slopes', () => {
    const res = placeScatter(type, region, () => 1, () => 5, mulberry32(1)); // slope 5 > maxSlope 1
    expect(res.length).toBe(0);
  });

  it('is deterministic for a fixed seed and honours maxCount + scale range', () => {
    const a = placeScatter(type, region, () => 1, () => 0, mulberry32(7));
    const b = placeScatter(type, region, () => 1, () => 0, mulberry32(7));
    expect(a.length).toBe(b.length);
    expect(a[0]).toEqual(b[0]);
    expect(a.every((i) => i.scale >= 1 && i.scale <= 2)).toBe(true);

    const capped = placeScatter({ ...type, maxCount: 10 }, region, () => 1, () => 0, mulberry32(7));
    expect(capped.length).toBe(10);
  });
});
