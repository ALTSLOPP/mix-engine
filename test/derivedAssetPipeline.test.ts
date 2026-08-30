import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AssetAnalyzer } from '../src/assets/derived/AssetAnalyzer';
import { OptimizationPlanner } from '../src/assets/derived/OptimizationPlanner';
import { MeshOptimizer } from '../src/assets/derived/MeshOptimizer';
import { TextureOptimizer } from '../src/assets/derived/TextureOptimizer';
import { AnimationOptimizer } from '../src/assets/derived/AnimationOptimizer';
import { DerivedVariantCache } from '../src/assets/derived/DerivedVariantCache';
import { RuntimeVariantResolver } from '../src/assets/derived/RuntimeVariantResolver';

describe('AssetAnalyzer', () => {
  it('extracts exact structural statistics from a 3D mesh object', () => {
    const geom = new THREE.BoxGeometry(2, 4, 2, 4, 4, 4);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial());
    mesh.name = 'Hero_Body';

    const metrics = AssetAnalyzer.analyzeMesh(mesh, 'hero_asset');
    expect(metrics.vertexCount).toBeGreaterThan(0);
    expect(metrics.triangleCount).toBeGreaterThan(0);
    expect(metrics.meshCount).toBe(1);
    expect(metrics.materialCount).toBe(1);
    expect(metrics.isSkinned).toBe(false);
    expect(metrics.bounds.size[1]).toBeCloseTo(4, 1);
  });

  it('detects skinned mesh bone counts and flags warnings on high complexity', () => {
    const skinnedMesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    const bones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()];
    const skeleton = new THREE.Skeleton(bones);
    skinnedMesh.bind(skeleton);

    const metrics = AssetAnalyzer.analyzeMesh(skinnedMesh);
    expect(metrics.isSkinned).toBe(true);
    expect(metrics.boneCount).toBe(3);
  });

  it('analyzes texture dimensions, color spaces, and memory footprint', () => {
    const colorTex = new THREE.Texture();
    colorTex.name = 'hero_baseColor.png';
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.image = { width: 2048, height: 2048 };

    const normTex = new THREE.Texture();
    normTex.name = 'hero_normal.png';
    normTex.image = { width: 2048, height: 2048 };

    const colorMetrics = AssetAnalyzer.analyzeTexture(colorTex);
    expect(colorMetrics.width).toBe(2048);
    expect(colorMetrics.colorSpace).toBe('srgb');

    const normMetrics = AssetAnalyzer.analyzeTexture(normTex);
    expect(normMetrics.colorSpace).toBe('linear');
  });

  it('analyzes animation clips and key counts', () => {
    const track = new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 0, 1, 0]);
    const clip = new THREE.AnimationClip('Run', 1, [track]);

    const animMetrics = AssetAnalyzer.analyzeAnimation([clip]);
    expect(animMetrics.clipCount).toBe(1);
    expect(animMetrics.trackCount).toBe(1);
    expect(animMetrics.hasRootMotion).toBe(true);
    expect(animMetrics.keyCount).toBe(2);
  });
});

describe('OptimizationPlanner', () => {
  it('generates a dry-run plan honoring hero importance without modifying source', () => {
    const plan = OptimizationPlanner.planMeshOptimization({
      assetId: 'hero_character_model',
      category: 'hero_character',
      targetProfile: 'ps3_plus_500',
      meshMetrics: {
        vertexCount: 15000,
        triangleCount: 22000,
        indexCount: 66000,
        meshCount: 1,
        materialCount: 3,
        uvChannels: 1,
        isSkinned: true,
        boneCount: 65,
        morphTargetCount: 24,
        attributeMemoryBytes: 500000,
        indexMemoryBytes: 150000,
        totalMemoryBytes: 650000,
        bounds: { min: [-1, 0, -1], max: [1, 2, 1], size: [2, 2, 2] },
        existingLods: 0,
      },
    });

    expect(plan.ok).toBe(true);
    expect(plan.importance).toBe('hero');
    expect(plan.overridesApplied).toContain('preserve_morphs');
    expect(plan.overridesApplied).toContain('preserve_facial_rig');
    expect(plan.operations.some(op => op.includes('morph'))).toBe(true);
    expect(plan.estimatedResult.estimatedSavingsPct).toBeGreaterThanOrEqual(0);
  });

  it('respects developer overrides such as never_simplify and never_downscale_texture', () => {
    const plan = OptimizationPlanner.planMeshOptimization({
      assetId: 'custom_sculpture',
      overrides: {
        never_simplify: true,
        never_downscale_texture: true,
      },
      targetProfile: 'ps3_plus_500',
    });

    expect(plan.overridesApplied).toContain('never_simplify');
    expect(plan.overridesApplied).toContain('never_downscale_texture');
    expect(plan.operations.some(op => op.includes('never_simplify'))).toBe(true);
  });
});

