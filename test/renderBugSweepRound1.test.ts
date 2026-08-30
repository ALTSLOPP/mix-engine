import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MeshOptimizer } from '../src/assets/derived/MeshOptimizer';
import { TextureOptimizer } from '../src/assets/derived/TextureOptimizer';
import { AnimationOptimizer, AnimationLodManager } from '../src/assets/derived/AnimationOptimizer';
import { AssetAnalyzer } from '../src/assets/derived/AssetAnalyzer';
import { DerivedVariantCache } from '../src/assets/derived/DerivedVariantCache';
import { RuntimeVariantResolver } from '../src/assets/derived/RuntimeVariantResolver';
import { QualityScaler } from '../src/rendering/QualityScaler';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('safe mesh simplification and animated LODs', () => {
  function edgeCounts(geometry: THREE.BufferGeometry): number[] {
    const pos = geometry.getAttribute('position');
    const key = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map(n => n.toFixed(6)).join(',');
    const edges = new Map<string, number>();
    const count = geometry.index?.count ?? pos.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map(j => key(geometry.index?.getX(i + j) ?? i + j));
      for (let j = 0; j < 3; j++) {
        const edge = [vertices[j], vertices[(j + 1) % 3]].sort().join('|');
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
    return [...edges.values()];
  }

  it.each([false, true])('reduces a closed mesh without punching holes (non-indexed=%s)', async nonIndexed => {
    const box = new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
    const source = nonIndexed ? box.toNonIndexed() : box;
    const originalCount = source.index?.count ?? source.getAttribute('position').count;
    const result = await MeshOptimizer.optimizeGeometry(source, { ratio: 0.5 });
    expect(result.index!.count).toBeLessThan(originalCount);
    expect(edgeCounts(result).every(n => n === 2)).toBe(true);
    expect(source.index?.count ?? source.getAttribute('position').count).toBe(originalCount);
    expect(result.groups.map(g => g.materialIndex)).toEqual(source.groups.map(g => g.materialIndex));
    expect(result.groups.reduce((n, g) => n + g.count, 0)).toBe(result.index!.count);
  });

  it('preserves skin and morph attribute indexing while simplifying', async () => {
    const source = new THREE.PlaneGeometry(2, 2, 10, 10);
    const count = source.getAttribute('position').count;
    source.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    source.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: count * 4 }, (_, i) => i % 4 === 0 ? 1 : 0), 4));
    source.morphAttributes.position = [source.getAttribute('position').clone()];
    const result = await MeshOptimizer.optimizeGeometry(source, { ratio: 0.5 });
    expect(result.index!.count).toBeLessThan(source.index!.count);
    for (const name of ['position', 'skinIndex', 'skinWeight']) {
      expect(result.getAttribute(name).array).toEqual(source.getAttribute(name).array);
    }
    expect(result.morphAttributes.position[0].array).toEqual(source.morphAttributes.position[0].array);
  });

  it('does not mutate a partial draw range into a different rendered surface', async () => {
    const source = new THREE.PlaneGeometry(2, 2, 4, 4);
    source.setDrawRange(3, 12);
    const result = await MeshOptimizer.optimizeGeometry(source, { ratio: 0.5 });
    expect(result.index!.array).toEqual(source.index!.array);
    expect(result.drawRange).toEqual(source.drawRange);
    expect(result.userData.simplificationSkipped).toBeTruthy();
    expect(source.userData.simplificationSkipped).toBeUndefined();
  });

  it('clones one independent rig and drives every LOD with bone, transform and morph animation', async () => {
    const root = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(2, 2, 4, 4);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: count * 4 }, (_, i) => i % 4 === 0 ? 1 : 0), 4));
    geometry.morphAttributes.position = [geometry.getAttribute('position').clone()];
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = 'Body';
    const bone = new THREE.Bone();
    bone.name = 'Head';
    mesh.add(bone);
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([bone]));
    // A sibling exercises the previous traversal-mutation bug as well.
    const prop = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    prop.name = 'Prop';
    root.add(prop);
    const derived = await MeshOptimizer.createObjectLOD(root);
    const lod = derived.getObjectByName('Body_LOD') as THREE.LOD;
    expect((derived.getObjectByName('Prop_LOD') as THREE.LOD).levels).toHaveLength(3);
    const newBone = derived.getObjectByName('Head') as THREE.Bone;
    expect(newBone).not.toBe(bone);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const clip = new THREE.AnimationClip('pose', 1, [
      new THREE.QuaternionKeyframeTrack('Head.quaternion', [0, 1], [0, 0, 0, 1, ...q.toArray()]),
      new THREE.VectorKeyframeTrack('Body.position', [0, 1], [0, 0, 0, 2, 0, 0]),
      new THREE.NumberKeyframeTrack('Body.morphTargetInfluences[0]', [0, 1], [0, 1]),
    ]);
    const mixer = new THREE.AnimationMixer(derived);
    mixer.clipAction(clip).play();
    mixer.update(0.5);
    derived.updateMatrixWorld(true);
    for (const { object } of lod.levels) {
      const level = object as THREE.SkinnedMesh;
      expect(level.skeleton.bones[0]).toBe(newBone);
      expect(level.morphTargetInfluences![0]).toBeCloseTo(0.5);
      expect(level.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(1);
      const point = level.applyBoneTransform(0, new THREE.Vector3(1, 0, 0));
      expect(point.x).toBeCloseTo(Math.SQRT1_2);
      expect(point.y).toBeCloseTo(Math.SQRT1_2);
    }
    expect(bone.quaternion.equals(new THREE.Quaternion())).toBe(true);
    expect(mesh.position.x).toBe(0);
    expect(mesh.morphTargetInfluences![0]).toBe(0);
  });

  it('wraps a mesh that is itself the source root', async () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    source.position.set(3, 4, 5);
    const derived = await MeshOptimizer.createObjectLOD(source);
    expect(derived.children.find(child => (child as THREE.LOD).isLOD)).toBeTruthy();
    expect(derived.position.equals(source.position)).toBe(true);
    expect(source.children).toHaveLength(0);
  });
});

