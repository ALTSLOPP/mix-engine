/**
 * AssetCooker — Asset validation, dependency verification, and compilation cooker.
 */

import { AssetDatabase, type AssetEntry } from './AssetDatabase';

export interface CookedAssetItem {
  guid: string;
  path: string;
  type: string;
  hash: string;
  dependencies: string[];
  sizeBytes: number;
  /** True only when hash and size were computed from the source bytes this run. */
  verified: boolean;
}

export interface CookedManifest {
  manifestVersion: number;
  compiledAt: number;
  totalAssets: number;
  totalSizeBytes: number;
  assets: CookedAssetItem[];
  verified: boolean;
}

export interface CookResult {
  ok: boolean;
  manifest?: CookedManifest;
  errors: string[];
  warnings: string[];
}

export class AssetCooker {
  /**
   * Validates and compiles the entire asset database into a verified deployment manifest.
   */
  static cook(db: AssetDatabase, options: {
    readAsset?: (projectPath: string) => Uint8Array | ArrayBuffer | undefined;
    requireContent?: boolean;
  } = {}): CookResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const cookedItems: CookedAssetItem[] = [];

    // Step 1: Detect circular dependency cycles
    const cycles = db.detectCycles();
    if (cycles.length > 0) {
      for (const c of cycles) {
        errors.push(`Circular dependency cycle detected: ${c.join(' -> ')}`);
      }
    }

    // Step 2: Validate all assets and check missing dependencies
    let totalSizeBytes = 0;
    const all = db.allAssets();

    const computeMetadataHash = (entry: AssetEntry): string => {
      if (entry.meta.hash) return entry.meta.hash;
      const seed = `${entry.guid}:${entry.path}:${entry.meta.type}:${(entry.meta.dependencies || []).join(',')}:${JSON.stringify(entry.meta.importerSettings || {})}`;
      let h1 = 0x811c9dc5;
      let h2 = 0xcbf29ce4;
      for (let i = 0; i < seed.length; i++) {
        const c = seed.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193);
        h2 = Math.imul(h2 ^ (c * 31), 0x5bd1e995);
      }
      return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
    };

    const hashBytes = (bytes: Uint8Array): string => {
      let h1 = 0x811c9dc5;
      let h2 = 0xcbf29ce4;
      for (const byte of bytes) {
        h1 = Math.imul(h1 ^ byte, 0x01000193);
        h2 = Math.imul(h2 ^ (byte * 31), 0x5bd1e995);
      }
      return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
    };

    const computeAssetSize = (entry: AssetEntry): number => {
      if (typeof entry.meta.fileSize === 'number' && entry.meta.fileSize > 0) {
        return entry.meta.fileSize;
      }
      const baseSizes: Record<string, number> = {
        mesh: 65536,
        texture: 131072,
        audio: 262144,
        animation: 32768,
        material: 2048,
        prefab: 4096,
        scene: 8192,
        data: 1024,
      };
      return baseSizes[entry.meta.type] ?? 1024;
    };

    for (const entry of all) {
      const deps = entry.meta.dependencies ?? [];
      for (const depGuid of deps) {
        const depEntry = db.getAssetByGuid(depGuid);
        if (!depEntry) {
          errors.push(`Asset '${entry.path}' (${entry.guid}) references missing dependency GUID '${depGuid}'.`);
        }
      }

      const loaded = options.readAsset?.(entry.path);
      const bytes = loaded instanceof ArrayBuffer
        ? new Uint8Array(loaded)
        : loaded instanceof Uint8Array ? loaded : undefined;
      const verified = !!bytes;
      if (!verified) {
        const message = `Asset '${entry.path}' was not read; manifest hash is metadata-only and is not deployment-verifiable.`;
        if (options.requireContent) errors.push(message);
        else warnings.push(message);
      }
      const sizeBytes = bytes?.byteLength ?? computeAssetSize(entry);
      const hash = bytes ? hashBytes(bytes) : computeMetadataHash(entry);

      const item: CookedAssetItem = {
        guid: entry.guid,
        path: entry.path,
        type: entry.meta.type,
        hash,
        dependencies: deps,
        sizeBytes,
        verified,
      };

      totalSizeBytes += item.sizeBytes;
      cookedItems.push(item);
    }

    const ok = errors.length === 0;
    const manifest: CookedManifest | undefined = ok
      ? {
          manifestVersion: 1,
          compiledAt: Date.now(),
          totalAssets: cookedItems.length,
          totalSizeBytes,
          assets: cookedItems,
          verified: cookedItems.every((item) => item.verified),
        }
      : undefined;

    return {
      ok,
      manifest,
      errors,
      warnings,
    };
  }
}
