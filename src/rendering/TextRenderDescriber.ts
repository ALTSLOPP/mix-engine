/**
 * TextRenderDescriber.ts — Text-first semantic descriptions for blind developer accessibility.
 *
 * Exposes detailed, plain-text descriptions of engine rendering state, visual styles,
 * anime materials, asset optimization plans, and performance metrics.
 *
 * Rules:
 * 1. Never answer "look at the viewport".
 * 2. Never use color-only status (always prefix [GOOD], [WARNING], [ERROR]).
 * 3. Provide both semantic description and exact numerical metrics.
 */

import { VisualStyleRegistry } from './profiles/VisualStyleRegistry';
import { PerformanceTargetRegistry } from './profiles/PerformanceTargetRegistry';
import type { ProjectRenderPolicy } from './profiles/ProjectRenderPolicy';
import type { CelToonMaterial } from '../materials/CelToonMaterial';
import type { AssetAnalysisReport } from '../assets/derived/AssetAnalyzer';
import type { OptimizationPlan } from '../assets/derived/OptimizationPlanner';
import type { PerformanceExplanation } from './PerformanceExplainer';
import type { QualityScaler } from './QualityScaler';
import type { Viewport } from './Viewport';

export class TextRenderDescriber {
  static describeRenderState(viewport: Viewport): string {
    const res = viewport.getRenderResolution();
    const settings = viewport.getResolutionSettings();
    const upscaled = settings.fsrEnabled && (res.internalWidth < res.outputWidth || res.internalHeight < res.outputHeight);

    const lines = [
      `=== MIX RENDER STATE ===`,
      `Internal 3D Resolution: ${res.internalWidth}x${res.internalHeight} physical pixels`,
      `Output Presentation: ${res.outputWidth}x${res.outputHeight} physical pixels`,
      `Upscaler: ${upscaled ? `FSR 1 EASU (Active, Sharpening: ${settings.fsrSharpness.toFixed(2)})` : 'Direct / Native Bypass'}`,
      `Shadow Strategy: ${viewport.shadowStrategy.toUpperCase()}`,
      `Exposure: ${viewport.renderer.toneMappingExposure.toFixed(2)}`,
      `Active Camera: FOV ${viewport.camera.fov}°, Clip [${viewport.camera.near}m .. ${viewport.camera.far}m]`,
    ];

    return lines.join('\n');
  }

  static describeRenderProfile(policy: ProjectRenderPolicy): string {
    const style = VisualStyleRegistry.require(policy.visualStyle);
    const target = PerformanceTargetRegistry.require(policy.performanceTarget);

    return [
      `=== MIX RENDER PROFILE ===`,
      `Visual Style: ${style.name} (${style.id})`,
      `- Shading: ${style.colorTransform.toUpperCase()} color transform`,
      `- Character Shadow Tint: ${style.shadowTint}`,
      `- Ambient Character Fill: ${style.ambientFill}`,
      `- Rim Light: ${style.rimColor} (intensity ${style.rimIntensity.toFixed(2)})`,
      `- Character Outlines: ${style.outlineThickness.toFixed(1)}px (${style.outlineColor})`,
      ``,
      `Performance Target: ${target.name} (${target.id})`,
      `- Target Framerate: ${policy.targetFps ?? target.targetFps} FPS`,
      `- Base Internal Buffer: ${target.internalHeight > 0 ? `${target.internalHeight}p` : 'Native'}`,
      `- Target Presentation: ${target.outputHeight > 0 ? `${target.outputHeight}p` : 'Native'}`,
      `- Spatial FSR 1: ${target.fsrEnabled ? `ENABLED (RCAS: ${target.fsrSharpness.toFixed(2)})` : 'DISABLED'}`,
      `- Dynamic Shadows: ${target.shadowsEnabled ? `ENABLED (${target.shadowMapSize}px)` : 'DISABLED'}`,
      `- Asset Cooking Policy: ${policy.optimizationPolicy.toUpperCase()}`,
      `- Adaptive Scaler: ${policy.adaptiveQuality ? 'ENABLED' : 'DISABLED'}`,
    ].join('\n');
  }

  static describeAnimeMaterial(material: CelToonMaterial): string {
    return material.describe();
  }

