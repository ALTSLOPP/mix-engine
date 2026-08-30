import { describe, expect, it } from 'vitest';
import { PerformanceExplainer } from '../src/rendering/PerformanceExplainer';

describe('PerformanceExplainer', () => {
  it('diagnoses healthy performance state as GOOD', () => {
    const report = PerformanceExplainer.explain({
      fps: 60,
      drawCalls: 120,
      visibleTriangles: 150000,
      shadowCasters: 1,
      animatedCharacters: 4,
    }, 60);

    expect(report.status).toBe('GOOD');
    expect(report.summary).toContain('[GOOD]');
    expect(report.recommendations.length).toBe(0);
  });

  it('detects high draw calls and provides actionable batching recommendations', () => {
    const report = PerformanceExplainer.explain({
      fps: 28,
      drawCalls: 1200,
      visibleTriangles: 200000,
      shadowCasters: 1,
    }, 60);

    expect(report.status).toBe('ERROR');
    expect(report.largestCosts.some(c => c.includes('draw calls'))).toBe(true);
    expect(report.recommendations.some(r => r.recommendation.includes('batching') || r.recommendation.includes('instancing'))).toBe(true);
  });

  it('detects multiple shadow casters and excessive animated characters', () => {
    const report = PerformanceExplainer.explain({
      fps: 35,
      drawCalls: 200,
      visibleTriangles: 300000,
      shadowCasters: 6,
      animatedCharacters: 45,
    }, 60);

    expect(report.largestCosts.some(c => c.includes('shadow'))).toBe(true);
    expect(report.largestCosts.some(c => c.includes('animated character'))).toBe(true);
    expect(report.recommendations.some(r => r.recommendation.includes('Animation LOD'))).toBe(true);
  });

  it('formats clean text report for terminal and AI bridge display', () => {
    const report = PerformanceExplainer.explain({
      fps: 22,
      drawCalls: 950,
      visibleTriangles: 2200000,
    }, 60);

    const formatted = PerformanceExplainer.formatReport(report);
    expect(formatted).toContain('=== MIX PERFORMANCE REPORT ===');
    expect(formatted).toContain('Largest Likely Costs:');
    expect(formatted).toContain('Actionable Recommendations:');
  });
});
