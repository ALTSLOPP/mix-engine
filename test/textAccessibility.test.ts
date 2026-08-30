import { describe, expect, it } from 'vitest';
import { TextRenderDescriber } from '../src/rendering/TextRenderDescriber';
import { createDefaultProjectRenderPolicy } from '../src/rendering/profiles/ProjectRenderPolicy';
import { CelToonMaterial } from '../src/materials/CelToonMaterial';
import { AssetAnalyzer } from '../src/assets/derived/AssetAnalyzer';
import { OptimizationPlanner } from '../src/assets/derived/OptimizationPlanner';
import { PerformanceExplainer } from '../src/rendering/PerformanceExplainer';
import { QualityScaler } from '../src/rendering/QualityScaler';
import * as THREE from 'three';

describe('TextRenderDescriber for Blind Developer Accessibility', () => {
  it('describes render profile in complete plain text with no color-only codes', () => {
    const policy = createDefaultProjectRenderPolicy();
    const desc = TextRenderDescriber.describeRenderProfile(policy);

    expect(desc).toContain('MIX RENDER PROFILE');
    expect(desc).toContain('Visual Style: MIX Anime Neutral');
    expect(desc).toContain('Performance Target: PS3+ / 500-GFLOPS Class');
    expect(desc).toContain('Asset Cooking Policy: AUTO');
  });

  it('describes anime material with exact numerical parameters and textual properties', () => {
    const mat = new CelToonMaterial({
      surface: 'hair',
      color: 0x332255,
      hairHighlightStrength: 0.85,
      rimIntensity: 1.1,
    });

    const desc = TextRenderDescriber.describeAnimeMaterial(mat);
    expect(desc).toContain('CelToonMaterial');
    expect(desc).toContain('Surface Mode: hair');
    expect(desc).toContain('Hair Highlight: strength 0.85');
    expect(desc).toContain('Intensity: 1.10');
  });

  it('describes asset analysis reports with status prefixes', () => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial());
    const report = AssetAnalyzer.analyzeAsset({ assetId: 'test_box', object: mesh });

    const desc = TextRenderDescriber.describeAsset(report);
    expect(desc).toContain('ASSET ANALYSIS: test_box');
    expect(desc).toContain('Triangles: 12');
    expect(desc).toContain('[GOOD]');
  });

  it('describes optimization dry-run plans clearly', () => {
    const plan = OptimizationPlanner.planMeshOptimization({
      assetId: 'enemy_grunt',
      category: 'npc',
      targetProfile: 'ps3_plus_500',
    });

    const desc = TextRenderDescriber.describeOptimizationPlan(plan);
    expect(desc).toContain('ASSET OPTIMIZATION DRY-RUN PLAN');
    expect(desc).toContain('Asset: enemy_grunt');
    expect(desc).toContain('Scheduled Non-Destructive Operations:');
  });

  it('describes performance diagnostics with explicit severity tags', () => {
    const exp = PerformanceExplainer.explain({
      fps: 30,
      drawCalls: 900,
    }, 60);

    const desc = TextRenderDescriber.describePerformance(exp);
    expect(desc).toContain('PERFORMANCE EXPLANATION');
    expect(desc).toContain('Status:');
    expect(desc).toContain('Key Bottlenecks:');
    expect(desc).toContain('- [HIGH]');
  });

  it('describes quality scaler status with protected core features', () => {
    const scaler = new QualityScaler({ targetFps: 60 });
    const desc = TextRenderDescriber.describeQualityScaler(scaler);

    expect(desc).toContain('QualityScaler Adaptive Scaling');
    expect(desc).toContain('(Target: 60 FPS)');
    expect(desc).toContain('Protected Core Features');
  });
});
