/**
 * RuntimeVariantResolver.ts — Runtime resolution of assets to optimized derived variants or source fallback.
 */

import { DerivedVariantCache } from './DerivedVariantCache';
import type { PerformanceTargetId } from '../../rendering/profiles/PerformanceTargetRegistry';

export interface ResolveResult<T = unknown> {
  data: T;
  variantKey: string;
  isDerived: boolean;
  sourceFallback: boolean;
}

export class RuntimeVariantResolver {
  private pinnedVariants = new Map<string, string>(); // assetId -> pinned key

  constructor(private readonly cache = DerivedVariantCache.get()) {}

  /**
   * Pin an asset to always use a specific variant or source.
   */
  pinVariant(assetId: string, variantKey: string): void {
    this.pinnedVariants.set(assetId, variantKey);
  }

  unpinVariant(assetId: string): void {
    this.pinnedVariants.delete(assetId);
  }

  /**
   * Resolves an asset for a target profile.
   * If derived variant exists in cache, returns it; otherwise safely falls back to source.
   */
  resolve<T>(params: {
    assetId: string;
    sourceData: T;
    sourceHash: string;
    targetProfile: PerformanceTargetId | string;
    settings?: Record<string, unknown>;
  }): ResolveResult<T> {
    const { assetId, sourceData, sourceHash, targetProfile, settings } = params;

    // Check pinned override
    if (this.pinnedVariants.has(assetId)) {
      const pinKey = this.pinnedVariants.get(assetId)!;
      const cached = this.cache.get<T>(pinKey);
      if (cached) {
        return {
          data: cached.data,
          variantKey: pinKey,
          isDerived: true,
          sourceFallback: false,
        };
      }
    }

    // Unbounded target or missing profile -> always return source
    if (targetProfile === 'unbounded') {
      return {
        data: sourceData,
        variantKey: 'source',
        isDerived: false,
        sourceFallback: false,
      };
    }

    const key = DerivedVariantCache.computeKey({
      sourceHash,
      targetProfile,
      settings,
    });

    const cached = this.cache.get<T>(key);
    if (cached) {
      return {
        data: cached.data,
        variantKey: key,
        isDerived: true,
        sourceFallback: false,
      };
    }

    // Safe fallback to source asset
    return {
      data: sourceData,
      variantKey: 'source',
      isDerived: false,
      sourceFallback: true,
    };
  }
}
