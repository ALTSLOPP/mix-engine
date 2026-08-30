import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Engine } from '../engine/Engine';
import type { TerrainField } from '../terrain/TerrainField';
import { FoliageMaterial } from './FoliageMaterial';

/**
 * FoliageSystem.ts — biome-aware vegetation for open worlds: instanced trees / bushes / rocks placed
 * where the world generator's biome splat + terrain say they belong (e.g. trees on gentle low-to-mid
 * lowland above the waterline, rocks on the rock layer / steep ground), streamed around the camera so
 * only nearby instances exist, and swayed by the global [[WindSystem]] via the FoliageMaterial vertex
 * shader. The placement kernel is PURE + Vitest-tested; this class is the THREE/streaming glue.
 */

export interface FoliageRule {
  layer: number;           // splat channel (0..3) that gates placement
  weightThreshold: number; // min layer weight 0..1
  maxSlope: number;        // max gradient magnitude (rise/run)
  minHeight: number;       // min terrain height (keeps trees out of the sea / off beaches)
  maxHeight: number;       // max terrain height (no trees on snowy peaks)
  density: number;         // candidate instances per square metre
  maxCount: number;
  minScale: number;
  maxScale: number;
}

export interface FoliageInstance { x: number; z: number; rotY: number; scale: number; }

/**
 * PURE placement kernel: scan a jittered grid over `region`, keeping candidates where the trigger
 * layer weight ≥ threshold, slope ≤ maxSlope, and height ∈ [minHeight, maxHeight].
 */
export function placeFoliage(
  rule: FoliageRule,
  region: { minX: number; maxX: number; minZ: number; maxZ: number },
  sampleWeight: (x: number, z: number, layer: number) => number,
  sampleSlope: (x: number, z: number) => number,
  sampleHeight: (x: number, z: number) => number,
  rng: () => number,
): FoliageInstance[] {
  const out: FoliageInstance[] = [];
  const spacing = 1 / Math.sqrt(Math.max(rule.density, 1e-5));
  for (let z = region.minZ; z < region.maxZ && out.length < rule.maxCount; z += spacing) {
    for (let x = region.minX; x < region.maxX && out.length < rule.maxCount; x += spacing) {
      const jx = x + (rng() - 0.5) * spacing;
      const jz = z + (rng() - 0.5) * spacing;
      if (sampleWeight(jx, jz, rule.layer) < rule.weightThreshold) continue;
      if (sampleSlope(jx, jz) > rule.maxSlope) continue;
      const h = sampleHeight(jx, jz);
      if (h < rule.minHeight || h > rule.maxHeight) continue;
      out.push({ x: jx, z: jz, rotY: rng() * Math.PI * 2, scale: rule.minScale + rng() * (rule.maxScale - rule.minScale) });
    }
  }
  return out;
}

// ── Procedural species geometry (low-poly, vertex-coloured so one draw call = a whole tree) ──
// Normalize every part to NON-INDEXED + {position, normal, color} (no uv). Crucial: Icosahedron/
// Polyhedron geometries are non-indexed while Cylinder is indexed — mergeGeometries refuses to mix
// the two (returns null → a null-geometry mesh that crashes the renderer), so convert up front.
function colorize(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  geo.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Merge parts, or fall back to the first part if the merge somehow fails (never returns null). */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (merged) return merged;
  console.warn('[FoliageSystem] geometry merge failed; using first part');
  return parts[0];
}
export function treeGeometry(): THREE.BufferGeometry {
  const trunk = colorize(new THREE.CylinderGeometry(0.13, 0.2, 1.8, 6), 0x6b4a2b).translate(0, 0.9, 0);
  const c1 = colorize(new THREE.IcosahedronGeometry(1.1, 1), 0x3f7a36).translate(0, 2.4, 0);
  const c2 = colorize(new THREE.IcosahedronGeometry(0.8, 1), 0x4d8c40).translate(0.4, 3.1, 0.2);
  const c3 = colorize(new THREE.IcosahedronGeometry(0.7, 1), 0x356b2e).translate(-0.35, 3.0, -0.25);
  return mergeParts([trunk, c1, c2, c3]);
}
export function bushGeometry(): THREE.BufferGeometry {
  const a = colorize(new THREE.IcosahedronGeometry(0.55, 1), 0x4a7d38).translate(0, 0.45, 0);
  const b = colorize(new THREE.IcosahedronGeometry(0.4, 1), 0x568a40).translate(0.3, 0.55, 0.15);
  return mergeParts([a, b]);
}
function rockGeometry(): THREE.BufferGeometry {
  return colorize(new THREE.IcosahedronGeometry(0.6, 0), 0x8a8178).scale(1, 0.7, 1).translate(0, 0.3, 0);
}

