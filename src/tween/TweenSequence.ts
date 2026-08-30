import type {
  ConflictPolicy,
  SequenceOptions,
  TweenCallbacks,
  TweenInterruptionReason,
  TweenOptions,
  TweenStatus,
  UpdateMode,
} from './types';
import type { ITweenControllable } from './TweenHandle';
import { TweenHandle } from './TweenHandle';
import { Tween } from './Tween';
import { TweenTrack, type TweenTrackItem } from './TweenTrack';

let nextSequenceId = 1;

export class TweenSequence implements ITweenControllable {
  readonly id: string;
  readonly tag?: string;

  private track = new TweenTrack();
  private labels = new Map<string, number>();
  private markers = new Map<string, number>();

  duration = 0;
  elapsed = 0;
  progress = 0;
  loops = 1;
  loopType: 'restart' | 'yoyo' | 'incremental' = 'restart';
  loopDelay = 0;
  timeScale = 1.0;
  autoKill = true;
  updateMode: UpdateMode = 'normal';
  conflictPolicy: ConflictPolicy = 'replace';

  status: TweenStatus = 'idle';
  loopCount = 0;
  isReversed = false;
  loopDelayRemaining = 0;
  hasStarted = false;
  interruptionReason?: TweenInterruptionReason;

  private lastAppendedStartTime = 0;
  private lastAppendedDuration = 0;

  // Callbacks
  private callbacks: TweenCallbacks;

  // Internal hooks for handles
  private startHooks: Array<() => void> = [];
  private stepHooks: Array<(step: number) => void> = [];
  private loopHooks: Array<(loop: number) => void> = [];
  private completeHooks: Array<() => void> = [];
  private killHooks: Array<(reason: TweenInterruptionReason) => void> = [];
  private markerHooks = new Map<string, Array<() => void>>();

