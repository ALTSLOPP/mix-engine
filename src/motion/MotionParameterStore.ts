import * as THREE from 'three';

export type ParameterType = 'number' | 'boolean' | 'string' | 'vector2' | 'vector3';

export type ParameterValue = number | boolean | string | THREE.Vector2 | THREE.Vector3;

export type ParameterWatchCallback<T = ParameterValue> = (newValue: T, oldValue: T) => void;

interface ParameterRecord {
  type: ParameterType;
  value: ParameterValue;
  targetValue: ParameterValue;
  damping: number; // 0 = instant, >0 = seconds to damp
  computed?: () => ParameterValue;
  readonly: boolean;
}

/**
 * MotionParameterStore — Central, typed, damped parameter system for animation control.
 *
 * Supports:
 * - Number, boolean, string, Vector2, Vector3.
 * - Smooth exponential damping (`dampNumber`, `dampVector2`, `dampVector3`).
 * - Reactive watcher callbacks for changes.
 * - Computed read-only parameters.
 * - Machine-readable serialization & inspection.
 */
export class MotionParameterStore {
  private params = new Map<string, ParameterRecord>();
  private watchers = new Map<string, Set<ParameterWatchCallback>>();

  constructor(initial: Record<string, ParameterValue> = {}) {
    for (const [key, val] of Object.entries(initial)) {
      this.set(key, val);
    }
  }

  define(
    name: string,
    type: ParameterType,
    initialValue: ParameterValue,
    opts: { damping?: number; readonly?: boolean; computed?: () => ParameterValue } = {},
  ): void {
    const val = opts.computed ? opts.computed() : this.cloneValue(type, initialValue);
    this.params.set(name, {
      type,
      value: val,
      targetValue: this.cloneValue(type, initialValue),
      damping: opts.damping ?? 0,
      computed: opts.computed,
      readonly: opts.readonly ?? false,
    });
  }

  set(name: string, value: ParameterValue, damping = 0): void {
    const existing = this.params.get(name);
    if (!existing) {
      const detectedType = this.detectType(value);
      this.define(name, detectedType, value, { damping });
      this.notifyWatchers(name, value, value);
      return;
    }

    if (existing.readonly && !existing.computed) {
      console.warn(`[MotionParameterStore] Cannot set readonly parameter '${name}'`);
      return;
    }

    if (existing.damping > 0 || damping > 0) {
      existing.targetValue = this.cloneValue(existing.type, value);
      if (damping > 0) existing.damping = damping;
    } else {
      const oldVal = existing.value;
      existing.value = this.cloneValue(existing.type, value);
      existing.targetValue = existing.value;
      this.notifyWatchers(name, existing.value, oldVal);
    }
  }

  get<T = ParameterValue>(name: string, fallback?: T): T {
    const record = this.params.get(name);
    if (!record) return fallback as T;
    if (record.computed) {
      return record.computed() as unknown as T;
    }
    return record.value as unknown as T;
  }

  getNumber(name: string, fallback = 0): number {
    const v = this.get(name, fallback);
    return typeof v === 'number' ? v : fallback;
  }

  getBoolean(name: string, fallback = false): boolean {
    const v = this.get(name, fallback);
    return typeof v === 'boolean' ? v : fallback;
  }

  getString(name: string, fallback = ''): string {
    const v = this.get(name, fallback);
    return typeof v === 'string' ? v : fallback;
  }

  getVector2(name: string, fallback: THREE.Vector2 = new THREE.Vector2()): THREE.Vector2 {
    const v = this.get(name, fallback);
    return v instanceof THREE.Vector2 ? v : fallback;
  }

  getVector3(name: string, fallback: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    const v = this.get(name, fallback);
    return v instanceof THREE.Vector3 ? v : fallback;
  }

  has(name: string): boolean {
    return this.params.has(name);
  }

