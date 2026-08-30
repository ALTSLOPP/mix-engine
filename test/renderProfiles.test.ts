import { describe, expect, it } from 'vitest';
import {
  VisualStyleRegistry,
  DEFAULT_VISUAL_STYLES,
  type VisualStyleId,
} from '../src/rendering/profiles/VisualStyleRegistry';
import {
  PerformanceTargetRegistry,
  DEFAULT_PERFORMANCE_TARGETS,
  type PerformanceTargetId,
} from '../src/rendering/profiles/PerformanceTargetRegistry';
import {
  createDefaultProjectRenderPolicy,
  serializeProjectRenderPolicy,
  deserializeProjectRenderPolicy,
  validateProjectRenderPolicy,
  describeProjectRenderPolicy,
  type ProjectRenderPolicy,
} from '../src/rendering/profiles/ProjectRenderPolicy';

describe('VisualStyleRegistry', () => {
  it('provides all standard anime presets and realistic mode', () => {
    const expectedStyles: VisualStyleId[] = [
      'mix_anime_neutral',
      'mix_anime_shonen',
      'mix_anime_warm',
      'mix_anime_cool',
      'mix_anime_dark',
      'mix_anime_neon',
      'realistic',
      'custom',
    ];

    for (const id of expectedStyles) {
      const style = VisualStyleRegistry.get(id);
      expect(style.id).toBe(id);
      expect(style.name).toBeTruthy();
      expect(style.description).toBeTruthy();
      expect(typeof style.saturation).toBe('number');
      expect(typeof style.contrast).toBe('number');
      expect(typeof style.rimIntensity).toBe('number');
    }
  });

  it('generates semantic text descriptions without requiring viewport inspection', () => {
    const desc = VisualStyleRegistry.describe('mix_anime_shonen');
    expect(desc).toContain('Visual Style: MIX Anime Shonen');
    expect(desc).toContain('Color transform: mix_anime');
    expect(desc).toContain('Shadow tint:');
    expect(desc).toContain('Rim lighting:');
    expect(desc).toContain('Outline:');
  });

  it('allows registering and validating custom styles', () => {
    const custom = {
      ...DEFAULT_VISUAL_STYLES.mix_anime_neutral,
      id: 'custom_cyber_red' as any,
      name: 'Cyber Red',
      shadowTint: '#771122',
      saturation: 1.4,
    };
    VisualStyleRegistry.register(custom);
    const retrieved = VisualStyleRegistry.get('custom_cyber_red');
    expect(retrieved.name).toBe('Cyber Red');
    expect(retrieved.shadowTint).toBe('#771122');
  });
});

describe('PerformanceTargetRegistry', () => {
  it('provides low-spec 500 GFLOPS, balanced, high-end and unbounded targets', () => {
    const targets: PerformanceTargetId[] = ['ps3_plus_500', 'balanced', 'high_end', 'unbounded', 'custom'];

    for (const t of targets) {
      const target = PerformanceTargetRegistry.get(t);
      expect(target.id).toBe(t);
      expect(target.targetFps).toBeGreaterThanOrEqual(30);
      expect(target.qualitySteps.length).toBeGreaterThan(0);
    }
  });

  it('correctly configures ps3_plus_500 for low-spec FSR upscaling (540p -> 900p, 30 FPS)', () => {
    const ps3 = PerformanceTargetRegistry.get('ps3_plus_500');
    expect(ps3.internalHeight).toBe(540);
    expect(ps3.outputHeight).toBe(900);
    expect(ps3.targetFps).toBe(30);
    expect(ps3.fsrEnabled).toBe(true);
    expect(ps3.shadowsEnabled).toBe(false);
    expect(ps3.aoEnabled).toBe(false);
    expect(ps3.lodDistanceBias).toBeGreaterThan(1.0);
  });

  it('configures balanced mode for 720p -> 1080p FSR at 60 FPS', () => {
    const balanced = PerformanceTargetRegistry.get('balanced');
    expect(balanced.internalHeight).toBe(720);
    expect(balanced.outputHeight).toBe(1080);
    expect(balanced.targetFps).toBe(60);
    expect(balanced.fsrEnabled).toBe(true);
    expect(balanced.shadowsEnabled).toBe(true);
    expect(balanced.bloomEnabled).toBe(true);
  });

  it('configures unbounded mode with no simplification or caps', () => {
    const unbounded = PerformanceTargetRegistry.get('unbounded');
    expect(unbounded.internalHeight).toBe(0);
    expect(unbounded.outputHeight).toBe(0);
    expect(unbounded.renderScale).toBe(1.0);
    expect(unbounded.fsrEnabled).toBe(false);
    expect(unbounded.lodDistanceBias).toBeLessThanOrEqual(0.5);
  });

  it('describes performance target in plain text', () => {
    const desc = PerformanceTargetRegistry.describe('ps3_plus_500');
    expect(desc).toContain('Performance Target: PS3+ / 500-GFLOPS Class');
    expect(desc).toContain('540p internal -> 900p output');
    expect(desc).toContain('Target FPS: 30');
    expect(desc).toContain('FSR 1: enabled');
  });
});

describe('ProjectRenderPolicy', () => {
  it('creates and validates default policy with independent style, target, and optimization policy', () => {
    const policy = createDefaultProjectRenderPolicy();
    expect(policy.visualStyle).toBe('mix_anime_neutral');
    expect(policy.performanceTarget).toBe('ps3_plus_500');
    expect(policy.optimizationPolicy).toBe('auto');
    expect(policy.adaptiveQuality).toBe(true);
    expect(validateProjectRenderPolicy(policy)).toBe(true);
  });

  it('supports independent configuration pairs (mix_anime + unbounded, realistic + ps3_plus_500)', () => {
    const animeUnbounded: ProjectRenderPolicy = {
      version: 1,
      visualStyle: 'mix_anime_shonen',
      performanceTarget: 'unbounded',
      optimizationPolicy: 'off',
      adaptiveQuality: false,
    };
    expect(validateProjectRenderPolicy(animeUnbounded)).toBe(true);

    const realisticLowSpec: ProjectRenderPolicy = {
      version: 1,
      visualStyle: 'realistic',
      performanceTarget: 'ps3_plus_500',
      optimizationPolicy: 'auto',
      adaptiveQuality: true,
    };
    expect(validateProjectRenderPolicy(realisticLowSpec)).toBe(true);
  });

  it('serializes and deserializes cleanly', () => {
    const original: ProjectRenderPolicy = {
      version: 1,
      visualStyle: 'mix_anime_warm',
      performanceTarget: 'balanced',
      optimizationPolicy: 'suggest',
      targetFps: 60,
      adaptiveQuality: true,
    };
    const json = serializeProjectRenderPolicy(original);
    const deserialized = deserializeProjectRenderPolicy(json);
    expect(deserialized).toEqual(original);
  });

  it('describes project render policy textually', () => {
    const policy = createDefaultProjectRenderPolicy();
    const desc = describeProjectRenderPolicy(policy);
    expect(desc).toContain('Project Render Policy');
    expect(desc).toContain('Visual Style: MIX Anime Neutral');
    expect(desc).toContain('Performance Target: PS3+ / 500-GFLOPS Class');
    expect(desc).toContain('Asset Optimization Policy: AUTO');
  });
});
