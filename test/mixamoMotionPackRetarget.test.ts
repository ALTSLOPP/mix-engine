import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { collectTargetBoneNames, retargetClips, extractSkeletonGraph } from '../src/animation/RetargetEngine';
import { FREE_ANIMATION_PACKS } from '../src/animation/FreeAnimationPacks';

(globalThis as unknown as { self: unknown }).self = globalThis;

const ROOT = path.resolve(__dirname, '..');
const AYO_PATH = path.join(ROOT, 'public', 'assets', 'mixamo', 'characters', 'ayo.glb');
const MIXAMO_ALL_DIR = path.join(ROOT, 'public', 'assets', 'animations', 'mixamo-all');

const hasAyo = fs.existsSync(AYO_PATH);
const hasMixamoAll = fs.existsSync(MIXAMO_ALL_DIR);

(hasAyo && hasMixamoAll ? describe : describe.skip)('Mixamo Complete Motion Pack Retargeting in Mix Engine', () => {
  it('registers mixamo_all and all 16 category banks in FREE_ANIMATION_PACKS', () => {
    const packIds = FREE_ANIMATION_PACKS.map(p => p.id);
    expect(packIds).toContain('mixamo_all');
    expect(packIds).toContain('mixamo_locomotion');
    expect(packIds).toContain('mixamo_melee_combat');
    expect(packIds).toContain('mixamo_pose_stance');
    expect(packIds).toContain('mixamo_shooting');
    expect(packIds).toContain('mixamo_emotes_gestures');
    expect(packIds).toContain('mixamo_dance');
    expect(packIds).toContain('mixamo_sports_fitness');
    expect(packIds).toContain('mixamo_death_fall');
    expect(packIds).toContain('mixamo_interaction_props');
    expect(packIds).toContain('mixamo_cinematic_transitions');
    expect(packIds).toContain('mixamo_shooting_locomotion');
    expect(packIds).toContain('mixamo_acrobatics_evasion');
    expect(packIds).toContain('mixamo_hit_reaction');
    expect(packIds).toContain('mixamo_zombie');
    expect(packIds).toContain('mixamo_magic');
    expect(packIds).toContain('mixamo_uncategorized');
  });

  it('contains all 2,457 FBX files across all 16 categorized subfolders', () => {
    const categories = [
      'acrobatics-evasion',
      'cinematic-transitions',
      'dance',
      'death-fall',
      'emotes-gestures',
      'hit-reaction',
      'interaction-props',
      'locomotion',
      'magic',
      'melee-combat',
      'pose-stance',
      'shooting',
      'shooting-locomotion',
      'sports-fitness',
      'uncategorized',
      'zombie',
    ];

    let totalFbx = 0;
    for (const cat of categories) {
      const catDir = path.join(MIXAMO_ALL_DIR, cat);
      expect(fs.existsSync(catDir)).toBe(true);
      const count = fs.readdirSync(catDir).filter(f => f.toLowerCase().endsWith('.fbx')).length;
      expect(count).toBeGreaterThan(0);
      totalFbx += count;
    }

    expect(totalFbx).toBe(2457);
  });

  it('retargets Mixamo Locomotion animations onto the ayo character skeleton', async () => {
    const ayoBuf = fs.readFileSync(AYO_PATH);
    const gltfLoader = new GLTFLoader();
    const ab = ayoBuf.buffer.slice(ayoBuf.byteOffset, ayoBuf.byteOffset + ayoBuf.byteLength) as ArrayBuffer;
    const gltf = await gltfLoader.parseAsync(ab, '');
    const targetBones = collectTargetBoneNames(gltf.scene);
    const targetSkeleton = extractSkeletonGraph(gltf.scene);

    const dir = path.join(MIXAMO_ALL_DIR, 'locomotion');
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.fbx'));
    expect(files.length).toBeGreaterThan(0);

    const testFile = files[0];
    const bytes = fs.readFileSync(path.join(dir, testFile));
    const fbx = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
    const clips = (fbx as unknown as { animations?: import('three').AnimationClip[] }).animations ?? [];
    expect(clips.length).toBeGreaterThan(0);

    const sourceSkeleton = extractSkeletonGraph(fbx);
    const res = retargetClips([clips[0]], targetBones, {
      sourceBoneNames: [...sourceSkeleton.keys()],
      sourceSkeleton,
      targetSkeleton,
      autoTPose: true,
      keepRootMotion: true,
    });

    expect(res.clips.length).toBe(1);
    const outClip = res.clips[0];
    expect(outClip.tracks.length).toBeGreaterThan(0);
    expect(outClip.duration).toBeGreaterThan(0);
  });

  it('retargets Mixamo Melee Combat animations onto the ayo skeleton', async () => {
    const ayoBuf = fs.readFileSync(AYO_PATH);
    const gltfLoader = new GLTFLoader();
    const ab = ayoBuf.buffer.slice(ayoBuf.byteOffset, ayoBuf.byteOffset + ayoBuf.byteLength) as ArrayBuffer;
    const gltf = await gltfLoader.parseAsync(ab, '');
    const targetBones = collectTargetBoneNames(gltf.scene);
    const targetSkeleton = extractSkeletonGraph(gltf.scene);

    const dir = path.join(MIXAMO_ALL_DIR, 'melee-combat');
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.fbx'));
    expect(files.length).toBeGreaterThan(0);

    const testFile = files[0];
    const bytes = fs.readFileSync(path.join(dir, testFile));
    const fbx = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
    const clips = (fbx as unknown as { animations?: import('three').AnimationClip[] }).animations ?? [];
    expect(clips.length).toBeGreaterThan(0);

    const sourceSkeleton = extractSkeletonGraph(fbx);
    const res = retargetClips([clips[0]], targetBones, {
      sourceBoneNames: [...sourceSkeleton.keys()],
      sourceSkeleton,
      targetSkeleton,
      autoTPose: true,
      keepRootMotion: true,
    });

    expect(res.clips.length).toBe(1);
    expect(res.clips[0].tracks.length).toBeGreaterThan(0);
  });

  it('retargets Mixamo Acrobatics & Evasion animations onto the ayo skeleton', async () => {
    const ayoBuf = fs.readFileSync(AYO_PATH);
    const gltfLoader = new GLTFLoader();
    const ab = ayoBuf.buffer.slice(ayoBuf.byteOffset, ayoBuf.byteOffset + ayoBuf.byteLength) as ArrayBuffer;
    const gltf = await gltfLoader.parseAsync(ab, '');
    const targetBones = collectTargetBoneNames(gltf.scene);
    const targetSkeleton = extractSkeletonGraph(gltf.scene);

    const dir = path.join(MIXAMO_ALL_DIR, 'acrobatics-evasion');
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.fbx'));
    expect(files.length).toBeGreaterThan(0);

    const testFile = files[0];
    const bytes = fs.readFileSync(path.join(dir, testFile));
    const fbx = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
    const clips = (fbx as unknown as { animations?: import('three').AnimationClip[] }).animations ?? [];
    expect(clips.length).toBeGreaterThan(0);

    const sourceSkeleton = extractSkeletonGraph(fbx);
    const res = retargetClips([clips[0]], targetBones, {
      sourceBoneNames: [...sourceSkeleton.keys()],
      sourceSkeleton,
      targetSkeleton,
      autoTPose: true,
      keepRootMotion: true,
    });

    expect(res.clips.length).toBe(1);
    expect(res.clips[0].tracks.length).toBeGreaterThan(0);
  });
});
