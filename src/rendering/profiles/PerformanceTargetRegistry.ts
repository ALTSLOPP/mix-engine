/**
 * PerformanceTargetRegistry.ts — Hardware performance target profiles for MIX Engine.
 *
 * Coordinates internal/output resolution, FSR upscaling, shadow map bounds, LOD biases,
 * and post-processing quality tiers without restricting creator asset freedom.
 */

export type BuiltInPerformanceTargetId =
  | 'ps3_plus_500'
  | 'balanced'
  | 'high_end'
  | 'unbounded'
  | 'custom';

export type PerformanceTargetId = BuiltInPerformanceTargetId | (string & {});

export interface QualityStepDefinition {
  scale: number;
  disablePasses: string[];
  shadows: boolean;
  lodBias: number;
  animationLodBias: number;
  particleDensity: number;
}

export interface PerformanceTargetDescriptor {
  id: PerformanceTargetId;
  name: string;
  description: string;
  /** Target frame rate for dynamic scaler and frame pacing. */
  targetFps: number;
  /** Recommended internal rendering height (capped physical render buffer). 0 = native / automatic. */
  internalHeight: number;
  /** Recommended output presentation height. 0 = native / viewport match. */
  outputHeight: number;
  /** Internal render scale multiplier when internalHeight is 0 (automatic). */
  renderScale: number;
  /** Spatial upscaler (FSR 1 EASU) active. */
  fsrEnabled: boolean;
  /** Default FSR RCAS sharpening factor. */
  fsrSharpness: number;
  /** Primary shadow map active. */
  shadowsEnabled: boolean;
  shadowMapSize: number;
  csmMaxCascades: number;
  /** Post processing defaults. */
  bloomEnabled: boolean;
  aoEnabled: boolean;
  ssrEnabled: boolean;
  dofEnabled: boolean;
  volumetricFogEnabled: boolean;
  contactShadowsEnabled: boolean;
  /** Geometric and animation LOD aggression (1.0 = baseline, >1.0 = switch to lower LOD closer). */
  lodDistanceBias: number;
  animationLodBias: number;
  particleDensity: number;
  /** Ordered dynamic quality step degradation chain. */
  qualitySteps: QualityStepDefinition[];
}

