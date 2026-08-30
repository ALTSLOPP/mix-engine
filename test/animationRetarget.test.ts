import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  detectSkeletonProfile,
  normalizeBoneName,
  suggestScaleFactor,
  SKELETON_PROFILES,
} from '../src/animation/SkeletonProfile';
import { retargetClips, extractRootTrack } from '../src/animation/RetargetEngine';
import { inferCategory, inferLoop, sanitizeEntryId } from '../src/animation/AnimationPack';
import { AnimationPackRegistry } from '../src/animation/AnimationPackRegistry';

// ─── Naming conventions observed in the wild ─────────────────────────────────
// Raw Mixamo FBX:      "mixamorig:Hips"   (colon)
// GLTFLoader sanitize: "mixamorigHips"    (colon stripped)
// Some exporters:      "mixamorig_Hips"
const FBX_MIXAMO_BONES = [
  'mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
  'mixamorig:Neck', 'mixamorig:Head',
  'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
  'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
  'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot',
  'mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot',
];
const GLB_MIXAMO_BONES = FBX_MIXAMO_BONES.map(b => b.replace(':', ''));
const UE_BONES = [
  'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
  'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r',
];
// Target rig (ayo canonical checkout): GLTFLoader-sanitized Mixamo names.
const TARGET_BONES = GLB_MIXAMO_BONES;

