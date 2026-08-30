# MIX Engine — Viewport Terrain Sculpting Brushes

**Assignment spec for a junior developer.** Read this whole document once before writing any
code. It is written so that if you follow it section by section you cannot get the integration
wrong. Every integration point names a real file, class, and method that already exists in this
repo (I verified them against the current source).

- **Engine stack:** TypeScript · Vite · Three.js **r0.170.0** · Rapier3D (`@dimforge/rapier3d-compat` 0.14)
- **Authoritative engine spec:** [`MIX-Engine-Plan-final_2.md`](MIX-Engine-Plan-final_2.md)
- **Tests:** Vitest (`npm test`, files under `test/*.test.ts`)
- **Run:** `npm run dev` (browser) or `run.bat` (Tauri desktop)

---

## 0. What you are building and why it is shaped this way

You are adding a **terrain heightmap system** and a set of **sculpting brushes** that edit it live
in the viewport:

1. **Raise / Lower** — push heightmap vertices up/down along Y with radius, strength, falloff (hardness).
2. **Smooth** — blur neighbouring heights together.
3. **Flatten / Terrace** — drive heights toward a sampled target (plateaus), or snap to stepped levels.
4. **Ramp** — linear slope between two clicked anchors (roads/paths).
5. **Erosion** — hydraulic (droplet) + thermal (talus) simulation that carves valleys/gullies.
6. **Noise / Roughness** — add fractal (fBm/Simplex) detail.

### The non-negotiable product constraint

This engine's whole identity is **"build 3D games using nothing but LLMs/IDEs."** Every editor
action already exists as a text command an AI can emit (see the `AICommand` union in
[`src/ai/AIBridge.ts`](src/ai/AIBridge.ts)). **Your brushes must work the same way.** The mouse
tool and the AI command **must call the exact same `TerrainSystem` methods** — the mouse is just
one front-end that generates terrain ops; the AI is another. Do **not** write brush logic that
only a `pointermove` handler can reach. This mirrors how HELM's `do` op is a non-invasive wrapper
over the same `AICommand` path the UI uses.

### What already exists (so you don't reinvent it)

| Concern | Already in repo | You reuse it |
| --- | --- | --- |
| Entity creation | `SceneManager.registerBuilder(kind, fn)` ([`src/ecs/SceneManager.ts:132`](src/ecs/SceneManager.ts)) | Register a new `'terrain'` builder |
| Physics body/mesh bridge | `RigidBodyComponent` ([`src/physics/RigidBodyComponent.ts`](src/physics/RigidBodyComponent.ts)) | Terrain is one of these (fixed body) |
| Trimesh collider | `PhysicsWorld.createTrimeshCollider(body, verts, indices)` ([`src/physics/PhysicsWorld.ts:143`](src/physics/PhysicsWorld.ts)) | Terrain collider |
| Per-frame work | `Engine.addUpdateHook(dt => …)` ([`src/engine/Engine.ts:240`](src/engine/Engine.ts)) | Continuous brush + erosion batches |
| Viewport picking pattern | `Engine.bindEditorInput` / `resolvePendingPick` ([`src/engine/Engine.ts:710`](src/engine/Engine.ts)) | Copy the raycast pattern; gate it when a brush is active |
| Floating origin | `WorldOrigin` ([`src/streaming/WorldOrigin.ts`](src/streaming/WorldOrigin.ts)) | Brush math is in **terrain-local space**, which is origin-invariant |
| AI command surface | `AICommand` union + `processQueue()` switch ([`src/ai/AIBridge.ts:459`](src/ai/AIBridge.ts)) | Add `terrain_*` commands |
| Capability manifest | `HELM_MANIFEST.commands` ([`src/helm/manifest.ts`](src/helm/manifest.ts)) | Document the new commands |
| Scene persistence | `serializeSceneState` / `deserializeSceneState` ([`src/main.ts:223`](src/main.ts)) | Persist the heightmap |
| CPU noise | `three/examples/jsm/math/SimplexNoise.js` (ships with three r0.170) | Noise brush (no new dependency) |
| Partial GPU upload | `BufferAttribute.addUpdateRange(start,count)` / `clearUpdateRanges()` (r0.170) | Upload only edited vertices |

### What does NOT exist yet

There is **no terrain today.** The "ground" is either a flat 50×50×0.5 `box` boot fixture (skipped
by the serializer, see [`src/main.ts:238`](src/main.ts)) or a GLB map backdrop (`mapModel` builder).
You are adding a brand-new subsystem under `src/terrain/`.

---

## 1. Architecture overview

### 1.1 New files (create these)

```
src/terrain/
  Heightmap.ts        # PURE data + grid math + brush kernels (no THREE imports). Unit-tested.
  noise.ts            # mulberry32 seeded PRNG + fBm over SimplexNoise. PURE. Unit-tested.
  erosion.ts          # PURE hydraulic (droplet) + thermal (talus) over a Float32Array. Unit-tested.
  TerrainField.ts     # THREE glue: builds the BufferGeometry, applies dirty rects to the GPU,
                      # recomputes normals for a rect, rebuilds the trimesh collider, owns the RigidBodyComponent.
  TerrainSystem.ts    # Orchestrator. Registry of terrains by EntityId. The single API the mouse
                      # tool AND the AI commands both call. Registers the engine update hook.
  TerrainBrushTool.ts # Viewport front-end: pointer pipeline, raycast to local grid, brush cursor,
                      # stroke spacing, undo snapshot. Implements the EditorTool interface.
  TerrainHistory.ts   # Tile-diff undo/redo (lightweight; NOT full-scene serialize per stroke).

src/engine/
  ToolManager.ts      # `active: EditorTool | null`. The engine consults it to suppress entity-pick.
```

### 1.2 Files you edit

```
src/engine/builders.ts   # Register the 'terrain' builder
src/engine/Engine.ts     # Construct TerrainSystem + ToolManager; gate pendingPick; expose engine.terrain
src/ai/AIBridge.ts       # Add terrain_* to AICommand union + switch cases + handlers + a `terrain` dep
src/helm/manifest.ts     # Document the terrain_* commands
src/main.ts              # Toolbar buttons + brush settings panel; persist heightmaps; route Ctrl+Z
test/terrain.test.ts     # Vitest unit tests for the pure modules
```

### 1.3 Data flow (one diagram, memorise it)

```
                         ┌─────────────────────────── same path ───────────────────────────┐
 Mouse drag ──▶ TerrainBrushTool ──┐                                                        │
                                   ├──▶ TerrainSystem.sculpt/stroke/ramp/noise/erode(...) ──▶ Heightmap kernels (PURE)
 AI command  ──▶ AIBridge.case ────┘                         │                                 │ returns a dirty rect {i0,i1,j0,j1}
 (terrain_sculpt …)                                          ▼                                 ▼
                                                     TerrainField.applyRect(rect) ── writes positions[] + normals for the rect,
                                                                                       BufferAttribute.addUpdateRange, refresh bounds
                                                          (on stroke END) ── TerrainField.rebuildCollider() (debounced)
```

**Golden rule:** brush math lives in `Heightmap.ts` (pure, returns which vertices changed).
`TerrainField` turns that into GPU + physics updates. `TerrainSystem` is the only thing both
front-ends talk to. Keep these layers separate or the feature becomes untestable.

---

## 2. Coordinate spaces & the grid (get this right first — everything depends on it)

