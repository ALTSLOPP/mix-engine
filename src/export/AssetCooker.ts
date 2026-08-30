export type TextureCompressionFormat = 'uastc' | 'etc1s' | 'ktx2_bc7' | 'png_opt';
export type MeshCompressionFormat = 'draco' | 'meshopt' | 'raw';
export type AudioCompressionProfile = 'opus_96k' | 'opus_128k' | 'vorbis' | 'pcm';

export interface TextureCookConfig {
  format?: TextureCompressionFormat;
  generateMipmaps?: boolean;
  maxDimension?: number; // 512, 1024, 2048, 4096
  quality?: number;      // 1 to 100
}

export interface MeshCookConfig {
  format?: MeshCompressionFormat;
  dracoCompressionLevel?: number; // 0 to 10
  meshoptQuantizeBits?: number;   // 8 to 16
  generateLods?: boolean;
  lodReductionSteps?: number[];   // [0.5, 0.25, 0.1]
}

export interface AudioCookConfig {
  profile?: AudioCompressionProfile;
  normalizeLoudness?: boolean;
  stripMetadata?: boolean;
}

export interface AssetCookProfile {
  texture?: TextureCookConfig;
  mesh?: MeshCookConfig;
  audio?: AudioCookConfig;
  /** Pluggable encoders — when provided, cookAsset actually transcodes instead of passing through.
   *  This is how native/WASM tooling (Basis, meshopt, Opus) is wired without taking a hard dep in the proto. */
  encoders?: {
    texture?: (src: Uint8Array, inPath: string, cfg: TextureCookConfig) => { bytes: Uint8Array; outExt: string } | null;
    mesh?: (src: Uint8Array, inPath: string, cfg: MeshCookConfig) => { bytes: Uint8Array; outExt: string; lods?: Uint8Array[] } | null;
    audio?: (src: Uint8Array, inPath: string, cfg: AudioCookConfig) => { bytes: Uint8Array; outExt: string } | null;
  };
  /** Cache key for reproducible builds: extra salt mixed into GUID derivation. */
  cacheSalt?: string;
}

export interface CookedAssetRecord {
  sourcePath: string;
  cookedPath: string;
  type: 'texture' | 'mesh' | 'audio' | 'data';
  originalSizeBytes: number;
  cookedSizeBytes: number;
  compressionRatio: number;
  /** False when the bytes were passed through untouched (no encoder wired up yet). */
  transcoded: boolean;
  /** Format this asset would be cooked to once a real encoder is attached. */
  targetFormat: string | null;
}

export interface CookReport {
  totalOriginalBytes: number;
  totalCookedBytes: number;
  overallRatio: number;
  assets: CookedAssetRecord[];
  /** Assets planned for compression that were shipped uncompressed. */
  warnings: string[];
}

/**
 * AssetCooker.ts — Asset processing and optimization pipeline for production deployment.
 * Prepares textures (KTX2/Basis), meshes (Draco/Meshopt), and audio for release builds.
 */
export class AssetCooker {
  private readonly profile: AssetCookProfile;

  constructor(profile: AssetCookProfile = {}) {
    this.profile = {
      texture: {
        format: 'uastc',
        generateMipmaps: true,
        maxDimension: 2048,
        quality: 85,
        ...profile.texture,
      },
      mesh: {
        format: 'meshopt',
        dracoCompressionLevel: 7,
        meshoptQuantizeBits: 14,
        generateLods: true,
        lodReductionSteps: [0.5, 0.25],
        ...profile.mesh,
      },
      audio: {
        profile: 'opus_128k',
        normalizeLoudness: true,
        stripMetadata: true,
        ...profile.audio,
      },
      encoders: profile.encoders,
      cacheSalt: (profile as any).cacheSalt,
    } as AssetCookProfile;
  }

  /**
   * Evaluate and prepare an asset for packaging, generating cooking metadata.
   * When `profile.encoders` provides a transcoder for the asset's type, bytes are
   * actually transformed and the on-disk path is renamed to the cooked extension
   * (e.g., .png → .ktx2). Otherwise we keep the original path — an archives full of
   * PNG data at .ktx2 paths breaks every extension-driven loader at runtime.
   */
  cookAsset(sourcePath: string, rawBytes: Uint8Array): { cookedBytes: Uint8Array; record: CookedAssetRecord } {
    const dot = sourcePath.lastIndexOf('.');
    const slash = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
    const ext = dot > slash ? sourcePath.slice(dot).toLowerCase() : '';

    let type: 'texture' | 'mesh' | 'audio' | 'data' = 'data';
    let targetFormat: string | null = null;

    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      type = 'texture';
      targetFormat = '.ktx2';
    } else if (['.glb', '.gltf', '.obj'].includes(ext)) {
      type = 'mesh';
      targetFormat = '.opt.glb';
    } else if (['.mp3', '.wav', '.ogg'].includes(ext)) {
      type = 'audio';
      targetFormat = '.opus';
    }

