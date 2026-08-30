import * as THREE from 'three';
import type { NavMeshBuildOptions } from './NavMesh';
import { MultiLayerNavMesh, type WalkableSpan } from './MultiLayerNavMesh';

export interface VoxelizeStats {
  trianglesRasterized: number;
  columnsTouched: number;
  spansBeforeMerge: number;
  spansAfterMerge: number;
  walkableSpans: number;
  erodedSpans: number;
  buildMs: number;
}

export interface VoxelizeOptions extends NavMeshBuildOptions {
  /**
   * Only meshes passing this filter contribute geometry. Defaults to skipping anything
   * tagged `userData.navIgnore`, plus lights/helpers/non-meshes.
   */
  filter?: (object: THREE.Object3D) => boolean;
  /** Merge surfaces whose floors are within this many metres into one span. Defaults to cellSize. */
  mergeThreshold?: number;
}

/** One rasterized surface sample inside a column. */
interface SurfaceSample {
  y: number;
  normalY: number;
}

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

/**
 * NavMeshVoxelizer.ts — the missing build pipeline for {@link MultiLayerNavMesh}.
 *
 * The multi-layer mesh could store overlapping walkable floors but had no way to
 * *acquire* them: you had to hand-call `addSpan()` for every cell, which meant nothing
 * in the engine could actually produce a multi-story navmesh. This is the Recast-shaped
 * pipeline that fills it, in the four classic stages:
 *
 *   1. RASTERIZE — every triangle of the source geometry is scan-converted into the XZ
 *      cell grid, recording (floorY, normalY) surface samples per column.
 *   2. FILTER     — samples are sorted and merged into spans; each span gets a ceiling
 *      from the next surface above it.
 *   3. MARK       — a span is walkable when its slope is under `maxSlopeDeg` AND it has
 *      at least `agentHeight` of headroom under its ceiling.
 *   4. ERODE      — walkable spans within `agentRadius` of a drop-off or a blocked
 *      neighbour at a compatible elevation are cleared, so an agent's body never
 *      clips a wall it pathed alongside.
 *
 * Rasterization (rather than the 2.5D mesh's downward raycasts) is what makes overlap
 * possible: a raycast reports one hit per column, a scan-converted triangle reports
 * every surface that passes over the column — bridge deck and underpass floor both.
 *
 * All coordinates are WORLD space, matching NavMesh.ts, so a floating-origin shift
 * cannot corrupt a built mesh.
 */