interface Species { name: string; rule: FoliageRule; mesh: THREE.InstancedMesh; material: FoliageMaterial; }

const UP = new THREE.Vector3(0, 1, 0);

export interface FoliagePopulateOptions { entityId?: number; density?: number; radius?: number; seed?: number; }

export class FoliageSystem {
  enabled = false;
  radius = 180;
  densityScale = 1;
  private field: TerrainField | null = null;
  private readonly species: Species[] = [];
  private readonly lastFocus = new THREE.Vector3(Infinity, 0, Infinity);
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3();
  private readonly _focus = new THREE.Vector3();
  private readonly _windDir = new THREE.Vector2();
  private seed = 0xf01a6e;

  constructor(private readonly engine: Engine) {
    engine.addUpdateHook((dt) => this.update(dt));
  }

  /** Build (or rebuild) the foliage instances over a terrain field's biomes. */
  populate(opts: FoliagePopulateOptions = {}): boolean {
    const field = opts.entityId !== undefined
      ? this.engine.terrain.field(opts.entityId as any)
      : this.engine.terrain.firstField();
    if (!field) { console.warn('[FoliageSystem] populate: no terrain field'); return false; }
    this.clear();
    this.field = field;
    if (opts.radius !== undefined) this.radius = opts.radius;
    if (opts.density !== undefined) this.densityScale = Math.max(0.05, opts.density);
    if (opts.seed !== undefined) this.seed = opts.seed >>> 0;

    this.addSpecies('tree', treeGeometry(),
      { layer: 0, weightThreshold: 0.45, maxSlope: 0.6, minHeight: 1.5, maxHeight: 95, density: 0.02, maxCount: 4000, minScale: 0.8, maxScale: 1.7 },
      { sway: 0.45, foliageHeight: 4 }, true);
    this.addSpecies('bush', bushGeometry(),
      { layer: 0, weightThreshold: 0.35, maxSlope: 0.85, minHeight: 0.6, maxHeight: 110, density: 0.05, maxCount: 6000, minScale: 0.5, maxScale: 1.1 },
      { sway: 0.22, foliageHeight: 1 }, true);
    this.addSpecies('rock', rockGeometry(),
      { layer: 2, weightThreshold: 0.45, maxSlope: 3.0, minHeight: 1.0, maxHeight: 9999, density: 0.02, maxCount: 4000, minScale: 0.5, maxScale: 1.8 },
      { sway: 0, foliageHeight: 1 }, false);

    this.enabled = true;
    this.lastFocus.set(Infinity, 0, Infinity);
    this.regenerate();
    return true;
  }

