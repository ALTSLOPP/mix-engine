import * as THREE from 'three';
import { CameraShake, type ActiveShake, type ShakeOptions } from './CameraShake';
import { ScreenFlash, type FlashOptions } from './ScreenFlash';
import { TrailRenderer, type TrailOptions } from './TrailRenderer';
import { DecalSystem, type DecalOptions } from './DecalSystem';
import { WeatherSystem, type WeatherKind } from './WeatherSystem';
import type { Viewport } from '../rendering/Viewport';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import type { VfxPresetName } from '../vfx/ParticleEmitter';

/**
 * EffectsController.ts — a single facade that bundles every game-feel /
 * cinematic effect system under one API so the IDE (and the AI bridge, and
 * the engine's runtime scripts) can do "the obvious thing" with one call.
 *
 *   engine.effects.cameraShake({ trauma: 0.7, duration: 0.4 })
 *   engine.effects.screenFlash({ color: '#ff0044', intensity: 0.6 })
 *   engine.effects.trail({ color: '#ffaa00', lifetime: 0.4 })
 *   engine.effects.decal({ origin, direction, color: '#7a0a00' })
 *   engine.effects.setWeather('rain', { intensity: 0.7 })
 *   engine.effects.setTimeScale(0.25)         // bullet time
 *   engine.effects.hit({ position })          // one-call "got hit" combo
 *   engine.effects.explosion({ position })    // one-call "BIG boom" combo
 *
 * No allocation per call. Tick once per frame from the engine loop.
 *
 * Camera-shake note: applyToCamera adds a one-frame offset that is
 * UNDONE in endFrame() so the underlying camera transform (controlled by
 * the editor flycam, the cinematic director, the third-person player) is
 * never permanently drifted by a shake.
 */
export class EffectsController {
  readonly cameraShake: CameraShake;
  readonly screenFlash: ScreenFlash;
  readonly weather: WeatherSystem;
  private readonly trails = new Set<TrailRenderer>();
  private readonly decals: DecalSystem;

  private readonly viewport: Viewport;
  private readonly physicsWorld: PhysicsWorld;
  private readonly worldOrigin: WorldOrigin;
  private readonly setTimeScaleFn: (scale: number) => void;
  private readonly burstVfxFn: (preset: VfxPresetName, worldPos: THREE.Vector3, count?: number) => unknown;
  private _timeScale = 1;
  /** Stash of the shake offset applied last frame so `endFrame` can undo it. */
  private _lastShake: { position: THREE.Vector3; euler: THREE.Euler } | null = null;

  constructor(deps: {
    viewport: Viewport;
    physicsWorld: PhysicsWorld;
    worldOrigin: WorldOrigin;
    setTimeScale: (scale: number) => void;
    burstVfx: (preset: VfxPresetName, worldPos: THREE.Vector3, count?: number) => unknown;
  }) {
    this.viewport = deps.viewport;
    this.physicsWorld = deps.physicsWorld;
    this.worldOrigin = deps.worldOrigin;
    this.setTimeScaleFn = deps.setTimeScale;
    this.burstVfxFn = deps.burstVfx;
    this.cameraShake = new CameraShake();
    this.screenFlash = new ScreenFlash();
    this.weather = new WeatherSystem(deps.viewport.scene);
    this.decals = new DecalSystem(deps.viewport.scene, deps.physicsWorld);
  }

  // ─── Camera shake ─────────────────────────────────────────────────────
  /** Trigger a camera shake. `opts` is the same shape as `CameraShake.shake()`. */
  shake(opts: ShakeOptions = {}): ActiveShake {
    return this.cameraShake.shake(opts);
  }
  stopShake(handle?: ActiveShake): void {
    this.cameraShake.stop(handle);
  }

  // ─── Screen flash ─────────────────────────────────────────────────────
  /** Trigger a screen flash. */
  flash(opts: FlashOptions = {}): void {
    this.screenFlash.flash(opts);
  }
  clearScreenFlash(): void {
    this.screenFlash.clear();
  }

  // ─── Time scale (slow-mo / bullet time) ───────────────────────────────
  setTimeScale(scale: number): void {
    this._timeScale = scale;
    this.setTimeScaleFn(scale);
  }
  get timeScale(): number { return this._timeScale; }

  // ─── Trails (sword slash, motion, jet exhaust) ────────────────────────
  trail(opts: TrailOptions = {}): TrailRenderer {
    // Inject the live camera so the ribbon stays broadside to the viewer (callers
    // may override by passing their own `camera`).
    const t = new TrailRenderer(this.viewport.scene, { camera: this.viewport.camera, ...opts });
    this.trails.add(t);
    return t;
  }
  stopTrail(t: TrailRenderer): void {
    if (this.trails.delete(t)) t.dispose();
  }

