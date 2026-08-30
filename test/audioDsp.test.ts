import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { IRGenerator } from '../src/audio/IRGenerator';
import { ReverbZoneSystem } from '../src/audio/ReverbZoneSystem';

describe('Environmental Audio DSP & Reverb Zones (S10)', () => {
  it('inserts a connected parallel wet/dry graph into the supplied master output', () => {
    const convolver = { connect: vi.fn(), disconnect: vi.fn(), buffer: null };
    const gains = [
      { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 0 } },
      { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 0 } },
    ];
    const context = {
      createConvolver: () => convolver,
      createGain: () => gains.shift()!,
    };
    const input = { connect: vi.fn(), disconnect: vi.fn() };
    const output = {};

    const reverb = new ReverbZoneSystem(context as any, input as any, output as any);

    expect(input.disconnect).toHaveBeenCalledOnce();
    expect(input.connect).toHaveBeenCalledTimes(2);
    expect(convolver.connect).toHaveBeenCalledOnce();
    reverb.dispose();
  });
  it('generates algorithmic impulse response buffer via IRGenerator', () => {
    // Mock BaseAudioContext
    const mockCtx = {
      sampleRate: 44100,
      createBuffer: (channels: number, length: number, sampleRate: number) => {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: (ch: number) => data[ch],
        } as unknown as AudioBuffer;
      },
    } as unknown as BaseAudioContext;

    const buffer = IRGenerator.generate(mockCtx, {
      duration: 1.0,
      decay: 3.0,
      preDelay: 0.01,
      diffusion: 0.7,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.length).toBe(44100);

    const left = buffer.getChannelData(0);
    // Samples within preDelay should be zero
    expect(left[0]).toBe(0);
    expect(left[10]).toBe(0);

    // Later samples should have energy
    const lateSample = Math.abs(left[2000]);
    expect(lateSample).toBeGreaterThan(0);
  });

  it('detects listener containment in ReverbZoneSystem and blends wet/dry', () => {
    const reverb = new ReverbZoneSystem();

    reverb.addZone({
      id: 'cave',
      name: 'Deep Cave',
      min: new THREE.Vector3(-10, 0, -10),
      max: new THREE.Vector3(10, 10, 10),
      params: { duration: 3.5, decay: 1.5 },
      wet: 0.8,
    });

    // 1. Listener outside
    reverb.update(new THREE.Vector3(50, 0, 50), 0.1);
    expect(reverb.getActiveZone()).toBeNull();
    expect(reverb.getCurrentWet()).toBe(0);

    // 2. Listener enters cave
    reverb.update(new THREE.Vector3(0, 5, 0), 1.0);
    expect(reverb.getActiveZone()?.id).toBe('cave');
    expect(reverb.getCurrentWet()).toBeGreaterThan(0.5);

    // 3. Remove zone
    reverb.removeZone('cave');
    expect(reverb.getZone('cave')).toBeUndefined();
  });
});
