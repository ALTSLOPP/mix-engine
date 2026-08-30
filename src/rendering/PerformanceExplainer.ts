/**
 * PerformanceExplainer.ts — Deterministic performance cost explainer and budget reporter.
 *
 * Answers "Why is my game slow?" with deterministic, rule-based diagnostic analysis.
 * Generates structured reports and prioritized recommendations without external LLM dependencies.
 */

export interface SceneRenderStats {
  fps?: number;
  frameTimeMs?: number;
  internalWidth?: number;
  internalHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  fsrEnabled?: boolean;
  rcasSharpness?: number;
  adaptiveQualityLevel?: number;
  drawCalls?: number;
  visibleTriangles?: number;
  totalGeometries?: number;
  totalTextures?: number;
  totalMaterials?: number;
  skinnedMeshes?: number;
  animatedCharacters?: number;
  activeLights?: number;
  shadowCasters?: number;
  transparentObjects?: number;
  enabledPostPasses?: string[];
  estimatedTextureMemoryBytes?: number;
}

export interface BudgetRecommendation {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  cause: string;
  recommendation: string;
}

export interface PerformanceExplanation {
  status: 'GOOD' | 'WARNING' | 'ERROR';
  summary: string;
  targetFps: number;
  currentFps: number;
  frameBudgetMs: number;
  currentFrameMs: number;
  largestCosts: string[];
  recommendations: BudgetRecommendation[];
  stats: SceneRenderStats;
}

export class PerformanceExplainer {
  static explain(stats: SceneRenderStats, targetFps = 60): PerformanceExplanation {
    const fps = stats.fps ?? 60;
    const currentFrameMs = stats.frameTimeMs ?? (fps > 0 ? 1000 / fps : 16.6);
    const frameBudgetMs = 1000 / targetFps;

    const largestCosts: string[] = [];
    const recommendations: BudgetRecommendation[] = [];

    // 1. Draw Calls
    const calls = stats.drawCalls ?? 0;
    if (calls > 800) {
      largestCosts.push(`Excessive draw calls (${calls.toLocaleString()} calls)`);
      recommendations.push({
        severity: 'HIGH',
        cause: `${calls} individual draw calls per frame`,
        recommendation: 'Enable static batching for props and combine small shared materials',
      });
    } else if (calls > 400) {
      largestCosts.push(`Moderate draw call pressure (${calls} calls)`);
      recommendations.push({
        severity: 'MEDIUM',
        cause: `${calls} draw calls`,
        recommendation: 'Consider HLOD clusters or instanced meshes for repeated objects',
      });
    }

    // 2. Triangles
    const tris = stats.visibleTriangles ?? 0;
    if (tris > 1500000) {
      largestCosts.push(`High triangle throughput (${tris.toLocaleString()} submitted triangles)`);
      recommendations.push({
        severity: 'HIGH',
        cause: `${(tris / 1000000).toFixed(2)}M triangles submitted to GPU`,
        recommendation: 'Generate LOD1/LOD2 variants for dense background meshes and characters',
      });
    }

    // 3. Shadow Casters
    const shadows = stats.shadowCasters ?? 0;
    if (shadows > 4) {
      largestCosts.push(`Multiple shadow-casting lights (${shadows} active shadow maps)`);
      recommendations.push({
        severity: 'HIGH',
        cause: `${shadows} dynamic shadow casters running cascades`,
        recommendation: 'Disable shadow casting on local point/spot lights; use single sun directional shadow',
      });
    }

    // 4. Animated characters
    const animated = stats.animatedCharacters ?? stats.skinnedMeshes ?? 0;
    if (animated > 30) {
      largestCosts.push(`High animated character density (${animated} characters)`);
      recommendations.push({
        severity: 'HIGH',
        cause: `${animated} active skeletons evaluated every frame`,
        recommendation: 'Enable distance-based Animation LOD (30Hz midground, 15Hz background)',
      });
    }

    // 5. Texture Memory
    const texMem = stats.estimatedTextureMemoryBytes ?? 0;
    if (texMem > 512 * 1024 * 1024) {
      const mb = Math.round(texMem / (1024 * 1024));
      largestCosts.push(`Large texture footprint (${mb} MiB estimated GPU texture VRAM)`);
      recommendations.push({
        severity: 'MEDIUM',
        cause: `${mb} MiB textures loaded into memory`,
        recommendation: 'Build downscaled derived texture variants (1024px hero, 512px crowd)',
      });
    }

    // 6. Expensive Post Passes
    const passes = stats.enabledPostPasses ?? [];
    if (passes.includes('ssrPass') && passes.includes('volumetricFogPass')) {
      largestCosts.push('Multiple heavy screen-space passes (SSR + Volumetric Fog)');
      recommendations.push({
        severity: 'MEDIUM',
        cause: 'Full-resolution raymarched reflections and volumetric fog',
        recommendation: 'Disable SSR on modest profiles or replace volumetric fog with cheap atmospheric depth',
      });
    }

    // 7. Resolution & FSR
    if (!stats.fsrEnabled && stats.internalWidth && stats.internalWidth >= 1920) {
      if (fps < targetFps - 5) {
        largestCosts.push('Native 1080p+ fillrate load without upscaling');
        recommendations.push({
          severity: 'HIGH',
          cause: 'Full native rendering resolution on stressed hardware',
          recommendation: 'Enable FSR 1 spatial upscaling with 540p or 720p internal resolution',
        });
      }
    }

    let status: 'GOOD' | 'WARNING' | 'ERROR' = 'GOOD';
    if (fps < targetFps * 0.6 || recommendations.some(r => r.severity === 'HIGH')) {
      status = 'ERROR';
    } else if (fps < targetFps * 0.9 || recommendations.some(r => r.severity === 'MEDIUM')) {
      status = 'WARNING';
    }

    const summary = status === 'GOOD'
      ? `[GOOD] Performance is healthy: holding ${fps.toFixed(1)} FPS against ${targetFps} FPS target.`
      : status === 'WARNING'
      ? `[WARNING] Performance under slight pressure: ${fps.toFixed(1)} FPS (${(frameBudgetMs - currentFrameMs).toFixed(1)}ms delta).`
      : `[ERROR] Significant frame drops: ${fps.toFixed(1)} FPS (exceeds ${targetFps} FPS budget by ${(currentFrameMs - frameBudgetMs).toFixed(1)}ms).`;

    return {
      status,
      summary,
      targetFps,
      currentFps: Math.round(fps * 10) / 10,
      frameBudgetMs: Math.round(frameBudgetMs * 10) / 10,
      currentFrameMs: Math.round(currentFrameMs * 10) / 10,
      largestCosts: largestCosts.length > 0 ? largestCosts : ['No critical bottlenecks detected'],
      recommendations,
      stats,
    };
  }

  static formatReport(explanation: PerformanceExplanation): string {
    const lines = [
      `=== MIX PERFORMANCE REPORT ===`,
      explanation.summary,
      `Frame Time: ${explanation.currentFrameMs} ms (Budget: ${explanation.frameBudgetMs} ms for ${explanation.targetFps} FPS)`,
      ``,
      `Largest Likely Costs:`,
    ];

    for (let i = 0; i < explanation.largestCosts.length; i++) {
      lines.push(`${i + 1}. ${explanation.largestCosts[i]}`);
    }

    if (explanation.recommendations.length > 0) {
      lines.push(``, `Actionable Recommendations:`);
      for (const rec of explanation.recommendations) {
        lines.push(`- [${rec.severity}] ${rec.recommendation} (Cause: ${rec.cause})`);
      }
    }

    return lines.join('\n');
  }
}