  // ─── Decals (bullet holes, blood, footprints) ─────────────────────────
  // The public/AI API is WORLD space; DecalSystem works in engine space (it places
  // meshes as plain scene children). Convert origin/position here so decals land
  // correctly even after a floating-origin shift. `direction`/`normal` are directions
  // (origin-shift invariant) so they pass through unchanged.
  decal(opts: DecalOptions & { origin: THREE.Vector3; direction: THREE.Vector3; maxDistance?: number }): unknown {
    const origin = this.worldOrigin.toEngineSpace(opts.origin);
    return this.decals.decalAtHit({ ...opts, origin });
  }
  decalAtPoint(opts: DecalOptions & { position: THREE.Vector3; normal: THREE.Vector3 }): unknown {
    const position = this.worldOrigin.toEngineSpace(opts.position);
    return this.decals.decalAtPoint({ ...opts, position });
  }
  clearDecals(tag?: string): void {
    this.decals.clear(tag);
  }

  // ─── Weather ─────────────────────────────────────────────────────────
  setWeather(kind: WeatherKind, opts: { intensity?: number } = {}): void {
    this.weather.set(kind, opts);
  }
  setWeatherIntensity(v: number): void {
    this.weather.setIntensity(v);
  }

  // ─── One-call combos (the "game feel" defaults) ───────────────────────
  /**
   * The canonical "something got hit" combo: a particle burst + a short
   * camera shake + a coloured screen flash. Tuned so a single `hit()` call
   * feels like a punch, not a footnote.
   */
  hit(opts: { position?: THREE.Vector3; color?: number | string; intensity?: number; vfx?: VfxPresetName } = {}): void {
    const intensity = opts.intensity ?? 0.5;
    const color = String(opts.color ?? '#ff3344');
    if (opts.position) {
      this.burstVfxFn(opts.vfx ?? 'sparks', opts.position, Math.floor(20 + intensity * 40));
    }
    this.cameraShake.shake({ trauma: 0.3 + intensity * 0.4, duration: 0.18 + intensity * 0.25, translation: 0.08 + intensity * 0.15, rotation: 0.02 });
    this.screenFlash.flash({ color, intensity: 0.15 + intensity * 0.25, duration: 0.12 + intensity * 0.18, mode: 'pulse' });
  }

  /**
   * Big cinematic "explosion" combo: a screen shake, an explosion VFX burst,
   * and a vivid screen flash.
   */
  explosion(opts: { position?: THREE.Vector3; color?: number | string } = {}): void {
    this.cameraShake.shake({ trauma: 0.85, duration: 0.6, translation: 0.4, rotation: 0.04 });
    this.screenFlash.flash({ color: String(opts.color ?? '#ffe066'), intensity: 0.55, duration: 0.35, mode: 'pulse' });
    if (opts.position) {
      this.burstVfxFn('explosion', opts.position, 80);
    }
  }

  /**
   * Per-frame tick. Called by Engine.update(). The camera shake is applied
   * here; `endFrame()` reverts it so the underlying transform isn't drifted.
   */
  update(dt: number, now: number): void {
    // Trails
    for (const t of this.trails) t.update(dt, now);
    // Decals
    this.decals.update(dt);
    // Weather follows the camera so the player is always inside the effect.
    this.weather.update(dt, this.viewport.camera);
    // Compute the per-frame shake offset and apply it.
    const shake = this.cameraShake.update(dt);
    if (this.cameraShake.active) {
      this.viewport.camera.position.add(shake.position);
      this.viewport.camera.rotation.x += shake.euler.x;
      this.viewport.camera.rotation.y += shake.euler.y;
      this.viewport.camera.rotation.z += shake.euler.z;
      this._lastShake = shake;
    } else {
      this._lastShake = null;
    }
  }

  /** Reverse the per-frame camera-shake offset so the next frame's
   *  authoritative transform isn't drifting. Call AFTER the camera was used
   *  for rendering. */
  endFrame(): void {
    if (!this._lastShake) return;
    this.viewport.camera.position.sub(this._lastShake.position);
    this.viewport.camera.rotation.x -= this._lastShake.euler.x;
    this.viewport.camera.rotation.y -= this._lastShake.euler.y;
    this.viewport.camera.rotation.z -= this._lastShake.euler.z;
    this._lastShake = null;
  }

  dispose(): void {
    for (const t of this.trails) t.dispose();
    this.trails.clear();
    this.decals.clear();
    this.weather.dispose();
    this.screenFlash.dispose();
  }
}
