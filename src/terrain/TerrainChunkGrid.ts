import * as THREE from 'three';
import type { Heightmap, DirtyRect } from './Heightmap';
import {
  buildChunkGeometryArrays, chooseChunkCells, maxLodFor, lodForDistance,
} from './chunkGeometry';

/**
 * TerrainChunkGrid.ts — the chunked-LOD RENDER layer for a terrain (Phase 2 of the Core Engine
 * Architecture Upgrades; see [[core-engine-upgrades]]). The CPU Heightmap stays the single source
 * of truth; this splits the render side into a grid of chunk meshes, each meshed at a stride chosen
 * by camera distance (high poly near, low poly far) with crack-hiding skirts (see chunkGeometry.ts).
 *
 * Frustum culling is left to THREE (each chunk's geometry carries a correct bounding box/sphere).
 * The physics collider is NOT chunked — TerrainField keeps Phase 1's single heightfield collider,
 * which is cheap and bounded by the same "heightmap fits in memory" limit. Per-chunk collider
 * streaming is a future concern tied to heightmap paging.
 */

export interface ChunkGridConfig {
  /** Upper bound on chunk edge size in cells (clamped to a power-of-two divisor of `cells`). Default 64. */
  maxChunkCells?: number;
  /** Ascending camera-distance thresholds (metres) → LOD bands. Default [80, 200, 500, 1200]. */
  lodDistances?: number[];
}

interface Chunk {
  ci: number;
  cj: number;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  lod: number;
  geoDirty: boolean;
  /** Terrain-LOCAL AABB (XZ fixed by chunk coords; Y refreshed on each geometry rebuild). */
  box: THREE.Box3;
}

const DEFAULT_LOD_DISTANCES = [80, 200, 500, 1200];
/** Cap geometry rebuilds per frame so a big LOD shift (e.g. fast camera move) can't hitch. */
const MAX_REBUILDS_PER_FRAME = 6;

export class TerrainChunkGrid {
  readonly chunkCells: number;
  readonly chunksPerSide: number;
  readonly maxLod: number;
  private lodDistances: number[];
  private readonly chunks: Chunk[] = [];
  private readonly _camLocal = new THREE.Vector3();
  private readonly _sphere = new THREE.Sphere();

  constructor(
    private readonly hm: Heightmap,
    private readonly root: THREE.Object3D,
    private readonly material: THREE.Material,
    cfg: ChunkGridConfig = {},
  ) {
    this.chunkCells = chooseChunkCells(hm.cells, cfg.maxChunkCells ?? 64);
    this.chunksPerSide = hm.cells / this.chunkCells;
    this.maxLod = maxLodFor(this.chunkCells);
    this.lodDistances = (cfg.lodDistances ?? DEFAULT_LOD_DISTANCES).slice().sort((a, b) => a - b);
    this.buildChunks();
  }

  private buildChunks(): void {
    for (let cj = 0; cj < this.chunksPerSide; cj++) {
      for (let ci = 0; ci < this.chunksPerSide; ci++) {
        const geometry = new THREE.BufferGeometry();
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        const chunk: Chunk = { ci, cj, mesh, geometry, lod: -1, geoDirty: false, box: new THREE.Box3() };
        this.rebuildChunkGeometry(chunk, 0);
        this.root.add(mesh);
        this.chunks.push(chunk);
      }
    }
  }

  private rebuildChunkGeometry(chunk: Chunk, lod: number): void {
    const a = buildChunkGeometryArrays(this.hm, chunk.ci, chunk.cj, this.chunkCells, lod);
    const g = chunk.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(a.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(a.indices, 1));
    chunk.lod = lod;
    chunk.geoDirty = false;

    const { half, step } = this.hm, cc = this.chunkCells;
    const x0 = chunk.ci * cc * step - half, x1 = (chunk.ci + 1) * cc * step - half;
    const z0 = chunk.cj * cc * step - half, z1 = (chunk.cj + 1) * cc * step - half;
    chunk.box.min.set(x0, a.minY, z0);
    chunk.box.max.set(x1, a.maxY, z1);
    // Set bounds so THREE's built-in frustum culling works (chunk mesh local transform is identity
    // under `root`, so its world bounds = box · root.matrixWorld, which THREE computes).
    g.boundingBox = chunk.box.clone();
    g.boundingSphere = chunk.box.getBoundingSphere(new THREE.Sphere());
  }

  /** Mark chunks overlapping a heightmap vertex-rect as geometry-dirty (rebuilt next `update`).
   *  Expanded by one vertex so chunks sharing an edge with the rect are included. */
  markDirtyRect(r: DirtyRect): void {
    const cc = this.chunkCells, last = this.chunksPerSide - 1;
    const ci0 = Math.max(0, Math.floor(Math.max(0, r.i0 - 1) / cc));
    const ci1 = Math.min(last, Math.floor(Math.min(this.hm.cells, r.i1 + 1) / cc));
    const cj0 = Math.max(0, Math.floor(Math.max(0, r.j0 - 1) / cc));
    const cj1 = Math.min(last, Math.floor(Math.min(this.hm.cells, r.j1 + 1) / cc));
    for (const c of this.chunks)
      if (c.ci >= ci0 && c.ci <= ci1 && c.cj >= cj0 && c.cj <= cj1) c.geoDirty = true;
  }

  /** Per-frame: choose each chunk's LOD from camera distance and rebuild changed/dirty chunks. */
  update(camera: THREE.Camera): void {
    this.root.updateMatrixWorld();
    this._camLocal.setFromMatrixPosition(camera.matrixWorld);
    this.root.worldToLocal(this._camLocal);

    let rebuilds = 0;
    for (const c of this.chunks) {
      // distance from the camera to the nearest point on the chunk's XZ footprint
      const nx = Math.max(c.box.min.x, Math.min(this._camLocal.x, c.box.max.x));
      const nz = Math.max(c.box.min.z, Math.min(this._camLocal.z, c.box.max.z));
      const dist = Math.hypot(this._camLocal.x - nx, this._camLocal.z - nz);
      const wantLod = Math.min(this.maxLod, lodForDistance(dist, this.lodDistances));
      if ((wantLod !== c.lod || c.geoDirty) && rebuilds < MAX_REBUILDS_PER_FRAME) {
        this.rebuildChunkGeometry(c, wantLod);
        rebuilds++;
      }
    }
  }

  /** Retune LOD bands at runtime (terrain_lod AICommand / viewport). Forces a rebuild pass. */
  setLodDistances(d: number[]): void {
    this.lodDistances = d.slice().sort((a, b) => a - b);
    for (const c of this.chunks) c.geoDirty = true;
  }

  /** Read-only state for AI/HELM introspection. */
  info(): {
    chunks: number; chunksPerSide: number; chunkCells: number; maxLod: number;
    lodDistances: number[]; lodHistogram: Record<number, number>; triangles: number;
  } {
    const lodHistogram: Record<number, number> = {};
    let triangles = 0;
    for (const c of this.chunks) {
      lodHistogram[c.lod] = (lodHistogram[c.lod] ?? 0) + 1;
      const idx = c.geometry.getIndex();
      if (idx) triangles += idx.count / 3;
    }
    return {
      chunks: this.chunks.length, chunksPerSide: this.chunksPerSide, chunkCells: this.chunkCells,
      maxLod: this.maxLod, lodDistances: this.lodDistances.slice(), lodHistogram, triangles,
    };
  }

  dispose(): void {
    for (const c of this.chunks) {
      c.mesh.removeFromParent();
      c.geometry.dispose();
    }
    this.chunks.length = 0;
  }
}
