import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SSGIPass, GTAOPass } from '../src/rendering/PostFXPasses';

describe('SSGIPass & GTAOPass Advanced Post-Processing', () => {
  it('instantiates SSGIPass and configures uniforms', () => {
    const ssgi = new SSGIPass();
    expect(ssgi).toBeDefined();

    expect(ssgi.uniforms.intensity.value).toBe(1.0);
    expect(ssgi.uniforms.maxDistance.value).toBe(10.0);
    expect(ssgi.uniforms.raySteps.value).toBe(16);

    ssgi.setSize(1920, 1080);
    expect(ssgi.uniforms.resolution.value.x).toBe(1920);
    expect(ssgi.uniforms.resolution.value.y).toBe(1080);

    ssgi.dispose();
  });

  it('instantiates GTAOPass and configures ambient occlusion parameters', () => {
    const gtao = new GTAOPass();
    expect(gtao).toBeDefined();

    expect(gtao.uniforms.radius.value).toBe(1.5);
    expect(gtao.uniforms.intensity.value).toBe(1.2);
    expect(gtao.uniforms.falloff.value).toBe(0.8);

    gtao.setSize(2560, 1440);
    expect(gtao.uniforms.resolution.value.x).toBe(2560);

    gtao.dispose();
  });
});
