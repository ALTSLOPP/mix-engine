import * as THREE from 'three';

/**
 * AnimationPack.ts — the user-facing pack model.
 *
 * A "pack" is what the user bought on Fab / Unity Asset Store / Mixamo: a
 * folder of 10–100 animations (FBX or glB) with a common skeleton, e.g.
 * "Sword Combat Pack 01", "Locomotion v3".  In MIX it becomes a single
 * registry entry that can be imported, previewed, and wired into the game
 * (characters + combat) with one IDE call.
 */

export type AnimationCategory =
  | 'locomotion' | 'idle' | 'combat' | 'hit_reaction' | 'death' | 'emote' | 'misc';

export interface PackEntryMeta {
  id: string;
  displayName: string;
  fileName: string;
  category: AnimationCategory;
  tags: string[];
  duration: number;
  loop: boolean;
  rootMotion: boolean;
  sourceProfileId: string;
  translationScale: number;
}

export interface AnimationPackDef {
  id: string;
  displayName: string;
  targetRig: string;
  sourcePath: string;
  createdAt: number;
  entries: PackEntryMeta[];
  boneMappingOverride?: Record<string, string>;
  /** Persisted agent workflow settings so reimport is deterministic across IDE sessions. */
  retargetOptions?: {
    qualityPreset?: 'aaa' | 'balanced' | 'fast';
    footLock?: boolean;
    keepRootMotion?: boolean;
    scaleOverride?: number;
  };
}

export interface RuntimeAnimationPack {
  def: AnimationPackDef;
  clips: Map<string, THREE.AnimationClip>;
}

const CATEGORY_HINTS: Array<[RegExp, AnimationCategory]> = [
  [/walk|run|strafe|locomotion|move/i, 'locomotion'],
  [/idle|stand/i, 'idle'],
  [/slash|attack|punch|kick|sword|strike|combo|shoot|fire/i, 'combat'],
  [/hit|hurt|react|flinch|knock/i, 'hit_reaction'],
  [/die|dying|death|dead|fall/i, 'death'],
  [/dance|wave|cheer|emote|gesture/i, 'emote'],
];

export function inferCategory(fileName: string, folderName?: string): AnimationCategory {
  const hay = `${folderName ?? ''} ${fileName}`;
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(hay)) return cat;
  return 'misc';
}

export function inferLoop(fileName: string, category: AnimationCategory): boolean {
  if (/(loop|idle|walk|run|strafe|cycle)/i.test(fileName)) return true;
  if (category === 'idle' || category === 'locomotion') return true;
  return false;
}

export function sanitizeEntryId(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'anim';
}

export function packEntryId(packId: string, entryId: string): string {
  return `anim_${packId}_${entryId}`;
}

export function assetIdForPackEntry(packId: string, entryId: string): string {
  return `pack:${packId}/${entryId}`;
}
