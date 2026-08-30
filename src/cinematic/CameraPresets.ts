import * as THREE from 'three';

/**
 * CameraPresets.ts — 18 built-in viewport camera presets that ship with the engine.
 *
 * Every preset is a concrete pose (position + lookAt + fov + optional roll) that works
 * out-of-the-box on an empty scene (looks at 0,1,0) but also re-anchors to the current
 * scene pivot when applied: the Engine's `applyCameraPreset` translates the preset so
 * its lookAt coincides with the scene's bounding-box centre (or the selected entity).
 * That means presets are always meaningful — they don't strand the camera looking at
 * empty origin when the action is 50m away.
 *
 * Presets are numbered to roughly match Unreal/Unity conventions plus extra cinematic
 * flavours requested by users (isometric, top-down, dutch angles, etc.).
 */
export interface CameraPreset {
  id: string;
  name: string;
  description: string;
  /** World-space position offset from the pivot (added to pivot). */
  position: [number, number, number];
  /** World-space look-at offset from the pivot. */
  lookAt: [number, number, number];
  fov: number;
  roll?: number;
  /** Tag for UI grouping. */
  group: 'standard' | 'directional' | 'cinematic' | 'gameplay';
}

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  // ── Standard ──────────────────────────────────────────────────────────
  {
    id: 'default',
    name: 'Default',
    description: 'Classic 3/4 editor view — the session start pose (6,5,12 → 0,1.5,0).',
    position: [6, 5, 12],
    lookAt: [0, 1.5, 0],
    fov: 58,
    group: 'standard',
  },
  {
    id: 'wide',
    name: 'Wide Establishing',
    description: 'Pulled-back establishing shot. Good for framing a whole village/compound.',
    position: [14, 8, 18],
    lookAt: [0, 1, 0],
    fov: 65,
    group: 'standard',
  },
  {
    id: 'closeup',
    name: 'Close-Up',
    description: 'Intimate close-up (2m in front, chest height). Great for dialogue.',
    position: [0, 1.6, 2.8],
    lookAt: [0, 1.6, 0],
    fov: 50,
    group: 'standard',
  },
  {
    id: 'isometric',
    name: 'Isometric',
    description: '30° isometric game view — equal axes, slight top-down. Ideal for tactics/builders.',
    position: [10, 10, 10],
    lookAt: [0, 0, 0],
    fov: 38,
    group: 'standard',
  },
  {
    id: 'top_down',
    name: 'Top-Down',
    description: 'Direct overhead. Perfect for map/layout checks and top-down gameplay.',
    position: [0, 20, 0.01],
    lookAt: [0, 0, 0],
    fov: 45,
    group: 'standard',
  },
  {
    id: 'bottom_up',
    name: 'Worm’s Eye',
    description: 'Extreme low angle looking up — makes subjects feel towering/powerful.',
    position: [2, 0.4, 6],
    lookAt: [0, 2, 0],
    fov: 62,
    group: 'standard',
  },
  // ── Directional (cardinal) ────────────────────────────────────────────
  {
    id: 'front',
    name: 'Front',
    description: 'Straight-on front view. Character faces camera.',
    position: [0, 1.7, 10],
    lookAt: [0, 1.7, 0],
    fov: 50,
    group: 'directional',
  },
  {
    id: 'back',
    name: 'Back',
    description: 'Straight-on from behind. See what the character sees.',
    position: [0, 1.7, -10],
    lookAt: [0, 1.7, 0],
    fov: 50,
    group: 'directional',
  },
  {
    id: 'left',
    name: 'Left Profile',
    description: '90° left side profile.',
    position: [-10, 1.7, 0],
    lookAt: [0, 1.7, 0],
    fov: 50,
    group: 'directional',
  },
  {
    id: 'right',
    name: 'Right Profile',
    description: '90° right side profile.',
    position: [10, 1.7, 0],
    lookAt: [0, 1.7, 0],
    fov: 50,
    group: 'directional',
  },
  {
    id: 'three_quarter',
    name: 'Three-Quarter',
    description: 'Flattering 45° three-quarter view — the default character turntable angle.',
    position: [7, 2.2, 7],
    lookAt: [0, 1.4, 0],
    fov: 52,
    group: 'directional',
  },
  // ── Cinematic ────────────────────────────────────────────────────────
  {
    id: 'bird_eye',
    name: 'Bird’s Eye',
    description: 'High oblique “drone” shot. Slightly behind and above the action.',
    position: [4, 14, 10],
    lookAt: [0, 0, 0],
    fov: 48,
    group: 'cinematic',
  },
  {
    id: 'low_angle',
    name: 'Low Angle Hero',
    description: 'Ground-level hero shot. Camera low, looking slightly up.',
    position: [3, 0.7, 7],
    lookAt: [0, 1.4, 0],
    fov: 58,
    group: 'cinematic',
  },
  {
    id: 'high_angle',
    name: 'High Angle',
    description: 'Elevated surveillance style — looks down on the subject.',
    position: [5, 11, 9],
    lookAt: [0, 1, 0],
    fov: 50,
    group: 'cinematic',
  },
  {
    id: 'dutch_left',
    name: 'Dutch Left',
    description: 'Tilted 18° left Dutch angle — tension / unease.',
    position: [6, 2.5, 8],
    lookAt: [0, 1.5, 0],
    fov: 55,
    roll: THREE.MathUtils.degToRad(18),
    group: 'cinematic',
  },
  {
    id: 'dutch_right',
    name: 'Dutch Right',
    description: 'Tilted 18° right Dutch angle — mirror of Dutch Left.',
    position: [-6, 2.5, 8],
    lookAt: [0, 1.5, 0],
    fov: 55,
    roll: THREE.MathUtils.degToRad(-18),
    group: 'cinematic',
  },
  // ── Gameplay ─────────────────────────────────────────────────────────
  {
    id: 'over_shoulder',
    name: 'Over-Shoulder',
    description: 'Third-person over-the-shoulder (slightly behind & to the right, tight FOV).',
    position: [0.9, 1.8, -2.2],
    lookAt: [0, 1.6, 4],
    fov: 62,
    group: 'gameplay',
  },
  {
    id: 'fps_eyes',
    name: 'First-Person Eyes',
    description: 'Eye-level FPS view — camera sits where the character’s eyes are.',
    position: [0, 1.65, 0.2],
    lookAt: [0, 1.65, 10],
    fov: 78,
    group: 'gameplay',
  },
] as const;

