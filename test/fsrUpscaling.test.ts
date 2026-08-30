import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FsrUpscaler } from '../src/rendering/FsrUpscaler';
import { LOW_SPEC_RESOLUTION, resolveRenderResolution, sanitizeResolution } from '../src/rendering/RenderResolution';

describe('internal/output resolution budgeting', () => {
  it('renders 540p into 900p without multiplying the budget on high-DPI displays', () => {
    for (const dpr of [1, 1.25, 2, 3]) {
      expect(resolveRenderResolution(1920, 1080, dpr, LOW_SPEC_RESOLUTION)).toEqual({
        outputWidth: 1600, outputHeight: 900, internalWidth: 960, internalHeight: 540,
      });
    }
  });
  it('fits ultrawide, portrait and small viewports without stretching or oversampling', () => {
    for (const [w, h] of [[2560, 1080], [900, 1600], [320, 180]]) {
      const r = resolveRenderResolution(w, h, 1, LOW_SPEC_RESOLUTION);
      expect(r.outputWidth).toBeLessThanOrEqual(Math.min(w, 1600));
      expect(r.outputHeight).toBeLessThanOrEqual(Math.min(h, 900));
      expect(r.internalWidth).toBeLessThanOrEqual(Math.min(r.outputWidth, 960));
      expect(r.internalHeight).toBeLessThanOrEqual(Math.min(r.outputHeight, 540));
      expect(Math.abs(r.outputWidth / r.outputHeight - w / h)).toBeLessThan(0.01);
      expect(Math.abs(r.internalWidth / r.internalHeight - w / h)).toBeLessThan(0.01);
    }
  });
  it('keeps resolution independent of the FSR toggle and supports native rendering', () => {
    expect(resolveRenderResolution(1600, 900, 1, { ...LOW_SPEC_RESOLUTION, fsrEnabled: false }))
      .toEqual(resolveRenderResolution(1600, 900, 1, LOW_SPEC_RESOLUTION));
    expect(resolveRenderResolution(1920, 1080, 1, { ...LOW_SPEC_RESOLUTION, outputHeight: 0, internalHeight: 0, renderScale: 1 }))
      .toEqual({ outputWidth: 1920, outputHeight: 1080, internalWidth: 1920, internalHeight: 1080 });
  });
  it('bounds invalid preferences, empty viewports and oversized targets', () => {
    const settings = sanitizeResolution({ fsrEnabled: 'yes' as any, outputHeight: Infinity, internalHeight: -4, fsrSharpness: NaN, renderScale: 999 });
    expect(settings).toMatchObject({ fsrEnabled: true, outputHeight: 900, internalHeight: 0, fsrSharpness: 0.35, renderScale: 1.5 });
    for (const [w, h] of [[0, 0], [NaN, Infinity], [16384, 9000]]) {
      const r = resolveRenderResolution(w, h, 3, settings, 2048);
      for (const value of Object.values(r)) { expect(value).toBeGreaterThan(0); expect(value).toBeLessThanOrEqual(2048); }
    }
  });
});

describe('FSR presentation target lifecycle', () => {
  function setup() {
    const upscaler = new FsrUpscaler();
    upscaler.setSize(1600, 900);
    const input = new THREE.WebGLRenderTarget(960, 540);
    const previous = new THREE.WebGLRenderTarget(1, 1);
    let target: THREE.WebGLRenderTarget | null = previous;
    const draws: Array<{ target: THREE.WebGLRenderTarget | null; material: THREE.ShaderMaterial }> = [];
    const renderer = {
      getRenderTarget: () => target,
      setRenderTarget: vi.fn((rt: THREE.WebGLRenderTarget | null) => { target = rt; }),
      render: vi.fn((mesh: THREE.Mesh) => { draws.push({ target, material: mesh.material as THREE.ShaderMaterial }); }),
    } as unknown as THREE.WebGLRenderer;
    return { upscaler, input, previous, renderer, draws };
  }
  it('uses distinct input/output targets, then releases RGBA8 sharpening memory when disabled', () => {
    const { upscaler, input, previous, renderer, draws } = setup();
    upscaler.render(renderer, input);
    expect(draws).toHaveLength(2);
    const intermediate = draws[0].target!;
    expect([intermediate.width, intermediate.height, intermediate.texture.type, intermediate.depthBuffer])
      .toEqual([1600, 900, THREE.UnsignedByteType, false]);
    expect(draws[0].material.uniforms.tInput.value).toBe(input.texture);
    expect(draws[1].material.uniforms.tInput.value).toBe(intermediate.texture);
    expect(draws[1].target).toBeNull();
    expect(renderer.getRenderTarget()).toBe(previous);
    const disposed = vi.fn(); intermediate.addEventListener('dispose', disposed);
    upscaler.configure(false, 0.35);
    expect(disposed).toHaveBeenCalledOnce();
    draws.length = 0;
    upscaler.render(renderer, input);
    expect(draws).toHaveLength(1);
    expect(draws[0].target).toBeNull();
    upscaler.dispose(); input.dispose(); previous.dispose();
  });
  it('skips sharpening at zero and FSR entirely at native resolution', () => {
    const { upscaler, input, previous, renderer, draws } = setup();
    upscaler.configure(true, 0);
    upscaler.render(renderer, input);
    expect(draws).toHaveLength(1);
    expect(draws[0].material.fragmentShader).toContain('void edge');
    draws.length = 0;
    upscaler.setSize(960, 540);
    upscaler.configure(true, 0.35);
    upscaler.render(renderer, input);
    expect(draws).toHaveLength(1);
    expect(draws[0].material.fragmentShader).not.toContain('void edge');
    upscaler.dispose(); input.dispose(); previous.dispose();
  });
  it('restores the previous render target when drawing throws', () => {
    const { upscaler, input, previous, renderer } = setup();
    vi.mocked(renderer.render).mockImplementation(() => { throw new Error('lost device'); });
    expect(() => upscaler.render(renderer, input)).toThrow('lost device');
    expect(renderer.getRenderTarget()).toBe(previous);
    upscaler.dispose(); input.dispose(); previous.dispose();
  });
});
