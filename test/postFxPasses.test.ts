// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  GodRaysPass,
  DepthOfFieldPass,
  SSRPass,
  VolumetricFogPass,
  MotionBlurPass,
  ContactShadowsPass,
  AutoExposurePass,
  TAAPass,
} from '../src/rendering/PostFXPasses';

// These passes are plain ShaderMaterial + FullScreenQuad wrappers, so they
// construct fine without a WebGL context (no renderer needed). We cover their
// public contract — the surface the RenderPipeline + AIBridge drive.

describe('GodRaysPass (volumetric light shafts)', () => {
  it('constructs with sane scatter defaults and starts invisible (no sun fed yet)', () => {
    const p = new GodRaysPass();
    expect(p.uniforms.lightVisible.value).toBe(0); // nothing scatters until the sun is on screen
    expect(p.uniforms.decay.value).toBeGreaterThan(0);
    expect(p.uniforms.decay.value).toBeLessThan(1); // a decay >= 1 would never fall off
    expect(p.uniforms.strength.value).toBeGreaterThan(0);
    expect(p.uniforms.lightScreenPos.value.x).toBeCloseTo(0.5);
    p.dispose();
  });

  it('setLight pushes the sun screen UV + visibility into the uniforms', () => {
    const p = new GodRaysPass();
    p.setLight(0.25, 0.8, 0.6);
    expect(p.uniforms.lightScreenPos.value.x).toBeCloseTo(0.25);
    expect(p.uniforms.lightScreenPos.value.y).toBeCloseTo(0.8);
    expect(p.uniforms.lightVisible.value).toBeCloseTo(0.6);
    p.dispose();
  });

  it('exposes a Pass.enabled toggle (the pipeline defaults it off)', () => {
    const p = new GodRaysPass();
    expect(typeof p.enabled).toBe('boolean');
    p.enabled = false;
    expect(p.enabled).toBe(false);
    p.dispose();
  });
});

describe('DepthOfFieldPass (circle-of-confusion bokeh)', () => {
  it('constructs with a manual focal plane and auto-focus off by default', () => {
    const p = new DepthOfFieldPass();
    expect(p.uniforms.autoFocus.value).toBe(0);
    expect(p.uniforms.focusDistance.value).toBeGreaterThan(0);
    expect(p.uniforms.focusRange.value).toBeGreaterThan(0);
    expect(p.uniforms.bokehScale.value).toBeGreaterThan(0);
    p.dispose();
  });

  it('accepts a depth texture + live camera clip planes (depth linearisation inputs)', () => {
    const p = new DepthOfFieldPass();
    const depth = new THREE.DepthTexture(4, 4);
    p.setDepthTexture(depth);
    expect(p.uniforms.tDepth.value).toBe(depth);

    p.setCameraClip(0.5, 1234);
    expect(p.uniforms.cameraNear.value).toBe(0.5);
    expect(p.uniforms.cameraFar.value).toBe(1234);
    p.dispose();
  });

  it('setSize tracks the render resolution for pixel-accurate bokeh radius', () => {
    const p = new DepthOfFieldPass();
    p.setSize(1920, 1080);
    expect(p.uniforms.resolution.value.x).toBe(1920);
    expect(p.uniforms.resolution.value.y).toBe(1080);
    p.dispose();
  });
});

