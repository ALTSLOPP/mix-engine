/**
 * OptimizationPlanner.ts — Semantic, rule-based dry-run optimization planner.
 *
 * Produces actionable, deterministic plans without altering source assets.
 * Respects hero metadata, manual developer overrides, and performance targets.
 */

import type { PerformanceTargetId } from '../../rendering/profiles/PerformanceTargetRegistry';
import { PerformanceTargetRegistry } from '../../rendering/profiles/PerformanceTargetRegistry';
import type { MeshMetrics, TextureMetrics, AnimationMetrics } from './AssetAnalyzer';

export type SemanticCategory =
  | 'hero_character'
  | 'npc'
  | 'crowd_character'
  | 'face'
  | 'hair'
  | 'weapon'
  | 'vehicle'
  | 'building'
  | 'prop'
  | 'foliage'
  | 'terrain'
  | 'cinematic'
  | 'vfx';

export interface OptimizationOverrides {
  never_simplify?: boolean;
  never_downscale_texture?: boolean;
  preserve_morphs?: boolean;
  preserve_root_motion?: boolean;
  preserve_facial_rig?: boolean;
  preserve_uv_seams?: boolean;
  force_source_variant?: boolean;
  importance?: 'hero' | 'standard' | 'crowd' | 'background';
}

export interface OptimizationPlan {
  ok: boolean;
  assetId: string;
  category: SemanticCategory;
  importance: 'hero' | 'standard' | 'crowd' | 'background';
  targetProfile: PerformanceTargetId | string;
  operations: string[];
  overridesApplied: string[];
  sourceMetrics: {
    triangles?: number;
    vertices?: number;
    texturesMemoryBytes?: number;
    animationKeys?: number;
  };
  estimatedResult: {
    triangles?: number;
    vertices?: number;
    texturesMemoryBytes?: number;
    animationKeys?: number;
    estimatedSavingsPct?: number;
  };
  warnings: string[];
}

