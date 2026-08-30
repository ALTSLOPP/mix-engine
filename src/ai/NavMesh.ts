import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { WorldOrigin } from '../streaming/WorldOrigin';

/**
 * NavMesh.ts — a 2.5D heightfield navigation mesh built from the live physics world.
 *
 * Full Recast/Detour-style voxelized navmesh generation is a multi-thousand-line
 * undertaking; for an AI-native engine whose primary author is an LLM, a heightfield
 * is the sweet spot: cheap to build, trivially queryable, debuggable at a glance, and
 * sufficient for the open-world urban case (ground + sidewalks + rooftops reachable
 * via stairs/ramps). The data structure is intentionally simple so an agent can reason
 * about it ("is cell (x,z) walkable? at what height?") and the A* in Pathfinder.ts is
 * a textbook implementation over it.
 *
 * Storage: a uniform XZ grid. Per cell we store the walkable floor elevation (WORLD
 * space, so a floating-origin shift never corrupts it) and a packed slope flag. Cells
 * are blocked when an obstacle overlaps them or the slope exceeds `maxSlopeDeg`.
 * Obstacle inflation by `agentRadius` is a one-pass erosion so agents never path
 * through a gap thinner than their body.
 *
 * Build is ASYNC and time-budgeted: a 1km² region at 0.5m resolution is 4M cells, so
 * `build()` runs a few rows per tick until done and resolves with a stats summary.
 * Build uses downward raycasts against the live Rapier world — the cheapest accurate
 * way to recover walkable heights + normals without parsing collider geometry.
 *
 * DYNAMIC / CHUNK-AWARE: a full rebuild is too expensive to run every time a chunk
 * streams in or a building is extruded. `rebuildRegion()` re-rasterizes only the cells
 * inside a world-space rectangle (plus the erosion margin) SYNCHRONOUSLY, so the
 * NavigationSystem can patch the navmesh incrementally as the world mutates without a
 * frame hitch and without throwing away the whole grid. To make a partial re-erosion
 * correct we keep a `baseWalkable` buffer (post-slope/ceiling, PRE-erosion); the final
 * `walkable` is always derived from it, so re-running erosion over a sub-rect reads a
 * stable neighbour state.
 *
 * Multi-layer note: a single heightfield records the TOPMOST walkable surface per
 * cell. True 3D multi-layer (overlapping walkable floors) is a known limitation; the
 * API is shaped so a future voxel layer can be added without touching Pathfinder.ts.
 */

export interface NavMeshBuildOptions {
  /** World-space centre of the build region. */
  center: THREE.Vector3;
  /** World-space edge length of the (square) build region. */
  size: number;
  /** Cell side length in metres. Smaller = more accurate, exponentially more cells. */
  cellSize?: number;
  /** Agent body radius (metres). Obstacles are inflated by this so paths have clearance. */
  agentRadius?: number;
  /** Agent body height (metres). Cells whose ceiling is lower than this are blocked. */
  agentHeight?: number;
  /** Max walkable slope in degrees. Steeper cells are marked blocked. */
  maxSlopeDeg?: number;
  /** Max climbable step height in metres (used by Pathfinder, recorded here for context). */
  maxStepHeight?: number;
  /** Raycast ceiling (world Y) — rays start this far above the highest expected floor. */
  raycastCeiling?: number;
  /** Max milliseconds to spend per build tick before yielding to the frame. */
  budgetMsPerTick?: number;
}

export interface NavMeshStats {
  cells: number;
  walkable: number;
  blocked: number;
  buildMs: number;
  regionMin: [number, number];
  regionMax: [number, number];
  cellSize: number;
}

export interface NavCell {
  /** WORLD-space walkable floor elevation (0 if unwalkable). */
  height: number;
  /** True if an agent can stand here (slope OK, no obstacle, ceiling clearance OK). */
  walkable: boolean;
  /** Surface normal Y component (1 = flat, lower = steeper). */
  normalY: number;
}

/** A WORLD-space axis-aligned XZ rectangle (used to mark sub-regions dirty). */
export interface NavRect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * The read-only grid surface the Pathfinder + agent integration depend on. Extracting
 * it as an interface lets alternative grid providers (e.g. a future tiled/streamed
 * navmesh) drop in without touching Pathfinder.ts. `NavMesh` is the concrete impl.
 */
