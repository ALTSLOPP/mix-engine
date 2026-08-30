# MIX Engine — Phase 3 & 4 Implementation Handoff (for Codex)

You are continuing a 4-phase "Core Engine Architecture Upgrades" effort on the **MIX Engine**, an
AI-native, text-first 3D game engine. Phases 1 (async terrain physics) and 2 (chunked-LOD terrain)
are **done, tested, and verified**. Your job is to implement **Phase 3 (multi-layer material
painting)** and then **Phase 4 (spline deformers)**, to the same quality bar, without regressing
Phases 1–2.

Work **one phase at a time**: pure kernel + test → glue → tool → AICommand → live-verify → only then
start the next phase. Do not start Phase 4 until Phase 3 is green.

---

## 0. Stack, repo, and how to run

- Path: `C:\Users\Jetma\Downloads\mix engine`. Stack: **TypeScript · Vite 6 · Three.js r0.170 ·
  Rapier3D (`@dimforge/rapier3d-compat` 0.14)**. Windows; shell is PowerShell or Git Bash.
- Verify constantly:
  - `npx tsc --noEmit` → MUST exit 0 (zero errors).
  - `npx vitest run` → all green. Add Vitest tests for every new pure kernel.
  - Live: `npm run dev` (or use the `.claude/launch.json` config named `mix-engine`, port **5180**).
- The engine is exposed in the browser as **`window.engine`**. Boot is slow (~30–60 s; it preloads
  ~119 GLB assets) — wait for `window.engine` to be set before driving it.

### Live-verification reality (READ THIS — it will save you hours)
The headless preview tab **backgrounds**, which collapses the canvas to **1×1** and pauses `requestAnimationFrame`.
Therefore: **screenshots and visual diffs time out — do not rely on them.** Verify **functionally** via
JS eval against `window.engine`:
- Drive terrain through `window.engine.terrain`, physics through `window.engine.physicsWorld`, camera
  through `window.engine.viewport.camera`.
- To make a `THREE.Vector3` inside an eval without importing THREE: `engine.viewport.camera.position.clone().set(x,y,z)`.
- To confirm rendering is healthy without a screenshot: call `engine.viewport.renderer.render(engine.viewport.scene, engine.viewport.camera)` inside a try/catch and check `gl.getError() === 0`.
- The engine loop is throttled in the background; when you need a deterministic result, call the relevant
  update method directly (e.g. `field.updateLOD(camera)`, `engine.physicsWorld.step(1/60)`) rather than
  waiting on the loop.

---

## 1. The terrain architecture you are building on (read these files first)

Read **all** of `src/terrain/`, plus `src/ai/AIBridge.ts`, `src/engine/builders.ts`,
`src/engine/ToolManager.ts`, `src/materials/MaterialManager.ts`, `src/materials/TexturePresets.ts`,
`src/helm/manifest.ts`, and the terrain UI wiring + serialize/deserialize in `src/main.ts`. Also skim
`test/terrain.test.ts`, `test/chunkGeometry.test.ts`, `test/terrainCollider.test.ts` for the test idiom.

Key pieces:
- **`src/terrain/Heightmap.ts`** — PURE, Vitest-tested. The single source of truth for height. Row-major
  `heights[j*res+i]`, with `i`→local +x, `j`→local +z. `res` = verts/side, `cells` = res−1, `size` =
  metres, `step` = size/cells, `half` = size/2. Local position of vertex (i,j): `x=i*step−half`,
  `z=j*step−half`, `y=heights`. Has `sampleLocal(x,z)` (bilinear), `at(i,j)` (clamped), `rectFor(...)`,
  `toI/toJ`. The brush kernels (`applyRaise/Smooth/Flatten/Ramp/Noise`, `brushWeight`) are pure module
  functions here.
