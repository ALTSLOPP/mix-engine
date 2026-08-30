import { describe, it, expect } from 'vitest';
import { WebGPUContext } from '../src/rendering/webgpu/WebGPUContext';
import { WebGPURendererDriver } from '../src/rendering/webgpu/WebGPURendererDriver';

describe('WebGPUContext & WebGPURendererDriver', () => {
  it('detects WebGPU availability and provides safe fallback capabilities', () => {
    const ctx = WebGPUContext.getInstance();
    expect(ctx).toBeDefined();

    const caps = ctx.getCapabilities();
    expect(caps).toBeDefined();
    expect(typeof caps.supported).toBe('boolean');
    expect(caps.preferredFormat).toBeDefined();
  });

  it('driver handles buffer creation and compute pipeline requests safely', () => {
    const driver = new WebGPURendererDriver();
    expect(driver.isSupported).toBe(false); // In Node test environment

    // Must return null instead of throwing in headless/unsupported environments
    const storageBuf = driver.createStorageBuffer(1024);
    expect(storageBuf).toBeNull();

    const uniformBuf = driver.createUniformBuffer(256);
    expect(uniformBuf).toBeNull();
  });
});
