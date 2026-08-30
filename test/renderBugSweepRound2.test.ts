import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CelToonMaterial } from '../src/materials/CelToonMaterial';
import { AnimeMaterialFamily } from '../src/materials/AnimeMaterialFamily';
import { AnimeLightingContext } from '../src/rendering/anime/AnimeLightingContext';
import { VisualStyleRegistry } from '../src/rendering/profiles/VisualStyleRegistry';
import { PerformanceTargetRegistry } from '../src/rendering/profiles/PerformanceTargetRegistry';
import { AssetAnalyzer } from '../src/assets/derived/AssetAnalyzer';
import { OptimizationPlanner } from '../src/assets/derived/OptimizationPlanner';
import { RenderPipeline } from '../src/rendering/RenderPipeline';
import { register } from '../src/ai/commands/RenderCommands';
import type { CommandMap, CmdCtx } from '../src/ai/commands/BridgeContext';

describe('round 2: material conversion and viewport lighting', () => {
  it('preserves grouped material slots, textures, cutouts, blending and sidedness', () => {
    const hair = new THREE.MeshStandardMaterial({
      name: 'Hair', map: new THREE.Texture(), alphaMap: new THREE.Texture(),
      transparent: true, alphaTest: 0.45, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
    });
    const skin = new THREE.MeshStandardMaterial({ name: 'Skin', color: 0xffccaa, map: new THREE.Texture() });
    const geometry = new THREE.PlaneGeometry();
    geometry.clearGroups();
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const groups = structuredClone(geometry.groups);
    const mesh = new THREE.Mesh(geometry, [hair, skin]);
    mesh.name = 'Face';
    const result = AnimeMaterialFamily.applyToCharacter(mesh);
    expect(result.converted).toBe(2);
    expect(mesh.material).toEqual(result.materials);
    expect(geometry.groups).toEqual(groups);
    const [newHair, newSkin] = result.materials;
    expect(newHair.surfaceMode).toBe('hair');
    expect(newSkin.surfaceMode).toBe('skin');
    expect(newHair.uniforms.uMap.value).toBe(hair.map);
    expect(newSkin.uniforms.uMap.value).toBe(skin.map);
    expect(newHair.uniforms.uAlphaMap.value).toBe(hair.alphaMap);
    expect(newHair).toMatchObject({ transparent: true, alphaTest: 0.45, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    expect(newSkin.color.equals(skin.color)).toBe(true);
    expect(newSkin).toMatchObject({ transparent: false, opacity: 1, depthWrite: true, side: THREE.FrontSide });
  });

  it('refreshes existing materials on draw and isolates viewports sharing the same material', () => {
    const rendererA = {} as THREE.WebGLRenderer;
    const rendererB = {} as THREE.WebGLRenderer;
    const a = new AnimeLightingContext();
    const b = new AnimeLightingContext();
    AnimeLightingContext.bindRenderer(rendererA, a);
    AnimeLightingContext.bindRenderer(rendererB, b);
    a.setSun(new THREE.Vector3(1, 0, 0));
    b.setSun(new THREE.Vector3(0, 1, 0));
    const material = new CelToonMaterial();
    material.onBeforeRender(rendererA);
    expect(material.uniforms.uSunDirection.value.equals(a.sunDirection)).toBe(true);
    a.applyStyle(VisualStyleRegistry.get('mix_anime_warm'));
    material.onBeforeRender(rendererA);
    expect(material.uniforms.uShadowColor.value.equals(a.shadowTint)).toBe(true);
    material.onBeforeRender(rendererB);
    expect(material.uniforms.uSunDirection.value.equals(b.sunDirection)).toBe(true);
    expect(material.uniforms.uShadowColor.value.equals(b.shadowTint)).toBe(true);
    material.onBeforeRender(rendererA);
    expect(material.uniforms.uSunDirection.value.equals(a.sunDirection)).toBe(true);
    expect(material.uniforms.uShadowColor.value.equals(a.shadowTint)).toBe(true);
  });

  it('preserves authored lighting overrides and shared-lighting opt-out', () => {
    const renderer = {} as THREE.WebGLRenderer;
    const ctx = new AnimeLightingContext();
    AnimeLightingContext.bindRenderer(renderer, ctx);
    const material = new CelToonMaterial({ shadowColor: '#123456', rimIntensity: 0.12 });
    const local = new CelToonMaterial({ useSharedLighting: false, shadowColor: '#abcdef' });
    ctx.applyStyle(VisualStyleRegistry.get('mix_anime_dark'));
    material.onBeforeRender(renderer);
    local.onBeforeRender(renderer);
    expect(material.uniforms.uShadowColor.value.getHexString()).toBe('123456');
    expect(material.uniforms.uRimIntensity.value).toBe(0.12);
    expect(local.uniforms.uShadowColor.value.getHexString()).toBe('abcdef');
    material.setLightingOverrides({ rimIntensity: 0.25 });
    ctx.setSun(new THREE.Vector3(0, 0, 1));
    material.onBeforeRender(renderer);
    expect(material.uniforms.uRimIntensity.value).toBe(0.25);
    material.opacity = 0.3;
    material.alphaTest = 0.2;
    material.onBeforeRender(renderer);
    expect(material.uniforms.uOpacity.value).toBe(0.3);
    expect(material.uniforms.uAlphaTest.value).toBe(0.2);
  });
});

describe('round 2: asset metrics and registry isolation', () => {
  it('sums clip durations, including an empty clip set', () => {
    const clips = Array.from({ length: 10 }, (_, i) => new THREE.AnimationClip(`clip-${i}`, 5, []));
    expect(AssetAnalyzer.analyzeAnimation(clips).totalDurationSeconds).toBe(50);
    expect(AssetAnalyzer.analyzeAnimation([]).totalDurationSeconds).toBe(0);
  });

  it('returns finite zero savings when all source costs are explicitly zero', () => {
    const textureMetrics = AssetAnalyzer.analyzeTexture(new THREE.Texture());
    textureMetrics.estimatedGpuMemoryBytes = 0;
    const plan = OptimizationPlanner.planMeshOptimization({
      assetId: 'empty', meshMetrics: AssetAnalyzer.analyzeMesh(new THREE.Group()),
      textureMetrics, animMetrics: AssetAnalyzer.analyzeAnimation([]),
    });
    expect(plan.estimatedResult.estimatedSavingsPct).toBe(0);
    expect(JSON.parse(JSON.stringify(plan)).estimatedResult.estimatedSavingsPct).toBe(0);
  });

  it('isolates nested steps on get, fallback, list and registration', () => {
    const original = PerformanceTargetRegistry.get('ps3_plus_500');
    for (const target of [PerformanceTargetRegistry.get('ps3_plus_500'), PerformanceTargetRegistry.get('missing'),
      PerformanceTargetRegistry.list().find(t => t.id === 'ps3_plus_500')!]) {
      target.qualitySteps[0].scale = 0.01;
      target.qualitySteps[0].disablePasses.push('outlinePass');
      target.qualitySteps.pop();
    }
    expect(PerformanceTargetRegistry.get('ps3_plus_500')).toEqual(original);
    const custom = { ...original, id: 'round2-custom' as any };
    PerformanceTargetRegistry.register(custom);
    const saved = PerformanceTargetRegistry.get(custom.id);
    custom.qualitySteps[0].disablePasses.length = 0;
    const retrieved = PerformanceTargetRegistry.get(custom.id);
    retrieved.qualitySteps[0].scale = 0.1;
    expect(PerformanceTargetRegistry.get(custom.id)).toEqual(saved);
  });
});

describe('round 2: completed-frame metrics', () => {
  function harness(autoReset = true) {
    const info = {
      autoReset, render: { calls: 0, triangles: 0 }, memory: { geometries: 4, textures: 8 },
      reset() { this.render.calls = 0; this.render.triangles = 0; },
    };
    const submit = (calls: number, triangles: number) => {
      if (info.autoReset) info.reset();
      info.render.calls += calls;
      info.render.triangles += triangles;
    };
    const pipeline = Object.assign(Object.create(RenderPipeline.prototype), {
      renderer: { info }, camera: new THREE.PerspectiveCamera(), lastFrameMetrics: null,
      renderGBufferPrepass: () => submit(3, 300),
      composer: { render: () => { submit(900, 90000); submit(1, 2); }, readBuffer: {} },
      upscaler: { render: () => submit(1, 2) },
    }) as RenderPipeline;
    return { pipeline, info };
  }

  it.each([true, false])('accumulates all passes and keeps snapshots after counter resets (autoReset=%s)', autoReset => {
    const { pipeline, info } = harness(autoReset);
    expect(pipeline.getLastFrameMetrics()).toBeNull();
    pipeline.render();
    expect(info.autoReset).toBe(autoReset);
    const metrics = pipeline.getLastFrameMetrics()!;
    expect(metrics).toEqual({ drawCalls: 905, triangles: 90304, geometries: 4, textures: 8 });
    info.reset();
    metrics.drawCalls = -1;
    expect(pipeline.getLastFrameMetrics()!.drawCalls).toBe(905);
    pipeline.render();
    expect(pipeline.getLastFrameMetrics()!.drawCalls).toBe(905);
    vi.spyOn(pipeline.composer, 'render').mockImplementation(() => { throw new Error('render failed'); });
    expect(() => pipeline.render()).toThrow('render failed');
    expect(info.autoReset).toBe(autoReset);
    expect(pipeline.getLastFrameMetrics()!.drawCalls).toBe(905);
  });

  it('uses completed snapshots in both commands and reports missing samples honestly', () => {
    const { pipeline, info } = harness();
    const setQueryResult = vi.fn();
    const map: CommandMap = new Map();
    register(map, {
      viewport: {
        pipeline, renderer: { info },
        getRenderResolution: () => ({ internalWidth: 960, internalHeight: 540, outputWidth: 1600, outputHeight: 900 }),
        getResolutionSettings: () => ({ fsrEnabled: true, fsrSharpness: 0.35 }),
      }, setQueryResult,
    } as unknown as CmdCtx);
    for (const type of ['render_budget_report', 'render_explain'] as const) {
      map.get(type)!({ type });
      expect(setQueryResult.mock.lastCall![0]).toMatchObject({ ok: false });
    }
    pipeline.render();
    info.reset();
    map.get('render_budget_report')!({ type: 'render_budget_report' });
    expect(setQueryResult.mock.lastCall![0].report.stats.drawCalls).toBe(905);
    map.get('render_explain')!({ type: 'render_explain' });
    expect(setQueryResult.mock.lastCall![0].explanation).toContain('905');
  });
});