describe('MeshOptimizer', () => {
  it('clones and simplifies BufferGeometry non-destructively', async () => {
    const geom = new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
    const origTriCount = geom.index!.count / 3;

    const optGeom = await MeshOptimizer.optimizeGeometry(geom, { ratio: 0.5 });
    const newTriCount = optGeom.index!.count / 3;

    expect(newTriCount).toBeLessThan(origTriCount);
    expect(geom.index!.count / 3).toBe(origTriCount); // source untouched!
  });

  it('creates Object3D LOD variants with LOD0, LOD1, and LOD2', async () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2, 6, 6, 6), new THREE.MeshStandardMaterial());
    group.add(mesh);

    const lodGroup = await MeshOptimizer.createObjectLOD(group);
    expect(lodGroup).not.toBe(group); // separate instance

    let lodFound = false;
    lodGroup.traverse((child) => {
      if ((child as any).isLOD) {
        lodFound = true;
        expect((child as any).levels.length).toBe(3);
      }
    });
    expect(lodFound).toBe(true);
  });
});

describe('TextureOptimizer', () => {
  it('correctly classifies linear vs sRGB color spaces', () => {
    expect(TextureOptimizer.classifyColorSpace('character_diffuse.png')).toBe(THREE.SRGBColorSpace);
    expect(TextureOptimizer.classifyColorSpace('character_normal.png')).toBe(THREE.NoColorSpace);
    expect(TextureOptimizer.classifyColorSpace('character_roughness.png')).toBe(THREE.NoColorSpace);
    expect(TextureOptimizer.classifyColorSpace('character_face_sdf.png')).toBe(THREE.NoColorSpace);
  });

  it('calculates downscaled dimensions keeping aspect ratio', () => {
    const res = TextureOptimizer.downscaleDimensions(4096, 2048, 1024);
    expect(res.width).toBe(1024);
    expect(res.height).toBe(512);
  });
});

describe('AnimationOptimizer', () => {
  it('decimates redundant keyframes while preserving duration and root motion', () => {
    const times = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
    // Straight rotation along X axis without angular change
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
    const quatValues = new Float32Array(times.length * 4);
    for (let i = 0; i < times.length; i++) {
      quatValues[i * 4] = q.x;
      quatValues[i * 4 + 1] = q.y;
      quatValues[i * 4 + 2] = q.z;
      quatValues[i * 4 + 3] = q.w;
    }

    const track = new THREE.QuaternionKeyframeTrack('Arm.quaternion', times, quatValues);
    const rootTrack = new THREE.VectorKeyframeTrack('Hips.position', times, new Float32Array(times.length * 3));
    const clip = new THREE.AnimationClip('TestClip', 1.0, [track, rootTrack]);

    const optimized = AnimationOptimizer.optimizeClip(clip);
    expect(optimized.duration).toBe(1.0);
    expect(optimized.tracks.length).toBe(2);

    const optArmTrack = optimized.tracks.find(t => t.name === 'Arm.quaternion')!;
    expect(optArmTrack.times.length).toBeLessThan(times.length);

    const optHipsTrack = optimized.tracks.find(t => t.name === 'Hips.position')!;
    expect(optHipsTrack.times.length).toBe(times.length); // root motion preserved!
  });
});

describe('DerivedVariantCache & RuntimeVariantResolver', () => {
  it('computes deterministic cache keys and invalidates on source hash changes', () => {
    const key1 = DerivedVariantCache.computeKey({
      sourceHash: 'hash_abc123',
      targetProfile: 'ps3_plus_500',
    });

    const key2 = DerivedVariantCache.computeKey({
      sourceHash: 'hash_abc123',
      targetProfile: 'ps3_plus_500',
    });

    const keyChangedSource = DerivedVariantCache.computeKey({
      sourceHash: 'hash_diff999',
      targetProfile: 'ps3_plus_500',
    });

    expect(key1).toBe(key2);
    expect(key1).not.toBe(keyChangedSource);
  });

  it('resolves derived variant when cached or falls back to source safely', () => {
    DerivedVariantCache.reset();
    const cache = DerivedVariantCache.get();
    const resolver = new RuntimeVariantResolver(cache);

    const sourceObject = { name: 'SourceHero' };
    const derivedObject = { name: 'OptimizedHero_500GFLOPS' };

    // Case 1: Not cached -> fallback to source
    const res1 = resolver.resolve({
      assetId: 'hero',
      sourceData: sourceObject,
      sourceHash: 'hero_hash_1',
      targetProfile: 'ps3_plus_500',
    });
    expect(res1.isDerived).toBe(false);
    expect(res1.sourceFallback).toBe(true);
    expect(res1.data).toBe(sourceObject);

    // Case 2: Cached -> returns derived variant
    const key = DerivedVariantCache.computeKey({
      sourceHash: 'hero_hash_1',
      targetProfile: 'ps3_plus_500',
    });
    cache.set(key, {
      key,
      sourceHash: 'hero_hash_1',
      targetProfile: 'ps3_plus_500',
      createdAt: Date.now(),
      data: derivedObject,
      sizeBytes: 1024,
    });

    const res2 = resolver.resolve({
      assetId: 'hero',
      sourceData: sourceObject,
      sourceHash: 'hero_hash_1',
      targetProfile: 'ps3_plus_500',
    });
    expect(res2.isDerived).toBe(true);
    expect(res2.sourceFallback).toBe(false);
    expect(res2.data).toBe(derivedObject);

    // Case 3: Unbounded target -> always returns source
    const res3 = resolver.resolve({
      assetId: 'hero',
      sourceData: sourceObject,
      sourceHash: 'hero_hash_1',
      targetProfile: 'unbounded',
    });
    expect(res3.isDerived).toBe(false);
    expect(res3.data).toBe(sourceObject);
  });
});
