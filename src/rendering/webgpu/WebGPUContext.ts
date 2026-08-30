export interface WebGPUCapabilities {
  supported: boolean;
  adapterName: string;
  maxStorageBufferSize: number;
  maxComputeWorkgroupSize: [number, number, number];
  maxComputeInvocations: number;
  features: string[];
  preferredFormat: string;
}

/**
 * WebGPUContext.ts — WebGPU graphics adapter negotiation, capability detection, and device lifecycle manager.
 * Provides fallback detection for environments where WebGPU is unavailable.
 */
export class WebGPUContext {
  private static instance: WebGPUContext | null = null;
  private device: any = null;
  private adapter: any = null;
  private isInitialized = false;

  static getInstance(): WebGPUContext {
    if (!this.instance) {
      this.instance = new WebGPUContext();
    }
    return this.instance;
  }

  /**
   * Check if WebGPU API is present in the current browser runtime.
   */
  static isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu !== undefined;
  }

  /**
   * Request adapter and initialize GPUDevice with high-performance profile.
   */
  async init(powerPreference: 'high-performance' | 'low-power' = 'high-performance'): Promise<boolean> {
    if (!WebGPUContext.isAvailable()) {
      return false;
    }

    try {
      const gpu = (navigator as any).gpu;
      this.adapter = await gpu.requestAdapter({ powerPreference });
      if (!this.adapter) {
        return false;
      }

      this.device = await this.adapter.requestDevice();
      this.isInitialized = true;
      return true;
    } catch (err) {
      console.warn('[WebGPUContext] Failed to initialize WebGPU device:', err);
      this.device = null;
      this.isInitialized = false;
      return false;
    }
  }

  get isReady(): boolean {
    return this.isInitialized && this.device !== null;
  }

  get gpuDevice(): any {
    return this.device;
  }

  get gpuAdapter(): any {
    return this.adapter;
  }

  /**
   * Query device capabilities and limits.
   */
  getCapabilities(): WebGPUCapabilities {
    if (!this.isReady || !this.adapter) {
      return {
        supported: false,
        adapterName: 'Unsupported (WebGL2 Fallback)',
        maxStorageBufferSize: 0,
        maxComputeWorkgroupSize: [0, 0, 0],
        maxComputeInvocations: 0,
        features: [],
        preferredFormat: 'rgba8unorm',
      };
    }

    const limits = this.device?.limits || {};
    const features: string[] = [];
    if (this.device?.features) {
      for (const f of this.device.features) {
        features.push(f);
      }
    }

    const gpu = (navigator as any).gpu;
    const preferredFormat = gpu?.getPreferredCanvasFormat ? gpu.getPreferredCanvasFormat() : 'bgra8unorm';

    return {
      supported: true,
      adapterName: this.adapter.name || 'WebGPU Graphics Adapter',
      maxStorageBufferSize: limits.maxStorageBufferBindingSize ?? 134217728, // 128MB default
      maxComputeWorkgroupSize: [
        limits.maxComputeWorkgroupSizeX ?? 256,
        limits.maxComputeWorkgroupSizeY ?? 256,
        limits.maxComputeWorkgroupSizeZ ?? 64,
      ],
      maxComputeInvocations: limits.maxComputeInvocationsPerWorkgroup ?? 256,
      features,
      preferredFormat,
    };
  }

  dispose(): void {
    if (this.device && typeof this.device.destroy === 'function') {
      this.device.destroy();
    }
    this.device = null;
    this.adapter = null;
    this.isInitialized = false;
  }
}
