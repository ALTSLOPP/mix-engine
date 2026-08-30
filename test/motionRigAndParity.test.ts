import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ClipState,
  MotionGraph,
  MotionMask,
  STANDARD_MASKS,
} from '../src/motion';

/**
 * Creates a standard 16-bone Humanoid Rig fixture matching Mixamo / UE canonical hierarchy:
 * Hips
 *  ├── Spine ── Spine1 ── Spine2 ── Neck ── Head
 *  │                         ├── LeftShoulder ── LeftArm ── LeftForeArm ── LeftHand
 *  │                         └── RightShoulder ── RightArm ── RightForeArm ── RightHand
 *  ├── LeftUpLeg ── LeftLeg ── LeftFoot
 *  └── RightUpLeg ── RightLeg ── RightFoot
 */
function createHumanoidRig(): { root: THREE.Object3D; bones: Map<string, THREE.Bone> } {
  const root = new THREE.Object3D();
  const bones = new Map<string, THREE.Bone>();

  const createBone = (name: string, parent?: THREE.Object3D) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bones.set(name, bone);
    if (parent) parent.add(bone);
    else root.add(bone);
    return bone;
  };

  const hips = createBone('Hips');
  const spine = createBone('Spine', hips);
  const spine1 = createBone('Spine1', spine);
  const spine2 = createBone('Spine2', spine1);
  const neck = createBone('Neck', spine2);
  createBone('Head', neck);

  const lShoulder = createBone('LeftShoulder', spine2);
  const lArm = createBone('LeftArm', lShoulder);
  const lForeArm = createBone('LeftForeArm', lArm);
  createBone('LeftHand', lForeArm);

  const rShoulder = createBone('RightShoulder', spine2);
  const rArm = createBone('RightArm', rShoulder);
  const rForeArm = createBone('RightForeArm', rArm);
  createBone('RightHand', rForeArm);

  const lUpLeg = createBone('LeftUpLeg', hips);
  const lLeg = createBone('LeftLeg', lUpLeg);
  createBone('LeftFoot', lLeg);

  const rUpLeg = createBone('RightUpLeg', hips);
  const rLeg = createBone('RightLeg', rUpLeg);
  createBone('RightFoot', rLeg);

  return { root, bones };
}

