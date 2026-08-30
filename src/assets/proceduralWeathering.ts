import * as THREE from 'three';

/**
 * proceduralWeathering.ts — dynamically dress a PBR material from a semantic descriptor.
 *
 * The spec asks the registry to "dynamically adjust the shader values (color, rust
 * procedural textures)" when spawning e.g. a 'rusty red car'. Rather than swap the GLB's
 * albedo for a flat rust bitmap (which destroys the model's detail), we patch the existing
 * MeshStandardMaterial via onBeforeCompile and blend a PROCEDURAL rust/dirt layer driven by
 * 3D value-noise of world position — so rust accumulates in believable patches and the
 * underlying material still shows through. This is the same onBeforeCompile idiom the engine
 * already uses for terrain/water/foliage, so it composes with lights, shadows, fog and the
 * post chain for free.
 *
 * IMPORTANT: always patch a CLONE of the shared canonical material — the AssetCache shares
 * materials by reference across every instance, so mutating one would weather all of them.
 * {@link prepareInstanceMaterial} handles the clone + disposal bookkeeping.
 */

export const RUST_COLOR = new THREE.Color(0x6e3a1c); // dark orange-brown
export const DIRT_COLOR = new THREE.Color(0x2e2a22); // grimy dark earth

export interface WeatheringParams {
  /** 0..1 — how much procedural rust to accumulate. */
  rust?: number;
  /** 0..1 — how much procedural grime/dirt to accumulate. */
  dirt?: number;
}

/** Clamp the weathering params into [0,1] (pure; exported for tests). */
export function normalizeWeather(p: WeatheringParams): { rust: number; dirt: number } {
  return {
    rust: Math.max(0, Math.min(1, p.rust ?? 0)),
    dirt: Math.max(0, Math.min(1, p.dirt ?? 0)),
  };
}

/** True if any visible weathering is requested. */
export function hasWeathering(p: WeatheringParams): boolean {
  const { rust, dirt } = normalizeWeather(p);
  return rust > 0 || dirt > 0;
}

/**
 * Inject the procedural rust/dirt layer into a MeshStandardMaterial. Mutates `material`
 * (set its onBeforeCompile + customProgramCacheKey). Safe to call on a clone. The injected
 * uniforms (`uRust`, `uDirt`) are also mirrored onto `material.userData` so they can be
 * tweaked at runtime after compile.
 */
export function applyWeathering(material: THREE.MeshStandardMaterial, params: WeatheringParams): void {
  const { rust, dirt } = normalizeWeather(params);
  const uniforms = {
    uRust: { value: rust },
    uDirt: { value: dirt },
    uRustColor: { value: RUST_COLOR.clone() },
    uDirtColor: { value: DIRT_COLOR.clone() },
  };
  material.userData.weatherUniforms = uniforms;

  // Rougher + less metallic overall the more it's weathered (the in-shader blend refines
  // this per-texel, but this keeps the base sensible even before patches dominate).
  material.roughness = Math.min(1, material.roughness + 0.4 * rust + 0.3 * dirt);
  material.metalness = Math.max(0, material.metalness - 0.3 * rust);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRust = uniforms.uRust;
    shader.uniforms.uDirt = uniforms.uDirt;
    shader.uniforms.uRustColor = uniforms.uRustColor;
    shader.uniforms.uDirtColor = uniforms.uDirtColor;

    // Vertex: pass world position to the fragment shader for stable, object-anchored noise.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWeatherWPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWeatherWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );

    // Fragment: declare the noise + uniforms, then blend after the material factors exist.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWeatherWPos;
uniform float uRust;
uniform float uDirt;
uniform vec3 uRustColor;
uniform vec3 uDirtColor;
float wHash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
float wNoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = mix(mix(mix(wHash(i + vec3(0.0,0.0,0.0)), wHash(i + vec3(1.0,0.0,0.0)), f.x),
                    mix(wHash(i + vec3(0.0,1.0,0.0)), wHash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
                mix(mix(wHash(i + vec3(0.0,0.0,1.0)), wHash(i + vec3(1.0,0.0,1.0)), f.x),
                    mix(wHash(i + vec3(0.0,1.0,1.0)), wHash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
  return n;
}
float wFbm(vec3 p){ float a = 0.5; float s = 0.0; for(int i = 0; i < 4; i++){ s += a * wNoise(p); p *= 2.03; a *= 0.5; } return s; }`)
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
{
  float rustN = wFbm(vWeatherWPos * 0.7);
  float rustMask = smoothstep(0.45, 0.8, rustN) * uRust;
  float dirtN = wFbm(vWeatherWPos * 0.35 + 13.0);
  float dirtMask = smoothstep(0.5, 0.85, dirtN) * uDirt;
  diffuseColor.rgb = mix(diffuseColor.rgb, uRustColor, rustMask);
  diffuseColor.rgb = mix(diffuseColor.rgb, uDirtColor, dirtMask * 0.8);
  roughnessFactor = mix(roughnessFactor, 0.95, rustMask);
  roughnessFactor = mix(roughnessFactor, 0.85, dirtMask);
  metalnessFactor = mix(metalnessFactor, 0.0, rustMask);
}`,
      );
  };

  // Distinguish weathered programs from plain ones in three's program cache.
  material.customProgramCacheKey = () => `mixWeather:${rust.toFixed(2)}:${dirt.toFixed(2)}`;
  material.needsUpdate = true;
}

/** Set the base albedo tint (clones nothing — operate on a per-instance clone). */
export function tintMaterial(material: THREE.MeshStandardMaterial, colorHex: number): void {
  material.color.set(colorHex);
}

export interface InstanceMaterialOptions {
  tint?: number;
  metalness?: number;
  roughness?: number;
  rust?: number;
  dirt?: number;
}

/**
 * Returns true if the options request any per-instance material change (so the caller knows
 * whether it must clone the shared material at all).
 */
export function needsInstanceMaterial(o: InstanceMaterialOptions): boolean {
  return (
    o.tint !== undefined ||
    o.metalness !== undefined ||
    o.roughness !== undefined ||
    hasWeathering(o)
  );
}

/**
 * Clone a material and apply the per-instance semantic adjustments (tint / metalness /
 * roughness / procedural rust+dirt). Returns the cloned material to swap onto the instance
 * mesh; the ORIGINAL (shared canonical) material is never touched. Push the clone onto a
 * disposables list so the entity frees it on destroy.
 */
export function prepareInstanceMaterial(
  original: THREE.Material,
  o: InstanceMaterialOptions,
): THREE.MeshStandardMaterial | null {
  const std = original as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial) return null; // only standard/physical PBR is supported
  const clone = std.clone();
  if (o.tint !== undefined) tintMaterial(clone, o.tint);
  if (o.metalness !== undefined) clone.metalness = THREE.MathUtils.clamp(o.metalness, 0, 1);
  if (o.roughness !== undefined) clone.roughness = THREE.MathUtils.clamp(o.roughness, 0, 1);
  if (hasWeathering(o)) applyWeathering(clone, o);
  clone.needsUpdate = true;
  return clone;
}
