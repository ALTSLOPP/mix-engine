import * as THREE from 'three';
import type { CanonicalBone } from '../animation/SkeletonProfile';
import { detectSkeletonProfile } from '../animation/SkeletonProfile';
import type { MotionMaskDef } from './types';


/**
 * Standard humanoid bone hierarchy tree for canonical bones.
 */
const CANONICAL_HIERARCHY: Record<CanonicalBone, CanonicalBone | null> = {
  Hips: null,
  Spine: 'Hips',
  Spine1: 'Spine',
  Spine2: 'Spine1',
  Neck: 'Spine2',
  Head: 'Neck',
  LeftShoulder: 'Spine2',
  LeftArm: 'LeftShoulder',
  LeftForeArm: 'LeftArm',
  LeftHand: 'LeftForeArm',
  LeftHandThumb1: 'LeftHand',
  LeftHandThumb2: 'LeftHandThumb1',
  LeftHandThumb3: 'LeftHandThumb2',
  LeftHandIndex1: 'LeftHand',
  LeftHandIndex2: 'LeftHandIndex1',
  LeftHandIndex3: 'LeftHandIndex2',
  LeftHandMiddle1: 'LeftHand',
  LeftHandMiddle2: 'LeftHandMiddle1',
  LeftHandMiddle3: 'LeftHandMiddle2',
  LeftHandRing1: 'LeftHand',
  LeftHandRing2: 'LeftHandRing1',
  LeftHandRing3: 'LeftHandRing2',
  LeftHandPinky1: 'LeftHand',
  LeftHandPinky2: 'LeftHandPinky1',
  LeftHandPinky3: 'LeftHandPinky2',
  RightShoulder: 'Spine2',
  RightArm: 'RightShoulder',
  RightForeArm: 'RightArm',
  RightHand: 'RightForeArm',
  RightHandThumb1: 'RightHand',
  RightHandThumb2: 'RightHandThumb1',
  RightHandThumb3: 'RightHandThumb2',
  RightHandIndex1: 'RightHand',
  RightHandIndex2: 'RightHandIndex1',
  RightHandIndex3: 'RightHandIndex2',
  RightHandMiddle1: 'RightHand',
  RightHandMiddle2: 'RightHandMiddle1',
  RightHandMiddle3: 'RightHandMiddle2',
  RightHandRing1: 'RightHand',
  RightHandRing2: 'RightHandRing1',
  RightHandRing3: 'RightHandRing2',
  RightHandPinky1: 'RightHand',
  RightHandPinky2: 'RightHandPinky1',
  RightHandPinky3: 'RightHandPinky2',
  LeftUpLeg: 'Hips',
  LeftLeg: 'LeftUpLeg',
  LeftFoot: 'LeftLeg',
  LeftToeBase: 'LeftFoot',
  RightUpLeg: 'Hips',
  RightLeg: 'RightUpLeg',
  RightFoot: 'RightLeg',
  RightToeBase: 'RightFoot',
};

/**
 * Built-in standard mask definitions.
 */
export const STANDARD_MASKS: Record<string, MotionMaskDef> = {
  fullBody: {
    name: 'fullBody',
    baseWeight: 1.0,
    boneWeights: {},
  },
  upperBody: {
    name: 'upperBody',
    baseWeight: 0.0,
    hierarchical: true,
    boneWeights: {
      Spine: 0.5,
      Spine1: 0.8,
      Spine2: 1.0,
      Neck: 1.0,
      Head: 1.0,
      LeftShoulder: 1.0,
      RightShoulder: 1.0,
    },
  },
  lowerBody: {
    name: 'lowerBody',
    baseWeight: 0.0,
    hierarchical: true,
    boneWeights: {
      Hips: 1.0,
      LeftUpLeg: 1.0,
      RightUpLeg: 1.0,
      Spine: 0.0, // Stop at spine
    },
  },
  leftArmOnly: {
    name: 'leftArmOnly',
    baseWeight: 0.0,
    hierarchical: true,
    boneWeights: {
      LeftShoulder: 1.0,
      LeftArm: 1.0,
    },
  },
  rightArmOnly: {
    name: 'rightArmOnly',
    baseWeight: 0.0,
    hierarchical: true,
    boneWeights: {
      RightShoulder: 1.0,
      RightArm: 1.0,
    },
  },
  headOnly: {
    name: 'headOnly',
    baseWeight: 0.0,
    hierarchical: true,
    boneWeights: {
      Neck: 0.8,
      Head: 1.0,
    },
  },
};

