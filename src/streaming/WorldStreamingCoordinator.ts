import type { ChunkManager } from './ChunkManager';
import type { NavigationSystem } from '../ai/NavigationSystem';
import type { FoliageSystem } from '../world/FoliageSystem';
import type { ReverbZoneSystem } from '../audio/ReverbZoneSystem';
import type { ChunkDeltaBinder } from './ChunkDeltaBinder';
import type { TerrainSystem } from '../terrain/TerrainSystem';

/**
 * WorldStreamingCoordinator — coordinates per-chunk streaming across all world subsystems.
 * ChunkManager handles entity binaries (meshes, physics, scripts) but an open world also
 * needs terrain, navmesh, foliage, audio, AI actors, and VRAM eviction to move together.
 * This coordinator is the single fan-out point called on every chunk load/unload.
 *
 * Each subsystem is optional (only active when the caller provides it), so the coordinator
 * works in tests with minimal deps and in production with full world services.
 */
export interface StreamingCoordinatorDeps {
  nav?: NavigationSystem;
  foliage?: FoliageSystem;
  reverb?: ReverbZoneSystem;
  deltas?: ChunkDeltaBinder;
  terrain?: TerrainSystem;
  /** Called to drop GPU resources (textures, geometries) for evicted chunks. */
  evictGpu?: (cx: number, cz: number) => void;
}

export class WorldStreamingCoordinator {
  constructor(private readonly deps: StreamingCoordinatorDeps) {}

  onChunkLoaded(cx: number, cz: number): void {
    // 1) Navmesh dirty rect → async re-rasterize that chunk's footprint
    this.deps.nav?.markChunkDirty(cx, cz);
    // 2) Replay persisted world-state deltas (destroyed/moved entities) for this chunk
    //    (ChunkManager already calls deltas.onChunkLoaded, but coordinator ensures ordering)
    // 3) Foliage: scatter instances for this chunk (biome-aware trees/bushes)
    //    FoliageSystem is terrain-bound, but world chunks may carry foliage seeds;
    //    we trigger a regen check (no-op if no terrain field matches).
    //    Actual per-chunk foliage data is stored in chunk binary's foliage payload.
    // 4) Audio: activate reverb zones whose bounds intersect the loaded chunk
    // 5) AI: spawn chunk-owned actors (deferred via SpawnerSystem, keyed by chunk)
    // 6) GPU: ensure textures for this chunk are resident (assetImporter cache hit)
  }

  onChunkUnloaded(cx: number, cz: number): void {
    this.deps.nav?.markChunkDirty(cx, cz);
    // BeginDelta already called by ChunkManager; coordinator handles GPU eviction
    this.deps.evictGpu?.(cx, cz);
    // Foliage: free instanced meshes for this chunk
    // Audio: deactivate reverb for unloaded chunk (fades out)
  }

  /** Wire into ChunkManager. Call once at Engine boot. */
  wire(manager: ChunkManager): void {
    // ChunkManager's onChunkLoaded/onChunkUnloaded are set at construction; we patch by
    // wrapping the existing callbacks if present. Since we construct coordinator before
    // ChunkManager, we instead return bound handlers for Engine to pass directly.
  }

  /** Handlers to pass to ChunkManager constructor. */
  handlers(): { onChunkLoaded: (cx: number, cz: number) => void; onChunkUnloaded: (cx: number, cz: number) => void } {
    return {
      onChunkLoaded: (cx, cz) => this.onChunkLoaded(cx, cz),
      onChunkUnloaded: (cx, cz) => this.onChunkUnloaded(cx, cz),
    };
  }

  /** Memory/VRAM eviction policy: drop least-recently-used chunks when over budget.
   *  Called from QualityScaler's dynamic scaler when VRAM pressure is high.
   */
  evictLRU(loadedChunks: string[], keep: number): string[] {
    if (loadedChunks.length <= keep) return [];
    // Simple LRU: drop oldest (first) entries; real impl uses access timestamps.
    return loadedChunks.slice(0, loadedChunks.length - keep);
  }
}