function createMultiTrackClip(
  name: string,
  duration = 1.0,
  boneTrackSpecs: Array<{ bone: string; prop: 'position' | 'quaternion'; values: number[] }>,
): THREE.AnimationClip {
  const times = [0, duration];
  const tracks: THREE.KeyframeTrack[] = [];

  for (const spec of boneTrackSpecs) {
    if (spec.prop === 'position') {
      tracks.push(new THREE.VectorKeyframeTrack(`${spec.bone}.position`, times, spec.values));
    } else {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${spec.bone}.quaternion`, times, spec.values));
    }
  }

  const clip = new THREE.AnimationClip(name, duration, tracks);
  const rootPosTrack = tracks.find((t) => t.name === 'Hips.position') as THREE.VectorKeyframeTrack;
  const rootRotTrack = tracks.find((t) => t.name === 'Hips.quaternion') as THREE.QuaternionKeyframeTrack;
  if (rootPosTrack) (clip as any).__rootTrack = rootPosTrack;
  if (rootRotTrack) (clip as any).__rootRotTrack = rootRotTrack;

  return clip;
}

describe('MIX Motion Director Production Parity Suite', () => {
  let rig: { root: THREE.Object3D; bones: Map<string, THREE.Bone> };
  let graph: MotionGraph;

  beforeEach(() => {
    rig = createHumanoidRig();
    graph = new MotionGraph(rig.root);
  });

  it('filters tracks per bone using MotionMask so upper-body layers do not clobber lower-body tracks', () => {
    // Locomotion clip drives Hips and LeftUpLeg
    const walkClip = createMultiTrackClip('walk', 1.0, [
      { bone: 'Hips', prop: 'position', values: [0, 0, 0, 0, 0, 1.0] },
      { bone: 'LeftUpLeg', prop: 'quaternion', values: [0, 0, 0, 1, 0.5, 0, 0, 0.866] },
      { bone: 'RightUpLeg', prop: 'quaternion', values: [0, 0, 0, 1, -0.5, 0, 0, 0.866] },
      { bone: 'LeftArm', prop: 'quaternion', values: [0, 0, 0, 1, 0.2, 0, 0, 0.98] },
    ]);

    // Attack clip drives LeftArm, RightArm, Spine2, and LeftUpLeg
    const punchClip = createMultiTrackClip('punch', 0.8, [
      { bone: 'LeftArm', prop: 'quaternion', values: [0, 0, 0, 1, 0.707, 0, 0, 0.707] },
      { bone: 'RightArm', prop: 'quaternion', values: [0, 0, 0, 1, 0.1, 0, 0, 0.99] },
      { bone: 'Spine2', prop: 'quaternion', values: [0, 0, 0, 1, 0, 0.3, 0, 0.95] },
      { bone: 'LeftUpLeg', prop: 'quaternion', values: [0, 0, 0, 1, 0, 0, 0, 1] }, // Should be masked out!
    ]);

    graph.registerClip('walk', walkClip);
    graph.registerClip('punch', punchClip);

    // Play walk on base layer (full body)
    graph.play('walk', { layer: 'base', fade: 0 });

    // Play punch on upperBody layer with upperBody mask
    const upperMask = new MotionMask(STANDARD_MASKS.upperBody);
    const upperLayer = graph.createLayer('upper', 1, 'override', upperMask);
    const punchHandle = graph.play('punch', { layer: 'upper', fade: 0 });

    // Verify punch runtime clip tracks were filtered
    const punchClipState = punchHandle.state as ClipState;
    const runtimeTracks = (punchClipState as any).runtimeClip.tracks as THREE.KeyframeTrack[];

    const trackBoneNames = runtimeTracks.map((t) => MotionMask.extractBoneNameFromTrack(t.name));
    expect(trackBoneNames).toContain('LeftArm');
    expect(trackBoneNames).toContain('RightArm');
    expect(trackBoneNames).toContain('Spine2');
    expect(trackBoneNames).not.toContain('LeftUpLeg'); // Masked out with weight 0!
  });

  it('supports additive layer blending with AdditiveAnimationBlendMode', () => {
    const idleClip = createMultiTrackClip('idle', 1.0, [
      { bone: 'Spine', prop: 'quaternion', values: [0, 0, 0, 1, 0, 0, 0, 1] },
    ]);

    // Flinch additive delta
    const flinchClip = createMultiTrackClip('flinch_additive', 0.5, [
      { bone: 'Spine', prop: 'quaternion', values: [0, 0, 0, 1, 0.1, 0, 0, 0.995] },
    ]);

    graph.registerClip('idle', idleClip);
    graph.registerClip('flinch', flinchClip);

    graph.play('idle', { layer: 'base', fade: 0 });

    const addLayer = graph.createLayer('additiveLayer', 1, 'additive');
    const flinchHandle = graph.play('flinch', { layer: 'additiveLayer', fade: 0 });

    const clipState = flinchHandle.state as ClipState;
    expect(clipState.blendMode).toBe('additive');
    expect((clipState as any).runtimeClip.blendMode).toBe(THREE.AdditiveAnimationBlendMode);
  });

  it('converts absolute additive keys to first-frame-relative deltas', () => {
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5);
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
    const clip = createMultiTrackClip('absolute_pose', 1, [
      { bone: 'Spine', prop: 'quaternion', values: [...q0.toArray(), ...q1.toArray()] },
    ]);
    graph.registerClip('absolute_pose', clip);
    graph.createLayer('additive', 1, 'additive');
    const state = graph.play('absolute_pose', { layer: 'additive', fade: 0 }).state as ClipState;
    const values = (state as any).runtimeClip.tracks[0].values as Float32Array;
    expect(values[0]).toBeCloseTo(0, 5);
    expect(values[1]).toBeCloseTo(0, 5);
    expect(values[2]).toBeCloseTo(0, 5);
    expect(values[3]).toBeCloseTo(1, 5);
  });

  it('applies partial bone-mask weights to separate runtime actions', () => {
    const clip = createMultiTrackClip('weighted_mask', 1, [
      { bone: 'Spine', prop: 'quaternion', values: [0, 0, 0, 1, 0.2, 0, 0, 0.98] },
      { bone: 'LeftArm', prop: 'quaternion', values: [0, 0, 0, 1, 0.5, 0, 0, 0.866] },
    ]);
    const mask = new MotionMask({ name: 'weighted', baseWeight: 0, boneWeights: { Spine: 0.5, LeftArm: 1 } });
    graph.registerClip('weighted_mask', clip);
    graph.createLayer('weighted', 1, 'override', mask);
    const state = graph.play('weighted_mask', { layer: 'weighted', fade: 0 }).state as ClipState;
    graph.update(0.1);
    const weights = ((state as any).weightedActions as Array<{ action: THREE.AnimationAction }>).map((v) => v.action.getEffectiveWeight()).sort();
    expect(weights).toEqual([0.5, 1]);
  });

  it('does not extract root motion from a layer whose mask excludes Hips', () => {
    const clip = createMultiTrackClip('upper_with_bad_root', 1, [
      { bone: 'Hips', prop: 'position', values: [0, 0, 0, 0, 0, 2] },
      { bone: 'LeftArm', prop: 'quaternion', values: [0, 0, 0, 1, 0.5, 0, 0, 0.866] },
    ]);
    graph.registerClip('upper_with_bad_root', clip);
    graph.createLayer('upperOnly', 1, 'override', new MotionMask(STANDARD_MASKS.upperBody));
    graph.play('upper_with_bad_root', { layer: 'upperOnly', fade: 0 });
    graph.update(0.5);
    expect(graph.getRootMotionDelta().lengthSq()).toBe(0);
  });

  it('extracts root motion quaternion yaw and 3D translation deltas', () => {
    // 90 degree yaw turn around Y axis over 1.0s
    // q(0) = (0, 0, 0, 1), q(1) = (0, sin(45 deg), 0, cos(45 deg)) = (0, 0.7071, 0, 0.7071)
    const turnClip = createMultiTrackClip('turn_right_90', 1.0, [
      { bone: 'Hips', prop: 'position', values: [0, 0, 0, 1.0, 0, 2.0] },
      { bone: 'Hips', prop: 'quaternion', values: [0, 0, 0, 1, 0, 0.7071068, 0, 0.7071068] },
    ]);

    graph.registerClip('turn90', turnClip);
    const handle = graph.play('turn90', { fade: 0, speed: 1.0 });

    // Update half-way (0.5s)
    graph.update(0.5);

    const transDelta = graph.getRootMotionDelta();
    expect(transDelta.x).toBeGreaterThan(0);
    expect(transDelta.z).toBeGreaterThan(0);

    const rotDelta = graph.getRootMotionRotationDelta();
    expect(rotDelta.y).toBeGreaterThan(0);

    const inspection = graph.inspect();
    expect(inspection.rootMotion.lastYawDelta).toBeGreaterThan(0);
  });

  it('supports interruption policy: queue', async () => {
    const atk1 = createMultiTrackClip('combo1', 0.4, []);
    const atk2 = createMultiTrackClip('combo2', 0.4, []);

    graph.registerClip('combo1', atk1);
    graph.registerClip('combo2', atk2);

    const h1 = graph.play('combo1', { loop: false, interruptionPolicy: 'queue', fade: 0 });
    const h2 = graph.play('combo2', { loop: false, interruptionPolicy: 'queue', fade: 0 });

    expect(h1.state.status).toBe('playing');
    const baseLayer = graph.getLayer('base')!;
    expect(baseLayer.queuedCount).toBe(1);

    // Update through combo1 duration
    graph.update(0.45);
    expect(['completed', 'stopped']).toContain(h1.state.status);
    expect(h2.state.status).toBe('playing');
  });


  it('supports interruption policy: rejectIfBusy', () => {
    const heavyAttack = createMultiTrackClip('heavy_atk', 1.0, []);
    const lightAttack = createMultiTrackClip('light_atk', 0.5, []);

    graph.registerClip('heavy', heavyAttack);
    graph.registerClip('light', lightAttack);

    const hHeavy = graph.play('heavy', { loop: false, fade: 0 });
    expect(hHeavy.state.status).toBe('playing');

    // Attempt to interrupt with light attack under rejectIfBusy
    const hLight = graph.play('light', { interruptionPolicy: 'rejectIfBusy' });
    expect(hLight.id).toBe(hHeavy.id); // Rejected -> returns active playing handle
    expect(graph.getLayer('base')!.currentState?.name).toBe('heavy');
  });

  it('indexes tags and aliases with transition library and query support', () => {
    const punch = createMultiTrackClip('punch_straight', 0.5, []);
    graph.registerClip('punch_straight', punch);

    graph.registerTransition({
      id: 'trans_straight_punch',
      clipName: 'punch_straight',
      fadeDuration: 0.1,
      aliases: ['jab', 'fast_strike'],
      tags: ['combat', 'uninterruptible'],
    });

    // Play by alias 'jab'
    const handle = graph.play('jab');
    expect(handle.state.name).toBe('punch_straight');
    expect(handle.state.tags).toContain('combat');
    expect(handle.state.tags).toContain('uninterruptible');

    expect(graph.hasTag('combat')).toBe(true);
    expect(graph.getStatesWithTag('combat').length).toBe(1);

    // Stop by tag
    graph.stopByTag('combat', 0);
    expect(handle.state.status).toBe('stopped');
  });

  it('prunes completed transient states from layers to prevent memory accumulation', () => {
    const attack = createMultiTrackClip('one_shot_fx', 0.2, []);
    graph.registerClip('one_shot_fx', attack);

    const handle = graph.play('one_shot_fx', { loop: false, fade: 0, isPersistent: false });
    const layer = graph.getLayer('base')!;
    expect(layer.getAllStates().length).toBe(1);

    // Update until clip completes and finishes
    graph.update(0.25);
    expect(handle.state.status).toBe('completed');

    // Next animation plays and crossfades old out
    const idle = createMultiTrackClip('idle_loop', 1.0, []);
    graph.registerClip('idle_loop', idle);
    graph.play('idle_loop', { fade: 0.1 });

    // Step through fade
    graph.update(0.15);

    // The completed transient one-shot state should be auto-pruned
    expect(layer.getState(handle.id)).toBeNull();
  });
});
