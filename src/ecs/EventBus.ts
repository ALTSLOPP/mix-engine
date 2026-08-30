export type EventCallback = (data: unknown) => void;

export interface CollisionEventData {
  entityA: number;
  entityB: number;
  started: boolean;
}

export interface SensorEventData {
  selfEntityId: number;
  otherEntityId: number;
  intersecting: boolean;
}

/**
 * EventBus — global pub/sub event system for the MIX Engine.
 *
 * Events can be dispatched by the engine (collisions, sensor triggers, entity
 * lifecycle), by scripts (via `api.events.emit`), or by AI commands
 * (`emit_event`). Scripts register listeners with `api.events.on(...)` instead
 * of polling in their per-frame update loop.
 *
 * Built-in events:
 *   - 'collision_start' / 'collision_end'  { entityA, entityB }
 *   - 'sensor_enter' / 'sensor_exit'        { selfEntityId, otherEntityId }
 *   - 'entity_destroyed'                    { entityId }
 *   - 'script_error'                        { entityId, error }
 *   - any custom string via emit()
 */
export class EventBus {
  private listeners = new Map<string, Set<EventCallback>>();

  /** Register a listener. Returns an unsubscribe function. */
  on(event: string, cb: EventCallback): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => { set?.delete(cb); };
  }

  /** Remove a specific listener. */
  off(event: string, cb: EventCallback): void {
    this.listeners.get(event)?.delete(cb);
  }

  /** Emit an event to all listeners. Errors in a listener don't affect others. */
  emit(event: string, data: unknown): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const cb of set) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[EventBus] Error in '${event}' listener:`, err);
      }
    }
  }

  /** Remove all listeners for an event. If no event given, clears everything. */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /** Number of listeners registered (for debugging). */
  get listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) count += set.size;
    return count;
  }
}