export interface NavGrid {
  readonly isBuilt: boolean;
  readonly originX: number;
  readonly originZ: number;
  readonly cellSize: number;
  readonly cellsX: number;
  readonly cellsZ: number;
  readonly maxStepHeight: number;
  cellAt(worldX: number, worldZ: number): { ix: number; iz: number } | null;
  heightAt(worldX: number, worldZ: number): number | null;
  isWalkableAt(worldX: number, worldZ: number): boolean;
  cellData(ix: number, iz: number): NavCell | null;
  cellCenter(ix: number, iz: number, out: THREE.Vector3): THREE.Vector3;
  hasLineOfSight(ax: number, az: number, bx: number, bz: number, stepOverride?: number): boolean;
  snapToWalkable(worldX: number, worldZ: number, maxSearchRadius: number, out: THREE.Vector3): THREE.Vector3 | null;
}

export class NavMesh implements NavGrid {
  /** WORLD-space min corner of the build region (XZ). */
  readonly originX: number;
  readonly originZ: number;
  readonly cellSize: number;
  readonly cellsX: number;
  readonly cellsZ: number;
  readonly agentRadius: number;
  readonly agentHeight: number;
  readonly maxSlopeDeg: number;
  readonly maxStepHeight: number;

  /** Tight storage so a 200×200 field is ~160KB instead of a Map of objects. */
  private readonly heights: Float32Array;
  /** Packed surface normal Y as int8 * 127 (so 1.0 → 127). */
  private readonly normalY: Int8Array;
  /** Post-slope, post-ceiling, PRE-erosion walkability. The source of truth for re-erosion. */
  private readonly baseWalkable: Uint8Array;
  /** Final walkability (baseWalkable eroded by agentRadius). What queries + A* read. */
  private readonly walkable: Uint8Array;
  private readonly blocked: Uint8Array;
  /** Erosion radius in cells (precomputed from agentRadius / cellSize). */
  private readonly radiusInCells: number;
  /** Raycast ceiling captured at build time so rebuildRegion casts identically. */
  private raycastCeiling = 200;

  private built = false;
  private building = false;

  constructor(opts: NavMeshBuildOptions) {
    this.cellSize = opts.cellSize ?? 1;
    this.agentRadius = opts.agentRadius ?? 0.4;
    this.agentHeight = opts.agentHeight ?? 1.8;
    this.maxSlopeDeg = opts.maxSlopeDeg ?? 45;
    this.maxStepHeight = opts.maxStepHeight ?? 0.5;
    const half = opts.size / 2;
    this.originX = opts.center.x - half;
    this.originZ = opts.center.z - half;
    this.cellsX = Math.max(1, Math.round(opts.size / this.cellSize));
    this.cellsZ = Math.max(1, Math.round(opts.size / this.cellSize));
    this.radiusInCells = Math.max(1, Math.ceil(this.agentRadius / this.cellSize));
    const n = this.cellsX * this.cellsZ;
    this.heights = new Float32Array(n);
    this.normalY = new Int8Array(n).fill(127);
    this.baseWalkable = new Uint8Array(n);
    this.walkable = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
  }

  get isBuilt(): boolean { return this.built; }
  get isBuilding(): boolean { return this.building; }
  get totalCells(): number { return this.cellsX * this.cellsZ; }
  get walkableCount(): number {
    let c = 0;
    for (let i = 0; i < this.walkable.length; i++) if (this.walkable[i]) c++;
    return c;
  }

  /** WORLD-space bounds of this navmesh (XZ). */
  get bounds(): NavRect {
    return {
      minX: this.originX,
      minZ: this.originZ,
      maxX: this.originX + this.cellsX * this.cellSize,
      maxZ: this.originZ + this.cellsZ * this.cellSize,
    };
  }

  /** Convert a WORLD-space position to a cell index. Out-of-range → null. */
  cellAt(worldX: number, worldZ: number): { ix: number; iz: number } | null {
    const ix = Math.floor((worldX - this.originX) / this.cellSize);
    const iz = Math.floor((worldZ - this.originZ) / this.cellSize);
    if (ix < 0 || iz < 0 || ix >= this.cellsX || iz >= this.cellsZ) return null;
    return { ix, iz };
  }

  /** Walkable height at a world position, or null if blocked / out of range / unbuilt. */
  heightAt(worldX: number, worldZ: number): number | null {
    if (!this.built) return null;
    const c = this.cellAt(worldX, worldZ);
    if (!c) return null;
    if (!this.walkable[c.iz * this.cellsX + c.ix]) return null;
    return this.heights[c.iz * this.cellsX + c.ix];
  }

