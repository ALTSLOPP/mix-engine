import * as THREE from 'three';
import type { SceneManager } from '../ecs/SceneManager';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';

export interface EntityTransformDelta {
  position: [number, number, number];
  rotation: [number, number, number, number]; // [x, y, z, w]
}

export interface ChunkDelta {
  chunkId: string;
  destroyedEntities: string[];
  transforms: Record<string, EntityTransformDelta>;
  customState: Record<string, unknown>;
}

/**
 * ChunkDeltaRegistry.ts — Tracks open-world chunk entity state changes, destructions, and transforms.
 * Ensures player modifications (broken barrels, harvested trees, moved boulders, looted chests) persist across chunk unload/reload cycles.
 */
export class ChunkDeltaRegistry {
  private readonly chunkDeltas = new Map<string, ChunkDelta>();

  private getOrCreateChunk(chunkId: string): ChunkDelta {
    let delta = this.chunkDeltas.get(chunkId);
    if (!delta) {
      delta = {
        chunkId,
        destroyedEntities: [],
        transforms: {},
        customState: {},
      };
      this.chunkDeltas.set(chunkId, delta);
    }
    return delta;
  }

  /** Record that an entity inside a chunk has been destroyed / collected. */
  markDestroyed(chunkId: string, entityKey: string): void {
    const delta = this.getOrCreateChunk(chunkId);
    if (!delta.destroyedEntities.includes(entityKey)) {
      delta.destroyedEntities.push(entityKey);
    }
  }

  /** Check if an entity in a chunk was previously destroyed. */
  isDestroyed(chunkId: string, entityKey: string): boolean {
    const delta = this.chunkDeltas.get(chunkId);
    return delta ? delta.destroyedEntities.includes(entityKey) : false;
  }

  /** Record moved / repositioned entity transform. */
  recordTransform(
    chunkId: string,
    entityKey: string,
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
  ): void {
    const delta = this.getOrCreateChunk(chunkId);
    delta.transforms[entityKey] = {
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    };
  }

  /** Record custom gameplay state (e.g. chest opened, lever pulled). */
  setCustomState(chunkId: string, key: string, value: unknown): void {
    const delta = this.getOrCreateChunk(chunkId);
    delta.customState[key] = value;
  }

  getCustomState<T = unknown>(chunkId: string, key: string): T | undefined {
    const delta = this.chunkDeltas.get(chunkId);
    return delta ? (delta.customState[key] as T) : undefined;
  }

  /** Retrieve all deltas for a chunk. */
  getDeltas(chunkId: string): ChunkDelta | undefined {
    return this.chunkDeltas.get(chunkId);
  }

  /**
   * Apply persisted deltas to an entity that has just loaded in a streamed chunk.
   */
  applyDeltaToEntity(
    chunkId: string,
    entityKey: string,
    entityId: number,
    sceneManager: SceneManager,
  ): boolean {
    const delta = this.chunkDeltas.get(chunkId);
    if (!delta) return false;

    // 1. If marked destroyed, destroy entity immediately
    if (delta.destroyedEntities.includes(entityKey)) {
      sceneManager.destroyNow(entityId);
      return true;
    }

    // 2. If transform was altered, reposition
    const transformDelta = delta.transforms[entityKey];
    if (transformDelta) {
      const rb = sceneManager.getComponent<RigidBodyComponent>(entityId, 'rigidBody');
      if (rb) {
        const [px, py, pz] = transformDelta.position;
        const [rx, ry, rz, rw] = transformDelta.rotation;
        const pos = new THREE.Vector3(px, py, pz);
        const rot = new THREE.Quaternion(rx, ry, rz, rw);
        rb.teleport(pos, rot);
      }
    }

    return false;
  }

  /** Serialize all chunk deltas for savegame storage. */
  serialize(): string {
    const arr = Array.from(this.chunkDeltas.values());
    return JSON.stringify(arr);
  }

  /** Restore chunk deltas from savegame. */
  deserialize(json: string): void {
    try {
      const arr = JSON.parse(json) as ChunkDelta[];
      this.chunkDeltas.clear();
      for (const d of arr) {
        this.chunkDeltas.set(d.chunkId, d);
      }
    } catch (err) {
      console.warn('[ChunkDeltaRegistry] Failed to deserialize deltas:', err);
    }
  }

  clear(): void {
    this.chunkDeltas.clear();
  }
}
