import { describe, it, expect } from 'vitest';
import { SplatMap, paintCircle } from '../src/terrain/SplatMap';

describe('SplatMap pure kernel', () => {
  it('paintCircle correctly blends weights to target layer', () => {
    const res = 16;
    const size = 16;
    const weights = new Uint8Array(res * res * 4);
    // Init fully to layer 0
    for (let i = 0; i < weights.length; i += 4) {
      weights[i] = 255;
    }

    // Paint layer 1 at origin
    paintCircle(weights, res, size, 1, 0, 0, 4, 0, 1.0);

    const centerIdx = ((res / 2) * res + (res / 2)) * 4;
    // Should be fully layer 1
    expect(weights[centerIdx + 0]).toBeLessThan(10);
    expect(weights[centerIdx + 1]).toBeGreaterThan(245);
    expect(weights[centerIdx + 2]).toBe(0);
    expect(weights[centerIdx + 3]).toBe(0);

    // Sum should be 255 everywhere
    for (let i = 0; i < weights.length; i += 4) {
      const sum = weights[i] + weights[i+1] + weights[i+2] + weights[i+3];
      expect(sum).toBe(255);
    }
  });

  it('SplatMap initializes correctly', () => {
    const splat = new SplatMap(8);
    expect(splat.weights[0]).toBe(255);
    expect(splat.weights[1]).toBe(0);
  });

  it('rejects truncated serialized weights instead of partially restoring', () => {
    const splat = new SplatMap(8);
    const before = splat.weights.slice();
    const truncated = Buffer.from(new Uint8Array(8)).toString('base64');
    expect(splat.fromBase64(truncated)).toBe(false);
    expect(splat.weights).toEqual(before);
  });
});
