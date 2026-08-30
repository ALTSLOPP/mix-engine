import * as THREE from 'three';
import { MotionMask } from './MotionMask';
import { MotionState } from './MotionState';
import type { LayerBlendMode, MotionEventDef, MotionEventPayload } from './types';

const _tempQ0 = new THREE.Quaternion();
const _tempQ1 = new THREE.Quaternion();
const _scratchVec1 = new THREE.Vector3();
const _scratchVec2 = new THREE.Vector3();
const _scratchQuat1 = new THREE.Quaternion();
const _scratchQuat2 = new THREE.Quaternion();
const _scratchQuat3 = new THREE.Quaternion();
const _scratchQuat4 = new THREE.Quaternion();
const _identityQ = new THREE.Quaternion();

function sampleVec3Track(track: THREE.VectorKeyframeTrack, time: number, out: THREE.Vector3): THREE.Vector3 {
  const times = track.times;
  const values = track.values;
  const len = times.length;

  if (len === 0) return out.set(0, 0, 0);
  if (time <= times[0]) return out.set(values[0], values[1], values[2]);
  if (time >= times[len - 1]) {
    const idx = (len - 1) * 3;
    return out.set(values[idx], values[idx + 1], values[idx + 2]);
  }

  // Binary search for keyframe segment
  let low = 0;
  let high = len - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (times[mid] <= time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const i0 = Math.max(0, high);
  const i1 = Math.min(len - 1, low);
  const t0 = times[i0];
  const t1 = times[i1];
  const alpha = t1 > t0 ? (time - t0) / (t1 - t0) : 0;

  const idx0 = i0 * 3;
  const idx1 = i1 * 3;
  out.x = values[idx0] + (values[idx1] - values[idx0]) * alpha;
  out.y = values[idx0 + 1] + (values[idx1 + 1] - values[idx0 + 1]) * alpha;
  out.z = values[idx0 + 2] + (values[idx1 + 2] - values[idx0 + 2]) * alpha;
  return out;
}

function sampleQuatTrack(track: THREE.QuaternionKeyframeTrack, time: number, out: THREE.Quaternion): THREE.Quaternion {
  const times = track.times;
  const values = track.values;
  const len = times.length;

  if (len === 0) return out.identity();
  if (time <= times[0]) return out.set(values[0], values[1], values[2], values[3]);
  if (time >= times[len - 1]) {
    const idx = (len - 1) * 4;
    return out.set(values[idx], values[idx + 1], values[idx + 2], values[idx + 3]);
  }

  let low = 0;
  let high = len - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (times[mid] <= time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const i0 = Math.max(0, high);
  const i1 = Math.min(len - 1, low);
  const t0 = times[i0];
  const t1 = times[i1];
  const alpha = t1 > t0 ? (time - t0) / (t1 - t0) : 0;

  const idx0 = i0 * 4;
  const idx1 = i1 * 4;
  _scratchQuat1.set(values[idx0], values[idx0 + 1], values[idx0 + 2], values[idx0 + 3]);
  _scratchQuat2.set(values[idx1], values[idx1 + 1], values[idx1 + 2], values[idx1 + 3]);
  out.copy(_scratchQuat1).slerp(_scratchQuat2, alpha);
  return out;
}

/**
 * ClipState — Motion state wrapping a single Three.js AnimationAction with track masking,
 * additive layer support, and 6-DOF translation + yaw root motion extraction.
 */
export class ClipState extends MotionState {
  readonly clip: THREE.AnimationClip;
  readonly action: THREE.AnimationAction;
  readonly rootTrack: THREE.VectorKeyframeTrack | null = null;
  readonly rootRotTrack: THREE.QuaternionKeyframeTrack | null = null;
  readonly mask: MotionMask | null = null;
  readonly blendMode: LayerBlendMode = 'override';

  private lastSamplePos = new THREE.Vector3();
  private currentSamplePos = new THREE.Vector3();
  private frameRootDelta = new THREE.Vector3();

  private lastSampleRot = new THREE.Quaternion();
  private currentSampleRot = new THREE.Quaternion();
  private frameRootRotDelta = new THREE.Quaternion();
  private frameRootYawDelta = 0;
  private rootTranslationMaskWeight = 1;
  private rootRotationMaskWeight = 1;

  private isFirstSample = true;
  private readonly mixer: THREE.AnimationMixer;
  private readonly runtimeClip: THREE.AnimationClip;
  private readonly weightedActions: Array<{
    clip: THREE.AnimationClip;
    action: THREE.AnimationAction;
    maskWeight: number;
  }> = [];

  constructor(
    id: string,
    name: string,
    mixer: THREE.AnimationMixer,
    clip: THREE.AnimationClip,
    options: {
      rootTrack?: THREE.VectorKeyframeTrack | null;
      rootRotTrack?: THREE.QuaternionKeyframeTrack | null;
      mask?: MotionMask | null;
      blendMode?: LayerBlendMode;
      loop?: boolean;
      speed?: number;
      events?: MotionEventDef[];
    } = {},
  ) {
    super(id, name, options.events);
    this.clip = clip;
    this.mixer = mixer;
    this._duration = clip.duration;
    this.loop = options.loop ?? true;
    this.speed = options.speed ?? 1.0;
    this.mask = options.mask ?? null;
    this.blendMode = options.blendMode ?? 'override';

    this.rootTrack =
      options.rootTrack ??
      (clip as unknown as { __rootTrack?: THREE.VectorKeyframeTrack }).__rootTrack ??
      null;

    this.rootRotTrack =
      options.rootRotTrack ??
      (clip as unknown as { __rootRotTrack?: THREE.QuaternionKeyframeTrack }).__rootRotTrack ??
      null;

    if (this.mask) {
      if (this.rootTrack) {
        this.rootTranslationMaskWeight = this.mask.getBoneWeight(MotionMask.extractBoneNameFromTrack(this.rootTrack.name));
      }
      if (this.rootRotTrack) {
        this.rootRotationMaskWeight = this.mask.getBoneWeight(MotionMask.extractBoneNameFromTrack(this.rootRotTrack.name));
      }
    }

    const groups = this.mask
      ? this.mask.createWeightedClips(clip)
      : [{ clip: clip.clone(), weight: 1 }];
    // Preserve a valid action even for a mask that excludes every track.
    if (groups.length === 0) groups.push({ clip: new THREE.AnimationClip(`${clip.name}_empty`, clip.duration, []), weight: 0 });

    for (const group of groups) {
      const runtimeClip = group.clip.clone();
      if (this.blendMode === 'additive') {
        // A blend-mode flag alone is not enough: absolute keys must be converted
        // to deltas relative to the clip's first frame.
        THREE.AnimationUtils.makeClipAdditive(runtimeClip, 0, runtimeClip, 30);
      }
      const action = mixer.clipAction(runtimeClip);
      this.weightedActions.push({ clip: runtimeClip, action, maskWeight: group.weight });
    }

    this.runtimeClip = this.weightedActions[0].clip;
    this.action = this.weightedActions[0].action;
    this.configureAction();

    // Initialize root motion sampling positions at t=0
    if (this.rootTrack) {
      sampleVec3Track(this.rootTrack, this._time, this.lastSamplePos);
    }
    if (this.rootRotTrack) {
      sampleQuatTrack(this.rootRotTrack, this._time, this.lastSampleRot);
    }
  }

  private configureAction(): void {
    for (const { action } of this.weightedActions) {
      if (this.loop) {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.setEffectiveWeight(0);
      action.setEffectiveTimeScale(this.speed);
    }
  }

  override play(): this {
    super.play();
    for (const { action } of this.weightedActions) {
      action.enabled = true;
      action.paused = false;
      action.play();
    }
    return this;
  }

  override pause(): this {
    super.pause();
    for (const { action } of this.weightedActions) action.paused = true;
    return this;
  }

  override resume(): this {
    super.resume();
    for (const { action } of this.weightedActions) action.paused = false;
    return this;
  }

  override stop(): this {
    super.stop();
    for (const { action } of this.weightedActions) {
      action.stop();
      action.setEffectiveWeight(0);
    }
    this.frameRootDelta.set(0, 0, 0);
    this.frameRootRotDelta.identity();
    this.frameRootYawDelta = 0;
    if (this.rootTrack) {
      sampleVec3Track(this.rootTrack, 0, this.lastSamplePos);
    }
    if (this.rootRotTrack) {
      sampleQuatTrack(this.rootRotTrack, 0, this.lastSampleRot);
    }
    this.eventTrack.reset(0, 0);
    return this;
  }

  override setTime(time: number): this {
    super.setTime(time);
    for (const { action } of this.weightedActions) action.time = this._time;
    if (this.rootTrack) {
      sampleVec3Track(this.rootTrack, this._time, this.lastSamplePos);
    }
    if (this.rootRotTrack) {
      sampleQuatTrack(this.rootRotTrack, this._time, this.lastSampleRot);
    }
    return this;
  }

  override update(dt: number): MotionEventPayload[] {
    // If state is not playing and not fading, early exit
    if (this.status !== 'playing' && !this.fadeGroup.isFading()) {
      this.frameRootDelta.set(0, 0, 0);
      this.frameRootRotDelta.identity();
      this.frameRootYawDelta = 0;
      return [];
    }

    // Advance fade
    this.fadeGroup.update(dt);
    const w = this.weight;
    for (const weighted of this.weightedActions) {
      weighted.action.setEffectiveWeight(w * this.layerWeight * weighted.maskWeight);
      weighted.action.setEffectiveTimeScale(this.speed);
    }

    if (this.status !== 'playing') {
      this.frameRootDelta.set(0, 0, 0);
      this.frameRootRotDelta.identity();
      this.frameRootYawDelta = 0;
      return [];
    }

    // Track time and loop state
    const prevTime = this._time;
    const effectiveDt = dt * this.speed;
    let nextTime = prevTime + effectiveDt;
    let looped = false;


    if (this._duration > 0) {
      if (this.loop) {
        if (nextTime >= this._duration) {
          looped = true;
          nextTime = nextTime % this._duration;
        } else if (nextTime < 0) {
          looped = true;
          nextTime = (nextTime % this._duration) + this._duration;
        }
      } else {
        if (nextTime >= this._duration) {
          nextTime = this._duration;
          this.status = 'completed';
        } else if (nextTime < 0) {
          nextTime = 0;
          this.status = 'completed';
        }
      }

    }


    this._time = nextTime;

    // Evaluate root translation motion
    if (this.rootTrack && w > 0 && this.rootTranslationMaskWeight > 0) {
      sampleVec3Track(this.rootTrack, this._time, this.currentSamplePos);

      if (looped) {
        sampleVec3Track(this.rootTrack, this._duration, _scratchVec1);
        _scratchVec1.sub(this.lastSamplePos);

        sampleVec3Track(this.rootTrack, 0, _scratchVec2);
        this.frameRootDelta.copy(this.currentSamplePos).sub(_scratchVec2).add(_scratchVec1).multiplyScalar(w * this.rootTranslationMaskWeight);
        this.lastSamplePos.copy(this.currentSamplePos);
      } else {
        this.frameRootDelta.copy(this.currentSamplePos).sub(this.lastSamplePos).multiplyScalar(w * this.rootTranslationMaskWeight);
        this.lastSamplePos.copy(this.currentSamplePos);
      }
    } else {
      this.frameRootDelta.set(0, 0, 0);
    }

    // Evaluate root rotation / yaw motion
    if (this.rootRotTrack && w > 0 && this.rootRotationMaskWeight > 0) {
      sampleQuatTrack(this.rootRotTrack, this._time, this.currentSampleRot);

      // _scratchQuat1 = inv(lastSampleRot)
      _scratchQuat1.copy(this.lastSampleRot).invert();
      // _scratchQuat2 = currentSampleRot * inv(lastSampleRot)
      _scratchQuat2.copy(this.currentSampleRot).multiply(_scratchQuat1);

      if (looped) {
        // _scratchQuat3 = endRot * inv(lastSampleRot)
        sampleQuatTrack(this.rootRotTrack, this._duration, _scratchQuat3);
        _scratchQuat3.multiply(_scratchQuat1);

        // _scratchQuat4 = inv(startRot)
        sampleQuatTrack(this.rootRotTrack, 0, _scratchQuat4);
        _scratchQuat4.invert();

        // _scratchQuat1 = currentSampleRot * inv(startRot)
        _scratchQuat1.copy(this.currentSampleRot).multiply(_scratchQuat4);
        // rawDeltaQ = dQ2 * dQ1
        _scratchQuat2.copy(_scratchQuat1).multiply(_scratchQuat3);
      }

      // Extract pure yaw delta around vertical Y axis into _scratchQuat3
      _scratchQuat3.set(0, _scratchQuat2.y, 0, _scratchQuat2.w).normalize();
      const rawYawAngle = 2 * Math.atan2(_scratchQuat3.y, _scratchQuat3.w);

      // Scale rotation delta by state weight
      this.frameRootRotDelta.copy(_identityQ).slerp(_scratchQuat3, w * this.rootRotationMaskWeight);
      this.frameRootYawDelta = rawYawAngle * w * this.rootRotationMaskWeight;
      this.lastSampleRot.copy(this.currentSampleRot);
    } else {
      this.frameRootRotDelta.identity();
      this.frameRootYawDelta = 0;
    }



    // Evaluate events
    const fired = this.eventTrack.evaluate(
      this._time,
      this._duration,
      looped,
      this.speed,
      {
        clipId: this.name,
        stateId: this.id,
        layerIndex: this._layerIndex,
      },
    );

    return fired;
  }

  override extractRootDelta(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.frameRootDelta);
  }

  override extractRootRotationDelta(out: THREE.Quaternion): THREE.Quaternion {
    return out.copy(this.frameRootRotDelta);
  }

  extractRootYawDelta(): number {
    return this.frameRootYawDelta;
  }

  override dispose(): void {
    for (const weighted of this.weightedActions) {
      weighted.action.stop();
      this.mixer.uncacheAction(weighted.clip);
      this.mixer.uncacheClip(weighted.clip);
    }
    this.eventTrack.clearEvents();
  }
}