  constructor(options: SequenceOptions = {}) {
    this.id = options.id ?? `seq_${nextSequenceId++}`;
    this.tag = options.tag;
    this.timeScale = Math.max(0, options.timeScale ?? 1.0);
    this.autoKill = options.autoKill ?? true;
    this.updateMode = options.updateMode ?? 'normal';
    this.loops = options.loops ?? 1;
    this.loopType = options.loopType ?? 'restart';
    this.loopDelay = Math.max(0, options.loopDelay ?? 0);
    this.conflictPolicy = options.conflictPolicy ?? 'replace';

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

  // --- Sequence Composition API ---

  append(
    item: Tween | TweenSequence | (() => void) | number,
    duration?: number,
  ): this {
    const startTime = this.duration;

    if (typeof item === 'number') {
      return this.appendInterval(item);
    }

    if (typeof item === 'function') {
      const itemDur = duration ?? 0;
      this.track.addItem({
        id: `cb_${Math.random()}`,
        kind: 'callback',
        startTime,
        duration: itemDur,
        endTime: startTime + itemDur,
        callback: item,
      });
      this.lastAppendedStartTime = startTime;
      this.lastAppendedDuration = itemDur;
      this.recalculateDuration();
      return this;
    }

    if (item instanceof Tween) {
      item.pause();
      const itemDur = item.duration;
      this.track.addItem({
        id: item.id,
        kind: 'tween',
        startTime,
        duration: itemDur,
        endTime: startTime + itemDur,
        tween: item,
      });
      this.lastAppendedStartTime = startTime;
      this.lastAppendedDuration = itemDur;
      this.recalculateDuration();
      return this;
    }

    if (item instanceof TweenSequence) {
      item.pause();
      const itemDur = item.duration;
      this.track.addItem({
        id: item.id,
        kind: 'sequence',
        startTime,
        duration: itemDur,
        endTime: startTime + itemDur,
        sequence: item,
      });
      this.lastAppendedStartTime = startTime;
      this.lastAppendedDuration = itemDur;
      this.recalculateDuration();
      return this;
    }

    return this;
  }

  prepend(item: Tween | TweenSequence | (() => void)): this {
    const itemDur = item instanceof Tween || item instanceof TweenSequence ? item.duration : 0;

    // Shift all existing items forward by itemDur
    for (const existing of this.track.items) {
      existing.startTime += itemDur;
      existing.endTime += itemDur;
    }

    // Shift labels and markers
    for (const [k, v] of this.labels) this.labels.set(k, v + itemDur);
    for (const [k, v] of this.markers) this.markers.set(k, v + itemDur);

    if (typeof item === 'function') {
      this.track.addItem({
        id: `cb_${Math.random()}`,
        kind: 'callback',
        startTime: 0,
        duration: 0,
        endTime: 0,
        callback: item,
      });
    } else if (item instanceof Tween) {
      item.pause();
      this.track.addItem({
        id: item.id,
        kind: 'tween',
        startTime: 0,
        duration: itemDur,
        endTime: itemDur,
        tween: item,
      });
    } else if (item instanceof TweenSequence) {
      item.pause();
      this.track.addItem({
        id: item.id,
        kind: 'sequence',
        startTime: 0,
        duration: itemDur,
        endTime: itemDur,
        sequence: item,
      });
    }

    this.recalculateDuration();
    return this;
  }

  join(item: Tween | TweenSequence | (() => void)): this {
    const startTime = this.lastAppendedStartTime;

    if (typeof item === 'function') {
      this.track.addItem({
        id: `cb_${Math.random()}`,
        kind: 'callback',
        startTime,
        duration: 0,
        endTime: startTime,
        callback: item,
      });
      this.recalculateDuration();
      return this;
    }

    if (item instanceof Tween) {
      item.pause();
      const itemDur = item.duration;
      this.track.addItem({
        id: item.id,
        kind: 'tween',
        startTime,
        duration: itemDur,
        endTime: startTime + itemDur,
        tween: item,
      });
      this.lastAppendedDuration = Math.max(this.lastAppendedDuration, itemDur);
      this.recalculateDuration();
      return this;
    }

    if (item instanceof TweenSequence) {
      item.pause();
      const itemDur = item.duration;
      this.track.addItem({
        id: item.id,
        kind: 'sequence',
        startTime,
        duration: itemDur,
        endTime: startTime + itemDur,
        sequence: item,
      });
      this.lastAppendedDuration = Math.max(this.lastAppendedDuration, itemDur);
      this.recalculateDuration();
      return this;
    }

    return this;
  }

  insert(atTime: number, item: Tween | TweenSequence | (() => void)): this {
    const startTime = Math.max(0, atTime);

    if (typeof item === 'function') {
      this.track.addItem({
        id: `cb_${Math.random()}`,
        kind: 'callback',
        startTime,
        duration: 0,
        endTime: startTime,
        callback: item,
      });
    } else if (item instanceof Tween) {
      item.pause();
      this.track.addItem({
        id: item.id,
        kind: 'tween',
        startTime,
        duration: item.duration,
        endTime: startTime + item.duration,
        tween: item,
      });
    } else if (item instanceof TweenSequence) {
      item.pause();
      this.track.addItem({
        id: item.id,
        kind: 'sequence',
        startTime,
        duration: item.duration,
        endTime: startTime + item.duration,
        sequence: item,
      });
    }

    this.recalculateDuration();
    return this;
  }

  appendInterval(seconds: number): this {
    const dur = Math.max(0, seconds);
    const startTime = this.duration;
    this.track.addItem({
      id: `interval_${Math.random()}`,
      kind: 'interval',
      startTime,
      duration: dur,
      endTime: startTime + dur,
    });
    this.lastAppendedStartTime = startTime;
    this.lastAppendedDuration = dur;
    this.recalculateDuration();
    return this;
  }

  appendCallback(callback: () => void): this {
    return this.append(callback);
  }

  appendMarker(markerName: string, offset = 0): this {
    const time = this.duration + offset;
    return this.addMarker(markerName, time);
  }

  addMarker(name: string, time: number): this {
    const t = Math.max(0, time);
    this.markers.set(name, t);
    this.track.addItem({
      id: `marker_${name}`,
      kind: 'marker',
      startTime: t,
      duration: 0,
      endTime: t,
      markerName: name,
    });
    this.recalculateDuration();
    return this;
  }

  addLabel(name: string, time?: number): this {
    const t = time !== undefined ? Math.max(0, time) : this.duration;
    this.labels.set(name, t);
    return this;
  }

  getTimeOfLabel(name: string): number | undefined {
    return this.labels.get(name);
  }

  getTimeOfMarker(name: string): number | undefined {
    return this.markers.get(name);
  }

  // --- Convenience Shorthand Helpers ---

  appendMove(target: any, to: any, duration = 1.0, ease?: any): this {
    const tw = new Tween(target, 'position', to, { duration, ease, autoPlay: false });
    return this.append(tw);
  }

  joinMove(target: any, to: any, duration = 1.0, ease?: any): this {
    const tw = new Tween(target, 'position', to, { duration, ease, autoPlay: false });
    return this.join(tw);
  }

  appendRotate(target: any, to: any, duration = 1.0, ease?: any): this {
    const tw = new Tween(target, 'rotation', to, { duration, ease, autoPlay: false });
    return this.append(tw);
  }

  joinRotate(target: any, to: any, duration = 1.0, ease?: any): this {
    const tw = new Tween(target, 'rotation', to, { duration, ease, autoPlay: false });
    return this.join(tw);
  }

  appendScale(target: any, to: any, duration = 1.0, ease?: any): this {
    const tw = new Tween(target, 'scale', to, { duration, ease, autoPlay: false });
    return this.append(tw);
  }

  joinScale(target: any, to: any, duration = 1.0, ease?: any): this {
    const tw = new Tween(target, 'scale', to, { duration, ease, autoPlay: false });
    return this.join(tw);
  }

  private recalculateDuration(): void {
    this.duration = this.track.duration;
  }

  // --- Step / Tick Update Loop ---

  update(dt: number): boolean {
    if (this.status !== 'playing') return false;
    if (dt === 0) return false;

    const delta = dt * this.timeScale;

    if (!this.hasStarted) {
      this.hasStarted = true;
      this.callbacks.onStart?.();
      this.startHooks.forEach((h) => h());
    }

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
      this.elapsed = 0;
      this.progress = 1;
      this.evaluateTimelineRange(0, 0);
      this.complete();
      return true;
    }

    let remaining = Math.max(0, delta);
    let transitions = 0;
    while (remaining > 0 && this.status === 'playing') {
      if (++transitions > 100000) throw new Error(`[TweenSequence] Excessive loop traversal for '${this.id}'`);
      const previous = this.elapsed;
      const distanceToBoundary = this.isReversed ? this.elapsed : this.duration - this.elapsed;
      if (remaining < distanceToBoundary) {
        this.elapsed += this.isReversed ? -remaining : remaining;
        this.evaluateTimelineRange(previous, this.elapsed);
        remaining = 0;
        break;
      }

      this.elapsed = this.isReversed ? 0 : this.duration;
      remaining -= Math.max(0, distanceToBoundary);
      this.evaluateTimelineRange(previous, this.elapsed);
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

      this.track.resetTriggers();
      if (this.loopType === 'yoyo') {
        this.isReversed = !this.isReversed;
      } else {
        this.elapsed = this.isReversed ? this.duration : 0;
      }
    }

    this.progress = Math.min(Math.max(this.elapsed / this.duration, 0), 1);

    this.callbacks.onUpdate?.(this.progress);
    this.stepHooks.forEach((h) => h(this.elapsed));
    return false;
  }

