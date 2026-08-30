import * as THREE from 'three';

export interface FrameSlice { name: string; ms: number; }
export interface FrameProfile {
  timestamp: number;
  frameMs: number;
  slices: FrameSlice[];
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  estimatedVramBytes: number;
}

/** Low-overhead frame timeline plus conservative GPU-memory estimator. */
export class FrameProfiler {
  enabled = true;
  maxFrames = 180;
  private frames: FrameProfile[] = [];
  private frameStart = 0;
  private lastMark = 0;
  private slices: FrameSlice[] = [];

  beginFrame(now = performance.now()): void {
    if (!this.enabled) return;
    this.frameStart = now;
    this.lastMark = now;
    this.slices = [];
  }

  mark(name: string, now = performance.now()): void {
    if (!this.enabled || this.frameStart === 0) return;
    this.slices.push({ name, ms: now - this.lastMark });
    this.lastMark = now;
  }

  endFrame(renderer: THREE.WebGLRenderer, scene: THREE.Scene, now = performance.now()): FrameProfile | null {
    if (!this.enabled || this.frameStart === 0) return null;
    this.mark('render', now);
    const memory = FrameProfiler.estimateVram(scene);
    const profile: FrameProfile = {
      timestamp: now,
      frameMs: now - this.frameStart,
      slices: this.slices,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      estimatedVramBytes: memory,
    };
    this.frames.push(profile);
    if (this.frames.length > this.maxFrames) this.frames.splice(0, this.frames.length - this.maxFrames);
    this.frameStart = 0;
    return profile;
  }

  latest(): FrameProfile | null { return this.frames.at(-1) ?? null; }
  history(limit = 60): FrameProfile[] { return this.frames.slice(-Math.max(1, limit)); }
  clear(): void { this.frames = []; }

  static estimateVram(scene: THREE.Scene): number {
    const geometries = new Set<THREE.BufferGeometry>();
    const textures = new Set<THREE.Texture>();
    let bytes = 0;
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry && !geometries.has(mesh.geometry)) {
        geometries.add(mesh.geometry);
        for (const attribute of Object.values(mesh.geometry.attributes)) bytes += attribute.array.byteLength;
        if (mesh.geometry.index) bytes += mesh.geometry.index.array.byteLength;
      }
      const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          const texture = value as THREE.Texture;
          if (!texture?.isTexture || textures.has(texture)) continue;
          textures.add(texture);
          const image = texture.image as { width?: number; height?: number; depth?: number } | undefined;
          const width = image?.width ?? 0, height = image?.height ?? 0, depth = image?.depth ?? 1;
          // RGBA8 base level plus a 4/3 mip-chain allowance when mipmaps are enabled.
          bytes += width * height * depth * 4 * (texture.generateMipmaps ? 4 / 3 : 1);
        }
      }
    });
    return Math.ceil(bytes);
  }
}
