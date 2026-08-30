/**
 * DerivedAssetPipeline.ts — Complete orchestrator for non-destructive asset optimization.
 *
 * Connects Analyze -> Plan -> Optimize -> Persist -> Register -> Load into a coherent workflow.
 */

import * as THREE from 'three';
import { AssetAnalyzer, type AssetAnalysisReport } from './AssetAnalyzer';
import { OptimizationPlanner, type OptimizationPlan, type OptimizationOverrides, type SemanticCategory } from './OptimizationPlanner';
import { TextureOptimizer } from './TextureOptimizer';
import { AnimationOptimizer } from './AnimationOptimizer';
import { DerivedVariantCache } from './DerivedVariantCache';
import { RuntimeVariantResolver } from './RuntimeVariantResolver';
import type { PerformanceTargetId } from '../../rendering/profiles/PerformanceTargetRegistry';

export interface PipelineProcessOptions {
  category?: SemanticCategory;
  importance?: 'hero' | 'standard' | 'crowd' | 'background';
  overrides?: OptimizationOverrides;
  sourceHash?: string;
  settings?: Record<string, unknown>;
}

export interface PipelineProcessResult<T = unknown> {
  ok: boolean;
  assetId: string;
  targetProfile: PerformanceTargetId | string;
  variantKey: string;
  analysis: AssetAnalysisReport;
  plan: OptimizationPlan;
  derivedAsset: T;
  cached: boolean;
  error?: string;
}

export class DerivedAssetPipeline {
  private static instance: DerivedAssetPipeline | null = null;

  static get(): DerivedAssetPipeline {
    if (!this.instance) {
      this.instance = new DerivedAssetPipeline();
    }
    return this.instance;
  }

  static reset(): void {
    DerivedVariantCache.reset();
    this.instance = new DerivedAssetPipeline();
  }

  constructor(
    public readonly cache = DerivedVariantCache.get(),
    public readonly resolver = new RuntimeVariantResolver(cache),
  ) {}

  /**
   * Complete pipeline: Analyze -> Plan -> Optimize -> Cache -> Register
   */
  process<T extends THREE.Object3D | THREE.Texture | THREE.AnimationClip>(
    assetId: string,
    sourceAsset: T,
    targetProfile: PerformanceTargetId | string = 'ps3_plus_500',
    options: PipelineProcessOptions = {},
  ): PipelineProcessResult<T> {
    const category = options.category ?? 'npc';
    const importance = options.importance ?? 'standard';
    const sourceHash = options.sourceHash ?? `hash_${assetId}_${Date.now()}`;

    // 1. Analyze
    const analysis = this.analyze(assetId, sourceAsset);

    // 2. Plan
    const plan = OptimizationPlanner.planMeshOptimization({
      assetId,
      category,
      importance,
      targetProfile,
      meshMetrics: analysis.mesh,
      textureMetrics: analysis.texture,
      animMetrics: analysis.animation,
      overrides: options.overrides,
    });

    // Compute cache key
    const variantKey = DerivedVariantCache.computeKey({
      sourceHash,
      targetProfile,
      settings: options.settings,
    });

    // 3. Optimize based on asset type
    let derivedAsset: T;
    let sizeBytes = 1024;

    try {
      if ((sourceAsset as THREE.Texture).isTexture) {
        const tex = sourceAsset as unknown as THREE.Texture;
        const maxDim = targetProfile === 'ps3_plus_500'
          ? (importance === 'hero' ? 1024 : 512)
          : (importance === 'hero' ? 2048 : 1024);
        const optTex = TextureOptimizer.optimizeTexture(tex, {
          maxDimension: maxDim,
          semanticHint: tex.name || assetId,
        });
        derivedAsset = optTex as unknown as T;
        sizeBytes = (optTex.image?.width ?? 512) * (optTex.image?.height ?? 512) * 4;
      } else if (sourceAsset instanceof THREE.AnimationClip) {
        const clip = sourceAsset as THREE.AnimationClip;
        const optClip = AnimationOptimizer.optimizeClip(clip, {
          quaternionToleranceRad: 0.002,
          pruneConstantTracks: true,
          preserveRootMotion: options.overrides?.preserve_root_motion ?? true,
        });
        derivedAsset = optClip as unknown as T;
        sizeBytes = optClip.tracks.reduce((acc, t) => acc + t.times.length * (t.getValueSize() * 4 + 4), 0);
      } else if ((sourceAsset as THREE.Object3D).isObject3D) {
        const obj = sourceAsset as unknown as THREE.Object3D;
        const cloned = obj.clone(true);
        // Optimize textures and mesh data in hierarchy
        cloned.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (mat && (mat as any).map && (mat as any).map.isTexture) {
                const map = (mat as any).map as THREE.Texture;
                if (!map.userData.__optimized) {
                  (mat as any).map = TextureOptimizer.optimizeTexture(map, {
                    maxDimension: targetProfile === 'ps3_plus_500' ? 1024 : 2048,
                  });
                  (mat as any).map.userData.__optimized = true;
                }
              }
            }
          }
        });
        derivedAsset = cloned as unknown as T;
        sizeBytes = analysis.mesh?.totalMemoryBytes ?? 10240;
      } else {
        derivedAsset = sourceAsset;
      }

      // 4. Cache & Persist
      const cached = this.cache.set(variantKey, {
        key: variantKey,
        sourceHash,
        targetProfile,
        createdAt: Date.now(),
        data: derivedAsset,
        sizeBytes,
      });

      return {
        ok: true,
        assetId,
        targetProfile,
        variantKey,
        analysis,
        plan,
        derivedAsset,
        cached,
      };
    } catch (err: any) {
      return {
        ok: false,
        assetId,
        targetProfile,
        variantKey,
        analysis,
        plan,
        derivedAsset: sourceAsset,
        cached: false,
        error: err.message,
      };
    }
  }

  analyze(assetId: string, asset: unknown): AssetAnalysisReport {
    if ((asset as THREE.Texture)?.isTexture) {
      return AssetAnalyzer.analyzeAsset({ assetId, texture: asset as THREE.Texture });
    }
    if (asset instanceof THREE.AnimationClip) {
      return AssetAnalyzer.analyzeAsset({ assetId, clips: [asset] });
    }
    if (Array.isArray(asset) && asset.every(a => a instanceof THREE.AnimationClip)) {
      return AssetAnalyzer.analyzeAsset({ assetId, clips: asset as THREE.AnimationClip[] });
    }
    if ((asset as THREE.Object3D)?.isObject3D) {
      return AssetAnalyzer.analyzeAsset({ assetId, object: asset as THREE.Object3D });
    }
    return AssetAnalyzer.analyzeAsset({ assetId });
  }
}
