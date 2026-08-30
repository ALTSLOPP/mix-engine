/**
 * ProjectRenderPolicy.ts — Project-level rendering and asset optimization configuration.
 *
 * Distinguishes project-level defaults from player runtime preferences:
 * - Project policy defines the authored style, default performance target, and asset cooking policy.
 * - Player preferences in GameSettingsSystem override runtime settings (e.g. higher resolution / native mode).
 */

import { VisualStyleRegistry, type VisualStyleId } from './VisualStyleRegistry';
import { PerformanceTargetRegistry, type PerformanceTargetId } from './PerformanceTargetRegistry';

export type AssetOptimizationPolicy = 'off' | 'suggest' | 'auto' | 'strict';

export interface ProjectRenderPolicy {
  version: 1;
  visualStyle: VisualStyleId | string;
  performanceTarget: PerformanceTargetId | string;
  optimizationPolicy: AssetOptimizationPolicy;
  /** Explicit FPS override if different from performanceTarget default. */
  targetFps?: number;
  /** Enable runtime adaptive QualityScaler. */
  adaptiveQuality: boolean;
}

export function createDefaultProjectRenderPolicy(): ProjectRenderPolicy {
  return {
    version: 1,
    visualStyle: 'mix_anime_neutral',
    performanceTarget: 'ps3_plus_500',
    optimizationPolicy: 'auto',
    adaptiveQuality: true,
  };
}

export function validateProjectRenderPolicy(policy: Partial<ProjectRenderPolicy>): boolean {
  if (!policy || typeof policy !== 'object') throw new Error('ProjectRenderPolicy must be an object.');
  if (policy.visualStyle !== undefined) {
    if (typeof policy.visualStyle !== 'string' || policy.visualStyle.trim() === '') {
      throw new Error('ProjectRenderPolicy visualStyle must be a non-empty string.');
    }
    if (!VisualStyleRegistry.has(policy.visualStyle)) {
      const suggestions = VisualStyleRegistry.getSuggestions(policy.visualStyle);
      const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
      throw new Error(`Invalid visualStyle '${policy.visualStyle}' in ProjectRenderPolicy.${hint}`);
    }
  }
  if (policy.performanceTarget !== undefined) {
    if (typeof policy.performanceTarget !== 'string' || policy.performanceTarget.trim() === '') {
      throw new Error('ProjectRenderPolicy performanceTarget must be a non-empty string.');
    }
    if (!PerformanceTargetRegistry.has(policy.performanceTarget)) {
      const suggestions = PerformanceTargetRegistry.getSuggestions(policy.performanceTarget);
      const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
      throw new Error(`Invalid performanceTarget '${policy.performanceTarget}' in ProjectRenderPolicy.${hint}`);
    }
  }
  if (policy.optimizationPolicy !== undefined) {
    const valid = ['off', 'suggest', 'auto', 'strict'];
    if (!valid.includes(policy.optimizationPolicy)) {
      throw new Error(`Invalid optimizationPolicy '${policy.optimizationPolicy}'. Must be one of: ${valid.join(', ')}`);
    }
  }
  if (policy.targetFps !== undefined && (policy.targetFps < 15 || policy.targetFps > 240)) {
    throw new Error('targetFps must be between 15 and 240.');
  }
  return true;
}

export function serializeProjectRenderPolicy(policy: ProjectRenderPolicy): string {
  validateProjectRenderPolicy(policy);
  return JSON.stringify(policy, null, 2);
}

export function deserializeProjectRenderPolicy(json: string): ProjectRenderPolicy {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.version !== 1) {
    return createDefaultProjectRenderPolicy();
  }
  validateProjectRenderPolicy(parsed);
  return {
    version: 1,
    visualStyle: parsed.visualStyle ?? 'mix_anime_neutral',
    performanceTarget: parsed.performanceTarget ?? 'ps3_plus_500',
    optimizationPolicy: parsed.optimizationPolicy ?? 'auto',
    targetFps: parsed.targetFps,
    adaptiveQuality: parsed.adaptiveQuality ?? true,
  };
}

export function describeProjectRenderPolicy(policy: ProjectRenderPolicy): string {
  const style = VisualStyleRegistry.require(policy.visualStyle);
  const target = PerformanceTargetRegistry.require(policy.performanceTarget);
  const fps = policy.targetFps ?? target.targetFps;

  return [
    `Project Render Policy (v${policy.version})`,
    `----------------------------------------`,
    `Visual Style: ${style.name} (${style.id})`,
    `Performance Target: ${target.name} (${target.id})`,
    `Target Framerate: ${fps} FPS`,
    `Asset Optimization Policy: ${policy.optimizationPolicy.toUpperCase()}`,
    `Adaptive Quality: ${policy.adaptiveQuality ? 'ENABLED' : 'DISABLED'}`,
  ].join('\n');
}
