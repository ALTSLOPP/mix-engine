import * as THREE from 'three';

/**
 * DetailManager.ts — a content-side detail-cap + proxy-swap policy layer.
 *
 * Ported from the GTA prototype's `cityBlock/cityBlockDetailCaps.ts` +
 * `cityBlock/cityBlockStreaming.ts`. The MIX engine already ships the *primitives* an open
 * world needs (LODSystem, CullingSystem, ChunkManager), but it has no *policy* for the
 * classic open-city problem: "I have 400 buildings but can only afford 20 detailed ones —
 * which 20, and when do I swap the rest to cheap blocky proxies?"
 *
 * DetailManager answers exactly that. You register a group of placements, each pairing a
 * full-detail object with an optional cheap proxy. Every frame it:
 *
 *   1. Computes planar (XZ) distance² from the camera to each placement.
 *   2. Picks the N nearest placements within the detail band (N = a hard budget, optionally
 *      motion-scaled down while the camera moves fast) and shows their detail mesh.
 *   3. Shows the proxy (or hides) for everything else.
 *   4. Uses hysteresis (separate enter/exit radii) so a placement straddling the boundary
 *      doesn't thrash detail↔proxy every frame.
 *
 * It only flips `.visible`; it never disposes geometry, so it composes cleanly with the
 * engine's CullingSystem / LODSystem (which can still LOD/cull whatever ends up visible).
 */

export interface DetailPlacement {
  /** WORLD or engine XZ position — must match the camera space you pass to update(). */
  position: [number, number, number];
  /** The full-detail object (shown when this placement is within the active budget). */
  detail: THREE.Object3D;
  /** A cheap stand-in shown when the placement is demoted (optional — omit to just hide). */
  proxy?: THREE.Object3D | null;
}

export interface DetailGroupConfig {
  /** Hard cap on how many placements may be detailed at once. */
  maxDetailed: number;
  /** Radius (metres) within which a placement is eligible to be detailed. */
  detailRadius: number;
  /** Never drop below this many detailed placements even at speed (default 4). */
  minActive?: number;
  /** Hysteresis: a detailed placement is only demoted past detailRadius × this (default 1.3). */
  exitMultiplier?: number;
}

interface DetailGroup {
  placements: DetailPlacement[];
  maxDetailed: number;
  enterSq: number;
  exitSq: number;
  minActive: number;
  /** Which indices were detailed last frame (for hysteresis). */
  detailed: Set<number>;
}

/** Clamp a requested cap against what's actually available (ported detail-caps helper). */
export function resolveDetailCap(requestedCap: number, availableCount: number): number {
  if (!Number.isFinite(requestedCap) || requestedCap <= 0) return 0;
  if (!Number.isFinite(availableCount) || availableCount <= 0) return 0;
  return Math.min(Math.floor(requestedCap), Math.floor(availableCount));
}

/** Reduce the detail budget as the camera moves faster (ported motion-scaled budget). */
export function resolveMotionScaledDetailBudget(requestedCap: number, speedRatio: number, minimumActiveCap: number): number {
  const safeCap = Math.floor(requestedCap);
  if (safeCap <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, speedRatio));
  const motionScale = 1 - ratio * (2 / 3); // full speed ⇒ keep ~1/3 of the budget
  const motionFloor = Math.min(minimumActiveCap, safeCap);
  return Math.max(motionFloor, Math.round(safeCap * motionScale));
}

export class DetailManager {
  private readonly groups = new Map<string, DetailGroup>();

  // Camera speed estimate (for motion-scaled budgets).
  private readonly _lastCamPos = new THREE.Vector3();
  private _hasLastCam = false;
  private _speed = 0;
  /** Speed (m/s) treated as "fully fast" (ratio 1). Tunable. */
  speedReference = 28;

  /** Register / replace a group of placements. */
  registerGroup(id: string, placements: DetailPlacement[], config: DetailGroupConfig): void {
    const exitMul = config.exitMultiplier ?? 1.3;
    const enter = config.detailRadius;
    const exit = config.detailRadius * exitMul;
    this.groups.set(id, {
      placements,
      maxDetailed: config.maxDetailed,
      enterSq: enter * enter,
      exitSq: exit * exit,
      minActive: config.minActive ?? 4,
      detailed: new Set(),
    });
    // Start everything as proxy until the first update resolves the budget.
    for (const p of placements) {
      p.detail.visible = false;
      if (p.proxy) p.proxy.visible = true;
    }
  }

  setBudget(id: string, maxDetailed: number): void {
    const g = this.groups.get(id);
    if (g) g.maxDetailed = maxDetailed;
  }

  unregisterGroup(id: string): void {
    this.groups.delete(id);
  }

  /** Per-frame policy pass. Call from the engine/game loop with the active camera. */
  update(camera: THREE.Camera, dt = 0): void {
    // Estimate camera speed for motion scaling.
    const camPos = camera.position;
    if (this._hasLastCam && dt > 0) {
      const inst = this._lastCamPos.distanceTo(camPos) / dt;
      this._speed += (inst - this._speed) * Math.min(1, dt * 6); // smooth
    }
    this._lastCamPos.copy(camPos);
    this._hasLastCam = true;
    const speedRatio = Math.min(1, this._speed / Math.max(1e-3, this.speedReference));

    for (const g of this.groups.values()) {
      this.updateGroup(g, camPos, speedRatio);
    }
  }

  private updateGroup(g: DetailGroup, camPos: THREE.Vector3, speedRatio: number): void {
    const budget = resolveMotionScaledDetailBudget(
      resolveDetailCap(g.maxDetailed, g.placements.length),
      speedRatio,
      g.minActive,
    );

    // Collect eligible candidates (within enter radius, or exit radius if already detailed
    // — the hysteresis), keeping the nearest `budget` via a small sorted insert.
    const chosen: number[] = [];
    const chosenSq: number[] = [];
    for (let i = 0; i < g.placements.length; i++) {
      const p = g.placements[i];
      const dx = camPos.x - p.position[0];
      const dz = camPos.z - p.position[2];
      const dsq = dx * dx + dz * dz;
      const radiusSq = g.detailed.has(i) ? g.exitSq : g.enterSq;
      if (dsq > radiusSq) continue;
      // Insert into the nearest-`budget` list.
      let lo = 0, hi = chosen.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if ((chosenSq[mid] ?? Infinity) <= dsq) lo = mid + 1; else hi = mid;
      }
      if (lo >= budget) continue; // farther than everything already kept and list full
      chosen.splice(lo, 0, i);
      chosenSq.splice(lo, 0, dsq);
      if (chosen.length > budget) { chosen.pop(); chosenSq.pop(); }
    }

    const nextDetailed = new Set(chosen);
    // Apply visibility deltas only where state changed.
    for (let i = 0; i < g.placements.length; i++) {
      const want = nextDetailed.has(i);
      const had = g.detailed.has(i);
      if (want === had) continue;
      const p = g.placements[i];
      p.detail.visible = want;
      if (p.proxy) p.proxy.visible = !want;
    }
    g.detailed = nextDetailed;
  }

  /** Current camera speed estimate (m/s) — debug. */
  get cameraSpeed(): number { return this._speed; }

  dispose(): void {
    this.groups.clear();
    this._hasLastCam = false;
    this._speed = 0;
  }
}