  private evaluateTimelineRange(fromTime: number, toTime: number): void {
    const isForward = toTime >= fromTime;
    const minT = Math.min(fromTime, toTime);
    const maxT = Math.max(fromTime, toTime);

    for (const item of this.track.items) {
      // 1. Check callbacks and markers that land in [minT, maxT]
      if (item.kind === 'callback' && item.callback) {
        const triggers = isForward
          ? (item.startTime >= fromTime && item.startTime <= toTime && !item.isTriggeredForward)
          : (item.startTime <= fromTime && item.startTime >= toTime && !item.isTriggeredBackward);

        if (triggers) {
          if (isForward) item.isTriggeredForward = true;
          else item.isTriggeredBackward = true;
          item.callback();
        }
      }

      if (item.kind === 'marker' && item.markerName) {
        const triggers = isForward
          ? (item.startTime >= fromTime && item.startTime <= toTime && !item.isTriggeredForward)
          : (item.startTime <= fromTime && item.startTime >= toTime && !item.isTriggeredBackward);

        if (triggers) {
          if (isForward) item.isTriggeredForward = true;
          else item.isTriggeredBackward = true;
          this.triggerMarker(item.markerName);
        }
      }

      // 2. Evaluate Tweens
      if (item.kind === 'tween' && item.tween) {
        const tw = item.tween;
        if (toTime < item.startTime) {
          if (tw.elapsed > 0) tw.seek(0);
        } else if (toTime >= item.endTime) {
          if (tw.progress < 1) tw.seek(item.duration);
        } else {
          const localElapsed = toTime - item.startTime;
          tw.seek(localElapsed);
        }
      }

      // 3. Evaluate Nested Sequences
      if (item.kind === 'sequence' && item.sequence) {
        const seq = item.sequence;
        if (toTime < item.startTime) {
          if (seq.elapsed > 0) seq.seek(0);
        } else if (toTime >= item.endTime) {
          if (seq.progress < 1) seq.seek(item.duration);
        } else {
          const localElapsed = toTime - item.startTime;
          seq.seek(localElapsed);
        }
      }
    }
  }