  watch<T = ParameterValue>(name: string, callback: ParameterWatchCallback<T>): () => void {
    if (!this.watchers.has(name)) {
      this.watchers.set(name, new Set());
    }
    this.watchers.get(name)!.add(callback as ParameterWatchCallback);
    return () => {
      const set = this.watchers.get(name);
      if (set) {
        set.delete(callback as ParameterWatchCallback);
        if (set.size === 0) this.watchers.delete(name);
      }
    };
  }

  /**
   * Update damping on parameters for a frame delta `dt`.
   */
  update(dt: number): void {
    if (dt <= 0) return;

    for (const [name, record] of this.params.entries()) {
      if (record.computed) {
        const newVal = record.computed();
        const oldVal = record.value;
        if (!this.areEqual(record.type, newVal, oldVal)) {
          record.value = newVal;
          this.notifyWatchers(name, newVal, oldVal);
        }
        continue;
      }

      if (record.damping <= 0) continue;

      // Exponential damping factor: 1 - exp(-dt / damping)
      const alpha = 1 - Math.exp(-dt / record.damping);

      if (record.type === 'number') {
        const cur = record.value as number;
        const tgt = record.targetValue as number;
        if (Math.abs(tgt - cur) > 1e-5) {
          const next = cur + (tgt - cur) * alpha;
          record.value = next;
          this.notifyWatchers(name, next, cur);
        } else if (cur !== tgt) {
          record.value = tgt;
          this.notifyWatchers(name, tgt, cur);
        }
      } else if (record.type === 'vector2') {
        const cur = record.value as THREE.Vector2;
        const tgt = record.targetValue as THREE.Vector2;
        if (cur.distanceToSquared(tgt) > 1e-6) {
          const oldVal = cur.clone();
          cur.lerp(tgt, alpha);
          this.notifyWatchers(name, cur, oldVal);
        }
      } else if (record.type === 'vector3') {
        const cur = record.value as THREE.Vector3;
        const tgt = record.targetValue as THREE.Vector3;
        if (cur.distanceToSquared(tgt) > 1e-6) {
          const oldVal = cur.clone();
          cur.lerp(tgt, alpha);
          this.notifyWatchers(name, cur, oldVal);
        }
      }
    }
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of this.params.entries()) {
      if (v.computed) {
        out[k] = v.computed();
      } else if (v.value instanceof THREE.Vector2) {
        out[k] = [v.value.x, v.value.y];
      } else if (v.value instanceof THREE.Vector3) {
        out[k] = [v.value.x, v.value.y, v.value.z];
      } else {
        out[k] = v.value;
      }
    }
    return out;
  }

  fromJSON(json: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(json)) {
      if (Array.isArray(v)) {
        if (v.length === 2) this.set(k, new THREE.Vector2(v[0], v[1]));
        else if (v.length === 3) this.set(k, new THREE.Vector3(v[0], v[1], v[2]));
      } else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
        this.set(k, v);
      }
    }
  }

  private detectType(val: unknown): ParameterType {
    if (typeof val === 'number') return 'number';
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'string') return 'string';
    if (val instanceof THREE.Vector2) return 'vector2';
    if (val instanceof THREE.Vector3) return 'vector3';
    return 'number';
  }

  private cloneValue(type: ParameterType, val: ParameterValue): ParameterValue {
    if (type === 'vector2' && val instanceof THREE.Vector2) return val.clone();
    if (type === 'vector3' && val instanceof THREE.Vector3) return val.clone();
    return val;
  }

  private areEqual(type: ParameterType, a: ParameterValue, b: ParameterValue): boolean {
    if (type === 'vector2' && a instanceof THREE.Vector2 && b instanceof THREE.Vector2) return a.equals(b);
    if (type === 'vector3' && a instanceof THREE.Vector3 && b instanceof THREE.Vector3) return a.equals(b);
    return a === b;
  }

  private notifyWatchers(name: string, newVal: ParameterValue, oldVal: ParameterValue): void {
    const set = this.watchers.get(name);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(newVal, oldVal);
      } catch (e) {
        console.error(`[MotionParameterStore] Error in watcher for '${name}':`, e);
      }
    }
  }
}
