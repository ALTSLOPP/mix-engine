import * as THREE from 'three';
import type { Viewport } from '../rendering/Viewport';

/**
 * VisualStyles.ts — one-command cinematic look presets.
 *
 * The engine's renderer is *driven* by an IDE agent; the worst possible workflow is an agent
 * emitting dozens of `set_post_fx` / `set_environment` / `set_weather` calls and fighting to
 * converge on a coherent look. These presets collapse that to a single command:
 *
 *     { "type": "set_visual_style", "style": "golden_hour" }
 *
 * Each style is a full recipe: sun elevation/azimuth, sun colour + intensity, sky atmosphere
 * (turbidity/Rayleigh/Mie), scene fog, exposure, IBL intensity, shadow strategy, and every
 * post-FX pass. An agent can still layer fine-grained `set_post_fx` on top afterwards — presets
 * only set the parameters they own.
 */

export type VisualStyleName =
  | 'golden_hour'
  | 'neon_night'
  | 'stylized'
  | 'photoreal'
  | 'moody'
  | 'midnight'
  | 'daylight';

/** A complete, deterministic recipe for how the viewport should look. */
export interface VisualStyle {
  /** Sun height above the horizon, degrees. Lower = longer, more dramatic shadows. */
  elevationDeg: number;
  /** Sun compass heading, degrees (150 ≈ south-west in this sky's convention). */
  azimuthDeg: number;
  /** Warm/cool tint of the direct sun light. */
  sunColor: THREE.ColorRepresentation;
  /** Direct sun intensity (physical-lighting scale; the sun defaults to ~2.0). */
  sunIntensity: number;
  /** Sky atmosphere — Preetham uniforms (see SkyEnvironment). */
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  /** Exponential fog density (0 = none). */
  fogDensity: number;
  fogColor: THREE.ColorRepresentation;
  /** Tone-mapping exposure (ACES curve). */
  exposure: number;
  /** IBL (sky reflection + ambient) intensity. */
  environmentIntensity: number;
  /** 'csm' for open worlds, 'single' for small set-piece scenes. */
  shadowStrategy: 'single' | 'csm';
  // Post passes — the cinematic grade.
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  vignette: boolean;
  vignetteIntensity: number;
  colorGrade: boolean;
  saturation: number;
  contrast: number;
  brightness: number;
  filmGrain: boolean;
  filmGrainAmount: number;
  godRays: boolean;
  godRaysStrength: number;
  volumetricFog: boolean;
  volumetricFogDensity: number;
  volumetricFogColor: THREE.ColorRepresentation;
  ssr: boolean;
  ssrIntensity: number;
  motionBlur: boolean;
  motionBlurIntensity: number;
  contactShadows: boolean;
  contactShadowIntensity: number;
  taa: boolean;
}

/**
 * A sane baseline every preset is layered on top of — matches the Viewport's own defaults so a
 * bare `set_visual_style` on a fresh scene does not surprise. Presets override the fields they
 * care about and inherit the rest.
 */
export const BASE_VISUAL_STYLE: VisualStyle = {
  elevationDeg: 26,
  azimuthDeg: 150,
  sunColor: 0xfff4e6,
  sunIntensity: 2.0,
  turbidity: 8,
  rayleigh: 1.3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
  fogDensity: 0.0016,
  fogColor: 0xaec6e4,
  exposure: 0.6,
  environmentIntensity: 1.0,
  shadowStrategy: 'csm',
  bloom: true,
  bloomStrength: 0.6,
  bloomRadius: 0.55,
  bloomThreshold: 0.6,
  vignette: false,
  vignetteIntensity: 0.45,
  colorGrade: false,
  saturation: 1.0,
  contrast: 1.0,
  brightness: 0.0,
  filmGrain: false,
  filmGrainAmount: 0.05,
  godRays: false,
  godRaysStrength: 0.6,
  volumetricFog: false,
  volumetricFogDensity: 0.0008,
  volumetricFogColor: 0xfff1d6,
  ssr: false,
  ssrIntensity: 0.4,
  motionBlur: false,
  motionBlurIntensity: 1.0,
  contactShadows: false,
  contactShadowIntensity: 0.6,
  taa: true,
};