describe('SSRPass (screen-space reflections)', () => {
  it('constructs with sane march defaults', () => {
    const p = new SSRPass();
    expect(p.uniforms.intensity.value).toBeGreaterThan(0);
    expect(p.uniforms.maxDistance.value).toBeGreaterThan(0);
    expect(p.uniforms.thickness.value).toBeGreaterThan(0);
    expect(p.uniforms.fresnelPower.value).toBeGreaterThan(0); // grazing-angle bias
    expect(typeof p.enabled).toBe('boolean');
    p.dispose();
  });

  it('takes the G-buffer depth + view-normal textures it marches against', () => {
    const p = new SSRPass();
    const depth = new THREE.DepthTexture(4, 4);
    const normals = new THREE.Texture();
    p.setDepthTexture(depth);
    p.setNormalTexture(normals);
    expect(p.uniforms.tDepth.value).toBe(depth);
    expect(p.uniforms.tNormal.value).toBe(normals);
    p.dispose();
  });

  it('setCameraMatrices copies projection + inverse projection + near plane', () => {
    const p = new SSRPass();
    const proj = new THREE.Matrix4().makePerspective(-1, 1, 1, -1, 0.25, 500);
    const inv = proj.clone().invert();
    p.setCameraMatrices(proj, inv, 0.25);
    expect(p.uniforms.projection.value.elements[0]).toBeCloseTo(proj.elements[0]);
    expect(p.uniforms.inverseProjection.value.elements[0]).toBeCloseTo(inv.elements[0]);
    expect(p.uniforms.cameraNear.value).toBe(0.25);
    p.dispose();
  });

  it('setSize tracks resolution for the screen-edge fade', () => {
    const p = new SSRPass();
    p.setSize(1280, 720);
    expect(p.uniforms.resolution.value.x).toBe(1280);
    expect(p.uniforms.resolution.value.y).toBe(720);
    p.dispose();
  });
});

describe('VolumetricFogPass (raymarched atmospheric scattering)', () => {
  it('constructs with physically-sane scattering defaults', () => {
    const p = new VolumetricFogPass();
    expect(p.uniforms.density.value).toBeGreaterThan(0);
    expect(p.uniforms.maxDistance.value).toBeGreaterThan(0);
    // Henyey-Greenstein g must stay < 1 or the phase function blows up.
    expect(p.uniforms.anisotropy.value).toBeGreaterThan(0);
    expect(p.uniforms.anisotropy.value).toBeLessThan(1);
    p.dispose();
  });

  it('accepts the scene depth it marches up to', () => {
    const p = new VolumetricFogPass();
    const depth = new THREE.DepthTexture(4, 4);
    p.setDepthTexture(depth);
    expect(p.uniforms.tDepth.value).toBe(depth);
    p.dispose();
  });

  it('setCameraState feeds world reconstruction inputs', () => {
    const p = new VolumetricFogPass();
    const inv = new THREE.Matrix4().makePerspective(-1, 1, 1, -1, 0.1, 100).invert();
    const world = new THREE.Matrix4().makeTranslation(3, 4, 5);
    const pos = new THREE.Vector3(3, 4, 5);
    p.setCameraState(inv, world, pos);
    expect(p.uniforms.cameraPos.value.x).toBe(3);
    expect(p.uniforms.cameraMatrixWorld.value.elements[12]).toBe(3);
    p.dispose();
  });

  it('setSun copies the directional in-scatter source', () => {
    const p = new VolumetricFogPass();
    const dir = new THREE.Vector3(0, 1, 0).normalize();
    const col = new THREE.Color(0xff8844);
    p.setSun(dir, col);
    expect(p.uniforms.sunDirection.value.y).toBeCloseTo(1);
    expect(p.uniforms.sunColor.value.getHex()).toBe(0xff8844);
    p.dispose();
  });
});

describe('MotionBlurPass (camera reprojection)', () => {
  it('constructs with a velocity clamp so fast turns do not smear the whole screen', () => {
    const p = new MotionBlurPass();
    expect(p.uniforms.intensity.value).toBeGreaterThan(0);
    expect(p.uniforms.maxVelocity.value).toBeGreaterThan(0);
    p.dispose();
  });

  it('primes prev-VP to the current frame while disabled (no first-frame mega-smear)', () => {
    const p = new MotionBlurPass();
    p.enabled = false; // the RenderPipeline keeps it off until requested
    const vp = new THREE.Matrix4().makeTranslation(10, 0, 0);
    const inv = new THREE.Matrix4();
    const world = new THREE.Matrix4();
    p.setCameraState(inv, world, vp);
    // While disabled, the previous view-projection tracks the current one, so the
    // velocity is zero — enabling it later won't blur a single giant frame.
    expect(p.uniforms.prevViewProjection.value.elements[12]).toBe(10);
    p.dispose();
  });

  it('accepts the depth texture used to reconstruct world position', () => {
    const p = new MotionBlurPass();
    const depth = new THREE.DepthTexture(4, 4);
    p.setDepthTexture(depth);
    expect(p.uniforms.tDepth.value).toBe(depth);
    p.dispose();
  });
});

