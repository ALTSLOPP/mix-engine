import * as THREE from 'three';
import type { Heightmap } from './Heightmap';
import type { SplatMap } from './SplatMap';
import { mulberry32 } from './noise';

/**
 * TerrainScatter.ts — automated grass/pebble scattering (Phase 3 QoL). Instances are placed where a
 * trigger splat layer is dominant and the slope is gentle, via InstancedMesh, and STREAM around a
 * focus point (the camera) so only nearby instances exist. Parented under the terrain root, so they
 * ride the terrain transform + floating-origin shifts for free.
 */

export interface ScatterType {
  name: string;
  layer: number;           // splat channel (0..3) whose weight gates placement
  weightThreshold: number; // min layer weight 0..1
  maxSlope: number;        // max gradient magnitude (rise/run) — keeps grass off cliffs
  density: number;         // candidate instances per square metre
  maxCount: number;
  minScale: number;
  maxScale: number;
}

export interface ScatterInstance { x: number; z: number; rotY: number; scale: number; }

/**
 * PURE placement kernel (no THREE): scan a deterministic jittered grid over `region`, keeping
 * candidates where the trigger layer weight ≥ threshold and slope ≤ maxSlope. Vitest-tested.
 */
export function placeScatter(
  type: Pick<ScatterType, 'layer' | 'weightThreshold' | 'maxSlope' | 'density' | 'maxCount' | 'minScale' | 'maxScale'>,
  region: { minX: number; maxX: number; minZ: number; maxZ: number },
  sampleWeight: (x: number, z: number, layer: number) => number,
  sampleSlope: (x: number, z: number) => number,
  rng: () => number,
): ScatterInstance[] {
  const out: ScatterInstance[] = [];
  const spacing = 1 / Math.sqrt(Math.max(type.density, 1e-4));
  for (let z = region.minZ; z < region.maxZ && out.length < type.maxCount; z += spacing) {
    for (let x = region.minX; x < region.maxX && out.length < type.maxCount; x += spacing) {
      const jx = x + (rng() - 0.5) * spacing;
      const jz = z + (rng() - 0.5) * spacing;
      if (sampleWeight(jx, jz, type.layer) < type.weightThreshold) continue;
      if (sampleSlope(jx, jz) > type.maxSlope) continue;
      out.push({
        x: jx, z: jz,
        rotY: rng() * Math.PI * 2,
        scale: type.minScale + rng() * (type.maxScale - type.minScale),
      });
    }
  }
  return out;
}

