import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mulberry32 } from './noise';

/**
 * worldgen.ts — PURE procedural open-world generation kernels (no THREE objects, only the
 * SimplexNoise math util) so the whole pipeline is deterministic and Vitest-tested in Node,
 * exactly like the other terrain kernels (Heightmap/SplatMap/placeScatter).
 *
 * Pipeline: seed → fractal heightmap (continents + ridged mountains + hills + detail, optional
 * domain warp + island falloff) → per-cell biome classification (elevation/slope/moisture/
 * temperature) → 4-channel splat weights. TerrainSystem.generateWorld() drives these against a
 * live TerrainField (heights → mesh + collider, splat → material, biomes → scatter). Every knob
 * is exposed through the `world_generate` AICommand so an agent can author a world from text.
 */

// ── Biomes ──────────────────────────────────────────────────────────────────
// Only four splat layers exist (RGBA), so biomes collapse onto four climate-relative slots:
//   slot 0 = LOWLAND vegetation · 1 = SOIL/SAND (beaches + ocean floor) · 2 = ROCK (cliffs) ·
//   3 = PEAK (snow / dune crest). A climate palette recolours the four slots so the SAME biome
//   logic yields temperate, desert, arctic, tropical or volcanic worlds.
export enum Biome { Ocean, Beach, Lowland, Rock, Peak }

/** Which of the 4 splat layers a biome paints. Grass scatter keys off layer 0, pebbles off 2. */
export const BIOME_LAYER: Record<Biome, 0 | 1 | 2 | 3> = {
  [Biome.Ocean]: 1,
  [Biome.Beach]: 1,
  [Biome.Lowland]: 0,
  [Biome.Rock]: 2,
  [Biome.Peak]: 3,
};

export type ClimateName = 'temperate' | 'desert' | 'arctic' | 'tropical' | 'volcanic';

/** 4 sRGB-byte layer colours per climate, ordered [lowland, soil/sand, rock, peak]. */
export const CLIMATES: Record<ClimateName, [number, number, number][]> = {
  temperate: [[83, 110, 60], [120, 100, 70], [120, 115, 110], [235, 238, 245]],
  desert:    [[150, 140, 80], [201, 178, 120], [140, 110, 80], [223, 205, 165]],
  arctic:    [[120, 140, 140], [170, 185, 195], [110, 120, 130], [240, 245, 250]],
  tropical:  [[58, 120, 50], [205, 185, 130], [110, 110, 100], [150, 160, 150]],
  volcanic:  [[70, 70, 60], [60, 45, 40], [45, 40, 38], [20, 18, 18]],
};

export interface WorldGenOptions {
  seed?: number;
  /** Peak land height in metres above sea level (rough cap; ridges may slightly exceed). */
  amplitude?: number;
  /** Ocean floor reaches down to ~amplitude·oceanDepthRatio below sea level. */
  oceanDepthRatio?: number;
  /** Cycles of the continent field across the whole map. Lower = bigger landmasses. */
  continentScale?: number;
  /** Pushes the map toward land (+) or sea (−); ~0.15 ≈ half land. */
  landBias?: number;
  mountainScale?: number;
  /** 0..1 — how much of the land budget goes to ridged mountains. */
  mountainAmount?: number;
  hillScale?: number;
  detailScale?: number;
  moistureScale?: number;
  /** Domain-warp strength in UV units (natural, swirly coastlines). 0 disables. */
  warp?: number;
  /** Radial falloff so the world is an island ringed by ocean. */
  island?: boolean;
  islandFalloff?: number;
  climate?: ClimateName;
}

export interface WorldStats {
  min: number;
  max: number;
  seaLevel: number;
  /** Fraction of cells below sea level (0..1). */
  waterFraction: number;
  /** Per-biome cell counts. */
  biomes: Record<string, number>;
}

const DEFAULTS: Required<Omit<WorldGenOptions, 'climate' | 'island'>> = {
  seed: 1337,
  amplitude: 120,
  oceanDepthRatio: 0.5,
  continentScale: 1.7,
  landBias: 0.15,
  mountainScale: 3.6,
  mountainAmount: 0.55,
  hillScale: 7,
  detailScale: 18,
  moistureScale: 2.3,
  warp: 0.12,
  islandFalloff: 1.0,
};

/**
 * Merge caller options over DEFAULTS, IGNORING `undefined` values. Critical: callers (the
 * world_generate AICommand) forward unset params as explicit `undefined`, and a plain
 * `{...DEFAULTS, ...options}` spread would let those clobber the defaults → `x * undefined` → NaN.
 */
function resolveDefaults(options: WorldGenOptions): typeof DEFAULTS {
  const o = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    const v = options[key];
    if (v !== undefined) o[key] = v as number;
  }
  return o;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

/** Multi-octave fractal Brownian motion in ~[-1,1]. */
function fbm(noise: SimplexNoise, x: number, y: number, octaves: number, lac = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise.noise(x * freq, y * freq);
    norm += amp; amp *= gain; freq *= lac;
  }
  return sum / norm;
}

