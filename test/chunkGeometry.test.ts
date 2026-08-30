import { describe, it, expect } from 'vitest';
import { Heightmap } from '../src/terrain/Heightmap';
import {
  lodForDistance, chooseChunkCells, maxLodFor, chunkVertsPerSide, buildChunkGeometryArrays,
} from '../src/terrain/chunkGeometry';

describe('lodForDistance', () => {
  it('maps distance to an LOD band (ascending thresholds, clamped)', () => {
    const d = [60, 150, 400];
    expect(lodForDistance(10, d)).toBe(0);
    expect(lodForDistance(60, d)).toBe(1);   // boundary is exclusive of the lower band
    expect(lodForDistance(149, d)).toBe(1);
    expect(lodForDistance(399, d)).toBe(2);
    expect(lodForDistance(9999, d)).toBe(3); // beyond the last threshold
  });
});

describe('chooseChunkCells / maxLodFor', () => {
  it('picks the largest power-of-two ≤ max that divides cells', () => {
    expect(chooseChunkCells(256, 64)).toBe(64);
    expect(chooseChunkCells(128, 64)).toBe(64);
    expect(chooseChunkCells(8, 4)).toBe(4);
    expect(chooseChunkCells(96, 64)).toBe(32);   // 96 = 32*3, not divisible by 64
    expect(chooseChunkCells(100, 64)).toBe(4);   // 100 = 4*25
  });
  it('maxLodFor is log2 of the chunk size', () => {
    expect(maxLodFor(64)).toBe(6);
    expect(maxLodFor(4)).toBe(2);
    expect(maxLodFor(1)).toBe(0);
  });
});

describe('buildChunkGeometryArrays', () => {
  // res 9 (cells 8), size 8 → step 1, half 4; an asymmetric ramp + a bump so verts are non-trivial.
  const hm = new Heightmap(9, 8);
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 9; i++)
      hm.heights[hm.idx(i, j)] = 0.3 * (i - 4) + 0.2 * (j - 4) + (i === 5 && j === 3 ? 4 : 0);
  const chunkCells = 4; // 2×2 chunks

  it('has the vertex/index counts the (grid + 4 skirts) layout implies', () => {
    for (const lod of [0, 1]) {
      const n = chunkVertsPerSide(chunkCells, lod);
      const g = buildChunkGeometryArrays(hm, 0, 0, chunkCells, lod);
      expect(g.positions.length).toBe((n * n + 4 * n) * 3);
      expect(g.uvs.length).toBe((n * n + 4 * n) * 2);
      expect(g.indices.length).toBe(((n - 1) * (n - 1) + 4 * (n - 1)) * 6);
      expect(g.positions.every(Number.isFinite)).toBe(true);
      expect(g.normals.every(Number.isFinite)).toBe(true);
      // every index references a real vertex
      const maxIdx = n * n + 4 * n - 1;
      expect(g.indices.every((v) => v <= maxIdx)).toBe(true);
    }
  });

  it('places grid corners at the right local coordinates', () => {
    const g = buildChunkGeometryArrays(hm, 0, 0, chunkCells, 0); // chunk (0,0), i,j ∈ [0,4]
    // vertex (a=0,b=0) → i=0,j=0 → x=-4,z=-4
    expect(g.positions[0]).toBeCloseTo(-4, 6);
    expect(g.positions[2]).toBeCloseTo(-4, 6);
    expect(g.positions[1]).toBeCloseTo(hm.at(0, 0), 6);
  });

  it('shared coarse vertices coincide across LODs (so seams only need skirts for in-between verts)', () => {
    const f = buildChunkGeometryArrays(hm, 0, 0, chunkCells, 0); // n=5, stride 1
    const c = buildChunkGeometryArrays(hm, 0, 0, chunkCells, 1); // n=3, stride 2
    const nf = chunkVertsPerSide(chunkCells, 0), nc = chunkVertsPerSide(chunkCells, 1);
    // coarse (a,b) == fine (2a,2b) in x,y,z
    for (let b = 0; b < nc; b++)
      for (let a = 0; a < nc; a++) {
        const kc = (b * nc + a) * 3, kf = ((2 * b) * nf + 2 * a) * 3;
        expect(c.positions[kc]).toBeCloseTo(f.positions[kf], 6);
        expect(c.positions[kc + 1]).toBeCloseTo(f.positions[kf + 1], 6);
        expect(c.positions[kc + 2]).toBeCloseTo(f.positions[kf + 2], 6);
      }
    expect(nf).toBe(5); expect(nc).toBe(3);
  });

  it('drops skirt vertices below the surface and reports inclusive Y bounds', () => {
    const g = buildChunkGeometryArrays(hm, 1, 0, chunkCells, 0); // chunk (1,0): i ∈ [4,8] (has the bump)
    const n = chunkVertsPerSide(chunkCells, 0);
    const gridVerts = n * n;
    // a skirt vert sits directly under its grid vert (same x,z, lower y)
    const skirt0 = gridVerts;          // south strip, e=0 → grid vert index 0
    expect(g.positions[skirt0 * 3]).toBeCloseTo(g.positions[0], 6);       // x
    expect(g.positions[skirt0 * 3 + 2]).toBeCloseTo(g.positions[2], 6);   // z
    expect(g.positions[skirt0 * 3 + 1]).toBeLessThan(g.positions[1]);     // y dropped
    // bounds: maxY is a surface height, minY includes the skirt drop (strictly below every grid y)
    for (let v = 0; v < gridVerts; v++) {
      expect(g.positions[v * 3 + 1]).toBeLessThanOrEqual(g.maxY + 1e-6);
      expect(g.positions[v * 3 + 1]).toBeGreaterThan(g.minY);
    }
  });
});
