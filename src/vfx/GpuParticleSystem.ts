import * as THREE from 'three';
import { WebGPUContext } from '../rendering/webgpu/WebGPUContext';
import { WebGPURendererDriver } from '../rendering/webgpu/WebGPURendererDriver';
import { WebGPUComputeParticles, type ComputeParticleParams } from './WebGPUComputeParticles';

export interface GpuParticleStatus {
  supported: boolean;
  running: boolean;
  adapterName: string;
  maxParticles: number;
  dispatchedFrames: number;
  reason?: string;
}

/**
 * GpuParticleSystem.ts — the host that actually runs {@link WebGPUComputeParticles}.
 *
 * The WGSL simulation and the driver both existed, but nothing ever created the storage
 * buffer, built a bind group, or issued a dispatch — so the compute shader was a string
 * constant that never reached a GPU. This class owns the device lifecycle and the
 * per-frame dispatch, and reads the simulated positions back into an InstancedMesh so
 * the result is visible in the normal WebGL scene.
 *
 * Readback note: WebGPU compute and the WebGL renderer do not share memory, so the
 * positions come back over a staging buffer. That readback is asynchronous and is
 * deliberately throttled — it is the cost of running GPU compute alongside a WebGL
 * renderer, and it still beats simulating 100k particles on the CPU. A native WebGPU
 * render path (WebGPURendererDriver + a render pipeline) would remove it entirely.
 */
export class GpuParticleSystem {
  readonly sim: WebGPUComputeParticles;

  private readonly context: WebGPUContext;
  private readonly driver: WebGPURendererDriver;

  private particleBuffer: unknown = null;
  private paramsBuffer: unknown = null;
  private stagingBuffer: unknown = null;
  private pipeline: unknown = null;
  private bindGroup: unknown = null;

  private initialized = false;
  private running = false;
  private readbackInFlight = false;
  private dispatchedFrames = 0;
  private failureReason: string | undefined;

  /** Instanced points the readback drives. Added to the scene by {@link mount}. */
  private points: THREE.Points | null = null;
  private positionAttribute: THREE.BufferAttribute | null = null;

  private readonly emitterPos = new THREE.Vector3();
  private readonly params: Required<Pick<ComputeParticleParams, 'gravity' | 'drag' | 'curlNoiseStrength'>>;

  /** Bytes per particle in the storage buffer: two vec4<f32>. */
  static readonly PARTICLE_STRIDE = 32;
  /** SimParams: 4 scalars + 2 vec4, padded to 16-byte alignment. */
  static readonly PARAMS_BYTES = 64;
  static readonly WORKGROUP_SIZE = 64;

  constructor(params: ComputeParticleParams = {}) {
    this.sim = new WebGPUComputeParticles(params);
    this.context = WebGPUContext.getInstance();
    this.driver = new WebGPURendererDriver(this.context);
    this.params = {
      gravity: params.gravity ?? [0, -9.81, 0],
      drag: params.drag ?? 0.1,
      curlNoiseStrength: params.curlNoiseStrength ?? 1.5,
    };
  }

  status(): GpuParticleStatus {
    const caps = this.context.getCapabilities();
    return {
      supported: caps.supported,
      running: this.running,
      adapterName: caps.adapterName,
      maxParticles: this.sim.maxParticles,
      dispatchedFrames: this.dispatchedFrames,
      reason: this.failureReason,
    };
  }

