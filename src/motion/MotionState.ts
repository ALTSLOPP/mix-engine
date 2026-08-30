import * as THREE from 'three';
import { FadeGroup } from './FadeGroup';
import { MotionEventTrack } from './MotionEventTrack';
import type {
  EasingType,
  FadeMode,
  MotionPlayStatus,
  MotionStateInfo,
  RootMotionMode,
  MotionEventDef,
  MotionEventPayload,
} from './types';

export abstract class MotionState {
  readonly id: string;
  name: string;
  speed = 1.0;
  loop = true;
  status: MotionPlayStatus = 'stopped';
  rootMotionMode: RootMotionMode = 'extractOnly';
  metadata: Record<string, unknown> = {};
  tags: string[] = [];
  aliases: string[] = [];
  isPersistent = false;
  /** Multiplier supplied by the containing layer. */
  layerWeight = 1.0;

  readonly fadeGroup = new FadeGroup(0);
  readonly eventTrack: MotionEventTrack;
  protected _time = 0;
  protected _duration = 0;
  protected _layerIndex = 0;

  constructor(id: string, name: string, events: MotionEventDef[] = []) {
    this.id = id;
    this.name = name;
    this.eventTrack = new MotionEventTrack(events);
  }

  get time(): number {
    return this._time;
  }

  set time(val: number) {
    this.setTime(val);
  }

  get normalizedTime(): number {
    return this._duration > 0 ? this._time / this._duration : 0;
  }

  set normalizedTime(val: number) {
    this.setNormalizedTime(val);
  }

  get duration(): number {
    return this._duration;
  }

  get weight(): number {
    return this.fadeGroup.weight;
  }

  set weight(val: number) {
    this.fadeGroup.weight = Math.max(0, val);
    this.fadeGroup.targetWeight = this.fadeGroup.weight;
  }

  get targetWeight(): number {
    return this.fadeGroup.targetWeight;
  }

  get layerIndex(): number {
    return this._layerIndex;
  }

  set layerIndex(val: number) {
    this._layerIndex = val;
  }

  play(): this {
    this.status = 'playing';
    return this;
  }

  pause(): this {
    if (this.status === 'playing') {
      this.status = 'paused';
    }
    return this;
  }

  resume(): this {
    if (this.status === 'paused') {
      this.status = 'playing';
    }
    return this;
  }

  stop(): this {
    this.status = 'stopped';
    this.fadeGroup.stop();
    this.fadeGroup.weight = 0;
    this.fadeGroup.targetWeight = 0;
    return this;
  }

  fade(
    targetWeight: number,
    duration: number,
    easing: EasingType = 'linear',
    _mode: FadeMode = 'fixedDuration',
    onComplete?: () => void,
  ): this {
    this.fadeGroup.fade(targetWeight, duration, easing, onComplete);
    if (targetWeight > 0 && this.status !== 'playing') {
      this.status = 'playing';
    }
    return this;
  }

  fadeIn(duration: number, easing: EasingType = 'linear', onComplete?: () => void): this {
    return this.fade(1.0, duration, easing, 'fixedDuration', onComplete);
  }

  fadeOut(duration: number, easing: EasingType = 'linear', onComplete?: () => void): this {
    return this.fade(0.0, duration, easing, 'fixedDuration', onComplete);
  }

  setTime(time: number): this {
    this._time = Math.max(0, time);
    if (this._duration > 0 && this.loop && this._time >= this._duration) {
      this._time = this._time % this._duration;
    }
    return this;
  }

  setNormalizedTime(nt: number): this {
    return this.setTime(nt * this._duration);
  }

  abstract update(dt: number): MotionEventPayload[];

  abstract extractRootDelta(out: THREE.Vector3): THREE.Vector3;

  extractRootRotationDelta(out: THREE.Quaternion): THREE.Quaternion {
    return out.identity();
  }

  abstract dispose(): void;

  getInfo(): MotionStateInfo {
    return {
      id: this.id,
      type: this.constructor.name,
      clipName: this.name,
      time: this._time,
      normalizedTime: this.normalizedTime,
      duration: this._duration,
      speed: this.speed,
      weight: this.weight,
      targetWeight: this.targetWeight,
      fadeDuration: this.fadeGroup.duration,
      fadeProgress: this.fadeGroup.progress,
      loop: this.loop,
      status: this.status,
      layer: this._layerIndex,
      activeEvents: this.eventTrack.getEventNames(),
      rootMotion: this.rootMotionMode,
      tags: [...this.tags],
      aliases: [...this.aliases],
      metadata: this.metadata,
    };
  }
}