/** Ridged multifractal in [0,1] — sharp mountain crests (1 − |noise|, squared, octave-summed). */
function ridged(noise: SimplexNoise, x: number, y: number, octaves: number, lac = 2.1, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise.noise(x * freq, y * freq));
    n *= n;
    sum += amp * n;
    norm += amp; amp *= gain; freq *= lac;
  }
  return sum / norm;
}

/** A deterministic family of independent SimplexNoise fields derived from one seed. */
function noiseSet(seed: number) {
  return {
    cont: new SimplexNoise({ random: mulberry32(seed) }),
    mtn: new SimplexNoise({ random: mulberry32(seed ^ 0x9e3779b1) }),
    mask: new SimplexNoise({ random: mulberry32(seed ^ 0x85ebca6b) }),
    hill: new SimplexNoise({ random: mulberry32(seed ^ 0xc2b2ae35) }),
    detail: new SimplexNoise({ random: mulberry32(seed ^ 0x27d4eb2f) }),
    warp: new SimplexNoise({ random: mulberry32(seed ^ 0x165667b1) }),
    moist: new SimplexNoise({ random: mulberry32(seed ^ 0xd3a2646c) }),
  };
}

/**
 * Generate a row-major (`heights[j*res+i]`) heightfield in METRES, sea level at y=0. Ocean basins
 * are negative; land is positive. Deterministic for a given seed. Pure — Vitest-tested.
 */
export function generateHeightmap(res: number, options: WorldGenOptions = {}): { heights: Float32Array; stats: WorldStats } {
  const o = resolveDefaults(options);
  const island = options.island ?? false;
  const n = noiseSet(o.seed);
  const cells = res - 1;
  const heights = new Float32Array(res * res);
  const oceanDepth = o.amplitude * o.oceanDepthRatio;
  let min = Infinity, max = -Infinity, water = 0;

  for (let j = 0; j < res; j++) {
    const v = j / cells;                 // 0..1 across the map
    for (let i = 0; i < res; i++) {
      const u = i / cells;
      // Domain warp the sample coords for non-uniform, organic coastlines.
      let wu = u, wv = v;
      if (o.warp > 0) {
        wu += o.warp * n.warp.noise(u * 2.0, v * 2.0);
        wv += o.warp * n.warp.noise(u * 2.0 + 5.2, v * 2.0 + 1.3);
      }
      // Continent field → land/sea split, biased toward land by landBias.
      let base = fbm(n.cont, wu * o.continentScale, wv * o.continentScale, 4) + o.landBias;
      if (island) {
        // Radial falloff: 1 at centre → 0 at the corners, subtracted from the land budget.
        const dx = u - 0.5, dy = v - 0.5;
        const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
        base -= smoothstep(0.4, 1.0, r) * (1 + o.islandFalloff);
      }

      let h: number;
      if (base <= 0) {
        // Ocean basin: deepen with the (negative) continent value.
        h = Math.max(-1.2, base) * oceanDepth;
      } else {
        const elev01 = Math.min(1, base);                       // continental height factor
        const hills = fbm(n.hill, wu * o.hillScale, wv * o.hillScale, 5) * 0.5 + 0.5;
        const mMask = smoothstep(0.25, 0.78, fbm(n.mask, wu * 1.4, wv * 1.4, 3) * 0.5 + 0.5);
        const ridge = ridged(n.mtn, wu * o.mountainScale, wv * o.mountainScale, 5);
        const detail = fbm(n.detail, wu * o.detailScale, wv * o.detailScale, 4);
        h = elev01 * o.amplitude * 0.42
          + hills * o.amplitude * 0.12
          + mMask * ridge * o.amplitude * o.mountainAmount
          + detail * o.amplitude * 0.04;
        // Beaches: ease the very-low coast toward 0 so land meets water in a flat strip.
        h *= smoothstep(0, 0.04, base);
      }
      heights[j * res + i] = h;
      if (h < min) min = h;
      if (h > max) max = h;
      if (h < 0) water++;
    }
  }

  return {
    heights,
    stats: { min, max, seaLevel: 0, waterFraction: water / (res * res), biomes: {} },
  };
}

/** Central-difference slope magnitude (rise/run) of a row-major heightfield at cell (i,j). */
export function slopeAt(heights: Float32Array, res: number, step: number, i: number, j: number): number {
  const at = (a: number, b: number) => {
    const ca = a < 0 ? 0 : a >= res ? res - 1 : a;
    const cb = b < 0 ? 0 : b >= res ? res - 1 : b;
    return heights[cb * res + ca];
  };
  const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * step);
  const dz = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
  return Math.hypot(dx, dz);
}

