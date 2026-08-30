import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WebGPUClusteredLighting, type GpuPointLight } from '../src/rendering/webgpu/WebGPUClusteredLighting';

describe('WebGPUClusteredLighting Forward+ Light Culling', () => {
  it('initializes cluster grid dimensions correctly', () => {
    const cl = new WebGPUClusteredLighting({
      slicesX: 16,
      slicesY: 9,
      slicesZ: 24,
      maxLights: 1024,
    });

    expect(cl.totalClusters).toBe(16 * 9 * 24); // 3,456 clusters
    expect(cl.maxLights).toBe(1024);
  });

  it('packs CPU light objects into binary Float32Array format', () => {
    const cl = new WebGPUClusteredLighting({ maxLights: 10 });

    const lights: GpuPointLight[] = [
      {
        position: new THREE.Vector3(10, 5, -20),
        radius: 8.0,
        color: new THREE.Color(1, 0.5, 0),
        intensity: 2.5,
      },
      {
        position: new THREE.Vector3(-15, 2, -40),
        radius: 12.0,
        color: new THREE.Color(0, 0.8, 1),
        intensity: 4.0,
      },
    ];

    const packed = cl.packLightBuffer(lights);
    // The WGSL LightBuffer struct opens with lightCount: u32 + vec3<u32> padding,
    // so the lights array starts 4 floats in. Packing from index 0 shifted every
    // light by a vec4 on the GPU side.
    const H = WebGPUClusteredLighting.HEADER_FLOATS;
    expect(H).toBe(4);
    expect(packed.length).toBe(H + 10 * 8); // header + 10 lights * 8 floats
    expect(new Uint32Array(packed.buffer, 0, 1)[0]).toBe(2); // lightCount

    // Light 0
    expect(packed[H + 0]).toBe(10);
    expect(packed[H + 1]).toBe(5);
    expect(packed[H + 2]).toBe(-20);
    expect(packed[H + 3]).toBe(8.0);
    expect(packed[H + 4]).toBe(1.0);
    expect(packed[H + 5]).toBe(0.5);
    expect(packed[H + 6]).toBe(0.0);
    expect(packed[H + 7]).toBe(2.5);

    // Light 1
    expect(packed[H + 8]).toBe(-15);
    expect(packed[H + 9]).toBe(2);
    expect(packed[H + 10]).toBe(-40);
    expect(packed[H + 11]).toBe(12.0);
  });

  it('generates valid WGSL compute shader code for light culling', () => {
    const wgsl = WebGPUClusteredLighting.getCullLightsComputeShader();
    expect(wgsl).toContain('@compute');
    expect(wgsl).toContain('globalLights');
    expect(wgsl).toContain('clusterGrid');
    expect(wgsl).toContain('clamp');
  });
});
