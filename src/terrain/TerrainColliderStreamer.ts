import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import type { Heightmap } from './Heightmap';
import { chooseChunkCells } from './chunkGeometry';
import type { ChunkGridConfig } from './TerrainChunkGrid';
import type RAPIER from '@dimforge/rapier3d-compat';

/**
 * TerrainColliderStreamer — per-chunk heightfield physics for open-world terrain.
 * Replaces the single giant heightfield collider (Phase 1) with a grid of chunk-sized
 * heightfields. Each chunk's collider is a separate RAPIER collider attached to a
 * dedicated static body offset to the chunk's center. This allows:
 * - frustum + distance streaming (only chunks near camera have colliders)
 * - bounded rebuild cost (one chunk rebuild per edit, not whole terrain)
 * - future paging of heightmap data (evict height samples for distant chunks)
 *
 * When `enabled=false` (default, for backward compat & tests), falls back to single-col
 * mode via TerrainField.rebuildCollider(). Enable via `terrain.colliderMode = 'chunked'`.
 */
export interface ColliderStreamerConfig {
  /** Max cells per chunk edge, power-of-two divisor of hm.cells. Default 64. */
  maxChunkCells?: number;
  /** World-space distance bands for collider LOD streaming. Default [300, 800]. */
  streamingDistances?: [number, number];
  /** Disable after this many frames without camera movement. */
  enabled?: boolean;
}

interface ChunkCollider {
  ci: number; cj: number;
  body: RAPIER.RigidBody | null;
  collider: RAPIER.Collider | null;
  dirty: boolean;
  loaded: boolean;
}

export class TerrainColliderStreamer {
  readonly chunkCells: number;
  readonly chunksPerSide: number;
  private readonly chunks: ChunkCollider[] = [];
  private enabled = false;
  private streamingDistances: [number, number];
  private readonly _camWorld = new THREE.Vector3();
  private readonly _chunkCenter = new THREE.Vector3();
  private readonly _engineCenter = new THREE.Vector3();
  private readonly _worldQuat = new THREE.Quaternion();
  private readonly _worldScale = new THREE.Vector3();

  constructor(
    private readonly physicsWorld: PhysicsWorld,
    private readonly terrainBody: RigidBodyComponent,
    private readonly hm: Heightmap,
    cfg: ColliderStreamerConfig = {},
  ) {
    this.chunkCells = chooseChunkCells(hm.cells, cfg.maxChunkCells ?? 64);
    this.chunksPerSide = hm.cells / this.chunkCells;
    this.streamingDistances = cfg.streamingDistances ?? [300, 800];
    this.enabled = cfg.enabled ?? false;
    for (let cj = 0; cj < this.chunksPerSide; cj++) {
      for (let ci = 0; ci < this.chunksPerSide; ci++) {
        this.chunks.push({ ci, cj, body: null, collider: null, dirty: true, loaded: false });
      }
    }
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.unloadAll();
    else this.markAllDirty();
  }

  get isEnabled(): boolean { return this.enabled; }

  markAllDirty(): void { for (const c of this.chunks) c.dirty = true; }

  markDirtyRect(r: { i0: number; i1: number; j0: number; j1: number }): void {
    const cc = this.chunkCells, last = this.chunksPerSide - 1;
    const ci0 = Math.max(0, Math.floor(Math.max(0, r.i0 - 1) / cc));
    const ci1 = Math.min(last, Math.floor(Math.min(this.hm.cells, r.i1 + 1) / cc));
    const cj0 = Math.max(0, Math.floor(Math.max(0, r.j0 - 1) / cc));
    const cj1 = Math.min(last, Math.floor(Math.min(this.hm.cells, r.j1 + 1) / cc));
    for (const ch of this.chunks) if (ch.ci >= ci0 && ch.ci <= ci1 && ch.cj >= cj0 && ch.cj <= cj1) ch.dirty = true;
  }

  /** Update streaming based on camera world position. Call from TerrainSystem.update(). */
  update(cameraWorldPos: THREE.Vector3, _worldOriginOffset: THREE.Vector3): void {
    if (!this.enabled) return;
    this._camWorld.copy(cameraWorldPos);
    // For MVP, keep all chunks loaded; distance culling is future (needs nav foliage integration)
    // The dirty flag drives incremental rebuilds (one chunk per frame budget in real impl).
    // Here we rebuild up to 2 dirty chunks per frame to demonstrate bounded cost.
    let rebuilt = 0;
    for (const ch of this.chunks) {
      if (!ch.dirty) continue;
      if (rebuilt >= 2) break;
      this.rebuildChunk(ch);
      rebuilt++;
    }
  }

