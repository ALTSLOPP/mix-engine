/**
 * VisualStyleRegistry.ts — Coordinated visual style presets and color transforms for MIX Engine.
 *
 * Defines the artistic rendering identity (mix_anime presets, realistic, custom) independently
 * from performance targets or asset optimization policies.
 */

export type VisualStyleId =
  | 'mix_anime_neutral'
  | 'mix_anime_shonen'
  | 'mix_anime_warm'
  | 'mix_anime_cool'
  | 'mix_anime_dark'
  | 'mix_anime_neon'
  | 'realistic'
  | 'custom';

export type AnimeColorTransformMode = 'mix_anime' | 'aces' | 'neutral';

export interface VisualStyleDescriptor {
  id: VisualStyleId;
  name: string;
  description: string;
  colorTransform: AnimeColorTransformMode;
  /** Primary character shadow tint (hex 0xRRGGBB or string #RRGGBB). */
  shadowTint: string;
  /** Ambient fill tint added to characters. */
  ambientFill: string;
  /** Character rim light tint. */
  rimColor: string;
  rimIntensity: number;
  rimPower: number;
  /** Graphic hair highlight strength and default tint. */
  hairHighlightColor: string;
  hairHighlightStrength: number;
  /** Outline style preferences. */
  outlineColor: string;
  outlineThickness: number;
  outlineDistanceFade: boolean;
  /** Bloom tuning. */
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  /** Color grading adjustments. */
  saturation: number;
  contrast: number;
  brightness: number;
}

export const DEFAULT_VISUAL_STYLES: Record<VisualStyleId, VisualStyleDescriptor> = {
  mix_anime_neutral: {
    id: 'mix_anime_neutral',
    name: 'MIX Anime Neutral',
    description: 'Clean anime look with balanced purple/blue shadow tint and crisp readable facial shading.',
    colorTransform: 'mix_anime',
    shadowTint: '#554477',
    ambientFill: '#222030',
    rimColor: '#e0d8ff',
    rimIntensity: 0.45,
    rimPower: 3.0,
    hairHighlightColor: '#ffffff',
    hairHighlightStrength: 0.6,
    outlineColor: '#1a1424',
    outlineThickness: 1.2,
    outlineDistanceFade: true,
    bloomThreshold: 0.75,
    bloomStrength: 0.4,
    bloomRadius: 0.5,
    saturation: 1.12,
    contrast: 1.05,
    brightness: 1.0,
  },
  mix_anime_shonen: {
    id: 'mix_anime_shonen',
    name: 'MIX Anime Shonen',
    description: 'High-energy anime aesthetic with punchy saturation, vivid rim lights, and bold outlines.',
    colorTransform: 'mix_anime',
    shadowTint: '#4a3266',
    ambientFill: '#281c3c',
    rimColor: '#ffeaad',
    rimIntensity: 0.65,
    rimPower: 2.5,
    hairHighlightColor: '#fff5d6',
    hairHighlightStrength: 0.8,
    outlineColor: '#120c1a',
    outlineThickness: 1.4,
    outlineDistanceFade: true,
    bloomThreshold: 0.65,
    bloomStrength: 0.55,
    bloomRadius: 0.6,
    saturation: 1.25,
    contrast: 1.12,
    brightness: 1.02,
  },
  mix_anime_warm: {
    id: 'mix_anime_warm',
    name: 'MIX Anime Warm',
    description: 'Golden-hour and nostalgic anime atmosphere with amber fills and warm violet shadows.',
    colorTransform: 'mix_anime',
    shadowTint: '#603550',
    ambientFill: '#38222c',
    rimColor: '#ffe0b2',
    rimIntensity: 0.5,
    rimPower: 2.8,
    hairHighlightColor: '#fff8e1',
    hairHighlightStrength: 0.65,
    outlineColor: '#201018',
    outlineThickness: 1.2,
    outlineDistanceFade: true,
    bloomThreshold: 0.7,
    bloomStrength: 0.45,
    bloomRadius: 0.55,
    saturation: 1.15,
    contrast: 1.06,
    brightness: 1.02,
  },
  mix_anime_cool: {
    id: 'mix_anime_cool',
    name: 'MIX Anime Cool',
    description: 'Moody, twilight anime tone with deep navy/cyan shadows and crystal rim highlights.',
    colorTransform: 'mix_anime',
    shadowTint: '#304268',
    ambientFill: '#142034',
    rimColor: '#b3e5fc',
    rimIntensity: 0.5,
    rimPower: 3.2,
    hairHighlightColor: '#e1f5fe',
    hairHighlightStrength: 0.65,
    outlineColor: '#0a1420',
    outlineThickness: 1.2,
    outlineDistanceFade: true,
    bloomThreshold: 0.78,
    bloomStrength: 0.38,
    bloomRadius: 0.5,
    saturation: 1.08,
    contrast: 1.08,
    brightness: 0.98,
  },
  mix_anime_dark: {
    id: 'mix_anime_dark',
    name: 'MIX Anime Dark',
    description: 'Stylized dark anime / gothic fantasy with deep indigo shadows and stark character rims.',
    colorTransform: 'mix_anime',
    shadowTint: '#2a1a38',
    ambientFill: '#120a1c',
    rimColor: '#d1c4e9',
    rimIntensity: 0.6,
    rimPower: 3.5,
    hairHighlightColor: '#ede7f6',
    hairHighlightStrength: 0.55,
    outlineColor: '#08040d',
    outlineThickness: 1.3,
    outlineDistanceFade: true,
    bloomThreshold: 0.82,
    bloomStrength: 0.5,
    bloomRadius: 0.65,
    saturation: 0.95,
    contrast: 1.18,
    brightness: 0.92,
  },
  mix_anime_neon: {
    id: 'mix_anime_neon',
    name: 'MIX Anime Neon',
    description: 'Cyberpunk anime aesthetic with hyper-saturated accents, vivid magenta/cyan rims, and expressive bloom.',
    colorTransform: 'mix_anime',
    shadowTint: '#381648',
    ambientFill: '#1c0c28',
    rimColor: '#00e5ff',
    rimIntensity: 0.75,
    rimPower: 2.2,
    hairHighlightColor: '#ff4081',
    hairHighlightStrength: 0.85,
    outlineColor: '#10051a',
    outlineThickness: 1.4,
    outlineDistanceFade: false,
    bloomThreshold: 0.55,
    bloomStrength: 0.7,
    bloomRadius: 0.65,
    saturation: 1.35,
    contrast: 1.15,
    brightness: 1.05,
  },
  realistic: {
    id: 'realistic',
    name: 'Realistic PBR',
    description: 'Physically based rendering with ACES tone mapping, neutral lighting response, and no stylized cel bands.',
    colorTransform: 'aces',
    shadowTint: '#000000',
    ambientFill: '#000000',
    rimColor: '#ffffff',
    rimIntensity: 0.0,
    rimPower: 3.0,
    hairHighlightColor: '#ffffff',
    hairHighlightStrength: 0.0,
    outlineColor: '#000000',
    outlineThickness: 0.0,
    outlineDistanceFade: true,
    bloomThreshold: 0.9,
    bloomStrength: 0.35,
    bloomRadius: 0.5,
    saturation: 1.0,
    contrast: 1.0,
    brightness: 1.0,
  },
  custom: {
    id: 'custom',
    name: 'Custom Visual Style',
    description: 'User-configured custom visual style.',
    colorTransform: 'mix_anime',
    shadowTint: '#554477',
    ambientFill: '#222030',
    rimColor: '#ffffff',
    rimIntensity: 0.4,
    rimPower: 3.0,
    hairHighlightColor: '#ffffff',
    hairHighlightStrength: 0.5,
    outlineColor: '#1a1424',
    outlineThickness: 1.0,
    outlineDistanceFade: true,
    bloomThreshold: 0.75,
    bloomStrength: 0.4,
    bloomRadius: 0.5,
    saturation: 1.0,
    contrast: 1.0,
    brightness: 1.0,
  },
};

