import type { UpdateMode } from './types';

export class TweenClock {
  private normalTimeScale = 1.0;
  private unscaledTimeScale = 1.0;
  private fixedTimeScale = 1.0;
  private manualTimeScale = 1.0;
  private fixedAccumulator = 0;

  private pausedModes = new Set<UpdateMode>();

  setTimeScale(mode: UpdateMode, scale: number): void {
    const clamped = Math.max(0, scale);
    switch (mode) {
      case 'normal': this.normalTimeScale = clamped; break;
      case 'unscaled': this.unscaledTimeScale = clamped; break;
      case 'fixed': this.fixedTimeScale = clamped; break;
      case 'manual': this.manualTimeScale = clamped; break;
    }
  }

  getTimeScale(mode: UpdateMode): number {
    switch (mode) {
      case 'normal': return this.normalTimeScale;
      case 'unscaled': return this.unscaledTimeScale;
      case 'fixed': return this.fixedTimeScale;
      case 'manual': return this.manualTimeScale;
    }
  }

  pause(mode?: UpdateMode): void {
    if (mode) {
      this.pausedModes.add(mode);
    } else {
      this.pausedModes.add('normal');
      this.pausedModes.add('unscaled');
      this.pausedModes.add('fixed');
      this.pausedModes.add('manual');
    }
  }

  resume(mode?: UpdateMode): void {
    if (mode) {
      this.pausedModes.delete(mode);
    } else {
      this.pausedModes.clear();
    }
  }

  isPaused(mode: UpdateMode): boolean {
    return this.pausedModes.has(mode);
  }

  getDelta(mode: UpdateMode, rawDt: number, fixedDt = 1 / 60): number {
    if (this.pausedModes.has(mode)) return 0;

    switch (mode) {
      case 'normal':
        return rawDt * this.normalTimeScale;
      case 'unscaled':
        return rawDt * this.unscaledTimeScale;
      case 'fixed':
        this.fixedAccumulator += Math.max(0, rawDt);
        const steps = Math.floor((this.fixedAccumulator + 1e-12) / fixedDt);
        if (steps === 0) return 0;
        this.fixedAccumulator -= steps * fixedDt;
        return steps * fixedDt * this.fixedTimeScale;
      case 'manual':
        return 0; // manual clock advances only via explicit manual step
    }
  }
}
