import * as THREE from 'three';
import type { RenderPipeline } from './RenderPipeline';
import type { PerformanceTargetDescriptor, QualityStepDefinition } from './profiles/PerformanceTargetRegistry';
import type { LODSystem } from './LODSystem';
import type { AnimationLodManager } from '../assets/derived/AnimationOptimizer';

export interface QualityScalerOptions {
  /** Target FPS to hold (default 55, or taken from PerformanceTarget). */
  targetFps?: number;
  /** Drop a level when smoothed FPS sits this far below target (default 6). */
  downHysteresis?: number;
  /** Raise a level when smoothed FPS sits this far above target (default 8). */
  upHysteresis?: number;
  /** Minimum seconds between quality changes (default 1.5). */
  cooldown?: number;
  /** Minimum render-resolution multiplier (default 0.55). */
  minScale?: number;
  /** Whether to start running immediately. */
  enabled?: boolean;
  /** Geometry LOD subsystem to mutate on quality level changes. */
  lodSystem?: LODSystem;
  /** Skeletal animation LOD subsystem to mutate on quality level changes. */
  animationLodManager?: AnimationLodManager;
  /** Callback invoked when particle density is scaled. */
  onParticleDensityChange?: (density: number) => void;
}

export interface QualityChangeEvent {
  timestamp: number;
  fromLevel: number;
  toLevel: number;
  fps: number;
  targetFps: number;
  reason: string;
  changes: string[];
  preserved: string[];
  preservedFeatures?: string[];
}

export class QualityScaler {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pipeline: RenderPipeline | null;