/**
 * The curated styles. Values are tuned against the Viewport's physical-lighting scale
 * (sun ~2.0, exposure ~0.6, fog ~0.0016) so "looks good out of the box" holds.
 */
export const VISUAL_STYLES: Record<VisualStyleName, Partial<VisualStyle>> = {
  /** Late-afternoon hero lighting: long warm shadows, soft haze, gentle bloom. */
  golden_hour: {
    elevationDeg: 12,
    azimuthDeg: 96,
    sunColor: 0xff9d5c,
    sunIntensity: 2.4,
    turbidity: 10,
    rayleigh: 2.2,
    mieCoefficient: 0.02,
    mieDirectionalG: 0.9,
    fogDensity: 0.0022,
    fogColor: 0xffc79a,
    exposure: 0.68,
    environmentIntensity: 1.1,
    shadowStrategy: 'csm',
    bloom: true,
    bloomStrength: 0.8,
    bloomRadius: 0.6,
    bloomThreshold: 0.55,
    vignette: true,
    vignetteIntensity: 0.5,
    colorGrade: true,
    saturation: 1.15,
    contrast: 1.08,
    brightness: 0.02,
    filmGrain: true,
    filmGrainAmount: 0.04,
    godRays: true,
    godRaysStrength: 0.75,
    volumetricFog: true,
    volumetricFogDensity: 0.0006,
    volumetricFogColor: 0xffc07a,
    ssr: true,
    ssrIntensity: 0.35,
    contactShadows: true,
    contactShadowIntensity: 0.5,
    taa: true,
  },

  /** Cyberpunk/neon: deep blue-grey dusk, magenta-cyan accents, strong bloom, wet SSR. */
  neon_night: {
    elevationDeg: -4,
    azimuthDeg: 180,
    sunColor: 0x7a7aff,
    sunIntensity: 0.35,
    turbidity: 6,
    rayleigh: 3.0,
    mieCoefficient: 0.008,
    mieDirectionalG: 0.7,
    fogDensity: 0.0032,
    fogColor: 0x1a1633,
    exposure: 0.8,
    environmentIntensity: 0.9,
    shadowStrategy: 'csm',
    bloom: true,
    bloomStrength: 1.2,
    bloomRadius: 0.75,
    bloomThreshold: 0.4,
    vignette: true,
    vignetteIntensity: 0.65,
    colorGrade: true,
    saturation: 1.35,
    contrast: 1.2,
    brightness: -0.05,
    filmGrain: true,
    filmGrainAmount: 0.07,
    godRays: false,
    volumetricFog: true,
    volumetricFogDensity: 0.0012,
    volumetricFogColor: 0x6655cc,
    ssr: true,
    ssrIntensity: 0.8,
    motionBlur: false,
    contactShadows: true,
    contactShadowIntensity: 0.7,
    taa: true,
  },

  /** Clean, saturated, slightly toon-friendly: punchy colours, crisp shadows, no noise. */
  stylized: {
    elevationDeg: 35,
    azimuthDeg: 140,
    sunColor: 0xfff0d0,
    sunIntensity: 2.0,
    turbidity: 4,
    rayleigh: 1.1,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.8,
    fogDensity: 0.001,
    fogColor: 0xcfe4ff,
    exposure: 0.62,
    environmentIntensity: 1.0,
    shadowStrategy: 'single',
    bloom: true,
    bloomStrength: 0.9,
    bloomRadius: 0.5,
    bloomThreshold: 0.7,
    vignette: false,
    colorGrade: true,
    saturation: 1.4,
    contrast: 1.25,
    brightness: 0.03,
    filmGrain: false,
    godRays: false,
    volumetricFog: false,
    ssr: false,
    contactShadows: false,
    taa: true,
  },

  /** Grounded, filmic realism: neutral exposure, restrained grade, SSR + contact AO. */
  photoreal: {
    elevationDeg: 45,
    azimuthDeg: 160,
    sunColor: 0xfff6e8,
    sunIntensity: 2.6,
    turbidity: 3,
    rayleigh: 1.0,
    mieCoefficient: 0.003,
    mieDirectionalG: 0.85,
    fogDensity: 0.0012,
    fogColor: 0xbfd3e6,
    exposure: 0.72,
    environmentIntensity: 1.15,
    shadowStrategy: 'csm',
    bloom: true,
    bloomStrength: 0.4,
    bloomRadius: 0.5,
    bloomThreshold: 0.85,
    vignette: true,
    vignetteIntensity: 0.35,
    colorGrade: true,
    saturation: 1.0,
    contrast: 1.05,
    brightness: 0.0,
    filmGrain: true,
    filmGrainAmount: 0.03,
    godRays: false,
    volumetricFog: true,
    volumetricFogDensity: 0.0004,
    volumetricFogColor: 0xfff1d6,
    ssr: true,
    ssrIntensity: 0.45,
    motionBlur: true,
    motionBlurIntensity: 0.6,
    contactShadows: true,
    contactShadowIntensity: 0.55,
    taa: true,
  },

  /** Heavy atmosphere, low contrast, muted — for dread / noir / overcast scenes. */
  moody: {
    elevationDeg: 18,
    azimuthDeg: 210,
    sunColor: 0xd8d8d8,
    sunIntensity: 1.1,
    turbidity: 12,
    rayleigh: 2.6,
    mieCoefficient: 0.03,
    mieDirectionalG: 0.95,
    fogDensity: 0.004,
    fogColor: 0x8a8a90,
    exposure: 0.58,
    environmentIntensity: 0.8,
    shadowStrategy: 'csm',
    bloom: false,
    vignette: true,
    vignetteIntensity: 0.6,
    colorGrade: true,
    saturation: 0.6,
    contrast: 0.9,
    brightness: -0.04,
    filmGrain: true,
    filmGrainAmount: 0.08,
    godRays: false,
    volumetricFog: true,
    volumetricFogDensity: 0.002,
    volumetricFogColor: 0x9aa0aa,
    ssr: false,
    contactShadows: false,
    taa: true,
  },

  /** True night: faint moon, deep blue fog, heavy vignette, warm sodium pockets. */
  midnight: {
    elevationDeg: -22,
    azimuthDeg: 20,
    sunColor: 0x9aa8ff,
    sunIntensity: 0.12,
    turbidity: 5,
    rayleigh: 3.5,
    mieCoefficient: 0.006,
    mieDirectionalG: 0.6,
    fogDensity: 0.0026,
    fogColor: 0x0b1030,
    exposure: 0.9,
    environmentIntensity: 0.7,
    shadowStrategy: 'csm',
    bloom: true,
    bloomStrength: 0.7,
    bloomRadius: 0.6,
    bloomThreshold: 0.45,
    vignette: true,
    vignetteIntensity: 0.7,
    colorGrade: true,
    saturation: 0.9,
    contrast: 1.1,
    brightness: -0.08,
    filmGrain: true,
    filmGrainAmount: 0.06,
    godRays: false,
    volumetricFog: true,
    volumetricFogDensity: 0.0015,
    volumetricFogColor: 0x2233aa,
    ssr: false,
    contactShadows: true,
    contactShadowIntensity: 0.8,
    taa: true,
  },

  /** Clean midday: no grade, minimal effects — the neutral "make everything visible" style. */
  daylight: {
    elevationDeg: 55,
    azimuthDeg: 150,
    sunColor: 0xfff4e6,
    sunIntensity: 2.2,
    turbidity: 3,
    rayleigh: 1.0,
    mieCoefficient: 0.003,
    mieDirectionalG: 0.8,
    fogDensity: 0.001,
    fogColor: 0xc9ddf0,
    exposure: 0.65,
    environmentIntensity: 1.0,
    shadowStrategy: 'csm',
    bloom: false,
    vignette: false,
    colorGrade: false,
    filmGrain: false,
    godRays: false,
    volumetricFog: false,
    ssr: false,
    contactShadows: false,
    taa: true,
  },
};

