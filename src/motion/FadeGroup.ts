import type { EasingType, FadeMode } from './types';

export function evaluateEasing(t: number, type: EasingType = 'linear'): number {
  const clampT = Math.max(0, Math.min(1, t));
  switch (type) {
    case 'linear':
      return clampT;
    case 'quadIn':
      return clampT * clampT;
    case 'quadOut':
      return clampT * (2 - clampT);
    case 'quadInOut':
      return clampT < 0.5 ? 2 * clampT * clampT : -1 + (4 - 2 * clampT) * clampT;
    case 'cubicIn':
      return clampT * clampT * clampT;
    case 'cubicOut':
      const f = clampT - 1;
      return f * f * f + 1;
    case 'cubicInOut':
      return clampT < 0.5 ? 4 * clampT * clampT * clampT : (clampT - 1) * (2 * clampT - 2) * (2 * clampT - 2) + 1;
    case 'sineIn':
      return 1 - Math.cos((clampT * Math.PI) / 2);
    case 'sineOut':
      return Math.sin((clampT * Math.PI) / 2);
    case 'sineInOut':
      return 0.5 * (1 - Math.cos(Math.PI * clampT));
    case 'smoothstep':
      return clampT * clampT * (3 - 2 * clampT);
    default:
      return clampT;
  }
}

export interface FadeConfig {
  targetWeight: number;
  duration: number;
  easing?: EasingType;
  mode?: FadeMode;
  onComplete?: () => void;
}

/**
 * FadeGroup — High performance, allocation-free weight fader for motion states and layers.
 */
export class FadeGroup {
  weight = 0;
  targetWeight = 0;
  startWeight = 0;
  duration = 0;
  elapsed = 0;
  easing: EasingType = 'linear';
  active = false;
  private onCompleteCallback: (() => void) | null = null;

  constructor(initialWeight = 0) {
    this.weight = initialWeight;
    this.targetWeight = initialWeight;
    this.startWeight = initialWeight;
  }

  fade(targetWeight: number, duration: number, easing: EasingType = 'linear', onComplete?: () => void): void {
    if (duration <= 1e-4) {
      this.weight = targetWeight;
      this.targetWeight = targetWeight;
      this.startWeight = targetWeight;
      this.active = false;
      this.duration = 0;
      this.elapsed = 0;
      if (onComplete) onComplete();
      return;
    }

    this.startWeight = this.weight;
    this.targetWeight = targetWeight;
    this.duration = duration;
    this.elapsed = 0;
    this.easing = easing;
    this.active = true;
    this.onCompleteCallback = onComplete ?? null;
  }

  fadeIn(duration: number, easing: EasingType = 'linear', onComplete?: () => void): void {
    this.fade(1.0, duration, easing, onComplete);
  }

  fadeOut(duration: number, easing: EasingType = 'linear', onComplete?: () => void): void {
    this.fade(0.0, duration, easing, onComplete);
  }

  stop(): void {
    this.active = false;
    this.targetWeight = this.weight;
    this.startWeight = this.weight;
    this.duration = 0;
    this.elapsed = 0;
    this.onCompleteCallback = null;
  }

  update(dt: number): boolean {
    if (!this.active) return false;

    this.elapsed += dt;
    const progress = this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 1;
    const factor = evaluateEasing(progress, this.easing);

    this.weight = this.startWeight + (this.targetWeight - this.startWeight) * factor;

    if (progress >= 1) {
      this.weight = this.targetWeight;
      this.active = false;
      const cb = this.onCompleteCallback;
      this.onCompleteCallback = null;
      if (cb) cb();
      return true; // Finished this frame
    }

    return false;
  }

  get progress(): number {
    if (!this.active || this.duration <= 0) return 1;
    return Math.min(1, this.elapsed / this.duration);
  }

  isFading(): boolean {
    return this.active;
  }
}