  private addSpecies(name: string, geo: THREE.BufferGeometry, rule: FoliageRule, matOpts: { sway: number; foliageHeight: number }, sway: boolean): void {
    const material = new FoliageMaterial({ sway: sway ? matOpts.sway : 0, foliageHeight: matOpts.foliageHeight });
    const mesh = new THREE.InstancedMesh(geo, material, rule.maxCount);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(rule.maxCount * 3), 3);
    this.field!.mesh.add(mesh);
    this.species.push({ name, rule, mesh, material });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const s of this.species) s.mesh.visible = on;
    if (on) this.lastFocus.set(Infinity, 0, Infinity);
  }

  clear(): void {
    for (const s of this.species) {
      s.mesh.removeFromParent();
      s.mesh.geometry.dispose();
      s.material.dispose();
    }
    this.species.length = 0;
    this.field = null;
  }

  private mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  regenerate(): void {
    const field = this.field;
    if (!field || this.species.length === 0) return;
    // Focus = camera in terrain-LOCAL space.
    this._focus.copy(this.engine.viewport.camera.position);
    field.mesh.worldToLocal(this._focus);
    const half = field.hm.half;
    const region = {
      minX: Math.max(-half, this._focus.x - this.radius), maxX: Math.min(half, this._focus.x + this.radius),
      minZ: Math.max(-half, this._focus.z - this.radius), maxZ: Math.min(half, this._focus.z + this.radius),
    };
    const sampleWeight = (x: number, z: number, layer: number) => this.weightAt(field, x, z, layer);
    const sampleSlope = (x: number, z: number) => this.slopeAt(field, x, z);
    const sampleHeight = (x: number, z: number) => field.hm.sampleLocal(x, z);

    for (let si = 0; si < this.species.length; si++) {
      const sp = this.species[si];
      const rng = this.mulberry(this.seed ^ (si * 2654435761));
      const scaled = { ...sp.rule, density: sp.rule.density * this.densityScale };
      const instances = placeFoliage(scaled, region, sampleWeight, sampleSlope, sampleHeight, rng);
      const n = Math.min(instances.length, sp.rule.maxCount);
      const tint = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const inst = instances[i];
        this._p.set(inst.x, field.hm.sampleLocal(inst.x, inst.z), inst.z);
        this._q.setFromAxisAngle(UP, inst.rotY);
        this._s.setScalar(inst.scale);
        this._m.compose(this._p, this._q, this._s);
        sp.mesh.setMatrixAt(i, this._m);
        const v = 0.82 + rng() * 0.3; // subtle per-instance brightness variation
        tint.setRGB(v, v, v);
        sp.mesh.setColorAt(i, tint);
      }
      sp.mesh.count = n;
      sp.mesh.instanceMatrix.needsUpdate = true;
      if (sp.mesh.instanceColor) sp.mesh.instanceColor.needsUpdate = true;
      sp.mesh.visible = this.enabled;
    }
  }

  private weightAt(field: TerrainField, x: number, z: number, layer: number): number {
    const res = field.splatMap.res;
    const u = (x + field.hm.half) / field.hm.size;
    const v = (z + field.hm.half) / field.hm.size;
    const si = Math.min(res - 1, Math.max(0, Math.floor(u * res)));
    const sj = Math.min(res - 1, Math.max(0, Math.floor(v * res)));
    return field.splatMap.weights[(sj * res + si) * 4 + layer] / 255;
  }

  private slopeAt(field: TerrainField, x: number, z: number): number {
    const e = field.hm.step;
    const dx = (field.hm.sampleLocal(x + e, z) - field.hm.sampleLocal(x - e, z)) / (2 * e);
    const dz = (field.hm.sampleLocal(x, z + e) - field.hm.sampleLocal(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  private update(dt: number): void {
    if (!this.enabled || this.species.length === 0) return;
    const w = this.engine.wind;
    const strength = w ? w.current() : 1;
    if (w) this._windDir.copy(w.dir); else this._windDir.set(1, 0);
    for (const s of this.species) { s.material.setTime(w ? w.t : (s.material.uniforms.uTime.value + dt)); s.material.setWind(this._windDir, strength); }
    // Stream: regenerate when the camera (local) has moved a quarter of the radius.
    this._focus.copy(this.engine.viewport.camera.position);
    this.field!.mesh.worldToLocal(this._focus);
    if (this.lastFocus.distanceTo(this._focus) >= this.radius * 0.25) {
      this.lastFocus.copy(this._focus);
      this.regenerate();
    }
  }

  info(): object {
    const counts: Record<string, number> = {};
    for (const s of this.species) counts[s.name] = s.mesh.count;
    return { enabled: this.enabled, radius: this.radius, densityScale: this.densityScale, counts, hasField: !!this.field };
  }
}
