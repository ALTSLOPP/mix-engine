/**
 * RegressionHarness — Automated regression checks, baseline comparisons, and soak test harness.
 */

import type { ProfilerReport } from './PerformanceProfiler';

export interface RegressionCheckResult {
  passed: boolean;
  regressions: string[];
  metrics: {
    frameTimeDeltaPct: number;
    drawCallsDeltaPct: number;
    trianglesDeltaPct: number;
  };
}

export interface SoakTestOptions {
  cycles: number;
  action: (cycle: number) => Promise<void> | void;
  getMetrics: () => { entityCount: number; memoryBytes?: number };
}

export interface SoakTestResult {
  passed: boolean;
  cyclesCompleted: number;
  initialEntities: number;
  finalEntities: number;
  entityLeak: number;
  durationMs: number;
  error?: string;
}

export class RegressionHarness {
  /**
   * Compares a current performance report against a golden baseline with a tolerance threshold.
   */
  static compareWithBaseline(
    current: ProfilerReport,
    baseline: ProfilerReport,
    toleranceFraction = 0.2 // default 20% tolerance
  ): RegressionCheckResult {
    const regressions: string[] = [];

    const frameDelta = (current.frameTimeMs - baseline.frameTimeMs) / Math.max(1, baseline.frameTimeMs);
    const drawDelta = (current.rendering.drawCalls - baseline.rendering.drawCalls) / Math.max(1, baseline.rendering.drawCalls);
    const triDelta = (current.rendering.triangles - baseline.rendering.triangles) / Math.max(1, baseline.rendering.triangles);

    if (frameDelta > toleranceFraction) {
      regressions.push(`Frame time regressed by +${(frameDelta * 100).toFixed(1)}% (current: ${current.frameTimeMs}ms, baseline: ${baseline.frameTimeMs}ms).`);
    }
    if (drawDelta > toleranceFraction) {
      regressions.push(`Draw calls regressed by +${(drawDelta * 100).toFixed(1)}% (current: ${current.rendering.drawCalls}, baseline: ${baseline.rendering.drawCalls}).`);
    }
    if (triDelta > toleranceFraction) {
      regressions.push(`Triangles regressed by +${(triDelta * 100).toFixed(1)}% (current: ${current.rendering.triangles}, baseline: ${baseline.rendering.triangles}).`);
    }

    return {
      passed: regressions.length === 0,
      regressions,
      metrics: {
        frameTimeDeltaPct: +(frameDelta * 100).toFixed(1),
        drawCallsDeltaPct: +(drawDelta * 100).toFixed(1),
        trianglesDeltaPct: +(triDelta * 100).toFixed(1),
      },
    };
  }

  /**
   * Runs an automated soak / stress cycle test and asserts that zero entity/resource leaks occur.
   */
  static async runSoakTest(options: SoakTestOptions): Promise<SoakTestResult> {
    const startT = performance.now();
    const initialMetrics = options.getMetrics();

    try {
      for (let i = 0; i < options.cycles; i++) {
        await options.action(i);
      }
    } catch (err) {
      return {
        passed: false,
        cyclesCompleted: 0,
        initialEntities: initialMetrics.entityCount,
        finalEntities: options.getMetrics().entityCount,
        entityLeak: options.getMetrics().entityCount - initialMetrics.entityCount,
        durationMs: +(performance.now() - startT).toFixed(1),
        error: (err as Error)?.message ?? String(err),
      };
    }

    const finalMetrics = options.getMetrics();
    const entityLeak = finalMetrics.entityCount - initialMetrics.entityCount;

    return {
      passed: entityLeak === 0,
      cyclesCompleted: options.cycles,
      initialEntities: initialMetrics.entityCount,
      finalEntities: finalMetrics.entityCount,
      entityLeak,
      durationMs: +(performance.now() - startT).toFixed(1),
    };
  }
}
