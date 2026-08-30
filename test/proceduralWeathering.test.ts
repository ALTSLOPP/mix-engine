import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  normalizeWeather, hasWeathering, needsInstanceMaterial,
  prepareInstanceMaterial, applyWeathering,
} from '../src/assets/proceduralWeathering';

describe('proceduralWeathering — params', () => {
  it('clamps weathering into [0,1]', () => {
    expect(normalizeWeather({ rust: 2, dirt: -1 })).toEqual({ rust: 1, dirt: 0 });
    expect(normalizeWeather({})).toEqual({ rust: 0, dirt: 0 });
  });

  it('detects whether any per-instance material change is requested', () => {
    expect(needsInstanceMaterial({})).toBe(false);
    expect(needsInstanceMaterial({ tint: 0xff0000 })).toBe(true);
    expect(needsInstanceMaterial({ rust: 0.5 })).toBe(true);
    expect(hasWeathering({ rust: 0, dirt: 0 })).toBe(false);
    expect(hasWeathering({ dirt: 0.3 })).toBe(true);
  });
});

describe('proceduralWeathering — material dressing', () => {
  it('clones the material and never mutates the shared original', () => {
    const orig = new THREE.MeshStandardMaterial({ color: 0x112233, roughness: 0.5, metalness: 0.2 });
    const clone = prepareInstanceMaterial(orig, { tint: 0xff0000, rust: 0.8 });
    expect(clone).not.toBeNull();
    expect(clone).not.toBe(orig);
    expect(clone!.color.getHex()).toBe(0xff0000);
    // The shared canonical is untouched (would otherwise rust every instance).
    expect(orig.color.getHex()).toBe(0x112233);
    // Weathering raised roughness + installed the shader patch.
    expect(clone!.roughness).toBeGreaterThan(0.5);
    expect(typeof clone!.onBeforeCompile).toBe('function');
  });

  it('returns null for non-PBR materials (left shared, untouched)', () => {
    const basic = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    expect(prepareInstanceMaterial(basic, { tint: 0xff0000 })).toBeNull();
  });

  it('injects procedural rust into the compiled shader', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyWeathering(mat, { rust: 0.7, dirt: 0.2 });
    const shader = {
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <metalnessmap_fragment>',
      uniforms: {} as Record<string, { value: unknown }>,
    };
    mat.onBeforeCompile!(shader as any, undefined as any);
    expect(shader.uniforms.uRust.value).toBeCloseTo(0.7, 5);
    expect(shader.uniforms.uDirt.value).toBeCloseTo(0.2, 5);
    expect(shader.vertexShader).toContain('vWeatherWPos');
    expect(shader.fragmentShader).toContain('wFbm');
    expect(shader.fragmentShader).toContain('uRustColor');
    expect(mat.customProgramCacheKey()).toContain('mixWeather');
  });
});