  private levels: QualityStepDefinition[] = [
    { scale: 1.0, disablePasses: [], shadows: true, lodBias: 1.0, animationLodBias: 1.0, particleDensity: 1.0 },
    { scale: 0.85, disablePasses: ['ssrPass'], shadows: true, lodBias: 1.2, animationLodBias: 1.2, particleDensity: 0.85 },
    { scale: 0.72, disablePasses: ['ssrPass', 'dofPass'], shadows: true, lodBias: 1.4, animationLodBias: 1.4, particleDensity: 0.7 },
    { scale: 0.62, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass'], shadows: true, lodBias: 1.8, animationLodBias: 1.8, particleDensity: 0.5 },
    { scale: 0.55, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass', 'bloomPass'], shadows: false, lodBias: 2.2, animationLodBias: 2.2, particleDensity: 0.3 },
  ];
  private currentLevel = 0;

  private targetFps: number;
  private readonly downHysteresis: number;
  private readonly upHysteresis: number;
  private readonly cooldown: number;
  private readonly minScale: number;
  private lodSystem?: LODSystem;
  private animationLodManager?: AnimationLodManager;
  private onParticleDensityChange?: (density: number) => void;

  private smoothedFps = 60;
  private lastSampleTime = 0;
  private frameCount = 0;
  private lastChangeTime = 0;
  private rafId = 0;
  private running = false;

  private readonly originalPassEnabled = new Map<string, boolean>();
  private originalShadows = false;
  private originalPixelRatio = 1;

  private readonly history: QualityChangeEvent[] = [];
  private readonly maxHistory = 20;

  constructor(rendererOrOpts?: THREE.WebGLRenderer | QualityScalerOptions, pipeline?: RenderPipeline | null, opts: QualityScalerOptions = {}) {
    let actualOpts = opts;
    let actualRenderer: THREE.WebGLRenderer | null = null;
    const actualPipeline = pipeline ?? null;

    if (pipeline !== undefined || Object.keys(opts).length > 0) {
      actualRenderer = (rendererOrOpts as THREE.WebGLRenderer) ?? null;
      actualOpts = opts;
    } else if (rendererOrOpts && typeof rendererOrOpts === 'object' && !(rendererOrOpts as any).domElement && !(rendererOrOpts as any).render) {
      actualOpts = rendererOrOpts as QualityScalerOptions;
    } else {
      actualRenderer = (rendererOrOpts as THREE.WebGLRenderer) ?? null;
    }

    this.renderer = actualRenderer!;
    this.pipeline = actualPipeline;
    this.targetFps = actualOpts.targetFps ?? 55;
    this.downHysteresis = actualOpts.downHysteresis ?? 6;
    this.upHysteresis = actualOpts.upHysteresis ?? 8;
    this.cooldown = actualOpts.cooldown ?? 1.5;
    this.minScale = actualOpts.minScale ?? 0.55;
    this.lodSystem = actualOpts.lodSystem;
    this.animationLodManager = actualOpts.animationLodManager;
    this.onParticleDensityChange = actualOpts.onParticleDensityChange;
    this.filterLevels();
    if (actualOpts.enabled) {
      this.enable();
    }
  }

  setLODSystem(lod: LODSystem): void {
    this.lodSystem = lod;
    if (this.currentStep?.lodBias !== undefined) this.lodSystem.setDistanceBias(this.currentStep.lodBias);
  }

  setAnimationLodManager(anim: AnimationLodManager): void {
    this.animationLodManager = anim;
    if (this.currentStep?.animationLodBias !== undefined) this.animationLodManager.setAnimationLodBias(this.currentStep.animationLodBias);
  }

  setParticleDensityCallback(cb: (density: number) => void): void {
    this.onParticleDensityChange = cb;
    if (this.currentStep?.particleDensity !== undefined) this.onParticleDensityChange(this.currentStep.particleDensity);
  }

  private filterLevels(): void {
    this.levels = this.levels.filter((l) => l.scale >= this.minScale - 1e-6);
    if (this.levels.length === 0) {
      this.levels.push({ scale: this.minScale, disablePasses: [], shadows: true, lodBias: 1.0, animationLodBias: 1.0, particleDensity: 1.0 });
    }
  }

  applyPerformanceTarget(target: PerformanceTargetDescriptor): void {
    this.targetFps = target.targetFps;
    if (target.qualitySteps && target.qualitySteps.length > 0) {
      this.levels = target.qualitySteps.map(s => ({ ...s }));
      this.filterLevels();
      if (this.currentLevel >= this.levels.length) {
        this.currentLevel = Math.max(0, this.levels.length - 1);
      }
      if (this.running) {
        this.applyLevel(this.currentLevel, 'target_profile_applied');
      }
    }
  }

  setTarget(fps: number): void {
    this.targetFps = Math.max(15, fps);
  }

  getTargetFps(): number {
    return this.targetFps;
  }

  update(_dt: number, fpsOverride?: number): void {
    if (fpsOverride !== undefined) {
      if (!Number.isFinite(fpsOverride) || fpsOverride < 0) return;
      this.smoothedFps = fpsOverride;
      this.adjustQuality(performance.now());
    } else {
      this.sample();
    }
  }

  get level(): number { return this.currentLevel; }
  get maxLevel(): number { return this.levels.length - 1; }
  get currentStep(): Readonly<QualityStepDefinition> { return this.levels[this.currentLevel] ?? this.levels[0]; }
  get fps(): number { return this.smoothedFps; }
  get target(): number { return this.targetFps; }
  get isEnabled(): boolean { return this.running; }

  getHistory(): readonly QualityChangeEvent[] {
    return [...this.history];
  }

  getReasonHistory(): readonly QualityChangeEvent[] {
    return [...this.history];
  }

  enable(): void {
    if (this.running) return;
    this.running = true;
    this.lastSampleTime = performance.now();
    this.lastChangeTime = performance.now();
    this.frameCount = 0;
    if (this.pipeline) {
      this.originalPixelRatio = 1;
    } else if (this.renderer) {
      this.originalPixelRatio = typeof this.renderer.getPixelRatio === 'function' ? this.renderer.getPixelRatio() : 1;
      this.originalShadows = this.renderer.shadowMap?.enabled ?? false;
    }
    this.applyLevel(this.currentLevel, 'startup');
  }

  disable(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.applyLevel(0, 'shutdown');
  }

  private sample(): void {
    if (!this.running) return;
    this.frameCount++;
    const now = performance.now();
    const elapsed = (now - this.lastSampleTime) / 1000;
    if (elapsed >= 0.5) {
      const instantFps = this.frameCount / elapsed;
      this.smoothedFps = this.smoothedFps * 0.7 + instantFps * 0.3;
      this.frameCount = 0;
      this.lastSampleTime = now;
      this.adjustQuality(now);
    }
  }

  private adjustQuality(now: number): void {
    if (now - this.lastChangeTime < this.cooldown * 1000) return;
    const underBudget = this.smoothedFps < this.targetFps - this.downHysteresis;
    const overBudget = this.smoothedFps > this.targetFps + this.upHysteresis;

    if (underBudget && this.currentLevel < this.levels.length - 1) {
      const next = this.currentLevel + 1;
      this.applyLevel(next, `fps_drop_${this.smoothedFps.toFixed(1)}_below_${this.targetFps}`);
      this.lastChangeTime = now;
    } else if (overBudget && this.currentLevel > 0) {
      const next = this.currentLevel - 1;
      this.applyLevel(next, `fps_recovery_${this.smoothedFps.toFixed(1)}_above_${this.targetFps}`);
      this.lastChangeTime = now;
    }
  }

  private applyLevel(index: number, reason: string): void {
    const level = this.levels[index];
    if (!level) return;
    const fromLevel = this.currentLevel;
    this.currentLevel = index;

    const changes: string[] = [];

    // 1. Render resolution.
    if (this.pipeline) {
      this.pipeline.setDynamicResolutionScale(level.scale);
      changes.push(`internal scale -> ${level.scale.toFixed(2)}x`);
    } else if (this.renderer && typeof this.renderer.setPixelRatio === 'function') {
      this.renderer.setPixelRatio(this.originalPixelRatio * level.scale);
      changes.push(`pixel ratio -> ${(this.originalPixelRatio * level.scale).toFixed(2)}`);
    }

    // 2. Expensive post passes.
    if (this.pipeline) {
      const pipeAny = this.pipeline as unknown as Record<string, { enabled?: boolean } | undefined>;
      const allTracked = new Set<string>(this.levels.flatMap((l) => l.disablePasses ?? []));
      for (const name of allTracked) {
        const pass = pipeAny[name];
        if (!pass) continue;
        if (!this.originalPassEnabled.has(name)) this.originalPassEnabled.set(name, pass.enabled ?? true);
        const shouldDisable = (level.disablePasses ?? []).includes(name);
        const nextState = shouldDisable ? false : (this.originalPassEnabled.get(name) ?? true);
        if (pass.enabled !== nextState) {
          pass.enabled = nextState;
          changes.push(`${name} -> ${nextState ? 'enabled' : 'disabled'}`);
        }
      }
    }

    // 3. Shadows.
    if (this.renderer?.shadowMap) {
      const shadows = this.originalShadows && level.shadows;
      if (this.renderer.shadowMap.enabled !== shadows) {
        this.renderer.shadowMap.enabled = shadows;
        this.renderer.shadowMap.needsUpdate = true;
        changes.push(`shadows -> ${shadows ? 'enabled' : 'disabled'}`);
      }
    }

    // 4. Geometry LOD bias mutation
    if (this.lodSystem && level.lodBias !== undefined) {
      this.lodSystem.setDistanceBias(level.lodBias);
      if (level.lodBias !== 1.0) changes.push(`lodBias -> ${level.lodBias.toFixed(1)}x`);
    }

    // 5. Animation LOD bias mutation
    if (this.animationLodManager && level.animationLodBias !== undefined) {
      this.animationLodManager.setAnimationLodBias(level.animationLodBias);
      if (level.animationLodBias !== 1.0) changes.push(`animationLodBias -> ${level.animationLodBias.toFixed(1)}x`);
    }

    // 6. Particle density callback
    if (this.onParticleDensityChange && level.particleDensity !== undefined) {
      this.onParticleDensityChange(level.particleDensity);
      if (level.particleDensity !== 1.0) changes.push(`particleDensity -> ${Math.round(level.particleDensity * 100)}%`);
    }

    const preserved = [
      'Anime toon shading & Face SDF',
      'Dark character silhouette outlines',
      'Rim light & graphic hair highlights',
      'MIX anime color transform',
    ];

    if (fromLevel !== index || reason === 'target_profile_applied') {
      const event: QualityChangeEvent = {
        timestamp: Date.now(),
        fromLevel,
        toLevel: index,
        fps: Math.round(this.smoothedFps * 10) / 10,
        targetFps: this.targetFps,
        reason,
        changes,
        preserved,
        preservedFeatures: preserved,
      };
      this.history.push(event);
      if (this.history.length > this.maxHistory) this.history.shift();
    }
  }

  setQualitySteps(steps: QualityStepDefinition[]): void {
    this.levels = steps.map(s => ({ ...s, disablePasses: [...(s.disablePasses ?? [])] }));
    this.filterLevels();
    this.currentLevel = 0;
    if (this.running) {
      this.applyLevel(0, 'quality_steps_changed');
    }
  }

  setLevel(index: number, reason = 'manual_override'): void {
    this.applyLevel(index, reason);
  }

  describe(): string {
    const lines = [
      `QualityScaler Adaptive Scaling: ${this.running ? 'RUNNING (Active)' : 'STOPPED (Disabled)'}`,
      `- Current Level: ${this.currentLevel} / ${this.levels.length - 1}`,
      `- Smoothed FPS: ${this.smoothedFps.toFixed(1)} (Target: ${this.targetFps} FPS)`,
      `- Current Scale Multiplier: ${this.currentStep.scale.toFixed(2)}x`,
      `- Disabled Passes: ${this.currentStep.disablePasses.length > 0 ? this.currentStep.disablePasses.join(', ') : 'none'}`,
      `- Shadows: ${this.currentStep.shadows ? 'ENABLED' : 'DISABLED'}`,
      `- Protected Core Features: Anime toon shading & Face SDF, Silhouette Outlines, Rim light & graphic hair highlights`,
    ];

    if (this.history.length > 0) {
      const last = this.history[this.history.length - 1];
      lines.push(`- Last Transition: Level ${last.fromLevel} -> ${last.toLevel} (${last.reason}) at ${last.fps} FPS`);
    }

    return lines.join('\n');
  }
}
