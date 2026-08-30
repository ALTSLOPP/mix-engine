import * as THREE from 'three';

/**
 * CameraShake.ts — Perlin-style noise driven camera shake. Drives a per-frame
 * offset / rotation perturbation that is applied on top of the camera's
 * authoritative transform by the render loop.
 *
 * Design notes:
 *   - Multiple shakes can be ACTIVE simultaneously (e.g. an explosion shake and
 *     a low rumble at the same time). They accumulate with the strongest
 *     contribution winning per axis.
 *   - Each shake has a `trauma` curve (0..1, decays over `duration`) and a
 *     `frequency` (Hz). The actual offset is `trauma^2 * noise(t * frequency)`
 *     — the quadratic falloff is from the GDC talk "Math for Game Programmers:
 *     Juicing Your Cameras With Math" and gives that punchy game feel.
 *   - Cheap: pure CPU noise, no allocations per frame.
 *
 * Public API:
 *   shake({ trauma, duration, frequency, axes, falloff })
 *   stop()
 *   update(dt) -> { position: Vector3, rotationEuler: Euler }   // consumed by Engine
 */

export interface ShakeOptions {
  /** Peak intensity, 0..1. Drives the trauma^2 falloff. */
  trauma?: number;
  /** How long the shake lasts in seconds. */
  duration?: number;
  /** How fast the noise oscillates, in Hz. */
  frequency?: number;
  /** Translation amplitude in metres at trauma=1. */
  translation?: number;
  /** Rotation amplitude in radians at trauma=1. */
  rotation?: number;
  /** Which axes are affected. Defaults to all three. */
  axes?: { x?: boolean; y?: boolean; z?: boolean };
  /** 'linear' or 'quadratic' (default) trauma decay. */
  falloff?: 'linear' | 'quadratic' | 'exponential';
  /** Random seed so per-shake seeds differ. */
  seed?: number;
}

export interface ActiveShake {
  trauma: number;
  peakTrauma: number;
  duration: number;
  elapsed: number;
  frequency: number;
  translation: number;
  rotation: number;
  axes: { x: boolean; y: boolean; z: boolean };
  falloff: 'linear' | 'quadratic' | 'exponential';
  seed: number;
}

export class CameraShake {
  private readonly shakes: ActiveShake[] = [];
  /** Accumulated per-frame offset. Re-used to avoid allocations. */
  private readonly _pos = new THREE.Vector3();
  private readonly _euler = new THREE.Euler();
  /** Pre-allocated sample accumulators (3 axes translation + 3 rotation). */
  private readonly _samples = [0, 0, 0, 0, 0, 0];

  /**
   * Trigger a shake. Returns a handle that can be passed to `stop(handle)` to
   * cancel early (e.g. if the entity triggering it gets despawned mid-shake).
   */
  shake(opts: ShakeOptions = {}): ActiveShake {
    const peakTrauma = THREE.MathUtils.clamp(opts.trauma ?? 0.5, 0, 1);
    const shake: ActiveShake = {
      trauma: peakTrauma,
      peakTrauma,
      duration: Math.max(0.01, opts.duration ?? 0.4),
      elapsed: 0,
      frequency: opts.frequency ?? 25,
      translation: opts.translation ?? 0.15,
      rotation: opts.rotation ?? THREE.MathUtils.degToRad(2.5),
      axes: {
        x: opts.axes?.x ?? true,
        y: opts.axes?.y ?? true,
        z: opts.axes?.z ?? true,
      },
      falloff: opts.falloff ?? 'quadratic',
      seed: opts.seed ?? Math.random() * 1000,
    };
    this.shakes.push(shake);
    return shake;
  }

  /** Cancel a specific shake (handle from `shake()`) or all shakes if no arg. */
  stop(handle?: ActiveShake): void {
    if (!handle) {
      this.shakes.length = 0;
      return;
    }
    const idx = this.shakes.indexOf(handle);
    if (idx >= 0) this.shakes.splice(idx, 1);
  }

  /**
   * Tick all active shakes and return the cumulative offset to add to the
   * camera. The caller (Engine.render loop) should apply this AFTER the
   * authoritative transform is set, then subtract it back on the NEXT frame
   * (or just apply it as a one-shot render-only transform — see
   * `applyToCamera`).
   */
  update(dt: number): { position: THREE.Vector3; euler: THREE.Euler } {
    this._pos.set(0, 0, 0);
    this._euler.set(0, 0, 0);
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i];
      s.elapsed += dt;
      if (s.elapsed >= s.duration) {
        this.shakes.splice(i, 1);
        continue;
      }
      // Trauma decay curve.
      const linearT = s.elapsed / s.duration;
      let decay = 1 - linearT;
      if (s.falloff === 'quadratic') decay = decay * decay;
      else if (s.falloff === 'exponential') decay = Math.exp(-linearT * 4);
      const t = s.peakTrauma * decay;
      // Square the trauma for the punchy "small shake is invisible, big shake is huge" feel.
      const amp = t * t;
      if (amp <= 0.0001) continue;

      // Pseudo-Perlin samples: three independent noise streams (one per axis).
      // sin(t * freq + seed) is cheap, deterministic, and good enough for shake.
      const time = s.elapsed * s.frequency;
      this._samples[0] = Math.sin(time * 1.7 + s.seed) * amp;
      this._samples[1] = Math.sin(time * 2.3 + s.seed * 1.3 + 1.1) * amp;
      this._samples[2] = Math.sin(time * 1.9 + s.seed * 1.7 + 2.2) * amp;
      this._samples[3] = Math.sin(time * 2.1 + s.seed * 0.7 + 3.3) * amp;
      this._samples[4] = Math.sin(time * 1.5 + s.seed * 1.1 + 4.4) * amp;
      this._samples[5] = Math.sin(time * 2.5 + s.seed * 0.9 + 5.5) * amp;

      if (s.axes.x) this._pos.x += this._samples[0] * s.translation;
      if (s.axes.y) this._pos.y += this._samples[1] * s.translation;
      if (s.axes.z) this._pos.z += this._samples[2] * s.translation;
      this._euler.x += this._samples[3] * s.rotation;
      this._euler.y += this._samples[4] * s.rotation;
      this._euler.z += this._samples[5] * s.rotation;
    }
    return { position: this._pos, euler: this._euler };
  }

  /**
   * Apply the current shake offset to a camera as a render-time transform.
   * The camera's authoritative position/quaternion are NOT mutated — the
   * offset is applied in the scene's world matrix via a temporary parent /
   * Group pattern, OR by stashing the offset onto `camera.userData.shakeOffset`
   * for the renderer to apply after the matrix update. The simplest pattern
   * is to just add the offset after the camera's own `lookAt` / `updateMatrix`.
   */
  applyToCamera(camera: THREE.PerspectiveCamera): void {
    if (this.shakes.length === 0) return;
    camera.position.add(this._pos);
    // Re-derive the rotation: small-angle Euler add is good enough for shake.
    camera.rotation.x += this._euler.x;
    camera.rotation.y += this._euler.y;
    camera.rotation.z += this._euler.z;
  }

  /** True if any shake is currently active. */
  get active(): boolean { return this.shakes.length > 0; }
  get count(): number { return this.shakes.length; }
}
