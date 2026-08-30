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
const OMEN_DBZ_DIR = path.join(ROOT, 'public', 'assets', 'animations', 'omen-dbz-combat');

const hasAyo = fs.existsSync(AYO_PATH);
const hasOmenDbz = fs.existsSync(OMEN_DBZ_DIR);

(hasAyo && hasOmenDbz ? describe : describe.skip)('Omen Circle Animation Retargeting in Mix Engine', () => {
  it('registers Omen animation packs in FREE_ANIMATION_PACKS list', () => {
    const packIds = FREE_ANIMATION_PACKS.map(p => p.id);
    expect(packIds).toContain('omen_dbz_combat');
    expect(packIds).toContain('omen_superhero_flight');
    expect(packIds).toContain('omen_nodachi_combat');
    expect(packIds).toContain('omen_katana_combat');
    expect(packIds).toContain('omen_parkour_locomotion');
  });

  it('retargets Omen DBZ combat animation onto the ayo character skeleton', async () => {
    // 1. Load Ayo target rig
    const ayoBuf = fs.readFileSync(AYO_PATH);
    const gltfLoader = new GLTFLoader();
    const ab = ayoBuf.buffer.slice(ayoBuf.byteOffset, ayoBuf.byteOffset + ayoBuf.byteLength) as ArrayBuffer;
    const gltf = await gltfLoader.parseAsync(ab, '');
    const targetBones = collectTargetBoneNames(gltf.scene);
    const targetSkeleton = extractSkeletonGraph(gltf.scene);
    expect(targetBones.length).toBeGreaterThan(20);

    // 2. Find an FBX in omen-dbz-combat
    const files = fs.readdirSync(OMEN_DBZ_DIR).filter(f => f.toLowerCase().endsWith('.fbx'));
    expect(files.length).toBeGreaterThan(0);

    const testFile = files[0];
    const bytes = fs.readFileSync(path.join(OMEN_DBZ_DIR, testFile));
    const fbx = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
    const clips = (fbx as unknown as { animations?: import('three').AnimationClip[] }).animations ?? [];
    expect(clips.length).toBeGreaterThan(0);

    // 3. Perform world-space retargeting
    const sourceSkeleton = extractSkeletonGraph(fbx);
    const res = retargetClips([clips[0]], targetBones, {
      sourceBoneNames: [...sourceSkeleton.keys()],
      sourceSkeleton,
      targetSkeleton,
      autoTPose: true,
      keepRootMotion: true,
    });

    // 4. Validate output
    expect(res.clips.length).toBe(1);
    const outClip = res.clips[0];
    expect(outClip.tracks.length).toBeGreaterThan(10);
    
    // Every retargeted track should map cleanly onto the target rig bones
    const targetSet = new Set(targetBones);
    const validTracks = outClip.tracks.every(t => targetSet.has(t.name.split('.')[0]));
    expect(validTracks).toBe(true);

    // Output tracks must not contain unparsed FBX pipe paths
    expect(outClip.tracks.some(t => t.name.includes('|'))).toBe(false);
  });

  it('retargets Omen Superhero Flight animations onto the ayo skeleton', async () => {
    const ayoBuf = fs.readFileSync(AYO_PATH);
    const gltf = await new GLTFLoader().parseAsync(ayoBuf.buffer.slice(ayoBuf.byteOffset, ayoBuf.byteOffset + ayoBuf.byteLength) as ArrayBuffer, '');
    const targetBones = collectTargetBoneNames(gltf.scene);
    const targetSkeleton = extractSkeletonGraph(gltf.scene);

    const FLIGHT_DIR = path.join(ROOT, 'public', 'assets', 'animations', 'omen-superhero-flight');
    const files = fs.readdirSync(FLIGHT_DIR).filter(f => f.toLowerCase().endsWith('.fbx'));
    expect(files.length).toBeGreaterThan(10);

    const bytes = fs.readFileSync(path.join(FLIGHT_DIR, files[0]));
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
    expect(res.clips[0].tracks.length).toBeGreaterThan(10);
  });

  it('retargets Omen Nodachi Combat animations onto the ayo skeleton', async () => {
    const ayoBuf = fs.readFileSync(AYO_PATH);
    const gltf = await new GLTFLoader().parseAsync(ayoBuf.buffer.slice(ayoBuf.byteOffset, ayoBuf.byteOffset + ayoBuf.byteLength) as ArrayBuffer, '');
    const targetBones = collectTargetBoneNames(gltf.scene);
    const targetSkeleton = extractSkeletonGraph(gltf.scene);

    const NODACHI_DIR = path.join(ROOT, 'public', 'assets', 'animations', 'omen-nodachi-combat');
    const files = fs.readdirSync(NODACHI_DIR).filter(f => f.toLowerCase().endsWith('.fbx'));
    expect(files.length).toBeGreaterThan(10);

    const bytes = fs.readFileSync(path.join(NODACHI_DIR, files[0]));
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
    expect(res.clips[0].tracks.length).toBeGreaterThan(10);
  });

  it('retargets Omen Parkour Traversal animations onto the ayo skeleton', async () => {
    const ayoBuf = fs.readFileSync(AYO_PATH);
    const gltf = await new GLTFLoader().parseAsync(ayoBuf.buffer.slice(ayoBuf.byteOffset, ayoBuf.byteOffset + ayoBuf.byteLength) as ArrayBuffer, '');
    const targetBones = collectTargetBoneNames(gltf.scene);
    const targetSkeleton = extractSkeletonGraph(gltf.scene);

    const PARKOUR_DIR = path.join(ROOT, 'public', 'assets', 'animations', 'omen-parkour-locomotion');
    const files = fs.readdirSync(PARKOUR_DIR).filter(f => f.toLowerCase().endsWith('.fbx'));
    expect(files.length).toBeGreaterThan(5);

    const bytes = fs.readFileSync(path.join(PARKOUR_DIR, files[0]));
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
    expect(res.clips[0].tracks.length).toBeGreaterThan(10);
  });
});
