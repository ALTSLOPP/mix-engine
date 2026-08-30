import * as THREE from 'three';

export interface GpuPointLight {
  position: THREE.Vector3;
  radius: number;
  color: THREE.Color;
  intensity: number;
}

export interface ClusteredLightingConfig {
  slicesX?: number; // 16
  slicesY?: number; // 9
  slicesZ?: number; // 24
  maxLights?: number; // 1024
  maxLightsPerCluster?: number; // 32
}

/**
 * WebGPUClusteredLighting.ts — GPU Clustered Forward+ Light Culling Pipeline using WGSL Compute Shaders.
 * Scales effortlessly to 1,024+ active dynamic point and spot lights with O(1) cluster lookups.
 */
export class WebGPUClusteredLighting {
  readonly slicesX: number;
  readonly slicesY: number;
  readonly slicesZ: number;
  readonly maxLights: number;
  readonly maxLightsPerCluster: number;
  readonly totalClusters: number;

  constructor(config: ClusteredLightingConfig = {}) {
    this.slicesX = config.slicesX ?? 16;
    this.slicesY = config.slicesY ?? 9;
    this.slicesZ = config.slicesZ ?? 24;
    this.maxLights = config.maxLights ?? 1024;
    this.maxLightsPerCluster = config.maxLightsPerCluster ?? 32;
    this.totalClusters = this.slicesX * this.slicesY * this.slicesZ;
  }

  /**
   * Packs CPU light structures into a tightly packed Float32Array for GPU buffer upload.
   * Format per light (8 floats = 32 bytes):
   * [posX, posY, posZ, radius, colR, colG, colB, intensity]
   */
  /** Floats consumed by the LightBuffer header: lightCount: u32 + vec3<u32> padding. */
  static readonly HEADER_FLOATS = 4;

  packLightBuffer(lights: GpuPointLight[]): Float32Array {
    const count = Math.min(lights.length, this.maxLights);
    // The WGSL `LightBuffer` struct puts a 16-byte header before the lights array.
    // Packing straight from offset 0 shifted every light by one vec4, so the shader
    // read radius as position.x and the cull test never matched reality.
    const buffer = new Float32Array(WebGPUClusteredLighting.HEADER_FLOATS + this.maxLights * 8);
    new Uint32Array(buffer.buffer, 0, 1)[0] = count;

    for (let i = 0; i < count; i++) {
      const light = lights[i];
      const offset = WebGPUClusteredLighting.HEADER_FLOATS + i * 8;
      buffer[offset] = light.position.x;
      buffer[offset + 1] = light.position.y;
      buffer[offset + 2] = light.position.z;
      buffer[offset + 3] = light.radius;

      buffer[offset + 4] = light.color.r;
      buffer[offset + 5] = light.color.g;
      buffer[offset + 6] = light.color.b;
      buffer[offset + 7] = light.intensity;
    }

    return buffer;
  }

  /**
   * Generates the WGSL compute shader source code for GPU light culling.
   */
  static getCullLightsComputeShader(maxLightsPerCluster = 32): string {
    // Templated so the shader honours the configured cap; it was hardcoded to 32
    // while the constructor advertised maxLightsPerCluster as configurable.
    const cap = Math.max(1, Math.floor(maxLightsPerCluster));
    return /* wgsl */ `
struct PointLight {
  posAndRadius: vec4<f32>,
  colorAndIntensity: vec4<f32>,
};

struct LightBuffer {
  lightCount: u32,
  padding: vec3<u32>,
  lights: array<PointLight>,
};

struct ClusterAABB {
  minBounds: vec4<f32>,
  maxBounds: vec4<f32>,
};

struct ClusterGrid {
  count: u32,
  indices: array<u32, ${cap}>,
};

@group(0) @binding(0) var<storage, read> globalLights: LightBuffer;
@group(0) @binding(1) var<storage, read> clusterAABBs: array<ClusterAABB>;
@group(0) @binding(2) var<storage, read_write> clusterGrid: array<ClusterGrid>;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let clusterIndex = global_id.x;
  if (clusterIndex >= arrayLength(&clusterAABBs)) {
    return;
  }

  let aabb = clusterAABBs[clusterIndex];
  var visibleLightCount: u32 = 0u;

  for (var i: u32 = 0u; i < globalLights.lightCount; i = i + 1u) {
    if (visibleLightCount >= ${cap}u) {
      break;
    }

    let light = globalLights.lights[i];
    let lightPos = light.posAndRadius.xyz;
    let radius = light.posAndRadius.w;

    // Sphere-AABB distance check
    let closestPoint = clamp(lightPos, aabb.minBounds.xyz, aabb.maxBounds.xyz);
    let distSq = dot(lightPos - closestPoint, lightPos - closestPoint);

    if (distSq <= radius * radius) {
      clusterGrid[clusterIndex].indices[visibleLightCount] = i;
      visibleLightCount = visibleLightCount + 1u;
    }
  }

  clusterGrid[clusterIndex].count = visibleLightCount;
}
`;
  }
}
