import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FrameProfiler } from '../src/diagnostics/FrameProfiler';

describe('FrameProfiler timeline and VRAM tracking', () => {
  it('captures named slices and renderer counters', () => {
    const profiler = new FrameProfiler();
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const renderer = {
      info: { render: { calls: 4, triangles: 12 }, memory: { geometries: 1, textures: 0 } },
    } as THREE.WebGLRenderer;
    profiler.beginFrame(10);
    profiler.mark('simulation', 12);
    const frame = profiler.endFrame(renderer, scene, 15)!;
    expect(frame.frameMs).toBe(5);
    expect(frame.slices).toEqual([{ name: 'simulation', ms: 2 }, { name: 'render', ms: 3 }]);
    expect(frame.drawCalls).toBe(4);
    expect(frame.estimatedVramBytes).toBeGreaterThan(0);
  });
});