- **`src/terrain/TerrainField.ts`** — owns ONE terrain: the Heightmap, the chunked render layer
  (`TerrainChunkGrid`, parented under `rb.mesh` which is a `THREE.Group` at the terrain origin), and the
  single Rapier **heightfield** collider. Constructor:
  `(physicsWorld, rb, hm, material, collider|null, chunkConfig?)`. Key methods: `applyRect(rect)` (marks
  overlapping chunks dirty — call this after ANY heightmap edit so the render updates), `updateLOD(camera)`,
  `markColliderDirty()` (debounced background collider rebuild — call after edits that change collision),
  `rebuildCollider()` (sync), `sample* via TerrainSystem`, `colliderInfo()`. **`packRapierHeights` and the
  heightfield collider logic are correct and load-bearing — do not touch them (see gotcha §3).**
- **`src/terrain/TerrainChunkGrid.ts`** + **`src/terrain/chunkGeometry.ts`** — the chunked-LOD RENDER
  layer. Chunk meshes share ONE material; UVs are global (`i/cells`, `j/cells` across the whole terrain).
  The terrain material is **DoubleSide** (skirts hide LOD seams). `info()` gives LOD/chunk introspection.
- **`src/terrain/TerrainSystem.ts`** — THE single API that BOTH the viewport tools AND the `terrain_*`
  AICommands call (this is the parity seam). Has `field(id)`, `firstField()`, `create()`,
  `sculptLocal/sculptWorld`, `rampLocal/rampWorld`, `noiseLocal/noiseWorld`, `erode`, `sampleHeightWorld`,
  `reset`. Its `update(dt)` ticks the active tool, the collider rebuild, chunk LOD, and erosion jobs. It is
  registered via `engine.addUpdateHook`. **Add your new system-level methods here** (paintWorld,
  splineConformWorld, etc.) so the tool and the AICommand share them.
- **`src/terrain/TerrainBrushTool.ts`** — the viewport sculpt tool. Implements `EditorTool`
  (`activate/deactivate/tick`). Raymarches the heightmap in `hitLocal` to find the cursor world point.
  **Mirror this structure for your new tools** (cursor, pointer events, beginStroke/endStroke, dab spacing).
- **`src/engine/ToolManager.ts`** — `EditorTool` interface + `engine.tools.active` (gates entity-pick).
  Activate a tool with `engine.tools.setActive(tool)`.
- **`src/engine/builders.ts`** — the `'terrain'` builder (`registerBuilder('terrain', ...)`). Terrain root
  is a `THREE.Group`, FIXED Rapier body, builds the `TerrainField`. `resolveMaterial(ctx, params)` returns
  the terrain material (you will extend this material for Phase 3). `num(params, key, default)` helper.

---

## 2. NON-NEGOTIABLE invariants & patterns (violating these = "messing it up")

1. **Text-first parity.** Every viewport tool MUST be mirrored by an AICommand in `src/ai/AIBridge.ts`
   that calls the **same** `TerrainSystem` method, and the capability MUST be added to the HELM manifest
   in `src/helm/manifest.ts` (follow the existing entry pattern there). The mouse and an LLM agent are two
   drivers of one system. Concretely, every feature has three layers:
   - `TerrainSystem.xxxWorld(...)` — the real implementation (world-space entry; converts world→local).
   - `TerrainXxxTool` — viewport tool that calls `TerrainSystem.xxxWorld`.
   - `case 'terrain_xxx':` in `AIBridge` that calls the **same** `TerrainSystem.xxxWorld`.
   Add the AICommand to the `AICommand` union type (near the other `terrain_*` entries) AND the handler
   `switch` (near the other `terrain_*` cases). Mirror the existing `terrain_sculpt` exactly.
2. **Heightmap is the single source of truth for height; the splat map is the single source of truth for
   material weights.** Edits mutate the source array, then call the appropriate "mark dirty / apply"
   method. Never edit GPU buffers as the source of truth.
3. **Brush math runs in terrain-LOCAL space** (`field.mesh.worldToLocal(...)`), so it is floating-origin
   invariant. NEVER read or mutate `engine.worldOrigin.offset`. World-space entry points convert to local
   exactly like `TerrainSystem.sculptWorld` does.
4. **Pure kernel, then glue.** Put all math that doesn't need THREE/Rapier in a separate file with NO
   THREE/Rapier imports, and Vitest it (like `Heightmap.ts` / `chunkGeometry.ts`). The impure glue
   (THREE meshes, textures, Rapier) goes in a separate file.
