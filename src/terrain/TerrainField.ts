import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Heightmap, type DirtyRect } from './Heightmap';
import { SplatMap } from './SplatMap';
import { TerrainChunkGrid, type ChunkGridConfig } from './TerrainChunkGrid';
import { TerrainColliderStreamer, type ColliderStreamerConfig } from './TerrainColliderStreamer';

/** Build a single full-resolution grid mesh from a heightmap. Superseded for rendering by the
 *  chunked-LOD path (TerrainChunkGrid), but kept as a reference/utility (and used in tests). */
export function buildGeometry(hm: Heightmap): THREE.BufferGeometry {
  const { res, cells, step, half, heights } = hm;
  const positions = new Float32Array(res * res * 3);
  const uvs = new Float32Array(res * res * 2);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const k = j * res + i;
      positions[k*3+0] = i * step - half;
      positions[k*3+1] = heights[k];
      positions[k*3+2] = j * step - half;
      uvs[k*2+0] = i / cells;
      uvs[k*2+1] = j / cells;
    }
  }
  const indices = new Uint32Array(cells * cells * 6);
  let t = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j*res + i, b = j*res + i + 1, c = (j+1)*res + i, d = (j+1)*res + i + 1;
      indices[t++] = a; indices[t++] = c; indices[t++] = b;   // CCW → +Y up
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Pack our ROW-MAJOR heightmap (`heights[j*res+i]`, `i`→local +x, `j`→local +z) into the
 * COLUMN-MAJOR matrix Rapier's heightfield expects. The matrix is res×res (= (cells+1)²);
 * parry3d maps matrix column→x and row→z, stored column-major (`index = col*res + row`).
 * Column c = our i (x), row r = our j (z), so `dst[i*res + j] = src[j*res + i]` — a transpose.
 * Orientation is validated empirically in test/terrainCollider.test.ts (raycast vs sampleLocal).
 */
export function packRapierHeights(res: number, src: Float32Array, out?: Float32Array): Float32Array {
  const dst = out && out.length === res * res ? out : new Float32Array(res * res);
  for (let j = 0; j < res; j++)
    for (let i = 0; i < res; i++)
      dst[i * res + j] = src[j * res + i];
  return dst;
}

/**
 * Owns one terrain: the Heightmap (source of truth), the chunked-LOD RENDER layer
 * (TerrainChunkGrid, parented under `rb.mesh` which is a Group at the terrain origin), and the
 * single Rapier HEIGHTFIELD collider (Phase 1: debounced, atomic-swap rebuild — no fall-through).
 */
export class TerrainField {
  /** Seconds of edit-quiet before the (debounced, background) collider rebuild fires. */
  private static readonly REBUILD_DEBOUNCE = 0.12;

  private _colliderDirty = false;
  private _disposed = false;
  private _quietTime = 0;
  private _rapierHeights?: Float32Array;
  private readonly _scale = new THREE.Vector3();
  readonly chunkGrid: TerrainChunkGrid;
  readonly colliderStreamer: TerrainColliderStreamer;

  constructor(
    private readonly physicsWorld: PhysicsWorld,
    readonly rb: RigidBodyComponent,
    readonly hm: Heightmap,
    readonly splatMap: SplatMap,
    readonly material: THREE.Material,
    private collider: RAPIER.Collider | null,
    chunkConfig?: ChunkGridConfig,
    colliderStreamerConfig?: ColliderStreamerConfig,
  ) {
    this.chunkGrid = new TerrainChunkGrid(hm, rb.mesh, material, chunkConfig);
    this.colliderStreamer = new TerrainColliderStreamer(physicsWorld, rb, hm, colliderStreamerConfig);
  }

  get mesh(): THREE.Object3D { return this.rb.mesh; }

  /**
   * A heightmap edit changed vertex-rect `r`. Mark the overlapping chunk meshes for rebuild; they
   * regenerate (positions + full-res normals, from the heightmap) on the next chunkGrid.update —
   * which TerrainSystem runs the SAME frame, right after the brush tick, so sculpting stays live.
   * When chunked colliders are enabled, also marks the affected chunk colliders dirty.
   */
  applyRect(r: DirtyRect): void {
    this.chunkGrid.markDirtyRect(r);
    if (this.colliderStreamer.isEnabled) this.colliderStreamer.markDirtyRect(r);
  }

