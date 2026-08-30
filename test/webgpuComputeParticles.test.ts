import { describe, it, expect } from 'vitest';
import { WebGPUComputeParticles } from '../src/vfx/WebGPUComputeParticles';

describe('WebGPUComputeParticles Massively Parallel GPU Simulation', () => {
  it('allocates and seeds particle state buffers for 10,000+ particles', () => {
    const simulator = new WebGPUComputeParticles({
      maxParticles: 10000,
      gravity: [0, -9.81, 0],
      drag: 0.2,
      curlNoiseStrength: 2.0,
    });

    expect(simulator.maxParticles).toBe(10000);

    const initialBuffer = simulator.createInitialParticleBuffer();
    expect(initialBuffer.length).toBe(10000 * 8); // 10,000 particles * 8 floats = 80,000 floats

    // Check particle 0 life and seed
    expect(initialBuffer[3]).toBeGreaterThanOrEqual(0);
    expect(initialBuffer[3]).toBeLessThanOrEqual(1.0);
    expect(initialBuffer[7]).toBeGreaterThanOrEqual(0);
  });

  it('generates valid WGSL compute shader for particle turbulence and collision', () => {
    const wgsl = WebGPUComputeParticles.getParticleComputeShader();
    expect(wgsl).toContain('@compute');
    expect(wgsl).toContain('particles');
    expect(wgsl).toContain('curl');
    expect(wgsl).toContain('hash3');
  });
});
