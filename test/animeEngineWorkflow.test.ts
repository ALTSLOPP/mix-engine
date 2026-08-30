import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { VisualStyleRegistry } from '../src/rendering/profiles/VisualStyleRegistry';
import { PerformanceTargetRegistry } from '../src/rendering/profiles/PerformanceTargetRegistry';
import { AnimeTonemappingPass } from '../src/rendering/anime/AnimeTonemappingPass';
import { CelToonMaterial } from '../src/materials/CelToonMaterial';
import { AnimeMaterialFamily } from '../src/materials/AnimeMaterialFamily';
import { AtmosphericDepthPass } from '../src/rendering/anime/AtmosphericDepthPass';
import { PerformanceExplainer } from '../src/rendering/PerformanceExplainer';
import { DerivedAssetPipeline } from '../src/assets/derived/DerivedAssetPipeline';
import { DerivedVariantCache } from '../src/assets/derived/DerivedVariantCache';
import { RuntimeVariantResolver } from '../src/assets/derived/RuntimeVariantResolver';
import { AnimationOptimizer, AnimationLodManager } from '../src/assets/derived/AnimationOptimizer';
import { LODSystem } from '../src/rendering/LODSystem';
import { QualityScaler } from '../src/rendering/QualityScaler';
import { validateProjectRenderPolicy, type ProjectRenderPolicy } from '../src/rendering/profiles/ProjectRenderPolicy';

