import * as THREE from 'three';
import type { RenderPipeline } from './RenderPipeline';

/**
 * QualityScaler.ts — runtime, FPS-driven dynamic quality scaling.
 *
 * Ported from the GTA prototype's resolution-scale / AA / shadow quality toggles (its Visual
 * Settings panel + `PerformanceTuning.ts`). The MIX engine's SENSORIUM measures how the game
 * *feels* but never *acts* on a slow frame; this closes the loop: when sustained FPS drops
 * below target it steps quality DOWN (render resolution first, then the most expensive post
 * passes, then shadows); when there's comfortable headroom it steps back UP.
 *
 * It runs its own lightweight rAF sampler (decoupled from the engine loop, so wiring it in is
 * a one-liner and it can't destabilise the fixed-step simulation). It is DISABLED by default
 * — adaptive resolution fighting a user's chosen settings is surprising — so call `enable()`
 * to turn it on (e.g. from a game's `main.js`, or `window.mix.quality.enable()` in the REPL).
 *
 *   const q = new QualityScaler(viewport.renderer, viewport.pipeline);
 *   q.setTarget(55);   // aim to hold 55fps
 *   q.enable();
 */

export interface QualityScalerOptions {
  /** Target FPS to hold (default 55). */
  targetFps?: number;
  /** Drop a level when smoothed FPS sits this far below target (default 8). */
  downHysteresis?: number;
  /** Raise a level when smoothed FPS sits this far above target (default 12). */
  upHysteresis?: number;
  /** Minimum seconds between quality changes (default 1.5). */
  cooldown?: number;
  /** Minimum render-resolution multiplier (default 0.6). */
  minScale?: number;
}

/** A single quality tier (lower index = higher quality). */
interface QualityLevel {
  /** Render-resolution multiplier on the base device pixel ratio. */
  scale: number;
  /** Pipeline passes to disable at this level (best-effort; ignored if absent). */
  disablePasses: string[];
  /** Whether shadow maps stay enabled at this level. */
  shadows: boolean;
}

export class QualityScaler {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pipeline: RenderPipeline | null;

  private readonly levels: QualityLevel[] = [
    { scale: 1.0, disablePasses: [], shadows: true },
    { scale: 0.85, disablePasses: ['ssrPass'], shadows: true },
    { scale: 0.72, disablePasses: ['ssrPass', 'dofPass'], shadows: true },
    { scale: 0.62, disablePasses: ['ssrPass', 'dofPass', 'aoPass'], shadows: true },
    { scale: 0.55, disablePasses: ['ssrPass', 'dofPass', 'aoPass', 'bloomPass'], shadows: false },
  ];
  private currentLevel = 0;

  private targetFps: number;
  private readonly downHysteresis: number;
  private readonly upHysteresis: number;
  private readonly cooldown: number;
  private readonly minScale: number;

  private smoothedFps = 60;
  private lastSampleTime = 0;
  private frameCount = 0;
  private lastChangeTime = 0;
  private rafId = 0;
  private running = false;
  /** Capture original pass-enabled flags so disable() can restore them exactly. */
  private readonly originalPassEnabled = new Map<string, boolean>();
  private originalShadows = false;
  private originalPixelRatio = 1;

  constructor(renderer: THREE.WebGLRenderer, pipeline?: RenderPipeline | null, opts: QualityScalerOptions = {}) {
    this.renderer = renderer;
    this.pipeline = pipeline ?? null;
    this.targetFps = opts.targetFps ?? 55;
    this.downHysteresis = opts.downHysteresis ?? 8;
    this.upHysteresis = opts.upHysteresis ?? 12;
    this.cooldown = opts.cooldown ?? 1.5;
    this.minScale = opts.minScale ?? 0.6;
    // Clamp configured levels to the requested floor.
    this.levels = this.levels.filter((l) => l.scale >= this.minScale - 1e-6);
    if (this.levels.length === 0) this.levels.push({ scale: this.minScale, disablePasses: [], shadows: true });
  }

  setTarget(fps: number): void { this.targetFps = Math.max(15, fps); }
  get level(): number { return this.currentLevel; }
  get fps(): number { return this.smoothedFps; }
  get isEnabled(): boolean { return this.running; }

  enable(): void {
    if (this.running) return;
    this.running = true;
    this.originalShadows = this.renderer.shadowMap.enabled;
    this.originalPixelRatio = this.renderer.getPixelRatio();
    this.originalPassEnabled.clear();
    this.lastSampleTime = performance.now();
    this.frameCount = 0;
    const loop = () => {
      if (!this.running) return;
      this.sample();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  disable(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    // Restore full quality.
    this.applyLevel(0);
  }

  private sample(): void {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastSampleTime;
    if (elapsed < 500) return; // sample twice a second

    const fps = (this.frameCount * 1000) / elapsed;
    this.smoothedFps += (fps - this.smoothedFps) * 0.5;
    this.frameCount = 0;
    this.lastSampleTime = now;

    if ((now - this.lastChangeTime) / 1000 < this.cooldown) return;

    if (this.smoothedFps < this.targetFps - this.downHysteresis && this.currentLevel < this.levels.length - 1) {
      this.applyLevel(this.currentLevel + 1);
      this.lastChangeTime = now;
    } else if (this.smoothedFps > this.targetFps + this.upHysteresis && this.currentLevel > 0) {
      this.applyLevel(this.currentLevel - 1);
      this.lastChangeTime = now;
    }
  }

  private applyLevel(index: number): void {
    const level = this.levels[index];
    if (!level) return;
    this.currentLevel = index;

    // 1. Render resolution.
    if (this.pipeline) this.pipeline.setDynamicResolutionScale(level.scale);
    else this.renderer.setPixelRatio(this.originalPixelRatio * level.scale);

    // 2. Expensive post passes (best-effort; remember originals to restore on level 0).
    if (this.pipeline) {
      const pipeAny = this.pipeline as unknown as Record<string, { enabled?: boolean } | undefined>;
      const allTracked = new Set<string>(this.levels.flatMap((l) => l.disablePasses));
      for (const name of allTracked) {
        const pass = pipeAny[name];
        if (!pass) continue;
        if (!this.originalPassEnabled.has(name)) this.originalPassEnabled.set(name, pass.enabled ?? true);
        const shouldDisable = level.disablePasses.includes(name);
        pass.enabled = shouldDisable ? false : (this.originalPassEnabled.get(name) ?? true);
      }
    }

    // 3. Shadows.
    const shadows = this.originalShadows && level.shadows;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }
}