export const CAMERA_PRESET_IDS = CAMERA_PRESETS.map(p => p.id) as unknown as string[];

export function getCameraPreset(id: string): CameraPreset | undefined {
  return CAMERA_PRESETS.find(p => p.id === id);
}

/**
 * Resolve a preset to absolute world-space pose.
 * If a pivot is supplied, position+lookAt are treated as offsets from that pivot
 * (so the preset re-anchors to wherever the action is). Otherwise they are used as
 * literal world coordinates (the stock definitions centred at the origin).
 */
export function resolvePresetPose(
  preset: CameraPreset,
  pivot: THREE.Vector3 | null,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
): { fov: number; roll?: number } {
  if (pivot) {
    // Position/lookAt in the preset are stored as offsets from a zero-pivot.
    // The stock default pivot for those offsets is (0, yOffsetLook,0) — we simply
    // treat the stored values as relative: pivot + (preset - originPivot).
    // Origin pivot used at authoring time was roughly (0,1.5,0)/ (0,0,0).
    // Simpler: just add pivot to both. For presets where lookAt is intentionally
    // at ground (top_down etc), this correctly lifts them to the action.
    outPos.set(preset.position[0], preset.position[1], preset.position[2]).add(pivot);
    // Heuristic: if lookAt was 0,0,0 we move it to pivot; if it was 0,1.5,0 we move to pivot+up.
    // Equivalent to: outLook = pivot + lookAt
    outLook.set(preset.lookAt[0], preset.lookAt[1], preset.lookAt[2]).add(pivot);
    // Special: for presets authored with lookAt 0,0,0 we already add pivot, correct.
  } else {
    outPos.set(preset.position[0], preset.position[1], preset.position[2]);
    outLook.set(preset.lookAt[0], preset.lookAt[1], preset.lookAt[2]);
  }
  return { fov: preset.fov, roll: preset.roll };
}
