import type { MotionEventDef, MotionEventPayload, MotionEventListener } from './types';

export interface BoundMotionEvent extends MotionEventDef {
  id: string;
  firedInCycle: number;
}

/**
 * MotionEventTrack — Deterministic, frame-rate independent animation event evaluation.
 *
 * Guarantees:
 * - Exactly-once firing per cycle even across variable dt steps.
 * - Correct traversal when playback speed is high and skips past multiple events in a single frame.
 * - Correct firing across loop boundaries and reverse playback (speed < 0).
 * - Independent of Three.js internal AnimationMixer event tracks.
 */
export class MotionEventTrack {
  private events: BoundMotionEvent[] = [];
  private listeners = new Map<string, Set<MotionEventListener>>();
  private globalListeners = new Set<MotionEventListener>();
  private lastTime = 0;
  private currentCycle = 0;
  private eventIdCounter = 0;

  constructor(initialEvents: MotionEventDef[] = []) {
    for (const def of initialEvents) {
      this.addEvent(def);
    }
  }

  addEvent(def: MotionEventDef): string {
    const id = `evt_${++this.eventIdCounter}`;
    this.events.push({
      ...def,
      id,
      fireOnLoop: def.fireOnLoop ?? true,
      firedInCycle: -1,
    });
    // Keep events sorted by time
    this.events.sort((a, b) => a.time - b.time);
    return id;
  }

  removeEvent(id: string): boolean {
    const idx = this.events.findIndex((e) => e.id === id);
    if (idx !== -1) {
      this.events.splice(idx, 1);
      return true;
    }
    return false;
  }

  clearEvents(): void {
    this.events = [];
  }

  on(name: string, listener: MotionEventListener): () => void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    this.listeners.get(name)!.add(listener);
    return () => this.off(name, listener);
  }

  onAny(listener: MotionEventListener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  off(name: string, listener: MotionEventListener): void {
    const set = this.listeners.get(name);
    if (set) {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(name);
    }
  }

  reset(time = 0, cycle = 0): void {
    this.lastTime = time;
    this.currentCycle = cycle;
    for (const evt of this.events) {
      evt.firedInCycle = -1;
    }
  }

  /**
   * Update and evaluate events between `prevTime` and `currTime`.
   * `duration`: Clip duration in seconds.
   * `isLoop`: If the animation looped this frame.
   * `context`: Metadata attached to fired payloads.
   */
  evaluate(
    currTime: number,
    duration: number,
    isLoop: boolean,
    speed: number,
    context: { clipId?: string; stateId?: string; layerIndex?: number } = {},
  ): MotionEventPayload[] {
    if (this.events.length === 0 || duration <= 0) {
      this.lastTime = currTime;
      return [];
    }

    const fired: MotionEventPayload[] = [];
    const prevTime = this.lastTime;
    const isForward = speed >= 0;

    if (isLoop) {
      // Loop occurred: evaluate from prevTime -> duration, advance cycle, then 0 -> currTime
      if (isForward) {
        this.evaluateRange(prevTime, duration, duration, context, fired);
        this.currentCycle += 1;
        this.evaluateRange(0, currTime, duration, context, fired);
      } else {
        this.evaluateRange(prevTime, 0, duration, context, fired);
        this.currentCycle += 1;
        this.evaluateRange(duration, currTime, duration, context, fired);
      }
    } else {
      if (isForward) {
        this.evaluateRange(prevTime, currTime, duration, context, fired);
      } else {
        this.evaluateRange(currTime, prevTime, duration, context, fired);
      }
    }

    this.lastTime = currTime;
    return fired;
  }

  private evaluateRange(
    t0: number,
    t1: number,
    duration: number,
    context: { clipId?: string; stateId?: string; layerIndex?: number },
    out: MotionEventPayload[],
  ): void {
    const minT = Math.min(t0, t1);
    const maxT = Math.max(t0, t1);

    for (const evt of this.events) {
      const evtTime = evt.isNormalized ? evt.time * duration : evt.time;

      if (!evt.fireOnLoop && this.currentCycle > 0) {
        continue;
      }

      // Check if event falls in [minT, maxT] and hasn't fired in this cycle yet
      if (evtTime >= minT && evtTime <= maxT && evt.firedInCycle !== this.currentCycle) {
        evt.firedInCycle = this.currentCycle;

        const payload: MotionEventPayload = {
          name: evt.name,
          time: evtTime,
          normalizedTime: duration > 0 ? evtTime / duration : 0,
          parameters: evt.parameters,
          clipId: context.clipId,
          stateId: context.stateId,
          layerIndex: context.layerIndex,
        };

        out.push(payload);
        this.dispatch(payload);
      }
    }
  }

  private dispatch(payload: MotionEventPayload): void {
    // Specific listeners
    const set = this.listeners.get(payload.name);
    if (set) {
      for (const listener of set) {
        try {
          listener(payload);
        } catch (e) {
          console.error(`[MotionEventTrack] Error in listener for event '${payload.name}':`, e);
        }
      }
    }

    // Global listeners
    for (const listener of this.globalListeners) {
      try {
        listener(payload);
      } catch (e) {
        console.error(`[MotionEventTrack] Error in global listener:`, e);
      }
    }
  }

  getEventNames(): string[] {
    return Array.from(new Set(this.events.map((e) => e.name)));
  }

  getAllEvents(): ReadonlyArray<BoundMotionEvent> {
    return this.events;
  }
}
