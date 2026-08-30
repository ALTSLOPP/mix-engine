import * as THREE from 'three';
import type { NavGrid } from './NavMesh';

/**
 * Pathfinder.ts — A* over the NavMesh heightfield, with string-pull smoothing.
 *
 * Nodes are walkable cells; neighbours are 8-connected. A diagonal move is allowed
 * only if BOTH orthogonal cells are walkable (no corner cutting through a wall) and
 * the height difference to the neighbour is ≤ maxStepHeight. The heuristic is the
 * octile distance (3D, accounting for height) — admissible for an 8-connected grid
 * with unit cost, so A* returns the optimal path for the given cost model.
 *
 * The open set is a binary min-heap keyed by `f = g + h`; the closed set is a Uint8Array
 * indexed by cell index. `cameFrom` is an Int32Array of parent cell indices (-1 = none).
 * All scratch buffers are allocated per query (paths are infrequent and bounded by
 * cellsX*cellsZ), so there is no per-frame allocation pressure.
 *
 * Smoothing: a simple string-pull — start from the path's first vertex and try to
 * advance the lookahead as far as possible while line-of-sight holds, collapsing
 * intermediate waypoints. This is the same idea as the funnel algorithm but simpler
 * because our "polygons" are grid cells. The result is a near-straight path that still
 * respects walls.
 *
 * All coordinates are WORLD space (the navmesh stores world-space heights), so a path
 * computed once stays valid across a floating-origin shift; the NavAgentSystem converts
 * to engine space at the moment of applying each waypoint.
 */

export interface FindPathOptions {
  /** World-space start position. Snapped to the nearest walkable cell if not already on one. */
  from: THREE.Vector3;
  /** World-space goal position. Snapped to the nearest walkable cell if not already on one. */
  to: THREE.Vector3;
  /** Max cells to expand before giving up (default = whole field). Prevents runaway searches. */
  maxExpansions?: number;
  /** Smoothing toggle (default true). */
  smooth?: boolean;
  /** Goal radius (metres): if the goal cell is blocked but a walkable cell is within this radius, path to it. */
  goalTolerance?: number;
}

export interface FindPathResult {
  /** WORLD-space waypoints (empty if no path). The first is `from` snapped, the last is `to` snapped. */
  waypoints: THREE.Vector3[];
  /** Number of cells A* expanded. */
  expansions: number;
  /** Total path length in metres (summed segment lengths, including height). */
  length: number;
  /** True if a path was found. */
  found: boolean;
  /** Failure reason when !found. */
  reason?: 'no-start' | 'no-goal' | 'exhausted' | 'unreachable';
}

const DIAGONAL_COST = Math.SQRT2; // √2 — the 8-connected diagonal step cost.
const ORTHO_COST = 1;

// 8-connected neighbour offsets: (dx, dz).
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],          // orthogonal
  [1, 1], [1, -1], [-1, 1], [-1, -1],        // diagonal
];

export class Pathfinder {
  constructor(private readonly navmesh: NavGrid) {}

