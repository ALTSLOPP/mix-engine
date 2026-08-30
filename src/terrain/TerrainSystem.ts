import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { EntityId } from '../ecs/SceneManager';
import { TerrainField } from './TerrainField';
import * as K from './Heightmap';
import { makeFbm, mulberry32 } from './noise';
import { TerrainHistory } from './TerrainHistory';
import { paintCircle } from './SplatMap';
import { splineConform } from './splineConform';
import { TerrainScatter } from './TerrainScatter';
import { buildWorld, CLIMATES, type WorldGenOptions } from './worldgen';

export interface TerrainCreateOpts {
  size?: number; resolution?: number; materialId?: string; seed?: number; baseNoiseAmplitude?: number;
}
export interface BrushSettings {
  radius: number; strength: number; hardness: number;
  targetHeight?: number; terraceStep?: number;
  amplitude?: number; frequency?: number; seed?: number; octaves?: number;
  erodeKind?: 'hydraulic' | 'thermal';
}
export type BrushOp = 'raise' | 'lower' | 'smooth' | 'flatten' | 'terrace' | 'ramp' | 'noise' | 'erode';

interface ErosionJob {
  field: TerrainField;
  region: K.DirtyRect;
  kind: 'hydraulic' | 'thermal';
  remaining: number;
  batch: number;
  opts: any;
  rng: () => number;
  pending: boolean;
  cancelled: boolean;
}

const HYDRAULIC_DEFAULTS = {
  maxLifetime: 30,
  inertia: 0.05,
  capacityFactor: 4,
  minCapacity: 0.01,
  depositSpeed: 0.3,
  erodeSpeed: 0.3,
  evaporateSpeed: 0.01,
  gravity: 4,
  erosionRadius: 3,
  startSpeed: 1,
  startWater: 1,
};

const STRENGTH_SCALE = 20;

export class TerrainSystem {
  private readonly fields = new Map<EntityId, TerrainField>();
  private readonly scatters = new Map<TerrainField, TerrainScatter>();
  private readonly erodeJobs: ErosionJob[] = [];
  private erosionModule: Promise<typeof import('./erosion')> | null = null;
  readonly history = new TerrainHistory();
  private lastEntityRevision = -1;
  private readonly _focus = new THREE.Vector3();

  constructor(private readonly engine: Engine) {
    engine.addUpdateHook((dt) => this.update(dt));
  }

  field(id: EntityId): TerrainField | null {
    if (this.fields.has(id)) return this.fields.get(id)!;
    const rb = this.engine.sceneManager.getRigidBody(id);
    if (rb && rb.mesh.userData.terrain) {
      this.fields.set(id, rb.mesh.userData.terrain);
      return rb.mesh.userData.terrain;
    }
    return null;
  }

  firstField(): TerrainField | null {
    for (const id of this.engine.sceneManager.allEntityIds()) {
      const field = this.field(id);
      if (field) return field;
    }
    return null;
  }

  /** Keep the field cache in sync with live entities so per-frame LOD/collider ticks reach every
   *  terrain (incl. deserialized ones never looked up) and drop terrains that were removed.
   *  Gated on entity-count change so it's O(1) on steady-state frames. */
  private syncFields(): void {
    const revision = this.engine.sceneManager.structuralRevision;
    if (revision === this.lastEntityRevision) return;
    this.lastEntityRevision = revision;
    const ids = this.engine.sceneManager.allEntityIds();
    const present = new Set(ids);
    for (const id of [...this.fields.keys()]) {
      if (present.has(id)) continue;
      const f = this.fields.get(id)!;
      this.scatters.get(f)?.dispose();   // free the removed terrain's scatter instances
      this.scatters.delete(f);
      for (let i = this.erodeJobs.length - 1; i >= 0; i--) {
        if (this.erodeJobs[i].field === f) {
          this.erodeJobs[i].cancelled = true;
          this.erodeJobs.splice(i, 1);
        }
      }
      this.fields.delete(id);
    }
    for (const id of ids) this.field(id); // populates the cache for any terrain entity
  }

