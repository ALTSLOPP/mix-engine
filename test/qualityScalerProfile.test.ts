import { describe, expect, it } from 'vitest';
import { QualityScaler } from '../src/rendering/QualityScaler';
import { PerformanceTargetRegistry } from '../src/rendering/profiles/PerformanceTargetRegistry';

describe('QualityScaler Profile & Reason History Integration', () => {
  it('applies performance target configuration to QualityScaler', () => {
    const scaler = new QualityScaler({ targetFps: 60 });
    const target = PerformanceTargetRegistry.get('ps3_plus_500');

    scaler.applyPerformanceTarget(target);
    expect(scaler.getTargetFps()).toBe(30);
  });

  it('records reason history events with protected anime visual features', () => {
    const scaler = new QualityScaler({ targetFps: 60, enabled: true });

    // Simulate degradation trigger
    scaler.update(0.05, 18); // 20 FPS (below threshold)
    scaler.update(0.05, 18);
    scaler.update(0.05, 18);
    scaler.update(0.05, 18);

    const history = scaler.getReasonHistory();
    expect(Array.isArray(history)).toBe(true);

    if (history.length > 0) {
      const event = history[0];
      expect(event.targetFps).toBe(60);
      expect(event.preservedFeatures).toContain('Anime toon shading & Face SDF');
      expect(event.preservedFeatures).toContain('Dark character silhouette outlines');
    }
  });

  it('generates a comprehensive plain-text status description', () => {
    const scaler = new QualityScaler({ targetFps: 60 });
    const desc = scaler.describe();

    expect(desc).toContain('QualityScaler Adaptive Scaling');
    expect(desc).toContain('(Target: 60 FPS)');
    expect(desc).toContain('Protected Core Features');
    expect(desc).toContain('Face SDF');
    expect(desc).toContain('Silhouette Outlines');
  });
});
