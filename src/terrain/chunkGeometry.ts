import type { Heightmap } from './Heightmap';

/**
 * chunkGeometry.ts — PURE chunk-meshing kernels for the chunked-LOD terrain (no THREE / no Rapier,
 * Vitest-tested). The Heightmap stays the single source of truth; a chunk is just a square window
 * of it [i0..i0+chunkCells] × [j0..j0+chunkCells] meshed at a stride chosen by camera distance.
 *
 * Coordinates match the original single-mesh terrain (TerrainField.buildGeometry): local
 * x = i*step − half, z = j*step − half, y = height. So chunk meshes live in terrain-LOCAL space and
 * sit at the terrain root's origin — `root.worldToLocal` keeps mapping straight to heightmap coords.
 *
 * SEAMS: when two adjacent chunks pick different LODs, the finer chunk has edge vertices that fall
 * between the coarser chunk's edge vertices, leaving cracks at the T-junctions. We hide them with
 * SKIRTS — a perimeter wall dropped below each chunk. (The terrain material is DoubleSide so skirt
 * winding is irrelevant.) Normals are sampled from the FULL-RES heightmap regardless of LOD, so
 * lighting stays stable across LOD transitions.
 */

export interface ChunkArrays {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Local-Y bounds INCLUDING the skirt drop — used for the chunk's culling AABB. */
  minY: number;
  maxY: number;
}

/** Pick an LOD index from camera distance. `lodDistances` ascending; returns 0..length (clamped). */
export function lodForDistance(dist: number, lodDistances: number[]): number {
  for (let i = 0; i < lodDistances.length; i++) if (dist < lodDistances[i]) return i;
  return lodDistances.length;
}

/** Largest power-of-two chunk size ≤ maxChunkCells that evenly divides `cells` (≥ 1). Keeping it a
 *  power of two means every LOD stride (2^lod ≤ chunkCells) divides the chunk exactly. */
export function chooseChunkCells(cells: number, maxChunkCells: number): number {
  let c = 1;
  while (c * 2 <= maxChunkCells && cells % (c * 2) === 0) c *= 2;
  return c;
}

/** Max LOD a chunk supports: the coarsest stride still leaving ≥ 1 cell. */
export function maxLodFor(chunkCells: number): number {
  return Math.max(0, Math.floor(Math.log2(chunkCells)));
}

/** Verts per chunk edge at this LOD. */
export function chunkVertsPerSide(chunkCells: number, lod: number): number {
  return Math.floor(chunkCells / (1 << lod)) + 1;
}

/**
 * Build the THREE-ready typed arrays for one chunk at the given LOD, including a crack-hiding skirt.
 * Skirt depth adapts to the chunk's height range (deeper terrain → deeper skirt), clamped to a sane band.
 */
export function buildChunkGeometryArrays(
  hm: Heightmap, ci: number, cj: number, chunkCells: number, lod: number,
): ChunkArrays {
  const { res, step, half } = hm;
  const stride = 1 << lod;
  const i0 = ci * chunkCells, j0 = cj * chunkCells;
  const n = Math.floor(chunkCells / stride) + 1; // verts per side at this LOD

  // Full-res height range over the chunk → bounds + adaptive skirt depth.
  let minH = Infinity, maxH = -Infinity;
  for (let j = j0; j <= j0 + chunkCells; j++) {
    for (let i = i0; i <= i0 + chunkCells; i++) {
      const h = hm.at(i, j);
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }
  const skirtDepth = Math.min(30, Math.max(2, (maxH - minH) * 0.5));

  const gridVerts = n * n;
  const skirtVerts = 4 * n;            // one strip of n verts per edge (corners duplicated; harmless)
  const vertCount = gridVerts + skirtVerts;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  const cellsInv = 1 / hm.cells;
  // Local normal at full-res (i,j) via central differences (matches TerrainField.recomputeNormalsRect).
  const writeNormal = (k: number, i: number, j: number) => {
    const nx = hm.at(i - 1, j) - hm.at(i + 1, j);
    const ny = 2 * step;
    const nz = hm.at(i, j - 1) - hm.at(i, j + 1);
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[k] = nx / len; normals[k + 1] = ny / len; normals[k + 2] = nz / len;
  };

  // --- grid vertices ---
  for (let b = 0; b < n; b++) {
    const j = j0 + b * stride;
    const z = j * step - half;
    for (let a = 0; a < n; a++) {
      const i = i0 + a * stride;
      const k = b * n + a;
      positions[k * 3] = i * step - half;
      positions[k * 3 + 1] = hm.at(i, j);
      positions[k * 3 + 2] = z;
      uvs[k * 2] = i * cellsInv;
      uvs[k * 2 + 1] = j * cellsInv;
      writeNormal(k * 3, i, j);
    }
  }

  // --- indices: grid quads (CCW → +Y up, matching buildGeometry) ---
  const gridQuads = (n - 1) * (n - 1);
  const indices = new Uint32Array((gridQuads + 4 * (n - 1)) * 6);
  let t = 0;
  for (let b = 0; b < n - 1; b++) {
    for (let a = 0; a < n - 1; a++) {
      const A = b * n + a, B = b * n + a + 1, C = (b + 1) * n + a, D = (b + 1) * n + a + 1;
      indices[t++] = A; indices[t++] = C; indices[t++] = B;
      indices[t++] = B; indices[t++] = C; indices[t++] = D;
    }
  }

  // --- skirts: one strip per edge. Each strip copies its edge's grid verts, dropped by skirtDepth. ---
  let sBase = gridVerts;
  const addSkirtStrip = (gridIndexAt: (e: number) => number) => {
    const base = sBase;
    for (let e = 0; e < n; e++) {
      const g = gridIndexAt(e);
      const sk = base + e;
      positions[sk * 3] = positions[g * 3];
      positions[sk * 3 + 1] = positions[g * 3 + 1] - skirtDepth;
      positions[sk * 3 + 2] = positions[g * 3 + 2];
      uvs[sk * 2] = uvs[g * 2]; uvs[sk * 2 + 1] = uvs[g * 2 + 1];
      normals[sk * 3] = normals[g * 3]; normals[sk * 3 + 1] = normals[g * 3 + 1]; normals[sk * 3 + 2] = normals[g * 3 + 2];
    }
    for (let e = 0; e < n - 1; e++) {
      const g0 = gridIndexAt(e), g1 = gridIndexAt(e + 1);
      const s0 = base + e, s1 = base + e + 1;
      indices[t++] = g0; indices[t++] = g1; indices[t++] = s1;
      indices[t++] = g0; indices[t++] = s1; indices[t++] = s0;
    }
    sBase += n;
  };
  addSkirtStrip((a) => a);                 // south (b=0)
  addSkirtStrip((a) => (n - 1) * n + a);   // north (b=n-1)
  addSkirtStrip((b) => b * n);             // west  (a=0)
  addSkirtStrip((b) => b * n + (n - 1));   // east  (a=n-1)

  return { positions, normals, uvs, indices, minY: minH - skirtDepth, maxY: maxH };
}
