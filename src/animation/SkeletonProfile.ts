import * as THREE from 'three';

/**
 * SkeletonProfile.ts — canonical humanoid definitions + auto-detection.
 *
 * A "profile" is a humanoid template: canonical bone names, hierarchy hints,
 * and alias tables for source rigs (Mixamo, UE Manny, FBX humanoid, glTF
 * vendors, etc).  The importer sniffs a loaded skeleton, scores each profile
 * by alias hits, and picks the best — then the RetargetEngine can map every
 * track name canonical→target consistently.
 */

export const CANONICAL_BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  // fingers (optional)
  'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
  'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3',
  'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
  'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3',
  'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
  'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
  'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3',
  'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
  'RightHandRing1', 'RightHandRing2', 'RightHandRing3',
  'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3',
] as const;

export type CanonicalBone = typeof CANONICAL_BONES[number];

export const REQUIRED_CANONICAL: CanonicalBone[] = [
  'Hips', 'Spine', 'Head',
  'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg',
];

export interface SkeletonProfile {
  id: string;
  label: string;
  boneAliases: Partial<Record<CanonicalBone, string[]>>;
  rootBone: CanonicalBone;
  scaleFactor?: number;
  /** Normalized source bone names that MUST appear for this profile to be
   *  considered. Prevents ambiguous rigs (UE `Leg`=thigh vs generic `Leg`=calf,
   *  plain `LeftArm` shared by many rigs) from being mis-detected. */
  markers?: string[];
}

function a(...aliases: string[]): string[] { return aliases; }

/**
 * Alias tables are deliberately PURE per-rig (mixamo lists only `mixamorig*`
 * variants; UE lists only `pelvis/spine_01/...`). Cross-rig sources are
 * handled by the canonical bridge in buildRetargetNameMap — shared aliases
 * here would make detection ambiguous (UE rigs scoring as "mixamo", which
 * also poisons the profile scaleFactor fallback).
 */