There are three spaces. Mixing them up is the #1 way to mess this up.

1. **World space** — what the AI and serializer speak. `worldPos = enginePos + worldOrigin.offset`.
2. **Engine space** — what Three.js and Rapier hold live (kept near zero by floating origin). The
   camera, the raycaster, and `mesh.position` are all engine space.
3. **Terrain-local space** — the heightmap grid. The terrain mesh is centred on its own origin;
   vertex `(i,j)` sits at local `(x = i*step − half, y = height, z = j*step − half)`.

**Why local space saves you:** the brush always operates on the grid in **terrain-local** space.
You get there with `terrainMesh.worldToLocal(hitPointEngineSpace.clone())`, which uses the mesh's
`matrixWorld` and therefore *already accounts for the current floating-origin offset*. So **the
heightmap never needs re-baking when the origin shifts.** Do not store world coordinates in the
heightmap. Do not try to "correct" for the origin yourself.

### 2.1 Grid definitions (use these names everywhere)

| Symbol | Meaning | Default |
| --- | --- | --- |
| `res` | vertices per side | 257 |
| `cells` | `res − 1` (quads per side) | 256 |
| `size` | world metres per side | 256 |
| `step` | `size / cells` (metres between vertices) | 1.0 |
| `half` | `size / 2` | 128 |
| `idx(i,j)` | vertex index `= j * res + i`, with `i` = X column, `j` = Z row | — |
| `heights` | `Float32Array(res*res)`, **the heightmap** (height per vertex, metres) | — |

> **Pitfall:** `res` is the **vertex** count, `cells = res − 1` is the **quad** count. The position
> buffer has `res*res` vertices; the index buffer has `cells*cells*2` triangles. Off-by-one here
> produces a torn last row/column. Pick `res` so memory is sane: 257×257 ≈ 66k verts is a good
> default; 513 is the practical max for a single CPU-edited tile.

---

## 3. `Heightmap.ts` — pure data + brush kernels

No THREE imports. This is the unit-tested core. It owns the `heights` Float32Array and the grid
metadata, and exposes the brush kernels. Every kernel **returns the dirty rect** it touched so the
caller can update only that region.

```ts
export interface DirtyRect { i0: number; i1: number; j0: number; j1: number; } // inclusive

export class Heightmap {
  readonly res: number;
  readonly cells: number;
  readonly size: number;
  readonly step: number;
  readonly half: number;
  readonly heights: Float32Array;

  constructor(res: number, size: number, initial?: Float32Array) {
    this.res = res; this.cells = res - 1; this.size = size;
    this.step = size / this.cells; this.half = size / 2;
    this.heights = initial ?? new Float32Array(res * res);
  }

  idx(i: number, j: number): number { return j * this.res + i; }

  /** Clamped read — neighbours past the edge return the edge value (no wraparound, no NaN). */
  at(i: number, j: number): number {
    const ci = i < 0 ? 0 : i >= this.res ? this.res - 1 : i;
    const cj = j < 0 ? 0 : j >= this.res ? this.res - 1 : j;
    return this.heights[cj * this.res + ci];
  }

  /** Bilinear height at a fractional local (x,z); used by erosion + height queries. */
  sampleLocal(x: number, z: number): number {
    const fi = (x + this.half) / this.step;
    const fj = (z + this.half) / this.step;
    const i = Math.floor(fi), j = Math.floor(fj);
    const fx = fi - i, fz = fj - j;
    const h00 = this.at(i, j),   h10 = this.at(i + 1, j);
    const h01 = this.at(i, j + 1), h11 = this.at(i + 1, j + 1);
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  /** Inclusive vertex-index rect covering a brush circle centred at local (cx,cz) radius R. */
  rectFor(cx: number, cz: number, R: number): DirtyRect {
    const toI = (x: number) => (x + this.half) / this.step;
    const c = (v: number) => Math.min(Math.max(v, 0), this.res - 1);
    return {
      i0: c(Math.floor(toI(cx - R))), i1: c(Math.ceil(toI(cx + R))),
      j0: c(Math.floor(toI(cz - R))), j1: c(Math.ceil(toI(cz + R))),
    };
  }
}

/** Brush falloff. d = planar (XZ) distance; R = radius; hardness ∈ [0,1] = flat-top fraction. */
export function brushWeight(d: number, R: number, hardness: number): number {
  if (d >= R) return 0;
  const inner = R * Math.min(Math.max(hardness, 0), 0.999);
  if (d <= inner) return 1;
  const x = (d - inner) / (R - inner);   // 0 → 1 across the soft band
  return 1 - x * x * (3 - 2 * x);        // smoothstep, 1 → 0  (C1, monotonic)
}
```

> **Why `inner = R * hardness`:** hardness 0 → fully smooth dome; hardness 1 → flat-topped disc.
> This is exactly how Blender/Unity model brush hardness and is the least surprising to artists.

### 3.1 Raise / Lower kernel (continuous)

```ts
/** dir = +1 raise, −1 lower. amount is already time-scaled by the caller. Returns dirty rect. */
export function applyRaise(hm: Heightmap, cx: number, cz: number, R: number,
                           hardness: number, amount: number, dir: number): DirtyRect {
  const r = hm.rectFor(cx, cz, R);
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      const w = brushWeight(Math.hypot(x - cx, z - cz), R, hardness);
      if (w === 0) continue;
      hm.heights[hm.idx(i, j)] += dir * amount * w;
    }
  }
  return r;
}
```

### 3.2 Smooth kernel (read-before-write — this is where people introduce bugs)

A blur must read the **old** heights of its neighbours, not heights you already smoothed in the same
pass. Snapshot the rect (plus a 1-vertex ring) first, blur from the snapshot.

```ts
export function applySmooth(hm: Heightmap, cx: number, cz: number, R: number,
                            hardness: number, rate: number): DirtyRect {
  const r = hm.rectFor(cx, cz, R);
  // Snapshot rect + 1 ring so the 3×3 kernel reads pre-smooth values.
  const si0 = Math.max(r.i0 - 1, 0), si1 = Math.min(r.i1 + 1, hm.res - 1);
  const sj0 = Math.max(r.j0 - 1, 0), sj1 = Math.min(r.j1 + 1, hm.res - 1);
  const w = si1 - si0 + 1, h = sj1 - sj0 + 1;
  const snap = new Float32Array(w * h);
  for (let j = sj0; j <= sj1; j++)
    for (let i = si0; i <= si1; i++)
      snap[(j - sj0) * w + (i - si0)] = hm.heights[hm.idx(i, j)];
  const S = (i: number, j: number) => {                // clamped read from snapshot
    const ci = Math.min(Math.max(i, si0), si1), cj = Math.min(Math.max(j, sj0), sj1);
    return snap[(cj - sj0) * w + (ci - si0)];
  };
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      const bw = brushWeight(Math.hypot(x - cx, z - cz), R, hardness);
      if (bw === 0) continue;
      const avg = (S(i-1,j-1)+S(i,j-1)+S(i+1,j-1)+S(i-1,j)+S(i,j)+S(i+1,j)+S(i-1,j+1)+S(i,j+1)+S(i+1,j+1)) / 9;
      const k = hm.idx(i, j);
      const t = Math.min(rate * bw, 1);               // lerp factor, clamped
      hm.heights[k] = hm.heights[k] * (1 - t) + avg * t;
    }
  }
  return r;
}
```

### 3.3 Flatten / Terrace kernel