  /** True if the cell at a world position is walkable. False out of range / unbuilt. */
  isWalkableAt(worldX: number, worldZ: number): boolean {
    if (!this.built) return false;
    const c = this.cellAt(worldX, worldZ);
    if (!c) return false;
    return this.walkable[c.iz * this.cellsX + c.ix] === 1;
  }

  /** Direct cell access for the Pathfinder (no world→cell conversion per query). */
  cellData(ix: number, iz: number): NavCell | null {
    if (ix < 0 || iz < 0 || ix >= this.cellsX || iz >= this.cellsZ) return null;
    const i = iz * this.cellsX + ix;
    return {
      height: this.heights[i],
      walkable: this.walkable[i] === 1,
      normalY: this.normalY[i] / 127,
    };
  }

  /** World-space centre of a cell (XZ at the cell's walkable height). */
  cellCenter(ix: number, iz: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(
      this.originX + (ix + 0.5) * this.cellSize,
      this.heights[iz * this.cellsX + ix],
      this.originZ + (iz + 0.5) * this.cellSize,
    );
    return out;
  }

  // ── Build ───────────────────────────────────────────────────────────────

  /**
   * Build the heightfield by downward raycasting at each cell centre. Async + budgeted:
   * runs `budgetMsPerTick` of work per microtask tick, then yields so a build never
   * stalls the frame. Resolves with stats. Rejects if a build is already in flight.
   *
   * The raycast is in ENGINE space — the build region is world-space, but Rapier bodies
   * live in engine space, so each ray origin is converted via WorldOrigin at cast time.
   * Recorded cell heights are stored back in WORLD space (height + worldOrigin.offset.y)
   * so the navmesh stays valid across subsequent origin shifts without a rebuild.
   */
  async build(
    physicsWorld: PhysicsWorld,
    worldOrigin: WorldOrigin,
    opts: NavMeshBuildOptions,
  ): Promise<NavMeshStats> {
    if (this.building) throw new Error('NavMesh: build already in flight');
    this.building = true;
    this.built = false;
    const t0 = performance.now();
    this.raycastCeiling = opts.raycastCeiling ?? 200;
    const budget = opts.budgetMsPerTick ?? 6;
    const slopeCos = Math.cos(THREE.MathUtils.degToRad(this.maxSlopeDeg));
    const engScratch = new THREE.Vector3();

    // Phase 1 — downward raycast per cell: record topmost walkable height + slope.
    let iz = 0;
    while (iz < this.cellsZ) {
      const tickStart = performance.now();
      while (iz < this.cellsZ && performance.now() - tickStart < budget) {
        for (let ix = 0; ix < this.cellsX; ix++) {
          this.rasterizeCellHeight(ix, iz, physicsWorld, worldOrigin, slopeCos, engScratch);
        }
        iz++;
      }
      if (iz < this.cellsZ) await new Promise((r) => setTimeout(r, 0));
    }

    // Phase 2 — ceiling clearance: blocks cells whose ceiling is lower than agentHeight.
    iz = 0;
    while (iz < this.cellsZ) {
      const tickStart = performance.now();
      while (iz < this.cellsZ && performance.now() - tickStart < budget) {
        for (let ix = 0; ix < this.cellsX; ix++) {
          this.applyCeiling(ix, iz, physicsWorld, worldOrigin, engScratch);
        }
        iz++;
      }
      if (iz < this.cellsZ) await new Promise((r) => setTimeout(r, 0));
    }

    // Phase 3 — erode baseWalkable by agentRadius so paths keep wall clearance.
    for (let bz = 0; bz < this.cellsZ; bz++) {
      for (let bx = 0; bx < this.cellsX; bx++) this.erodeCell(bx, bz);
    }

    this.built = true;
    this.building = false;
    return this.statsSince(t0);
  }

