import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { SceneManager } from '../ecs/SceneManager';
import type { WorldOrigin } from './WorldOrigin';
import type { TransformGizmo } from '../rendering/TransformGizmo';
import type { ChunkDeltaBinder } from './ChunkDeltaBinder';
import {
  CHUNK_SIZE,
  chunkCoordsFromWorld,
  chunkIdFor,
  parseChunkId,
  type ChunkId,
} from './chunkMath';

export interface ChunkManagerDeps {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  worldOrigin: WorldOrigin;
  physicsWorld: PhysicsWorld;
  sceneManager: SceneManager;
  gizmo: TransformGizmo;
  /** Notified when a chunk's colliders enter/leave the world. The dynamic navmesh uses
   *  these to re-rasterize the chunk's footprint (chunk-aware pathfinding). */
  onChunkLoaded?: (cx: number, cz: number) => void;
  onChunkUnloaded?: (cx: number, cz: number) => void;
  /** Persists player modifications (destroyed props, moved boulders) across a chunk's
   *  unload/reload cycle. Without it the ChunkDeltaRegistry never records or replays. */
  deltas?: ChunkDeltaBinder;
}

interface FailureRecord {
  retries: number;
  nextAttempt: number;
}

/**
 * ChunkManager.ts — chunk streaming + floating origin.
 *
 * Streaming is OPT-IN (off by default) so a fresh scene with no chunk files on disk does
 * not spam 404s — but checkFloatingOrigin() runs unconditionally, since the floating-origin
 * system is independent of whether any chunks are being streamed.
 */
export class ChunkManager {
  static readonly LOAD_RADIUS = 3;
  static readonly UNLOAD_RADIUS = 5;
  static readonly FRAME_BUDGET_MS = 2;
  static readonly ORIGIN_THRESHOLD = 1000;
  static readonly MAX_RETRIES = 5;
  static readonly MAX_UNLOADS_PER_FRAME = 2;
  static readonly MAX_CONCURRENT_LOADS = 6;

  private readonly loaded = new Set<ChunkId>();
  private readonly loading = new Set<ChunkId>();
  private readonly failed = new Map<ChunkId, FailureRecord>();
  private readonly parseQueue: Array<{ id: ChunkId; bytes: Uint8Array }> = [];
  private streamingEnabled = false;
  /** Per-frame id remap + parent relations shared across all chunk loads this tick.
   *  Cleared at the start of every `update()` so chunks loaded in different frames
   *  don't share a map. Populated as a side effect of `loadChunkFromBinary` so any
   *  parent-child links inside a streamed chunk are preserved (they were lost before
   *  because the call site didn't pass the optional idMap/relations args). */
  private readonly streamIdMap = new Map<number, number>();
  private readonly streamRelations: Array<{ childOldId: number; parentOldId: number }> = [];

  private readonly camera: THREE.PerspectiveCamera;
  private readonly scene: THREE.Scene;
  private readonly worldOrigin: WorldOrigin;
  private readonly physicsWorld: PhysicsWorld;
  private readonly sceneManager: SceneManager;
  private readonly gizmo: TransformGizmo;
  private readonly onChunkLoaded?: (cx: number, cz: number) => void;
  private readonly onChunkUnloaded?: (cx: number, cz: number) => void;
  private readonly deltas?: ChunkDeltaBinder;

  private readonly _world = new THREE.Vector3();
  private readonly _offset = new THREE.Vector3();

  constructor(deps: ChunkManagerDeps) {
    this.camera = deps.camera;
    this.scene = deps.scene;
    this.worldOrigin = deps.worldOrigin;
    this.physicsWorld = deps.physicsWorld;
    this.sceneManager = deps.sceneManager;
    this.gizmo = deps.gizmo;
    this.onChunkLoaded = deps.onChunkLoaded;
    this.onChunkUnloaded = deps.onChunkUnloaded;
    this.deltas = deps.deltas;
  }

  setStreamingEnabled(on: boolean): void {
    this.streamingEnabled = on;
  }

  markLoaded(id: ChunkId): void {
    this.loaded.add(id);
    this.loading.delete(id);
    this.failed.delete(id);
  }