describe('hierarchy bounds and real texture dimensions', () => {
  it('includes parent transforms, rotations, offsets and scale in bounds', () => {
    const parent = new THREE.Group();
    parent.position.set(100, 0, 0);
    const root = new THREE.Group();
    root.rotation.z = Math.PI / 2;
    const part = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
    part.position.x = 10;
    part.scale.x = 2;
    parent.add(root);
    root.add(part);
    const bounds = AssetAnalyzer.analyzeMesh(root).bounds;
    expect(bounds.min[0]).toBeCloseTo(98);
    expect(bounds.max[0]).toBeCloseTo(102);
    expect(bounds.min[1]).toBeCloseTo(8);
    expect(bounds.max[1]).toBeCloseTo(12);
    expect(AssetAnalyzer.analyzeMesh(new THREE.Group()).bounds.size).toEqual([0, 0, 0]);
  });

  it('creates a smaller independent DataTexture pixel buffer without mutating the source', () => {
    const data = new Uint8Array(8 * 4 * 4).fill(120);
    const source = new THREE.DataTexture(data, 8, 4);
    const originalSource = source.source;
    source.mipmaps = [{ data, width: 8, height: 4 }];
    const derived = TextureOptimizer.optimizeTexture(source, { maxDimension: 4, semanticHint: 'normal' });
    expect(derived.source).not.toBe(source.source);
    expect(derived.image.width).toBe(4);
    expect(derived.image.height).toBe(2);
    expect(derived.image.data.byteLength).toBe(data.byteLength / 4);
    expect([...derived.image.data]).toEqual(new Array(32).fill(120));
    expect(derived.colorSpace).toBe(THREE.NoColorSpace);
    expect(derived.mipmaps).toHaveLength(0);
    expect(source.source).toBe(originalSource);
    expect(source.image.width).toBe(8);
    expect(source.image.data).toBe(data);
    expect(source.mipmaps).toHaveLength(1);
  });

  it('uses a separate canvas for decoded image textures', () => {
    const drawImage = vi.fn();
    class Canvas {
      constructor(public width: number, public height: number) {}
      getContext() { return { drawImage }; }
    }
    vi.stubGlobal('OffscreenCanvas', Canvas);
    const image = { width: 8, height: 4 };
    const texture = new THREE.Texture(image);
    const derived = TextureOptimizer.optimizeTexture(texture, { maxDimension: 4 });
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 4, 2);
    expect(derived.image).toBeInstanceOf(Canvas);
    expect(texture.image).toBe(image);
  });

  it('reports actual dimensions when resampling is unsupported', () => {
    const source = new THREE.DepthTexture(8, 4);
    const derived = TextureOptimizer.optimizeTexture(source, { maxDimension: 4 });
    expect(derived.userData.derivedResolution).toEqual({ width: 8, height: 4 });
    expect(derived.userData.requestedResolution).toEqual({ width: 4, height: 2 });
    expect(derived.userData.optimizationSkipped).toBeTruthy();
  });
});