5. **After a height edit:** call `field.applyRect(rect)` (render) AND `field.markColliderDirty()` (physics).
   After a material/weight edit: just update the splat texture (`needsUpdate = true`) — no collider/geometry
   rebuild needed. Spline height conform = a height edit (so it needs both).
6. **Match the codebase's idiom**: comment density, naming, `num(params,...)` for builder params,
   `engine.tools.setActive`, deterministic RNG via `mulberry32` from `src/terrain/noise.ts`.
7. **Verify before moving on:** `tsc` clean + `vitest` green + a functional live check via `window.engine`.

---

## 3. Gotchas (these already bit me — don't rediscover them the hard way)

- **Rapier heightfield layout** (in `TerrainField.packRapierHeights` / `rebuildCollider`): `nrows/ncols`
  passed to `ColliderDesc.heightfield` are the number of **segments** (`cells = res−1`), so `heights.length`
  must be `(cells+1)² = res²`; the matrix is **column-major**, and parry maps col→x, row→z, so our row-major
  grid needs a **transpose** (`dst[i*res+j]=src[j*res+i]`). It is correct — **do not change it.** If you ever
  add a new collider, validate orientation with a raycast-vs-`sampleLocal` test like `test/terrainCollider.test.ts`.
- **Preview tab backgrounds → 1×1 canvas, paused rAF, timed-out screenshots.** Verify functionally (§0).
- **Pre-existing bug, OUT OF SCOPE but relevant:** `Heightmap` has NO `toBase64`/`fromBase64`, yet
  `src/main.ts` serialize/deserialize calls them, so saving a scene containing a terrain throws. There is a
  separate task for it. When you add splat/spline persistence, implement YOUR OWN base64 round-trip
  correctly (chunked `btoa`/`atob` or a Buffer/manual codec that also works in Node for Vitest) — do not
  assume the Heightmap ones exist.
- The chunk render geometry is rebuilt **whole per dirty chunk** (not partial). That's fine; just call
  `applyRect` with the edited vertex rect and the right chunks rebuild.
- Engine boot is heavy; `window.engine` appears late. Poll for it.

---

## 4. PHASE 3 — Multi-layer material painting

**Goal:** paint weight-blended PBR textures (e.g. grass / rock / mud / sand) onto the terrain, with
optional parallax-occlusion mapping, plus automated grass/pebble scatter.

### 4.1 Splat weight map (source of truth for material) — `src/terrain/SplatMap.ts`
- A per-terrain weight field: one weight per layer per texel. Support up to **8 layers** (two RGBA
  `THREE.DataTexture`s, or one RGBA for 4 to start — design for N, ship 4). Choose a splat resolution
  (e.g. 256 or 512; independent of heightmap res). Layer 0 = base (defaults to weight 1 everywhere; others 0).
- PURE kernels (no THREE): `paintCircle(weights, splatRes, size, layer, cxLocal, czLocal, radius, hardness,
  strength)` — adds to the target layer in a brush circle (reuse the `brushWeight` falloff shape from
  `Heightmap.ts`) and **renormalizes** so the layers at each texel sum to 1. Vitest these (center weight
  rises and normalizes; far texels untouched).
- The THREE glue (the `DataTexture`(s) + `needsUpdate`) can live in `SplatMap.ts` as a thin class wrapping
  the pure kernels, or split it `SplatMap.ts` (pure) + a small holder on `TerrainField`. Keep the pure part
  importable without THREE.
- Persistence: implement `toBase64()`/`fromBase64()` on the splat (works in Node too, for tests).