export class NavMeshVoxelizer {
  /**
   * Build a multi-layer navmesh from a set of Object3D roots (typically `[scene]`).
   * Synchronous: intended for editor/AI-command use and for regions of a few hundred
   * metres. Cost is O(triangles × cells-per-triangle).
   */
  static build(
    roots: THREE.Object3D[],
    opts: VoxelizeOptions,
  ): { navmesh: MultiLayerNavMesh; stats: VoxelizeStats } {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const navmesh = new MultiLayerNavMesh(opts);
    const cellSize = navmesh.cellSize;
    const filter = opts.filter ?? NavMeshVoxelizer.defaultFilter;
    const mergeThreshold = opts.mergeThreshold ?? cellSize;
    const cosMaxSlope = Math.cos(THREE.MathUtils.degToRad(navmesh.maxSlopeDeg));

    // --- stage 1: rasterize ------------------------------------------------
    const columns = new Map<number, SurfaceSample[]>();
    let trianglesRasterized = 0;

    for (const root of roots) {
      root.updateMatrixWorld(true);
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if (!filter(object)) return;
        trianglesRasterized += NavMeshVoxelizer.rasterizeMesh(mesh, navmesh, columns);
      });
    }

    // --- stage 2: filter into spans ---------------------------------------
    let spansBeforeMerge = 0;
    let spansAfterMerge = 0;
    const merged = new Map<number, WalkableSpan[]>();

    for (const [key, samples] of columns) {
      spansBeforeMerge += samples.length;
      samples.sort((a, b) => a.y - b.y);

      const spans: WalkableSpan[] = [];
      let floorY = samples[0].y;
      // Keep the FLATTEST normal in a merged group: a step's tread is what an agent
      // stands on, not the riser that happens to rasterize into the same column.
      let bestNormalY = samples[0].normalY;
      let lastY = samples[0].y;

      const flush = (): void => {
        spans.push({ floorY, ceilingY: Infinity, walkable: false, normalY: bestNormalY, layerId: 0 });
      };

      for (let i = 1; i < samples.length; i++) {
        const s = samples[i];
        if (s.y - lastY <= mergeThreshold) {
          if (s.normalY > bestNormalY) bestNormalY = s.normalY;
          lastY = s.y;
          continue;
        }
        flush();
        floorY = s.y;
        bestNormalY = s.normalY;
        lastY = s.y;
      }
      flush();

      // Each span's ceiling is the floor of the span above it.
      for (let i = 0; i < spans.length - 1; i++) {
        spans[i].ceilingY = spans[i + 1].floorY;
      }
      spansAfterMerge += spans.length;
      merged.set(key, spans);
    }

    // --- stage 3: mark walkable -------------------------------------------
    let walkableSpans = 0;
    for (const spans of merged.values()) {
      for (const span of spans) {
        const headroom = span.ceilingY - span.floorY;
        span.walkable = span.normalY >= cosMaxSlope && headroom >= navmesh.agentHeight;
        if (span.walkable) walkableSpans++;
      }
    }

    // --- stage 4: erode by agent radius ------------------------------------
    const erodedSpans = NavMeshVoxelizer.erode(merged, navmesh);

    // Publish into the navmesh.
    for (const [key, spans] of merged) {
      const iz = Math.floor(key / navmesh.cellsX);
      const ix = key - iz * navmesh.cellsX;
      for (const span of spans) {
        navmesh.addSpan(ix, iz, {
          floorY: span.floorY,
          ceilingY: span.ceilingY,
          walkable: span.walkable,
          normalY: span.normalY,
        });
      }
    }

    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    return {
      navmesh,
      stats: {
        trianglesRasterized,
        columnsTouched: columns.size,
        spansBeforeMerge,
        spansAfterMerge,
        walkableSpans,
        erodedSpans,
        buildMs: t1 - t0,
      },
    };
  }

  /** Default geometry filter: real meshes only, honouring `userData.navIgnore`. */
  static defaultFilter(object: THREE.Object3D): boolean {
    if (object.userData?.navIgnore) return false;
    if (object.visible === false) return false;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return false;
    // Skip debug/gizmo helpers, particles, and anything explicitly excluded from culling
    // bookkeeping — none of it is standable geometry.
    if (object.userData?.helper || object.userData?.gizmo || object.userData?.vfx) return false;
    return true;
  }

  // --- internals ------------------------------------------------------------

  /** Scan-convert one mesh's triangles into surface samples. Returns triangles processed. */
  private static rasterizeMesh(
    mesh: THREE.Mesh,
    navmesh: MultiLayerNavMesh,
    columns: Map<number, SurfaceSample[]>,
  ): number {
    const geom = mesh.geometry;
    const position = geom.getAttribute('position');
    if (!position) return 0;
    const index = geom.getIndex();
    const triCount = index ? index.count / 3 : position.count / 3;
    _matrix.copy(mesh.matrixWorld);

    let processed = 0;
    for (let t = 0; t < triCount; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      _v0.fromBufferAttribute(position, a).applyMatrix4(_matrix);
      _v1.fromBufferAttribute(position, b).applyMatrix4(_matrix);
      _v2.fromBufferAttribute(position, c).applyMatrix4(_matrix);

      _e1.subVectors(_v1, _v0);
      _e2.subVectors(_v2, _v0);
      _normal.crossVectors(_e1, _e2);
      const nLen = _normal.length();
      if (nLen < 1e-12) continue; // degenerate
      _normal.divideScalar(nLen);
      // Downward-facing triangles are ceilings, not floors — they contribute a span
      // boundary above, which the next-span-up ceiling pass already gives us.
      if (_normal.y <= 0) continue;

      NavMeshVoxelizer.rasterizeTriangle(navmesh, columns, _normal.y);
      processed++;
    }
    return processed;
  }

  /** Rasterize the triangle currently in `_v0/_v1/_v2` into the column map. */
  private static rasterizeTriangle(
    navmesh: MultiLayerNavMesh,
    columns: Map<number, SurfaceSample[]>,
    normalY: number,
  ): void {
    const cellSize = navmesh.cellSize;
    const minX = Math.min(_v0.x, _v1.x, _v2.x);
    const maxX = Math.max(_v0.x, _v1.x, _v2.x);
    const minZ = Math.min(_v0.z, _v1.z, _v2.z);
    const maxZ = Math.max(_v0.z, _v1.z, _v2.z);

    let ix0 = Math.floor((minX - navmesh.originX) / cellSize);
    let ix1 = Math.floor((maxX - navmesh.originX) / cellSize);
    let iz0 = Math.floor((minZ - navmesh.originZ) / cellSize);
    let iz1 = Math.floor((maxZ - navmesh.originZ) / cellSize);
    if (ix1 < 0 || iz1 < 0 || ix0 >= navmesh.cellsX || iz0 >= navmesh.cellsZ) return;
    ix0 = Math.max(0, ix0); iz0 = Math.max(0, iz0);
    ix1 = Math.min(navmesh.cellsX - 1, ix1); iz1 = Math.min(navmesh.cellsZ - 1, iz1);

    // Barycentric setup in XZ.
    const x0 = _v0.x, z0 = _v0.z;
    const dx1 = _v1.x - x0, dz1 = _v1.z - z0;
    const dx2 = _v2.x - x0, dz2 = _v2.z - z0;
    const det = dx1 * dz2 - dx2 * dz1;
    if (Math.abs(det) < 1e-12) return; // edge-on triangle: no footprint
    const invDet = 1 / det;

    for (let iz = iz0; iz <= iz1; iz++) {
      const pz = navmesh.originZ + (iz + 0.5) * cellSize;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = navmesh.originX + (ix + 0.5) * cellSize;

        const rx = px - x0, rz = pz - z0;
        const u = (rx * dz2 - dx2 * rz) * invDet;
        const v = (dx1 * rz - rx * dz1) * invDet;
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;

        const y = _v0.y + u * (_v1.y - _v0.y) + v * (_v2.y - _v0.y);
        const key = iz * navmesh.cellsX + ix;
        let list = columns.get(key);
        if (!list) {
          list = [];
          columns.set(key, list);
        }
        list.push({ y, normalY });
      }
    }
  }

  /**
   * Clear walkability within `agentRadius` of any edge — a column with no compatible
   * walkable span at a similar elevation. Runs on a copy of the walkable flags so the
   * erosion front does not eat itself.
   *
   * @returns number of spans cleared.
   */
  private static erode(
    merged: Map<number, WalkableSpan[]>,
    navmesh: MultiLayerNavMesh,
  ): number {
    const radiusCells = Math.floor(navmesh.agentRadius / navmesh.cellSize);
    if (radiusCells <= 0) return 0;

    const original = new Map<number, boolean[]>();
    for (const [key, spans] of merged) {
      original.set(key, spans.map((s) => s.walkable));
    }

    const compatible = (key: number, floorY: number): boolean => {
      const spans = merged.get(key);
      const flags = original.get(key);
      if (!spans || !flags) return false;
      for (let i = 0; i < spans.length; i++) {
        if (!flags[i]) continue;
        // Reachable neighbour: same layer within one step up or down.
        if (Math.abs(spans[i].floorY - floorY) <= navmesh.maxStepHeight) return true;
      }
      return false;
    };

    let cleared = 0;
    for (const [key, spans] of merged) {
      const iz = Math.floor(key / navmesh.cellsX);
      const ix = key - iz * navmesh.cellsX;

      for (const span of spans) {
        if (!span.walkable) continue;
        let blocked = false;
        for (let dz = -radiusCells; dz <= radiusCells && !blocked; dz++) {
          for (let dx = -radiusCells; dx <= radiusCells; dx++) {
            if (dx === 0 && dz === 0) continue;
            if (dx * dx + dz * dz > radiusCells * radiusCells) continue; // circular body
            const nx = ix + dx, nz = iz + dz;
            if (nx < 0 || nz < 0 || nx >= navmesh.cellsX || nz >= navmesh.cellsZ) {
              blocked = true; break; // grid border counts as a drop-off
            }
            if (!compatible(nz * navmesh.cellsX + nx, span.floorY)) {
              blocked = true; break;
            }
          }
        }
        if (blocked) {
          span.walkable = false;
          cleared++;
        }
      }
    }
    return cleared;
  }
}