  find(opts: FindPathOptions): FindPathResult {
    const nav = this.navmesh;
    if (!nav.isBuilt) return { waypoints: [], expansions: 0, length: 0, found: false, reason: 'unreachable' };

    // Snap start + goal onto the nearest walkable cell.
    const startSnap = new THREE.Vector3();
    const goalSnap = new THREE.Vector3();
    const start = nav.snapToWalkable(opts.from.x, opts.from.z, 4, startSnap);
    const goal = nav.snapToWalkable(opts.to.x, opts.to.z, opts.goalTolerance ?? 4, goalSnap);
    if (!start) return { waypoints: [], expansions: 0, length: 0, found: false, reason: 'no-start' };
    if (!goal) return { waypoints: [], expansions: 0, length: 0, found: false, reason: 'no-goal' };

    const startCell = nav.cellAt(start.x, start.z)!;
    const goalCell = nav.cellAt(goal.x, goal.z)!;
    const startIdx = startCell.iz * nav.cellsX + startCell.ix;
    const goalIdx = goalCell.iz * nav.cellsX + goalCell.ix;
    if (startIdx === goalIdx) {
      return { waypoints: [start.clone(), goal.clone()], expansions: 0, length: start.distanceTo(goal), found: true };
    }

    const n = nav.cellsX * nav.cellsZ;
    const g = new Float32Array(n).fill(Infinity);
    const cameFrom = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    // Lazy-deletion A*: push a fresh heap entry every time g improves; stale entries
    // are dropped by the `closed` check at pop time. Bounded by E (≤ 8·V) so a 40k-cell
    // field allocates ≤ 320k heap slots — ~2.5MB, freed when find() returns.
    const heap = new MinHeap(n * 8);
    g[startIdx] = 0;
    heap.push(startIdx, octile(start, goal));

    const maxExp = opts.maxExpansions ?? n;
    let expansions = 0;
    let found = false;
    const neighbourPos = new THREE.Vector3();
    const curPos = new THREE.Vector3();

    while (heap.size > 0 && expansions < maxExp) {
      const cur = heap.pop();
      if (closed[cur]) continue;          // stale duplicate from a previous relaxation
      if (cur === goalIdx) { found = true; break; }
      closed[cur] = 1;
      expansions++;

      const curIx = cur % nav.cellsX;
      const curIz = (cur / nav.cellsX) | 0;
      nav.cellCenter(curIx, curIz, curPos);

      for (let ni = 0; ni < NEIGHBOURS.length; ni++) {
        const dx = NEIGHBOURS[ni][0];
        const dz = NEIGHBOURS[ni][1];
        const nx = curIx + dx, nz = curIz + dz;
        if (nx < 0 || nz < 0 || nx >= nav.cellsX || nz >= nav.cellsZ) continue;
        const nIdx = nz * nav.cellsX + nx;
        if (closed[nIdx] || !nav.cellData(nx, nz)!.walkable) continue;

        // No corner cutting: for a diagonal move, both orthogonal cells must be walkable.
        if (dx !== 0 && dz !== 0) {
          if (!nav.cellData(nx, curIz)!.walkable || !nav.cellData(curIx, nz)!.walkable) continue;
        }

        // Step-height gate: reject if the floor height difference exceeds maxStepHeight.
        const neighbourCell = nav.cellData(nx, nz)!;
        nav.cellCenter(nx, nz, neighbourPos);
        const dy = Math.abs(neighbourPos.y - curPos.y);
        if (dy > nav.maxStepHeight) continue;

        const stepCost = (dx !== 0 && dz !== 0 ? DIAGONAL_COST : ORTHO_COST) * nav.cellSize;
        // Add a small height cost so agents prefer flat routes over stairs when both exist.
        const heightCost = dy * 2;
        const tentativeG = g[cur] + stepCost + heightCost;
        if (tentativeG < g[nIdx]) {
          cameFrom[nIdx] = cur;
          g[nIdx] = tentativeG;
          nav.cellCenter(nx, nz, neighbourPos);
          heap.push(nIdx, tentativeG + octile(neighbourPos, goal));
        }
      }
    }

    if (!found) {
      return {
        waypoints: [],
        expansions,
        length: 0,
        found: false,
        reason: expansions >= maxExp ? 'exhausted' : 'unreachable',
      };
    }

    // Reconstruct.
    const cellPath: number[] = [];
    let cur: number = goalIdx;
    while (cur !== -1) { cellPath.push(cur); cur = cameFrom[cur]; }
    cellPath.reverse();

    // Convert cell indices → world-space waypoints.
    const raw: THREE.Vector3[] = [];
    const tmp = new THREE.Vector3();
    for (const idx of cellPath) {
      const ix = idx % nav.cellsX;
      const iz = (idx / nav.cellsX) | 0;
      nav.cellCenter(ix, iz, tmp);
      raw.push(tmp.clone());
    }
    // Replace the endpoints with the exact snapped positions so the path starts where
    // the caller asked (snapped) and ends where they asked (snapped), not at cell centres.
    if (raw.length > 0) {
      raw[0].copy(start);
      raw[raw.length - 1].copy(goal);
    }

    const smooth = opts.smooth ?? true;
    const waypoints = smooth ? this.smooth(raw) : raw;
    const length = pathLength(waypoints);
    return { waypoints, expansions, length, found: true };
  }

  /** String-pull smoothing: collapse intermediate waypoints wherever line-of-sight holds. */
  private smooth(raw: THREE.Vector3[]): THREE.Vector3[] {
    if (raw.length <= 2) return raw;
    const out: THREE.Vector3[] = [raw[0].clone()];
    let anchor = 0;
    let look = 2;
    while (look < raw.length) {
      const a = raw[anchor], b = raw[look];
      if (!this.navmesh.hasLineOfSight(a.x, a.z, b.x, b.z)) {
        // Can't skip — keep the waypoint just before `look` and advance the anchor.
        out.push(raw[look - 1].clone());
        anchor = look - 1;
      }
      look++;
    }
    out.push(raw[raw.length - 1].clone());
    return out;
  }
}

/** Octile distance (3D): the admissible heuristic for an 8-connected grid with height. */
function octile(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  const dy = Math.abs(a.y - b.y);
  const horiz = (Math.min(dx, dz) * DIAGONAL_COST + Math.abs(dx - dz)) ;
  return horiz + dy;
}

function pathLength(waypoints: THREE.Vector3[]): number {
  let len = 0;
  for (let i = 1; i < waypoints.length; i++) len += waypoints[i].distanceTo(waypoints[i - 1]);
  return len;
}

/**
 * Binary min-heap over cell indices, keyed by an external `f` score. Stores (idx, f) pairs.
 * `decrease` is a push-if-better (the standard A* relaxation) — duplicates in the heap
 * are filtered by the `closed` / `inOpen` flags at pop time.
 */
class MinHeap {
  private readonly idx: Int32Array;
  private readonly key: Float32Array;
  private _size = 0;

  constructor(capacity: number) {
    this.idx = new Int32Array(capacity);
    this.key = new Float32Array(capacity);
  }

  get size(): number { return this._size; }

  push(idx: number, key: number): void {
    const i = this._size++;
    this.idx[i] = idx;
    this.key[i] = key;
    this.siftUp(i);
  }

  pop(): number {
    const top = this.idx[0];
    const last = --this._size;
    if (last > 0) {
      this.idx[0] = this.idx[last];
      this.key[0] = this.key[last];
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.key[i] < this.key[parent]) {
        this.swap(i, parent);
        i = parent;
      } else break;
    }
  }

  private siftDown(i: number): void {
    const n = this._size;
    while (true) {
      const l = i * 2 + 1, r = i * 2 + 2;
      let best = i;
      if (l < n && this.key[l] < this.key[best]) best = l;
      if (r < n && this.key[r] < this.key[best]) best = r;
      if (best === i) break;
      this.swap(i, best);
      i = best;
    }
  }

  private swap(a: number, b: number): void {
    const ti = this.idx[a]; this.idx[a] = this.idx[b]; this.idx[b] = ti;
    const tk = this.key[a]; this.key[a] = this.key[b]; this.key[b] = tk;
  }
}
