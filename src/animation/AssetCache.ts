import * as THREE from 'three';
import { clone as cloneWithSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

interface CacheEntry {
  canonical: THREE.Group;
  refCount: number;
  /** Pinned canonicals stay resident even when refCount hits 0 (preloaded essentials). */
  pinned: boolean;
}

/**
 * AssetCache.ts — Reference-Counted GPU Resource Owner.
 *
 * Holds the canonical loaded GLB per assetId. `checkout` returns a clone — `Group.clone`
 * shares geometry/material/textures BY REFERENCE, so 100 identical NPCs cost one set of
 * GPU resources. `release` decrements; shared resources are disposed only when the last
 * user releases (refCount → 0) or on explicit evict. scene.environment is never touched.
 */
export class AssetCache {
  private readonly entries = new Map<string, CacheEntry>();

  /** Install (or replace) the canonical GLB for an id — called by the loader. */
  setCanonical(assetId: string, group: THREE.Group): void {
    const existing = this.entries.get(assetId);
    if (existing) {
      // Replacing a canonical without disposing the old one leaks its GPU resources
      // (geometries/materials/textures) on hot-reload / re-import. If live clones still
      // reference the old canonical (refCount > 0) we can't safely dispose (they share
      // geometry/material by reference) — warn and leave it to the caller to evict.
      if (existing.refCount === 0) {
        this.disposeEntry(assetId, existing);
        this.entries.set(assetId, { canonical: group, refCount: 0, pinned: existing.pinned });
      } else {
        console.warn(`[AssetCache] setCanonical('${assetId}'): ${existing.refCount} live clone(s) still reference the old canonical — old resources retained to avoid breaking clones. Evict after they release.`);
        existing.canonical = group;
      }
    } else {
      this.entries.set(assetId, { canonical: group, refCount: 0, pinned: false });
    }
  }

  /**
   * Pin a canonical so it survives refCount→0. Preloaded essentials (characters, the
   * animation bank) must stay resident: a preloaded asset starts at refCount 0, so the
   * first spawn→despawn would otherwise dispose AND delete it, and the next spawn throws
   * 'not loaded'. That was why the Ayo preview character vanished after a respawn.
   */
  pin(assetId: string): void {
    const entry = this.entries.get(assetId);
    if (entry) entry.pinned = true;
  }

  has(assetId: string): boolean {
    return this.entries.has(assetId);
  }

  get size(): number {
    return this.entries.size;
  }

  /** ++refcount, return a resource-sharing clone tagged by the caller as {source:'asset'}. */
  checkout(assetId: string, targetProfile?: string, resolver?: import('../assets/derived/RuntimeVariantResolver').RuntimeVariantResolver): THREE.Group {
    const entry = this.entries.get(assetId);
    if (!entry) throw new Error(`AssetCache.checkout: '${assetId}' not loaded`);
    entry.refCount += 1;
    let canonical = entry.canonical;
    if (targetProfile && resolver) {
      const resolved = resolver.resolve({
        assetId,
        sourceData: entry.canonical,
        sourceHash: assetId,
        targetProfile,
      });
      canonical = resolved.data;
    }
    return cloneWithSkeleton(canonical) as THREE.Group;
  }

  getAnimations(assetId: string): THREE.AnimationClip[] {
    const entry = this.entries.get(assetId);
    if (!entry) return [];
    return (entry.canonical as any).animations || [];
  }

  /** --refcount; dispose shared GPU resources only when the count reaches zero. */
  release(assetId: string): void {
    const entry = this.entries.get(assetId);
    if (!entry) return;
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0 && !entry.pinned) this.disposeEntry(assetId, entry);
  }

  /** Force-dispose regardless of refcount (e.g. memory pressure). */
  evict(assetId: string): void {
    const entry = this.entries.get(assetId);
    if (entry) this.disposeEntry(assetId, entry);
  }

  private disposeEntry(assetId: string, entry: CacheEntry): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    entry.canonical.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        materials.add(mat);
        for (const v of Object.values(mat)) {
          if (v && (v as THREE.Texture).isTexture) textures.add(v as THREE.Texture);
        }
      }
    });

    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    for (const m of materials) m.dispose();

    this.entries.delete(assetId);
  }

  disposeAll(): void {
    for (const [id, entry] of this.entries) this.disposeEntry(id, entry);
    this.entries.clear();
  }
}
