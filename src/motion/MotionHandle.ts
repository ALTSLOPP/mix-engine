import type { MotionState } from './MotionState';
import type { AwaitResult, EasingType, MotionEventPayload } from './types';

/**
 * MotionHandle — Awaitable control handle returned by direct playback calls.
 *
 * Example:
 * ```ts
 * const handle = mix.motion.play(entityId, "attack/heavy");
 * const hitResult = await handle.awaitEvent("hit");
 * if (hitResult.completed) {
 *   // Apply damage!
 * }
 * ```
 */
export class MotionHandle {
  readonly state: MotionState;
  private isDestroyed = false;
  private pendingPromises = new Set<{
    resolve: (res: AwaitResult) => void;
    reject: (err: Error) => void;
    checkFn?: () => boolean;
    cleanup?: () => void;
    timer?: ReturnType<typeof setTimeout>;
  }>();

  constructor(state: MotionState) {
    this.state = state;
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get weight(): number {
    return this.state.weight;
  }

  get time(): number {
    return this.state.time;
  }

  get normalizedTime(): number {
    return this.state.normalizedTime;
  }

  get duration(): number {
    return this.state.duration;
  }

  get speed(): number {
    return this.state.speed;
  }

  set speed(val: number) {
    this.state.speed = val;
  }

  pause(): this {
    this.state.pause();
    return this;
  }

  resume(): this {
    this.state.resume();
    return this;
  }

  stop(): this {
    this.state.stop();
    this.notifyInterrupted('cancelled');
    return this;
  }

  fade(targetWeight: number, duration: number, easing: EasingType = 'linear'): this {
    this.state.fade(targetWeight, duration, easing);
    return this;
  }

  /**
   * Await a specific named event (e.g. 'hit', 'footstep', 'combo_open').
   */
  awaitEvent(eventName: string, timeoutMs = 15000): Promise<AwaitResult> {
    if (this.isDestroyed || this.state.status === 'stopped') {
      return Promise.resolve({
        completed: false,
        interrupted: true,
        cancelled: true,
        reason: 'cancelled',
        elapsed: 0,
      });
    }

    return new Promise<AwaitResult>((resolve, reject) => {
      const startTime = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;

      const unbind = this.state.eventTrack.on(eventName, (_payload: MotionEventPayload) => {
        unbind();
        if (timer) clearTimeout(timer);
        this.pendingPromises.delete(record);
        resolve({
          completed: true,
          interrupted: false,
          cancelled: false,
          reason: 'event',
          eventName,
          elapsed: (performance.now() - startTime) / 1000,
        });
      });

      const record = { resolve, reject, timer, cleanup: unbind };
      this.pendingPromises.add(record);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          unbind();
          this.pendingPromises.delete(record);
          resolve({
            completed: false,
            interrupted: true,
            cancelled: false,
            reason: 'timeout',
            eventName,
            elapsed: (performance.now() - startTime) / 1000,
          });
        }, timeoutMs);
        record.timer = timer;
      }
    });
  }

  /**
   * Await completion of the animation or reaching the end of non-looping clip.
   */
  awaitEnd(timeoutMs = 30000): Promise<AwaitResult> {
    if (this.isDestroyed || this.state.status === 'stopped' || this.state.status === 'completed') {
      return Promise.resolve({
        completed: true,
        interrupted: false,
        cancelled: false,
        reason: 'end',
        elapsed: 0,
      });
    }

    return new Promise<AwaitResult>((resolve, reject) => {
      const startTime = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;

      const checkFn = () => {
        if (this.state.status === 'completed' || (!this.state.loop && this.state.time >= this.state.duration)) {
          if (timer) clearTimeout(timer);
          this.pendingPromises.delete(record);
          resolve({
            completed: true,
            interrupted: false,
            cancelled: false,
            reason: 'end',
            elapsed: (performance.now() - startTime) / 1000,
          });
          return true;
        }
        return false;
      };

      const record = { resolve, reject, checkFn, timer };
      this.pendingPromises.add(record);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pendingPromises.delete(record);
          resolve({
            completed: false,
            interrupted: true,
            cancelled: false,
            reason: 'timeout',
            elapsed: (performance.now() - startTime) / 1000,
          });
        }, timeoutMs);
        record.timer = timer;
      }
    });
  }

  /**
   * Await until normalized time passes `threshold` (0.0 to 1.0).
   */
  awaitNormalizedTime(threshold: number, timeoutMs = 15000): Promise<AwaitResult> {
    if (this.state.normalizedTime >= threshold) {
      return Promise.resolve({
        completed: true,
        interrupted: false,
        cancelled: false,
        reason: 'normalized_time',
        elapsed: 0,
      });
    }

    return new Promise<AwaitResult>((resolve, reject) => {
      const startTime = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;

      const checkFn = () => {
        if (this.state.normalizedTime >= threshold) {
          if (timer) clearTimeout(timer);
          this.pendingPromises.delete(record);
          resolve({
            completed: true,
            interrupted: false,
            cancelled: false,
            reason: 'normalized_time',
            elapsed: (performance.now() - startTime) / 1000,
          });
          return true;
        }
        return false;
      };

      const record = { resolve, reject, checkFn, timer };
      this.pendingPromises.add(record);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pendingPromises.delete(record);
          resolve({
            completed: false,
            interrupted: true,
            cancelled: false,
            reason: 'timeout',
            elapsed: (performance.now() - startTime) / 1000,
          });
        }, timeoutMs);
        record.timer = timer;
      }
    });
  }

  /**
   * Await until active fade is completed.
   */
  awaitFade(timeoutMs = 10000): Promise<AwaitResult> {
    if (!this.state.fadeGroup.isFading()) {
      return Promise.resolve({
        completed: true,
        interrupted: false,
        cancelled: false,
        reason: 'fade_complete',
        elapsed: 0,
      });
    }

    return new Promise<AwaitResult>((resolve, reject) => {
      const startTime = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;

      const checkFn = () => {
        if (!this.state.fadeGroup.isFading()) {
          if (timer) clearTimeout(timer);
          this.pendingPromises.delete(record);
          resolve({
            completed: true,
            interrupted: false,
            cancelled: false,
            reason: 'fade_complete',
            elapsed: (performance.now() - startTime) / 1000,
          });
          return true;
        }
        return false;
      };

      const record = { resolve, reject, checkFn, timer };
      this.pendingPromises.add(record);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pendingPromises.delete(record);
          resolve({
            completed: false,
            interrupted: true,
            cancelled: false,
            reason: 'timeout',
            elapsed: (performance.now() - startTime) / 1000,
          });
        }, timeoutMs);
        record.timer = timer;
      }
    });
  }

  /**
   * Internal hook called by MotionGraph during update step to evaluate condition-based promises.
   */
  update(): void {
    if (this.pendingPromises.size === 0) return;
    for (const record of Array.from(this.pendingPromises)) {
      if (record.checkFn) {
        record.checkFn();
      }
    }
  }

  notifyInterrupted(reason: 'interrupted' | 'cancelled' | 'destroyed'): void {
    for (const record of Array.from(this.pendingPromises)) {
      if (record.timer) clearTimeout(record.timer);
      if (record.cleanup) record.cleanup();
      record.resolve({
        completed: false,
        interrupted: true,
        cancelled: reason === 'cancelled',
        reason,
        elapsed: 0,
      });
    }
    this.pendingPromises.clear();
  }

  dispose(): void {
    this.isDestroyed = true;
    this.notifyInterrupted('destroyed');
  }
}
