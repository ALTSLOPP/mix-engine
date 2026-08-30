import * as THREE from 'three';
import { TweenEase } from './TweenEase';
import { TweenValueAdapter } from './TweenValueAdapter';
import type {
  ConflictPolicy,
  EaseFunction,
  PhysicsPolicy,
  TweenCallbacks,
  TweenInterruptionReason,
  TweenOptions,
  TweenStatus,
  UpdateMode,
} from './types';
import type { ITweenControllable } from './TweenHandle';
import { TweenHandle } from './TweenHandle';

let nextTweenId = 1;

export class Tween implements ITweenControllable {
  readonly id: string;
  readonly tag?: string;
  target: any;
  property: string;
  canonicalKey: string;

  fromValue: any;
  toValue: any;
  currentValue: any;
  baseInitialValue: any;
  incrementalDelta: any;

  duration: number;
  delay: number;
  easeFn: EaseFunction;
  easeName: string;
  loops: number;
  loopType: 'restart' | 'yoyo' | 'incremental';
  loopDelay: number;
  timeScale: number;
  autoKill: boolean;
  updateMode: UpdateMode;
  conflictPolicy: ConflictPolicy;
  physicsPolicy: PhysicsPolicy;
  priority: number;

  stringMode: 'typewriter' | 'scramble' | 'numeric';
  scrambleCharset?: string;

  // Runtime State
  status: TweenStatus = 'idle';
  elapsed = 0;
  progress = 0;
  loopCount = 0;
  isReversed = false;
  delayRemaining = 0;
  loopDelayRemaining = 0;
  hasStarted = false;
  isFromTween = false;
  interruptionReason?: TweenInterruptionReason;

  // Callbacks
  private callbacks: TweenCallbacks;

  // Internal event hooks for handles
  private startHooks: Array<() => void> = [];
  private stepHooks: Array<(step: number) => void> = [];
  private loopHooks: Array<(loop: number) => void> = [];
  private completeHooks: Array<() => void> = [];
  private killHooks: Array<(reason: TweenInterruptionReason) => void> = [];

  constructor(
    target: any,
    property: string,
    toValue: any,
    options: TweenOptions = {},
    canonicalKey = '',
  ) {
    this.id = options.id ?? `tween_${nextTweenId++}`;
    this.tag = options.tag;
    this.target = target;
    this.property = property;
    this.toValue = TweenValueAdapter.cloneValue(toValue);
    this.canonicalKey = canonicalKey || `${this.id}#${property}`;

    this.duration = Math.max(0, options.duration ?? 1.0);
    this.delay = Math.max(0, options.delay ?? 0);
    this.delayRemaining = this.delay;

    this.easeName = typeof options.ease === 'string' ? options.ease : 'linear';
    this.easeFn = TweenEase.get(options.ease ?? 'linear', options.easeParams);

    this.loops = options.loops ?? 1;
    this.loopType = options.loopType ?? 'restart';
    this.loopDelay = Math.max(0, options.loopDelay ?? 0);
    this.timeScale = Math.max(0, options.timeScale ?? 1.0);
    this.autoKill = options.autoKill ?? true;
    this.updateMode = options.updateMode ?? 'normal';
    this.conflictPolicy = options.conflictPolicy ?? 'replace';
    this.physicsPolicy = options.physicsPolicy ?? 'visual_only';
    this.priority = options.priority ?? 0;

    this.stringMode = options.stringMode ?? 'typewriter';
    this.scrambleCharset = options.scrambleCharset;

    this.callbacks = {
      onStart: options.onStart,
      onUpdate: options.onUpdate,
      onStep: options.onStep,
      onLoop: options.onLoop,
      onComplete: options.onComplete,
      onKill: options.onKill,
      onPause: options.onPause,
      onResume: options.onResume,
      onRewind: options.onRewind,
    };

    if (options.autoPlay !== false) {
      this.status = 'playing';
    }
  }

  // --- Capture Initial Value ---
  captureInitialValue(): void {
    const rawVal = TweenValueAdapter.getNestedProperty(this.target, this.property);
    this.fromValue = TweenValueAdapter.cloneValue(rawVal);
    this.baseInitialValue = TweenValueAdapter.cloneValue(rawVal);
    this.currentValue = TweenValueAdapter.cloneValue(rawVal);

    if (this.loopType === 'incremental') {
      this.incrementalDelta = TweenValueAdapter.diffValues(this.fromValue, this.toValue);
    }
  }

