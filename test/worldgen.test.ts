import { describe, it, expect } from 'vitest';
import {
  generateHeightmap, classifyBiome, paintBiomeSplat, buildWorld, slopeAt, Biome, BIOME_LAYER, CLIMATES,
} from '../src/terrain/worldgen';

describe('worldgen.generateHeightmap', () => {
  it('is deterministic for a given seed and varies with the seed', () => {
    const a = generateHeightmap(65, { seed: 42 }).heights;
    const b = generateHeightmap(65, { seed: 42 }).heights;
    const c = generateHeightmap(65, { seed: 43 }).heights;
    expect(Array.from(a)).toEqual(Array.from(b));        // same seed → identical field
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - c[i]) > 1e-6) diff++;
    expect(diff).toBeGreaterThan(a.length * 0.5);          // different seed → mostly different
  });

  it('produces both land and ocean with sea level at 0', () => {
    const { heights, stats } = generateHeightmap(129, { seed: 7, amplitude: 120, landBias: 0.15 });
    expect(stats.seaLevel).toBe(0);
    expect(stats.min).toBeLessThan(0);                    // ocean basins
    expect(stats.max).toBeGreaterThan(0);                 // land
    expect(stats.waterFraction).toBeGreaterThan(0.02);
    expect(stats.waterFraction).toBeLessThan(0.98);
    // Peaks stay within a sane multiple of the amplitude budget.
    expect(stats.max).toBeLessThan(120 * 1.6);
    expect(heights.length).toBe(129 * 129);
  });

  it('ignores explicit undefined params (regression: command forwards unset args as undefined → NaN)', () => {
    // The world_generate AICommand passes every unset param as `undefined`; a naive
    // {...DEFAULTS, ...options} spread would clobber the defaults → x*undefined → NaN heights.
    const { heights, stats } = generateHeightmap(33, {
      seed: 5, amplitude: 100,
      continentScale: undefined, mountainScale: undefined, landBias: undefined,
      hillScale: undefined, detailScale: undefined, warp: undefined, oceanDepthRatio: undefined,
    });
    expect(Number.isFinite(stats.min)).toBe(true);
    expect(Number.isFinite(stats.max)).toBe(true);
    for (let i = 0; i < heights.length; i++) expect(Number.isNaN(heights[i])).toBe(false);
  });

  it('island mode rings the world with ocean at the edges', () => {
    const res = 129;
    const { heights } = generateHeightmap(res, { seed: 3, island: true, islandFalloff: 1 });
    // Sample the four edge midpoints — all should be underwater (negative).
    const mid = (res - 1) >> 1;
    const idx = (i: number, j: number) => heights[j * res + i];
    expect(idx(0, mid)).toBeLessThan(0);
    expect(idx(res - 1, mid)).toBeLessThan(0);
    expect(idx(mid, 0)).toBeLessThan(0);
    expect(idx(mid, res - 1)).toBeLessThan(0);
  });
});

describe('worldgen.classifyBiome', () => {
  const p = { amplitude: 120 };
  it('classifies ocean / beach / lowland / rock / peak by height + slope', () => {
    expect(classifyBiome(-5, 0.1, p)).toBe(Biome.Ocean);
    expect(classifyBiome(0.5, 0.1, p)).toBe(Biome.Beach);     // low + gentle
    expect(classifyBiome(40, 0.2, p)).toBe(Biome.Lowland);    // mid + gentle
    expect(classifyBiome(40, 1.5, p)).toBe(Biome.Rock);       // steep → cliff regardless of height
    expect(classifyBiome(115, 0.1, p, 0.3)).toBe(Biome.Peak); // very high, cold → snow
  });

  it('lowers the snow line in colder climates', () => {
    // Same elevation: warm stays lowland, cold becomes peak.
    expect(classifyBiome(75, 0.1, p, 1.0)).toBe(Biome.Lowland);
    expect(classifyBiome(95, 0.1, p, 0.0)).toBe(Biome.Peak);
  });
});

describe('worldgen.paintBiomeSplat', () => {
  it('writes a one-hot, 255-summed weight per texel for the biome layer', () => {
    const res = 8;
    const weights = new Uint8Array(res * res * 4);
    // Half lowland (layer 0), half rock (layer 2).
    paintBiomeSplat(weights, res, (u) => (u < 0.5 ? Biome.Lowland : Biome.Rock));
    for (let k = 0; k < res * res; k++) {
      const o = k * 4;
      const sum = weights[o] + weights[o + 1] + weights[o + 2] + weights[o + 3];
      expect(sum).toBe(255);
    }
    // Top-left texel → lowland → layer 0 hot.
    expect(weights[0]).toBe(255);
    // A right-side texel → rock → layer 2 hot.
    const right = ((res >> 1) + 1) * 4;
    expect(weights[right + BIOME_LAYER[Biome.Rock]]).toBe(255);
  });
});

describe('worldgen.slopeAt', () => {
  it('is ~0 on flat ground and large on a step', () => {
    const res = 5, step = 1;
    const flat = new Float32Array(res * res); // all 0
    expect(slopeAt(flat, res, step, 2, 2)).toBeCloseTo(0, 6);
    const ramp = new Float32Array(res * res);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) ramp[j * res + i] = i * 10; // 10 m / cell in x
    expect(slopeAt(ramp, res, step, 2, 2)).toBeCloseTo(10, 5);
  });
});

describe('worldgen.buildWorld', () => {
  it('returns matching height/splat arrays + a biome histogram summing to all cells', () => {
    const hmRes = 65, splatRes = 64;
    const { heights, weights, stats } = buildWorld(hmRes, 1024, splatRes, { seed: 9, climate: 'desert' });
    expect(heights.length).toBe(hmRes * hmRes);
    expect(weights.length).toBe(splatRes * splatRes * 4);
    const total = Object.values(stats.biomes).reduce((s, v) => s + v, 0);
    expect(total).toBe(splatRes * splatRes);             // every splat texel classified once
    expect(stats.biomes.Ocean + stats.biomes.Lowland).toBeGreaterThan(0);
    // Every splat texel is normalized to 255.
    for (let k = 0; k < splatRes * splatRes; k++) {
      const o = k * 4;
      expect(weights[o] + weights[o + 1] + weights[o + 2] + weights[o + 3]).toBe(255);
    }
  });

  it('exposes a 4-colour palette for every climate', () => {
    for (const name of ['temperate', 'desert', 'arctic', 'tropical', 'volcanic'] as const) {
      expect(CLIMATES[name]).toHaveLength(4);
      for (const c of CLIMATES[name]) expect(c).toHaveLength(3);
    }
  });
});