/**
 * MotionMask — Weighted bone mask with hierarchical resolution and cross-rig canonical mapping.
 */
export class MotionMask {
  readonly name: string;
  readonly baseWeight: number;
  readonly hierarchical: boolean;
  private boneWeights = new Map<string, number>();
  private resolvedCache = new Map<string, number>();
  private sourceToCanonical = new Map<string, CanonicalBone>();

  constructor(def: MotionMaskDef) {
    this.name = def.name ?? 'customMask';
    this.baseWeight = def.baseWeight ?? 0.0;
    this.hierarchical = def.hierarchical ?? true;

    for (const [k, v] of Object.entries(def.boneWeights)) {
      this.boneWeights.set(k, Math.max(0, Math.min(1, v)));
    }
  }

  /**
   * Bind a set of skeleton bone names (from live rig or clip) to discover canonical mapping.
   */
  bindSkeleton(boneNames: string[]): void {
    const match = detectSkeletonProfile(boneNames);
    this.sourceToCanonical = match.sourceToCanonical;
    this.resolvedCache.clear();
  }

  /**
   * Get the weight (0.0 to 1.0) for a given bone name.
   */
  getBoneWeight(boneName: string): number {
    // Check cache
    if (this.resolvedCache.has(boneName)) {
      return this.resolvedCache.get(boneName)!;
    }

    // Direct match by exact bone name
    if (this.boneWeights.has(boneName)) {
      const w = this.boneWeights.get(boneName)!;
      this.resolvedCache.set(boneName, w);
      return w;
    }

    // Canonical lookup
    const canonical = this.sourceToCanonical.get(boneName) ?? (boneName as CanonicalBone);
    if (this.boneWeights.has(canonical)) {
      const w = this.boneWeights.get(canonical)!;
      this.resolvedCache.set(boneName, w);
      return w;
    }

    // Hierarchical lookup up the canonical spine/tree
    if (this.hierarchical && canonical in CANONICAL_HIERARCHY) {
      let parent: CanonicalBone | null = CANONICAL_HIERARCHY[canonical];
      while (parent) {
        if (this.boneWeights.has(parent)) {
          const w = this.boneWeights.get(parent)!;
          this.resolvedCache.set(boneName, w);
          return w;
        }
        parent = CANONICAL_HIERARCHY[parent] ?? null;
      }
    }

    // Fall back to baseWeight
    this.resolvedCache.set(boneName, this.baseWeight);
    return this.baseWeight;
  }

  setBoneWeight(boneName: string, weight: number): void {
    this.boneWeights.set(boneName, Math.max(0, Math.min(1, weight)));
    this.resolvedCache.clear();
  }

  /**
   * Filter and modulate animation tracks for a clip based on this mask's bone weights.
   */
  filterTracks(tracks: THREE.KeyframeTrack[]): THREE.KeyframeTrack[] {
    if (tracks.length === 0) return [];

    // Auto-discover bone names from track names if not yet bound
    if (this.sourceToCanonical.size === 0) {
      const discoveredBones = new Set<string>();
      for (const track of tracks) {
        const boneName = MotionMask.extractBoneNameFromTrack(track.name);
        if (boneName) discoveredBones.add(boneName);
      }
      if (discoveredBones.size > 0) {
        this.bindSkeleton(Array.from(discoveredBones));
      }
    }

    const filtered: THREE.KeyframeTrack[] = [];
    for (const track of tracks) {
      const boneName = MotionMask.extractBoneNameFromTrack(track.name);
      const weight = this.getBoneWeight(boneName);
      if (weight > 0.001) {
        filtered.push(track.clone());
      }
    }
    return filtered;
  }