export const SKELETON_PROFILES: SkeletonProfile[] = [
  {
    id: 'mixamo',
    label: 'Mixamo (mixamorig:)',
    rootBone: 'Hips',
    scaleFactor: 0.01,
    boneAliases: {
      Hips: a('mixamorigHips'),
      Spine: a('mixamorigSpine'),
      Spine1: a('mixamorigSpine1'),
      Spine2: a('mixamorigSpine2'),
      Neck: a('mixamorigNeck'),
      Head: a('mixamorigHead'),
      LeftShoulder: a('mixamorigLeftShoulder'),
      RightShoulder: a('mixamorigRightShoulder'),
      LeftArm: a('mixamorigLeftArm'),
      LeftForeArm: a('mixamorigLeftForeArm'),
      LeftHand: a('mixamorigLeftHand'),
      RightArm: a('mixamorigRightArm'),
      RightForeArm: a('mixamorigRightForeArm'),
      RightHand: a('mixamorigRightHand'),
      LeftUpLeg: a('mixamorigLeftUpLeg'),
      LeftLeg: a('mixamorigLeftLeg'),
      LeftFoot: a('mixamorigLeftFoot'),
      LeftToeBase: a('mixamorigLeftToeBase'),
      RightUpLeg: a('mixamorigRightUpLeg'),
      RightLeg: a('mixamorigRightLeg'),
      RightFoot: a('mixamorigRightFoot'),
      RightToeBase: a('mixamorigRightToeBase'),
      LeftHandThumb1: a('mixamorigLeftHandThumb1'),
      LeftHandThumb2: a('mixamorigLeftHandThumb2'),
      LeftHandThumb3: a('mixamorigLeftHandThumb3'),
      LeftHandIndex1: a('mixamorigLeftHandIndex1'),
      LeftHandIndex2: a('mixamorigLeftHandIndex2'),
      LeftHandIndex3: a('mixamorigLeftHandIndex3'),
      LeftHandMiddle1: a('mixamorigLeftHandMiddle1'),
      LeftHandMiddle2: a('mixamorigLeftHandMiddle2'),
      LeftHandMiddle3: a('mixamorigLeftHandMiddle3'),
      LeftHandRing1: a('mixamorigLeftHandRing1'),
      LeftHandRing2: a('mixamorigLeftHandRing2'),
      LeftHandRing3: a('mixamorigLeftHandRing3'),
      LeftHandPinky1: a('mixamorigLeftHandPinky1'),
      LeftHandPinky2: a('mixamorigLeftHandPinky2'),
      LeftHandPinky3: a('mixamorigLeftHandPinky3'),
      RightHandThumb1: a('mixamorigRightHandThumb1'),
      RightHandThumb2: a('mixamorigRightHandThumb2'),
      RightHandThumb3: a('mixamorigRightHandThumb3'),
      RightHandIndex1: a('mixamorigRightHandIndex1'),
      RightHandIndex2: a('mixamorigRightHandIndex2'),
      RightHandIndex3: a('mixamorigRightHandIndex3'),
      RightHandMiddle1: a('mixamorigRightHandMiddle1'),
      RightHandMiddle2: a('mixamorigRightHandMiddle2'),
      RightHandMiddle3: a('mixamorigRightHandMiddle3'),
      RightHandRing1: a('mixamorigRightHandRing1'),
      RightHandRing2: a('mixamorigRightHandRing2'),
      RightHandRing3: a('mixamorigRightHandRing3'),
      RightHandPinky1: a('mixamorigRightHandPinky1'),
      RightHandPinky2: a('mixamorigRightHandPinky2'),
      RightHandPinky3: a('mixamorigRightHandPinky3'),
    },
  },
  {
    id: 'ue_mannequin',
    label: 'Unreal UE4/5 Mannequin',
    rootBone: 'Hips',
    scaleFactor: 0.01, // cm → m
    boneAliases: {
      // NOTE: no 'root' alias — UE rigs (and many others) carry a 'root' bone
      // ABOVE the pelvis that must never be mapped onto Hips.
      Hips: a('pelvis', 'Pelvis'),
      Spine: a('spine_01', 'Spine_01'),
      Spine1: a('spine_02', 'Spine_02'),
      Spine2: a('spine_03', 'Spine_03', 'spine_04', 'spine_05', 'Spine_04', 'Spine_05'),
      Neck: a('neck_01', 'Neck_01', 'neck_02', 'Neck_02'),
      Head: a('head', 'Head'),
      LeftShoulder: a('clavicle_l', 'Clavicle_L', 'clavicle_left'),
      RightShoulder: a('clavicle_r', 'Clavicle_R', 'clavicle_right'),
      LeftArm: a('upperarm_l', 'UpperArm_L', 'upperarm_left'),
      LeftForeArm: a('lowerarm_l', 'LowerArm_L', 'lowerarm_left'),
      LeftHand: a('hand_l', 'Hand_L', 'hand_left'),
      RightArm: a('upperarm_r', 'UpperArm_R', 'upperarm_right'),
      RightForeArm: a('lowerarm_r', 'LowerArm_R', 'lowerarm_right'),
      RightHand: a('hand_r', 'Hand_R', 'hand_right'),
      LeftUpLeg: a('thigh_l', 'Thigh_L', 'thigh_left'),
      LeftLeg: a('calf_l', 'Calf_L', 'calf_left'),
      LeftFoot: a('foot_l', 'Foot_L', 'foot_left'),
      LeftToeBase: a('ball_l', 'Ball_L', 'ball_left'),
      RightUpLeg: a('thigh_r', 'Thigh_R', 'thigh_right'),
      RightLeg: a('calf_r', 'Calf_R', 'calf_right'),
      RightFoot: a('foot_r', 'Foot_R', 'foot_right'),
      RightToeBase: a('ball_r', 'Ball_R', 'ball_right'),
      LeftHandThumb1: a('thumb_01_l', 'Thumb_01_L'),
      LeftHandThumb2: a('thumb_02_l', 'Thumb_02_L'),
      LeftHandThumb3: a('thumb_03_l', 'Thumb_03_L'),
      LeftHandIndex1: a('index_01_l', 'Index_01_L'),
      LeftHandIndex2: a('index_02_l', 'Index_02_L'),
      LeftHandIndex3: a('index_03_l', 'Index_03_L'),
      LeftHandMiddle1: a('middle_01_l', 'Middle_01_L'),
      LeftHandMiddle2: a('middle_02_l', 'Middle_02_L'),
      LeftHandMiddle3: a('middle_03_l', 'Middle_03_L'),
      LeftHandRing1: a('ring_01_l', 'Ring_01_L'),
      LeftHandRing2: a('ring_02_l', 'Ring_02_L'),
      LeftHandRing3: a('ring_03_l', 'Ring_03_L'),
      LeftHandPinky1: a('pinky_01_l', 'Pinky_01_L'),
      LeftHandPinky2: a('pinky_02_l', 'Pinky_02_L'),
      LeftHandPinky3: a('pinky_03_l', 'Pinky_03_L'),
      RightHandThumb1: a('thumb_01_r', 'Thumb_01_R'),
      RightHandThumb2: a('thumb_02_r', 'Thumb_02_R'),
      RightHandThumb3: a('thumb_03_r', 'Thumb_03_R'),
      RightHandIndex1: a('index_01_r', 'Index_01_R'),
      RightHandIndex2: a('index_02_r', 'Index_02_R'),
      RightHandIndex3: a('index_03_r', 'Index_03_R'),
      RightHandMiddle1: a('middle_01_r', 'Middle_01_R'),
      RightHandMiddle2: a('middle_02_r', 'Middle_02_R'),
      RightHandMiddle3: a('middle_03_r', 'Middle_03_R'),
      RightHandRing1: a('ring_01_r', 'Ring_01_R'),
      RightHandRing2: a('ring_02_r', 'Ring_02_R'),
      RightHandRing3: a('ring_03_r', 'Ring_03_R'),
      RightHandPinky1: a('pinky_01_r', 'Pinky_01_R'),
      RightHandPinky2: a('pinky_02_r', 'Pinky_02_R'),
      RightHandPinky3: a('pinky_03_r', 'Pinky_03_R'),
    },
  },
  {
    id: 'ue_motifect',
    label: 'Unreal FBX (Motifect / Spine1·Chest / Leg·Shin)',
    rootBone: 'Hips',
    scaleFactor: 0.01, // cm → m
    markers: ['chest', 'neck1', 'shin'],
    boneAliases: {
      Hips: a('Hips'),
      Spine: a('Spine1'),
      Spine1: a('Spine2'),
      Spine2: a('Chest'),
      Neck: a('Neck1'),
      Head: a('Head'),
      LeftShoulder: a('LeftShoulder'),
      LeftArm: a('LeftArm'),
      LeftForeArm: a('LeftForeArm'),
      LeftHand: a('LeftHand'),
      RightShoulder: a('RightShoulder'),
      RightArm: a('RightArm'),
      RightForeArm: a('RightForeArm'),
      RightHand: a('RightHand'),
      LeftUpLeg: a('LeftLeg'),
      LeftLeg: a('LeftShin'),
      LeftFoot: a('LeftFoot'),
      LeftToeBase: a('LeftToeBase'),
      RightUpLeg: a('RightLeg'),
      RightLeg: a('RightShin'),
      RightFoot: a('RightFoot'),
      RightToeBase: a('RightToeBase'),
      LeftHandThumb1: a('LeftHandThumb1'),
      LeftHandThumb2: a('LeftHandThumb2'),
      LeftHandThumb3: a('LeftHandThumb3'),
      LeftHandIndex1: a('LeftHandIndex1'),
      LeftHandIndex2: a('LeftHandIndex2'),
      LeftHandIndex3: a('LeftHandIndex3'),
      LeftHandMiddle1: a('LeftHandMiddle1'),
      LeftHandMiddle2: a('LeftHandMiddle2'),
      LeftHandMiddle3: a('LeftHandMiddle3'),
      LeftHandRing1: a('LeftHandRing1'),
      LeftHandRing2: a('LeftHandRing2'),
      LeftHandRing3: a('LeftHandRing3'),
      LeftHandPinky1: a('LeftHandPinky1'),
      LeftHandPinky2: a('LeftHandPinky2'),
      LeftHandPinky3: a('LeftHandPinky3'),
      RightHandThumb1: a('RightHandThumb1'),
      RightHandThumb2: a('RightHandThumb2'),
      RightHandThumb3: a('RightHandThumb3'),
      RightHandIndex1: a('RightHandIndex1'),
      RightHandIndex2: a('RightHandIndex2'),
      RightHandIndex3: a('RightHandIndex3'),
      RightHandMiddle1: a('RightHandMiddle1'),
      RightHandMiddle2: a('RightHandMiddle2'),
      RightHandMiddle3: a('RightHandMiddle3'),
      RightHandRing1: a('RightHandRing1'),
      RightHandRing2: a('RightHandRing2'),
      RightHandRing3: a('RightHandRing3'),
      RightHandPinky1: a('RightHandPinky1'),
      RightHandPinky2: a('RightHandPinky2'),
      RightHandPinky3: a('RightHandPinky3'),
    },
  },
  {
    id: 'humanoid_generic',
    label: 'Generic Humanoid (Hips/Spine/...)',
    rootBone: 'Hips',
    boneAliases: {
      Hips: a('Hips', 'hips', 'pelvis'),
      Spine: a('Spine', 'spine', 'Spine1', 'spine_01'),
      Spine1: a('Spine1', 'Spine2', 'spine_02'),
      Spine2: a('Spine2', 'Spine3', 'spine_03'),
      Neck: a('Neck', 'neck'),
      Head: a('Head', 'head'),
      LeftArm: a('LeftArm', 'LeftUpperArm', 'UpperArm_L'),
      LeftForeArm: a('LeftForeArm', 'LeftLowerArm', 'LowerArm_L'),
      LeftHand: a('LeftHand', 'Hand_L'),
      RightArm: a('RightArm', 'RightUpperArm', 'UpperArm_R'),
      RightForeArm: a('RightForeArm', 'RightLowerArm', 'LowerArm_R'),
      RightHand: a('RightHand', 'Hand_R'),
      LeftUpLeg: a('LeftUpLeg', 'LeftUpperLeg', 'Thigh_L'),
      LeftLeg: a('LeftLeg', 'LeftLowerLeg', 'Calf_L'),
      LeftFoot: a('LeftFoot', 'Foot_L'),
      RightUpLeg: a('RightUpLeg', 'RightUpperLeg', 'Thigh_R'),
      RightLeg: a('RightLeg', 'RightLowerLeg', 'Calf_R'),
      RightFoot: a('RightFoot', 'Foot_R'),
    },
  },
];