  private triggerMarker(markerName: string): void {
    const specific = this.markerHooks.get(markerName);
    if (specific) {
      const hooks = [...specific];
      this.markerHooks.delete(markerName);
      hooks.forEach((h) => h());
    }

    const universal = this.markerHooks.get('*');
    if (universal) {
      universal.forEach((h) => h());
    }
  }

  // --- Control Operations ---

  play(): this {
    if (this.status === 'completed' || this.status === 'killed') {
      this.restart();
      return this;
    }
    this.status = 'playing';
    this.callbacks.onResume?.();
    return this;
  }

  pause(): this {
    if (this.status === 'playing') {
      this.status = 'paused';
      this.callbacks.onPause?.();
    }
    return this;
  }

  resume(): this {
    if (this.status === 'paused') {
      this.status = 'playing';
      this.callbacks.onResume?.();
    }
    return this;
  }

  kill(reason: TweenInterruptionReason = 'manual_kill'): this {
    if (this.status === 'killed') return this;
    this.status = 'killed';
    this.interruptionReason = reason;

    for (const item of this.track.items) {
      if (item.tween) item.tween.kill(reason);
      if (item.sequence) item.sequence.kill(reason);
    }

    this.callbacks.onKill?.(reason);
    this.killHooks.forEach((h) => h(reason));
    return this;
  }

  complete(): this {
    if (this.status === 'completed' || this.status === 'killed') return this;
    this.status = 'completed';
    this.seek(this.duration);

    this.callbacks.onComplete?.();
    this.completeHooks.forEach((h) => h());
    return this;
  }

  restart(): this {
    this.interruptionReason = undefined;
    this.elapsed = 0;
    this.progress = 0;
    this.loopCount = 0;
    this.isReversed = false;
    this.status = 'playing';
    this.track.resetTriggers();
    this.seek(0, true);
    return this;
  }

  rewind(): this {
    this.elapsed = 0;
    this.progress = 0;
    this.isReversed = false;
    this.status = 'paused';
    this.track.resetTriggers();
    this.seek(0, false);
    this.callbacks.onRewind?.();
    return this;
  }

  seek(time: number, andPlay = false): this {
    const prevElapsed = this.elapsed;
    this.elapsed = Math.min(Math.max(time, 0), this.duration);
    this.progress = this.duration > 0 ? this.elapsed / this.duration : 1;

    this.evaluateTimelineRange(prevElapsed, this.elapsed);

    if (andPlay) this.play();
    else this.pause();
    return this;
  }

  seekNormalized(t: number, andPlay = false): this {
    const clamped = Math.min(Math.max(t, 0), 1);
    return this.seek(clamped * this.duration, andPlay);
  }

  reverse(): this {
    this.isReversed = !this.isReversed;
    return this;
  }

  setTimeScale(scale: number): this {
    this.timeScale = Math.max(0, scale);
    for (const item of this.track.items) {
      if (item.tween) item.tween.setTimeScale(this.timeScale);
      if (item.sequence) item.sequence.setTimeScale(this.timeScale);
    }
    return this;
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

  onMarkerHook(marker: string, cb: () => void): void {
    let list = this.markerHooks.get(marker);
    if (!list) {
      list = [];
      this.markerHooks.set(marker, list);
    }
    list.push(cb);
  }

  getHandle(): TweenHandle {
    return new TweenHandle(this);
  }

  getTrackItems(): ReadonlyArray<TweenTrackItem> {
    return this.track.items;
  }
}