export const DEFAULT_PERFORMANCE_TARGETS: Record<PerformanceTargetId, PerformanceTargetDescriptor> = {
  ps3_plus_500: {
    id: 'ps3_plus_500',
    name: 'PS3+ / 500-GFLOPS Class',
    description: 'Aggressively optimized profile designed for modest hardware. 540p internal upscaled to 900p via FSR 1, 30 FPS target, aggressive LOD.',
    targetFps: 30,
    internalHeight: 540,
    outputHeight: 900,
    renderScale: 0.6,
    fsrEnabled: true,
    fsrSharpness: 0.35,
    shadowsEnabled: false,
    shadowMapSize: 1024,
    csmMaxCascades: 2,
    bloomEnabled: false,
    aoEnabled: false,
    ssrEnabled: false,
    dofEnabled: false,
    volumetricFogEnabled: false,
    contactShadowsEnabled: false,
    lodDistanceBias: 1.5,
    animationLodBias: 1.5,
    particleDensity: 0.5,
    qualitySteps: [
      { scale: 1.0, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass', 'contactShadowsPass'], shadows: false, lodBias: 1.5, animationLodBias: 1.5, particleDensity: 0.5 },
      { scale: 0.85, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass', 'contactShadowsPass'], shadows: false, lodBias: 1.8, animationLodBias: 1.8, particleDensity: 0.4 },
      { scale: 0.72, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass', 'contactShadowsPass', 'bloomPass'], shadows: false, lodBias: 2.0, animationLodBias: 2.0, particleDensity: 0.3 },
      { scale: 0.60, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass', 'contactShadowsPass', 'bloomPass', 'godRaysPass'], shadows: false, lodBias: 2.2, animationLodBias: 2.2, particleDensity: 0.2 },
    ],
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced (720p -> 1080p)',
    description: 'Standard modern profile. 720p internal upscaled to 1080p via FSR 1, 60 FPS target, shadows and bloom enabled.',
    targetFps: 60,
    internalHeight: 720,
    outputHeight: 1080,
    renderScale: 0.667,
    fsrEnabled: true,
    fsrSharpness: 0.35,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    csmMaxCascades: 3,
    bloomEnabled: true,
    aoEnabled: false,
    ssrEnabled: false,
    dofEnabled: false,
    volumetricFogEnabled: false,
    contactShadowsEnabled: false,
    lodDistanceBias: 1.0,
    animationLodBias: 1.0,
    particleDensity: 0.8,
    qualitySteps: [
      { scale: 1.0, disablePasses: [], shadows: true, lodBias: 1.0, animationLodBias: 1.0, particleDensity: 0.8 },
      { scale: 0.85, disablePasses: ['ssrPass', 'dofPass'], shadows: true, lodBias: 1.2, animationLodBias: 1.2, particleDensity: 0.7 },
      { scale: 0.72, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass'], shadows: true, lodBias: 1.4, animationLodBias: 1.4, particleDensity: 0.6 },
      { scale: 0.60, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass', 'bloomPass'], shadows: false, lodBias: 1.8, animationLodBias: 1.8, particleDensity: 0.4 },
    ],
  },
  high_end: {
    id: 'high_end',
    name: 'High End (Native 1080p+)',
    description: 'Full fidelity profile. Native resolution, 60 FPS target, dynamic shadows, GTAO, bloom, and reflections enabled.',
    targetFps: 60,
    internalHeight: 0,
    outputHeight: 0,
    renderScale: 1.0,
    fsrEnabled: false,
    fsrSharpness: 0.0,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    csmMaxCascades: 4,
    bloomEnabled: true,
    aoEnabled: true,
    ssrEnabled: true,
    dofEnabled: true,
    volumetricFogEnabled: true,
    contactShadowsEnabled: true,
    lodDistanceBias: 0.8,
    animationLodBias: 0.8,
    particleDensity: 1.0,
    qualitySteps: [
      { scale: 1.0, disablePasses: [], shadows: true, lodBias: 0.8, animationLodBias: 0.8, particleDensity: 1.0 },
      { scale: 0.88, disablePasses: ['ssrPass'], shadows: true, lodBias: 1.0, animationLodBias: 1.0, particleDensity: 0.9 },
      { scale: 0.75, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass'], shadows: true, lodBias: 1.2, animationLodBias: 1.2, particleDensity: 0.8 },
      { scale: 0.65, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass'], shadows: true, lodBias: 1.5, animationLodBias: 1.5, particleDensity: 0.6 },
      { scale: 0.55, disablePasses: ['ssrPass', 'dofPass', 'volumetricFogPass', 'aoPass', 'bloomPass'], shadows: false, lodBias: 2.0, animationLodBias: 2.0, particleDensity: 0.4 },
    ],
  },
  unbounded: {
    id: 'unbounded',
    name: 'Unbounded / Creator Master',
    description: 'Uncapped developer profile. Native render and presentation resolution, no forced simplification, full creator fidelity.',
    targetFps: 60,
    internalHeight: 0,
    outputHeight: 0,
    renderScale: 1.0,
    fsrEnabled: false,
    fsrSharpness: 0.0,
    shadowsEnabled: true,
    shadowMapSize: 4096,
    csmMaxCascades: 4,
    bloomEnabled: true,
    aoEnabled: true,
    ssrEnabled: true,
    dofEnabled: true,
    volumetricFogEnabled: true,
    contactShadowsEnabled: true,
    lodDistanceBias: 0.5,
    animationLodBias: 0.5,
    particleDensity: 1.0,
    qualitySteps: [
      { scale: 1.0, disablePasses: [], shadows: true, lodBias: 0.5, animationLodBias: 0.5, particleDensity: 1.0 },
    ],
  },
  custom: {
    id: 'custom',
    name: 'Custom Target',
    description: 'User-configured custom performance target.',
    targetFps: 60,
    internalHeight: 720,
    outputHeight: 1080,
    renderScale: 1.0,
    fsrEnabled: true,
    fsrSharpness: 0.35,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    csmMaxCascades: 3,
    bloomEnabled: true,
    aoEnabled: false,
    ssrEnabled: false,
    dofEnabled: false,
    volumetricFogEnabled: false,
    contactShadowsEnabled: false,
    lodDistanceBias: 1.0,
    animationLodBias: 1.0,
    particleDensity: 1.0,
    qualitySteps: [
      { scale: 1.0, disablePasses: [], shadows: true, lodBias: 1.0, animationLodBias: 1.0, particleDensity: 1.0 },
      { scale: 0.85, disablePasses: ['ssrPass'], shadows: true, lodBias: 1.2, animationLodBias: 1.2, particleDensity: 0.8 },
      { scale: 0.70, disablePasses: ['ssrPass', 'aoPass'], shadows: true, lodBias: 1.5, animationLodBias: 1.5, particleDensity: 0.6 },
    ],
  },
};

export class PerformanceTargetRegistry {
  private static readonly customTargets = new Map<string, PerformanceTargetDescriptor>();

  private static clone(target: PerformanceTargetDescriptor): PerformanceTargetDescriptor {
    return {
      ...target,
      qualitySteps: target.qualitySteps.map(step => ({ ...step, disablePasses: [...step.disablePasses] })),
    };
  }

  static has(id: string): boolean {
    return this.customTargets.has(id) || Object.prototype.hasOwnProperty.call(DEFAULT_PERFORMANCE_TARGETS, id);
  }

  static get(id: PerformanceTargetId | string): PerformanceTargetDescriptor {
    if (this.customTargets.has(id)) {
      return this.clone(this.customTargets.get(id)!);
    }
    if (Object.prototype.hasOwnProperty.call(DEFAULT_PERFORMANCE_TARGETS, id)) {
      return this.clone(DEFAULT_PERFORMANCE_TARGETS[id as BuiltInPerformanceTargetId]);
    }
    return this.clone(DEFAULT_PERFORMANCE_TARGETS.ps3_plus_500);
  }

  static require(id: PerformanceTargetId | string): PerformanceTargetDescriptor {
    if (!this.has(id)) {
      const suggestions = this.getSuggestions(id);
      const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
      throw new Error(`Unknown performance target '${id}'.${hint}`);
    }
    return this.get(id);
  }

  static getSuggestions(id: string, limit = 3): string[] {
    const query = id.toLowerCase().replace(/[^a-z0-9]/g, '');
    const all = this.list().map(t => t.id);
    const scored = all.map(candidate => {
      const candClean = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
      let score = 0;
      if (candidate.startsWith(id) || id.startsWith(candidate)) score += 10;
      if (candClean.includes(query) || query.includes(candClean)) score += 5;
      for (const char of query) {
        if (candClean.includes(char)) score += 1;
      }
      return { candidate, score };
    });
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.candidate);
  }

  static list(): PerformanceTargetDescriptor[] {
    const builtins = Object.values(DEFAULT_PERFORMANCE_TARGETS).map(t => this.clone(t));
    const customs = Array.from(this.customTargets.values()).map(t => this.clone(t));
    return [...builtins, ...customs];
  }

  static register(target: PerformanceTargetDescriptor): void {
    this.validate(target);
    this.customTargets.set(target.id, this.clone(target));
  }

  static validate(target: Partial<PerformanceTargetDescriptor>): boolean {
    if (!target.id || typeof target.id !== 'string') throw new Error('PerformanceTargetDescriptor must have a string id.');
    if (target.targetFps !== undefined && (target.targetFps < 15 || target.targetFps > 240)) {
      throw new Error('PerformanceTarget targetFps must be between 15 and 240.');
    }
    if (target.renderScale !== undefined && (target.renderScale < 0.25 || target.renderScale > 2.0)) {
      throw new Error('PerformanceTarget renderScale must be between 0.25 and 2.0.');
    }
    return true;
  }

  static describe(id: PerformanceTargetId | string): string {
    const target = this.require(id);
    const resText = target.internalHeight > 0 && target.outputHeight > 0
      ? `${target.internalHeight}p internal -> ${target.outputHeight}p output`
      : target.internalHeight > 0
      ? `${target.internalHeight}p internal -> native output`
      : 'native internal -> native output';

    return [
      `Performance Target: ${target.name} (${target.id})`,
      `Description: ${target.description}`,
      `Target FPS: ${target.targetFps}`,
      `Resolution mode: ${resText}`,
      `FSR 1: ${target.fsrEnabled ? `enabled (RCAS sharpness ${target.fsrSharpness.toFixed(2)})` : 'disabled'}`,
      `Shadows: ${target.shadowsEnabled ? `enabled (${target.shadowMapSize}px, ${target.csmMaxCascades} cascades)` : 'disabled'}`,
      `Effects: Bloom=${target.bloomEnabled ? 'ON' : 'OFF'}, AO=${target.aoEnabled ? 'ON' : 'OFF'}, SSR=${target.ssrEnabled ? 'ON' : 'OFF'}, VolFog=${target.volumetricFogEnabled ? 'ON' : 'OFF'}`,
      `LOD aggression: geometry bias ${target.lodDistanceBias.toFixed(2)}x, animation bias ${target.animationLodBias.toFixed(2)}x, particle density ${Math.round(target.particleDensity * 100)}%`,
      `Dynamic quality steps: ${target.qualitySteps.length} tiers`,
    ].join('\n');
  }
}
