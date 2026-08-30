import * as THREE from 'three';
import { StreamingAudioBank } from './StreamingAudioBank';

export interface StemConfig {
  name: string;
  src: string;
  minIntensity?: number; // 0 to 1: intensity threshold at which this stem becomes audible
  maxIntensity?: number;
  baseVolume?: number;
}

export interface InteractiveThemeConfig {
  id: string;
  bpm?: number;
  /** Apply intensity-layer changes immediately, on the next beat, or next bar. */
  quantize?: 'none' | 'beat' | 'bar';
  beatsPerBar?: number;
  stems: StemConfig[];
}

/**
 * InteractiveMusicDirector.ts — Vertical stem layering and dynamic intensity adaptation.
 * Controls multi-track synchronized background music layers that respond to gameplay intensity.
 */
export class InteractiveMusicDirector {
  private readonly streamBank: StreamingAudioBank;
  private currentTheme: InteractiveThemeConfig | null = null;
  private intensity = 0.0; // 0 (calm exploration) to 1 (high-stakes combat)
  private readonly stemWeights = new Map<string, number>();
  private elapsed = 0;
  private pendingIntensity: number | null = null;
  private nextBoundary = 0;

  constructor(streamBank?: StreamingAudioBank) {
    this.streamBank = streamBank ?? new StreamingAudioBank();
  }

  /** Load and start an interactive music theme. */
  playTheme(theme: InteractiveThemeConfig): void {
    this.stopTheme();
    this.currentTheme = theme;
    this.elapsed = 0;
    this.pendingIntensity = null;
    this.nextBoundary = this.boundaryDuration(theme);

    for (const stem of theme.stems) {
      const stemId = `stem_${theme.id}_${stem.name}`;
      this.streamBank.play(stemId, stem.src, {
        volume: 0,
        loop: true,
      });
      this.stemWeights.set(stem.name, 1.0);
    }
    this.updateStemVolumes();
  }

  /** Set dynamic game intensity (0 to 1). Smoothly recalibrates all stem volumes. */
  setIntensity(level: number): void {
    const next = THREE.MathUtils.clamp(level, 0, 1);
    if (this.currentTheme?.bpm && (this.currentTheme.quantize ?? 'none') !== 'none') {
      this.pendingIntensity = next;
    } else {
      this.intensity = next;
      this.updateStemVolumes();
    }
  }

  getIntensity(): number {
    return this.intensity;
  }

  /** Override a specific stem's volume weight. */
  setStemWeight(stemName: string, weight: number): void {
    this.stemWeights.set(stemName, THREE.MathUtils.clamp(weight, 0, 1));
    this.updateStemVolumes();
  }

  /** Stop the active theme and silence all stems. */
  stopTheme(): void {
    if (!this.currentTheme) return;
    for (const stem of this.currentTheme.stems) {
      const stemId = `stem_${this.currentTheme.id}_${stem.name}`;
      this.streamBank.stop(stemId);
    }
    this.currentTheme = null;
    this.stemWeights.clear();
    this.pendingIntensity = null;
  }

  /** Tick from AudioManager: phase-lock stems and commit quantized transitions. */
  update(dt: number): void {
    if (!this.currentTheme || dt <= 0) return;
    this.elapsed += dt;
    const ids = this.currentTheme.stems.map((stem) => `stem_${this.currentTheme!.id}_${stem.name}`);
    this.streamBank.synchronize(ids);
    if (this.pendingIntensity === null || this.elapsed < this.nextBoundary) return;
    this.intensity = this.pendingIntensity;
    this.pendingIntensity = null;
    this.updateStemVolumes();
    const duration = this.boundaryDuration(this.currentTheme);
    this.nextBoundary = Math.floor(this.elapsed / duration + 1) * duration;
  }

  private boundaryDuration(theme: InteractiveThemeConfig): number {
    if (!theme.bpm || theme.bpm <= 0) return 0;
    const beat = 60 / theme.bpm;
    return theme.quantize === 'bar' ? beat * Math.max(1, theme.beatsPerBar ?? 4) : beat;
  }

  private updateStemVolumes(): void {
    if (!this.currentTheme) return;

    for (const stem of this.currentTheme.stems) {
      const stemId = `stem_${this.currentTheme.id}_${stem.name}`;
      const minI = stem.minIntensity ?? 0;
      const maxI = stem.maxIntensity ?? 1;
      const baseVol = stem.baseVolume ?? 1.0;
      const manualWeight = this.stemWeights.get(stem.name) ?? 1.0;

      let intensityFactor = 1.0;
      if (minI === 0 && maxI === 1) {
        // Base track plays continuously at full volume
        intensityFactor = 1.0;
      } else if (this.intensity < minI) {
        // Below activation threshold -> silent
        intensityFactor = 0;
      } else if (this.intensity >= maxI) {
        // At or above maximum threshold -> full volume
        intensityFactor = 1.0;
      } else {
        // Linear fade in between minIntensity and maxIntensity
        intensityFactor = (this.intensity - minI) / (maxI - minI);
      }

      const finalVolume = baseVol * intensityFactor * manualWeight;
      this.streamBank.setVolume(stemId, finalVolume);
    }
  }

  dispose(): void {
    this.stopTheme();
    this.streamBank.dispose();
  }
}
