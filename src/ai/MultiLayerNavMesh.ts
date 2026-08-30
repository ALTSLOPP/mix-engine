import * as THREE from 'three';
import type { NavGrid, NavCell, NavRect, NavMeshBuildOptions } from './NavMesh';

export interface WalkableSpan {
  floorY: number;
  ceilingY: number;
  walkable: boolean;
  normalY: number;
  layerId: number;
}

export interface MultiLayerCell {
  spans: WalkableSpan[];
}

/**
 * MultiLayerNavMesh.ts — 3D multi-span navigation mesh supporting multi-story buildings,
 * bridges with underpasses, interior stairs, and vertical architecture.
 */
export class MultiLayerNavMesh implements NavGrid {
  readonly originX: number;
  readonly originZ: number;
  readonly cellSize: number;
  readonly cellsX: number;
  readonly cellsZ: number;
  readonly agentRadius: number;
  readonly agentHeight: number;
  readonly maxSlopeDeg: number;
  readonly maxStepHeight: number;

  private readonly grid: Map<number, WalkableSpan[]> = new Map();
  private built = false;

  constructor(opts: NavMeshBuildOptions) {
    this.cellSize = opts.cellSize ?? 1.0;
    this.agentRadius = opts.agentRadius ?? 0.4;
    this.agentHeight = opts.agentHeight ?? 1.8;
    this.maxSlopeDeg = opts.maxSlopeDeg ?? 45.0;
    this.maxStepHeight = opts.maxStepHeight ?? 0.5;

    const half = opts.size / 2;
    this.originX = opts.center.x - half;
    this.originZ = opts.center.z - half;
    this.cellsX = Math.max(1, Math.round(opts.size / this.cellSize));
    this.cellsZ = Math.max(1, Math.round(opts.size / this.cellSize));
    this.built = true;
  }

  get isBuilt(): boolean {
    return this.built;
  }

  get totalSpans(): number {
    let count = 0;
    for (const spans of this.grid.values()) {
      count += spans.length;
    }
    return count;
  }

  /** Add or register a walkable floor span at cell coordinate (ix, iz). */
  addSpan(ix: number, iz: number, span: Omit<WalkableSpan, 'layerId'>): void {
    if (ix < 0 || iz < 0 || ix >= this.cellsX || iz >= this.cellsZ) return;
    const key = iz * this.cellsX + ix;
    let list = this.grid.get(key);
    if (!list) {
      list = [];
      this.grid.set(key, list);
    }
    list.push({ ...span, layerId: 0 });
    // Sort spans vertically by floor elevation, THEN renumber. layerId means "n-th
    // floor up from the ground", which is only true after sorting — assigning it from
    // insertion order made ground-floor/roof ids depend on build order.
    list.sort((a, b) => a.floorY - b.floorY);
    for (let i = 0; i < list.length; i++) {
      list[i].layerId = i;
    }
  }

  cellAt(worldX: number, worldZ: number): { ix: number; iz: number } | null {
    const ix = Math.floor((worldX - this.originX) / this.cellSize);
    const iz = Math.floor((worldZ - this.originZ) / this.cellSize);
    if (ix < 0 || iz < 0 || ix >= this.cellsX || iz >= this.cellsZ) return null;
    return { ix, iz };
  }

  /** Get all vertical elevation spans at a world (x, z) location. */
  spansAt(worldX: number, worldZ: number): WalkableSpan[] {
    const c = this.cellAt(worldX, worldZ);
    if (!c) return [];
    const key = c.iz * this.cellsX + c.ix;
    return this.grid.get(key) ?? [];
  }

  /** Find the nearest walkable floor span to an agent at 3D position (worldX, worldY, worldZ). */
  nearestWalkableSpan(worldX: number, worldY: number, worldZ: number, maxVerticalDist = 3.0): WalkableSpan | null {
    const spans = this.spansAt(worldX, worldZ);
    if (spans.length === 0) return null;

    let closest: WalkableSpan | null = null;
    let minDiff = Infinity;

    for (const span of spans) {
      if (!span.walkable) continue;
      const diff = Math.abs(span.floorY - worldY);
      if (diff <= maxVerticalDist && diff < minDiff) {
        minDiff = diff;
        closest = span;
      }
    }
    return closest;
  }

  /** Height query defaulting to topmost walkable floor for backward compatibility. */
  heightAt(worldX: number, worldZ: number): number | null {
    const spans = this.spansAt(worldX, worldZ);
    if (spans.length === 0) return null;
    for (let i = spans.length - 1; i >= 0; i--) {
      if (spans[i].walkable) return spans[i].floorY;
    }
    return null;
  }

  isWalkableAt(worldX: number, worldZ: number): boolean {
    const spans = this.spansAt(worldX, worldZ);
    return spans.some((s) => s.walkable);
  }

  cellData(ix: number, iz: number): NavCell | null {
    const key = iz * this.cellsX + ix;
    const spans = this.grid.get(key);
    if (!spans || spans.length === 0) return null;
    const top = spans[spans.length - 1];
    return {
      height: top.floorY,
      walkable: top.walkable,
      normalY: top.normalY,
    };
  }

  cellCenter(ix: number, iz: number, out: THREE.Vector3): THREE.Vector3 {
    const x = this.originX + (ix + 0.5) * this.cellSize;
    const z = this.originZ + (iz + 0.5) * this.cellSize;
    const y = this.heightAt(x, z) ?? 0;
    return out.set(x, y, z);
  }

  hasLineOfSight(ax: number, az: number, bx: number, bz: number, _stepOverride?: number): boolean {
    // 2D ray march over grid cells checking general walkability
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const step = this.cellSize * 0.5;
    const numSteps = Math.max(1, Math.floor(dist / step));

    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const x = ax + dx * t;
      const z = az + dz * t;
      if (!this.isWalkableAt(x, z)) return false;
    }
    return true;
  }

  snapToWalkable(worldX: number, worldZ: number, maxSearchRadius: number, out: THREE.Vector3): THREE.Vector3 | null {
    if (this.isWalkableAt(worldX, worldZ)) {
      const y = this.heightAt(worldX, worldZ) ?? 0;
      return out.set(worldX, y, worldZ);
    }

    const radiusCells = Math.ceil(maxSearchRadius / this.cellSize);
    const center = this.cellAt(worldX, worldZ);
    if (!center) return null;

    let bestDistSq = Infinity;
    let bestPos: THREE.Vector3 | null = null;
    const testCenter = new THREE.Vector3();

    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      for (let dz = -radiusCells; dz <= radiusCells; dz++) {
        const ix = center.ix + dx;
        const iz = center.iz + dz;
        if (ix < 0 || iz < 0 || ix >= this.cellsX || iz >= this.cellsZ) continue;
        const key = iz * this.cellsX + ix;
        const spans = this.grid.get(key);
        if (!spans || !spans.some((s) => s.walkable)) continue;

        this.cellCenter(ix, iz, testCenter);
        const distSq = (testCenter.x - worldX) ** 2 + (testCenter.z - worldZ) ** 2;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestPos = testCenter.clone();
        }
      }
    }
    if (bestPos) {
      return out.copy(bestPos);
    }
    return null;
  }
}