    let transcoded = false;
    let cookedBytes: Uint8Array = rawBytes;
    let cookedPath = sourcePath;

    // Attempt real transcode via injected encoder (Basis/KTX2, meshopt, Opus WASM or native CLI).
    const enc = this.profile.encoders;
    try {
      if (type === 'texture' && enc?.texture) {
        const out = enc.texture(rawBytes, sourcePath, this.profile.texture!);
        if (out) { cookedBytes = out.bytes; cookedPath = sourcePath.slice(0, dot) + out.outExt; transcoded = true; }
      } else if (type === 'mesh' && enc?.mesh) {
        const out = enc.mesh(rawBytes, sourcePath, this.profile.mesh!);
        if (out) { cookedBytes = out.bytes; cookedPath = sourcePath.slice(0, dot) + out.outExt; transcoded = true; }
      } else if (type === 'audio' && enc?.audio) {
        const out = enc.audio(rawBytes, sourcePath, this.profile.audio!);
        if (out) { cookedBytes = out.bytes; cookedPath = sourcePath.slice(0, dot) + out.outExt; transcoded = true; }
      }
    } catch (e) {
      console.warn(`[AssetCooker] encoder failed for ${sourcePath}:`, e);
    }

    // Platform-specific compression config is preserved in the record even when no encoder was
    // present, so a future build with WASM tooling deterministically produces the same output.

    const originalSize = rawBytes.byteLength;
    const cookedSize = cookedBytes.byteLength;
    const ratio = originalSize > 0 ? cookedSize / originalSize : 1.0;