```ts
/** mode 'flatten' drives toward target; 'terrace' snaps toward nearest multiple of stepH. */
export function applyFlatten(hm: Heightmap, cx: number, cz: number, R: number, hardness: number,
                             rate: number, target: number, terraceStep = 0): DirtyRect {
  const r = hm.rectFor(cx, cz, R);
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      const bw = brushWeight(Math.hypot(x - cx, z - cz), R, hardness);
      if (bw === 0) continue;
      const k = hm.idx(i, j);
      const goal = terraceStep > 0 ? Math.round(hm.heights[k] / terraceStep) * terraceStep : target;
      const t = Math.min(rate * bw, 1);
      hm.heights[k] = hm.heights[k] * (1 - t) + goal * t;
    }
  }
  return r;
}
```

### 3.4 Ramp kernel (one-shot, two anchors)

```ts
/** A,B are local-space points {x,y,z}; y is the target height at each end. halfWidth in metres. */
export function applyRamp(hm: Heightmap, A: {x:number;y:number;z:number}, B: {x:number;y:number;z:number},
                          halfWidth: number, hardness: number): DirtyRect {
  const abx = B.x - A.x, abz = B.z - A.z;
  const abLen2 = abx * abx + abz * abz || 1e-6;
  const minX = Math.min(A.x, B.x) - halfWidth, maxX = Math.max(A.x, B.x) + halfWidth;
  const minZ = Math.min(A.z, B.z) - halfWidth, maxZ = Math.max(A.z, B.z) + halfWidth;
  const r = hm.rectFor((minX+maxX)/2, (minZ+maxZ)/2, Math.max(maxX-minX, maxZ-minZ)/2);
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      let t = ((x - A.x) * abx + (z - A.z) * abz) / abLen2; // projection param
      t = Math.min(Math.max(t, 0), 1);
      const px = A.x + abx * t, pz = A.z + abz * t;          // closest point on segment
      const dperp = Math.hypot(x - px, z - pz);
      if (dperp > halfWidth) continue;
      const goal = A.y * (1 - t) + B.y * t;
      const w = brushWeight(dperp, halfWidth, hardness);
      const k = hm.idx(i, j);
      hm.heights[k] = hm.heights[k] * (1 - w) + goal * w;
    }
  }
  return r;
}
```

### 3.5 Noise kernel

See [`noise.ts`](#5-noisets--seeded-fbm) for `fbm`. The kernel adds amplitude-scaled fBm:

```ts
export function applyNoise(hm: Heightmap, cx: number, cz: number, R: number, hardness: number,
                           amplitude: number, sampleH: (x:number,z:number)=>number): DirtyRect {
  const r = hm.rectFor(cx, cz, R);
  for (let j = r.j0; j <= r.j1; j++) {
    const z = j * hm.step - hm.half;
    for (let i = r.i0; i <= r.i1; i++) {
      const x = i * hm.step - hm.half;
      const w = brushWeight(Math.hypot(x - cx, z - cz), R, hardness);
      if (w === 0) continue;
      hm.heights[hm.idx(i, j)] += amplitude * w * sampleH(x, z); // sampleH returns ~[-1,1]
    }
  }
  return r;
}
```

---

## 4. `TerrainField.ts` — geometry, GPU upload, collider

This is the only place THREE/Rapier touch the heightmap. It owns the `BufferGeometry`, the
`RigidBodyComponent`, and the collider handle.

### 4.1 Build the geometry (custom BufferGeometry — do NOT use PlaneGeometry + rotate)

We build the grid directly in the XZ plane with Y as height. This removes the entire class of
"which axis is height after I rotated the plane / which index is (i,j)" bugs.

```ts
import * as THREE from 'three';
import { Heightmap } from './Heightmap';

export function buildGeometry(hm: Heightmap): THREE.BufferGeometry {
  const { res, cells, step, half, heights } = hm;
  const positions = new Float32Array(res * res * 3);
  const uvs = new Float32Array(res * res * 2);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const k = j * res + i;
      positions[k*3+0] = i * step - half;
      positions[k*3+1] = heights[k];
      positions[k*3+2] = j * step - half;
      uvs[k*2+0] = i / cells;
      uvs[k*2+1] = j / cells;
    }
  }
  const indices = new Uint32Array(cells * cells * 6);
  let t = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j*res + i, b = j*res + i + 1, c = (j+1)*res + i, d = (j+1)*res + i + 1;
      indices[t++] = a; indices[t++] = c; indices[t++] = b;   // CCW → +Y up
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
```

> The two triangles `(a,c,b)` and `(b,c,d)` are wound so the face normal points **+Y** (verified by
> cross-product). If your terrain renders black/inside-out, you flipped the winding.

### 4.2 Apply a dirty rect to the GPU (partial upload + local normals)

After a kernel edits `heights`, push only the touched vertices and recompute normals only there.

```ts
applyRect(r: DirtyRect): void {
  const pos = this.geometry.attributes.position as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const { res, heights } = this.hm;
  // 1. Copy edited heights into the Y channel.
  for (let j = r.j0; j <= r.j1; j++)
    for (let i = r.i0; i <= r.i1; i++)
      arr[(j*res+i)*3 + 1] = heights[j*res+i];
  // 2. Recompute normals for the rect (+1 ring so seams match neighbours). See recomputeNormalsRect().
  this.recomputeNormalsRect(r);
  // 3. Mark the minimal contiguous range dirty for the GPU (rows j0..j1 fully, simplest correct range).
  const start = (r.j0 * res) * 3;
  const count = ((r.j1 - r.j0 + 1) * res) * 3;
  pos.clearUpdateRanges();
  pos.addUpdateRange(start, count);
  pos.needsUpdate = true;
  (this.geometry.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
  // 4. Bounds MUST be refreshed or the CPU raycaster (brush hover) early-rejects rays once the
  //    terrain rises above its original bounding sphere — the brush "falls through" the hill.
  this.geometry.computeBoundingSphere();
}
```

> `recomputeNormalsRect(r)`: for each vertex in the rect (expanded by 1), recompute its normal from
> the cross-product of its grid neighbours: `n = normalize( (h(i-1,j)-h(i+1,j), 2*step, h(i,j-1)-h(i,j+1)) )`
> using the central-difference of the heightmap. This is O(rect) instead of O(whole grid) — write it
> as a helper; the full-grid `geometry.computeVertexNormals()` is the easy fallback if you're short
> on time, but it will hitch on a 257² grid during a fast drag.

### 4.3 Collider — use a **trimesh**, rebuild on stroke END (debounced)

The engine already exposes `createTrimeshCollider(body, vertices, indices)`. The vertices are the
**same local-space `positions` array** you just edited (Rapier copies it at creation), and the
indices are static. Rapier shapes are size-immutable, so "editing" the collider means remove +
recreate — exactly the pattern the box/sphere builders already use via `colliderRebuilder`
([`src/engine/builders.ts:117`](src/engine/builders.ts)).

```ts
rebuildCollider(): void {
  const pw = this.physicsWorld;
  if (this.collider) pw.removeCollider(this.collider);
  const pos = (this.geometry.attributes.position.array as Float32Array);
  this.collider = pw.createTrimeshCollider(this.rb.rapierBody, pos, this.indices /* Uint32Array */);
}
```

**Rebuild policy:** call this **once on stroke end** (pointer-up) and once after each one-shot op
(ramp/noise/erode). Do **not** rebuild per dab — a 256² trimesh BVH rebuild is a couple of ms; doing
it 60×/sec will hitch. During a live stroke only the *visual* mesh updates; physics catches up on
release. This is standard sculpting UX and players won't notice (you're not standing on the spot you
sculpt mid-stroke).