  /** Loop step 3 — stream from WORLD space (chunk IDs are grid-anchored). */
  update(): void {
    if (!this.streamingEnabled) return;
    const start = performance.now();

    // Clear the per-frame idMap/relations so chunks loaded this tick get a fresh pair
    // and any parent-child links they spawn land in the same map as the rest of this
    // frame's loads.
    this.streamIdMap.clear();
    this.streamRelations.length = 0;

    this.worldOrigin.toWorldSpaceInto(this._world, this.camera.position);
    const { cx, cz } = chunkCoordsFromWorld(this._world);
    const now = performance.now();

    // Phase 1 — fetch missing chunks within LOAD_RADIUS (skip loaded / loading / backoff).
    loadLoop:
    for (let dz = -ChunkManager.LOAD_RADIUS; dz <= ChunkManager.LOAD_RADIUS; dz++) {
      for (let dx = -ChunkManager.LOAD_RADIUS; dx <= ChunkManager.LOAD_RADIUS; dx++) {
        // `loading` covers both active fetches and downloaded jobs waiting for the
        // parse budget, bounding network concurrency and queued byte-buffer memory.
        if (this.loading.size >= ChunkManager.MAX_CONCURRENT_LOADS) break loadLoop;
        const id = chunkIdFor(cx + dx, cz + dz);
        if (this.loaded.has(id) || this.loading.has(id) || this.isBackedOff(id, now)) continue;
        void this.fetchChunk(id);
      }
    }

    // Phase 2/3 — parse + instantiate, time-budgeted. We pass the per-frame idMap +
    // relations so parent-child links inside streamed chunks survive the remap.
    while (this.parseQueue.length > 0 && performance.now() - start < ChunkManager.FRAME_BUDGET_MS) {
      const job = this.parseQueue.shift()!;
      try {
        this.sceneManager.loadChunkFromBinary(job.id, job.bytes, this.streamIdMap, this.streamRelations);
        this.loaded.add(job.id);
        // Replay persisted player modifications onto the entities we just spawned
        // (destroyed props stay destroyed, moved props stay moved).
        this.deltas?.onChunkLoaded(job.id);
        if (this.onChunkLoaded) { const { cx, cz } = parseChunkId(job.id); this.onChunkLoaded(cx, cz); }
      } catch (err) {
        this.recordFailure(job.id, err);
      } finally {
        this.loading.delete(job.id);
      }
    }
    // After all chunks in this tick are loaded, re-attach the parent-child links
    // (the loadChunkFromBinary call populates streamRelations; we materialize them now).
    for (const rel of this.streamRelations) {
      const childNew = this.streamIdMap.get(rel.childOldId);
      const parentNew = this.streamIdMap.get(rel.parentOldId);
      if (childNew !== undefined && parentNew !== undefined) {
        this.sceneManager.parentEntity(childNew, parentNew);
      }
    }
    this.streamRelations.length = 0;

    // Phase 4 — unload beyond UNLOAD_RADIUS, budgeted (disposal is not free).
    let unloads = 0;
    for (const id of this.loaded) {
      if (unloads >= ChunkManager.MAX_UNLOADS_PER_FRAME) break;
      const { cx: ix, cz: iz } = parseChunkId(id);
      const dist = Math.max(Math.abs(ix - cx), Math.abs(iz - cz));
      if (dist > ChunkManager.UNLOAD_RADIUS && this.canUnload(id)) {
        // Snapshot moved entities, then suppress destruction-recording for the
        // teardown cascade that destroyChunkEntities is about to queue.
        // Snapshot moved entities, then suppress destruction-recording for the
        // teardown cascade destroyChunkEntities queues. The Engine closes the window
        // after the deferred flush actually runs those destroys.
        this.deltas?.beginUnload(id);
        this.sceneManager.destroyChunkEntities(id);
        this.loaded.delete(id);
        if (this.onChunkUnloaded) this.onChunkUnloaded(ix, iz);
        unloads += 1;
      }
    }
  }

  private isBackedOff(id: ChunkId, now: number): boolean {
    const f = this.failed.get(id);
    return f !== undefined && now < f.nextAttempt;
  }

  private async fetchChunk(id: ChunkId): Promise<void> {
    this.loading.add(id);
    try {
      const { cx, cz } = parseChunkId(id);
      const res = await fetch(`/worlds/chunks/${cx}_${cz}.bin`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.parseQueue.push({ id, bytes: new Uint8Array(await res.arrayBuffer()) });
      this.failed.delete(id);
    } catch (err) {
      // A bad chunk must NEVER wedge the queue or throw unhandled.
      this.loading.delete(id);
      this.recordFailure(id, err);
    }
  }

  private recordFailure(id: ChunkId, err: unknown): void {
    const prev = this.failed.get(id);
    const retries = (prev?.retries ?? 0) + 1;
    // Capped exponential backoff; permanently-failed chunks back off forever.
    const nextAttempt =
      retries > ChunkManager.MAX_RETRIES
        ? Number.POSITIVE_INFINITY
        : performance.now() + Math.min(1000 * 2 ** retries, 30000);
    this.failed.set(id, { retries, nextAttempt });
    console.warn(`[ChunkManager] chunk ${id} load failed (attempt ${retries}):`, err);
  }

  /** Blocked if tethered to a still-loaded chunk (no cross-chunk joints in Step 2). */
  private canUnload(_id: ChunkId): boolean {
    return true;
  }

  /**
   * Loop step 9 — floating origin (before interpolation; supported during a gizmo drag).
   * Atomically recenters engine space when the camera drifts past ORIGIN_THRESHOLD.
   */
  checkFloatingOrigin(enginePos: THREE.Vector3): void {
    if (enginePos.length() < ChunkManager.ORIGIN_THRESHOLD) return;
    const offset = this._offset.copy(enginePos); // recenters the camera to the origin

    // 1. Non-physics, non-light, non-excluded root-level Object3Ds (physics roots are
    //    handled by 2–3 + interpolate; nested children move with their parent).
    for (const child of this.scene.children) {
      if (
        child.userData.physicsRoot === true ||
        child.userData.excludeFromOriginShift === true ||
        (child as unknown as { isLight?: boolean }).isLight === true
      ) {
        continue;
      }
      child.position.sub(offset);
    }

    // 2. All Rapier bodies + self-tracked kinematic targets.
    this.physicsWorld.applyFloatingOriginOffset(offset, this.sceneManager.rigidBodyList);

    // 3. Every RigidBodyComponent (interpolation buffers + root-level mesh).
    for (const rb of this.sceneManager.rigidBodyList) rb.shiftOrigin(offset);

    // 4. Camera.
    this.camera.position.sub(offset);

    // 5. In-progress gizmo drag rides the shift.
    if (this.gizmo.dragging) this.gizmo.applyOriginShift(offset);

    // 6. Record it.
    this.worldOrigin.accumulate(offset);
  }

  get stats(): { loaded: number; loading: number; failed: number } {
    return { loaded: this.loaded.size, loading: this.loading.size, failed: this.failed.size };
  }

  static gridOriginOf(id: ChunkId): THREE.Vector3 {
    const { cx, cz } = parseChunkId(id);
    return new THREE.Vector3(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  }
}