  setFrom(fromVal: any): this {
    this.fromValue = TweenValueAdapter.cloneValue(fromVal);
    this.baseInitialValue = TweenValueAdapter.cloneValue(fromVal);
    this.currentValue = TweenValueAdapter.cloneValue(fromVal);
    this.isFromTween = true;

    if (this.loopType === 'incremental') {
      this.incrementalDelta = TweenValueAdapter.diffValues(this.fromValue, this.toValue);
    }
    return this;
  }

  // --- Step / Tick Update Loop ---
  update(dt: number): boolean {
    if (this.status !== 'playing') return false;
    if (dt === 0) return false;

    // Apply tween local time scale
    const delta = dt * this.timeScale;

    // 1. Handle initial start delay
    if (this.delayRemaining > 0) {
      this.delayRemaining -= delta;
      if (this.delayRemaining > 0) return false;
      // Remainder goes into active tween playback
      const overshoot = -this.delayRemaining;
      this.delayRemaining = 0;
      this.onStarted();
      return this.advanceTime(overshoot);
    }

    if (!this.hasStarted) {
      this.onStarted();
    }

    // 2. Handle loop delay
    if (this.loopDelayRemaining > 0) {
      this.loopDelayRemaining -= delta;
      if (this.loopDelayRemaining > 0) return false;
      const overshoot = -this.loopDelayRemaining;
      this.loopDelayRemaining = 0;
      return this.advanceTime(overshoot);
    }

    return this.advanceTime(delta);
  }

  private advanceTime(delta: number): boolean {
    if (this.duration === 0) {
      let remaining = Math.max(0, delta);
      let transitions = 0;
      while (this.status === 'playing') {
        if (++transitions > 100000) throw new Error(`[Tween] Excessive instant-loop traversal for '${this.id}'`);

        this.elapsed = this.isReversed ? 0 : this.duration;
        this.progress = this.isReversed ? 0 : 1;
        this.applyProgress();
        this.loopCount++;
        this.callbacks.onLoop?.(this.loopCount);
        this.loopHooks.forEach((h) => h(this.loopCount));

        const isInfinite = this.loops < 0 || this.loops === Infinity;
        if (!isInfinite && this.loopCount >= this.loops) {
          this.complete();
          return true;
        }

        if (this.loopType === 'yoyo') {
          this.isReversed = !this.isReversed;
        } else if (this.loopType === 'incremental' && !this.isReversed) {
          this.fromValue = TweenValueAdapter.cloneValue(this.toValue);
          this.toValue = TweenValueAdapter.addValues(this.toValue, this.incrementalDelta);
        }

        if (this.loopDelay > 0) {
          if (remaining <= this.loopDelay) {
            this.loopDelayRemaining = this.loopDelay - remaining;
            return false;
          }
          remaining -= this.loopDelay;
        } else if (isInfinite) {
          // A zero-duration infinite loop has no temporal boundary to consume. Advance
          // once per update rather than spinning forever in a single frame.
          return false;
        }
      }
      return this.status === 'completed';
    }

    let remaining = Math.max(0, delta);
    let transitions = 0;

    while (remaining > 0 && this.status === 'playing') {
      if (++transitions > 100000) {
        throw new Error(`[Tween] Excessive loop traversal for '${this.id}'`);
      }

      const distanceToBoundary = this.isReversed ? this.elapsed : this.duration - this.elapsed;
      if (remaining < distanceToBoundary) {
        this.elapsed += this.isReversed ? -remaining : remaining;
        remaining = 0;
        break;
      }

      this.elapsed = this.isReversed ? 0 : this.duration;
      remaining -= Math.max(0, distanceToBoundary);
      this.progress = this.isReversed ? 0 : 1;
      this.applyProgress();
      this.loopCount++;
      this.callbacks.onLoop?.(this.loopCount);
      this.loopHooks.forEach((h) => h(this.loopCount));

      const isInfinite = this.loops < 0 || this.loops === Infinity;
      if (!isInfinite && this.loopCount >= this.loops) {
        this.complete();
        return true;
      }

      if (this.loopDelay > 0) {
        if (remaining <= this.loopDelay) {
          this.loopDelayRemaining = this.loopDelay - remaining;
          remaining = 0;
        } else {
          remaining -= this.loopDelay;
        }
      }

      if (this.loopType === 'yoyo') {
        this.isReversed = !this.isReversed;
      } else if (this.loopType === 'incremental' && !this.isReversed) {
        this.fromValue = TweenValueAdapter.cloneValue(this.toValue);
        this.toValue = TweenValueAdapter.addValues(this.toValue, this.incrementalDelta);
        this.elapsed = 0;
      } else {
        this.elapsed = this.isReversed ? this.duration : 0;
      }
    }

    this.progress = Math.min(Math.max(this.elapsed / this.duration, 0), 1);
    this.applyProgress();
    return false;
  }

