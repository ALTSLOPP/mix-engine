/**
 * AnimeLightingContext.ts — Centralized artistic character lighting context.
 *
 * Distributes world directional lighting, artistic fills, shadow tinting, and rim parameters
 * to all anime character materials without allocating per-character lights.
 */

import * as THREE from 'three';
import type { VisualStyleDescriptor } from '../profiles/VisualStyleRegistry';

export class AnimeLightingContext {
  private static instance: AnimeLightingContext | null = null;
  private static readonly rendererContexts = new WeakMap<THREE.WebGLRenderer, AnimeLightingContext>();

  /** Each viewport owns its context, even when multiple viewports share a scene. */
  static bindRenderer(renderer: THREE.WebGLRenderer, context: AnimeLightingContext): void {
    this.rendererContexts.set(renderer, context);
  }

  static forRenderer(renderer: THREE.WebGLRenderer): AnimeLightingContext | undefined {
    return this.rendererContexts.get(renderer);
  }

  readonly sunDirection = new THREE.Vector3(0.5, 1.0, 0.4).normalize();
  readonly sunColor = new THREE.Color(0xfff4e6);
  sunIntensity = 1.8;

  readonly ambientColor = new THREE.Color(0x222030);
  ambientIntensity = 0.4;

  readonly shadowTint = new THREE.Color(0x554477);
  shadowStrength = 0.75;

  readonly rimColor = new THREE.Color(0xe0d8ff);
  rimIntensity = 0.45;
  rimPower = 3.0;

  timeOfDay = 12.0;
  revision = 0;

  /** Legacy default for standalone materials without a viewport. */
  static get(): AnimeLightingContext {
    if (!this.instance) {
      this.instance = new AnimeLightingContext();
    }
    return this.instance;
  }

  static reset(): void {
    this.instance = new AnimeLightingContext();
  }

  setSun(direction: THREE.Vector3, color?: THREE.ColorRepresentation, intensity?: number): void {
    this.sunDirection.copy(direction).normalize();
    if (color !== undefined) this.sunColor.set(color);
    if (intensity !== undefined) this.sunIntensity = intensity;
    this.revision++;
  }

  setAmbient(color: THREE.ColorRepresentation, intensity?: number): void {
    this.ambientColor.set(color);
    if (intensity !== undefined) this.ambientIntensity = intensity;
    this.revision++;
  }

  setShadowTint(color: THREE.ColorRepresentation, strength?: number): void {
    this.shadowTint.set(color);
    if (strength !== undefined) this.shadowStrength = THREE.MathUtils.clamp(strength, 0, 1);
    this.revision++;
  }

  setRim(color: THREE.ColorRepresentation, intensity?: number, power?: number): void {
    this.rimColor.set(color);
    if (intensity !== undefined) this.rimIntensity = THREE.MathUtils.clamp(intensity, 0, 2);
    if (power !== undefined) this.rimPower = Math.max(0.5, power);
    this.revision++;
  }

  applyStyle(style: VisualStyleDescriptor): void {
    this.shadowTint.set(style.shadowTint);
    this.ambientColor.set(style.ambientFill);
    this.rimColor.set(style.rimColor);
    this.rimIntensity = style.rimIntensity;
    this.rimPower = style.rimPower;
    this.revision++;
  }

  describe(): string {
    return [
      `Anime Lighting Context:`,
      `- Sun Direction: (${this.sunDirection.x.toFixed(2)}, ${this.sunDirection.y.toFixed(2)}, ${this.sunDirection.z.toFixed(2)})`,
      `- Sun Color: #${this.sunColor.getHexString()} (Intensity: ${this.sunIntensity.toFixed(2)})`,
      `- Shadow Tint: #${this.shadowTint.getHexString()} (Strength: ${this.shadowStrength.toFixed(2)})`,
      `- Ambient Fill: #${this.ambientColor.getHexString()} (Intensity: ${this.ambientIntensity.toFixed(2)})`,
      `- Rim Light: #${this.rimColor.getHexString()} (Intensity: ${this.rimIntensity.toFixed(2)}, Power: ${this.rimPower.toFixed(1)})`,
    ].join('\n');
  }
}
