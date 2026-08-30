// Per-bone angular fidelity against the REAL asset pair — the test that catches
// "close to 1:1, but not quite".
//
// Direction is the metric, not the bone's world quaternion: two rigs legitimately
// disagree about a bone's local axis convention, but the world direction from a bone to
// its child is convention-independent and is exactly what a person sees. If the target's
// upper arm points where the source's upper arm points, the pose reads identically.
//
// This exists because every structural test can pass while the result still looks wrong.
// When the bind alignment covered only the eight limb bones, the synthetic invariants all
// passed and this measured 31.7° of shoulder error.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { collectTargetBoneNames, retargetClips, extractSkeletonGraph } from '../src/animation/RetargetEngine';
import { detectSkeletonProfile, type CanonicalBone } from '../src/animation/SkeletonProfile';

(globalThis as unknown as { self: unknown }).self = globalThis;

const MIX = path.resolve(__dirname, '..', 'public', 'assets', 'mixamo');
const MOT = path.resolve(__dirname, '..', 'public', 'assets', 'packs', 'motifect_martial_arts');
const CHAR = path.join(MIX, 'characters', 'ayo.glb');
const CLIP = path.join(MOT, 'muay_thai_combination.fbx');
const haveAssets = fs.existsSync(CHAR) && fs.existsSync(CLIP);

/** Bone → the canonical child whose position defines its direction, with fallbacks. */
const CHILD: Partial<Record<CanonicalBone, CanonicalBone[]>> = {
  Hips: ['Spine'], Spine: ['Spine1'], Spine1: ['Spine2'], Spine2: ['Neck'], Neck: ['Head'],
  LeftShoulder: ['LeftArm'], LeftArm: ['LeftForeArm'], LeftForeArm: ['LeftHand'],
  LeftHand: ['LeftHandMiddle1', 'LeftHandIndex1'],
  RightShoulder: ['RightArm'], RightArm: ['RightForeArm'], RightForeArm: ['RightHand'],
  RightHand: ['RightHandMiddle1', 'RightHandIndex1'],
  LeftUpLeg: ['LeftLeg'], LeftLeg: ['LeftFoot'], LeftFoot: ['LeftToeBase'],
  RightUpLeg: ['RightLeg'], RightLeg: ['RightFoot'], RightFoot: ['RightToeBase'],
};

function poseAt(root: THREE.Object3D, clip: THREE.AnimationClip, t: number): Map<string, THREE.Object3D> {
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  const byName = new Map<string, THREE.Object3D>();
  root.traverse(o => { if (o.name && !byName.has(o.name)) byName.set(o.name, o); });
  return byName;
}

const dirBetween = (a: THREE.Object3D, b: THREE.Object3D) =>
  b.getWorldPosition(new THREE.Vector3()).sub(a.getWorldPosition(new THREE.Vector3()));

(haveAssets ? describe : describe.skip)('retarget fidelity on the real UE→Mixamo pair', () => {
  it('points every bone where the source points it', async () => {
    const buf = fs.readFileSync(CHAR);
    const gltf = await new GLTFLoader().parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
    const targetBones = collectTargetBoneNames(gltf.scene);
    const targetSkeleton = extractSkeletonGraph(gltf.scene);
    const dstMatch = detectSkeletonProfile(targetBones);

    const bytes = fs.readFileSync(CLIP);
    const fbx = new FBXLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
    const srcClip = (fbx as unknown as { animations: THREE.AnimationClip[] }).animations[0];
    const sourceSkeleton = extractSkeletonGraph(fbx);
    const srcMatch = detectSkeletonProfile([...sourceSkeleton.keys()]);

    const out = retargetClips([srcClip], targetBones, {
      sourceBoneNames: [...sourceSkeleton.keys()], sourceSkeleton, targetSkeleton,
    }).clips[0];

    const worst = new Map<string, number>();
    for (let i = 0; i <= 10; i++) {
      const t = (srcClip.duration * i) / 10;
      const srcNodes = poseAt(fbx, srcClip, t);
      const dstNodes = poseAt(gltf.scene, out, t);
      for (const [canon, kids] of Object.entries(CHILD) as [CanonicalBone, CanonicalBone[]][]) {
        const sN = srcMatch.canonicalToSource.get(canon);
        const dN = dstMatch.canonicalToSource.get(canon);
        const sK = kids.map(k => srcMatch.canonicalToSource.get(k)).find(Boolean);
        const dK = kids.map(k => dstMatch.canonicalToSource.get(k)).find(Boolean);
        if (!sN || !dN || !sK || !dK) continue;
        const a = srcNodes.get(sN), ac = srcNodes.get(sK);
        const b = dstNodes.get(dN), bc = dstNodes.get(dK);
        if (!a || !ac || !b || !bc) continue;
        const ds = dirBetween(a, ac), dt = dirBetween(b, bc);
        if (ds.lengthSq() < 1e-12 || dt.lengthSq() < 1e-12) continue;
        const deg = THREE.MathUtils.radToDeg(
          Math.acos(THREE.MathUtils.clamp(ds.normalize().dot(dt.normalize()), -1, 1)));
        worst.set(canon, Math.max(worst.get(canon) ?? 0, deg));
      }
    }

    expect(worst.size).toBeGreaterThan(15); // the comparison actually ran
    const rows = [...worst.entries()].sort((a, b) => b[1] - a[1]);
    const detail = rows.map(([n, d]) => `${n} ${d.toFixed(1)}°`).join(', ');

    for (const [bone, deg] of rows) {
      // Neck is the one bone that cannot be exact: the UE rig has Neck1+Neck2 where
      // Mixamo has a single Neck, so the unmapped link's bend concentrates at one joint.
      const budget = bone === 'Neck' ? 4 : 1;
      expect(deg, `${bone} off by ${deg.toFixed(1)}° — ${detail}`).toBeLessThan(budget);
    }
  }, 120000);
});
