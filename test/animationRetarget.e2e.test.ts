// Integration check: REAL ayo.glb skeleton + REAL Walking.glb / Hook Punch.glb
// clips through GLTFLoader + RetargetEngine, exactly as AnimationImporter does.
// Skips silently when the Mixamo GLBs aren't on disk (e.g. CI).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { collectTargetBoneNames, retargetClips, extractSkeletonGraph } from '../src/animation/RetargetEngine';
import { collectBoneNamesFromObject } from '../src/animation/SkeletonProfile';

(globalThis as unknown as { self: unknown }).self = globalThis;

const MIXAMO_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'mixamo');
const haveAssets = fs.existsSync(path.join(MIXAMO_DIR, 'characters', 'ayo.glb'));
const d = haveAssets ? describe : describe.skip;
const MOTIFECT_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'packs', 'motifect_martial_arts');
const haveMotifect = fs.existsSync(path.join(MOTIFECT_DIR, 'muay_thai_combination.fbx'));

async function parse(rel: string): Promise<{ scene: import('three').Object3D; animations: import('three').AnimationClip[] }> {
  const buf = fs.readFileSync(path.join(MIXAMO_DIR, rel));
  const loader = new GLTFLoader();
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await loader.parseAsync(ab, '');
  return { scene: gltf.scene, animations: gltf.animations ?? [] };
}

d('end-to-end retarget on the shipped Mixamo GLBs', () => {
  it('retargets Walking.glb onto the ayo skeleton with meter-scale root motion', async () => {
    const ayo = await parse('characters/ayo.glb');
    const targetBones = collectTargetBoneNames(ayo.scene);
    expect(targetBones.length).toBeGreaterThan(20);

    const walk = await parse('animations/Locomotion/Walking.glb');
    const clip = walk.animations[0];
    expect(clip).toBeTruthy();
    const srcBones = collectBoneNamesFromObject(walk.scene);

    const res = retargetClips([clip], targetBones, { sourceBoneNames: srcBones });

    // Detection: both sides are Mixamo (sanitized naming on the character).
    expect(res.sourceMatch.profile.id).toBe('mixamo');
    expect(res.targetMatch.profile.id).toBe('mixamo');
    // The shipped GLBs are authored in METERS → measured scale ~1.
    expect(res.scales[0]).toBeGreaterThan(0.9);
    expect(res.scales[0]).toBeLessThan(1.1);
    // Root track retained (ASM captures it → physics root motion).
    expect(res.hasRootTrack[0]).toBe(true);

    const out = res.clips[0];
    const hips = out.tracks.find(t => t.name.endsWith('Hips.position'));
    expect(hips).toBeTruthy();
    if (hips) {
      const v = (hips as import('three').VectorKeyframeTrack).values;
      // Hips rest height ≈ 1.04 m — proves units survived at meter scale.
      expect(v[1]).toBeGreaterThan(0.8);
      expect(v[1]).toBeLessThan(1.3);
    }
    // Every output track name must bind to a bone that exists on the target rig.
    const targetSet = new Set(targetBones);
    const unbound = out.tracks.filter(t => !targetSet.has(t.name.split('.')[0]));
    expect(unbound).toHaveLength(0);
  });

  it('retargets Hook Punch.glb (plain Hips naming, exotic 1/100 scale) onto the ayo skeleton', async () => {
    const ayo = await parse('characters/ayo.glb');
    const targetBones = collectTargetBoneNames(ayo.scene);

    const punch = await parse('animations/Attack Melee/Hook Punch.glb');
    const clip = punch.animations[0];
    expect(clip).toBeTruthy();
    const srcBones = collectBoneNamesFromObject(punch.scene);

    const res = retargetClips([clip], targetBones, { sourceBoneNames: srcBones });
    // This file uses PLAIN bone names (Hips/Spine, no mixamorig:) — the generic
    // humanoid profile is the correct detection for that naming.
    expect(['mixamo', 'humanoid_generic']).toContain(res.sourceMatch.profile.id);
    // Hips median y ≈ 0.0057 → measured scale ≈ 182 exceeds the sanity clamp, so
    // the engine falls back to the profile scale (1) — matching how the shipped
    // engine plays this clip today (raw values, negligible punch root motion).
    expect(res.scales[0]).toBe(1);

    const out = res.clips[0];
    const targetSet = new Set(targetBones);
    // Functional outcome: every track binds to a bone that exists on the target rig.
    const unbound = out.tracks.filter(t => !targetSet.has(t.name.split('.')[0]));
    expect(unbound).toHaveLength(0);
  });
});

(haveAssets && haveMotifect ? describe : describe.skip)('end-to-end retarget on the Motifect Unreal FBX pack', () => {
  it('world-space rest-pose retargeting maps UE rig onto ayo without pipe paths', async () => {
    const ayo = await parse('characters/ayo.glb');
    const targetBones = collectTargetBoneNames(ayo.scene);
    const targetSkeleton = extractSkeletonGraph(ayo.scene);
    const bytes = fs.readFileSync(path.join(MOTIFECT_DIR, 'muay_thai_combination.fbx'));
    const fbx = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
    const clips = (fbx as unknown as { animations?: import('three').AnimationClip[] }).animations ?? [];
    expect(clips.length).toBeGreaterThan(0);

    const sourceSkeleton = extractSkeletonGraph(fbx);
    const res = retargetClips([clips[0]], targetBones, {
      sourceBoneNames: [...sourceSkeleton.keys()],
      sourceSkeleton,
      targetSkeleton,
    });
    expect(res.sourceMatch.profile.id).toBe('ue_motifect');
    expect(res.clips[0].tracks.length).toBeGreaterThan(0);
    expect(res.clips[0].tracks.some(t => t.name.includes('|'))).toBe(false);
    const targetSet = new Set(targetBones);
    expect(res.clips[0].tracks.every(t => targetSet.has(t.name.split('.')[0]))).toBe(true);
    // Source thighs are named Leg/Shin; they must land on the target's UpLeg/Leg.
    const names = res.clips[0].tracks.map(t => t.name.split('.')[0]);
    expect(names).toContain('mixamorigRightUpLeg');
    expect(names).toContain('mixamorigRightLeg');
    // Only root position survives; no non-root transform tracks.
    expect(res.clips[0].tracks
      .filter(t => t.name.endsWith('.position'))
      .every(t => t.name.split('.')[0].endsWith('Hips'))).toBe(true);
  });
});