  // --- Scatter (grass/pebbles) — lazily created per terrain. ---
  private scatterFor(f: TerrainField): TerrainScatter {
    let s = this.scatters.get(f);
    if (!s) { s = new TerrainScatter(f.hm, f.splatMap, f.mesh); this.scatters.set(f, s); }
    return s;
  }
  enableScatter(f: TerrainField, on: boolean): void { this.scatterFor(f).setEnabled(on); }
  setScatterDensity(f: TerrainField, scale: number): void { this.scatterFor(f).setDensityScale(scale); }
  regenScatter(f: TerrainField): void {
    const focus = f.mesh.worldToLocal(this.engine.viewport.camera.position.clone());
    this.scatterFor(f).regenerate(focus.x, focus.z);
  }
  scatterInfo(f: TerrainField): object { return this.scatters.get(f)?.info() ?? { enabled: false }; }

  create(world: THREE.Vector3, opts: TerrainCreateOpts): EntityId {
    const id = this.engine.sceneManager.spawnNow(world, { kind: 'terrain', params: opts as any });
    this.field(id);
    return id;
  }

  sculptLocal(f: TerrainField, op: BrushOp, cx: number, cz: number, amount: number, s: BrushSettings): void {
    let r: K.DirtyRect | null = null;
    switch (op) {
      case 'raise': r = K.applyRaise(f.hm, cx, cz, s.radius, s.hardness, amount, 1); break;
      case 'lower': r = K.applyRaise(f.hm, cx, cz, s.radius, s.hardness, amount, -1); break;
      case 'smooth': r = K.applySmooth(f.hm, cx, cz, s.radius, s.hardness, amount); break;
      case 'flatten': r = K.applyFlatten(f.hm, cx, cz, s.radius, s.hardness, amount, s.targetHeight ?? 0, 0); break;
      case 'terrace': r = K.applyFlatten(f.hm, cx, cz, s.radius, s.hardness, amount, s.targetHeight ?? 0, s.terraceStep ?? 1); break;
    }
    if (r) f.applyRect(r);
  }

  rampLocal(f: TerrainField, localA: THREE.Vector3, localB: THREE.Vector3, width: number, hardness: number): void {
    const r = K.applyRamp(f.hm, localA, localB, width, hardness);
    f.applyRect(r);
  }

  noiseLocal(f: TerrainField, cx: number, cz: number, radius: number, amplitude: number, frequency: number, seed: number, octaves: number, hardness: number): void {
    const fbm = makeFbm(seed, octaves, 2, 0.5);
    const sampleH = (x: number, z: number) => fbm(x, z, frequency);
    const r = K.applyNoise(f.hm, cx, cz, radius, hardness, amplitude, sampleH);
    f.applyRect(r);
  }

  sculptWorld(f: TerrainField, op: BrushOp, worldX: number, worldZ: number, amount: number, s: BrushSettings): void {
    const enginePt = this.engine.worldOrigin.toEngineSpace(new THREE.Vector3(worldX, 0, worldZ));
    const localPt = f.mesh.worldToLocal(enginePt);
    this.sculptLocal(f, op, localPt.x, localPt.z, amount, s);
  }

  strokeWorld(f: TerrainField, op: BrushOp, worldPts: [number,number][], amount: number, s: BrushSettings): void {
    for (const [wx, wz] of worldPts) {
      this.sculptWorld(f, op, wx, wz, amount, s);
    }
  }

  rampWorld(f: TerrainField, fromW: [number,number,number], toW: [number,number,number], width: number, hardness: number): void {
    const engineFrom = this.engine.worldOrigin.toEngineSpace(new THREE.Vector3(fromW[0], fromW[1], fromW[2]));
    const localFrom = f.mesh.worldToLocal(engineFrom);
    const engineTo = this.engine.worldOrigin.toEngineSpace(new THREE.Vector3(toW[0], toW[1], toW[2]));
    const localTo = f.mesh.worldToLocal(engineTo);
    this.rampLocal(f, localFrom, localTo, width, hardness);
  }

  noiseWorld(f: TerrainField, worldX: number, worldZ: number, radius: number, amplitude: number, frequency: number, seed: number, octaves: number, hardness: number): void {
    const enginePt = this.engine.worldOrigin.toEngineSpace(new THREE.Vector3(worldX, 0, worldZ));
    const localPt = f.mesh.worldToLocal(enginePt);
    this.noiseLocal(f, localPt.x, localPt.z, radius, amplitude, frequency, seed, octaves, hardness);
  }