function clipWithHips(
  boneName: string,
  hipsY: number,
  driftX: number,
  rotations = true,
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack(
      `${boneName}.position`,
      [0, 1],
      [0, hipsY, 0, driftX, hipsY, 0],
    ),
  ];
  if (rotations) {
    const q = new THREE.Quaternion();
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${boneName}.quaternion`,
        [0, 1],
        [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w],
      ),
      new THREE.QuaternionKeyframeTrack(
        'mixamorig:LeftArm.quaternion',
        [0, 1],
        [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w],
      ),
    );
  }
  return new THREE.AnimationClip('test', 1, tracks);
}

describe('normalizeBoneName', () => {
  it('strips separators so colon/underscore/plain variants compare equal', () => {
    expect(normalizeBoneName('mixamorig:Hips')).toBe(normalizeBoneName('mixamorigHips'));
    expect(normalizeBoneName('mixamorig:Hips')).toBe(normalizeBoneName('mixamorig_Hips'));
    expect(normalizeBoneName('spine_01')).toBe('spine01');
  });
});

describe('detectSkeletonProfile', () => {
  it('detects raw Mixamo FBX naming (colon) — the primary store-pack case', () => {
    const m = detectSkeletonProfile(FBX_MIXAMO_BONES);
    expect(m.profile.id).toBe('mixamo');
    expect(m.score).toBeGreaterThan(0.3);
    expect(m.canonicalToSource.get('Hips')).toBe('mixamorig:Hips');
    expect(m.missingRequired).toHaveLength(0);
  });

  it('detects GLTFLoader-sanitized Mixamo naming', () => {
    const m = detectSkeletonProfile(GLB_MIXAMO_BONES);
    expect(m.profile.id).toBe('mixamo');
    expect(m.canonicalToSource.get('Hips')).toBe('mixamorigHips');
  });

  it('detects UE mannequin naming', () => {
    const m = detectSkeletonProfile(UE_BONES);
    expect(m.profile.id).toBe('ue_mannequin');
    expect(m.canonicalToSource.get('Hips')).toBe('pelvis');
    expect(m.missingRequired).toHaveLength(0);
  });

  it('scores ~0 for a non-humanoid rig', () => {
    const m = detectSkeletonProfile(['wheel', 'chassis', 'doorFL']);
    expect(m.score).toBeLessThan(0.05);
  });
});

describe('suggestScaleFactor (fallback)', () => {
  it('converts a cm source to meters (mixamo profile scaleFactor 0.01)', () => {
    const src = detectSkeletonProfile(FBX_MIXAMO_BONES);
    const dst = detectSkeletonProfile(TARGET_BONES);
    // Engine convention: root tracks in METERS regardless of target naming.
    expect(suggestScaleFactor(src, dst)).toBeCloseTo(0.01, 5);
  });
});

describe('retargetClips', () => {
  it('retargets a cm Mixamo FBX clip to the target rig and measures the scale', () => {
    // Hips rest at ~104 (cm) with a 150 cm forward walk — a classic Mixamo FBX.
    const clip = clipWithHips('mixamorig:Hips', 104, 150);
    const res = retargetClips([clip], TARGET_BONES, {
      sourceBoneNames: FBX_MIXAMO_BONES,
    });

    expect(res.clips).toHaveLength(1);
    const out = res.clips[0];
    // Track renamed to the TARGET rig's bone name (sanitized Mixamo).
    expect(out.tracks.some(t => t.name === 'mixamorigHips.position')).toBe(true);
    // Measured scale ≈ 1.04 / 104 ≈ 0.01 (cm → m).
    expect(res.scales[0]).toBeCloseTo(0.01, 3);
    // Root track KEPT by default (the ASM captures it for physics root motion).
    expect(res.hasRootTrack[0]).toBe(true);
    // Position values converted to meters.
    const hips = out.tracks.find(t => t.name === 'mixamorigHips.position') as THREE.VectorKeyframeTrack;
    expect(hips.values[1]).toBeCloseTo(1.04, 2); // y
    expect(hips.values[3]).toBeCloseTo(1.5, 2); // drift x: 150 cm → 1.5 m
  });

  it('leaves a meter-unit glTF clip at scale ~1', () => {
    // Same rig naming, but authored in meters (like the shipped Walking.glb).
    const clip = clipWithHips('mixamorigHips', 1.04, 1.4);
    const res = retargetClips([clip], TARGET_BONES);
    expect(res.scales[0]).toBeCloseTo(1.0, 2);
    const hips = res.clips[0].tracks.find(t => t.name === 'mixamorigHips.position') as THREE.VectorKeyframeTrack;
    expect(hips.values[3]).toBeCloseTo(1.4, 3); // unchanged
  });

  it('maps UE mannequin bone names onto a Mixamo target rig', () => {
    const clip = clipWithHips('pelvis', 1.04, 0);
    // Add a UE rotation track.
    const q = new THREE.Quaternion();
    clip.tracks.push(new THREE.QuaternionKeyframeTrack(
      'upperarm_l.quaternion', [0], [q.x, q.y, q.z, q.w],
    ));
    const res = retargetClips([clip], TARGET_BONES, { sourceBoneNames: UE_BONES });
    const names = res.clips[0].tracks.map(t => t.name);
    expect(names).toContain('mixamorigHips.position');   // pelvis → Hips → mixamorigHips
    expect(names).toContain('mixamorigLeftArm.quaternion'); // upperarm_l → LeftArm
  });

  it('strips the root track when keepRootMotion:false', () => {
    const clip = clipWithHips('mixamorig:Hips', 104, 150);
    const res = retargetClips([clip], TARGET_BONES, {
      sourceBoneNames: FBX_MIXAMO_BONES,
      keepRootMotion: false,
    });
    expect(res.hasRootTrack[0]).toBe(false);
    expect(res.clips[0].tracks.some(t => t.name.includes('position'))).toBe(false);
  });

  it('does not mutate the input clip', () => {
    const clip = clipWithHips('mixamorig:Hips', 104, 150);
    const before = [...(clip.tracks[0] as THREE.VectorKeyframeTrack).values];
    retargetClips([clip], TARGET_BONES, { sourceBoneNames: FBX_MIXAMO_BONES });
    expect([...(clip.tracks[0] as THREE.VectorKeyframeTrack).values]).toEqual(before);
    expect(clip.tracks[0].name).toBe('mixamorig:Hips.position');
  });

  it('respects an explicit translationScale override', () => {
    const clip = clipWithHips('mixamorig:Hips', 100, 100);
    const res = retargetClips([clip], TARGET_BONES, {
      sourceBoneNames: FBX_MIXAMO_BONES,
      translationScale: 0.02,
    });
    expect(res.scales[0]).toBe(0.02);
    const hips = res.clips[0].tracks.find(t => t.name === 'mixamorigHips.position') as THREE.VectorKeyframeTrack;
    expect(hips.values[1]).toBeCloseTo(2.0, 3);
  });

  it('normalizes FBXLoader pipe-delimited model paths before bone mapping', () => {
    const clip = clipWithHips('Hips|Hips|Take1|BaseLayer', 104, 150);
    const plainSourceBones = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
    const res = retargetClips([clip], TARGET_BONES, { sourceBoneNames: plainSourceBones });
    const names = res.clips[0].tracks.map(t => t.name);
    expect(names).toContain('mixamorigHips.position');
    expect(res.hasRootTrack[0]).toBe(true);
  });
});

describe('extractRootTrack', () => {
  it('finds the hips position track on a retargeted clip', () => {
    const clip = clipWithHips('mixamorig:Hips', 104, 150);
    const res = retargetClips([clip], TARGET_BONES, { sourceBoneNames: FBX_MIXAMO_BONES });
    const rt = extractRootTrack(res.clips[0], 'mixamorigHips');
    expect(rt).not.toBeNull();
  });
});

describe('pack metadata heuristics', () => {
  it('infers combat categories from file names', () => {
    expect(inferCategory('SwordSlash.fbx')).toBe('combat');
    expect(inferCategory('Punch_01.fbx')).toBe('combat');
    expect(inferCategory('Walking.fbx')).toBe('locomotion');
    expect(inferCategory('Idle.fbx')).toBe('idle');
    expect(inferCategory('Dying_02.fbx')).toBe('death');
    expect(inferCategory('HitReact.fbx')).toBe('hit_reaction');
    expect(inferCategory('SomethingElse.fbx')).toBe('misc');
  });

  it('loops locomotion/idle but not one-shots', () => {
    expect(inferLoop('Walking.fbx', 'locomotion')).toBe(true);
    expect(inferLoop('Idle.fbx', 'idle')).toBe(true);
    expect(inferLoop('SwordSlash.fbx', 'combat')).toBe(false);
    expect(inferLoop('Dying.fbx', 'death')).toBe(false);
  });

  it('sanitizes entry ids', () => {
    expect(sanitizeEntryId('Great Sword Slash (1).fbx')).toBe('Great_Sword_Slash_1');
    expect(sanitizeEntryId('..weird..name..fbx')).toBeTruthy();
  });
});

describe('AnimationPackRegistry', () => {
  function makePack(registry: AnimationPackRegistry): void {
    const clip = clipWithHips('mixamorig:Hips', 1.04, 0);
    registry.register({
      def: {
        id: 'testpack',
        displayName: 'Test Pack',
        targetRig: 'ayo',
        sourcePath: '(file drop)',
        createdAt: 0,
        entries: [
          { id: 'Idle', displayName: 'Idle', fileName: 'Idle.fbx', category: 'idle', tags: ['idle'], duration: 2, loop: true, rootMotion: true, sourceProfileId: 'mixamo', translationScale: 1 },
          { id: 'Slash', displayName: 'Slash', fileName: 'Slash.fbx', category: 'combat', tags: ['combat'], duration: 0.8, loop: false, rootMotion: false, sourceProfileId: 'mixamo', translationScale: 1 },
        ],
      },
      clips: new Map([
        ['Idle', clip],
        ['Slash', clip],
      ]),
    });
  }

  it('applies pack clips to an ASM honoring per-entry loop flags', () => {
    const registry = new AnimationPackRegistry();
    registry.setPersistenceEnabled(false);
    makePack(registry);

    const added: Array<{ name: string; loop?: boolean }> = [];
    const fakeAsm = {
      addAnimation: (name: string, _clip: THREE.AnimationClip, opts?: { loop?: boolean }) => {
        added.push({ name, loop: opts?.loop });
      },
      hasAnimation: () => false,
    };
    const n = registry.applyToStateMachine('testpack', fakeAsm);
    expect(n).toBe(2);
    const idle = added.find(a => a.name === 'Idle');
    const slash = added.find(a => a.name === 'Slash');
    expect(idle?.loop).toBe(true);
    expect(slash?.loop).toBe(false);
  });

  it('skips states the ASM already has (no overwrite by default)', () => {
    const registry = new AnimationPackRegistry();
    registry.setPersistenceEnabled(false);
    makePack(registry);
    const added: string[] = [];
    const fakeAsm = {
      addAnimation: (name: string) => { added.push(name); },
      hasAnimation: (name: string) => name === 'Idle',
    };
    expect(registry.applyToStateMachine('testpack', fakeAsm)).toBe(1);
    expect(added).toEqual(['Slash']); // Idle was already present → skipped
  });

  it('finds clips across packs and removes packs', () => {
    const registry = new AnimationPackRegistry();
    registry.setPersistenceEnabled(false);
    makePack(registry);
    expect(registry.findClipByEntryId('Slash')?.packId).toBe('testpack');
    expect(registry.remove('testpack')).toBe(true);
    expect(registry.has('testpack')).toBe(false);
  });
});