/** Two crossed vertical quads — reads as a grass tuft from any angle (cheap, no billboarding). */
function grassGeometry(width = 0.6, height = 1.0): THREE.BufferGeometry {
  const w = width / 2;
  const pos = new Float32Array([
    -w, 0, 0,  w, 0, 0,  w, height, 0,  -w, height, 0,   // quad in XY
    0, 0, -w,  0, 0, w,  0, height, w,  0, height, -w,    // quad in ZY
  ]);
  const idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface ScatterLayer {
  type: ScatterType;
  mesh: THREE.InstancedMesh;
}

const UP = new THREE.Vector3(0, 1, 0);

export class TerrainScatter {
  enabled = false;
  radius = 120;                 // stream instances within this many metres of the focus
  densityScale = 1;
  private readonly layers: ScatterLayer[] = [];
  private readonly lastFocus = new THREE.Vector3(Infinity, 0, Infinity);
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3();

  constructor(
    private readonly hm: Heightmap,
    private readonly splatMap: SplatMap,
    private readonly root: THREE.Object3D,
  ) {
    this.addType(
      { name: 'grass', layer: 0, weightThreshold: 0.4, maxSlope: 0.7, density: 0.6, maxCount: 40000, minScale: 0.6, maxScale: 1.4 },
      grassGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    );
    this.addType(
      { name: 'pebble', layer: 2, weightThreshold: 0.4, maxSlope: 1.6, density: 0.08, maxCount: 8000, minScale: 0.1, maxScale: 0.35 },
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x8a8178, roughness: 1, metalness: 0 }),
    );
  }

  private addType(type: ScatterType, geometry: THREE.BufferGeometry, material: THREE.Material): void {
    const mesh = new THREE.InstancedMesh(geometry, material, type.maxCount);
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // matrices fill only near the focus, so the whole-object cull is unhelpful
    mesh.visible = false;
    this.root.add(mesh);
    this.layers.push({ type, mesh });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const l of this.layers) l.mesh.visible = on;
    if (on) this.lastFocus.set(Infinity, 0, Infinity); // force a regen on next update
  }

  setDensityScale(scale: number): void {
    this.densityScale = Math.max(0.05, scale);
    this.lastFocus.set(Infinity, 0, Infinity);
  }

  /** Per-frame: regenerate when the focus (camera, in terrain-LOCAL space) has moved enough. */
  update(focusLocal: THREE.Vector3): void {
    if (!this.enabled) return;
    if (this.lastFocus.distanceTo(focusLocal) < this.radius * 0.25) return;
    this.lastFocus.copy(focusLocal);
    this.regenerate(focusLocal.x, focusLocal.z);
  }

  /** Force an immediate (re)build of all scatter instances around a local focus. */
  regenerate(focusX: number, focusZ: number): void {
    const half = this.hm.half;
    const region = {
      minX: Math.max(-half, focusX - this.radius), maxX: Math.min(half, focusX + this.radius),
      minZ: Math.max(-half, focusZ - this.radius), maxZ: Math.min(half, focusZ + this.radius),
    };
    const sampleWeight = (x: number, z: number, layer: number) => this.weightAt(x, z, layer);
    const sampleSlope = (x: number, z: number) => this.slopeAt(x, z);

    for (let li = 0; li < this.layers.length; li++) {
      const { type, mesh } = this.layers[li];
      const rng = mulberry32(0x5ca77e ^ (li * 2654435761));
      const scaled = { ...type, density: type.density * this.densityScale };
      const instances = placeScatter(scaled, region, sampleWeight, sampleSlope, rng);
      const n = Math.min(instances.length, type.maxCount);
      for (let i = 0; i < n; i++) {
        const inst = instances[i];
        this._p.set(inst.x, this.hm.sampleLocal(inst.x, inst.z), inst.z);
        this._q.setFromAxisAngle(UP, inst.rotY);
        this._s.setScalar(inst.scale);
        this._m.compose(this._p, this._q, this._s);
        mesh.setMatrixAt(i, this._m);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = this.enabled;
    }
  }

  private weightAt(x: number, z: number, layer: number): number {
    const res = this.splatMap.res;
    const u = (x + this.hm.half) / this.hm.size;
    const v = (z + this.hm.half) / this.hm.size;
    const si = Math.min(res - 1, Math.max(0, Math.floor(u * res)));
    const sj = Math.min(res - 1, Math.max(0, Math.floor(v * res)));
    return this.splatMap.weights[(sj * res + si) * 4 + layer] / 255;
  }

  private slopeAt(x: number, z: number): number {
    const e = this.hm.step;
    const dx = (this.hm.sampleLocal(x + e, z) - this.hm.sampleLocal(x - e, z)) / (2 * e);
    const dz = (this.hm.sampleLocal(x, z + e) - this.hm.sampleLocal(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  info(): { enabled: boolean; radius: number; densityScale: number; counts: Record<string, number> } {
    const counts: Record<string, number> = {};
    for (const l of this.layers) counts[l.type.name] = l.mesh.count;
    return { enabled: this.enabled, radius: this.radius, densityScale: this.densityScale, counts };
  }

  dispose(): void {
    for (const l of this.layers) {
      l.mesh.removeFromParent();
      l.mesh.dispose();
      l.mesh.geometry.dispose();
      (l.mesh.material as THREE.Material).dispose();
    }
    this.layers.length = 0;
  }
}