describe('error-bounded animation and elapsed LOD time', () => {
  it('bounds quaternion and vector error over all skipped keys', () => {
    const times = Array.from({ length: 80 }, (_, i) => i / 80);
    const axis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.QuaternionKeyframeTrack('Arm.quaternion', times,
      times.flatMap((_, i) => new THREE.Quaternion().setFromAxisAngle(axis, 0.0002 * i * i).toArray()));
    const vector = new THREE.VectorKeyframeTrack('Hand.position', times, times.flatMap((t, i) => [t, 0.0002 * i * i, 0]));
    const clip = new THREE.AnimationClip('turn', 1, [quaternion, vector], THREE.AdditiveAnimationBlendMode);
    const optimized = AnimationOptimizer.optimizeClip(clip, { quaternionToleranceRad: 0.002, translationTolerance: 0.001 });
    const qi = optimized.tracks[0].createInterpolant();
    const vi = optimized.tracks[1].createInterpolant();
    for (let i = 0; i < times.length; i++) {
      const expectedQ = new THREE.Quaternion().fromArray(quaternion.values, i * 4).normalize();
      const actualQ = new THREE.Quaternion().fromArray(qi.evaluate(quaternion.times[i])).normalize();
      expect(expectedQ.angleTo(actualQ)).toBeLessThanOrEqual(0.002001);
      const expectedV = new THREE.Vector3().fromArray(vector.values, i * 3);
      expect(expectedV.distanceTo(new THREE.Vector3().fromArray(vi.evaluate(vector.times[i])))).toBeLessThanOrEqual(0.001001);
    }
    expect(optimized.tracks[0].times.length).toBeLessThan(times.length);
    expect(optimized.blendMode).toBe(clip.blendMode);
    expect(clip.tracks[0].times.length).toBe(times.length);
  });

  it('leaves discrete and smooth interpolation intact', () => {
    for (const interpolation of [THREE.InterpolateDiscrete, THREE.InterpolateSmooth]) {
      const track = new THREE.VectorKeyframeTrack('Hand.position', [0, 1, 2, 3], [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0], interpolation);
      const result = AnimationOptimizer.optimizeClip(new THREE.AnimationClip('curve', 3, [track]));
      expect(result.tracks[0].times).toEqual(track.times);
      expect(result.tracks[0].getInterpolation()).toBe(interpolation);
    }
  });

  it('accumulates real delta time across skipped frames and distance changes', () => {
    const manager = new AnimationLodManager();
    const camera = new THREE.PerspectiveCamera();
    const root = new THREE.Group();
    root.position.z = 50;
    const mixer = new THREE.AnimationMixer(root);
    manager.register({ id: 'npc', rootObject: root, mixer });
    for (const dt of [0.01, 0.03, 0.02, 0.04]) manager.update(camera, dt);
    expect(mixer.time).toBeCloseTo(0.1);
    manager.update(camera, 0.01);
    root.position.z = 0;
    manager.update(camera, 0.03);
    expect(mixer.time).toBeCloseTo(0.14);
    manager.unregister('npc');
    manager.update(camera, 1);
    expect(mixer.time).toBeCloseTo(0.14);
  });
});