> **Optimisation (optional, later — do NOT start here):** Rapier also has
> `ColliderDesc.heightfield(nrows, ncols, heights, scale)` which is cheaper for huge terrain. Its
> height array is **column-major** with `(nrows+1)*(ncols+1)` samples, centred at the origin,
> spanning `scale.x × scale.z`, height × `scale.y`. The row/column ↔ X/Z mapping is the classic
> footgun — if you ever switch to it, validate with a one-sided ramp and confirm the collider slope
> matches the visual slope before trusting it. **For v1 use the trimesh; it shares your exact vertex
> buffer and cannot disagree with what you see.**

### 4.4 The terrain builder (in `src/engine/builders.ts`)

Register a `'terrain'` builder so terrain is a first-class entity: pickable, in the outliner,
serialisable by blueprint, and automatically a floating-origin-aware physics root (the SceneManager
tags it `userData.physicsRoot = true` and adds it to the Scene — see
[`src/ecs/SceneManager.ts:224`](src/ecs/SceneManager.ts)).

```ts
sceneManager.registerBuilder('terrain', (enginePos, params, ctx) => {
  const res  = num(params, 'resolution', 257);
  const size = num(params, 'size', 256);
  const hm = new Heightmap(res, size);                 // flat; heights re-applied later if loading
  const geometry = buildGeometry(hm);
  const material = resolveMaterial(ctx, params);       // reuse the existing helper
  material.side = THREE.FrontSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false; mesh.receiveShadow = true;  // terrain receives, rarely casts
  mesh.position.copy(enginePos);

  const body = ctx.physicsWorld.createRigidBody(makeBodyDesc(ctx, false, enginePos)); // FIXED
  const indices = geometry.index!.array as Uint32Array;
  const collider = ctx.physicsWorld.createTrimeshCollider(
    body, geometry.attributes.position.array as Float32Array, indices);

  const rb = new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
  // The TerrainField is the source of truth; attach it so TerrainSystem + deserialize can find it
  // even when the entity was spawned directly via SceneManager.spawnNow (e.g. on scene load).
  mesh.userData.terrain = new TerrainField(ctx.physicsWorld, rb, hm, geometry, indices, collider);
  rb.onDispose = () => { geometry.dispose(); (material as THREE.Material).dispose(); };
  return rb;
});
```

> Storing the `TerrainField` on `mesh.userData.terrain` (not only in a `TerrainSystem` map) means a
> terrain loaded by `deserializeSceneState` (which calls `SceneManager.spawnNow` directly) is fully
> functional without the loader knowing about `TerrainSystem`. `TerrainSystem` lazily indexes it.

---

## 5. `noise.ts` — seeded fBm

Determinism matters: the same `seed` from an AI command must produce the same terrain every run.
`SimplexNoise` from three takes an object with a `random()` method — feed it a seeded PRNG.

```ts
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fractional Brownian motion in [-1,1] (approx). freq in cycles/metre. */
export function makeFbm(seed: number, octaves = 5, lacunarity = 2, gain = 0.5) {
  const simplex = new SimplexNoise({ random: mulberry32(seed) });
  return (x: number, z: number, baseFreq: number): number => {
    let amp = 1, freq = baseFreq, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * simplex.noise(x * freq, z * freq);
      norm += amp; amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  };
}
```

---

## 6. `erosion.ts` — hydraulic (droplet) + thermal (talus)

Pure functions over the `Float32Array` (+ `res`, `step`). Both are **one-shot region ops** invoked
by `terrain_erode` (or a "rain" brush). For large iteration counts, `TerrainSystem` spreads them
across frames in the update hook so the loop never hitches (see §8.3).

### 6.1 Hydraulic erosion (particle/droplet method)

This is the well-documented droplet model (Beyer / Lague). A droplet flows downhill via the
bilinear gradient, picks up sediment proportional to slope·speed·water, and deposits when it slows
or goes uphill. Erosion is spread over a small radius so you carve channels, not single-vertex
spikes.

```ts
export interface HydraulicOptions {
  iterations: number;     // # droplets (e.g. 50_000 for a 256² tile)
  maxLifetime: number;    // 30
  inertia: number;        // 0.05  (0 = follow gradient exactly; 1 = keep direction)
  capacityFactor: number; // 4
  minCapacity: number;    // 0.01
  depositSpeed: number;   // 0.3
  erodeSpeed: number;     // 0.3
  evaporateSpeed: number; // 0.01
  gravity: number;        // 4
  erosionRadius: number;  // 3 (cells)
  startSpeed: number;     // 1
  startWater: number;     // 1
}

export function erodeHydraulic(heights: Float32Array, res: number,
                               opts: HydraulicOptions, rng: () => number,
                               region: { i0:number; i1:number; j0:number; j1:number }): void {
  const at = (i: number, j: number) => heights[
    Math.min(Math.max(j,0),res-1) * res + Math.min(Math.max(i,0),res-1)];

  // Precompute a normalised erosion kernel (weights ∝ max(0, radius - dist)).
  const rad = opts.erosionRadius;
  const kernel: { di:number; dj:number; w:number }[] = [];
  let kw = 0;
  for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
    const d = Math.hypot(di, dj);
    if (d < rad) { const w = rad - d; kernel.push({ di, dj, w }); kw += w; }
  }
  for (const k of kernel) k.w /= kw;

  for (let n = 0; n < opts.iterations; n++) {
    let px = region.i0 + rng() * (region.i1 - region.i0);   // float cell coords
    let pz = region.j0 + rng() * (region.j1 - region.j0);
    let dx = 0, dz = 0, speed = opts.startSpeed, water = opts.startWater, sediment = 0;

    for (let life = 0; life < opts.maxLifetime; life++) {
      const ci = Math.floor(px), cj = Math.floor(pz);
      const fx = px - ci, fz = pz - cj;
      const h00 = at(ci,cj), h10 = at(ci+1,cj), h01 = at(ci,cj+1), h11 = at(ci+1,cj+1);
      const oldH = (h00*(1-fx)+h10*fx)*(1-fz) + (h01*(1-fx)+h11*fx)*fz;
      // Gradient of the bilinear patch.
      const gx = (h10 - h00)*(1-fz) + (h11 - h01)*fz;
      const gz = (h01 - h00)*(1-fx) + (h11 - h10)*fx;
      // Update direction with inertia, then normalise.
      dx = dx*opts.inertia - gx*(1-opts.inertia);
      dz = dz*opts.inertia - gz*(1-opts.inertia);
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) break;                  // sitting in a flat pit — stop
      dx /= len; dz /= len;
      const nx = px + dx, nz = pz + dz;
      if (nx < region.i0 || nx > region.i1 || nz < region.j0 || nz > region.j1) break;

      const newH = (() => { const i=Math.floor(nx), j=Math.floor(nz), a=nx-i, b=nz-j;
        return (at(i,j)*(1-a)+at(i+1,j)*a)*(1-b) + (at(i,j+1)*(1-a)+at(i+1,j+1)*a)*b; })();
      const dH = newH - oldH;
      const capacity = Math.max(-dH * speed * water * opts.capacityFactor, opts.minCapacity);

      if (sediment > capacity || dH > 0) {
        // Deposit. Going uphill: try to fill the pit (capped at dH). Else drop the excess.
        const drop = dH > 0 ? Math.min(dH, sediment) : (sediment - capacity) * opts.depositSpeed;
        sediment -= drop;
        // Spread the deposit onto the 4 corners of the OLD cell (bilinear).
        heights[cj*res+ci]         += drop*(1-fx)*(1-fz);
        heights[cj*res+ci+1]       += drop*fx*(1-fz);
        heights[(cj+1)*res+ci]     += drop*(1-fx)*fz;
        heights[(cj+1)*res+ci+1]   += drop*fx*fz;
      } else {
        // Erode, but never dig deeper than the height drop (no negative spikes).
        const take = Math.min((capacity - sediment) * opts.erodeSpeed, -dH);
        for (const k of kernel) {
          const i = ci + k.di, j = cj + k.dj;
          if (i < 0 || i >= res || j < 0 || j >= res) continue;
          heights[j*res+i] -= take * k.w;
        }
        sediment += take;
      }
      speed = Math.sqrt(Math.max(0, speed*speed + (oldH - newH) * opts.gravity)); // downhill speeds up
      water *= (1 - opts.evaporateSpeed);
      px = nx; pz = nz;
    }
  }
}
```