export class OptimizationPlanner {
  static planMeshOptimization(params: {
    assetId: string;
    category?: SemanticCategory;
    overrides?: OptimizationOverrides;
    targetProfile?: PerformanceTargetId | string;
    meshMetrics?: MeshMetrics;
    textureMetrics?: TextureMetrics;
    animMetrics?: AnimationMetrics;
  }): OptimizationPlan {
    const assetId = params.assetId;
    const overrides = params.overrides ?? {};
    const targetProfile = params.targetProfile ?? 'ps3_plus_500';
    const target = PerformanceTargetRegistry.get(targetProfile);

    // Infer semantic category if omitted
    const category: SemanticCategory = params.category ?? (
      assetId.includes('hero') ? 'hero_character' :
      assetId.includes('npc') ? 'npc' :
      assetId.includes('crowd') ? 'crowd_character' :
      assetId.includes('car') || assetId.includes('vehicle') ? 'vehicle' :
      assetId.includes('tree') || assetId.includes('grass') ? 'foliage' :
      assetId.includes('sword') || assetId.includes('gun') ? 'weapon' :
      'prop'
    );

    const importance = overrides.importance ?? (
      category === 'hero_character' || category === 'cinematic' ? 'hero' :
      category === 'crowd_character' ? 'crowd' :
      'standard'
    );

    const operations: string[] = [];
    const overridesApplied: string[] = [];
    const warnings: string[] = [];

    // Check force source override
    if (overrides.force_source_variant || targetProfile === 'unbounded') {
      overridesApplied.push('force_source_variant');
      operations.push('Preserve source asset untouched (no optimization operations scheduled)');
      return {
        ok: true,
        assetId,
        category,
        importance,
        targetProfile,
        operations,
        overridesApplied,
        sourceMetrics: {
          triangles: params.meshMetrics?.triangleCount,
          vertices: params.meshMetrics?.vertexCount,
          texturesMemoryBytes: params.textureMetrics?.estimatedGpuMemoryBytes,
          animationKeys: params.animMetrics?.keyCount,
        },
        estimatedResult: {
          triangles: params.meshMetrics?.triangleCount,
          vertices: params.meshMetrics?.vertexCount,
          texturesMemoryBytes: params.textureMetrics?.estimatedGpuMemoryBytes,
          animationKeys: params.animMetrics?.keyCount,
          estimatedSavingsPct: 0,
        },
        warnings,
      };
    }

    const srcTris = params.meshMetrics?.triangleCount ?? 10000;
    const srcVerts = params.meshMetrics?.vertexCount ?? 8000;
    const srcTexBytes = params.textureMetrics?.estimatedGpuMemoryBytes ?? 4194304;
    const srcKeys = params.animMetrics?.keyCount ?? 2000;

    let estTris = srcTris;
    let estVerts = srcVerts;
    let estTexBytes = srcTexBytes;
    let estKeys = srcKeys;

    // 1. Mesh Simplification & LOD generation
    if (overrides.never_simplify) {
      overridesApplied.push('never_simplify');
      operations.push('Retain original base geometry (never_simplify override active)');
    } else {
      operations.push('Validate geometry and prune unused attributes');
      operations.push('Optimize vertex fetch & index cache ordering');

      if (targetProfile === 'ps3_plus_500' || targetProfile === 'balanced') {
        operations.push('Quantize vertex normals and UVs');
        estVerts = Math.round(srcVerts * 0.9);

        if (importance === 'crowd' || importance === 'background') {
          operations.push('Generate aggressive LOD1 (50% tris) and LOD2 (25% tris) variants');
          estTris = Math.round(srcTris * 0.6);
        } else if (importance === 'hero') {
          operations.push('Generate gentle LOD1 (70% tris) variant with silhouette preservation');
          estTris = Math.round(srcTris * 0.85);
        } else {
          operations.push('Generate LOD1 (60% tris) and LOD2 (35% tris) variants');
          estTris = Math.round(srcTris * 0.7);
        }
      }
    }

    // Check morph targets preservation
    if (overrides.preserve_morphs || importance === 'hero') {
      overridesApplied.push('preserve_morphs');
      operations.push('Preserve all morph targets and facial blendshapes');
    }

    // Check facial rig preservation
    if (overrides.preserve_facial_rig || importance === 'hero') {
      overridesApplied.push('preserve_facial_rig');
      operations.push('Preserve complete facial skeleton hierarchy');
    }

    // 2. Texture Optimization
    if (overrides.never_downscale_texture) {
      overridesApplied.push('never_downscale_texture');
      operations.push('Preserve original texture resolution (never_downscale_texture override active)');
    } else {
      if (targetProfile === 'ps3_plus_500') {
        if (importance === 'hero') {
          operations.push('Cap hero textures at 1024px, generating mipmaps and Linear sRGB tags');
          estTexBytes = Math.min(srcTexBytes, 1024 * 1024 * 4 * 1.33);
        } else if (importance === 'crowd' || importance === 'background') {
          operations.push('Cap crowd textures at 512px, generating mipmaps');
          estTexBytes = Math.min(srcTexBytes, 512 * 512 * 4 * 1.33);
        } else {
          operations.push('Cap textures at 1024px with semantic color space tagging');
          estTexBytes = Math.min(srcTexBytes, 1024 * 1024 * 4 * 1.33);
        }
      }
    }

    // 3. Animation Optimization
    if (overrides.preserve_root_motion) {
      overridesApplied.push('preserve_root_motion');
      operations.push('Preserve root motion and translation curves');
    }

    if (params.animMetrics) {
      operations.push('Prune constant animation tracks');
      operations.push('Reduce redundant keyframes using quaternion rotation error tolerance (0.002 rad)');
      estKeys = Math.round(srcKeys * 0.55);

      if (targetProfile === 'ps3_plus_500' && importance !== 'hero') {
        operations.push('Enable distance-based animation LOD (30Hz midground, 15Hz background)');
      }
    }

    const totalSrc = srcTris * 32 + srcTexBytes + srcKeys * 16;
    const totalEst = estTris * 32 + estTexBytes + estKeys * 16;
    const savingsPct = totalSrc > 0 ? Math.max(0, Math.round(((totalSrc - totalEst) / totalSrc) * 100)) : 0;

    return {
      ok: true,
      assetId,
      category,
      importance,
      targetProfile,
      operations,
      overridesApplied,
      sourceMetrics: {
        triangles: srcTris,
        vertices: srcVerts,
        texturesMemoryBytes: srcTexBytes,
        animationKeys: srcKeys,
      },
      estimatedResult: {
        triangles: estTris,
        vertices: estVerts,
        texturesMemoryBytes: estTexBytes,
        animationKeys: estKeys,
        estimatedSavingsPct: savingsPct,
      },
      warnings,
    };
  }
}