  private rebuildChunk(ch: ChunkCollider): void {
    try {
      // Slice heights for this chunk (res = chunkCells+1 in each axis, overlapping edges)
      const res = this.chunkCells + 1;
      const slice = new Float32Array(res * res);
      const hmRes = this.hm.res;
      const baseI = ch.ci * this.chunkCells;
      const baseJ = ch.cj * this.chunkCells;
      for (let j = 0; j < res; j++) {
        for (let i = 0; i < res; i++) {
          const srcIdx = (baseJ + j) * hmRes + (baseI + i);
          slice[j * res + i] = this.hm.heights[srcIdx] ?? 0;
        }
      }
      // Column-major for Rapier
      const rapierHeights = new Float32Array(res * res);
      for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) rapierHeights[i * res + j] = slice[j * res + i];

      // Compute chunk center in local space (terrain mesh local = heightmap local)
      const half = this.hm.half, step = this.hm.step;
      const x0 = baseI * step - half, x1 = (baseI + this.chunkCells) * step - half;
      const z0 = baseJ * step - half, z1 = (baseJ + this.chunkCells) * step - half;
      const cx = (x0 + x1) * 0.5, cz = (z0 + z1) * 0.5;
      this._chunkCenter.set(cx, 0, cz);
      // Rapier lives in ENGINE space. Transform the local chunk center through the
      // terrain root; never add the accumulated world-origin offset here.
      this.terrainBody.mesh.updateMatrixWorld(true);
      this._engineCenter.copy(this._chunkCenter).applyMatrix4(this.terrainBody.mesh.matrixWorld);
      this.terrainBody.mesh.getWorldQuaternion(this._worldQuat);
      this.terrainBody.mesh.getWorldScale(this._worldScale);

      // Tear down old collider/body
      if (ch.collider) { try { this.physicsWorld.removeCollider(ch.collider); } catch {} ch.collider = null; }
      if (ch.body) { try { this.physicsWorld.removeBody(ch.body); } catch {} ch.body = null; }

      const R = this.physicsWorld.RAPIER;
      const desc = R.RigidBodyDesc.fixed()
        .setTranslation(this._engineCenter.x, this._engineCenter.y, this._engineCenter.z)
        .setRotation(this._worldQuat);
      const body = this.physicsWorld.createRigidBody(desc);
      const scale = new THREE.Vector3(
        (this.hm.size / this.chunksPerSide) * Math.abs(this._worldScale.x),
        Math.abs(this._worldScale.y),
        (this.hm.size / this.chunksPerSide) * Math.abs(this._worldScale.z),
      );
      // Heightfield collider expects nrows/ncols = cells (=chunkCells)
      const collider = this.physicsWorld.createHeightfieldCollider(body, this.chunkCells, this.chunkCells, rapierHeights, scale);
      ch.body = body; ch.collider = collider; ch.dirty = false; ch.loaded = true;
    } catch (e) {
      console.warn(`[TerrainColliderStreamer] rebuild ${ch.ci},${ch.cj} failed:`, e);
      ch.dirty = false;
    }
  }

  private unloadAll(): void {
    for (const ch of this.chunks) {
      if (ch.collider) { try { this.physicsWorld.removeCollider(ch.collider); } catch {} ch.collider = null; }
      if (ch.body) { try { this.physicsWorld.removeBody(ch.body); } catch {} ch.body = null; }
      ch.loaded = false;
    }
  }

  /** Introspection for HELM / perf HUD. */
  info(): { enabled: boolean; chunkCells: number; chunksPerSide: number; loaded: number; dirty: number } {
    let loaded = 0, dirty = 0;
    for (const c of this.chunks) { if (c.loaded) loaded++; if (c.dirty) dirty++; }
    return { enabled: this.enabled, chunkCells: this.chunkCells, chunksPerSide: this.chunksPerSide, loaded, dirty };
  }

  dispose(): void { this.unloadAll(); this.chunks.length = 0; }
}