export const VISUAL_STYLE_NAMES: VisualStyleName[] = Object.keys(VISUAL_STYLES) as VisualStyleName[];

/** Resolve a named style to a full recipe, layering optional per-command overrides on top. */
export function resolveVisualStyle(style: VisualStyleName, overrides?: Partial<VisualStyle>): VisualStyle {
  return { ...BASE_VISUAL_STYLE, ...VISUAL_STYLES[style], ...(overrides ?? {}) };
}

/** Is `s` a known style name? (Guard for unknown names arriving over the bridge.) */
export function isVisualStyleName(s: unknown): s is VisualStyleName {
  return typeof s === 'string' && (VISUAL_STYLES as Record<string, unknown>)[s] !== undefined;
}

/**
 * Capture the viewport's CURRENT visual state into a full VisualStyle recipe. This is what
 * `bake_scene` uses: it turns whatever the agent dialed in (possibly via many fine-grained
 * commands) into one deterministic, re-appliable snapshot — the "baked look".
 *
 * Reading sun elevation/azimuth back from the sky's sun direction vector:
 *   y = cos(phi) = sin(elevationDeg), and azimuth = theta (the vector's longitude).
 */
export function captureVisualStyle(viewport: Viewport): VisualStyle {
  const sky = viewport.skyEnv;
  const scene = viewport.scene;
  const dir = sky.sunDirection;
  const elevationDeg = 90 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1)));
  const azimuthDeg = ((THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x)) + 360) % 360);
  const fog = scene.fog as THREE.FogExp2 | null;
  const pipeline = viewport.pipeline as unknown as {
    bloomPass?: { enabled: boolean; strength: number; radius: number; threshold: number };
    vignettePass?: { enabled: boolean; uniforms: { intensity: { value: number } } };
    colorGradePass?: { enabled: boolean; uniforms: { saturation: { value: number }; contrast: { value: number }; brightness: { value: number } } };
    filmGrainPass?: { enabled: boolean; uniforms: { amount: { value: number } } };
    godRaysPass?: { enabled: boolean; uniforms: { strength: { value: number } } };
    volumetricFogPass?: { enabled: boolean; uniforms: { density: { value: number }; fogColor: { value: THREE.Color } } };
    ssrPass?: { enabled: boolean; uniforms: { intensity: { value: number } } };
    motionBlurPass?: { enabled: boolean; uniforms: { intensity: { value: number } } };
    contactShadowsPass?: { enabled: boolean; uniforms: { intensity: { value: number } } };
  };

  const atmo = sky.atmosphere;

  return {
    elevationDeg,
    azimuthDeg,
    sunColor: (viewport.shadow as unknown as { sun?: { color: THREE.Color } }).sun?.color.getHex() ?? BASE_VISUAL_STYLE.sunColor,
    sunIntensity: (viewport.shadow as unknown as { sun?: { intensity: number } }).sun?.intensity ?? BASE_VISUAL_STYLE.sunIntensity,
    turbidity: atmo.turbidity,
    rayleigh: atmo.rayleigh,
    mieCoefficient: atmo.mieCoefficient,
    mieDirectionalG: atmo.mieDirectionalG,
    fogDensity: fog && (fog as THREE.FogExp2).isFogExp2 ? fog.density : 0,
    fogColor: fog && (fog as THREE.FogExp2).isFogExp2 ? (fog as THREE.FogExp2).color.getHex() : BASE_VISUAL_STYLE.fogColor,
    exposure: viewport.renderer.toneMappingExposure,
    environmentIntensity: scene.environmentIntensity,
    shadowStrategy: viewport.shadowStrategy,
    bloom: pipeline?.bloomPass?.enabled ?? BASE_VISUAL_STYLE.bloom,
    bloomStrength: pipeline?.bloomPass?.strength ?? BASE_VISUAL_STYLE.bloomStrength,
    bloomRadius: pipeline?.bloomPass?.radius ?? BASE_VISUAL_STYLE.bloomRadius,
    bloomThreshold: pipeline?.bloomPass?.threshold ?? BASE_VISUAL_STYLE.bloomThreshold,
    vignette: pipeline?.vignettePass?.enabled ?? BASE_VISUAL_STYLE.vignette,
    vignetteIntensity: pipeline?.vignettePass?.uniforms.intensity.value ?? BASE_VISUAL_STYLE.vignetteIntensity,
    colorGrade: pipeline?.colorGradePass?.enabled ?? BASE_VISUAL_STYLE.colorGrade,
    saturation: pipeline?.colorGradePass?.uniforms.saturation.value ?? BASE_VISUAL_STYLE.saturation,
    contrast: pipeline?.colorGradePass?.uniforms.contrast.value ?? BASE_VISUAL_STYLE.contrast,
    brightness: pipeline?.colorGradePass?.uniforms.brightness.value ?? BASE_VISUAL_STYLE.brightness,
    filmGrain: pipeline?.filmGrainPass?.enabled ?? BASE_VISUAL_STYLE.filmGrain,
    filmGrainAmount: pipeline?.filmGrainPass?.uniforms.amount.value ?? BASE_VISUAL_STYLE.filmGrainAmount,
    godRays: pipeline?.godRaysPass?.enabled ?? BASE_VISUAL_STYLE.godRays,
    godRaysStrength: pipeline?.godRaysPass?.uniforms.strength.value ?? BASE_VISUAL_STYLE.godRaysStrength,
    volumetricFog: pipeline?.volumetricFogPass?.enabled ?? BASE_VISUAL_STYLE.volumetricFog,
    volumetricFogDensity: pipeline?.volumetricFogPass?.uniforms.density.value ?? BASE_VISUAL_STYLE.volumetricFogDensity,
    volumetricFogColor: pipeline?.volumetricFogPass?.uniforms.fogColor.value.getHex() ?? BASE_VISUAL_STYLE.volumetricFogColor,
    ssr: pipeline?.ssrPass?.enabled ?? BASE_VISUAL_STYLE.ssr,
    ssrIntensity: pipeline?.ssrPass?.uniforms.intensity.value ?? BASE_VISUAL_STYLE.ssrIntensity,
    motionBlur: pipeline?.motionBlurPass?.enabled ?? BASE_VISUAL_STYLE.motionBlur,
    motionBlurIntensity: pipeline?.motionBlurPass?.uniforms.intensity.value ?? BASE_VISUAL_STYLE.motionBlurIntensity,
    contactShadows: pipeline?.contactShadowsPass?.enabled ?? BASE_VISUAL_STYLE.contactShadows,
    contactShadowIntensity: pipeline?.contactShadowsPass?.uniforms.intensity.value ?? BASE_VISUAL_STYLE.contactShadowIntensity,
    taa: (viewport.pipeline as unknown as { taaPass?: { enabled: boolean } }).taaPass?.enabled ?? BASE_VISUAL_STYLE.taa,
  };
}