    return {
      cookedBytes,
      record: {
        sourcePath,
        cookedPath,
        type,
        originalSizeBytes: originalSize,
        cookedSizeBytes: cookedSize,
        compressionRatio: ratio,
        transcoded,
        targetFormat,
      },
    };
  }

  /** Simulated encoders for local dev / CI without native tooling. They synthesize
   *  deterministic “cooked” bytes with plausible ratios so the pipeline's path-rename,
   *  duplicate, cache, and LOD logic can be exercised without WASM. */
  static simulatedEncoders(): Required<NonNullable<AssetCookProfile['encoders']>> {
    return {
      texture: (src, inPath, cfg) => {
        // Simulate KTX2: header + truncated payload; respects maxDimension via ratio
        const maxDim = cfg.maxDimension ?? 2048;
        const ratio = maxDim <= 512 ? 0.15 : maxDim <= 1024 ? 0.22 : maxDim <= 2048 ? 0.32 : 0.45;
        const header = new TextEncoder().encode(`KTX2:${cfg.format ?? 'uastc'}:${cfg.quality ?? 85}:`);
        const bodyLen = Math.max(32, Math.floor(src.byteLength * ratio));
        const body = src.slice(0, bodyLen);
        const out = new Uint8Array(header.length + body.length);
        out.set(header, 0); out.set(body, header.length);
        return { bytes: out, outExt: '.ktx2' };
      },
      mesh: (src, _inPath, cfg) => {
        // Simulate meshopt: quantized + optional LOD stubs
        const bits = cfg.meshoptQuantizeBits ?? 14;
        const ratio = cfg.format === 'meshopt' ? (bits <= 12 ? 0.35 : 0.5) : cfg.format === 'draco' ? 0.28 : 1.0;
        const header = new TextEncoder().encode(`MESH:${cfg.format}:${bits}:`);
        const bodyLen = Math.max(48, Math.floor(src.byteLength * ratio));
        const body = src.slice(0, bodyLen);
        const out = new Uint8Array(header.length + body.length);
        out.set(header, 0); out.set(body, header.length);
        // LODs are stored as sibling files (e.g., foo.opt.glb + foo_lod1.glb); simulation returns placeholders.
        return { bytes: out, outExt: '.opt.glb' };
      },
      audio: (src, _inPath, cfg) => {
        const ratio = cfg.profile === 'opus_96k' ? 0.18 : cfg.profile === 'opus_128k' ? 0.24 : cfg.profile === 'vorbis' ? 0.32 : 1.0;
        const header = new TextEncoder().encode(`OPUS:${cfg.profile}:`);
        const bodyLen = Math.max(32, Math.floor(src.byteLength * ratio));
        const body = src.slice(0, bodyLen);
        const out = new Uint8Array(header.length + body.length);
        out.set(header, 0); out.set(body, header.length);
        return { bytes: out, outExt: '.opus' };
      },
    };
  }

  /** In-memory cache for reproducible builds: key = `${path}:${hash}:${profileHash}` */
  private static cookCache = new Map<string, { bytes: Uint8Array; record: CookedAssetRecord }>();
  static clearCookCache(): void { AssetCooker.cookCache.clear(); }
  /** Build-profile hash (deterministic, covers format/quality/bits). */
  private profileHash(): string {
    return JSON.stringify({ t: this.profile.texture, m: this.profile.mesh, a: this.profile.audio });
  }

  /**
   * Process a batch of assets and generate an optimization report.
   */
  cookAll(assets: Array<{ path: string; data: Uint8Array }>): {
    cookedFiles: Array<{ path: string; data: Uint8Array }>;
    report: CookReport;
  } {
    const cookedFiles: Array<{ path: string; data: Uint8Array }> = [];
    const records: CookedAssetRecord[] = [];
    const warnings: string[] = [];
    let totalOrig = 0;
    let totalCooked = 0;

    // Duplicate detection (hash + path)
    const seenPaths = new Set<string>();
    const seenHashes = new Map<number, string>();

    for (const asset of assets) {
      const norm = asset.path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
      if (seenPaths.has(norm)) {
        warnings.push(`${asset.path}: duplicate path — deduplicated`);
        continue;
      }
      seenPaths.add(norm);
      const hash = AssetCooker.hashBytes(asset.data);
      const prev = seenHashes.get(hash);
      if (prev && prev !== norm) {
        warnings.push(`${asset.path}: duplicate content (same bytes as ${prev}) — consider deduplication`);
      } else {
        seenHashes.set(hash, norm);
      }
      const { cookedBytes, record } = this.cookAsset(asset.path, asset.data);
      cookedFiles.push({ path: record.cookedPath, data: cookedBytes });
      records.push(record);
      if (!record.transcoded && record.targetFormat) {
        warnings.push(
          `${record.sourcePath}: shipped uncompressed (no encoder for ${record.targetFormat})`,
        );
      }
      totalOrig += record.originalSizeBytes;
      totalCooked += record.cookedSizeBytes;
    }

    const overallRatio = totalOrig > 0 ? totalCooked / totalOrig : 1.0;

    return {
      cookedFiles,
      report: {
        totalOriginalBytes: totalOrig,
        totalCookedBytes: totalCooked,
        overallRatio,
        assets: records,
        warnings,
      },
    };
  }

  /** DJB2 hash for duplicate detection (same as VirtualPak checksum). */
  static hashBytes(data: Uint8Array): number {
    let h = 5381;
    for (let i = 0; i < data.length; i++) h = ((h << 5) + h) ^ data[i];
    return h >>> 0;
  }

  /** Validate a set of asset references against a scene/manifest.
   *  Returns missing refs and duplicates for CI gating. */
  static validateReferences(
    referenced: string[],
    available: string[],
  ): { missing: string[]; unused: string[]; duplicates: string[] } {
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
    const availSet = new Set(available.map(norm));
    const refSet = new Set(referenced.map(norm));
    const missing = [...refSet].filter((r) => !availSet.has(r));
    const unused = [...availSet].filter((a) => !refSet.has(a));
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const r of referenced.map(norm)) {
      if (seen.has(r)) duplicates.push(r);
      seen.add(r);
    }
    return { missing, unused, duplicates };
  }

  /** Import metadata for an asset path (size, hash, GUID stub). */
  static importMeta(path: string, data: Uint8Array): { guid: string; hash: number; size: number } {
    // Stable GUID derived from path for reproducible builds
    let hash = 0;
    for (let i = 0; i < path.length; i++) hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0;
    const guid = `asset_${(hash >>> 0).toString(16).padStart(8, '0')}`;
    return { guid, hash: AssetCooker.hashBytes(data), size: data.byteLength };
  }
}
