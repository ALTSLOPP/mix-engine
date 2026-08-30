/**
 * DerivedVariantCache.ts — Deterministic in-memory / persistent cache for derived runtime assets.
 *
 * Cache key depends strictly on:
 * source content hash + importer settings + optimizer version + profile version + target
 */

export interface CachedVariant<T = unknown> {
  key: string;
  sourceHash: string;
  targetProfile: string;
  createdAt: number;
  data: T;
  sizeBytes: number;
}

export interface DerivedVariantCacheOptions {
  maxBytes?: number;
  maxEntries?: number;
  /** Called when dropping a cache reference. Resource owners decide when it is safe to dispose. */
  onEvict?: (variant: Readonly<CachedVariant>) => void;
}

export class DerivedVariantCache {
  private static instance: DerivedVariantCache | null = null;
  private readonly store = new Map<string, CachedVariant<any>>();
  private totalBytes = 0;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly onEvict?: DerivedVariantCacheOptions['onEvict'];

  constructor(opts: DerivedVariantCacheOptions = {}) {
    this.maxBytes = opts.maxBytes ?? 256 * 1024 * 1024;
    this.maxEntries = opts.maxEntries ?? 256;
    if (![this.maxBytes, this.maxEntries].every(n => Number.isFinite(n) && n >= 0 && Number.isInteger(n))) {
      throw new Error('Cache limits must be finite nonnegative integers.');
    }
    this.onEvict = opts.onEvict;
  }

  static get(): DerivedVariantCache {
    if (!this.instance) this.instance = new DerivedVariantCache();
    return this.instance;
  }

  static reset(): void {
    this.instance?.clear();
    this.instance = new DerivedVariantCache();
  }

  /**
   * Deterministic cache key generation.
   */
  static computeKey(params: {
    sourceHash: string;
    targetProfile: string;
    settings?: Record<string, unknown>;
    optimizerVersion?: number;
    profileVersion?: number;
  }): string {
    const optV = params.optimizerVersion ?? 1;
    const profV = params.profileVersion ?? 1;
    const settingsStr = JSON.stringify(this.canonicalSettings(params.settings ?? {}));

    // Hash settings string
    let h = 0x811c9dc5;
    for (let i = 0; i < settingsStr.length; i++) {
      h = Math.imul(h ^ settingsStr.charCodeAt(i), 0x01000193);
    }
    const settingsHash = (h >>> 0).toString(16).padStart(8, '0');

    return `${params.sourceHash}_${settingsHash}_optv${optV}_profv${profV}_${params.targetProfile}`;
  }

  private static canonicalSettings(value: unknown, ancestors = new Set<object>()): unknown {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' ||
          (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Cache settings must be JSON-compatible.');
      return value;
    }
    if (ancestors.has(value)) throw new Error('Cache settings must not be cyclic.');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error('Cache settings must contain only JSON arrays and plain objects.');
    }
    ancestors.add(value);
    const result = Array.isArray(value) ? value.map(item => this.canonicalSettings(item, ancestors))
      : Object.fromEntries(Object.keys(value).sort().map(key => [key, this.canonicalSettings((value as Record<string, unknown>)[key], ancestors)]));
    ancestors.delete(value);
    return result;
  }

  set<T>(key: string, variant: CachedVariant<T>): boolean {
    if (!Number.isFinite(variant.sizeBytes) || variant.sizeBytes < 0) throw new Error('Variant size must be finite and nonnegative.');
    this.delete(key);
    if (variant.sizeBytes > this.maxBytes || this.maxEntries === 0) return false;
    while (this.store.size >= this.maxEntries || this.totalBytes + variant.sizeBytes > this.maxBytes) {
      this.delete(this.store.keys().next().value!);
    }
    this.store.set(key, Object.freeze({ ...variant, key }));
    this.totalBytes += variant.sizeBytes;
    return true;
  }

  get<T>(key: string): CachedVariant<T> | undefined {
    const variant = this.store.get(key);
    if (!variant) return undefined;
    this.store.delete(key);
    this.store.set(key, variant); // Most recently used.
    return { ...variant } as CachedVariant<T>;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): boolean {
    const variant = this.store.get(key);
    if (!variant) return false;
    this.store.delete(key);
    this.totalBytes -= variant.sizeBytes;
    this.onEvict?.(variant);
    return true;
  }

  clear(): void {
    for (const key of [...this.store.keys()]) this.delete(key);
  }

  size(): number {
    return this.store.size;
  }

  listKeys(): string[] {
    return Array.from(this.store.keys());
  }

  getTotalSizeBytes(): number {
    return this.totalBytes;
  }
}