  erode(f: TerrainField, region: {i0:number;i1:number;j0:number;j1:number}, kind: 'hydraulic'|'thermal', opts: any): void {
    opts ??= {};
    const total = opts.iterations ?? (kind === 'hydraulic' ? 50000 : 20);
    const normalizedOpts = kind === 'hydraulic'
      ? { ...HYDRAULIC_DEFAULTS, ...opts, iterations: total }
      : { talus: 0.7, factor: 0.5, ...opts, iterations: total };
    this.erodeJobs.push({
      field: f,
      region,
      kind,
      remaining: total,
      batch: kind === 'hydraulic' ? 2000 : 1, // thermal does a full pass per iter
      opts: normalizedOpts,
      rng: mulberry32(normalizedOpts.seed ?? 1),
      pending: false,
      cancelled: false,
    });
  }

  sampleHeightWorld(f: TerrainField, worldX: number, worldZ: number): number {
    const enginePt = this.engine.worldOrigin.toEngineSpace(new THREE.Vector3(worldX, 0, worldZ));
    const localPt = f.mesh.worldToLocal(enginePt);
    const localH = f.hm.sampleLocal(localPt.x, localPt.z);
    const wp = localPt.clone();
    wp.y = localH;
    // localToWorld yields ENGINE space; convert back to WORLD so the returned height is correct even
    // when the floating origin has a non-zero Y offset (otherwise this returned engineY = worldY − offset.y).
    return this.engine.worldOrigin.toWorldSpace(f.mesh.localToWorld(wp)).y;
  }

  raycastLocal(f: TerrainField, raycaster: THREE.Raycaster, out: THREE.Vector3): boolean {
    const r = raycaster.ray.clone();
    r.applyMatrix4(f.mesh.matrixWorld.clone().invert());
    const half = f.hm.half;
    const step = 0.5;
    const p = r.origin.clone();
    const dir = r.direction.clone().multiplyScalar(step);
    for (let i = 0; i < 400; i++) {
      p.add(dir);
      if (Math.abs(p.x) > half || Math.abs(p.z) > half) continue;
      if (p.y <= f.hm.sampleLocal(p.x, p.z)) {
        out.copy(p);
        return true;
      }
    }
    return false;
  }

  paintLocal(f: TerrainField, layer: number, cx: number, cz: number, s: BrushSettings): void {
    // Synchronous: paintCircle is a cheap pure kernel, so painting must land THIS frame (the old
    // dynamic import() deferred each dab to a microtask, which janked rapid strokes).
    paintCircle(f.splatMap.weights, f.splatMap.res, f.hm.size, layer, cx, cz, s.radius, s.hardness, s.strength);
    f.splatMap.texture.needsUpdate = true;
  }

  paintWorld(f: TerrainField, layer: number, worldX: number, worldZ: number, s: BrushSettings): void {
    const enginePt = this.engine.worldOrigin.toEngineSpace(new THREE.Vector3(worldX, 0, worldZ));
    const localPt = f.mesh.worldToLocal(enginePt);
    this.paintLocal(f, layer, localPt.x, localPt.z, s);
  }

  splineConformWorld(
    f: TerrainField, worldPoints: THREE.Vector3[], radius: number, hardness = 0.5,
    opts?: { mode?: 'flatten' | 'carve'; smooth?: boolean },
  ): void {
    const localPoints = worldPoints.map(wp => {
      const ep = this.engine.worldOrigin.toEngineSpace(wp.clone());
      return f.mesh.worldToLocal(ep);
    });
    // Synchronous (pure kernel) so the conform + collider/chunk dirtying happen this frame.
    splineConform(f, localPoints, radius, hardness, opts);
  }

  reset(f: TerrainField): void {
    f.hm.heights.fill(0);
    f.applyRect({ i0: 0, i1: f.hm.res - 1, j0: 0, j1: f.hm.res - 1 });
    f.markColliderDirty();
  }

