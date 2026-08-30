/**
 * AnimeTonemappingPass.ts — Dedicated selectable display output transforms for MIX Engine.
 *
 * Provides exact 1-to-1 HDR -> display transforms:
 * - 'mix_anime': Signature MIX anime tone curve preserving saturated midtones and expressive contrast
 * - 'aces': Industry standard ACES Filmic tonemapper
 * - 'neutral': Khronos PBR Neutral tonemapper
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { AnimeColorTransformMode } from '../profiles/VisualStyleRegistry';

const vertShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform int uMode; // 0: ACES, 1: MIX Anime, 2: Neutral
  uniform float uExposure;
  varying vec2 vUv;

  // ACES Filmic tonemapping curve
  vec3 tonemapACES(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  // Khronos PBR Neutral tonemapping
  vec3 tonemapNeutral(vec3 color) {
    const float startCompression = 0.8 - 0.04;
    const float desaturation = 0.15;
    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;
    float peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) return color;
    float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / (peak + d - startCompression);
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
  }

  // Signature MIX Anime tonemapping curve
  vec3 tonemapMixAnime(vec3 color) {
    // 1. Preserve vibrant midtones without premature desaturation into white
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    
    // Smooth filmic shoulder with extended headroom
    vec3 filmic = (color * (1.8 * color + 0.12)) / (color * (1.7 * color + 0.65) + 0.08);
    
    // Chrominance-preserving luminance compression
    float mappedLum = (lum * (1.0 + lum / 16.0)) / (1.0 + lum);
    vec3 lumPreserved = color * (mappedLum / max(lum, 0.0001));
    
    // Blend luminance compression with filmic response (preserves rich anime hues in bright regions)
    vec3 mapped = mix(lumPreserved, filmic, 0.45);
    
    // S-curve toe enhancement for crisp anime line & shadow contrast
    vec3 sCurve = smoothstep(vec3(0.0), vec3(1.0), mapped);
    mapped = mix(mapped, sCurve, 0.25);
    
    return clamp(mapped, 0.0, 1.0);
  }

  // Linear to sRGB OETF transfer
  vec3 linearToSRGB(vec3 color) {
    vec3 a = 12.92 * color;
    vec3 b = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
    vec3 c = step(vec3(0.0031308), color);
    return mix(a, b, c);
  }

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    vec3 hdrColor = texel.rgb * uExposure;
    
    vec3 ldrColor;
    if (uMode == 0) {
      ldrColor = tonemapACES(hdrColor);
    } else if (uMode == 1) {
      ldrColor = tonemapMixAnime(hdrColor);
    } else {
      ldrColor = tonemapNeutral(hdrColor);
    }

    vec3 srgbColor = linearToSRGB(ldrColor);
    gl_FragColor = vec4(srgbColor, texel.a);
  }
`;

export class AnimeTonemappingPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    uMode: { value: 1 }, // 0: ACES, 1: MIX Anime, 2: Neutral
    uExposure: { value: 1.0 },
  };

  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: vertShader,
    fragmentShader: fragShader,
    depthTest: false,
    depthWrite: false,
  });

  private readonly fsQuad = new FullScreenQuad(this.material);

  constructor(mode: AnimeColorTransformMode = 'mix_anime', exposure = 1.0) {
    super();
    this.setColorTransform(mode);
    this.uniforms.uExposure.value = exposure;
  }

  getColorTransform(): AnimeColorTransformMode {
    const m = this.uniforms.uMode.value;
    return m === 0 ? 'aces' : m === 2 ? 'neutral' : 'mix_anime';
  }

  setColorTransform(mode: AnimeColorTransformMode): void {
    const modeInt = mode === 'aces' ? 0 : mode === 'neutral' ? 2 : 1;
    this.uniforms.uMode.value = modeInt;
  }

  setExposure(exposure: number): void {
    this.uniforms.uExposure.value = exposure;
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