  /** Per-frame LOD selection + dirty-chunk geometry rebuild. Driven by TerrainSystem.update. */
  updateLOD(camera: THREE.Camera): void {
    this.chunkGrid.update(camera);
  }

  updateColliderStreaming(cameraWorldPos: THREE.Vector3, worldOriginOffset: THREE.Vector3): void {
    this.colliderStreamer.update(cameraWorldPos, worldOriginOffset);
  }

  enableChunkedColliders(on: boolean): void {
    if (on && this.collider) {
      // Transition single → chunked: remove single collider before streaming takes over
      try { this.physicsWorld.removeCollider(this.collider); } catch {}
      this.collider = null;
      this._colliderDirty = false;
    } else if (!on && !this.collider) {
      // Chunked → single: rebuild single collider immediately
      this.rebuildCollider();
    }
    this.colliderStreamer.setEnabled(on);
  }

  /** Retune LOD distance bands at runtime (terrain_lod AICommand / viewport). */
  setLodDistances(distances: number[]): void {
    this.chunkGrid.setLodDistances(distances);
  }

  /**
   * Rebuild the Rapier collider from the live heightmap as a heightfield.
   * When chunked colliders are enabled, delegates to the streamer (rebuilds per-chunk).
   * ATOMIC SWAP: build the new collider FIRST, then remove the old one, so the body is never
   * collider-less for an instant — the player can't fall through mid-rebuild. Rapier allows
   * multiple colliders per body, so the momentary overlap is harmless.
   * Prefer markColliderDirty() on the hot path; this runs the rebuild synchronously (used at
   * spawn and on scene load).
   */
  rebuildCollider(): void {
    if (this.colliderStreamer.isEnabled) {
      this.colliderStreamer.markAllDirty();
      return;
    }
    const pw = this.physicsWorld;
    const { res, cells, size } = this.hm;
    this._rapierHeights = packRapierHeights(res, this.hm.heights, this._rapierHeights);
    this._scale.set(size, 1, size);
    // nrows/ncols are the number of SEGMENTS (= cells); the heights matrix is (cells+1)² = res².
    const next = pw.createHeightfieldCollider(this.rb.rapierBody, cells, cells, this._rapierHeights, this._scale);
    const old = this.collider;
    this.collider = next;
    if (old) pw.removeCollider(old);
    this._colliderDirty = false;
    this._quietTime = 0;
  }

  /** Flag the collider stale. TerrainSystem rebuilds it in the background once edits go quiet. */
  markColliderDirty(): void {
    this._colliderDirty = true;
    this._quietTime = 0;
  }

  get colliderDirty(): boolean { return this._colliderDirty; }
  get isDisposed(): boolean { return this._disposed; }

  /**
   * Advance the debounce by `dt`; rebuild + return true if it fired this tick (else false).
   * Driven once per frame by TerrainSystem so rapid dabs/erosion ticks coalesce into a single
   * off-critical-path rebuild instead of one synchronous rebuild per stroke-end.
   */
  tickColliderRebuild(dt: number): boolean {
    if (!this._colliderDirty) return false;
    this._quietTime += dt;
    if (this._quietTime < TerrainField.REBUILD_DEBOUNCE) return false;
    this.rebuildCollider();
    return true;
  }

  /** Read-only collider + LOD state, surfaced to AI/HELM agents (introspection is read-only here). */
  colliderInfo() {
    if (this.colliderStreamer.isEnabled) {
      return {
        kind: 'chunked' as const,
        ...this.colliderStreamer.info(),
        lod: this.chunkGrid.info(),
      };
    }
    return {
      kind: 'heightfield' as const,
      dirty: this._colliderDirty,
      res: this.hm.res,
      size: this.hm.size,
      lod: this.chunkGrid.info(),
    };
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.colliderStreamer.dispose();
    this.chunkGrid.dispose();
    if (this.collider) try { this.physicsWorld.removeCollider(this.collider); } catch {}
    this.collider = null;
    this.splatMap.texture.dispose();
    this.material.dispose();
  }
}
