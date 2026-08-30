import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import type { WorldOrigin } from './WorldOrigin';
import { ChunkDeltaRegistry } from './ChunkDeltaRegistry';
import type { ChunkId } from './chunkMath';

/**
 * ChunkDeltaBinder.ts — the wiring that makes {@link ChunkDeltaRegistry} do something.
 *
 * The registry on its own is a passive store: nothing ever recorded into it and nothing
 * ever replayed out of it, so Phase 6.1 ("player modifications survive a chunk round
 * trip") was inert. This binder closes the loop:
 *
 *   • entity destroyed while its chunk is loaded  → recorded as a destruction delta
 *   • chunk about to unload                       → moved entities' transforms captured
 *   • chunk finished loading                      → destructions + transforms replayed
 *
 * Destroys that happen *because* a chunk is unloading must NOT be recorded — otherwise
 * the first unload would permanently delete the whole chunk. `beginUnload/endUnload`
 * brackets that window — and because `destroyChunkEntities` only *queues* destroys,
 * that window must stay open until the deferred flush has actually run (the Engine
 * closes it right after `flushDeferredOperations`).
 *
 * Transforms are stored in WORLD space (via WorldOrigin), never engine space, so a
 * floating-origin shift between capture and replay cannot corrupt them.
 */
export class ChunkDeltaBinder {
  readonly registry: ChunkDeltaRegistry;

  /** Chunks whose teardown cascade has been queued but not yet flushed. Destroys for
   *  these are streaming, not player action, so they must not be recorded. */
  private readonly unloadingChunks = new Set<ChunkId>();
  private readonly unsubscribe: () => void;
  /** World-space spawn pose per streamed entity, used to detect "actually moved". */
  private readonly spawnPose = new Map<EntityId, { pos: THREE.Vector3; quat: THREE.Quaternion }>();

  private readonly _pos = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();

  /** Squared metres an entity must move from its authored pose before it is worth persisting. */
  static readonly MOVE_EPSILON_SQ = 1e-4;

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly worldOrigin: WorldOrigin,
    registry: ChunkDeltaRegistry = new ChunkDeltaRegistry(),
  ) {
    this.registry = registry;
    const handler = (payload: unknown): void => {
      const id = (payload as { entityId?: EntityId } | undefined)?.entityId;
      if (typeof id === 'number') this.onEntityDestroyed(id);
    };
    this.sceneManager.events.on('entity_destroyed', handler);
    this.unsubscribe = () => this.sceneManager.events.off('entity_destroyed', handler);
  }

  // --- Streaming hooks ------------------------------------------------------

  /**
   * Called right after a chunk's entities have been instantiated. Replays every
   * persisted delta for that chunk onto the freshly-spawned entities and re-baselines
   * the "did it move" comparison.
   *
   * @returns the number of entities the replay touched.
   */
  onChunkLoaded(chunkId: ChunkId): number {
    let applied = 0;
    for (const entityId of this.sceneManager.entitiesInChunk(chunkId)) {
      const key = this.sceneManager.chunkEntityKey(entityId);
      if (key === null) continue;

      // Baseline BEFORE applying, so a replayed transform is not itself mistaken for
      // a fresh player move on the next capture (it is already in the registry).
      this.captureSpawnPose(entityId);

      if (this.registry.isDestroyed(chunkId, key)) {
        this.sceneManager.requestDestroy(entityId);
        this.spawnPose.delete(entityId);
        applied++;
        continue;
      }

      const delta = this.registry.getDeltas(chunkId)?.transforms[key];
      if (!delta) continue;

      const rb = this.sceneManager.getComponent<RigidBodyComponent>(entityId, 'rigidBody');
      if (!rb) continue;
      // Deltas are world-space; teleport() takes engine space.
      this._pos.set(delta.position[0], delta.position[1], delta.position[2]);
      this.worldOrigin.toEngineSpaceInto(this._pos, this._pos);
      this._quat.set(delta.rotation[0], delta.rotation[1], delta.rotation[2], delta.rotation[3]);
      rb.teleport(this._pos, this._quat);
      applied++;
    }
    return applied;
  }

  /**
   * Called immediately BEFORE a chunk's entities are destroyed for streaming. Snapshots
   * the world transform of anything that has drifted from its authored pose, then opens
   * the suppression window so the cascade of destroys that follows is not recorded as
   * player destruction.
   *
   * @returns the number of transforms persisted.
   */
  beginUnload(chunkId: ChunkId): number {
    let captured = 0;
    for (const entityId of this.sceneManager.entitiesInChunk(chunkId)) {
      const key = this.sceneManager.chunkEntityKey(entityId);
      if (key === null) continue;
      const rb = this.sceneManager.getComponent<RigidBodyComponent>(entityId, 'rigidBody');
      if (!rb) continue;

      this.worldOrigin.toWorldSpaceInto(this._pos, rb.mesh.position);
      this._quat.copy(rb.mesh.quaternion);

      const baseline = this.spawnPose.get(entityId);
      if (baseline && this._pos.distanceToSquared(baseline.pos) < ChunkDeltaBinder.MOVE_EPSILON_SQ
        && Math.abs(this._quat.dot(baseline.quat)) > 0.9999) {
        continue; // still where the author put it — nothing to persist
      }

      this.registry.recordTransform(chunkId, key, this._pos, this._quat);
      captured++;
    }
    this.unloadingChunks.add(chunkId);
    return captured;
  }

  /**
   * Closes every suppression window opened by {@link beginUnload}. Must run AFTER
   * `SceneManager.flushDeferredOperations()` — destroyChunkEntities only queues
   * destroys, so entity_destroyed fires at the flush point, not at the call site.
   */
  endUnload(): void {
    this.unloadingChunks.clear();
  }

  /** True while a streaming teardown for this chunk is queued or in flight. */
  isUnloading(chunkId: ChunkId): boolean {
    return this.unloadingChunks.has(chunkId);
  }

  // --- Gameplay-facing ------------------------------------------------------

  /** Persist arbitrary gameplay state against a chunk (chest opened, lever pulled). */
  setState(chunkId: ChunkId, key: string, value: unknown): void {
    this.registry.setCustomState(chunkId, key, value);
  }

  getState<T = unknown>(chunkId: ChunkId, key: string): T | undefined {
    return this.registry.getCustomState<T>(chunkId, key);
  }

  /** Everything the registry holds, for the save system. */
  serialize(): string {
    return this.registry.serialize();
  }

  deserialize(json: string): void {
    this.registry.deserialize(json);
  }

  clear(): void {
    this.registry.clear();
    this.spawnPose.clear();
  }

  dispose(): void {
    this.unsubscribe();
    this.spawnPose.clear();
  }

  // --- Internals ------------------------------------------------------------

  private captureSpawnPose(entityId: EntityId): void {
    const rb = this.sceneManager.getComponent<RigidBodyComponent>(entityId, 'rigidBody');
    if (!rb) return;
    const pos = new THREE.Vector3();
    this.worldOrigin.toWorldSpaceInto(pos, rb.mesh.position);
    this.spawnPose.set(entityId, { pos, quat: rb.mesh.quaternion.clone() });
  }

  private onEntityDestroyed(entityId: EntityId): void {
    const chunkId = this.sceneManager.chunkOf(entityId);
    const key = this.sceneManager.chunkEntityKey(entityId);
    this.spawnPose.delete(entityId);
    if (chunkId === undefined || key === null) return;
    // Streaming teardown, not the player blowing up a barrel.
    if (this.unloadingChunks.has(chunkId)) return;
    this.registry.markDestroyed(chunkId, key);
  }
}