describe('Anime Engine Complete Workflow & Honesty', () => {
  beforeEach(() => {
    DerivedVariantCache.reset();
    DerivedAssetPipeline.reset();
  });

  describe('Registries and Policy Validation (Issues 2, 3, 4, 37)', () => {
    it('provides extensible typing, has(), require(), and suggestions for typos', () => {
      expect(VisualStyleRegistry.has('mix_anime_shonen')).toBe(true);
      expect(VisualStyleRegistry.has('invalid_style')).toBe(false);
      expect(() => VisualStyleRegistry.require('invalid_style')).toThrow(/Unknown visual style/);

      const styleSuggestions = VisualStyleRegistry.getSuggestions('mix_anime_shon');
      expect(styleSuggestions).toContain('mix_anime_shonen');

      expect(PerformanceTargetRegistry.has('ps3_plus_500')).toBe(true);
      expect(PerformanceTargetRegistry.has('ps3_500')).toBe(false);
      expect(() => PerformanceTargetRegistry.require('ps3_500')).toThrow(/Unknown performance target/);

      const targetSuggestions = PerformanceTargetRegistry.getSuggestions('ps3_500');
      expect(targetSuggestions).toContain('ps3_plus_500');
    });

    it('strictly validates policy profiles against registries', () => {
      const validPolicy: Partial<ProjectRenderPolicy> = {
        visualStyle: 'mix_anime_shonen',
        performanceTarget: 'ps3_plus_500',
      };
      expect(validateProjectRenderPolicy(validPolicy)).toBe(true);

      const invalidPolicy: Partial<ProjectRenderPolicy> = {
        visualStyle: 'nonexistent_style',
        performanceTarget: 'ps3_plus_500',
      };
      expect(() => validateProjectRenderPolicy(invalidPolicy)).toThrow(/Invalid visualStyle/);
    });
  });

  describe('MIX Anime Tonemapper / Output Transform (Issue 5)', () => {
    it('configures selectable tone curves (mix_anime, aces, neutral) with sRGB output', () => {
      const pass = new AnimeTonemappingPass('mix_anime');
      expect(pass.getColorTransform()).toBe('mix_anime');
      expect(pass.uniforms.uMode.value).toBe(1);

      pass.setColorTransform('aces');
      expect(pass.getColorTransform()).toBe('aces');
      expect(pass.uniforms.uMode.value).toBe(0);

      pass.setColorTransform('neutral');
      expect(pass.getColorTransform()).toBe('neutral');
      expect(pass.uniforms.uMode.value).toBe(2);

      pass.setExposure(1.2);
      expect(pass.uniforms.uExposure.value).toBe(1.2);
    });
  });

  describe('CelToonMaterial & Anime Material Family (Issues 21, 22, 24, 25, 26, 27, 30)', () => {
    it('connects all shader uniforms including metalness, eye readability and fog', () => {
      const mat = new CelToonMaterial({
        surface: 'stylized_metal',
        metalness: 0.8,
        shadowStrength: 0.7,
        eyeCatchlightStrength: 1.0,
        eyeReadabilityBoost: 0.5,
      });

      expect(mat.metalness).toBe(0.8);
      expect(mat.uniforms.uMetalness.value).toBe(0.8);
      expect(mat.uniforms.uShadowStrength.value).toBe(0.7);
      expect(mat.uniforms.uEyeCatchlightStrength.value).toBe(1.0);
      expect(mat.uniforms.uEyeReadabilityBoost.value).toBe(0.5);
      expect(mat.fog).toBe(true);
    });

    it('applies to character and allows safe, idempotent reversion', () => {
      const root = new THREE.Group();
      const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
      mesh1.name = 'Body_mesh';
      const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x00ff00 }));
      mesh2.name = 'Hair_mesh';
      root.add(mesh1, mesh2);

      const originalMat1 = mesh1.material;
      const originalMat2 = mesh2.material;

      // First conversion
      const res1 = AnimeMaterialFamily.applyToCharacter(root);
      expect(res1.converted).toBe(2);
      expect(mesh1.material).toBeInstanceOf(CelToonMaterial);
      expect(mesh2.material).toBeInstanceOf(CelToonMaterial);

      // Reversion
      const revertRes = AnimeMaterialFamily.revertCharacter(root);
      expect(revertRes.reverted).toBe(2);
      expect(mesh1.material).toBe(originalMat1);
      expect(mesh2.material).toBe(originalMat2);
    });
  });

  describe('Atmospheric Depth Pass Height Attenuation (Issue 25)', () => {
    it('configures vertical height attenuation and foreground tint', () => {
      const pass = new AtmosphericDepthPass();
      pass.setHeightFalloff(0.05, 5.0);
      expect(pass.uniforms.heightFalloff.value).toBe(0.05);
      expect(pass.uniforms.heightBase.value).toBe(5.0);

      pass.setForegroundTint('#ffffff', 0.1);
      expect(pass.uniforms.foregroundStrength.value).toBe(0.1);
    });
  });

  describe('Performance Explainer & Diagnostic Honesty (Issues 1, 34, 35, 36)', () => {
    it('rejects absent frame timing with FRAME_TIMING_UNAVAILABLE', () => {
      expect(() => {
        PerformanceExplainer.explain({ drawCalls: 100 }, 60);
      }).toThrow(/FRAME_TIMING_UNAVAILABLE/);
    });

    it('decouples frameHealth from budgetRisk and analyzes submittedTriangles', () => {
      // 60 FPS but over draw call budget -> Good health, High risk
      const report = PerformanceExplainer.explain({
        fps: 60,
        drawCalls: 1500,
        submittedTriangles: 1200000,
        visibleTriangles: 400000,
        shadowCasters: 4,
      }, 60);

      expect(report.frameHealth).toBe('GOOD');
      expect(report.budgetRisk).toBe('HIGH');
      expect(report.largestCosts.some(c => c.toLowerCase().includes('draw calls'))).toBe(true);
    });
  });

  describe('Derived Asset Pipeline & Runtime Variant Resolver (Issues 10, 11, 12, 13, 14, 17, 18, 31, 32)', () => {
    it('runs end-to-end pipeline for mesh and caches derived variant', () => {
      const pipeline = DerivedAssetPipeline.get();
      const group = new THREE.Group();
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,1,0]), 3));
      geom.setIndex([0, 1, 2]);
      const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
      group.add(mesh);

      const result = pipeline.process('hero_character_1', group, 'ps3_plus_500', {
        category: 'hero_character',
        importance: 'hero',
      });

      expect(result.ok).toBe(true);
      expect(result.cached).toBe(true);
      expect(pipeline.cache.has(result.variantKey)).toBe(true);
    });

    it('bypasses cache lookup on source pinning (Issue 13)', () => {
      const resolver = new RuntimeVariantResolver();
      const dummySource = { id: 'original_model' };

      // Pin to source
      resolver.pinVariant('my_asset', 'source');
      expect(resolver.getPinnedVariant('my_asset')).toBe('source');

      const resolved = resolver.resolve({
        assetId: 'my_asset',
        sourceData: dummySource,
        sourceHash: 'hash123',
        targetProfile: 'ps3_plus_500',
      });

      expect(resolved.data).toBe(dummySource);
      expect(resolved.variantKey).toBe('source');
      expect(resolved.isDerived).toBe(false);
      expect(resolved.sourceFallback).toBe(false);

      // Unpin
      resolver.unpinVariant('my_asset');
      expect(resolver.getPinnedVariant('my_asset')).toBeUndefined();
    });

    it('optimizes animation clips with constant track pruning (Issue 19)', () => {
      const constantTrack = new THREE.VectorKeyframeTrack('bone.position', [0, 1, 2], [1, 1, 1, 1, 1, 1, 1, 1, 1]);
      const animatedTrack = new THREE.QuaternionKeyframeTrack('bone.quaternion', [0, 1, 2], [0, 0, 0, 1, 0, 0.707, 0, 0.707, 0, 1, 0, 0]);
      const clip = new THREE.AnimationClip('Walk', 2.0, [constantTrack, animatedTrack]);

      const optClip = AnimationOptimizer.optimizeClip(clip, {
        pruneConstantTracks: true,
        quaternionToleranceRad: 0.002,
      });

      expect(optClip.tracks.length).toBe(1);
      expect(optClip.tracks[0].name).toBe('bone.quaternion');
    });

    it('Hz-based AnimationLodManager accumulates elapsed time (Issue 20)', () => {
      const manager = new AnimationLodManager();
      const root = new THREE.Group();
      root.position.set(0, 0, 50); // Background (>45m -> 15Hz = ~66.6ms)
      const mixer = new THREE.AnimationMixer(root);
      manager.register({ id: 'npc_1', mixer, rootObject: root });

      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 0, 0);

      // Frame 1: 16ms -> below 66.6ms threshold
      manager.update(camera, 0.016);
      expect(manager.getPendingElapsed('npc_1')).toBeCloseTo(0.016, 3);

      // Frame 2: 16ms -> accumulated 32ms
      manager.update(camera, 0.016);
      expect(manager.getPendingElapsed('npc_1')).toBeCloseTo(0.032, 3);

      // Frame 3: 40ms -> accumulated 72ms > 66.6ms -> mixer updated, accumulator reset
      manager.update(camera, 0.040);
      expect(manager.getPendingElapsed('npc_1')).toBe(0);
    });
  });

  describe('Subsystem LOD & Scaler Biasing (Issues 6, 7, 8, 9, 23, 33)', () => {
    it('LODSystem supports distance bias', () => {
      const camera = new THREE.PerspectiveCamera();
      const lod = new LODSystem(camera);
      expect(lod.getDistanceBias()).toBe(1.0);
      lod.setDistanceBias(1.5);
      expect(lod.getDistanceBias()).toBe(1.5);
    });

    it('QualityScaler applies degradation across LOD, Animation LOD and particles', () => {
      const camera = new THREE.PerspectiveCamera();
      const lod = new LODSystem(camera);
      const animLod = new AnimationLodManager();
      let particleDensity = 1.0;

      const scaler = new QualityScaler({} as any, null, {
        lodSystem: lod,
        animationLodManager: animLod,
        onParticleDensityChange: (d) => { particleDensity = d; },
      });

      scaler.setQualitySteps([
        { scale: 1.0, disablePasses: [], shadows: true, lodBias: 1.0, animationLodBias: 1.0, particleDensity: 1.0 },
        { scale: 0.75, disablePasses: ['ssrPass'], shadows: true, lodBias: 1.4, animationLodBias: 1.5, particleDensity: 0.7 },
      ]);

      scaler.setLevel(1);
      expect(lod.getDistanceBias()).toBe(1.4);
      expect(animLod.getAnimationLodBias()).toBe(1.5);
      expect(particleDensity).toBe(0.7);
    });
  });
});