// ─── Additional rig families ───────────────────────────────────────────────
//
// Written as generators rather than 52-line literal tables: the naming schemes below
// are all perfectly regular, so spelling every finger out by hand is just an
// opportunity for typos that show up as one silently unmapped bone.

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;

/** Expand a finger naming scheme into the 30 finger canonicals. */
function fingerAliases(
  make: (side: 'Left' | 'Right', group: typeof FINGERS[number], segment: 1 | 2 | 3) => string | string[],
): Partial<Record<CanonicalBone, string[]>> {
  const out: Partial<Record<CanonicalBone, string[]>> = {};
  for (const side of ['Left', 'Right'] as const) {
    for (const group of FINGERS) {
      for (const segment of [1, 2, 3] as const) {
        const made = make(side, group, segment);
        out[`${side}Hand${group}${segment}` as CanonicalBone] = Array.isArray(made) ? made : [made];
      }
    }
  }
  return out;
}

/** Expand a limb naming scheme into the 16 limb canonicals. */
function limbAliases(
  make: (side: 'Left' | 'Right', part: 'Shoulder' | 'Arm' | 'ForeArm' | 'Hand' | 'UpLeg' | 'Leg' | 'Foot' | 'ToeBase') => string | string[] | null,
): Partial<Record<CanonicalBone, string[]>> {
  const out: Partial<Record<CanonicalBone, string[]>> = {};
  for (const side of ['Left', 'Right'] as const) {
    for (const part of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase'] as const) {
      const made = make(side, part);
      if (made) out[`${side}${part}` as CanonicalBone] = Array.isArray(made) ? made : [made];
    }
  }
  return out;
}