describe('cache identity and bounded retention', () => {
  it('canonicalizes nested settings while retaining array ordering', () => {
    const key = (settings: Record<string, unknown>) => DerivedVariantCache.computeKey({ sourceHash: 'asset', targetProfile: 'balanced', settings });
    expect(key({ ratio: 0.5, flags: { morph: true, skin: true } })).toBe(key({ flags: { skin: true, morph: true }, ratio: 0.5 }));
    expect(key({ order: [1, 2] })).not.toBe(key({ order: [2, 1] }));
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => key(cyclic)).toThrow('cyclic');
  });

  it('evicts least-recently-used entries, protects accounting and falls back after eviction', () => {
    const cache = new DerivedVariantCache({ maxBytes: 20, maxEntries: 2 });
    const put = (key: string, sizeBytes = 10) => cache.set(key, { key, sizeBytes, data: { key }, sourceHash: key, targetProfile: 'balanced', createdAt: 0 });
    put('a'); put('b');
    cache.get('a')!.sizeBytes = 9999;
    put('c');
    expect(cache.listKeys()).toEqual(['a', 'c']);
    expect(cache.getTotalSizeBytes()).toBe(20);
    expect(put('oversize', 21)).toBe(false);
    expect(cache.size()).toBe(2);
    put('a', 5);
    expect(cache.getTotalSizeBytes()).toBe(15);
    const resolver = new RuntimeVariantResolver(cache);
    resolver.pinVariant('model', 'b');
    const source = { key: 'source' };
    expect(resolver.resolve({ assetId: 'model', sourceData: source, sourceHash: 'b', targetProfile: 'balanced' }).data).toBe(source);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.getTotalSizeBytes()).toBe(0);
  });

  it('bounds zero-byte metadata entries by count and never disposes borrowed active assets', () => {
    const cache = new DerivedVariantCache({ maxEntries: 1 });
    const dispose = vi.fn();
    const data = { dispose };
    for (const key of ['a', 'b']) cache.set(key, { key, sizeBytes: 0, data, sourceHash: key, targetProfile: 'balanced', createdAt: 0 });
    expect(cache.listKeys()).toEqual(['b']);
    expect(dispose).not.toHaveBeenCalled();
  });
});

describe('quality-scaler timing and re-enable verification', () => {
  it('enforces the same cooldown for supplied FPS telemetry', () => {
    let now = 2000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const scaler = new QualityScaler({ targetFps: 60, cooldown: 1.5 });
    scaler.update(0.016, 20);
    expect(scaler.level).toBe(1);
    now = 2016;
    scaler.update(0.016, 100);
    expect(scaler.level).toBe(1);
    now = 3501;
    scaler.update(0.016, 100);
    expect(scaler.level).toBe(0);
    scaler.update(0.016, Number.NaN);
    expect(scaler.fps).toBe(100);
  });

  it('restores the base pixel ratio before re-enable (reported bug 6 does not reproduce)', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    let ratio = 2;
    const renderer = { domElement: {}, shadowMap: { enabled: true }, getPixelRatio: () => ratio, setPixelRatio: (n: number) => { ratio = n; } };
    const scaler = new QualityScaler(renderer as any, null, { cooldown: 0 });
    for (let cycle = 0; cycle < 3; cycle++) {
      scaler.enable();
      for (let i = 0; i < 4; i++) scaler.update(0.02, 10);
      expect(ratio).toBeCloseTo(1.1);
      scaler.disable();
      expect(ratio).toBe(2);
    }
  });
});