export class VisualStyleRegistry {
  private static readonly customStyles = new Map<string, VisualStyleDescriptor>();

  static get(id: VisualStyleId | string): VisualStyleDescriptor {
    if (this.customStyles.has(id)) {
      return { ...this.customStyles.get(id)! };
    }
    if (id in DEFAULT_VISUAL_STYLES) {
      return { ...DEFAULT_VISUAL_STYLES[id as VisualStyleId] };
    }
    return { ...DEFAULT_VISUAL_STYLES.mix_anime_neutral };
  }

  static list(): VisualStyleDescriptor[] {
    const builtins = Object.values(DEFAULT_VISUAL_STYLES).map(s => ({ ...s }));
    const customs = Array.from(this.customStyles.values()).map(s => ({ ...s }));
    return [...builtins, ...customs];
  }

  static register(style: VisualStyleDescriptor): void {
    this.validate(style);
    this.customStyles.set(style.id, { ...style });
  }

  static validate(style: Partial<VisualStyleDescriptor>): boolean {
    if (!style.id || typeof style.id !== 'string') throw new Error('VisualStyleDescriptor must have a string id.');
    if (style.saturation !== undefined && (style.saturation < 0 || style.saturation > 3)) {
      throw new Error('VisualStyleDescriptor saturation must be between 0 and 3.');
    }
    if (style.contrast !== undefined && (style.contrast < 0 || style.contrast > 3)) {
      throw new Error('VisualStyleDescriptor contrast must be between 0 and 3.');
    }
    return true;
  }

  static describe(id: VisualStyleId | string): string {
    const style = this.get(id);
    return [
      `Visual Style: ${style.name} (${style.id})`,
      `Description: ${style.description}`,
      `Color transform: ${style.colorTransform}`,
      `Shadow tint: ${style.shadowTint}`,
      `Ambient fill: ${style.ambientFill}`,
      `Rim lighting: intensity ${style.rimIntensity.toFixed(2)}, color ${style.rimColor}, power ${style.rimPower.toFixed(1)}`,
      `Hair highlight: strength ${style.hairHighlightStrength.toFixed(2)}, color ${style.hairHighlightColor}`,
      `Outline: thickness ${style.outlineThickness.toFixed(1)}px, color ${style.outlineColor}, distance fade ${style.outlineDistanceFade ? 'enabled' : 'disabled'}`,
      `Bloom: threshold ${style.bloomThreshold.toFixed(2)}, strength ${style.bloomStrength.toFixed(2)}, radius ${style.bloomRadius.toFixed(2)}`,
      `Grading: saturation ${style.saturation.toFixed(2)}, contrast ${style.contrast.toFixed(2)}, brightness ${style.brightness.toFixed(2)}`,
    ].join('\n');
  }
}
