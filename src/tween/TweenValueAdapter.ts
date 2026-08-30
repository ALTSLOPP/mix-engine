import * as THREE from 'three';
import { TweenPool } from './TweenPool';
import { TweenPluginRegistry } from './TweenPluginRegistry';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const DEFAULT_SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';

export class TweenValueAdapter {
  /**
   * Safely navigate a dot-separated property path.
   * Prevents prototype pollution.
   */
  static getNestedProperty(target: any, path: string): any {
    if (!target || !path) return undefined;
    const parts = path.split('.');
    let curr = target;

    for (const part of parts) {
      if (FORBIDDEN_KEYS.has(part)) {
        throw new Error(`[TweenValueAdapter] Access to forbidden property '${part}' is prohibited.`);
      }
      if (curr === null || curr === undefined) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  /**
   * Safely set a dot-separated property path.
   * Prevents prototype pollution.
   */
  static setNestedProperty(target: any, path: string, value: any): boolean {
    if (!target || !path) return false;
    const parts = path.split('.');
    let curr = target;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (FORBIDDEN_KEYS.has(part)) {
        throw new Error(`[TweenValueAdapter] Mutation of forbidden property '${part}' is prohibited.`);
      }
      if (curr[part] === undefined || curr[part] === null) {
        curr[part] = {};
      }
      curr = curr[part];
    }

    const lastKey = parts[parts.length - 1];
    if (FORBIDDEN_KEYS.has(lastKey)) {
      throw new Error(`[TweenValueAdapter] Mutation of forbidden property '${lastKey}' is prohibited.`);
    }

    // If target has a copy method and both are same type, use it
    if (
      curr[lastKey] &&
      typeof curr[lastKey].copy === 'function' &&
      value &&
      typeof value === 'object' &&
      curr[lastKey].constructor === value.constructor
    ) {
      curr[lastKey].copy(value);
    } else {
      curr[lastKey] = value;
    }
    return true;
  }

  /**
   * Deep clone a value for initial / target value preservation.
   */
  static cloneValue(value: any): any {
    if (value === null || value === undefined) return value;

    if (typeof value !== 'object') {
      return value;
    }

    const plugin = TweenPluginRegistry.findAdapter(value);
    if (plugin) {
      return plugin.clone(value);
    }

    if (value instanceof THREE.Vector2) return value.clone();
    if (value instanceof THREE.Vector3) return value.clone();
    if (value instanceof THREE.Vector4) return value.clone();
    if (value instanceof THREE.Quaternion) return value.clone();
    if (value instanceof THREE.Euler) return value.clone();
    if (value instanceof THREE.Color) return value.clone();

    if (Array.isArray(value)) {
      return value.map((item) => TweenValueAdapter.cloneValue(item));
    }

    if (ArrayBuffer.isView(value)) {
      // TypedArray
      return (value as any).slice();
    }

    // Plain object
    const copy: Record<string, any> = {};
    for (const k of Object.keys(value)) {
      if (!FORBIDDEN_KEYS.has(k)) {
        copy[k] = TweenValueAdapter.cloneValue(value[k]);
      }
    }
    return copy;
  }

  /**
   * Core interpolation between two values of matching or compatible types.
   */
  static interpolate(
    from: any,
    to: any,
    t: number,
    stringMode: 'typewriter' | 'scramble' | 'numeric' = 'typewriter',
    scrambleCharset: string = DEFAULT_SCRAMBLE_CHARS,
    out?: any,
  ): any {
    // Check plugin adapters first
    const plugin = TweenPluginRegistry.findAdapter(from) || TweenPluginRegistry.findAdapter(to);
    if (plugin) {
      return plugin.lerp(from, to, t, out);
    }

    // 1. Numbers
    if (typeof from === 'number' && typeof to === 'number') {
      return from + (to - from) * t;
    }

    // 2. Booleans
    if (typeof from === 'boolean' || typeof to === 'boolean') {
      return t >= 0.5 ? Boolean(to) : Boolean(from);
    }

    // 3. Strings
    if (typeof from === 'string' && typeof to === 'string') {
      return TweenValueAdapter.interpolateString(from, to, t, stringMode, scrambleCharset);
    }

    // 4. Three.js Vector2
    if (from instanceof THREE.Vector2 && to instanceof THREE.Vector2) {
      const result = out instanceof THREE.Vector2 ? out : new THREE.Vector2();
      result.x = from.x + (to.x - from.x) * t;
      result.y = from.y + (to.y - from.y) * t;
      return result;
    }

    // 5. Three.js Vector3
    if (from instanceof THREE.Vector3 && to instanceof THREE.Vector3) {
      const result = out instanceof THREE.Vector3 ? out : new THREE.Vector3();
      result.x = from.x + (to.x - from.x) * t;
      result.y = from.y + (to.y - from.y) * t;
      result.z = from.z + (to.z - from.z) * t;
      return result;
    }

    // 6. Three.js Vector4
    if (from instanceof THREE.Vector4 && to instanceof THREE.Vector4) {
      const result = out instanceof THREE.Vector4 ? out : new THREE.Vector4();
      result.x = from.x + (to.x - from.x) * t;
      result.y = from.y + (to.y - from.y) * t;
      result.z = from.z + (to.z - from.z) * t;
      result.w = from.w + (to.w - from.w) * t;
      return result;
    }

    // 7. Three.js Color
    if (from instanceof THREE.Color && to instanceof THREE.Color) {
      const result = out instanceof THREE.Color ? out : new THREE.Color();
      result.r = from.r + (to.r - from.r) * t;
      result.g = from.g + (to.g - from.g) * t;
      result.b = from.b + (to.b - from.b) * t;
      return result;
    }

    // 8. Three.js Quaternion (Shortest-path Slerp)
    if (from instanceof THREE.Quaternion && to instanceof THREE.Quaternion) {
      const result = out instanceof THREE.Quaternion ? out : new THREE.Quaternion();
      // Ensure shortest path by checking dot product sign
      const targetQuat = TweenPool.acquireQuaternion(to.x, to.y, to.z, to.w);
      const dot = from.dot(targetQuat);
      if (dot < 0) {
        targetQuat.set(-targetQuat.x, -targetQuat.y, -targetQuat.z, -targetQuat.w);
      }
      result.copy(from).slerp(targetQuat, t).normalize();
      TweenPool.releaseQuaternion(targetQuat);
      return result;
    }

    // 9. Three.js Euler (Shortest angular path per axis)
    if (from instanceof THREE.Euler && to instanceof THREE.Euler) {
      const result = out instanceof THREE.Euler ? out : new THREE.Euler(0, 0, 0, to.order);
      result.order = to.order;
      result.x = TweenValueAdapter.interpolateAngle(from.x, to.x, t);
      result.y = TweenValueAdapter.interpolateAngle(from.y, to.y, t);
      result.z = TweenValueAdapter.interpolateAngle(from.z, to.z, t);
      return result;
    }

    // 10. Arrays (Plain numbers or TypedArrays)
    if (Array.isArray(from) && Array.isArray(to)) {
      const len = Math.max(from.length, to.length);
      const result = Array.isArray(out) ? out : new Array(len);
      for (let i = 0; i < len; i++) {
        const vFrom = from[i] ?? 0;
        const vTo = to[i] ?? 0;
        result[i] = typeof vFrom === 'number' && typeof vTo === 'number'
          ? vFrom + (vTo - vFrom) * t
          : TweenValueAdapter.interpolate(vFrom, vTo, t, stringMode, scrambleCharset);
      }
      return result;
    }

    if (ArrayBuffer.isView(from) && ArrayBuffer.isView(to)) {
      const len = Math.min((from as any).length, (to as any).length);
      const result = out && out.constructor === from.constructor ? out : new (from.constructor as any)(len);
      for (let i = 0; i < len; i++) {
        const vFrom = (from as any)[i];
        const vTo = (to as any)[i];
        result[i] = vFrom + (vTo - vFrom) * t;
      }
      return result;
    }

    // 11. Plain Objects (Component-wise interpolation)
    if (typeof from === 'object' && typeof to === 'object' && from !== null && to !== null) {
      const result = out && typeof out === 'object' ? out : {};
      const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
      for (const k of keys) {
        if (FORBIDDEN_KEYS.has(k)) continue;
        if (k in from && k in to) {
          result[k] = TweenValueAdapter.interpolate(from[k], to[k], t, stringMode, scrambleCharset, result[k]);
        } else if (k in to) {
          result[k] = to[k];
        }
      }
      return result;
    }

    // Fallback: step flip
    return t >= 1 ? to : from;
  }

  /**
   * Shortest angle interpolation avoiding 360-degree wraps.
   */
  static interpolateAngle(from: number, to: number, t: number): number {
    const twoPi = Math.PI * 2;
    let delta = (to - from) % twoPi;
    if (delta > Math.PI) delta -= twoPi;
    else if (delta < -Math.PI) delta += twoPi;
    return from + delta * t;
  }

  /**
   * String interpolation for UI typewriters and numeric counter text.
   */
  static interpolateString(
    from: string,
    to: string,
    t: number,
    mode: 'typewriter' | 'scramble' | 'numeric',
    charset: string,
  ): string {
    if (t <= 0) return from;
    if (t >= 1) return to;

    if (mode === 'numeric') {
      const numFrom = parseFloat(from.replace(/[^0-9.-]/g, '')) || 0;
      const numTo = parseFloat(to.replace(/[^0-9.-]/g, '')) || 0;
      const isInteger = Number.isInteger(numFrom) && Number.isInteger(numTo);
      const curr = numFrom + (numTo - numFrom) * t;
      return isInteger ? Math.round(curr).toString() : curr.toFixed(2);
    }

    if (mode === 'scramble') {
      const targetLen = to.length;
      const revealedCount = Math.floor(targetLen * t);
      let res = to.slice(0, revealedCount);
      for (let i = revealedCount; i < targetLen; i++) {
        if (to[i] === ' ' || to[i] === '\n') {
          res += to[i];
        } else {
          const randIdx = Math.floor(Math.random() * charset.length);
          res += charset[randIdx];
        }
      }
      return res;
    }

    // Typewriter: reveal characters progressively
    const charCount = Math.floor(to.length * t);
    return to.slice(0, charCount);
  }

  /**
   * Add a delta value to a base value (used for incremental loops and additive blending).
   */
  static addValues(base: any, delta: any, factor = 1): any {
    if (typeof base === 'number' && typeof delta === 'number') {
      return base + delta * factor;
    }

    const plugin = TweenPluginRegistry.findAdapter(base);
    if (plugin?.add) {
      return plugin.add(base, delta);
    }

    if (base instanceof THREE.Vector2 && delta instanceof THREE.Vector2) {
      return new THREE.Vector2(base.x + delta.x * factor, base.y + delta.y * factor);
    }

    if (base instanceof THREE.Vector3 && delta instanceof THREE.Vector3) {
      return new THREE.Vector3(base.x + delta.x * factor, base.y + delta.y * factor, base.z + delta.z * factor);
    }

    if (base instanceof THREE.Vector4 && delta instanceof THREE.Vector4) {
      return new THREE.Vector4(base.x + delta.x * factor, base.y + delta.y * factor, base.z + delta.z * factor, base.w + delta.w * factor);
    }

    if (base instanceof THREE.Euler && delta instanceof THREE.Euler) {
      return new THREE.Euler(base.x + delta.x * factor, base.y + delta.y * factor, base.z + delta.z * factor, base.order);
    }

    if (base instanceof THREE.Quaternion && delta instanceof THREE.Quaternion) {
      // Multiply quaternions to compose rotations
      const q = new THREE.Quaternion().copy(base);
      if (factor === 1) {
        q.multiply(delta).normalize();
      } else {
        const scaledDelta = new THREE.Quaternion().slerp(delta, factor);
        q.multiply(scaledDelta).normalize();
      }
      return q;
    }

    if (base instanceof THREE.Color && delta instanceof THREE.Color) {
      return new THREE.Color(
        Math.min(Math.max(base.r + delta.r * factor, 0), 1),
        Math.min(Math.max(base.g + delta.g * factor, 0), 1),
        Math.min(Math.max(base.b + delta.b * factor, 0), 1),
      );
    }

    if (Array.isArray(base) && Array.isArray(delta)) {
      const len = Math.max(base.length, delta.length);
      const res = new Array(len);
      for (let i = 0; i < len; i++) {
        const b = base[i] ?? 0;
        const d = delta[i] ?? 0;
        res[i] = typeof b === 'number' && typeof d === 'number' ? b + d * factor : b;
      }
      return res;
    }

    if (typeof base === 'object' && typeof delta === 'object' && base !== null && delta !== null) {
      const res: Record<string, any> = { ...base };
      for (const k of Object.keys(delta)) {
        if (!FORBIDDEN_KEYS.has(k)) {
          if (k in base) {
            res[k] = TweenValueAdapter.addValues(base[k], delta[k], factor);
          }
        }
      }
      return res;
    }

    return base;
  }

  /**
   * Compute delta = (to - from)
   */
  static diffValues(from: any, to: any): any {
    if (typeof from === 'number' && typeof to === 'number') {
      return to - from;
    }

    const plugin = TweenPluginRegistry.findAdapter(from);
    if (plugin?.diff) {
      return plugin.diff(from, to);
    }

    if (from instanceof THREE.Vector2 && to instanceof THREE.Vector2) {
      return new THREE.Vector2(to.x - from.x, to.y - from.y);
    }

    if (from instanceof THREE.Vector3 && to instanceof THREE.Vector3) {
      return new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
    }

    if (from instanceof THREE.Vector4 && to instanceof THREE.Vector4) {
      return new THREE.Vector4(to.x - from.x, to.y - from.y, to.z - from.z, to.w - from.w);
    }

    if (from instanceof THREE.Euler && to instanceof THREE.Euler) {
      return new THREE.Euler(to.x - from.x, to.y - from.y, to.z - from.z, to.order);
    }

    if (from instanceof THREE.Quaternion && to instanceof THREE.Quaternion) {
      // delta = from^-1 * to
      const invFrom = from.clone().invert();
      return new THREE.Quaternion().multiplyQuaternions(invFrom, to).normalize();
    }

    if (from instanceof THREE.Color && to instanceof THREE.Color) {
      return new THREE.Color(to.r - from.r, to.g - from.g, to.b - from.b);
    }

    if (Array.isArray(from) && Array.isArray(to)) {
      const len = Math.max(from.length, to.length);
      const res = new Array(len);
      for (let i = 0; i < len; i++) {
        const f = from[i] ?? 0;
        const t = to[i] ?? 0;
        res[i] = typeof f === 'number' && typeof t === 'number' ? t - f : t;
      }
      return res;
    }

    if (typeof from === 'object' && typeof to === 'object' && from !== null && to !== null) {
      const res: Record<string, any> = {};
      for (const k of Object.keys(to)) {
        if (!FORBIDDEN_KEYS.has(k)) {
          if (k in from) {
            res[k] = TweenValueAdapter.diffValues(from[k], to[k]);
          } else {
            res[k] = to[k];
          }
        }
      }
      return res;
    }

    return to;
  }

  static combineValues(base: any, values: any[], mode: 'blend' | 'additive' | 'multiply'): any | undefined {
    const plugin = TweenPluginRegistry.findAdapter(base) ?? TweenPluginRegistry.findAdapter(values[0]);
    return plugin?.combine?.(base, values, mode);
  }
}