const VRM_PART: Record<string, string> = {
  Shoulder: 'Shoulder', Arm: 'UpperArm', ForeArm: 'LowerArm', Hand: 'Hand',
  UpLeg: 'UpperLeg', Leg: 'LowerLeg', Foot: 'Foot', ToeBase: 'ToeBase',
};

const RIGIFY_PART: Record<string, string> = {
  Shoulder: 'shoulder', Arm: 'upper_arm', ForeArm: 'forearm', Hand: 'hand',
  UpLeg: 'thigh', Leg: 'shin', Foot: 'foot', ToeBase: 'toe',
};

const DAZ_PART: Record<string, string> = {
  Shoulder: 'Collar', Arm: 'ShldrBend', ForeArm: 'ForearmBend', Hand: 'Hand',
  UpLeg: 'ThighBend', Leg: 'Shin', Foot: 'Foot', ToeBase: 'Toe',
};

const BIPED_PART: Record<string, string> = {
  Shoulder: 'Clavicle', Arm: 'UpperArm', ForeArm: 'Forearm', Hand: 'Hand',
  UpLeg: 'Thigh', Leg: 'Calf', Foot: 'Foot', ToeBase: 'Toe0',
};

SKELETON_PROFILES.push(
  {
    id: 'vrm',
    label: 'VRM / UniVRM (J_Bip_*)',
    rootBone: 'Hips',
    markers: ['J_Bip_C_Hips'],
    boneAliases: {
      Hips: a('J_Bip_C_Hips'),
      Spine: a('J_Bip_C_Spine'),
      Spine1: a('J_Bip_C_Chest'),
      Spine2: a('J_Bip_C_UpperChest'),
      Neck: a('J_Bip_C_Neck'),
      Head: a('J_Bip_C_Head'),
      ...limbAliases((side, part) => `J_Bip_${side[0]}_${VRM_PART[part]}`),
      // VRM names the pinky "Little" and segments Proximal/Intermediate/Distal.
      ...fingerAliases((side, group, seg) =>
        `J_Bip_${side[0]}_${group === 'Pinky' ? 'Little' : group}_${['Proximal', 'Intermediate', 'Distal'][seg - 1]}`),
    },
  },
  {
    id: 'rigify',
    label: 'Blender Rigify / metarig (upper_arm.L)',
    rootBone: 'Hips',
    // Blender-specific segment names. `upper_arm` alone would also match a UE rig's
    // `upperarm_l` once separators are stripped, so gate on the distinctive ones.
    markers: ['shin.L', 'DEF-shin.L', 'forearm.L', 'DEF-forearm.L'],
    boneAliases: {
      Hips: a('spine', 'DEF-spine', 'hips', 'torso'),
      Spine: a('spine.001', 'DEF-spine.001'),
      Spine1: a('spine.002', 'DEF-spine.002', 'chest'),
      Spine2: a('spine.003', 'DEF-spine.003'),
      Neck: a('neck', 'DEF-neck', 'spine.004', 'DEF-spine.004'),
      Head: a('head', 'DEF-head', 'spine.006', 'DEF-spine.006'),
      ...limbAliases((side, part) => {
        const s = side === 'Left' ? 'L' : 'R';
        return [`${RIGIFY_PART[part]}.${s}`, `DEF-${RIGIFY_PART[part]}.${s}`];
      }),
      ...fingerAliases((side, group, seg) => {
        const s = side === 'Left' ? 'L' : 'R';
        const n = String(seg).padStart(2, '0');
        // Thumbs have no `f_` prefix in Rigify; everything else does.
        const base = group === 'Thumb' ? `thumb.${n}.${s}` : `f_${group.toLowerCase()}.${n}.${s}`;
        return [base, `DEF-${base}`];
      }),
    },
  },
  {
    id: 'daz_genesis',
    label: 'Daz Genesis 3/8 (lShldrBend)',
    rootBone: 'Hips',
    markers: ['lShldrBend', 'lThighBend', 'rShldrBend'],
    boneAliases: {
      Hips: a('hip', 'pelvis'),
      Spine: a('abdomenLower', 'abdomen'),
      Spine1: a('abdomenUpper', 'abdomen2'),
      Spine2: a('chestLower', 'chest'),
      Neck: a('neckLower', 'neck'),
      Head: a('head'),
      ...limbAliases((side, part) => `${side === 'Left' ? 'l' : 'r'}${DAZ_PART[part]}`),
      ...fingerAliases((side, group, seg) => {
        const s = side === 'Left' ? 'l' : 'r';
        const g = group === 'Middle' ? 'Mid' : group;
        return `${s}${g}${seg}`;
      }),
    },
  },
  {
    id: 'max_biped',
    label: '3ds Max Biped (Bip01 L UpperArm)',
    rootBone: 'Hips',
    markers: ['Bip01 Pelvis', 'Bip001 Pelvis'],
    boneAliases: {
      Hips: a('Bip01 Pelvis', 'Bip001 Pelvis'),
      Spine: a('Bip01 Spine', 'Bip001 Spine'),
      Spine1: a('Bip01 Spine1', 'Bip001 Spine1'),
      Spine2: a('Bip01 Spine2', 'Bip001 Spine2'),
      Neck: a('Bip01 Neck', 'Bip001 Neck'),
      Head: a('Bip01 Head', 'Bip001 Head'),
      ...limbAliases((side, part) =>
        [`Bip01 ${side[0]} ${BIPED_PART[part]}`, `Bip001 ${side[0]} ${BIPED_PART[part]}`]),
      // Biped numbers fingers 0..4 with segments as trailing digits: thumb is
      // Finger0 / Finger01 / Finger02, index is Finger1 / Finger11 / Finger12.
      ...fingerAliases((side, group, seg) => {
        const f = FINGERS.indexOf(group);
        const tail = seg === 1 ? `${f}` : `${f}${seg - 1}`;
        return [`Bip01 ${side[0]} Finger${tail}`, `Bip001 ${side[0]} Finger${tail}`];
      }),
    },
  },
);