  /**
   * Procedurally generate an ENTIRE open world over an existing terrain field from a seed:
   * fractal continents + ridged mountains → heights, biome classification → splat texture,
   * climate palette → the 4 material layers, then enable + stream grass/pebble scatter.
   * Pure generation lives in worldgen.ts (Vitest-tested); this is the live-field glue.
   * Returns the world stats (height range, water fraction, biome histogram).
   */
  generateWorld(f: TerrainField, opts: WorldGenOptions = {}): object {
    const { heights, weights, stats } = buildWorld(f.hm.res, f.hm.size, f.splatMap.res, opts);

    // Heights → mesh (all chunks dirty, rebuilt this frame) + collider (immediate, one-shot).
    f.hm.heights.set(heights);
    f.applyRect({ i0: 0, i1: f.hm.res - 1, j0: 0, j1: f.hm.res - 1 });
    f.rebuildCollider();

    // Biome splat → material blend texture.
    f.splatMap.weights.set(weights);
    f.splatMap.texture.needsUpdate = true;

    // Climate palette → recolour the 4 splat layers so the biome logic reads as the chosen climate.
    const palette = CLIMATES[opts.climate ?? 'temperate'];
    const mat = f.material as { setLayerTexture?: (layer: number, tex: THREE.Texture, repeat?: number) => void };
    if (mat.setLayerTexture) {
      for (let l = 0; l < 4; l++) {
        const [r, g, b] = palette[l];
        mat.setLayerTexture(l, TerrainSystem.solidTexture(r, g, b), 24);
      }
    }

    // Grass (layer 0) + pebble (layer 2) scatter come alive across the generated biomes.
    this.enableScatter(f, true);
    this.regenScatter(f);

    return stats;
  }

  /** 1×1 sRGB DataTexture — a flat layer colour for procedurally-recoloured terrain layers. */
  private static solidTexture(r: number, g: number, b: number): THREE.DataTexture {
    const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.userData.terrainOwned = true;
    return tex;
  }

  private update(dt: number): void {
    this.engine.tools.active?.tick?.(dt);   // brush dab → applyRect marks the touched chunks dirty
    this.syncFields();

    // Background, debounced collider rebuild: at most one field per frame, so a burst of dabs
    // or erosion ticks coalesces into a single off-critical-path heightfield rebuild instead of
    // the old synchronous full-trimesh rebuild on every stroke-end. Run before the erosion
    // block so it isn't skipped by that block's early `return` while an import is pending.
    for (const f of this.fields.values()) {
      if (f.tickColliderRebuild(dt)) break;
    }

    // Phase 2: chunked-LOD render update — pick each chunk's LOD by camera distance and rebuild
    // dirty chunks (incl. ones just sculpted by the tool tick above, so editing stays live).
    const camera = this.engine.viewport.camera;
    for (const f of this.fields.values()) f.updateLOD(camera);

    // Phase 2b: per-chunk collider streaming (when enabled, each terrain's collider is a grid of
    // heightfields with bounded rebuild cost and eviction; integrates with ChunkManager's world
    // streaming radius via the same camera world pos).
    {
      const camWorld = new THREE.Vector3();
      this.engine.worldOrigin.toWorldSpaceInto(camWorld, camera.position);
      for (const f of this.fields.values()) f.updateColliderStreaming(camWorld, this.engine.worldOrigin.offset);
    }

    // Phase 3: stream grass/pebble scatter around the camera (re-placed only when it moves enough).
    if (this.scatters.size > 0) {
      for (const [field, scatter] of this.scatters) {
        if (!scatter.enabled) continue;
        this._focus.copy(camera.position);
        field.mesh.worldToLocal(this._focus);
        scatter.update(this._focus);
      }
    }

    if (this.erodeJobs.length > 0) {
      const job = this.erodeJobs[0];
      if (job.pending) return;

      const iter = Math.min(job.remaining, job.batch);
      job.pending = true;
      this.erosionModule ??= import('./erosion');
      this.erosionModule.then(e => {
        if (job.cancelled || job.field.isDisposed) return;
        if (job.kind === 'hydraulic') {
          e.erodeHydraulic(job.field.hm.heights, job.field.hm.res, { ...job.opts, iterations: iter }, job.rng!, job.region);
        } else {
          e.erodeThermal(job.field.hm.heights, job.field.hm.res, job.opts.talus ?? 0.7, job.opts.factor ?? 0.5, iter, job.region);
        }
        job.field.applyRect(job.region);
        job.remaining -= iter;
        if (job.remaining <= 0) {
          const index = this.erodeJobs.indexOf(job);
          if (index !== -1) this.erodeJobs.splice(index, 1);
          job.field.markColliderDirty();
        }
      }).catch((err) => {
        const index = this.erodeJobs.indexOf(job);
        if (index !== -1) this.erodeJobs.splice(index, 1);
        console.warn('[TerrainSystem] erosion job failed:', err);
      }).finally(() => {
        job.pending = false;
      });
    }
  }
}