  /**
   * Create a masked clone of an AnimationClip containing only tracks permitted by this mask.
   */
  createMaskedClip(clip: THREE.AnimationClip): THREE.AnimationClip {
    const maskedTracks = this.filterTracks(clip.tracks);
    const maskedClip = new THREE.AnimationClip(
      `${clip.name}_masked_${this.name}`,
      clip.duration,
      maskedTracks,
      clip.blendMode,
    );

    const origRootTrack = (clip as unknown as { __rootTrack?: THREE.VectorKeyframeTrack }).__rootTrack;
    const origRootRotTrack = (clip as unknown as { __rootRotTrack?: THREE.QuaternionKeyframeTrack }).__rootRotTrack;
    if (origRootTrack && maskedTracks.some((t) => t.name === origRootTrack.name)) {
      (maskedClip as unknown as { __rootTrack?: THREE.VectorKeyframeTrack }).__rootTrack = origRootTrack;
    }
    if (origRootRotTrack && maskedTracks.some((t) => t.name === origRootRotTrack.name)) {
      (maskedClip as unknown as { __rootRotTrack?: THREE.QuaternionKeyframeTrack }).__rootRotTrack = origRootRotTrack;
    }

    return maskedClip;
  }

  /**
   * Split a clip into per-weight track groups. Three.js weights an entire
   * AnimationAction, so separate actions are required for genuine weighted masks.
   */
  createWeightedClips(clip: THREE.AnimationClip): Array<{ clip: THREE.AnimationClip; weight: number }> {
    if (this.sourceToCanonical.size === 0) {
      const names = clip.tracks.map((track) => MotionMask.extractBoneNameFromTrack(track.name));
      this.bindSkeleton(Array.from(new Set(names.filter(Boolean))));
    }

    const groups = new Map<number, THREE.KeyframeTrack[]>();
    for (const track of clip.tracks) {
      const weight = this.getBoneWeight(MotionMask.extractBoneNameFromTrack(track.name));
      if (weight <= 0.001) continue;
      const key = Math.round(weight * 10000) / 10000;
      const tracks = groups.get(key) ?? [];
      tracks.push(track.clone());
      groups.set(key, tracks);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => b - a)
      .map(([weight, tracks], index) => ({
        weight,
        clip: new THREE.AnimationClip(`${clip.name}_masked_${this.name}_${index}`, clip.duration, tracks, clip.blendMode),
      }));
  }

  /**
   * Extract the bone name component from a Three.js track name.
   * Handles formats: "Hips.position", ".bones[Hips].position", "mixamorig:Spine.quaternion", "Armature/Spine1.quaternion".
   */
  static extractBoneNameFromTrack(trackName: string): string {
    const lastDot = trackName.lastIndexOf('.');
    let bonePart = lastDot !== -1 ? trackName.slice(0, lastDot) : trackName;

    // Handle .bones[Name] or .bones["Name"]
    const bracketMatch = /bones\[["']?([^"'\]]+)["']?\]/.exec(bonePart);
    if (bracketMatch) {
      return bracketMatch[1];
    }

    const lastSlash = bonePart.lastIndexOf('/');
    if (lastSlash !== -1) {
      bonePart = bonePart.slice(lastSlash + 1);
    }
    return bonePart;
  }


  toJSON(): MotionMaskDef {
    const weights: Record<string, number> = {};
    for (const [k, v] of this.boneWeights.entries()) {
      weights[k] = v;
    }
    return {
      name: this.name,
      baseWeight: this.baseWeight,
      hierarchical: this.hierarchical,
      boneWeights: weights,
    };
  }

  static fromPreset(presetName: string): MotionMask {
    const def = STANDARD_MASKS[presetName] ?? STANDARD_MASKS.fullBody;
    return new MotionMask(def);
  }
}