> **Validate:** after eroding a noisy hill you should see **branching channels and sediment fans**,
> not isolated needle spikes. Spikes ⇒ your `erosionRadius` collapsed to 0 (single-vertex erosion)
> or you eroded more than `-dH`. Flatness ⇒ inertia too high or evaporation too fast.

### 6.2 Thermal erosion (talus / gravity slide)

Simpler and cheap. For each cell, if the height difference to a neighbour exceeds the talus
threshold (max stable slope), move material from the high cell to the low one. **Accumulate all
moves in a delta buffer and apply after the full pass** so the result is order-independent.

```ts
export function erodeThermal(heights: Float32Array, res: number,
                             talus: number, factor: number, iterations: number,
                             region: { i0:number;i1:number;j0:number;j1:number }): void {
  const delta = new Float32Array(heights.length);
  const N = [[-1,0],[1,0],[0,-1],[0,1]] as const;
  for (let it = 0; it < iterations; it++) {
    delta.fill(0);
    for (let j = region.j0; j <= region.j1; j++) {
      for (let i = region.i0; i <= region.i1; i++) {
        const h = heights[j*res+i];
        for (const [di,dj] of N) {
          const ni = i+di, nj = j+dj;
          if (ni<0||ni>=res||nj<0||nj>=res) continue;
          const diff = h - heights[nj*res+ni];
          if (diff > talus) {
            const move = (diff - talus) * factor * 0.5;   // 0.5 = split evenly, stable
            delta[j*res+i]   -= move;
            delta[nj*res+ni] += move;
          }
        }
      }
    }
    for (let k = 0; k < heights.length; k++) heights[k] += delta[k];
  }
}
```

> `talus` is the max stable height-difference between adjacent cells (≈ `tan(angleRad) * step`).
> `factor ∈ (0,0.5]`. Larger `factor` = faster slumping but can oscillate above 0.5.

---

## 7. Viewport interaction — `TerrainBrushTool.ts` + `ToolManager`

### 7.1 The `EditorTool` seam (so the brush and the gizmo don't fight over LMB)

Today LMB-in-editor queues an entity pick (`Engine.bindEditorInput`,
[`src/engine/Engine.ts:710`](src/engine/Engine.ts)) and `resolvePendingPick` attaches the gizmo.
RMB drives the flycam. Brushes use **LMB**, so they collide with picking — you must gate it.

Add a tiny `ToolManager`:

```ts
export interface EditorTool {
  readonly id: string;
  activate(): void;
  deactivate(): void;
}
export class ToolManager {
  active: EditorTool | null = null;
  setActive(tool: EditorTool | null) {
    if (this.active === tool) return;
    this.active?.deactivate();
    this.active = tool;
    tool?.activate();
  }
}
```

In `Engine`:
- construct `readonly tools = new ToolManager();`
- in `bindEditorInput`'s pointerdown handler, **bail when a tool is active**:
  `if (this.tools.active) return;` (before queuing `pendingPick`).
- in `processEditorInput`, only `resolvePendingPick()` when `!this.tools.active`.
- pressing the gizmo-mode hotkeys (Digit1/2/3) or `Escape` should also clear the active tool
  (`this.tools.setActive(null)`), so the user can always get back to select/translate.

This is the same "consult a guard" idiom already used for `gizmo.dragging`
(`input.setPointerLockGuard(() => this.gizmo.dragging)`, [`src/engine/Engine.ts:226`](src/engine/Engine.ts)).

### 7.2 Pointer pipeline

`InputManager` is passive and tracks button state + **deltas**, but not the current cursor position
([`src/engine/InputManager.ts`](src/engine/InputManager.ts)). The brush needs the live canvas
position each frame. **Add your own passive `pointermove` listener** on the canvas inside the tool
(this is explicitly the sanctioned pattern — the gizmo owns its own listeners too; see the
InputManager class doc-comment). Do not preventDefault.

```ts
class TerrainBrushTool implements EditorTool {
  private px = 0; private py = 0; private painting = false; private travel = 0;
  private readonly onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.px = e.clientX - r.left; this.py = e.clientY - r.top;
  };
  activate() {
    this.canvas.addEventListener('pointermove', this.onMove);
    this.offDown = this.input.on('pointerdown', p => { if (p.button === 0) this.beginStroke(); });
    this.offUp   = this.input.on('pointerup',   p => { if (p.button === 0) this.endStroke(); });
    this.cursor.visible = true;
  }
  deactivate() {
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.offDown?.(); this.offUp?.(); this.endStroke();
    this.cursor.visible = false;
  }
  // tick(dt) is called from the engine update hook (TerrainSystem registers it).
}
```

> **Do not** brush while RMB (flycam look) is held — check `!input.isMouseButtonDown(2)`. The flycam
> requests pointer lock on RMB; if you also paint you'll sculpt blindly.

### 7.3 Raycast: screen → terrain-local grid

Use a CPU `THREE.Raycaster` against the **terrain mesh** (always reflects live edits; the physics
collider is stale mid-stroke). Convert the canvas pixel to NDC exactly like `resolvePendingPick`
([`src/engine/Engine.ts:756`](src/engine/Engine.ts)):

```ts
private hitLocal(field: TerrainField, out: THREE.Vector3): boolean {
  const el = this.canvas;
  this.ndc.set((this.px / el.clientWidth) * 2 - 1, -(this.py / el.clientHeight) * 2 + 1);
  this.ray.setFromCamera(this.ndc, this.camera);
  const hits = this.ray.intersectObject(field.mesh, false);
  if (hits.length === 0) return false;
  out.copy(field.mesh.worldToLocal(hits[0].point.clone())); // engine-space hit → terrain-local
  return true;                                               // out.x, out.z are the brush centre
}
```

`worldToLocal` uses the mesh's `matrixWorld`, so the result is correct under any floating-origin
offset — **never add/subtract `worldOrigin.offset` yourself here.**

### 7.4 Stroke spacing (the classic "slow drag digs a hole" bug)