export interface BiomeParams {
  amplitude?: number;
  /** Below this many metres of elevation-above-sea (and gentle), a cell is beach. */
  beachHeight?: number;
  /** Slope (rise/run) above which any land becomes exposed rock/cliff. */
  rockSlope?: number;
  /** elev01 (height/amplitude) above which land becomes peak (snow/dune). */
  peakElev?: number;
}

/**
 * Classify one cell into a Biome from its absolute height, slope and (optional) temperature.
 * Sea level is y=0. Pure + branch-tested. Temperature lowers the snow line near the poles.
 */
export function classifyBiome(
  height: number, slope: number, p: BiomeParams = {}, temperature = 0.6,
): Biome {
  const amplitude = p.amplitude ?? 120;
  const beachHeight = p.beachHeight ?? amplitude * 0.012;
  const rockSlope = p.rockSlope ?? 0.85;
  const peakElev = p.peakElev ?? 0.72;

  if (height < 0) return Biome.Ocean;
  if (height < beachHeight && slope < 0.35) return Biome.Beach;
  if (slope > rockSlope) return Biome.Rock;
  const elev01 = height / amplitude;
  // Colder climates push the snow line down; warm climates raise it.
  const snowLine = peakElev * (0.55 + temperature * 0.6);
  if (elev01 > snowLine) return Biome.Peak;
  return Biome.Lowland;
}

/**
 * Fill a 4-channel splat-weight array (one-hot per texel) from a per-UV biome sampler.
 * `weights` is RGBA bytes length splatRes²·4; `biomeAtUV(u,v)` returns the Biome for that texel.
 * Pure (no GPU). Each texel ends summing to 255 across the 4 layers.
 */
export function paintBiomeSplat(
  weights: Uint8Array, splatRes: number, biomeAtUV: (u: number, v: number) => Biome,
): void {
  for (let j = 0; j < splatRes; j++) {
    const v = j / (splatRes - 1);
    for (let i = 0; i < splatRes; i++) {
      const u = i / (splatRes - 1);
      const layer = BIOME_LAYER[biomeAtUV(u, v)];
      const idx = (j * splatRes + i) * 4;
      weights[idx] = layer === 0 ? 255 : 0;
      weights[idx + 1] = layer === 1 ? 255 : 0;
      weights[idx + 2] = layer === 2 ? 255 : 0;
      weights[idx + 3] = layer === 3 ? 255 : 0;
    }
  }
}

/**
 * One-shot whole-world build over an EXISTING heightmap-backed field. Generates heights, then a
 * biome splat, and returns stats incl. a biome histogram. Operates only on plain arrays so it is
 * unit-testable; TerrainField glue (mesh/collider/material/scatter) lives in TerrainSystem.
 */
export function buildWorld(
  hmRes: number, hmSize: number, splatRes: number, options: WorldGenOptions = {},
): { heights: Float32Array; weights: Uint8Array; stats: WorldStats } {
  const o = resolveDefaults(options);
  const { heights, stats } = generateHeightmap(hmRes, options);
  const step = hmSize / (hmRes - 1);
  const half = hmSize / 2;
  const n = noiseSet(o.seed);

  // Bilinear height + slope samplers in LOCAL metres so splat (its own res) lines up with the mesh.
  const sampleHeight = (lx: number, lz: number): number => {
    const fi = (lx + half) / step, fj = (lz + half) / step;
    const i = Math.floor(fi), j = Math.floor(fj);
    const fx = fi - i, fz = fj - j;
    const at = (a: number, b: number) => {
      const ca = a < 0 ? 0 : a >= hmRes ? hmRes - 1 : a;
      const cb = b < 0 ? 0 : b >= hmRes ? hmRes - 1 : b;
      return heights[cb * hmRes + ca];
    };
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fz)
         + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fz;
  };

  const biomes: Record<string, number> = { Ocean: 0, Beach: 0, Lowland: 0, Rock: 0, Peak: 0 };
  const biomeAtUV = (u: number, v: number): Biome => {
    const lx = u * hmSize - half, lz = v * hmSize - half;
    const i = Math.min(hmRes - 1, Math.max(0, Math.round((lx + half) / step)));
    const j = Math.min(hmRes - 1, Math.max(0, Math.round((lz + half) / step)));
    const h = sampleHeight(lx, lz);
    const slope = slopeAt(heights, hmRes, step, i, j);
    const lat = Math.abs(v - 0.5) * 2;                                   // 0 equator → 1 poles
    const moist = n.moist.noise(u * o.moistureScale, v * o.moistureScale) * 0.5 + 0.5;
    const temperature = Math.min(1, Math.max(0, 1 - lat * 0.55 - Math.max(0, h) / o.amplitude * 0.5 + (moist - 0.5) * 0.1));
    const b = classifyBiome(h, slope, { amplitude: o.amplitude }, temperature);
    biomes[Biome[b]]++;
    return b;
  };

  const weights = new Uint8Array(splatRes * splatRes * 4);
  paintBiomeSplat(weights, splatRes, biomeAtUV);
  stats.biomes = biomes;
  return { heights, weights, stats };
}
