import * as THREE from 'three';
import type { TerrainField } from './TerrainField';
import { brushWeight } from './Heightmap';

export interface SplineConformOpts {
  /** 'flatten' (road/rail): blend terrain toward the path height (raise or lower).
   *  'carve'   (river): only cut DOWN toward the path — never fill, so it digs a channel. */
  mode?: 'flatten' | 'carve';
  /** Catmull-Rom smoothing through the control points (default true; needs ≥3 points to curve). */
  smooth?: boolean;
}

/**
 * Conform the terrain height to a spline/polyline (roads, rivers, rails). For each heightmap cell
 * within `radius` of the path, blend its height toward the path height at the nearest point, using
 * the shared `brushWeight` falloff (so `hardness` is the flat-top fraction, consistent with the
 * sculpt brushes). PURE w.r.t. THREE/Rapier (operates on `field.hm`); Vitest-tested.
 */
export function splineConform(
  field: TerrainField,
  controlPoints: THREE.Vector3[],
  radius: number,
  hardness = 0.5,
  opts: SplineConformOpts = {},
): void {
  if (controlPoints.length < 2 || radius <= 0) return;
  const hm = field.hm;
  const mode = opts.mode ?? 'flatten';
  const smooth = opts.smooth ?? true;

  // Densify to a smooth polyline. Catmull-Rom curves through ≥3 points; 2 points stay a straight segment.
  let path: THREE.Vector3[];
  if (smooth && controlPoints.length >= 3) {
    const curve = new THREE.CatmullRomCurve3(controlPoints.map(p => p.clone()), false, 'catmullrom', 0.5);
    let len = 0;
    for (let k = 1; k < controlPoints.length; k++) len += controlPoints[k].distanceTo(controlPoints[k - 1]);
    const segs = Math.max(controlPoints.length * 2, Math.min(1024, Math.ceil(len / Math.max(radius * 0.5, 0.5))));
    path = curve.getPoints(segs);
  } else {
    path = controlPoints;
  }

  // Affected vertex rect = bbox of the path expanded by the radius (+1 cell of slack).
  const rCells = Math.ceil(radius / hm.step) + 1;
  let minI = hm.res, maxI = 0, minJ = hm.res, maxJ = 0;
  for (const pt of path) {
    const i = hm.toI(pt.x), j = hm.toJ(pt.z);
    minI = Math.min(minI, i - rCells); maxI = Math.max(maxI, i + rCells);
    minJ = Math.min(minJ, j - rCells); maxJ = Math.max(maxJ, j + rCells);
  }
  minI = Math.max(0, minI); maxI = Math.min(hm.res - 1, maxI);
  minJ = Math.max(0, minJ); maxJ = Math.min(hm.res - 1, maxJ);
  if (minI > maxI || minJ > maxJ) return;

  for (let j = minJ; j <= maxJ; j++) {
    const lz = j * hm.step - hm.half;
    for (let i = minI; i <= maxI; i++) {
      const lx = i * hm.step - hm.half;

      // Nearest point on the polyline → its distance + interpolated height.
      let minDistSq = Infinity, targetHeight = 0;
      for (let k = 0; k < path.length - 1; k++) {
        const p1 = path[k], p2 = path[k + 1];
        const dx = p2.x - p1.x, dz = p2.z - p1.z;
        const lenSq = dx * dx + dz * dz;
        let t = 0;
        if (lenSq > 0) { t = ((lx - p1.x) * dx + (lz - p1.z) * dz) / lenSq; t = t < 0 ? 0 : t > 1 ? 1 : t; }
        const px = p1.x + t * dx, pz = p1.z + t * dz;
        const dSq = (lx - px) * (lx - px) + (lz - pz) * (lz - pz);
        if (dSq < minDistSq) { minDistSq = dSq; targetHeight = p1.y + t * (p2.y - p1.y); }
      }

      const w = brushWeight(Math.sqrt(minDistSq), radius, hardness);
      if (w === 0) continue;
      const idx = hm.idx(i, j);
      const cur = hm.heights[idx];
      if (mode === 'carve' && targetHeight >= cur) continue; // river: only dig in
      hm.heights[idx] = cur * (1 - w) + targetHeight * w;
    }
  }

  field.applyRect({ i0: minI, i1: maxI, j0: minJ, j1: maxJ });
  field.markColliderDirty();
}