  /**
   * Re-rasterize ONLY the cells inside a world-space rectangle (plus the erosion
   * margin). Synchronous — designed to patch the navmesh as chunks stream in/out or a
   * building is extruded, without a full async rebuild. Returns the number of cells
   * touched (0 if the rect doesn't overlap this navmesh). No-op until `build()` has run.
   */
  rebuildRegion(physicsWorld: PhysicsWorld, worldOrigin: WorldOrigin, rect: NavRect): number {
    if (!this.built) return 0;
    // Reject rects that don't overlap the navmesh at all (before any index clamping, which
    // would otherwise snap a far rect onto the border row/column).
    const b = this.bounds;
    if (rect.maxX < b.minX || rect.minX > b.maxX || rect.maxZ < b.minZ || rect.minZ > b.maxZ) return 0;
    const slopeCos = Math.cos(THREE.MathUtils.degToRad(this.maxSlopeDeg));
    const eng = new THREE.Vector3();

    // Inner range = cells whose CENTRE could fall in the rect (clamped to the grid).
    const x0 = this.clampIx(Math.floor((rect.minX - this.originX) / this.cellSize));
    const x1 = this.clampIx(Math.ceil((rect.maxX - this.originX) / this.cellSize));
    const z0 = this.clampIz(Math.floor((rect.minZ - this.originZ) / this.cellSize));
    const z1 = this.clampIz(Math.ceil((rect.maxZ - this.originZ) / this.cellSize));
    if (x1 < 0 || z1 < 0 || x0 >= this.cellsX || z0 >= this.cellsZ) return 0;

    // 1. Re-raycast heights + slope over the inner rect.
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        this.rasterizeCellHeight(ix, iz, physicsWorld, worldOrigin, slopeCos, eng);
      }
    }
    // 2. Re-apply ceiling over the inner rect.
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        this.applyCeiling(ix, iz, physicsWorld, worldOrigin, eng);
      }
    }
    // 3. Re-erode the inner rect EXPANDED by the erosion radius — a cell's base-walkable
    //    flip changes the erosion outcome of neighbours up to `radiusInCells` away.
    const r = this.radiusInCells;
    const ex0 = this.clampIx(x0 - r), ex1 = this.clampIx(x1 + r);
    const ez0 = this.clampIz(z0 - r), ez1 = this.clampIz(z1 + r);
    let touched = 0;
    for (let iz = ez0; iz <= ez1; iz++) {
      for (let ix = ex0; ix <= ex1; ix++) { this.erodeCell(ix, iz); touched++; }
    }
    return touched;
  }

  // ── Per-cell kernels (shared by build + rebuildRegion) ──────────────────

  /** Phase 1 for one cell: downward raycast → height/normal/slope into baseWalkable. */
  private rasterizeCellHeight(
    ix: number, iz: number,
    physicsWorld: PhysicsWorld, worldOrigin: WorldOrigin,
    slopeCos: number, engScratch: THREE.Vector3,
  ): void {
    const i = iz * this.cellsX + ix;
    const wx = this.originX + (ix + 0.5) * this.cellSize;
    const wz = this.originZ + (iz + 0.5) * this.cellSize;
    worldOrigin.toEngineSpaceInto(engScratch, engScratch.set(wx, this.raycastCeiling, wz));
    const hit = physicsWorld.raycast(engScratch, DOWN, this.raycastCeiling + 50, true);
    if (!hit) {
      this.baseWalkable[i] = 0;
      this.heights[i] = 0;
      this.normalY[i] = 127;
      return;
    }
    const ny = hit.normal.y;
    this.normalY[i] = Math.max(-127, Math.min(127, Math.round(ny * 127)));
    this.heights[i] = hit.point.y + worldOrigin.offset.y; // WORLD space
    this.baseWalkable[i] = ny >= slopeCos ? 1 : 0;
  }

  /** Phase 2 for one cell: short downward ray from floor+agentHeight clears low ceilings. */
  private applyCeiling(
    ix: number, iz: number,
    physicsWorld: PhysicsWorld, worldOrigin: WorldOrigin,
    engScratch: THREE.Vector3,
  ): void {
    const i = iz * this.cellsX + ix;
    if (!this.baseWalkable[i]) return;
    const wx = this.originX + (ix + 0.5) * this.cellSize;
    const wz = this.originZ + (iz + 0.5) * this.cellSize;
    const floorY = this.heights[i]; // WORLD space
    // Convert the full world-space position to engine space in one call — wx/wz also need
    // the XZ offset subtracted, not just Y. The manual engFloorY approach forgot this.
    engScratch.set(wx, floorY + this.agentHeight + 0.05, wz);
    worldOrigin.toEngineSpaceInto(engScratch, engScratch);
    const hit = physicsWorld.raycast(engScratch, DOWN, this.agentHeight + 0.1, true);
    if (hit && hit.point.y + worldOrigin.offset.y > floorY + 0.01) {
      this.baseWalkable[i] = 0;
    }
  }

  /** Phase 3 for one cell: walkable iff base-walkable AND every cell within the agent
   *  radius window is base-walkable + in-bounds (so paths keep wall clearance). */
  private erodeCell(ix: number, iz: number): void {
    const i = iz * this.cellsX + ix;
    if (!this.baseWalkable[i]) { this.walkable[i] = 0; this.blocked[i] = 1; return; }
    const r = this.radiusInCells;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = ix + dx, nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= this.cellsX || nz >= this.cellsZ) {
          this.walkable[i] = 0; this.blocked[i] = 1; return;
        }
        if (!this.baseWalkable[nz * this.cellsX + nx]) {
          this.walkable[i] = 0; this.blocked[i] = 1; return;
        }
      }
    }
    this.walkable[i] = 1;
    this.blocked[i] = 0;
  }

  private clampIx(v: number): number { return Math.max(0, Math.min(this.cellsX - 1, v)); }
  private clampIz(v: number): number { return Math.max(0, Math.min(this.cellsZ - 1, v)); }

  private statsSince(t0: number): NavMeshStats {
    let walkable = 0;
    for (let i = 0; i < this.walkable.length; i++) if (this.walkable[i]) walkable++;
    return {
      cells: this.totalCells,
      walkable,
      blocked: this.totalCells - walkable,
      buildMs: +(performance.now() - t0).toFixed(1),
      regionMin: [this.originX, this.originZ],
      regionMax: [this.originX + this.cellsX * this.cellSize, this.originZ + this.cellsZ * this.cellSize],
      cellSize: this.cellSize,
    };
  }

  /** Clear the build — used by NavigationSystem before a rebuild. */
  clear(): void {
    this.built = false;
    this.baseWalkable.fill(0);
    this.walkable.fill(0);
    this.blocked.fill(0);
    this.heights.fill(0);
    this.normalY.fill(127);
  }

  /**
   * True if a straight line between two world points has line-of-sight (all walkable
   * AND no step larger than maxStepHeight * 1.5 along the way). Used by the path
   * smoother to skip intermediate waypoints.
   */
  hasLineOfSight(ax: number, az: number, bx: number, bz: number, stepOverride?: number): boolean {
    if (!this.built) return false;
    const dx = bx - ax, dz = bz - az;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1e-4) return this.isWalkableAt(ax, az);
    const step = stepOverride ?? Math.max(this.cellSize * 0.5, 0.25);
    const n = Math.max(1, Math.ceil(dist / step));
    const sx = dx / n, sz = dz / n;
    let lastHeight = this.heightAt(ax, az);
    if (lastHeight === null) return false;
    for (let i = 1; i <= n; i++) {
      const x = ax + sx * i, z = az + sz * i;
      if (!this.isWalkableAt(x, z)) return false;
      const h = this.heightAt(x, z);
      if (h === null) return false;
      if (Math.abs(h - lastHeight) > this.maxStepHeight * 1.5) return false;
      lastHeight = h;
    }
    return true;
  }

  /** Snap a world position onto the nearest walkable cell centre (or null if none in range). */
  snapToWalkable(worldX: number, worldZ: number, maxSearchRadius: number, out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.built) return null;
    if (this.isWalkableAt(worldX, worldZ)) {
      const c = this.cellAt(worldX, worldZ)!;
      return this.cellCenter(c.ix, c.iz, out);
    }
    const r = Math.max(1, Math.ceil(maxSearchRadius / this.cellSize));
    const c = this.cellAt(worldX, worldZ);
    if (!c) return null;
    let best: { x: number; z: number; d: number } | null = null;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const ix = c.ix + dx, iz = c.iz + dz;
        if (ix < 0 || iz < 0 || ix >= this.cellsX || iz >= this.cellsZ) continue;
        if (!this.walkable[iz * this.cellsX + ix]) continue;
        const wx = this.originX + (ix + 0.5) * this.cellSize;
        const wz = this.originZ + (iz + 0.5) * this.cellSize;
        const d = (wx - worldX) ** 2 + (wz - worldZ) ** 2;
        if (!best || d < best.d) best = { x: wx, z: wz, d };
      }
    }
    if (!best) return null;
    const h = this.heightAt(best.x, best.z) ?? 0;
    out.set(best.x, h, best.z);
    return out;
  }
}

const DOWN = new THREE.Vector3(0, -1, 0);
