import { WebGPUContext } from './WebGPUContext';

export interface StorageBufferDescriptor {
  size: number;
  label?: string;
  usage?: number; // GPUBufferUsage flags
}

/**
 * WebGPURendererDriver.ts — Modern WebGPU graphics and compute pipeline driver.
 * Abstracts storage buffers, uniform buffers, and compute dispatches.
 */
export class WebGPURendererDriver {
  private readonly context: WebGPUContext;

  constructor(context?: WebGPUContext) {
    this.context = context ?? WebGPUContext.getInstance();
  }

  get device(): any {
    return this.context.gpuDevice;
  }

  get isSupported(): boolean {
    return this.context.isReady;
  }

  /**
   * Create a GPU storage buffer for compute shader read/write access.
   */
  createStorageBuffer(sizeBytes: number, label = 'StorageBuffer'): any {
    if (!this.device) return null;

    // GPUBufferUsage.STORAGE (0x80) | GPUBufferUsage.COPY_DST (0x8) | GPUBufferUsage.COPY_SRC (0x4)
    const usage = 0x80 | 0x8 | 0x4;
    return this.device.createBuffer({
      size: Math.max(16, sizeBytes),
      usage,
      label,
    });
  }

  /**
   * Create a GPU uniform buffer for constant data.
   */
  createUniformBuffer(sizeBytes: number, label = 'UniformBuffer'): any {
    if (!this.device) return null;

    // GPUBufferUsage.UNIFORM (0x40) | GPUBufferUsage.COPY_DST (0x8)
    const usage = 0x40 | 0x8;
    return this.device.createBuffer({
      size: Math.max(16, (sizeBytes + 255) & ~255), // Align to 256 bytes
      usage,
      label,
    });
  }

  /**
   * Upload CPU data into a GPU buffer via device queue.
   */
  writeBuffer(buffer: any, data: ArrayBufferView, offsetBytes = 0): void {
    if (!this.device || !buffer) return;
    this.device.queue.writeBuffer(buffer, offsetBytes, data.buffer, data.byteOffset, data.byteLength);
  }

  /**
   * Create a WGSL compute shader pipeline.
   */
  createComputePipeline(wgslCode: string, entryPoint = 'main', label = 'ComputePipeline'): any {
    if (!this.device) return null;

    const module = this.device.createShaderModule({
      code: wgslCode,
      label: `${label}_ShaderModule`,
    });

    return this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module,
        entryPoint,
      },
      label,
    });
  }

  /**
   * Encode and submit a compute dispatch.
   */
  dispatchCompute(
    pipeline: any,
    bindGroup: any,
    workgroupsX: number,
    workgroupsY = 1,
    workgroupsZ = 1,
  ): void {
    if (!this.device || !pipeline) return;

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    if (bindGroup) {
      passEncoder.setBindGroup(0, bindGroup);
    }
    passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