/**
 * Apply a resolved style to a live viewport. This is the "one command, whole look" entry
 * point — also exposed via the `set_visual_style` AICommand and `engine.setVisualStyle()`.
 *
 * Presets own a fixed set of parameters (sun, atmosphere, fog, exposure, IBL, shadow strategy,
 * post passes) and leave anything else untouched, so an agent can fine-tune on top.
 */
export function applyVisualStyle(viewport: Viewport, style: VisualStyle): void {
  const scene = viewport.scene;
  const sky = viewport.skyEnv;
  const pipeline = viewport.pipeline;

  // ─── Sun + atmosphere + IBL ─────────────────────────────────────────────
  const phi = THREE.MathUtils.degToRad(90 - style.elevationDeg);
  const theta = THREE.MathUtils.degToRad(style.azimuthDeg);
  const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize();
  sky.setSunDirection(dir, scene);
  // The shadow provider owns its own sun light; point it the same direction. CSM exposes
  // setSunDirection; the single-map provider exposes a writable sunDir (see Viewport).
  const shadow = viewport.shadow as unknown as {
    sunDir?: THREE.Vector3;
    setSunDirection?: (d: THREE.Vector3) => void;
  };
  if (shadow.sunDir) shadow.sunDir.copy(dir);
  if (shadow.setSunDirection) shadow.setSunDirection(dir);
  viewport.shadow.setSunColor(style.sunColor);
  viewport.shadow.setSunIntensity(style.sunIntensity);
  // Atmosphere (Preetham uniforms) — re-bakes the sky cube + IBL once. The sky is baked
  // after the sun move above so the cube reflects the final sun position.
  sky.setAtmosphere({
    turbidity: style.turbidity,
    rayleigh: style.rayleigh,
    mieCoefficient: style.mieCoefficient,
    mieDirectionalG: style.mieDirectionalG,
  }, scene);

  viewport.renderer.toneMappingExposure = style.exposure;
  viewport.setEnvironmentParams({ environmentIntensity: style.environmentIntensity });

  // ─── Shadows ────────────────────────────────────────────────────────────
  if (viewport.shadowStrategy !== style.shadowStrategy) {
    viewport.setShadowStrategy(style.shadowStrategy);
  }

  // ─── Scene fog ──────────────────────────────────────────────────────────
  if (style.fogDensity > 0) {
    if (scene.fog && (scene.fog as THREE.FogExp2).isFogExp2) {
      (scene.fog as THREE.FogExp2).density = style.fogDensity;
      (scene.fog as THREE.FogExp2).color.set(style.fogColor);
    } else {
      scene.fog = new THREE.FogExp2(style.fogColor, style.fogDensity);
    }
  } else {
    scene.fog = null;
  }

  // ─── Post passes ────────────────────────────────────────────────────────
  if (pipeline) {
    const p = pipeline as unknown as {
      bloomPass?: { enabled: boolean; strength: number; radius: number; threshold: number };
      vignettePass?: { enabled: boolean; uniforms: { intensity: { value: number } } };
      colorGradePass?: { enabled: boolean; uniforms: { saturation: { value: number }; contrast: { value: number }; brightness: { value: number } } };
      filmGrainPass?: { enabled: boolean; uniforms: { amount: { value: number } } };
      godRaysPass?: { enabled: boolean; uniforms: { strength: { value: number } } };
      volumetricFogPass?: { enabled: boolean; uniforms: { density: { value: number }; fogColor: { value: THREE.Color } } };
      ssrPass?: { enabled: boolean; uniforms: { intensity: { value: number } } };
      motionBlurPass?: { enabled: boolean; uniforms: { intensity: { value: number } } };
      contactShadowsPass?: { enabled: boolean; uniforms: { intensity: { value: number } } };
      setTemporalAA?: (on: boolean) => void;
    };

    if (p.bloomPass) {
      p.bloomPass.enabled = style.bloom;
      p.bloomPass.strength = style.bloomStrength;
      p.bloomPass.radius = style.bloomRadius;
      p.bloomPass.threshold = style.bloomThreshold;
    }
    if (p.vignettePass) {
      p.vignettePass.enabled = style.vignette;
      p.vignettePass.uniforms.intensity.value = style.vignetteIntensity;
    }
    if (p.colorGradePass) {
      p.colorGradePass.enabled = style.colorGrade;
      p.colorGradePass.uniforms.saturation.value = style.saturation;
      p.colorGradePass.uniforms.contrast.value = style.contrast;
      p.colorGradePass.uniforms.brightness.value = style.brightness;
    }
    if (p.filmGrainPass) {
      p.filmGrainPass.enabled = style.filmGrain;
      p.filmGrainPass.uniforms.amount.value = style.filmGrainAmount;
    }
    if (p.godRaysPass) {
      p.godRaysPass.enabled = style.godRays;
      p.godRaysPass.uniforms.strength.value = style.godRaysStrength;
    }
    if (p.volumetricFogPass) {
      p.volumetricFogPass.enabled = style.volumetricFog;
      p.volumetricFogPass.uniforms.density.value = style.volumetricFogDensity;
      p.volumetricFogPass.uniforms.fogColor.value.set(style.volumetricFogColor);
    }
    if (p.ssrPass) {
      p.ssrPass.enabled = style.ssr;
      p.ssrPass.uniforms.intensity.value = style.ssrIntensity;
    }
    if (p.motionBlurPass) {
      p.motionBlurPass.enabled = style.motionBlur;
      p.motionBlurPass.uniforms.intensity.value = style.motionBlurIntensity;
    }
    if (p.contactShadowsPass) {
      p.contactShadowsPass.enabled = style.contactShadows;
      p.contactShadowsPass.uniforms.intensity.value = style.contactShadowIntensity;
    }
    p.setTemporalAA?.(style.taa);
  }
}
