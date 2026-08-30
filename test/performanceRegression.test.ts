import { describe, it, expect, beforeEach } from 'vitest';
import {
  PerformanceProfiler,
  RegressionHarness,
  type ProfilerReport,
} from '../src/diagnostics';

describe('PerformanceProfiler Unit Tests', () => {
  let profiler: PerformanceProfiler;

  beforeEach(() => {
    profiler = new PerformanceProfiler(60);
  });

  it('tracks multi-subsystem timings and computes p95 statistics', () => {
    for (let frame = 0; frame < 20; frame++) {
      profiler.beginFrame(1000 + frame * 16.6);
      profiler.mark('physics', 1000 + frame * 16.6 + 2.5);
      profiler.mark('animation', 1000 + frame * 16.6 + 4.0);
      profiler.mark('render', 1000 + frame * 16.6 + 12.0);
      profiler.endFrame(
        { drawCalls: 45, triangles: 12000, entityCount: 50 },
        { maxFrameTimeMs: 33.3 },
        1000 + frame * 16.6 + 14.0
      );
    }

    const report = profiler.endFrame(
      { drawCalls: 50, triangles: 15000, entityCount: 50 },
      undefined,
      1400
    );

    expect(report.subsystems['physics']).toBeDefined();
    expect(report.subsystems['physics'].avgMs).toBeGreaterThan(0);
    expect(report.subsystems['render']).toBeDefined();
    expect(report.rendering.drawCalls).toBe(50);
    expect(report.budgetViolations).toHaveLength(0);
  });

  it('detects budget violations when frame limits are exceeded', () => {
    profiler.beginFrame(100);
    profiler.mark('heavy_physics', 160);
    const report = profiler.endFrame(
      { drawCalls: 500, triangles: 500000 },
      { maxFrameTimeMs: 16.6, maxDrawCalls: 100 },
      170
    );

    expect(report.budgetViolations.length).toBeGreaterThanOrEqual(2);
    expect(report.budgetViolations.some((v) => v.includes('Frame time'))).toBe(true);
    expect(report.budgetViolations.some((v) => v.includes('Draw calls'))).toBe(true);
  });
});

describe('RegressionHarness Unit Tests', () => {
  const baseReport: ProfilerReport = {
    timestamp: 1000,
    fps: 60,
    frameTimeMs: 16.0,
    subsystems: {},
    rendering: { drawCalls: 50, triangles: 20000, geometries: 10, textures: 5, estimatedVramBytes: 1000000 },
    memory: { entityCount: 20, rigidBodyCount: 20, componentCount: 40 },
    budgetViolations: [],
  };

  it('passes when performance is within golden baseline tolerance', () => {
    const currentReport: ProfilerReport = {
      ...baseReport,
      frameTimeMs: 17.0, // only +6% change, within 20% tolerance
      rendering: { ...baseReport.rendering, drawCalls: 52 },
    };

    const check = RegressionHarness.compareWithBaseline(currentReport, baseReport, 0.2);
    expect(check.passed).toBe(true);
    expect(check.regressions).toHaveLength(0);
  });

  it('detects regressions when metrics degrade beyond tolerance', () => {
    const degradedReport: ProfilerReport = {
      ...baseReport,
      frameTimeMs: 32.0, // +100% change!
      rendering: { ...baseReport.rendering, drawCalls: 120 }, // +140% change!
    };

    const check = RegressionHarness.compareWithBaseline(degradedReport, baseReport, 0.2);
    expect(check.passed).toBe(false);
    expect(check.regressions.length).toBeGreaterThanOrEqual(2);
  });

  it('verifies zero entity leakage during 10-cycle soak test', async () => {
    const liveEntities = new Set<number>();
    let idCounter = 1;

    const result = await RegressionHarness.runSoakTest({
      cycles: 10,
      action: async (cycle) => {
        // Spawn 5 entities
        const spawned: number[] = [];
        for (let i = 0; i < 5; i++) {
          const id = idCounter++;
          liveEntities.add(id);
          spawned.push(id);
        }
        // Destroy all 5 entities
        for (const id of spawned) {
          liveEntities.delete(id);
        }
      },
      getMetrics: () => ({ entityCount: liveEntities.size }),
    });

    expect(result.passed).toBe(true);
    expect(result.cyclesCompleted).toBe(10);
    expect(result.entityLeak).toBe(0);
  });
});