  /**
   * Negotiate a device, allocate buffers, and compile the compute pipeline.
   * @returns false (with `status().reason` set) when WebGPU is unavailable — callers
   *          should fall back to the CPU ParticleEmitter rather than showing nothing.
   */
  async init(): Promise<boolean> {
    if (this.initialized) return this.running;

    if (!WebGPUContext.isAvailable()) {
      this.failureReason = 'WebGPU not available in this runtime';
      this.initialized = true;
      return false;
    }
    const ok = this.context.isReady || (await this.context.init('high-performance'));
    if (!ok) {
      this.failureReason = 'WebGPU adapter/device request failed';
      this.initialized = true;
      return false;
    }

    const byteLength = this.sim.maxParticles * GpuParticleSystem.PARTICLE_STRIDE;
    this.particleBuffer = this.driver.createStorageBuffer(byteLength, 'MIX_Particles');
    this.paramsBuffer = this.driver.createUniformBuffer(GpuParticleSystem.PARAMS_BYTES, 'MIX_SimParams');
    if (!this.particleBuffer || !this.paramsBuffer) {
      this.failureReason = 'buffer allocation failed';
      this.initialized = true;
      return false;
    }

    // Seed the simulation state.
    this.driver.writeBuffer(this.particleBuffer, this.sim.createInitialParticleBuffer());

    this.pipeline = this.driver.createComputePipeline(
      WebGPUComputeParticles.getParticleComputeShader(),
      'main',
      'MIX_ParticleSim',
    );
    if (!this.pipeline) {
      this.failureReason = 'compute pipeline creation failed';
      this.initialized = true;
      return false;
    }

    const device = this.driver.device;
    // MAP_READ (0x1) | COPY_DST (0x8) — the staging buffer the readback lands in.
    this.stagingBuffer = device.createBuffer({
      size: byteLength,
      usage: 0x1 | 0x8,
      label: 'MIX_ParticleStaging',
    });

    const pipeline = this.pipeline as { getBindGroupLayout(index: number): unknown };
    this.bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.paramsBuffer } },
      ],
      label: 'MIX_ParticleBindGroup',
    });

    this.initialized = true;
    this.running = true;
    this.failureReason = undefined;
    return true;
  }

  /** Create the render proxy and add it to the scene. Safe before {@link init}. */
  mount(scene: THREE.Scene, material?: THREE.PointsMaterial): THREE.Points {
    if (this.points) return this.points;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.sim.maxParticles * 3);
    this.positionAttribute = new THREE.BufferAttribute(positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setDrawRange(0, this.sim.maxParticles);
    // A far-away bounding sphere avoids per-frame recomputation; the particles are
    // simulated in world space and we never want them frustum-culled mid-burst.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.points = new THREE.Points(
      geometry,
      material ?? new THREE.PointsMaterial({ size: 0.08, transparent: true, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.points.name = 'gpu_particles';
    scene.add(this.points);
    return this.points;
  }

  setEmitterPosition(x: number, y: number, z: number): void {
    this.emitterPos.set(x, y, z);
  }

  /** Per-frame: upload sim params, dispatch, and kick a readback if none is pending. */
  update(dt: number): void {
    if (!this.running || dt <= 0) return;

    const params = new ArrayBuffer(GpuParticleSystem.PARAMS_BYTES);
    const f32 = new Float32Array(params);
    const u32 = new Uint32Array(params);
    f32[0] = dt;
    f32[1] = this.params.drag;
    f32[2] = this.params.curlNoiseStrength;
    u32[3] = this.sim.maxParticles;
    // vec4 members are 16-byte aligned, so gravity starts at float offset 4.
    f32[4] = this.params.gravity[0];
    f32[5] = this.params.gravity[1];
    f32[6] = this.params.gravity[2];
    f32[8] = this.emitterPos.x;
    f32[9] = this.emitterPos.y;
    f32[10] = this.emitterPos.z;
    this.driver.writeBuffer(this.paramsBuffer, new Uint8Array(params));

    const workgroups = Math.ceil(this.sim.maxParticles / GpuParticleSystem.WORKGROUP_SIZE);
    this.driver.dispatchCompute(this.pipeline, this.bindGroup, workgroups);
    this.dispatchedFrames++;

    if (this.positionAttribute && !this.readbackInFlight) {
      void this.readback();
    }
  }

  stop(): void {
    this.running = false;
  }

  dispose(): void {
    this.running = false;
    for (const buf of [this.particleBuffer, this.paramsBuffer, this.stagingBuffer]) {
      const b = buf as { destroy?: () => void } | null;
      if (b && typeof b.destroy === 'function') b.destroy();
    }
    this.particleBuffer = null;
    this.paramsBuffer = null;
    this.stagingBuffer = null;
    this.pipeline = null;
    this.bindGroup = null;
    if (this.points) {
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.points.removeFromParent();
      this.points = null;
    }
  }

  /**
   * Copy simulated positions back into the render proxy. One readback is in flight at a
   * time; frames that arrive while one is pending simply reuse the last positions,
   * which is imperceptible at 60fps and keeps the GPU queue from backing up.
   */
  private async readback(): Promise<void> {
    if (!this.stagingBuffer || !this.positionAttribute) return;
    this.readbackInFlight = true;
    try {
      const device = this.driver.device;
      const byteLength = this.sim.maxParticles * GpuParticleSystem.PARTICLE_STRIDE;
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(this.particleBuffer, 0, this.stagingBuffer, 0, byteLength);
      device.queue.submit([encoder.finish()]);

      const staging = this.stagingBuffer as {
        mapAsync(mode: number): Promise<void>;
        getMappedRange(): ArrayBuffer;
        unmap(): void;
      };
      await staging.mapAsync(0x1); // GPUMapMode.READ
      const src = new Float32Array(staging.getMappedRange());
      const dst = this.positionAttribute.array as Float32Array;
      for (let i = 0; i < this.sim.maxParticles; i++) {
        const s = i * 8; // 8 floats per particle
        const d = i * 3;
        dst[d] = src[s];
        dst[d + 1] = src[s + 1];
        dst[d + 2] = src[s + 2];
      }
      staging.unmap();
      this.positionAttribute.needsUpdate = true;
    } catch (err) {
      // A failed readback disables the visual proxy but must not stop the simulation
      // or take down the frame.
      console.warn('[GpuParticleSystem] readback failed:', err);
    } finally {
      this.readbackInFlight = false;
    }
  }
}