  private applyProgress(): void {
    const easedT = this.easeFn(this.progress);
    this.applyInterpolatedValue(easedT);
  }

  applyInterpolatedValue(easedT: number): void {
    if (!this.target) return;

    if (this.fromValue === undefined) {
      this.captureInitialValue();
    }

    const calculated = TweenValueAdapter.interpolate(
      this.fromValue,
      this.toValue,
      easedT,
      this.stringMode,
      this.scrambleCharset,
      this.currentValue,
    );

    this.currentValue = calculated;
    TweenValueAdapter.setNestedProperty(this.target, this.property, calculated);

    this.callbacks.onUpdate?.(this.progress, calculated);
    this.stepHooks.forEach((h) => h(this.elapsed));
  }

  private onStarted(): void {
    this.hasStarted = true;
    if (this.fromValue === undefined) {
      this.captureInitialValue();
    }
    if (this.isFromTween) {
      // Immediately set initial from pose
      TweenValueAdapter.setNestedProperty(this.target, this.property, this.fromValue);
    }
    this.callbacks.onStart?.();
    this.startHooks.forEach((h) => h());
  }

  // --- Control Operations ---

  play(): void {
    if (this.status === 'killed' || this.status === 'completed') {
      this.restart();
      return;
    }
    this.status = 'playing';
    this.callbacks.onResume?.();
  }

  pause(): void {
    if (this.status === 'playing') {
      this.status = 'paused';
      this.callbacks.onPause?.();
    }
  }

  resume(): void {
    if (this.status === 'paused') {
      this.status = 'playing';
      this.callbacks.onResume?.();
    }
  }

  kill(reason: TweenInterruptionReason = 'manual_kill'): void {
    if (this.status === 'killed') return;
    this.status = 'killed';
    this.interruptionReason = reason;
    this.callbacks.onKill?.(reason);
    this.killHooks.forEach((h) => h(reason));
  }

  complete(): void {
    if (this.status === 'completed' || this.status === 'killed') return;
    this.status = 'completed';
    const targetProgress = this.isReversed ? 0 : 1;
    this.elapsed = this.isReversed ? 0 : this.duration;
    this.progress = targetProgress;
    this.applyInterpolatedValue(targetProgress);

    this.callbacks.onComplete?.();
    this.completeHooks.forEach((h) => h());
  }

  restart(): void {
    this.interruptionReason = undefined;
    this.elapsed = 0;
    this.progress = 0;
    this.loopCount = 0;
    this.delayRemaining = this.delay;
    this.loopDelayRemaining = 0;
    this.isReversed = false;
    this.status = 'playing';

    if (this.loopType === 'incremental' && this.baseInitialValue !== undefined) {
      this.fromValue = TweenValueAdapter.cloneValue(this.baseInitialValue);
      this.toValue = TweenValueAdapter.addValues(this.fromValue, this.incrementalDelta);
    }

    if (this.fromValue !== undefined) {
      this.applyInterpolatedValue(0);
    }
  }

  rewind(): void {
    this.elapsed = 0;
    this.progress = 0;
    this.isReversed = false;
    this.status = 'paused';
    if (this.fromValue !== undefined) {
      this.applyInterpolatedValue(0);
    }
    this.callbacks.onRewind?.();
  }

  seek(time: number, andPlay = false): void {
    this.elapsed = Math.min(Math.max(time, 0), this.duration);
    this.progress = this.duration > 0 ? this.elapsed / this.duration : 1;
    this.applyProgress();
    if (andPlay) {
      this.play();
    } else {
      this.pause();
    }
  }

  seekNormalized(t: number, andPlay = false): void {
    const clamped = Math.min(Math.max(t, 0), 1);
    this.seek(clamped * this.duration, andPlay);
  }

  reverse(): void {
    this.isReversed = !this.isReversed;
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
  }

  // --- Hook Registration for TweenHandle ---

  onStartHook(cb: () => void): void {
    this.startHooks.push(cb);
  }

  onStepHook(cb: (step: number) => void): void {
    this.stepHooks.push(cb);
  }

  onLoopHook(cb: (loop: number) => void): void {
    this.loopHooks.push(cb);
  }

  onCompleteHook(cb: () => void): void {
    this.completeHooks.push(cb);
  }

  onKillHook(cb: (reason: TweenInterruptionReason) => void): void {
    this.killHooks.push(cb);
  }

  getHandle(): TweenHandle {
    return new TweenHandle(this);
  }
}