Do not apply a dab on every `pointermove`. Accumulate cursor travel in **local metres** and apply
one dab each time travel exceeds `spacing * radius` (spacing ≈ 0.25). For continuous brushes
(raise/lower/smooth) the per-dab amount is time-scaled in `tick(dt)`; for "stamp" brushes apply per
spaced step.

```ts
tick(dt: number) {
  const field = this.system.terrainUnderCursor(); // or the single active terrain
  if (!field || !this.painting || this.input.isMouseButtonDown(2)) return;
  if (!this.hitLocal(field, this.center)) return;
  this.updateCursor(field, this.center);                 // move the ring decal
  const R = this.settings.radius;
  const moved = this.center.distanceTo(this.lastDab);
  if (this.lastDab.lengthSq() === 0) this.lastDab.copy(this.center);
  this.travel += moved; this.lastDab.copy(this.center);
  // Continuous brushes apply every frame (time-scaled); spacing limits stamps.
  const amount = this.settings.strength * STRENGTH_SCALE * dt;  // metres this frame at w=1
  this.system.sculpt(field, this.brushOp, this.center.x, this.center.z, R,
                     this.settings.hardness, amount, this.settings);
}
```

> `STRENGTH_SCALE` converts a 0..1 strength slider to metres/second at the brush centre. Start with
> `STRENGTH_SCALE = 20` (so strength 1 raises ~20 m/s at the centre) and tune.

### 7.5 Brush cursor (visual feedback)

Add a thin ring (`THREE.RingGeometry` or a `LineLoop` circle) to the scene, repositioned every
`tick` to the hit point, oriented to the surface normal, scaled to the radius. Because you reposition
it every frame from the live engine-space hit, tag it to be skipped by the floating-origin static
pass — **mirror the gizmo helper**, which sets `helper.userData.excludeFromOriginShift = true`
([`src/rendering/TransformGizmo.ts:67`](src/rendering/TransformGizmo.ts)). Give its material
`depthTest:false` so it's always visible over the terrain.

---

## 8. `TerrainSystem.ts` — the shared API + loop integration

This is the single object the mouse tool and the AI both call. It holds the registry and registers
one engine update hook.

```ts
export class TerrainSystem {
  private readonly fields = new Map<EntityId, TerrainField>();
  private readonly erodeJobs: ErosionJob[] = [];   // async batches (see 8.3)

  constructor(private engine: Engine) {
    engine.addUpdateHook(dt => this.update(dt));   // runs in loop step 2 (before physics/flush)
  }

  /** Lazily index a terrain entity (also catches ones spawned by deserialize). */
  field(id: EntityId): TerrainField | null {
    let f = this.fields.get(id) ?? null;
    if (!f) {
      const rb = this.engine.sceneManager.getRigidBody(id);
      f = (rb?.mesh.userData.terrain as TerrainField) ?? null;
      if (f) this.fields.set(id, f);
    }
    return f;
  }

  create(world: THREE.Vector3, opts: TerrainCreateOpts): EntityId { /* spawnNow 'terrain' blueprint */ }
  sculpt(field, op, cx, cz, R, hardness, amount, settings): void { /* call Heightmap kernel → field.applyRect */ }
  stroke(field, op, points: LocalXZ[], R, hardness, amount, settings): void { /* dab along a polyline */ }
  ramp(field, A, B, halfWidth, hardness): void { /* applyRamp → applyRect → rebuildCollider */ }
  noise(field, cx, cz, R, hardness, amplitude, freq, seed, octaves): void { /* applyNoise */ }
  erode(field, region, kind, opts): void { /* enqueue ErosionJob; or run now if small */ }
  sampleHeightWorld(field, worldX, worldZ): number { /* worldToLocal → hm.sampleLocal → localToWorld.y */ }
  reset(field): void { /* zero heights → full applyRect → rebuildCollider */ }
}
```

### 8.1 Where it runs in the loop

