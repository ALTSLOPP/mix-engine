// Detection coverage for the rig families the engine claims to handle automatically.
// Bone names here are spelled out by hand on purpose: the profile tables are built by
// generators, so reusing those generators to test them would only prove the generator
// agrees with itself.
import { describe, it, expect } from 'vitest';
import {
  detectSkeletonProfile,
  type CanonicalBone,
} from '../src/animation/SkeletonProfile';

const CORE: CanonicalBone[] = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

const mirror = (names: string[], l: string, r: string) =>
  [...names, ...names.map(n => n.replace(l, r))];  // first occurrence only: 'lCollar' must not become 'rCorrar'

const VRM = [
  'J_Bip_C_Hips', 'J_Bip_C_Spine', 'J_Bip_C_Chest', 'J_Bip_C_UpperChest',
  'J_Bip_C_Neck', 'J_Bip_C_Head',
  ...mirror([
    'J_Bip_L_Shoulder', 'J_Bip_L_UpperArm', 'J_Bip_L_LowerArm', 'J_Bip_L_Hand',
    'J_Bip_L_UpperLeg', 'J_Bip_L_LowerLeg', 'J_Bip_L_Foot', 'J_Bip_L_ToeBase',
    'J_Bip_L_Thumb_Proximal', 'J_Bip_L_Thumb_Intermediate', 'J_Bip_L_Thumb_Distal',
    'J_Bip_L_Index_Proximal', 'J_Bip_L_Middle_Proximal',
    'J_Bip_L_Ring_Proximal', 'J_Bip_L_Little_Proximal', 'J_Bip_L_Little_Distal',
  ], '_L_', '_R_'),
];

const RIGIFY = [
  'spine', 'spine.001', 'spine.002', 'spine.003', 'spine.004', 'spine.006',
  ...mirror([
    'shoulder.L', 'upper_arm.L', 'forearm.L', 'hand.L',
    'thigh.L', 'shin.L', 'foot.L', 'toe.L',
    'thumb.01.L', 'thumb.02.L', 'thumb.03.L',
    'f_index.01.L', 'f_middle.01.L', 'f_ring.01.L', 'f_pinky.01.L', 'f_pinky.03.L',
  ], '.L', '.R'),
];

const DAZ = [
  'hip', 'abdomenLower', 'abdomenUpper', 'chestLower', 'neckLower', 'head',
  ...mirror([
    'lCollar', 'lShldrBend', 'lForearmBend', 'lHand',
    'lThighBend', 'lShin', 'lFoot', 'lToe',
    'lThumb1', 'lThumb2', 'lThumb3', 'lIndex1', 'lMid1', 'lRing1', 'lPinky1', 'lPinky3',
  ], 'l', 'r'),
];

const BIPED = [
  'Bip01 Pelvis', 'Bip01 Spine', 'Bip01 Spine1', 'Bip01 Spine2', 'Bip01 Neck', 'Bip01 Head',
  ...mirror([
    'Bip01 L Clavicle', 'Bip01 L UpperArm', 'Bip01 L Forearm', 'Bip01 L Hand',
    'Bip01 L Thigh', 'Bip01 L Calf', 'Bip01 L Foot', 'Bip01 L Toe0',
    'Bip01 L Finger0', 'Bip01 L Finger01', 'Bip01 L Finger02',
    'Bip01 L Finger1', 'Bip01 L Finger2', 'Bip01 L Finger3', 'Bip01 L Finger4', 'Bip01 L Finger42',
  ], ' L ', ' R '),
];

const FAMILIES = [
  { id: 'vrm', bones: VRM },
  { id: 'rigify', bones: RIGIFY },
  { id: 'daz_genesis', bones: DAZ },
  { id: 'max_biped', bones: BIPED },
] as const;

describe('skeleton profiles — additional rig families', () => {
  for (const { id, bones } of FAMILIES) {
    it(`detects ${id} and maps every core bone`, () => {
      const m = detectSkeletonProfile(bones);
      expect(m.profile.id).toBe(id);
      expect(m.missingRequired).toEqual([]);
      const unmapped = CORE.filter(c => !m.canonicalToSource.has(c));
      expect(unmapped, `unmapped on ${id}`).toEqual([]);
    });

    it(`maps ${id} fingers without colliding`, () => {
      const m = detectSkeletonProfile(bones);
      // Every alias hit must be a distinct source bone: a generator typo typically
      // shows up as two canonicals claiming the same name.
      const claimed = [...m.canonicalToSource.values()];
      expect(new Set(claimed).size).toBe(claimed.length);
      expect(m.canonicalToSource.has('LeftHandThumb1')).toBe(true);
      expect(m.canonicalToSource.has('RightHandPinky1')).toBe(true);
    });
  }

  it('does not confuse the families with each other', () => {
    for (const { id, bones } of FAMILIES) {
      for (const other of FAMILIES) {
        if (other.id === id) continue;
        const m = detectSkeletonProfile(bones);
        expect(m.profile.id, `${id} misdetected`).not.toBe(other.id);
      }
    }
  });

  it('recognises every bone name each family actually ships', () => {
    // The converse of the coverage check: a generator typo can also leave a real
    // bone unclaimed, which shows up downstream as a silently dropped track.
    for (const { id, bones } of FAMILIES) {
      const m = detectSkeletonProfile(bones);
      const unrecognised = bones.filter(b => !m.sourceToCanonical.has(b));
      expect(unrecognised, `${id} left bones unmapped`).toEqual([]);
    }
  });
});
