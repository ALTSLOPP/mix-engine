import * as THREE from 'three';
import type { AssetLoaderQueue } from './AssetLoaderQueue';
import type { AssetCache } from './AssetCache';
import type { SizeClass } from '../assets/ScaleNormalizer';

export type AssetType = 'character' | 'prop' | 'building' | 'vehicle' | 'misc' | 'animation';

export interface AssetEntry {
  id: string;
  /** .glb / .gltf / .fbx supported — glb for meshes, fbx/glb for animation-only packs. */
  path: string;
  type: AssetType;
  tags: string[];
  skeleton?: string;
  /** Source-bone → canonical-bone overrides for retargeting. */
  boneMapping?: Record<string, string>;
  /** Size band for auto-normalisation. Inferred from `type` + `tags` when omitted;
   *  see ScaleNormalizer. Set explicitly when the tags are ambiguous — most usefully
   *  on buildings, where one-storey and high-rise share the same 'building' type. */
  sizeClass?: SizeClass;
  /** Exact governing dimension in metres, overriding the band. The "this size is
   *  final" escape hatch. */
  targetSize?: number;
}

/** Allowed model/animation extensions for the registry. */
const ALLOWED_EXTS = ['.glb', '.gltf', '.fbx'] as const;

function isAllowedPath(path: string): boolean {
  const lower = path.toLowerCase();
  return ALLOWED_EXTS.some(ext => lower.endsWith(ext));
}

/**
 * AssetManifest.ts — GLB/FBX registry.
 * register() allows .glb / .gltf / .fbx (meshes + animation-only imports);
 * load() routes through the AssetLoaderQueue (GLTF vs FBX auto-detect), installs
 * the canonical into the AssetCache, then returns a checked-out (resource-sharing)
 * clone with its own transform.
 */
export class AssetManifest {
  private readonly entries = new Map<string, AssetEntry>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly loaderQueue: AssetLoaderQueue,
    private readonly assetCache: AssetCache,
  ) {}

  register(entry: AssetEntry): void {
    const lower = entry.path.toLowerCase();
    // Blob URLs from runtime animation imports are bare `blob:` URLs — allow them so
    // the IDE can register dynamically-fetched FBX without a filesystem path.
    if (lower.startsWith('blob:')) { this.entries.set(entry.id, entry); return; }
    if (!isAllowedPath(entry.path)) {
      throw new Error(`AssetManifest.register: '${entry.id}' path must be one of ${ALLOWED_EXTS.join('/')} (got '${entry.path}')`);
    }
    this.entries.set(entry.id, entry);
  }

  get(id: string): AssetEntry | undefined {
    return this.entries.get(id);
  }

  findByTag(tag: string): AssetEntry[] {
    const out: AssetEntry[] = [];
    for (const e of this.entries.values()) if (e.tags.includes(tag)) out.push(e);
    return out;
  }

  async preload(ids: string[]): Promise<void> {
    // allSettled (not all): one bad/slow GLB must not reject the whole preload and take
    // down boot. Every asset that loads is pinned so it stays resident for re-spawns.
    const results = await Promise.allSettled(ids.map((id) => this.ensureCanonical(id)));
    results.forEach((r, i) => {
      const id = ids[i];
      if (r.status === 'fulfilled') {
        this.assetCache.pin(id);
      } else {
        console.error(`[AssetManifest] preload failed for '${id}':`, r.reason);
      }
    });
  }

  /** Ensure the canonical GLB is loaded into the cache (idempotent). */
  private async ensureCanonical(id: string): Promise<void> {
    if (this.assetCache.has(id)) return;
    const existing = this.pending.get(id);
    if (existing) return existing;
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`AssetManifest: unknown asset '${id}'`);
    // Multiple viewmodels/pickups may request one asset before its first load finishes.
    // Install it once: replacing the same canonical would dispose shared GPU resources.
    const pending = this.loaderQueue.enqueue(id, entry.path).then(group => {
      this.assetCache.setCanonical(id, group);
    });
    this.pending.set(id, pending);
    try { await pending; } finally { this.pending.delete(id); }
  }

  /** Load (if needed) and return a resource-sharing clone owning its own transform. */
  async load(id: string): Promise<THREE.Group> {
    await this.ensureCanonical(id);
    return this.assetCache.checkout(id);
  }

  toJSON(): AssetEntry[] {
    return [...this.entries.values()];
  }
}
