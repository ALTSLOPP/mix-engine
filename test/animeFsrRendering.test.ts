import { describe, expect, it } from 'vitest';
import { resolveRenderResolution } from '../src/rendering/RenderResolution';
import { FsrUpscaler } from '../src/rendering/FsrUpscaler';
import { PerformanceTargetRegistry } from '../src/rendering/profiles/PerformanceTargetRegistry';

describe('Anime FSR Spatial Rendering Integration', () => {
  it('correctly maps 540p internal -> 900p output for 500 GFLOPS target', () => {
    const target = PerformanceTargetRegistry.get('ps3_plus_500');
    const res = resolveRenderResolution(1600, 900, 1.0, {
      fsrEnabled: target.fsrEnabled,
      fsrSharpness: target.fsrSharpness,
      internalHeight: target.internalHeight,
      outputHeight: target.outputHeight,
      renderScale: target.renderScale,
    }, 4096);

    expect(res.outputHeight).toBe(900);
    expect(res.internalHeight).toBe(540);
    expect(res.internalHeight < res.outputHeight).toBe(true);
    expect(res.internalWidth).toBe(960);
  });

  it('correctly maps 720p internal -> 1080p output for Balanced target', () => {
    const target = PerformanceTargetRegistry.get('balanced');
    const res = resolveRenderResolution(1920, 1080, 1.0, {
      fsrEnabled: target.fsrEnabled,
      fsrSharpness: target.fsrSharpness,
      internalHeight: target.internalHeight,
      outputHeight: target.outputHeight,
      renderScale: target.renderScale,
    }, 4096);

    expect(res.outputHeight).toBe(1080);
    expect(res.internalHeight).toBe(720);
    expect(res.internalHeight < res.outputHeight).toBe(true);
  });

  it('configures FsrUpscaler EASU + RCAS sharpness parameters', () => {
    const upscaler = new FsrUpscaler();
    upscaler.configure(true, 0.4);
    expect(upscaler.enabled).toBe(true);
    expect(upscaler.sharpness).toBe(0.4);

    upscaler.configure(false, 0.2);
    expect(upscaler.enabled).toBe(false);
  });
});
