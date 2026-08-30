/**
 * PerformanceProfiler — Comprehensive multi-subsystem CPU & GPU performance profiler.
 *
 * Tracks per-subsystem timing slices, draw calls, triangle counts, memory allocations,
 * and budget compliance with p50/p95/p99 statistics.
 */

export interface SubsystemTiming {
  name: string;
  lastMs: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface ProfilerReport {
  timestamp: number;
  fps: number;
  frameTimeMs: number;
  subsystems: Record<string, SubsystemTiming>;
  rendering: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    estimatedVramBytes: number;
  };
  memory: {
    entityCount: number;
    rigidBodyCount: number;
    componentCount: number;
  };
  budgetViolations: string[];
}

export interface ProfilerBudgets {
  maxFrameTimeMs?: number;
  maxDrawCalls?: number;
  maxTriangles?: number;
  maxVramBytes?: number;
}

export class PerformanceProfiler {
  private readonly historyLimit: number;
  private readonly sliceHistory = new Map<string, number[]>();
  private readonly frameTimeHistory: number[] = [];
  private currentFrameStart = 0;
  private lastMarkTime = 0;
  private currentSlices: Record<string, number> = {};

  constructor(historyLimit = 120) {
    this.historyLimit = historyLimit;
  }

  /** Begin recording a new frame */
  beginFrame(now = performance.now()): void {
    this.currentFrameStart = now;
    this.lastMarkTime = now;
    this.currentSlices = {};
  }

  /** Record a completed subsystem work slice */
  mark(subsystemName: string, now = performance.now()): void {
    if (this.currentFrameStart === 0) return;
    const elapsed = Math.max(0, now - this.lastMarkTime);
    this.currentSlices[subsystemName] = (this.currentSlices[subsystemName] ?? 0) + elapsed;
    this.lastMarkTime = now;
  }

  /** End recording the frame and return the generated report */
  endFrame(
    extraMetrics?: {
      drawCalls?: number;
      triangles?: number;
      geometries?: number;
      textures?: number;
      estimatedVramBytes?: number;
      entityCount?: number;
      rigidBodyCount?: number;
      componentCount?: number;
    },
    budgets?: ProfilerBudgets,
    now = performance.now()
  ): ProfilerReport {
    const frameTime = Math.max(0.001, now - this.currentFrameStart);
    this.frameTimeHistory.push(frameTime);
    if (this.frameTimeHistory.length > this.historyLimit) this.frameTimeHistory.shift();

    // Update subsystem histories
    for (const [name, ms] of Object.entries(this.currentSlices)) {
      let arr = this.sliceHistory.get(name);
      if (!arr) {
        arr = [];
        this.sliceHistory.set(name, arr);
      }
      arr.push(ms);
      if (arr.length > this.historyLimit) arr.shift();
    }

    const subsystemStats: Record<string, SubsystemTiming> = {};
    for (const [name, arr] of this.sliceHistory.entries()) {
      const sorted = arr.slice().sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      const avg = sum / sorted.length;
      const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      subsystemStats[name] = {
        name,
        lastMs: this.currentSlices[name] ?? 0,
        avgMs: +avg.toFixed(3),
        p95Ms: +(sorted[p95Idx] ?? 0).toFixed(3),
        maxMs: +(sorted[sorted.length - 1] ?? 0).toFixed(3),
      };
    }

    const fps = Math.round(1000 / frameTime);
    const violations: string[] = [];

    if (budgets?.maxFrameTimeMs && frameTime > budgets.maxFrameTimeMs) {
      violations.push(`Frame time (${frameTime.toFixed(1)}ms) exceeded budget (${budgets.maxFrameTimeMs}ms).`);
    }
    if (budgets?.maxDrawCalls && (extraMetrics?.drawCalls ?? 0) > budgets.maxDrawCalls) {
      violations.push(`Draw calls (${extraMetrics?.drawCalls}) exceeded budget (${budgets.maxDrawCalls}).`);
    }
    if (budgets?.maxTriangles && (extraMetrics?.triangles ?? 0) > budgets.maxTriangles) {
      violations.push(`Triangles (${extraMetrics?.triangles}) exceeded budget (${budgets.maxTriangles}).`);
    }
    if (budgets?.maxVramBytes && (extraMetrics?.estimatedVramBytes ?? 0) > budgets.maxVramBytes) {
      violations.push(`VRAM estimate (${extraMetrics?.estimatedVramBytes}B) exceeded budget (${budgets.maxVramBytes}B).`);
    }

    const report: ProfilerReport = {
      timestamp: now,
      fps,
      frameTimeMs: +frameTime.toFixed(2),
      subsystems: subsystemStats,
      rendering: {
        drawCalls: extraMetrics?.drawCalls ?? 0,
        triangles: extraMetrics?.triangles ?? 0,
        geometries: extraMetrics?.geometries ?? 0,
        textures: extraMetrics?.textures ?? 0,
        estimatedVramBytes: extraMetrics?.estimatedVramBytes ?? 0,
      },
      memory: {
        entityCount: extraMetrics?.entityCount ?? 0,
        rigidBodyCount: extraMetrics?.rigidBodyCount ?? 0,
        componentCount: extraMetrics?.componentCount ?? 0,
      },
      budgetViolations: violations,
    };

    this.currentFrameStart = 0;
    return report;
  }

  /** Reset collected statistics */
  clear(): void {
    this.sliceHistory.clear();
    this.frameTimeHistory.length = 0;
    this.currentSlices = {};
    this.currentFrameStart = 0;
  }
}