  static describeAsset(report: AssetAnalysisReport): string {
    const lines = [
      `=== ASSET ANALYSIS: ${report.assetId} ===`,
      `Type: ${report.type.toUpperCase()}`,
    ];

    if (report.mesh) {
      const m = report.mesh;
      lines.push(
        `Mesh Statistics:`,
        `- Triangles: ${m.triangleCount.toLocaleString()}`,
        `- Vertices: ${m.vertexCount.toLocaleString()}`,
        `- Skinned: ${m.isSkinned ? `YES (${m.boneCount} bones)` : 'NO'}`,
        `- Morph Targets: ${m.morphTargetCount}`,
        `- Materials: ${m.materialCount}`,
        `- Dimensions: ${m.bounds.size[0].toFixed(2)}m x ${m.bounds.size[1].toFixed(2)}m x ${m.bounds.size[2].toFixed(2)}m`,
        `- Geometry GPU Memory: ${(m.totalMemoryBytes / 1024).toFixed(1)} KiB`,
      );
    }

    if (report.texture) {
      const t = report.texture;
      lines.push(
        `Texture Statistics:`,
        `- Resolution: ${t.width}x${t.height}`,
        `- Color Space: ${t.colorSpace.toUpperCase()}`,
        `- Estimated VRAM: ${(t.estimatedGpuMemoryBytes / (1024 * 1024)).toFixed(2)} MiB`,
      );
    }

    if (report.animation) {
      const a = report.animation;
      lines.push(
        `Animation Statistics:`,
        `- Clips: ${a.clipCount} (Duration: ${a.totalDurationSeconds.toFixed(1)}s)`,
        `- Tracks: ${a.trackCount} (${a.boneTrackCount} bone, ${a.morphTrackCount} morph)`,
        `- Total Keyframes: ${a.keyCount.toLocaleString()}`,
        `- Root Motion: ${a.hasRootMotion ? 'DETECTED' : 'NONE'}`,
      );
    }

    if (report.warnings.length > 0) {
      lines.push(`Advisories:`);
      for (const w of report.warnings) lines.push(`- [WARNING] ${w}`);
    } else {
      lines.push(`Status: [GOOD] No structural anomalies found.`);
    }

    return lines.join('\n');
  }

  static describeOptimizationPlan(plan: OptimizationPlan): string {
    const lines = [
      `=== ASSET OPTIMIZATION DRY-RUN PLAN ===`,
      `Asset: ${plan.assetId} (Category: ${plan.category.toUpperCase()}, Importance: ${plan.importance.toUpperCase()})`,
      `Target Profile: ${plan.targetProfile}`,
      ``,
      `Scheduled Non-Destructive Operations:`,
    ];

    for (let i = 0; i < plan.operations.length; i++) {
      lines.push(`${i + 1}. ${plan.operations[i]}`);
    }

    if (plan.overridesApplied.length > 0) {
      lines.push(``, `Protected Overrides Honored:`);
      for (const ov of plan.overridesApplied) lines.push(`- ${ov}`);
    }

    lines.push(
      ``,
      `Estimated Resource Impact:`,
      `- Triangles: ${plan.sourceMetrics.triangles?.toLocaleString() ?? 'unavailable'} -> ${plan.estimatedResult.triangles?.toLocaleString() ?? 'unavailable'}`,
      `- Vertices: ${plan.sourceMetrics.vertices?.toLocaleString() ?? 'unavailable'} -> ${plan.estimatedResult.vertices?.toLocaleString() ?? 'unavailable'}`,
      `- Est. Savings: ${plan.estimatedResult.estimatedSavingsPct ?? 0}%`,
    );

    return lines.join('\n');
  }

  static describePerformance(explanation: PerformanceExplanation): string {
    return [
      `=== PERFORMANCE EXPLANATION ===`,
      `Status: ${explanation.status}`,
      `Frame Health: ${explanation.frameHealth} · Budget Risk: ${explanation.budgetRisk}`,
      explanation.summary,
      `Current Framerate: ${explanation.currentFps.toFixed(1)} FPS (Target: ${explanation.targetFps} FPS)`,
      `Frame Time: ${explanation.currentFrameMs} ms / ${explanation.frameBudgetMs} ms budget`,
      ``,
      `Key Bottlenecks:`,
      ...explanation.largestCosts.map((c, i) => `${i + 1}. ${c}`),
      ``,
      `Recommended Actions:`,
      ...explanation.recommendations.map(r => `- [${r.severity}] ${r.recommendation}`),
    ].join('\n');
  }

  static describeQualityScaler(scaler: QualityScaler): string {
    return scaler.describe();
  }
}
