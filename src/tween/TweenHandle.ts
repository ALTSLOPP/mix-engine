import type { TweenInterruptionReason, TweenStatus } from './types';

export interface ITweenControllable {
  id: string;
  status: TweenStatus;
  progress: number;
  elapsed: number;
  duration: number;
  loopCount: number;
  isReversed: boolean;
  timeScale: number;
  interruptionReason?: TweenInterruptionReason;
  hasStarted?: boolean;

  play(): void;
  pause(): void;
  resume(): void;
  kill(reason?: TweenInterruptionReason): void;
  complete(): void;
  restart(): void;
  rewind(): void;
  seek(time: number, andPlay?: boolean): void;
  seekNormalized(t: number, andPlay?: boolean): void;
  reverse(): void;
  setTimeScale(scale: number): void;

  onStartHook?: (cb: () => void) => void;
  onStepHook?: (cb: (step: number) => void) => void;
  onLoopHook?: (cb: (loop: number) => void) => void;
  onCompleteHook?: (cb: () => void) => void;
  onKillHook?: (cb: (reason: TweenInterruptionReason) => void) => void;
  onMarkerHook?: (marker: string, cb: () => void) => void;
}

export class TweenHandle {
  private startDeferred: Array<() => void> = [];
  private stepDeferred: Array<(step: number) => void> = [];
  private loopDeferred: Array<(loop: number) => void> = [];
  private completeDeferred: Array<(reason: TweenInterruptionReason) => void> = [];
  private killDeferred: Array<(reason: TweenInterruptionReason) => void> = [];
  private markerDeferred = new Map<string, Array<() => void>>();

  constructor(public readonly node: ITweenControllable) {
    this.hookInternalCallbacks();
  }

  private hookInternalCallbacks(): void {
    if (this.node.onStartHook) {
      this.node.onStartHook(() => {
        const deferred = [...this.startDeferred];
        this.startDeferred.length = 0;
        deferred.forEach((resolve) => resolve());
      });
    }

    if (this.node.onStepHook) {
      this.node.onStepHook((step) => {
        const deferred = [...this.stepDeferred];
        this.stepDeferred.length = 0;
        deferred.forEach((resolve) => resolve(step));
      });
    }

    if (this.node.onLoopHook) {
      this.node.onLoopHook((loop) => {
        const deferred = [...this.loopDeferred];
        this.loopDeferred.length = 0;
        deferred.forEach((resolve) => resolve(loop));
      });
    }

    if (this.node.onCompleteHook) {
      this.node.onCompleteHook(() => {
        const completeResolvers = [...this.completeDeferred];
        this.completeDeferred.length = 0;
        completeResolvers.forEach((resolve) => resolve('completed'));
        this.stepDeferred.splice(0).forEach((resolve) => resolve(Number.NaN));
        this.loopDeferred.splice(0).forEach((resolve) => resolve(this.node.loopCount));

        // If markers were waiting for end of playback, resolve them
        for (const [_, resolvers] of this.markerDeferred) {
          resolvers.forEach((resolve) => resolve());
        }
        this.markerDeferred.clear();
      });
    }

    if (this.node.onKillHook) {
      this.node.onKillHook((reason) => {
        const killResolvers = [...this.killDeferred];
        this.killDeferred.length = 0;
        killResolvers.forEach((resolve) => resolve(reason));

        const completeResolvers = [...this.completeDeferred];
        this.completeDeferred.length = 0;
        completeResolvers.forEach((resolve) => resolve(reason));

        const startResolvers = [...this.startDeferred];
        this.startDeferred.length = 0;
        startResolvers.forEach((resolve) => resolve());
        this.stepDeferred.splice(0).forEach((resolve) => resolve(Number.NaN));
        this.loopDeferred.splice(0).forEach((resolve) => resolve(this.node.loopCount));

        for (const [_, resolvers] of this.markerDeferred) {
          resolvers.forEach((resolve) => resolve());
        }
        this.markerDeferred.clear();
      });
    }

    if (this.node.onMarkerHook) {
      this.node.onMarkerHook('*', () => {
        // dynamic marker resolution
      });
    }
  }

  // --- Awaitable Promise API ---

  awaitStart(): Promise<void> {
    if (this.node.hasStarted || this.node.elapsed > 0 || this.node.status === 'completed') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.startDeferred.push(resolve);
    });
  }

  awaitStep(): Promise<number> {
    if (this.node.status === 'completed' || this.node.status === 'killed') return Promise.resolve(Number.NaN);
    return new Promise((resolve) => {
      this.stepDeferred.push(resolve);
    });
  }

  awaitLoop(): Promise<number> {
    if (this.node.status === 'completed' || this.node.status === 'killed') return Promise.resolve(this.node.loopCount);
    return new Promise((resolve) => {
      this.loopDeferred.push(resolve);
    });
  }

  awaitComplete(): Promise<TweenInterruptionReason> {
    if (this.node.status === 'completed') {
      return Promise.resolve('completed');
    }
    if (this.node.status === 'killed') {
      return Promise.resolve(this.node.interruptionReason ?? 'manual_kill');
    }
    return new Promise((resolve) => {
      this.completeDeferred.push(resolve);
    });
  }

  awaitKill(): Promise<TweenInterruptionReason> {
    if (this.node.status === 'killed') {
      return Promise.resolve(this.node.interruptionReason ?? 'manual_kill');
    }
    return new Promise((resolve) => {
      this.killDeferred.push(resolve);
    });
  }

  awaitMarker(markerName: string): Promise<void> {
    if (this.node.status === 'completed' || this.node.status === 'killed') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let list = this.markerDeferred.get(markerName);
      if (!list) {
        list = [];
        this.markerDeferred.set(markerName, list);
      }
      list.push(resolve);

      if (this.node.onMarkerHook) {
        this.node.onMarkerHook(markerName, () => {
          const waiting = this.markerDeferred.get(markerName);
          if (waiting) {
            this.markerDeferred.delete(markerName);
            waiting.forEach((res) => res());
          }
        });
      }
    });
  }

  awaitEnd(): Promise<void> {
    return this.awaitComplete().then(() => undefined);
  }

  // --- Fluent Controls ---

  play(): this {
    this.node.play();
    return this;
  }

  pause(): this {
    this.node.pause();
    return this;
  }

  resume(): this {
    this.node.resume();
    return this;
  }

  kill(reason: TweenInterruptionReason = 'manual_kill'): this {
    this.node.kill(reason);
    return this;
  }

  complete(): this {
    this.node.complete();
    return this;
  }

  restart(): this {
    this.node.restart();
    return this;
  }

  rewind(): this {
    this.node.rewind();
    return this;
  }

  seek(time: number, andPlay = false): this {
    this.node.seek(time, andPlay);
    return this;
  }

  seekNormalized(t: number, andPlay = false): this {
    this.node.seekNormalized(t, andPlay);
    return this;
  }

  reverse(): this {
    this.node.reverse();
    return this;
  }

  setTimeScale(scale: number): this {
    this.node.setTimeScale(scale);
    return this;
  }

  // --- Getters ---

  get id(): string { return this.node.id; }
  get status(): TweenStatus { return this.node.status; }
  get progress(): number { return this.node.progress; }
  get elapsed(): number { return this.node.elapsed; }
  get duration(): number { return this.node.duration; }
  get loopCount(): number { return this.node.loopCount; }
  get isReversed(): boolean { return this.node.isReversed; }
}
