# MIX Engine — Terrain Sculpting: Junior Dev Execution Playbook

Companion to [`MIX-Terrain-Sculpting-Plan.md`](MIX-Terrain-Sculpting-Plan.md). Read the **spec**
first — it is *what* to build and *why*. This **playbook** is *how* and *when*: orientation, the
exact edits to existing files, numbers you can test your code against, a debugging table for when
you're stuck, and the rules for when to ask instead of guess.

> If the spec and this playbook ever disagree, the **spec** wins. If either disagrees with the
> actual source, the **source** wins — re-open the named file and update the doc.

---

## Table of contents

1. [Day 0 — orientation (do this before writing code)](#1-day-0--orientation)
2. [Glossary — every term in the spec in plain English](#2-glossary)
3. [Worked numbers — test your math against these](#3-worked-numbers)
4. [File skeletons — the scaffolding to fill in](#4-file-skeletons)
5. [Exact wiring edits to existing files](#5-exact-wiring-edits)
6. [The world→engine→local coordinate rule (read twice)](#6-the-coordinate-rule)
7. [Per-milestone task checklists + Definition of Done](#7-per-milestone-checklists)
8. [Debugging playbook — symptom → cause → fix](#8-debugging-playbook)
9. [Brush parameter tuning tables](#9-tuning-tables)
10. [Manual QA script (copy-paste console commands)](#10-manual-qa-script)
11. [Unit test starter code](#11-unit-test-starter-code)
12. [Scope guardrails + ask-before-you-guess](#12-scope-guardrails)
13. [Pacing + the PR review rubric your reviewer will use](#13-pacing--pr-review-rubric)

---

## 1. Day 0 — orientation

**Goal of Day 0: run the engine, issue an existing command, run the tests, typecheck. Write zero
terrain code today.** You're learning the surfaces you'll plug into.

### Run it
```bash
npm install
npm run dev          # opens Vite dev server; open the printed localhost URL
```
You'll see the Naruto village landing scene with a character. Open the browser **DevTools console**.

### Talk to the engine from the console
The engine is exposed globally. Every editor action is also a text command (this is the whole point
of the engine). Try the existing API so you understand the path your terrain commands will join:
```js
// Spawn a box 5 m up (existing command — proves the command pipeline works):
window.engine.runScript([{ type: 'spawn_entity', x: 0, y: 5, z: 0, glbPath: '' , params:{ kind:'box' }}])
// Inspect the scene:
window.engine.sceneManager.entityCount
window.engine.helm.handle({ op: 'describe' }).then(console.log)
```
By M2 you'll type `window.engine.runScript([{ type:'terrain_create', x:0, z:0 }])` and it will work
the same way.

### Run the tests + typecheck
```bash
npm test                 # Vitest. Your new tests go in test/terrain.test.ts
npx tsc --noEmit         # typecheck
```
> ⚠️ **Known pre-existing breakage — NOT your fault, do not try to fix it.** `npx tsc` /
> `npm run build` currently reports type errors in **`src/ai/BehaviorTree.ts`**,
> **`src/ai/NavigationSystem.ts`**, and **`src/rendering/CullingSystem.ts`** (added by another
> contributor; the dev server runs anyway via esbuild). Your job: make sure **your** files add
> **zero** new errors. Verify by checking that every error tsc prints is in one of those three
> files (or their test files). If you introduce an error in a `src/terrain/*` or other file, fix it.

### Where your code will live
Re-read spec §1.1/§1.2. You are creating `src/terrain/*` and `src/engine/ToolManager.ts`, and
editing five existing files. Nothing else.

---

## 2. Glossary

| Term | Plain English |
| --- | --- |
| **Heightmap** | A 2D grid of height values. Each grid point has one height (Y). Cannot make caves/overhangs — that's why we only move vertices up/down, never sideways. |
| **Vertex grid** | The mesh is a lattice of `res × res` points. Point `(i,j)`: `i` = column (X), `j` = row (Z). Its array index is `idx(i,j) = j*res + i`. |
| **Cell / quad** | The square between 4 neighbouring vertices. There are `(res-1)²` cells, each drawn as 2 triangles. |
| **Dirty rect** | The rectangular block of vertices a brush touched this frame: `{i0,i1,j0,j1}` inclusive. We only re-upload and re-normal *this* block, not the whole grid — that's the whole performance trick. |
| **Falloff / hardness** | How brush strength fades from centre to rim. `hardness` 0 = soft dome, 1 = flat-topped disc. See `brushWeight()` in spec §3. |
| **Bilinear** | Reading a value at a point *between* 4 grid points by blending them by distance. Used to sample height at a fractional position (erosion droplets, height queries). |
| **Gradient** | The downhill direction + steepness at a point. For erosion: which way water flows. |
| **fBm** | "Fractional Brownian motion": add several octaves of noise at doubling frequency + halving amplitude to get natural-looking terrain. `octaves` = how many layers; `lacunarity` = frequency multiplier (2); `gain` = amplitude multiplier (0.5). |
| **Talus angle** | The steepest slope loose material stays put at. Thermal erosion slumps anything steeper. |
| **NDC** | Normalised Device Coordinates: screen pixel → `[-1,1] × [-1,1]` so a raycaster can shoot through it. |
| **Engine vs World vs Local space** | See §6. Getting these confused is the #1 source of "it works near the origin then breaks far away" bugs. |
| **Trimesh collider** | A physics surface built from triangle vertices+indices. Ours is rebuilt from the *same* buffer the mesh draws, so collision always matches the visual. |
| **Fixed body** | A Rapier rigid body that never moves and isn't pushed by physics. Terrain is one. |

---

## 3. Worked numbers

Use a small grid so you can hand-check. **`res = 5`, `size = 4`** ⇒ `cells = 4`, `step = 1`,
`half = 2`. Vertices span local X,Z from **−2 to +2**.

### Indices and positions
```
idx(i,j) = j*5 + i
idx(0,0)=0   idx(4,0)=4    (top row,  z=-2)
idx(0,1)=5   ...
idx(2,2)=12  ← centre, local (0, h, 0)
idx(4,4)=24  (last vertex, local (+2, h, +2))   → 25 vertices total
local(i,j) = ( i*1 - 2 ,  height ,  j*1 - 2 )
```

### First cell's two triangles (winding test)
Cell `(i=0,j=0)`: `a=idx(0,0)=0, b=idx(1,0)=1, c=idx(0,1)=5, d=idx(1,1)=6`.
Triangles: **`(0,5,1)`** and **`(1,5,6)`**. Both face **+Y** (up). If your terrain is black or
invisible from above, you wound them the other way.

### `rectFor(0, 0, R=1.5)`
`toI(x) = (x + 2) / 1`. `i0 = floor((0−1.5)+2) = floor(0.5) = 0`; `i1 = ceil((0+1.5)+2) = ceil(3.5) = 4`.
So the rect is the **whole 5×5 grid bounding box**, and `brushWeight` zeroes the corners outside the
circle. (The rect is a bounding box; the circle is enforced by the weight.)

### `brushWeight` values at `R=1.5, hardness=0`, brush at centre
| Vertex | local (x,z) | distance d | weight |
| --- | --- | --- | --- |
| (2,2) centre | (0,0) | 0 | **1.000** |
| (3,2) | (1,0) | 1.000 | **0.259** |
| (3,3) | (1,1) | 1.414 | **0.010** |
| (0,2) | (−2,0) | 2.000 | **0** (d ≥ R) |

Put these exact numbers in your `brushWeight` unit test (§11) — if your falloff matches this table,
it's correct.

### Ramp sanity (`res=21, size=20`, A=(−5,0,0), B=(5,10,0), halfWidth=2, hardness=1)
At the centreline (`z=0`): height at `x=−5 → 0`, `x=0 → 5`, `x=+5 → 10` (linear). Outside `|z|>2`:
unchanged. This is your ramp unit test.

---

## 4. File skeletons

Fill in the bodies using the spec's algorithms. These shells lock the **names and signatures** so
your layers line up. (Pure-kernel bodies — `applyRaise` etc. — are already fully written in spec §3;
copy them.)

### `src/engine/ToolManager.ts`
```ts
export interface EditorTool {
  readonly id: string;
  activate(): void;
  deactivate(): void;
  /** Optional per-frame tick while this tool is active (called by TerrainSystem.update). */
  tick?(dt: number): void;
}

export class ToolManager {
  active: EditorTool | null = null;

  setActive(tool: EditorTool | null): void {
    if (this.active === tool) return;
    this.active?.deactivate();
    this.active = tool;
    tool?.activate();
  }
}
```

### `src/terrain/TerrainField.ts`
```ts
import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Heightmap, type DirtyRect } from './Heightmap';

/** Owns the THREE mesh + Rapier collider for one terrain. The Heightmap is the source of truth. */
export class TerrainField {
  constructor(
    private readonly physicsWorld: PhysicsWorld,
    readonly rb: RigidBodyComponent,
    readonly hm: Heightmap,
    readonly geometry: THREE.BufferGeometry,
    readonly indices: Uint32Array,
    private collider: RAPIER.Collider,
  ) {}

  get mesh(): THREE.Object3D { return this.rb.mesh; }

  /** Push edited heights for `r` into the position buffer, recompute normals for r(+1 ring),
   *  mark the GPU range dirty, refresh bounds. See spec §4.2. */
  applyRect(r: DirtyRect): void { /* TODO */ }

  /** Local normals for the rect via central differences (spec §4.2 note). */
  private recomputeNormalsRect(r: DirtyRect): void { /* TODO */ }

  /** Remove + recreate the trimesh collider from the live position buffer. Stroke-END only. */
  rebuildCollider(): void { /* TODO — spec §4.3 */ }
}
```

### `src/terrain/TerrainSystem.ts`
```ts
import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { EntityId } from '../ecs/SceneManager';
import { TerrainField } from './TerrainField';
import * as K from './Heightmap';          // brushWeight + applyRaise/Smooth/Flatten/Ramp/Noise
import { makeFbm } from './noise';
import { erodeHydraulic, erodeThermal } from './erosion';

export interface TerrainCreateOpts {
  size?: number; resolution?: number; materialId?: string; seed?: number; baseNoiseAmplitude?: number;
}
export interface BrushSettings {
  radius: number; strength: number; hardness: number;       // shared
  targetHeight?: number; terraceStep?: number;              // flatten / terrace
}
export type BrushOp = 'raise' | 'lower' | 'smooth' | 'flatten' | 'terrace';

const STRENGTH_SCALE = 20; // strength 1 ⇒ ~20 m/s at the brush centre. Tune later.

export class TerrainSystem {
  private readonly fields = new Map<EntityId, TerrainField>();
  // ... erosion job queue (spec §8.3)

  constructor(private readonly engine: Engine) {
    engine.addUpdateHook((dt) => this.update(dt));
  }

  // --- registry ---
  field(id: EntityId): TerrainField | null { /* lazily read mesh.userData.terrain — spec §8 */ return null; }
  firstField(): TerrainField | null { /* the single/last terrain */ return null; }

  // --- creation ---
  /** MUST use sceneManager.spawnNow (returns the id synchronously so we can register the field). */
  create(world: THREE.Vector3, opts: TerrainCreateOpts): EntityId { /* TODO */ return 0; }

  // --- ops. NOTE the two coordinate conventions (see playbook §6): ---
  /** Mouse path: cx,cz are already TERRAIN-LOCAL (from the raycast). */
  sculptLocal(f: TerrainField, op: BrushOp, cx: number, cz: number, amount: number, s: BrushSettings): void { /* TODO */ }
  /** AI path: worldX,worldZ are WORLD space — convert world→engine→local in here. */
  sculptWorld(f: TerrainField, op: BrushOp, worldX: number, worldZ: number, amount: number, s: BrushSettings): void { /* TODO */ }

  strokeWorld(f, op, worldPts: [number,number][], amount, s): void { /* dab along a polyline */ }
  rampWorld(f, fromW: [number,number,number], toW: [number,number,number], width: number, hardness: number): void { /* TODO */ }
  noiseWorld(f, worldX, worldZ, radius, amplitude, frequency, seed, octaves, hardness): void { /* TODO */ }
  erode(f, region, kind: 'hydraulic'|'thermal', opts): void { /* enqueue job — spec §8.3 */ }
  sampleHeightWorld(f, worldX: number, worldZ: number): number { /* world→engine→local → hm.sampleLocal → +mesh world Y */ return 0; }
  reset(f): void { /* zero heights, full applyRect, rebuildCollider */ }

  private update(dt: number): void {
    this.engine.tools.active?.tick?.(dt);   // drive the active brush tool
    // ... step erosion jobs in batches (spec §8.3)
  }
}
```

### `src/terrain/TerrainBrushTool.ts`
```ts
import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { EditorTool } from '../engine/ToolManager';
import type { TerrainField } from './TerrainField';
import type { BrushOp, BrushSettings } from './TerrainSystem';

export class TerrainBrushTool implements EditorTool {
  readonly id = 'terrain-brush';
  brushOp: BrushOp = 'raise';
  readonly settings: BrushSettings = { radius: 20, strength: 0.5, hardness: 0.5 };

  private painting = false;
  private readonly center = new THREE.Vector3();
  private readonly lastDab = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private readonly ray = new THREE.Raycaster();
  private px = 0; private py = 0;
  private cursor!: THREE.Mesh;            // ring decal
  private offs: Array<() => void> = [];

  constructor(private readonly engine: Engine) { /* build cursor ring; add to scene; visible=false */ }

  private get canvas() { return this.engine.viewport.renderer.domElement; }

  activate(): void { /* add pointermove listener; subscribe input pointerdown/up; cursor.visible=true */ }
  deactivate(): void { /* remove listeners; endStroke(); cursor.visible=false */ }

  private beginStroke(): void { /* painting=true; lastDab.set(0,0,0); snapshot for undo (spec §10.1) */ }
  private endStroke(): void { /* painting=false; field.rebuildCollider(); history.commit(); dispatch mix:scene-changed */ }

  private hitLocal(field: TerrainField, out: THREE.Vector3): boolean { /* spec §7.3 */ return false; }

  tick(dt: number): void { /* spec §7.4: raycast, spacing, call engine.terrain.sculptLocal(...) */ }
}
```

### `src/terrain/TerrainHistory.ts`
```ts
import type { EntityId } from '../ecs/SceneManager';
import type { DirtyRect } from './Heightmap';
import type { TerrainField } from './TerrainField';

interface Entry { field: TerrainField; rect: DirtyRect; before: Float32Array; after: Float32Array; }

export class TerrainHistory {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private pending: { field: TerrainField; rect: DirtyRect; before: Float32Array } | null = null;
  private readonly CAP = 32;

  beginStroke(field: TerrainField, rect: DirtyRect): void { /* snapshot rect heights → before */ }
  commit(): void { /* read rect → after; push entry; trim to CAP; clear redo */ }
  undo(): void { /* write before; applyRect; rebuildCollider; move to redo */ }
  redo(): void { /* symmetric */ }
}
```

---

## 5. Exact wiring edits

These are the precise insertion points in existing files. Line numbers are where I read them today;
if they drifted, the surrounding code quoted here is your anchor.

### `src/engine/Engine.ts`

**(a) Declare the two new fields** near the other `readonly` subsystem fields (by `vehicles`, ~line 67):
```ts
  readonly tools: import('./ToolManager').ToolManager;
  readonly terrain: import('../terrain/TerrainSystem').TerrainSystem;
```
(Or add normal `import` statements at the top and use bare type names — match the file's style.)

**(b) Construct them right after the `VehicleSystem` block** (after line 183, *before* the SENSORIUM
construction at line 184) — terrain must exist before the `AIBridge` deps object on line 192:
```ts
    this.tools = new ToolManager();
    this.terrain = new TerrainSystem(this);
```

**(c) Add `terrain` to the AIBridge deps object** (the `new AIBridge({ … })` at line 192):
```ts
      vehicles: this.vehicles,
      terrain: this.terrain,      // ← add
```

**(d) Gate entity-picking when a tool owns LMB.** In `bindEditorInput` (line 711):
```ts
    this.input.on('pointerdown', (p) => {
      if (this.tools.active) return;                      // ← add: a brush owns LMB
      if (p.button === 0 && this.input.mode === 'editor' && !this.input.isMouseButtonDown(2)) {
        this.pendingPick = { x: p.x, y: p.y };
      }
    });
```
In `processEditorInput` (line 724) make the gizmo hotkeys also exit the tool, and gate the pick:
```ts
      if (this.input.isKeyPressed('Digit1')) { this.tools.setActive(null); this.gizmo.setMode('translate'); }
      if (this.input.isKeyPressed('Digit2')) { this.tools.setActive(null); this.gizmo.setMode('rotate'); }
      if (this.input.isKeyPressed('Digit3')) { this.tools.setActive(null); this.gizmo.setMode('scale'); }
      …
    if (this.input.isKeyPressed('Escape')) {
      this.tools.setActive(null);                          // ← add
      this.input.setMode('editor');
      this.gizmo.detach();
    }
    …
    if (this.input.mode === 'editor' && !this.tools.active) this.resolvePendingPick();  // ← gate
```

### `src/engine/builders.ts`
Add the `'terrain'` builder exactly as spec §4.4. It uses the existing helpers already in this file:
`num()`, `resolveMaterial()`, `makeBodyDesc()`, `RigidBodyComponent`,
`ctx.physicsWorld.createTrimeshCollider`. Import `Heightmap`, `buildGeometry`, `TerrainField` from
`../terrain/*`.

### `src/ai/AIBridge.ts`
1. **Import** the type: `import type { TerrainSystem } from '../terrain/TerrainSystem';`
2. **Deps:** add `terrain: TerrainSystem;` to the deps interface (the `AIBridge` constructor's param
   type) and `this.terrain = deps.terrain;` where the other deps are stored — copy how `nav`,
   `culling`, `vehicles` were threaded (they're the most recent additions; grep `vehicles` to see
   all three spots: interface, store, usage).
3. **Union:** paste the `terrain_*` block from spec §9.1 into the `AICommand` union.
4. **Switch:** paste the `case 'terrain_*'` lines from spec §9.2 into the `processQueue()` switch
   (after line 459).
5. **Handlers:** add the methods. Here are the two that establish the pattern — the rest follow:
```ts
  private resolveTerrain(entityId?: EntityId) {
    return entityId !== undefined ? this.terrain.field(entityId) : this.terrain.firstField();
  }

  private handleTerrainCreate(cmd: Extract<AICommand, { type: 'terrain_create' }>): void {
    // y is baked into the heightmap; the terrain plane starts at world y=0.
    const world = new THREE.Vector3(cmd.x, 0, cmd.z);
    this.terrain.create(world, {                 // create() uses spawnNow → entity appears for HELM `do` diff
      size: cmd.size, resolution: cmd.resolution,
      materialId: cmd.materialId, seed: cmd.seed, baseNoiseAmplitude: cmd.baseNoiseAmplitude,
    });
  }

  private handleTerrainSculpt(cmd: Extract<AICommand, { type: 'terrain_sculpt' }>): void {
    const f = this.resolveTerrain(cmd.entityId); if (!f) return;
    const amount = (cmd.strength ?? 0.5) * /* STRENGTH_SCALE handled inside system for a single stamp */ 1;
    this.terrain.sculptWorld(f, cmd.op, cmd.x, cmd.z, amount, {      // WORLD coords → sculptWorld (see §6)
      radius: cmd.radius, strength: cmd.strength ?? 0.5, hardness: cmd.hardness ?? 0.5,
      targetHeight: cmd.targetHeight, terraceStep: cmd.terraceStep,
    });
    f.rebuildCollider();                         // single-stamp AI op: rebuild now (not a live stroke)
  }
```
> You do **not** manually report created entities — HELM's `do` diffs the entity-id set
> automatically (that's why `create()` must go through `sceneManager.spawnNow`). Errors are captured
> by the bridge's console tap. Don't reinvent either.

### `src/helm/manifest.ts`
Append the command entries from spec §9.3 to `HELM_MANIFEST.commands` and bump `HELM_VERSION`
(e.g. `1.1.0` → `1.2.0`).

### `src/main.ts` (3.2k lines — use these grep anchors, don't scroll)
- **Persist heights — serialize:** search `function serializeSceneState` (line 223). After the
  `for (const id of entityIds)` loop and before `const state = {`, build the `terrains` map (spec
  §10.2) and add `terrains` to the `state` object literal.
- **Persist heights — deserialize:** search `function deserializeSceneState` (line 283). After the
  entity spawn loop and the parent-relations apply, add the height re-apply loop (spec §10.2).
- **Helpers:** put `f32ToB64` / `b64ToF32` in `src/ui/domUtils.ts` (where `escapeHtml`/`showToast`
  already live) and import them.
- **Toolbar:** search for where the gizmo translate/rotate/scale buttons are created (grep
  `gizmo` / `translate` in the UI-build section). Add the terrain buttons + the brush settings panel
  alongside, wired to `engine.tools.setActive(brushTool)` + `brushTool.brushOp = …` (spec §11).
  Construct the single `TerrainBrushTool` here: `const brushTool = new TerrainBrushTool(engine);`.
- **Undo routing:** search the keyboard handler for `KeyZ` (or `ctrlKey`). When
  `engine.tools.active?.id === 'terrain-brush'`, route Ctrl+Z/Ctrl+Y to the terrain history; else
  fall through to the existing scene undo.

---

## 6. The coordinate rule

**Read this twice. It is the single most likely thing to bite you.**

`mesh.worldToLocal(p)` converts a point from **scene space (= engine space)** into the terrain's
local grid space. It does **not** know about world space (the floating-origin world coords the AI and
serializer use). So:

| Entry point | Input coords | Conversion before `worldToLocal` |
| --- | --- | --- |
| **Mouse tool** (raycast hit) | already **engine** space | none — call `worldToLocal(hit)` directly |
| **AI command** (`terrain_*`) | **world** space | first `engine.worldOrigin.toEngineSpace(v)`, *then* `worldToLocal` |

That's why `TerrainSystem` has **two** entry methods: `sculptLocal` (mouse) and `sculptWorld` (AI).
`sculptWorld` does the `toEngineSpace` step; `sculptLocal` does not. **If you only build one method
and feed it both, terrain edits will land in the wrong spot the moment the floating origin shifts**
(which happens automatically once the camera travels far from spawn). It will look fine near spawn in
your first test and "mysteriously break later" — exactly the bug this rule prevents.

Same rule for `sampleHeightWorld`, `rampWorld`, `noiseWorld`, `strokeWorld`: convert world→engine
first, then to local.

---

## 7. Per-milestone checklists

Each milestone is one PR. Don't start the next until the **Definition of Done** passes.

### M1 — Pure core (`Heightmap.ts`, `noise.ts`, `erosion.ts`)
- [ ] `Heightmap` class with `idx/at/sampleLocal/rectFor` + `heights`.
- [ ] `brushWeight` + all five kernels (`applyRaise/Smooth/Flatten/Ramp/Noise`) — copy from spec §3.
- [ ] `mulberry32` + `makeFbm`.
- [ ] `erodeThermal` + `erodeHydraulic`.
- [ ] `test/terrain.test.ts` covering §11.
- **DoD:** `npm test` green; **grep these three files for `three` and `rapier` — zero hits** (they
  must be pure); the §3 worked-number table reproduces in a test.

### M2 — Terrain entity (`TerrainField.ts`, `'terrain'` builder, `terrain_create`)
- [ ] `buildGeometry` (spec §4.1) + `TerrainField.applyRect`/`rebuildCollider`.
- [ ] `'terrain'` builder registered (spec §4.4).
- [ ] `TerrainSystem.create/field/firstField`; engine wiring §5(a–c).
- [ ] `terrain_create` command + handler + manifest entry.
- **DoD:** `window.engine.runScript([{type:'terrain_create',x:0,z:0}])` spawns a flat lit grid; the
  character capsule **rests on it** (collider works); it shows in the outliner; save+reload keeps it
  (flat). No new tsc errors.

### M3 — Raise/Lower/Smooth/Flatten (`TerrainBrushTool.ts`, `ToolManager`, gating, toolbar)
- [ ] `ToolManager` + engine gating §5(d).
- [ ] `TerrainBrushTool` (pointer pipeline, raycast, spacing, cursor ring).
- [ ] `sculptLocal`/`sculptWorld`; `terrain_sculpt` command.
- [ ] Toolbar buttons + radius/strength/hardness sliders.
- **DoD:** dragging LMB raises/lowers/smooths/flattens live; the gizmo does **not** select while a
  brush is active; perf stays smooth on a 257² grid (dirty-rect only); after releasing, the capsule
  walks the new hill (collider rebuilt on stroke-end); Flatten "Sample" picks the clicked height.

### M4 — Ramp + Terrace + Noise
- [ ] Two-click ramp (anchor A, anchor B, apply) + `terrain_ramp`.
- [ ] Terrace mode (terraceStep) in the flatten kernel + UI.
- [ ] `noiseWorld` + `terrain_noise` (deterministic by seed).
- **DoD:** ramp grades linearly between clicks (verify against §3 ramp numbers); the same seed twice
  gives identical noise; terrace produces stepped plateaus.

### M5 — Erosion
- [ ] `erode` enqueues async jobs; `update` runs batches (spec §8.3).
- [ ] `terrain_erode` (hydraulic + thermal).
- **DoD:** eroding a noisy hill carves visible channels over a few frames with **no frame hitch**;
  no NaN; thermal conserves total height.

### M6 — Undo + persistence + manifest + text-first proof
- [ ] `TerrainHistory` (tile-diff) + Ctrl+Z/Y routing.
- [ ] Heights in scene-state (`f32ToB64`/`b64ToF32`).
- [ ] All `terrain_*` in the HELM manifest; version bumped.
- **DoD:** Ctrl+Z reverts the last stroke; reload restores a sculpted terrain **exactly**; the §10
  pure-text AI build sequence produces a raised, eroded hill and `terrain_sample` returns non-zero.

---

## 8. Debugging playbook

| Symptom | Most likely cause | Fix |
| --- | --- | --- |
| Terrain is **black / invisible from above**, visible from below | Triangle winding reversed → normals point down | Use the exact index order in spec §4.1 (`a,c,b` then `b,c,d`). Verify with the §3 first-cell example. |
| Brush works near spawn, **lands in the wrong place after flying far** | Forgot world→engine conversion on the AI path | See §6. AI commands must `worldOrigin.toEngineSpace` before `worldToLocal` (use `sculptWorld`, not `sculptLocal`). |
| Raising a hill, then the brush **stops hitting it / "falls through"** | Stale `boundingSphere`; raycaster early-rejects | Call `geometry.computeBoundingSphere()` in `applyRect` (spec §4.2 step 4). |
| **Holes / pits where I dragged slowly** | A dab every `pointermove` (over-applied where the mouse lingered) | Use travel-based spacing: one dab per `spacing*radius` of cursor travel (spec §7.4). |
| LMB **both paints and selects** an object | Pick not gated | Add `if (this.tools.active) return;` in `bindEditorInput` and gate `resolvePendingPick` (§5d). |
| Smooth brush **shifts terrain in the drag direction** instead of softening | Reading already-smoothed neighbours (in-place) | Snapshot the rect+ring first; blur from the snapshot (spec §3.2). |
| Erosion makes **needle spikes**, not channels | `erosionRadius` 0 (single-vertex erosion) or eroding more than `−dH` | Spread erosion over the kernel; clamp `take ≤ −dH` (spec §6.1). |
| Erosion **does nothing** | Inertia too high / evaporation too fast / region flat | Lower `inertia` toward 0.05; check droplets actually move (gradient non-zero); run on a *noisy* hill. |
| Character **falls through** the terrain after sculpting | Collider not rebuilt, or rebuilt with wrong buffer | `rebuildCollider()` on stroke-end using the live `position` array + static `indices` (spec §4.3). |
| **Faceted seams** between edited and unedited areas | Normals recomputed for the rect but not the 1-vertex ring | Expand the normal recompute by one vertex around the rect. |
| Frame **hitch** during a fast drag | Full-grid `computeVertexNormals`/`computeBoundingSphere` per dab, or collider rebuilt per dab | Rect-only normals; bounds are cheap but keep them; collider on stroke-end only. |
| `NaN` spreads across the heightmap | Divide-by-zero in a gradient/normalise (flat patch) or droplet leaving bounds | Guard `len < 1e-6` (break); clamp reads with `Heightmap.at`; bounds-check droplet `nx,nz`. |
| Terrain **doesn't persist** across reload | Heights left in `blueprint.params` (skipped) or `state.terrains` not applied | Store heights in `state.terrains` and re-apply after spawn (spec §10.2). |
| Noise **changes every run** | `SimplexNoise` seeded with `Math` | Seed it with `mulberry32(seed)` (spec §5). |
| tsc errors you didn't write | Pre-existing breakage in BehaviorTree/NavigationSystem/CullingSystem | Not yours — see §1. Confirm every error is in those 3 files. |

---

## 9. Tuning tables

Ship with these defaults; expose the **bold** ones as UI sliders.

### Shared brush
| Param | Default | Range | Increasing it… |
| --- | --- | --- | --- |
| **radius** (m) | 20 | 1–100 | wider area affected |
| **strength** | 0.5 | 0–1 | faster height change (×`STRENGTH_SCALE`=20 m/s at centre) |
| **hardness** | 0.5 | 0–1 | bigger flat top, sharper rim (0 = soft dome, 1 = disc) |
| spacing | 0.25 | 0.1–0.5 | fewer dabs per drag (lower = smoother but heavier) |

### Noise
| Param | Default | Note |
| --- | --- | --- |
| amplitude (m) | 3 | peak height added |
| frequency (cyc/m) | 0.02 | smaller = broader hills |
| octaves | 5 | more = finer detail (cost ↑) |
| lacunarity / gain | 2 / 0.5 | leave unless you know why |

### Hydraulic erosion
| Param | Default | Note |
| --- | --- | --- |
| iterations | 50000 | droplets total (per 256² tile); spread over frames |
| inertia | 0.05 | 0 follows gradient; ↑ = straighter channels |
| capacityFactor | 4 | ↑ = carries more → deeper carving |
| erodeSpeed / depositSpeed | 0.3 / 0.3 | carve vs fill rate |
| evaporateSpeed | 0.01 | ↑ = shorter droplet life |
| gravity | 4 | ↑ = faster flow → more erosion |
| erosionRadius | 3 | spread of each erosion (≥2 to avoid spikes) |

### Thermal erosion
| Param | Default | Note |
| --- | --- | --- |
| talus (m/cell) | ≈ `tan(35°)*step` ≈ 0.7 | max stable step; ↓ = flatter result |
| factor | 0.5 | slump rate; keep ≤ 0.5 (oscillates above) |
| iterations | 20 | more = smoother slopes |

---

## 10. Manual QA script

After M5, paste these into the DevTools console one block at a time and confirm the **Expect**.

```js
// 1. Create + raise a hill (pure text — proves AI parity)
window.engine.runScript([
  { type:'terrain_create', x:0, z:0, size:256, resolution:257 },
  { type:'terrain_sculpt', op:'raise', x:0, z:0, radius:40, strength:0.9 },
])
// Expect: a flat grid appears, then a smooth dome rises at the centre.

// 2. Sample the height you just made
window.engine.runScript([{ type:'terrain_sample', x:0, z:0 }])
window.engine.aiBridge.lastQueryResult        // Expect: a positive number (the dome height)

// 3. Carve a road with a stroke
window.engine.runScript([{ type:'terrain_stroke', op:'lower', radius:6, strength:0.8,
  points:[[-60,0],[-20,10],[20,-10],[60,0]] }])
// Expect: a sunken winding path across the terrain.

// 4. Ramp (road onto the hill)
window.engine.runScript([{ type:'terrain_ramp', from:[-40,0,0], to:[0,18,0], width:8 }])
// Expect: a straight graded slope from ground up to the hilltop.

// 5. Noise + hydraulic erosion
window.engine.runScript([
  { type:'terrain_noise', x:0, z:0, radius:120, amplitude:4, seed:7 },
  { type:'terrain_erode', kind:'hydraulic', iterations:40000 },
])
// Expect: rough detail appears, then branching erosion channels carve in over ~1–2 s (no freeze).
```
**Mouse pass:** click each toolbar brush, drag on the terrain, confirm the live behaviour matches the
brush; press **Esc** and confirm you can select objects again; **Ctrl+Z** reverts your last stroke;
**reload** the page and confirm the terrain comes back identical.

---

## 11. Unit test starter code

`test/terrain.test.ts` — real, runnable. Extend to cover every kernel.

```ts
import { describe, it, expect } from 'vitest';
import {
  Heightmap, brushWeight, applyRaise, applySmooth, applyFlatten, applyRamp,
} from '../src/terrain/Heightmap';
import { makeFbm } from '../src/terrain/noise';
import { erodeThermal, erodeHydraulic } from '../src/terrain/erosion';
import { mulberry32 } from '../src/terrain/noise';

describe('brushWeight', () => {
  it('matches the worked-number table', () => {
    expect(brushWeight(0, 1.5, 0)).toBeCloseTo(1, 6);
    expect(brushWeight(1, 1.5, 0)).toBeCloseTo(0.259, 2);
    expect(brushWeight(1.4142, 1.5, 0)).toBeCloseTo(0.010, 2);
    expect(brushWeight(2, 1.5, 0)).toBe(0);
  });
  it('hardness makes a flat top and is monotonic', () => {
    expect(brushWeight(1, 5, 1)).toBe(1);                 // inside inner radius
    expect(brushWeight(2, 5, 0)).toBeGreaterThan(brushWeight(3, 5, 0));
  });
});

describe('applyRaise', () => {
  it('raises the centre by amount and leaves far vertices untouched', () => {
    const hm = new Heightmap(7, 6);                       // step 1, half 3
    applyRaise(hm, 0, 0, 2, 0, 1, +1);
    expect(hm.heights[hm.idx(3, 3)]).toBeCloseTo(1, 6);   // centre, w=1
    expect(hm.heights[hm.idx(0, 0)]).toBe(0);             // corner, d>R
  });
});

describe('applySmooth (read-before-write)', () => {
  it('lowers a spike and raises its neighbour', () => {
    const hm = new Heightmap(7, 6);
    hm.heights[hm.idx(3, 3)] = 9;
    applySmooth(hm, 0, 0, 2.5, 0, 1);
    expect(hm.heights[hm.idx(3, 3)]).toBeLessThan(9);
    expect(hm.heights[hm.idx(4, 3)]).toBeGreaterThan(0);
  });
});

describe('applyFlatten', () => {
  it('converges toward the target', () => {
    const hm = new Heightmap(7, 6);
    for (let k = 0; k < hm.heights.length; k++) hm.heights[k] = 5;
    for (let n = 0; n < 50; n++) applyFlatten(hm, 0, 0, 2, 0, 1, 2);  // target 2
    expect(hm.heights[hm.idx(3, 3)]).toBeCloseTo(2, 1);
  });
});

describe('applyRamp', () => {
  it('interpolates height linearly along the segment', () => {
    const hm = new Heightmap(21, 20);                     // step 1, half 10, x in [-10,10]
    applyRamp(hm, { x: -5, y: 0, z: 0 }, { x: 5, y: 10, z: 0 }, 2, 1);
    const at = (x: number) => hm.heights[hm.idx(x + 10, 10)]; // z=0 row is j=10
    expect(at(-5)).toBeCloseTo(0, 1);
    expect(at(0)).toBeCloseTo(5, 1);
    expect(at(5)).toBeCloseTo(10, 1);
  });
});

describe('noise', () => {
  it('is deterministic for a fixed seed and bounded', () => {
    const a = makeFbm(42), b = makeFbm(42);
    expect(a(1.3, 2.7, 0.1)).toBeCloseTo(b(1.3, 2.7, 0.1), 6);
    expect(Math.abs(a(9.1, -4.2, 0.05))).toBeLessThanOrEqual(1);
  });
});

describe('erosion', () => {
  it('thermal conserves total height', () => {
    const res = 16, h = new Float32Array(res * res);
    const rng = mulberry32(1); for (let i = 0; i < h.length; i++) h[i] = rng() * 10;
    const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);
    const before = sum(h);
    erodeThermal(h, res, 0.5, 0.5, 10, { i0: 0, i1: res - 1, j0: 0, j1: res - 1 });
    expect(sum(h)).toBeCloseTo(before, 2);
  });
  it('hydraulic produces no NaN and changes the field', () => {
    const res = 32, h = new Float32Array(res * res);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) h[j * res + i] = (res - i) * 0.5; // slope
    const copy = Float32Array.from(h);
    erodeHydraulic(h, res, {
      iterations: 500, maxLifetime: 30, inertia: 0.05, capacityFactor: 4, minCapacity: 0.01,
      depositSpeed: 0.3, erodeSpeed: 0.3, evaporateSpeed: 0.01, gravity: 4, erosionRadius: 3,
      startSpeed: 1, startWater: 1,
    }, mulberry32(7), { i0: 1, i1: res - 2, j0: 1, j1: res - 2 });
    expect(h.every(Number.isFinite)).toBe(true);
    expect(h.some((v, k) => v !== copy[k])).toBe(true);
  });
});

describe('Heightmap.sampleLocal', () => {
  it('bilinearly samples between vertices', () => {
    const hm = new Heightmap(5, 4);                       // step 1, half 2
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) hm.heights[hm.idx(i, j)] = i * 1 - 2; // = local x
    expect(hm.sampleLocal(0.5, 0)).toBeCloseTo(0.5, 6);
  });
});
```
Add a serialization round-trip test once `f32ToB64`/`b64ToF32` exist (use exactly-representable
floats like `[1.5, -2.25, 0.5, 128, 1024.5]`).

---

## 12. Scope guardrails

### Out of scope for this assignment — do NOT build (it'll blow the timeline)
- Multiple terrain **tiles / chunked streaming** of terrain (one tile per terrain entity is fine; the
  architecture already allows many, but don't build tiling UX now).
- **Texture splatting / multi-material painting** (grass vs rock blends). One material for now.
- **GPU compute** erosion/sculpting. CPU + dirty-rect is the plan; it's fast enough.
- **Overhangs / caves / voxels.** A heightmap is single-valued by definition — Y displacement only.
- Switching the collider to a Rapier **heightfield** (left as a noted optimisation; trimesh for v1).
- A separate binary terrain **save endpoint**. Base64 in scene-state is the v1 plan.

### Ask your reviewer BEFORE you do any of these (they touch load-bearing invariants)
- Changing anything in **`WorldOrigin`** or the floating-origin shift, or `InputManager`'s core
  event handling. The brush should need **zero** changes there — if you think it does, ask first.
- Calling `requestSpawn`/`requestDestroy` or otherwise touching the **deferred-flush** loop step
  from brush code. (You shouldn't need to — you only edit buffers + swap a collider.)
- Changing the **scene-state format** beyond adding the `terrains` key (other systems read it).
- Adding a new **npm dependency**. Noise ships with three; everything else is in-repo. If you think
  you need a package, ask — the answer is almost certainly "no."
- Editing files **outside** your scope list (spec §1.2) to "make it work."

---

## 13. Pacing + PR review rubric

### Realistic pace (a junior, part of a normal workload)
| Milestone | Estimate |
| --- | --- |
| M1 pure core + tests | 1–2 days |
| M2 terrain entity | 1–2 days |
| M3 the three live brushes | 3–4 days |
| M4 ramp/terrace/noise | 2 days |
| M5 erosion | 2–3 days |
| M6 undo/persistence/manifest | 2–3 days |

≈ **2–3 weeks** total. If you're stuck for more than ~half a day on one thing, open a draft PR and
ask — that's expected, not a failure.

### The rubric your reviewer will use (self-check before requesting review)
- [ ] **Layering:** brush math is in `Heightmap.ts` (pure); `TerrainField` does GPU+physics;
      `TerrainSystem` is the only thing both front-ends call. No brush logic hidden in a pointer
      handler.
- [ ] **Text-first parity:** every brush is reachable via a `terrain_*` AI command, and the mouse
      tool calls the same `TerrainSystem` methods.
- [ ] **Coordinate rule (§6):** AI path converts world→engine→local; mouse path uses local from the
      raycast. Verified far from spawn.
- [ ] **Perf:** dirty-rect only; collider rebuilt on stroke-end; erosion batched. No full-grid work
      per dab.
- [ ] **Correctness guards:** read-before-write smoothing; bounds refreshed; NaN-guarded; seeded RNG.
- [ ] **Tests:** §11 green; pure files have no THREE/Rapier imports.
- [ ] **No new tsc errors** outside the 3 known-broken files; no out-of-scope edits; no new deps.
- [ ] **Persistence:** sculpted terrain survives reload exactly; Ctrl+Z reverts a stroke.

When you ask for help, paste: the **symptom**, what you **expected**, the relevant **console output**,
and the **smallest command/gesture** that reproduces it. That gets you unblocked fastest.

---

*End of playbook. Build M1 → M6 in order. When in doubt, prefer the boring, obvious implementation and
ask before touching a load-bearing invariant (§12).*
