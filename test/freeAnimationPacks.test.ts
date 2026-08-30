// Regression coverage for the bundled CC0 packs. This mirrors the importer’s
// GLTFLoader + RetargetEngine path without requiring a running dev server.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  collectTargetBoneNames,
  extractSkeletonGraph,
  retargetClips,
} from '../src/animation/RetargetEngine';
import { collectBoneNamesFromObject } from '../src/animation/SkeletonProfile';

(globalThis as unknown as { self: unknown }).self = globalThis;
(globalThis as unknown as { ProgressEvent: typeof ProgressEvent }).ProgressEvent = class ProgressEvent {
  readonly type: string;
  constructor(type: string) { this.type = type; }
} as unknown as typeof ProgressEvent;

const ROOT = path.resolve(__dirname, '..');
const AYO = path.join(ROOT, 'public', 'assets', 'mixamo', 'characters', 'ayo.glb');
const UAL1 = path.join(ROOT, 'public', 'assets', 'animations', 'quaternius-universal-1');
const UAL2 = path.join(ROOT, 'public', 'assets', 'animations', 'quaternius-universal-2', 'UAL2_Standard.glb');

async function parseBuffer(buffer: ArrayBuffer): Promise<{ scene: import('three').Group; animations: import('three').AnimationClip[] }> {
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  return { scene: gltf.scene, animations: gltf.animations ?? [] };
}

async function parseGltfWithSiblingBin(): Promise<{ scene: import('three').Group; animations: import('three').AnimationClip[] }> {
  const doc = JSON.parse(fs.readFileSync(path.join(UAL1, 'AnimationLibrary_Godot_Standard.gltf'), 'utf8')) as {
    buffers: Array<{ uri?: string }>;
  };
  const bin = fs.readFileSync(path.join(UAL1, 'AnimationLibrary_Godot_Standard.bin'));
  doc.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  const json = new TextEncoder().encode(JSON.stringify(doc));
  return parseBuffer(json.buffer.slice(json.byteOffset, json.byteOffset + json.byteLength));
}

async function retargetSample(source: { scene: import('three').Group; animations: import('three').AnimationClip[] }): Promise<number> {
  const ayo = fs.readFileSync(AYO);
  const target = await parseBuffer(ayo.buffer.slice(ayo.byteOffset, ayo.byteOffset + ayo.byteLength));
  const targetBones = collectTargetBoneNames(target.scene);
  const result = retargetClips(source.animations.slice(0, 3), targetBones, {
    sourceBoneNames: collectBoneNamesFromObject(source.scene),
    sourceSkeleton: extractSkeletonGraph(source.scene),
    targetSkeleton: extractSkeletonGraph(target.scene),
    footLock: true,
    keepRootMotion: true,
  });
  expect(result.clips).toHaveLength(Math.min(3, source.animations.length));
  expect(result.clips.every((clip) => clip.tracks.length > 0)).toBe(true);
  const targetSet = new Set(targetBones);
  expect(result.clips.every((clip) => clip.tracks.every((track) => targetSet.has(track.name.split('.')[0])))).toBe(true);
  return result.clips.length;
}

describe('bundled CC0 animation packs', () => {
  it('loads and retargets Universal Animation Library 1 with an external .bin buffer', async () => {
    const source = await parseGltfWithSiblingBin();
    expect(source.animations.length).toBeGreaterThan(20);
    expect(await retargetSample(source)).toBe(3);
  }, 45000);

  it('loads and retargets Universal Animation Library 2 GLB clips', async () => {
    const bytes = fs.readFileSync(UAL2);
    const source = await parseBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(source.animations.length).toBeGreaterThan(20);
    expect(await retargetSample(source)).toBe(3);
  }, 45000);
});