export interface SkeletonProfileMatch {
  profile: SkeletonProfile;
  score: number;
  sourceToCanonical: Map<string, CanonicalBone>;
  canonicalToSource: Map<CanonicalBone, string>;
  missingRequired: CanonicalBone[];
}

/**
 * Normalize a bone name for alias matching: lowercase + strip separators.
 * Needed because the same rig shows up as `mixamorig:Hips` in raw FBX,
 * `mixamorigHips` after GLTFLoader sanitization, and `mixamorig_Hips` in some
 * exporters — all must match the same alias.
 */
export function normalizeBoneName(name: string): string {
  return name.toLowerCase().replace(/[\s:\-_.]/g, '');
}

export function detectSkeletonProfile(boneNames: string[]): SkeletonProfileMatch {
  // normalized → original name (first wins)
  const normIndex = new Map<string, string>();
  for (const n of boneNames) {
    const k = normalizeBoneName(n);
    if (!k) continue;
    if (!normIndex.has(k)) normIndex.set(k, n);
  }

  let best: SkeletonProfileMatch | null = null;

  for (const profile of SKELETON_PROFILES) {
    // Marker gate: skip profiles whose distinctive bones are absent, so an
    // ambiguous rig can't be claimed by the wrong profile (Leg=thigh vs Leg=calf).
    if (profile.markers && profile.markers.length > 0) {
      const hasMarker = profile.markers.some(m => normIndex.has(normalizeBoneName(m)));
      if (!hasMarker) continue;
    }
    let hits = 0;
    const canonicalToSource = new Map<CanonicalBone, string>();
    const sourceToCanonical = new Map<string, CanonicalBone>();

    for (const canon of CANONICAL_BONES) {
      const aliases = profile.boneAliases[canon];
      if (!aliases) continue;
      for (const alias of aliases) {
        const hit = normIndex.get(normalizeBoneName(alias));
        if (hit) {
          hits += 1;
          canonicalToSource.set(canon, hit);
          sourceToCanonical.set(hit, canon);
          break;
        }
      }
    }
    const score = hits / CANONICAL_BONES.length;
    const missingRequired = REQUIRED_CANONICAL.filter(c => !canonicalToSource.has(c));
    const m: SkeletonProfileMatch = { profile, score, sourceToCanonical, canonicalToSource, missingRequired };
    if (!best || m.score > best.score) best = m;
  }
  if (!best) {
    // By id, not by index — this used to read SKELETON_PROFILES[2], which is
    // `ue_motifect`, and would silently hand back a UE profile as "generic".
    const generic = SKELETON_PROFILES.find(p => p.id === 'humanoid_generic') ?? SKELETON_PROFILES[0];
    return { profile: generic, score: 0, sourceToCanonical: new Map(), canonicalToSource: new Map(), missingRequired: [...REQUIRED_CANONICAL] };
  }
  return best;
}