describe('ContactShadowsPass (sun-traced contact darkening)', () => {
  it('constructs with a short trace + sane darkening defaults', () => {
    const p = new ContactShadowsPass();
    expect(p.uniforms.intensity.value).toBeGreaterThan(0);
    expect(p.uniforms.intensity.value).toBeLessThanOrEqual(1);
    expect(p.uniforms.maxDistance.value).toBeGreaterThan(0);
    expect(p.uniforms.bias.value).toBeGreaterThan(0); // avoids self-shadow acne
    p.dispose();
  });

  it('feeds depth + projection/view matrices + the sun direction it traces toward', () => {
    const p = new ContactShadowsPass();
    const depth = new THREE.DepthTexture(4, 4);
    const proj = new THREE.Matrix4().makePerspective(-1, 1, 1, -1, 0.1, 100);
    const inv = proj.clone().invert();
    const view = new THREE.Matrix4().makeTranslation(0, -2, -5);
    p.setDepthTexture(depth);
    p.setCameraMatrices(proj, inv, view);
    p.setSun(new THREE.Vector3(0.3, 0.9, 0.2).normalize());
    expect(p.uniforms.tDepth.value).toBe(depth);
    // NB: uViewMatrix, not viewMatrix — the latter is a reserved three.js built-in.
    expect(p.uniforms.uViewMatrix.value.elements[13]).toBeCloseTo(-2);
    expect(p.uniforms.sunDirectionWorld.value.y).toBeGreaterThan(0.8);
    p.dispose();
  });
});

describe('AutoExposurePass (HDR eye adaptation)', () => {
  it('constructs with a middle-grey key and clamped exposure range', () => {
    const p = new AutoExposurePass();
    expect(p.uniforms.key.value).toBeGreaterThan(0);
    expect(p.uniforms.minExposure.value).toBeGreaterThan(0);
    expect(p.uniforms.maxExposure.value).toBeGreaterThan(p.uniforms.minExposure.value);
    expect(p.uniforms.speed.value).toBeGreaterThan(0);
    p.dispose();
  });

  it('accepts a frame delta so adaptation is framerate-independent', () => {
    const p = new AutoExposurePass();
    expect(() => p.setDeltaTime(0.033)).not.toThrow();
    p.dispose();
  });
});

describe('TAAPass (temporal anti-aliasing)', () => {
  it('constructs with a history feedback weight in (0,1)', () => {
    const p = new TAAPass();
    expect(p.uniforms.feedback.value).toBeGreaterThan(0);
    expect(p.uniforms.feedback.value).toBeLessThan(1);
    p.dispose();
  });

  it('tracks resolution for the neighbourhood-clamp texel size', () => {
    const p = new TAAPass();
    p.setSize(1600, 900);
    expect(p.uniforms.resolution.value.x).toBe(1600);
    expect(p.uniforms.resolution.value.y).toBe(900);
    p.dispose();
  });

  it('primes prev-VP to the current frame while disabled (clean re-enable)', () => {
    const p = new TAAPass();
    p.enabled = false;
    const vp = new THREE.Matrix4().makeTranslation(7, 0, 0);
    p.setCameraState(new THREE.Matrix4(), new THREE.Matrix4(), vp);
    expect(p.uniforms.prevViewProjection.value.elements[12]).toBe(7);
    p.dispose();
  });
});