`addUpdateHook` callbacks fire at [`src/engine/Engine.ts:593`](src/engine/Engine.ts) — **before**
physics step and **before** the deferred-ECS flush. That's the correct place to: advance the live
brush, step erosion batches, and move the cursor. **You never call `requestSpawn`/`requestDestroy`
from a brush**, so you never touch the deferred-flush invariant — collider rebuilds are plain
remove/create (the same thing the inspector's `rescaleCollider` does outside the flush).

### 8.2 Stroke lifecycle (collider + undo + autosave)

```
pointer-down → TerrainHistory.beginStroke(field, expectedRect)   // snapshot heights in the rect
   … per-frame dabs update heights + visual mesh only …
pointer-up   → field.rebuildCollider()                           // physics catches up
             → TerrainHistory.commit()                           // push undo entry
             → dispatch window 'mix:scene-changed'               // main.ts autosaves (debounced)
```

`mix:scene-changed` is the existing hook HELM/SENSORIUM already fire and `main.ts` already listens
for to refresh the outliner + autosave — reuse it (see the HELM memory / `main.ts` listeners). Fire
it on **stroke end**, never per dab.

### 8.3 Async erosion (don't freeze the frame)

50k droplets is too much for one frame. Push an `ErosionJob { field, region, remaining, batch }`
and, in `update(dt)`, run `batch` droplets per frame (e.g. 2000), calling `field.applyRect(region)`
after each batch and `rebuildCollider()` when `remaining` hits 0. The AI `terrain_erode` command
returns immediately; the carving animates in over a few frames. (This matches how the engine already
keeps heavy work off the critical path.)

---

## 9. Text-first AI commands (product-critical — the brushes are useless to an LLM without this)

### 9.1 Extend the `AICommand` union ([`src/ai/AIBridge.ts:34`](src/ai/AIBridge.ts))

All coordinates are **world space** (the bridge converts to engine space at apply time, like every
other command). Add a section:

```ts
  // --- TERRAIN: heightmap sculpting (mouse tool + AI share these) ---
  | { type: 'terrain_create'; x: number; z: number; size?: number; resolution?: number;
      materialId?: string; seed?: number; baseNoiseAmplitude?: number }
  | { type: 'terrain_sculpt'; entityId?: EntityId; op: 'raise'|'lower'|'smooth'|'flatten'|'terrace';
      x: number; z: number; radius: number; strength?: number; hardness?: number;
      targetHeight?: number; terraceStep?: number }
  | { type: 'terrain_stroke'; entityId?: EntityId; op: 'raise'|'lower'|'smooth'|'flatten';
      points: [number, number][]; radius: number; strength?: number; hardness?: number }
  | { type: 'terrain_ramp'; entityId?: EntityId; from: [number,number,number]; to: [number,number,number];
      width: number; hardness?: number }
  | { type: 'terrain_noise'; entityId?: EntityId; x: number; z: number; radius: number;
      amplitude: number; frequency?: number; octaves?: number; seed?: number; hardness?: number }
  | { type: 'terrain_erode'; entityId?: EntityId; kind: 'hydraulic'|'thermal';
      x?: number; z?: number; radius?: number; iterations?: number; options?: Record<string, number> }
  | { type: 'terrain_sample'; entityId?: EntityId; x: number; z: number }   // query: world height at (x,z)
  | { type: 'terrain_reset'; entityId?: EntityId }
```

> `entityId?` is optional: when omitted, operate on the single/last terrain (most games have one).
> Resolve it in a private `resolveTerrain(cmd.entityId)` helper.

### 9.2 Add a `terrain` dep + switch cases

`AIBridge` is constructed with a deps object in `Engine` ([`src/engine/Engine.ts:192`](src/engine/Engine.ts)).
Add `terrain: this.terrain` to that object and to the `AIBridgeDeps` interface, then add cases to the
`processQueue()` switch ([`src/ai/AIBridge.ts:459`](src/ai/AIBridge.ts)):

```ts
case 'terrain_create':  this.handleTerrainCreate(cmd); break;
case 'terrain_sculpt':  this.handleTerrainSculpt(cmd); break;
case 'terrain_stroke':  this.handleTerrainStroke(cmd); break;
case 'terrain_ramp':    this.handleTerrainRamp(cmd); break;
case 'terrain_noise':   this.handleTerrainNoise(cmd); break;
case 'terrain_erode':   this.handleTerrainErode(cmd); break;
case 'terrain_sample':  this.handleTerrainSample(cmd); break;   // writes to lastQueryResult
case 'terrain_reset':   this.handleTerrainReset(cmd); break;
```

Each handler converts world→local (via the field's mesh) and calls the matching `TerrainSystem`
method. `terrain_sample` writes its result where the other `query_*` commands write theirs so HELM's
`do`/`query` can read it back (look at how `handleQueryRaycast` stores `lastQueryResult`).

### 9.3 Document them in the HELM manifest ([`src/helm/manifest.ts`](src/helm/manifest.ts))

Append to `HELM_MANIFEST.commands` (keep summaries one line; this is what the LLM reads to discover
the API). Bump `HELM_VERSION`. Example entries:

```ts
{ type: 'terrain_create', summary: 'Create an editable heightmap terrain at a world position.', params: ['x','z','size?','resolution?','materialId?','seed?'] },
{ type: 'terrain_sculpt', summary: 'Apply one brush stamp (raise/lower/smooth/flatten/terrace) at a world point.', params: ['op','x','z','radius','strength?','hardness?','targetHeight?','terraceStep?','entityId?'] },
{ type: 'terrain_stroke', summary: 'Apply a brush along a polyline of world XZ points (carve roads/paths).', params: ['op','points','radius','strength?','hardness?','entityId?'] },
{ type: 'terrain_ramp', summary: 'Linear graded ramp between two world points within a width band.', params: ['from','to','width','hardness?','entityId?'] },
{ type: 'terrain_noise', summary: 'Add fractal (fBm) detail in a region (deterministic by seed).', params: ['x','z','radius','amplitude','frequency?','octaves?','seed?','entityId?'] },
{ type: 'terrain_erode', summary: 'Run hydraulic or thermal erosion over a region (async).', params: ['kind','x?','z?','radius?','iterations?','options?','entityId?'] },
{ type: 'terrain_sample', summary: 'Query terrain height at a world (x,z).', params: ['x','z','entityId?'] },
{ type: 'terrain_reset', summary: 'Flatten a terrain back to zero height.', params: ['entityId?'] },
```

> **Acceptance for this section:** an AI can build a hill purely in text:
> `terrain_create {x:0,z:0}` → `terrain_sculpt {op:'raise',x:0,z:0,radius:30,strength:0.8}` →
> `terrain_noise {x:0,z:0,radius:40,amplitude:3,seed:7}` → `terrain_erode {kind:'hydraulic'}`,
> and `terrain_sample {x:0,z:0}` returns a raised height. Test this via the HELM `do` op.

---

## 10. Undo/redo & persistence

### 10.1 Terrain history (`TerrainHistory.ts`) — do NOT reuse full-scene undo for this

`main.ts` has a scene-level undo that serialises the **entire** scene
([`src/main.ts:375`](src/main.ts)). A 257² heightmap is ~256 KB; serialising the whole scene on
every stroke is far too heavy. Instead snapshot only the **rect** a stroke/op touched:

```ts
interface TerrainUndoEntry { id: EntityId; rect: DirtyRect; before: Float32Array; after: Float32Array; }
```

- `beginStroke(field, rect)`: copy the rect's heights into `before`.
- `commit()`: copy the (now-edited) rect into `after`, push `{id, rect, before, after}` to a ring
  buffer (cap ~32), clear the redo stack.
- `undo()/redo()`: write `before`/`after` back into `heights`, then `field.applyRect(rect)` +
  `field.rebuildCollider()`.

Route **Ctrl+Z / Ctrl+Y to terrain history when a terrain tool is active**, else fall through to the
existing scene undo. Wire this where `main.ts` already binds the undo hotkeys.

### 10.2 Scene-state persistence ([`src/main.ts:223`](src/main.ts))

The blueprint already serialises (`size`, `resolution`, `materialId`, `seed`) — those round-trip for
free through the existing entity loop. The **heights** must be saved separately (they're not in
`blueprint.params`, by design, so the per-entity loop stays tiny and autosave stays cheap).

- **In `serializeSceneState`**, after the entity loop, add a `terrains` map:
  ```ts
  const terrains: Record<number, { res: number; size: number; heightsB64: string }> = {};
  for (const id of entityIds) {
    const f = engine.terrain.field(id);
    if (f) terrains[id] = { res: f.hm.res, size: f.hm.size, heightsB64: f32ToB64(f.hm.heights) };
  }
  // include `terrains` in the returned state object
  ```
- **In `deserializeSceneState`**, after entities are spawned (so the terrain entity + its flat
  `TerrainField` exist via the builder), re-apply heights:
  ```ts
  for (const [oldId, t] of Object.entries(state.terrains ?? {})) {
    const newId = idMap.get(Number(oldId)); if (newId === undefined) continue;
    const f = engine.terrain.field(newId); if (!f || f.hm.res !== t.res) continue;
    f.hm.heights.set(b64ToF32(t.heightsB64));
    f.applyRect({ i0:0, i1:f.hm.res-1, j0:0, j1:f.hm.res-1 });  // full upload + normals + bounds
    f.rebuildCollider();
  }
  ```
- `f32ToB64`/`b64ToF32`: `btoa(String.fromCharCode(...new Uint8Array(arr.buffer)))` (chunk it to
  avoid call-stack limits on large arrays) and the inverse. Put these helpers in `src/ui/domUtils.ts`
  (where `escapeHtml`/`showToast` already live).

> A 257² terrain is ~349 KB of base64 in the autosave JSON — fine for the one-terrain dev case, and
> autosave only fires on stroke-end (debounced), not per dab. If a game ever needs many large
> terrains, move heights to a dedicated binary endpoint (`/api/terrain/:id`) later; **out of scope
> for v1.**

---

## 11. UI — toolbar + brush settings ([`src/main.ts`](src/main.ts))

Add to the existing editor toolbar (the same row as the gizmo translate/rotate/scale buttons):

- A **"+ Terrain"** button → `engine.runScript([{ type:'terrain_create', x:camX, z:camZ }])` (build
  in front of the camera) or a fixed origin.
- Brush buttons: **Raise, Lower, Smooth, Flatten, Terrace, Ramp, Noise, Erode**. Clicking one calls
  `engine.tools.setActive(brushTool)` and sets `brushTool.brushOp`. Clicking the active one again, or
  pressing `Esc`/`Q`, calls `setActive(null)` (back to select).
- A **brush settings panel** (reuse the existing slider/panel CSS — see the `.panel` styles and the
  time-of-day/fog sliders): **Radius** (1–100 m), **Strength** (0–1), **Hardness** (0–1), plus
  op-specific fields: **Target height** + a **"Sample"** toggle (Flatten), **Terrace step** (Terrace),
  **Width** (Ramp), **Amplitude/Frequency/Octaves/Seed** (Noise), **Iterations/kind** (Erode).
- Flatten "Sample": when armed, the **first** LMB on the terrain sets `targetHeight` to the height at
  that point (`field.hm.sampleLocal(local.x, local.z)`), then subsequent drags flatten toward it.

> Keep the settings object (`{radius, strength, hardness, …}`) as a single source of truth the tool
> reads each `tick`. Sliders update it on `input`; nothing serialises per pixel (the existing code
> already separates live `input` visuals from `change`-time autosave — follow that).

---

## 12. Performance budget

| Operation | Target | How |
| --- | --- | --- |
| Live dab (raise/smooth/flatten) | < 1 ms | Dirty-rect only; never iterate the whole grid |
| Normal recompute per dab | < 1 ms | `recomputeNormalsRect` (rect+1 ring), not full `computeVertexNormals` |
| GPU upload per dab | minimal | `addUpdateRange` for the touched rows only |
| Collider rebuild | a few ms, **stroke-end only** | `createTrimeshCollider`; never per dab |
| Hydraulic erosion (50k droplets) | spread over frames | `erodeJobs` batch of ~2000/frame |
| Autosave after stroke | debounced, off the hot path | fire `mix:scene-changed` on stroke-end |

Default tile: **`res = 257`, `size = 256 m`** (1 m/vertex). Cap interactive single-tile editing at
`res = 513`. Larger worlds = multiple terrain tiles (each its own entity) — the architecture already
supports that since each terrain is a normal entity; tiling UX is a later iteration.

---

## 13. Testing (matches the repo's Vitest setup — `npm test`)

Create `test/terrain.test.ts`. The pure modules are designed to be tested without a browser:

1. **`brushWeight`** — `=1` at centre, `=0` at/after R, monotonic decreasing, `=1` inside `R*hardness`.
2. **`applyRaise`** — centre vertex rises by ~`amount`, rim unchanged, vertices outside R untouched;
   total touched count equals the rect area intersect circle.
3. **`applySmooth`** — a single spike's height **decreases** and its neighbours **increase** (mass
   roughly conserved); a flat field stays flat (idempotent). Confirms read-before-write.
4. **`applyFlatten`** — converges toward `target` (and terrace snaps to multiples of `terraceStep`).
5. **`applyRamp`** — sampled heights along AB interpolate linearly `A.y→B.y`; outside `halfWidth`
   unchanged.
6. **`makeFbm`** — deterministic for a fixed seed (two calls equal), output within ~[-1,1].
7. **`erodeThermal`** — a column taller than `talus` above neighbours gets shorter; total height sum
   conserved (delta buffer nets to ~0).
8. **`erodeHydraulic`** — on a smooth slope, downhill cells gain sediment, total mass ≈ conserved
   (within deposit/erode rounding); **no NaN, no value explodes** (regression guard).
9. **`Heightmap.sampleLocal`** — bilinear sample at a known fractional point matches hand-computed.
10. **Serialization round-trip** — `b64ToF32(f32ToB64(a))` deep-equals `a` for a large array.

Then a **Claude_Preview** smoke pass (headless eval, as the rest of the engine is verified): run
`engine.runScript([...])` to create + raise + noise + erode a terrain, confirm `entityCount`
increased, `terrain_sample` returns a non-zero height, and `tsc`/`npm run build` is clean. (Remember
the documented headless caveat: the preview tab backgrounds → rAF throttles; drive `engine.loop(ts)`
or call `update(dt)` directly if you need the erosion batches to advance — see the project memory.)

---

## 14. Milestones (ship in this order; each is a reviewable PR)

| # | Milestone | Deliverable | Acceptance |
| --- | --- | --- | --- |
| **M1** | Pure core | `Heightmap.ts`, `noise.ts`, `erosion.ts` + `test/terrain.test.ts` | All §13 unit tests pass; **no THREE/Rapier imports** in these three files |
| **M2** | Terrain entity | `TerrainField.ts` + `'terrain'` builder + `terrain_create` command | `terrain_create` spawns a flat lit grid you can stand on (capsule rests on it); appears in outliner; round-trips through save/load (flat) |
| **M3** | Raise/Lower/Smooth/Flatten | `TerrainSystem` + `TerrainBrushTool` + `ToolManager` + engine gating + toolbar | Mouse sculpts live; gizmo no longer steals LMB while a brush is active; dirty-rect perf within §12; collider updates on release (capsule walks the new hill) |
| **M4** | Ramp + Terrace + Noise | `terrain_ramp`, `terrain_noise`, terrace mode + UI | Two-click ramp grades correctly; noise adds detail deterministically by seed |
| **M5** | Erosion | `terrain_erode` (hydraulic + thermal), async batches | Eroding a noisy hill carves channels over a few frames without a visible hitch |
| **M6** | Undo + persistence + manifest | `TerrainHistory`, scene-state heights, manifest entries, Ctrl+Z routing | Ctrl+Z reverts a stroke; reload restores the sculpted terrain exactly; HELM manifest lists every `terrain_*` command; a text-only AI build (§9 acceptance) works end-to-end |

---

## 15. Pitfalls checklist (these match real footguns in THIS codebase — read before coding)

- [ ] **Brush math is in terrain-LOCAL space** (via `mesh.worldToLocal`). Never add/subtract
      `worldOrigin.offset` in brush code — local space is already origin-invariant.
- [ ] **`res` = vertices, `cells = res − 1` = quads.** Position buffer is `res²`; index buffer is
      `cells² × 2` tris. Off-by-one tears the last row/column.
- [ ] **Smooth/thermal must read-before-write** (snapshot or delta buffer). In-place reads make the
      result order-dependent and wrong.
- [ ] **Recompute `geometry.computeBoundingSphere()` after edits**, or the CPU raycaster early-rejects
      rays once terrain rises above its original bounds → the brush "falls through" the hill.
- [ ] **Rebuild the collider on stroke-END only**, never per dab. Use `createTrimeshCollider` with the
      live `positions` array (Rapier copies it). Shapes are immutable → remove + recreate.
- [ ] **Don't queue `requestSpawn`/`requestDestroy` from a brush.** You only edit buffers + swap a
      collider, so you never touch the single deferred-flush invariant.
- [ ] **Gate entity-pick when a tool is active** (`this.tools.active`) in both `bindEditorInput` and
      `resolvePendingPick`, or LMB will both paint and select.
- [ ] **Don't paint while RMB is held** (flycam look) — check `!input.isMouseButtonDown(2)`.
- [ ] **Stroke spacing**: apply dabs by accumulated travel (`spacing*radius`), not per `pointermove`,
      or slow drags dig holes.
- [ ] **Heightmap heights go in `state.terrains` (base64), NOT in `blueprint.params`** — keep the
      per-entity serialize loop tiny and autosave cheap.
- [ ] **Mouse and AI call the SAME `TerrainSystem` methods.** If you find yourself writing brush logic
      that only the pointer handler can reach, stop — that breaks the engine's text-first contract.
- [ ] **Seed everything random** (`mulberry32`) so noise/erosion are reproducible for an AI seed.
- [ ] **Terrain is a heightmap**: displace along **Y only**. "Along surface normals" would create
      overhangs a single-valued heightmap and its collider cannot represent — out of scope.

---

*End of spec. If anything here disagrees with the current source, the source wins — re-verify the
named file/line and update this doc.*