export function buildRetargetNameMap(
  srcMatch: SkeletonProfileMatch,
  dstMatch: SkeletonProfileMatch,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [srcName, canon] of srcMatch.sourceToCanonical) {
    const dst = dstMatch.canonicalToSource.get(canon);
    if (dst) out.set(srcName, dst);
  }
  return out;
}

export function collectBoneNamesFromClips(clips: THREE.AnimationClip[]): string[] {
  const s = new Set<string>();
  // FBXLoader may emit `Hips|Hips|Take1|BaseLayer.position`; only the first
  // pipe segment is the actual bone/model name.
  for (const clip of clips) {
    for (const t of clip.tracks) {
      const modelPath = t.name.split('.')[0];
      s.add(modelPath.split('|')[0].trim());
    }
  }
  return [...s];
}

export function collectBoneNamesFromObject(root: THREE.Object3D): string[] {
  const out: string[] = [];
  root.traverse(o => {
    if ((o as THREE.Bone).isBone || (o as THREE.SkinnedMesh).isSkinnedMesh) {
      if (o.name) out.push(o.name);
    }
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      for (const b of sm.skeleton.bones) if (b.name && !out.includes(b.name)) out.push(b.name);
    }
  });
  if (out.length < 5) {
    root.traverse(o => { if (o.name && !out.includes(o.name)) out.push(o.name); });
  }
  return out;
}

export function suggestScaleFactor(srcMatch: SkeletonProfileMatch, _dstMatch: SkeletonProfileMatch): number {
  // The engine's root-motion convention is METERS (hips position deltas feed the
  // physics body directly). A profile's scaleFactor is "multiply source units by
  // this to get meters" (e.g. Mixamo cm exports → 0.01), so converting the source
  // to meters is just the source factor — the target's naming is irrelevant.
  // This is only the fallback; RetargetEngine measures per-clip when possible.
  return srcMatch.profile.scaleFactor ?? 1;
}