### 4.2 Terrain material shader — `src/terrain/TerrainMaterial.ts`
- Extend `THREE.MeshStandardMaterial` via **`onBeforeCompile`** to: sample the splat texture(s) with the
  global terrain UV; for each layer sample its albedo (and optionally normal/roughness) tiled by a per-layer
  `repeat`; blend by weight; feed the result into the standard lighting (`diffuseColor`, normal, roughness).
  Keep shadows/lighting intact (you're augmenting the standard material, not replacing it).
- Inject uniforms via the material's `userData.shader`/`onBeforeCompile` closure (standard THREE pattern);
  set `material.customProgramCacheKey` if you toggle features so programs recompile correctly.
- Layer textures: load via the existing texture system — `engine.textures.load(style, type, repeat)` (see
  `MaterialManager.buildMaterial` for the call) and/or `src/materials/TexturePresets.ts`. Provide sensible
  default layers (grass/rock/dirt/sand) so a fresh terrain looks reasonable.
- **POM (parallax occlusion mapping):** optional and **off by default** (it's expensive). Gate behind a
  per-terrain flag; implement as a height-map-driven UV offset in the fragment shader per layer. Make it
  toggleable via the AICommand.
- Because all chunk meshes share this ONE material, injecting the blend here applies to the whole terrain
  automatically (chunk UVs are already global `i/cells, j/cells`). Wire the material in the `'terrain'`
  builder (`builders.ts`) so `resolveMaterial` returns/【wraps】 this terrain material; keep `side = DoubleSide`.

### 4.3 Paint tool + parity
- `src/terrain/TerrainPaintTool.ts` implementing `EditorTool`, structured like `TerrainBrushTool`
  (cursor ring, pointer events, beginStroke/endStroke, dab spacing, `hitLocal` raymarch). On each dab it
  calls `TerrainSystem.paintWorld(field, layer, worldX, worldZ, radius, strength, hardness)`.
  **Refactor the raymarch `hitLocal` out of `TerrainBrushTool` into a shared helper** (e.g. on
  `TerrainField` or `TerrainSystem`) so both tools use one implementation (DRY) — or copy it carefully.
- `TerrainSystem.paintWorld(...)` converts world→local (like `sculptWorld`), calls the pure
  `paintCircle`, and flags the splat texture `needsUpdate`. No collider/geometry rebuild.
- AICommand: add `terrain_paint` (`{ entityId?, layer, x, z, radius, strength?, hardness? }`) and
  `terrain_material_layers` (configure which textures map to which layer, + POM toggle) to the `AICommand`
  union and the handler switch in `AIBridge.ts`, both calling the same `TerrainSystem` methods. Add to the
  HELM manifest. Add layer/material introspection (extend `colliderInfo()` or add a `terrain_material`
  query) so an agent can read the current layer config.
- Register the tool with `engine.tools` and (optional but nice) add a viewport toolbar button mirroring the
  existing `btn-terrain-*` wiring in `src/main.ts` + `index.html`.

### 4.4 Scatter (grass / pebbles) — `src/terrain/TerrainScatter.ts`
- Use `THREE.InstancedMesh` per scatter type (grass = a simple cross-quad billboard or instanced blade
  mesh; pebbles = a small instanced rock). Seed instance transforms from the heightmap + splat: place grass
  where the grass-layer weight is high AND slope is low; pebbles where rock/dirt weight is high. Use
  `mulberry32` seeded by chunk coords for determinism.
- **Pure placement kernel** (testable): given weights + heights + slope + rng → list of instance
  positions/rotations/scales for a region. Vitest it (density scales with weight; respects slope cutoff).
- Regenerate per dirty region when painting/sculpting changes that area. **Distance-cull** like the chunk
  LOD: only populate scatter near the camera (cap instance count). Density configurable via the AICommand.
- Parity: `terrain_scatter` AICommand (configure density/types/enable) calling the same scatter system.

### 4.5 Phase 3 done = 
`tsc` clean; new Vitest for `SplatMap` paint kernel + scatter placement kernel all green; live: create a
terrain, `terrain_paint` a second layer in a circle and confirm the splat weights changed
(read them back) and `renderer.render` still `glError === 0`; scatter instances appear over painted grass;
`terrain_paint` (AI) and the paint tool produce identical results.

---

## 5. PHASE 4 — Spline deformers (roads / rivers / railways)

**Goal:** draw a spline curve and conform the terrain height to it (graded road bed / carved river
channel), optionally paint a material layer along it, optionally extrude a ribbon surface mesh. This
phase **composes** Phases 1–3.

### 5.1 Pure conform kernel — `src/terrain/splineConform.ts`
- Reuse `src/cinematic/Path.ts` for Catmull-Rom + arc-length sampling (its `sampleUniform`/`getPoint`
  gotcha is already fixed — use it as-is; pass it sampled local points). The conform math itself stays pure.
- Generalize the existing single-segment `applyRamp` (in `Heightmap.ts`) into a **polyline conform**: given
  an ordered list of local control points (each with a target height), a half-width, and a falloff, for
  each affected heightmap cell find the nearest point on the densely-sampled polyline, take the perpendicular
  distance, and blend the cell height toward the spline height at that parameter using `brushWeight(dperp,
  halfWidth, hardness)`. Return the dirty `rect`.
  - `kind: 'road' | 'rail'` → flatten to a graded path (optionally clamp slope along the spline).
  - `kind: 'river'` → carve DOWN with a channel profile (lower toward a thalweg).
- Vitest it: a straight 2-point spline reproduces `applyRamp`'s linear interpolation along it; a curved
  spline conforms cells near the curve and leaves far cells untouched; river lowers, road grades.

### 5.2 Tool + parity
- `src/terrain/TerrainSplineTool.ts` (`EditorTool`): click to drop control points (raymarch hit like the
  brush), show a preview line, finalize on Enter/double-click → call `TerrainSystem.splineConformWorld`.
- `TerrainSystem.splineConformWorld(field, points, halfWidth, kind, hardness, opts)`: convert each world
  point to local, sample target heights (e.g. from current terrain or a graded profile), call the pure
  conform kernel, then `field.applyRect(rect)` + `field.markColliderDirty()` (it's a height edit → Phases
  1+2 handle collider + chunk rebuild). Optionally also call `paintWorld` along the spline to lay a
  road/river material layer (Phase 3), and optionally extrude a ribbon mesh (a strip following the spline at
  the conformed height) as a child of the terrain root or a separate entity.
- AICommand: `terrain_spline` (`{ entityId?, points: [number,number][] | [number,number,number][], width,
  kind, hardness?, paintLayer?, ribbon? }`) → same `TerrainSystem.splineConformWorld`. Add to the union,
  the handler, and the HELM manifest. Register the tool with `engine.tools` (+ optional toolbar button).

### 5.3 Phase 4 done =
`tsc` clean; new Vitest for the conform kernel green; live: `terrain_spline` a 3–4 point road across a
terrain and confirm (a) `sampleHeightWorld` along the spline is graded/flat, (b) the heightfield collider
raycast matches the new surface (drop point rests on the road), (c) the chunk geometry updated, (d) if
`paintLayer` set, the splat along the road changed; the spline tool and `terrain_spline` (AI) match.

---

## 6. Definition of done (both phases)

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npx vitest run` all green, including new tests for every new PURE kernel.
- [ ] Each new viewport tool has a matching `terrain_*` AICommand (same `TerrainSystem` method) and a HELM
      manifest entry.
- [ ] Phases 1–2 still work: terrain still sculpts, the heightfield collider still matches the surface
      (raycast == `sampleHeightWorld`), chunk LOD still varies with distance. Re-run `test/terrainCollider.test.ts`
      and `test/chunkGeometry.test.ts`.
- [ ] Live functional check via `window.engine` (NOT screenshots) shows the new features working and
      `renderer.render(...)` produces `gl.getError() === 0` with no new console errors.
- [ ] You did NOT modify `packRapierHeights` / the heightfield collider transpose, and did NOT introduce a
      second source of truth for height or weights.

## 7. Do NOT touch
- The Rapier heightfield transpose / collider rebuild in `TerrainField.ts` (Phase 1, load-bearing).
- The chunk LOD selection / skirt geometry in `TerrainChunkGrid.ts` / `chunkGeometry.ts` (Phase 2) except
  to make chunks aware of your splat (which they get for free via the shared material + global UVs).
- `worldOrigin.offset` and the floating-origin machinery.
- The pre-existing `Heightmap` serialization bug — leave it for its own task; just don't depend on it.

Build it incrementally, test as you go, and keep the parity triangle (System method ↔ Tool ↔ AICommand)
intact for every feature. Good luck.
