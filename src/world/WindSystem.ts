import * as THREE from 'three';
import type { Engine } from '../engine/Engine';

/**
 * WindSystem.ts — one coherent global wind field for the whole world, so grass, foliage, clouds and
 * (optionally) water all move TOGETHER instead of each animating to its own clock. Exposes a base
 * direction + strength plus a deterministic gust envelope; consumers read `vector()` / `strength()`
 * each frame. The gust math is pure + Vitest-tested.
 */

/** Smooth gust multiplier around 1.0 (range ≈ [1−gustiness, 1+gustiness]) — two detuned sines. */
export function windGust(t: number, gustiness: number): number {
  const g = (Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.73 + 1.3) * 0.4); // ≈ [-1,1]
  return 1 + g * gustiness;
}

export class WindSystem {
  /** Base wind direction in the world XZ plane (unit). */
  readonly dir = new THREE.Vector2(1, 0).normalize();
  /** Base wind strength (multiplier consumers scale their sway/drift by). */
  strength = 1;
  /** 0 = steady, 1 = very gusty. */
  gustiness = 0.35;
  private time = 0;

  constructor(engine: Engine) {
    engine.addUpdateHook((dt) => { this.time += dt; });
  }

  set(opts: { dirX?: number; dirZ?: number; strength?: number; gustiness?: number }): void {
    if (opts.dirX !== undefined || opts.dirZ !== undefined) {
      this.dir.set(opts.dirX ?? this.dir.x, opts.dirZ ?? this.dir.y);
      if (this.dir.lengthSq() < 1e-8) this.dir.set(1, 0);
      this.dir.normalize();
    }
    if (opts.strength !== undefined) this.strength = Math.max(0, opts.strength);
    if (opts.gustiness !== undefined) this.gustiness = THREE.MathUtils.clamp(opts.gustiness, 0, 1);
  }

  /** Current (gusting) wind strength. */
  current(): number { return this.strength * windGust(this.time, this.gustiness); }

  /** Current wind vector in XZ (direction × gusting strength). */
  vector(out = new THREE.Vector2()): THREE.Vector2 {
    return out.copy(this.dir).multiplyScalar(this.current());
  }

  get t(): number { return this.time; }

  info(): object {
    return {
      dir: [+this.dir.x.toFixed(3), +this.dir.y.toFixed(3)],
      strength: this.strength,
      gustiness: this.gustiness,
      current: +this.current().toFixed(3),
    };
  }
}
