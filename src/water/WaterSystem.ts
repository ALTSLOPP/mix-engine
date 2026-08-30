import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { WaterMaterial } from './WaterMaterial';
import { defaultWaves, gerstnerHeight, type GerstnerWave } from './gerstner';

export interface WaterOptions {
  /** 'ocean' follows the camera in XZ (looks infinite); 'lake' is a fixed finite body. */
  kind?: 'ocean' | 'lake';
  /** Water plane Y in WORLD space (default 0 — matches the world generator's sea level). */
  seaLevel?: number;
  size?: number;
  segments?: number;
  /** Fixed centre (world XZ) for a 'lake'. Ignored for 'ocean'. */
  position?: [number, number];
  waveScale?: number;
  choppiness?: number;
  foam?: number;
  opacity?: number;
  deepColor?: THREE.ColorRepresentation;
  shallowColor?: THREE.ColorRepresentation;
  foamColor?: THREE.ColorRepresentation;
}

interface WaterBody {
  mesh: THREE.Mesh;
  material: WaterMaterial;
  waves: GerstnerWave[];
  kind: 'ocean' | 'lake';
  seaLevel: number;
  spacing: number;
}

/** Build a flat grid directly in the XZ plane (y=0) so the mesh is only ever translated. */
function planeXZ(size: number, segments: number): THREE.BufferGeometry {
  const half = size / 2;
  const step = size / segments;
  const n = segments + 1;
  const pos = new Float32Array(n * n * 3);
  const nrm = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      pos[k * 3] = i * step - half;
      pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = j * step - half;
      nrm[k * 3 + 1] = 1; // placeholder up-normal; the shader overrides objectNormal
      uv[k * 2] = i / segments;
      uv[k * 2 + 1] = j / segments;
    }
  }
  const idx = new Uint32Array(segments * segments * 6);
  let t = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i, b = j * n + i + 1, c = (j + 1) * n + i, d = (j + 1) * n + i + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), size); // generous; we disable culling anyway
  return g;
}

/**
 * WaterSystem — Gerstner-wave water surfaces for open worlds. The 'ocean' body follows the camera
 * in XZ (snapped to the vertex lattice so the surface doesn't shimmer) and sits at a fixed sea
 * level, so it instantly rings the islands produced by `world_generate` (whose sea level is y=0).
 * Reflection comes for free from the scene environment (re-baked by the [[day/night]] cycle) plus
 * the SSR post pass. `sampleHeight` exposes the wave height for buoyancy, using the SAME pure math
 * the shader runs.
 */
export class WaterSystem {
  private readonly bodies: WaterBody[] = [];
  private primary: WaterBody | null = null;
  private time = 0;

  constructor(private readonly engine: Engine) {
    engine.addUpdateHook((dt) => this.update(dt));
  }

  get count(): number { return this.bodies.length; }
  hasWater(): boolean { return this.bodies.length > 0; }

  create(opts: WaterOptions = {}): WaterBody {
    const kind = opts.kind ?? 'ocean';
    const size = opts.size ?? (kind === 'ocean' ? 2000 : 200);
    const segments = Math.min(512, Math.max(16, opts.segments ?? (kind === 'ocean' ? 256 : 96)));
    const seaLevel = opts.seaLevel ?? 0;
    const waves = defaultWaves(opts.waveScale ?? 1, opts.choppiness ?? 0.6);

    const material = new WaterMaterial();
    material.setWaves(waves);
    if (opts.foam !== undefined) material.setFoam(opts.foam);
    if (opts.opacity !== undefined) material.opacity = opts.opacity;
    material.setColors(opts.deepColor, opts.shallowColor, opts.foamColor);

    const mesh = new THREE.Mesh(planeXZ(size, segments), material);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1; // draw after opaque terrain so transparency blends correctly
    const worldX = kind === 'lake' && opts.position ? opts.position[0] : 0;
    const worldZ = kind === 'lake' && opts.position ? opts.position[1] : 0;
    mesh.position.set(
      worldX - this.engine.worldOrigin.offset.x,
      seaLevel - this.engine.worldOrigin.offset.y,
      worldZ - this.engine.worldOrigin.offset.z,
    );
    mesh.userData.water = true;
    // Shift with the rest of engine space. This keeps the ocean beside the camera in
    // the same frame as an origin shift; update() re-snaps it on subsequent frames.
    mesh.userData.excludeFromOriginShift = false;
    this.engine.viewport.scene.add(mesh);

    const body: WaterBody = { mesh, material, waves, kind, seaLevel, spacing: size / segments };
    this.bodies.push(body);
    if (kind === 'ocean' || !this.primary) this.primary = body;
    return body;
  }

  /** Tune the primary body (or create an ocean if none exists). */
  set(opts: WaterOptions): WaterBody {
    const b = this.primary ?? this.create(opts);
    if (opts.seaLevel !== undefined) {
      b.seaLevel = opts.seaLevel;
      b.mesh.position.y = opts.seaLevel - this.engine.worldOrigin.offset.y;
    }
    if (opts.waveScale !== undefined || opts.choppiness !== undefined) {
      b.waves = defaultWaves(opts.waveScale ?? 1, opts.choppiness ?? 0.6);
      b.material.setWaves(b.waves);
    }
    if (opts.foam !== undefined) b.material.setFoam(opts.foam);
    if (opts.opacity !== undefined) b.material.opacity = opts.opacity;
    b.material.setColors(opts.deepColor, opts.shallowColor, opts.foamColor);
    return b;
  }

  removeAll(): void {
    for (const b of this.bodies) this.disposeBody(b);
    this.bodies.length = 0;
    this.primary = null;
  }

  private disposeBody(b: WaterBody): void {
    b.mesh.removeFromParent();
    b.mesh.geometry.dispose();
    b.material.dispose();
  }

  /** World-space water surface height at (worldX,worldZ) — for buoyancy / floating objects. */
  sampleHeight(worldX: number, worldZ: number): number {
    const b = this.primary;
    if (!b) return 0;
    return b.seaLevel + gerstnerHeight(worldX, worldZ, this.time, b.waves);
  }

  info(): object {
    return {
      bodies: this.bodies.length,
      kinds: this.bodies.map((b) => b.kind),
      seaLevel: this.primary?.seaLevel ?? null,
      time: +this.time.toFixed(2),
    };
  }

  private update(dt: number): void {
    if (this.bodies.length === 0) return;
    this.time += dt;
    const cam = this.engine.viewport.camera;
    for (const b of this.bodies) {
      b.material.setTime(this.time);
      b.material.setWorldOffset(this.engine.worldOrigin.offset.x, this.engine.worldOrigin.offset.z);
      if (b.kind === 'ocean') {
        // Snap the follow position to the vertex lattice so the surface doesn't shimmer/swim.
        b.mesh.position.x = Math.round(cam.position.x / b.spacing) * b.spacing;
        b.mesh.position.z = Math.round(cam.position.z / b.spacing) * b.spacing;
        b.mesh.position.y = b.seaLevel - this.engine.worldOrigin.offset.y;
      }
    }
  }
}
