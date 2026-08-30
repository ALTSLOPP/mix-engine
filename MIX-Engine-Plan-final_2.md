# MIX Engine — Implementation Plan
## Step 1: Viewport, Camera, Gizmo · Step 2: AI Data Layer, Physics, ECS

**Engine:** MIX Engine — AI-Native, text-first 3D open-world urban game engine
**Stack:** Node.js · TypeScript · Vite · Three.js · @dimforge/rapier3d-compat
**Date:** June 19, 2026

---

## Coordinate Spaces (read first)

- **Engine space** — live Three.js / Rapier coordinates, kept near zero by the floating-origin
  system. `camera.enginePosition()` returns this.
- **World space** — absolute, grid-anchored: `worldSpace = engineSpace + worldOrigin.offset`.

World space: chunk-ID math, save/load, AI spawn/teleport coords, surfaced raycast hits.
Engine space: floating-origin trigger, shadow re-anchoring.
`WorldOrigin` is the only converter and exposes both allocating (`toWorldSpace`) and in-place
(`toWorldSpaceInto(out, v)`) variants; per-frame callers use the in-place variants.

## Scene-Graph Contract (read second)

- **Physics-driven entities (those with a RigidBodyComponent) are always direct children of the
  Scene.** Rapier is a flat world that produces world-space transforms; a physics mesh nested under
  a transformed parent would be written incorrectly and would be shifted twice by a floating-origin
  shift (once via the parent, once via itself).
- Parent/child relationships between physics entities are expressed logically (ECS) and physically
  (Rapier joints), never via Object3D nesting.
- Only **non-physics visual attachments** (e.g. a weapon mesh that merely follows a hand bone) are
  nested under another Object3D; they have no body, are not in `rigidBodyList`, and are moved solely
  by their parent — so they are never shifted independently.

This contract guarantees every object is shifted exactly once during a floating-origin shift.

---

## Project Structure

```
mix-engine/
├── index.html · package.json · tsconfig.json · vite.config.ts
├── public/assets/
└── src/
    ├── main.ts
    ├── engine/      Engine.ts · Time.ts · InputManager.ts
    ├── physics/     PhysicsWorld.ts · RigidBodyComponent.ts
    ├── ecs/         SceneManager.ts
    ├── rendering/   Viewport.ts · EditorCamera.ts · TransformGizmo.ts
    ├── streaming/   ChunkManager.ts · WorldOrigin.ts
    ├── animation/   AssetManifest.ts · AssetLoaderQueue.ts · AssetCache.ts · AnimationStateMachine.ts
    ├── ai/          AIBridge.ts
    └── tools/       BuildingExtruder.ts
```

**18 source files** (main.ts + 3 engine + 2 physics + 1 ecs + 3 rendering + 2 streaming +
4 animation + 1 ai + 1 tools) · 8 subsystems · 0 third-party ECS or input libraries.

---

## Dependencies

| Package | Version | Purpose / Constraint |
|---------|---------|----------------------|
| `three` | ^0.170.0 | Physical lighting only (author intensities). `TransformControls` needs `getHelper()` added to the scene; origin-shift-during-drag and force-end-on-blur reach into its internal state (pinned wrapper). |
| `@dimforge/rapier3d-compat` | ^0.14.0 | Physics (WASM). Inlines its WASM — no cross-origin isolation. `await RAPIER.init()` once. Exposes `nextTranslation()/nextRotation()`, though the engine self-tracks pending kinematic targets rather than depend on them. |
| `vite` | ^6.0.0 | Build tool + dev-server plugin |
| `typescript` | ^5.6.0 | Type safety |
| `@types/three` | ^0.170.0 | Type definitions |

---

## Engine Loop (canonical)

```
1   time.update(timestamp)
2   editorCamera.update(time.dt)
3   chunkManager.update()                            Streams from worldOrigin.toWorldSpace(
                                                     camera.enginePosition()); all phases budgeted
4   aiBridge.processQueue()                          2ms sync budget; spawns/teleports carry world coords
5   animationStateMachines.update(time.dt)           Advance mixers (smooth pose); ACCUMULATE root motion
6   PHYSICS LOOP (fixed rate, capped):
      while (time.shouldStepPhysics()):
        for (c of sceneManager.rootMotionList): c.consumeRootMotionForStep(time.fixedDt)
        physicsWorld.step(time.fixedDt)
        physicsWorld.drainCollisionEvents()          handlers only QUEUE structural ops
        for (rb of sceneManager.rigidBodyList): rb.syncFromPhysics()
        time.consumeFixedStep()
7   keepRatio = time.computeAlpha()                  if debt was dropped, returns the kept ratio
      if (keepRatio < 1) sceneManager.scalePendingRootMotion(keepRatio)
8   sceneManager.flushDeferredOperations()           Spawns + destroys, loop-drained (single safe point)
9   chunkManager.checkFloatingOrigin(camera.enginePosition())   Engine-space magnitude triggers shift;
                                                     supported during a gizmo drag
10  INTERPOLATION:
      for (rb of sceneManager.rigidBodyList):
        if (rb.transformAuthority !== 'gizmo') rb.interpolate(time.alpha)
11  viewport.render()                                shadowProvider.update(camera) re-anchors sun, draw
12  inputManager.endFrame()
```

**Ordering invariants:** root motion applied inside the fixed loop, one fixed slice per substep
(frame-rate independent, buffers non-degenerate); skeletal pose advances per frame, only root
translation reconciles to the fixed rate; streaming uses world space, the origin trigger uses engine
space; structural ECS mutations only at (8); the origin shift (9) precedes interpolation (10)
precedes render (11); gizmo-authority entities skip interpolation.

---

## Subsystem 1 · Engine Core

### Time.ts — Fixed Timestep Accumulator

```
Constants: FIXED_DT = 1/60 · MAX_SUBSTEPS = 5 · MAX_FRAME_TIME = 0.25
State: accumulator, dt, fixedDt, alpha, elapsed, stepsThisFrame, saturationStreak

update(timestamp):
  raw = (timestamp - last) / 1000
  dt  = min(max(0, raw), MAX_FRAME_TIME)   lower clamp blocks negative dt; upper clamp bounds debt
  accumulator += dt; elapsed += dt; stepsThisFrame = 0; last = timestamp

shouldStepPhysics(): accumulator >= FIXED_DT && stepsThisFrame < MAX_SUBSTEPS
consumeFixedStep():  accumulator -= FIXED_DT; stepsThisFrame++

computeAlpha() → keepRatio:                  returns the kept-time ratio so the caller can scale
  keepRatio = 1                              pending root motion (keeps Time a dependency-free leaf)
  if (stepsThisFrame === MAX_SUBSTEPS && accumulator >= FIXED_DT):
      keepRatio = (accumulator % FIXED_DT) / accumulator
      accumulator = accumulator % FIXED_DT   drop unrecoverable debt (no spiral)
      if (++saturationStreak === 30): warn("Physics cannot keep up — simulation is in slow motion.")
  else: saturationStreak = 0
  alpha = clamp(accumulator / FIXED_DT, 0, 1)
  return keepRatio

physicsWorld.step() always receives FIXED_DT, never variable dt.

Accurate slow-motion threshold: the debt-drop branch fires only when one frame's dt exceeds
MAX_SUBSTEPS × FIXED_DT ≈ 83ms — i.e. below ~12 FPS. From ~60 down to ~12 FPS the sim runs in REAL
TIME with more substeps per frame. Only below ~12 FPS does time dilate; the warning signals genuine
freezing, not ordinary low FPS. Structural remedy: worker offload (facade is async-shaped for it).
```

### InputManager.ts — Centralized Input

```
State: keysDown, keysPressed (this-frame), mouseButtons, mouseDelta, wheelDelta, mode
API:  isKeyDown / isKeyPressed / isMouseButtonDown / getMouseDelta / getWheelDelta /
      on(event,cb)→unsubscribe / emit / setMode / endFrame() / dispose()

Passive DOM contract: only EMITS and reads; never stopPropagation()/preventDefault() on pointer
events (the gizmo has its own listeners on the same canvas). Conflicts during a drag resolve via
transformAuthority.

Pointer-lock guard: a pointer-lock request is refused while gizmo.dragging, so brushing RMB during
an LMB gizmo drag cannot trap the cursor mid-operation.

Focus-loss safety ('blur' / 'visibilitychange'→hidden): clear keysDown, keysPressed, mouseButtons,
mouseDelta; exit pointer lock. The gizmo's own drag state is force-ended by TransformGizmo's matching
blur handler (it tracks dragging via its own listeners).

Routing: Editor WASD→Camera, 1/2/3→Gizmo, Mouse→Camera/Gizmo; Play WASD→Player, Mouse→look;
Always F5→toggle, Escape→editor.
```

### Engine.ts — Orchestrator

```
Init (async, sequential): Viewport → Time → InputManager → WorldOrigin →
  PhysicsWorld (await RAPIER.init()) → SceneManager → EditorCamera →
  TransformGizmo (scene.add(gizmo.getHelper())) → AssetCache → AssetManifest → AssetLoaderQueue →
  ChunkManager → AIBridge → start rAF.
dispose(): cancelAnimationFrame; inputManager.dispose(); assetLoaderQueue.dispose() (abort loads);
  physicsWorld.dispose(); viewport.dispose(). main.ts: import.meta.hot?.dispose(()=>engine.dispose()).
```

---

## Subsystem 2 · Rendering

### Viewport.ts

```
Renderer (three ^0.170 — physical lighting only):
  toneMapping = ACESFilmicToneMapping, toneMappingExposure = 1.0
  Lights authored at physical intensities (HemisphereLight ≈ 1.0; sun DirectionalLight ≈ 3.0) or the
  scene renders black. Initial renderer size + camera aspect set explicitly in the constructor.
  scene.environment (shared envMap) is owned by the Viewport and never disposed by entity/chunk teardown.

Resize (ResizeObserver → dirty flag → applied on the next render() tick):
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix()
  (camera update is REQUIRED — setSize alone leaves a stretched projection; one application per rAF
  avoids framebuffer realloc during a window drag)

Shadow architecture (ShadowProvider interface):
  Wrapped behind a ShadowProvider since a single map can't cover an open world without short range or
  acne. SingleMapShadow (Step 2) OWNS the sun DirectionalLight; update(camera) re-anchors the light +
  shadow camera to the main camera's CURRENT engine-space position every frame, so shadows follow the
  player and floating-origin shifts never displace them (runs after the shift, at step 11). The sun
  light is EXCLUDED from the generic static-root origin shift (no double-handling). CascadedShadowMap
  (Step 3) implements the same interface.

API: scene / camera / renderer / render() / dispose() (renderer.dispose() + observer.disconnect())
```

### EditorCamera.ts — 6DOF Flycam

```
rotation.order='YXZ', pitch clamped ±89°, applied via camera.quaternion.
enginePosition() → camera.position (engine space).
Navigation (Unreal/Unity convention): hold RMB → pointer lock → WASD fly + mouse look; Q/E down/up;
wheel adjusts speed; optional toggled fly-mode. Movement × Time.dt. Pointer-lock request suppressed
while gizmo.dragging.
Integration: reads InputManager only; `enabled` false during a gizmo drag.
```

### TransformGizmo.ts

```
const gizmo = new THREE.TransformControls(camera, renderer.domElement); scene.add(gizmo.getHelper())
Shortcuts: 1/2/3 = Translate/Rotate/Scale; ignored while RMB held.
Camera sync: gizmo.addEventListener('dragging-changed', e => editorCamera.enabled = !e.value)

Transform authority protocol:
  drag-start: rb.transformAuthority='gizmo'; rb.setKinematicOverride(true); anim.pause()
  during:     gizmo writes mesh; rb.syncToPhysics() → setNextKinematicTranslation/Rotation
              (interpolation skips this entity while authority==='gizmo')
  drag-end:   rb.setKinematicOverride(false) (restore type, zero velocity); rb.resetInterpolationBuffers();
              rb.transformAuthority='physics'; anim.resume()

applyOriginShift(offset): subtracts offset from the controls' cached world-space drag references
  (drag-start position, drag-plane constant, pointer offset) so an in-progress drag rigidly translates
  with the world. Touches TransformControls internals; isolated in a thin, version-pinned wrapper.

Blur handling ('blur' / 'visibilitychange'→hidden): if gizmo.dragging, force-end the drag (synthetic
  pointerup / internal reset) and run the drag-end protocol, so the gizmo doesn't hijack the mouse on
  refocus.
```

### Transform Authority Hierarchy

| Priority | System | Writes To | Rules |
|----------|--------|-----------|-------|
| 1 | TransformGizmo | Root Object3D | Pauses animation, forces body kinematic, bypasses interpolation |
| 2 | RigidBodyComponent | Root Object3D | Single source of truth at runtime |
| 3 | AnimationMixer | Child bones only | Root motion → kinematic translation (never setLinvel) |

Per-entity `transformAuthority: 'gizmo' | 'physics' | 'animation'`.

---

## Subsystem 3 · Physics

### PhysicsWorld.ts — Rapier WASM Wrapper

```
static async create(): await RAPIER.init(). Gravity {0,-9.81,0}. EventQueue.
API: step(dt) · drainCollisionEvents() · createRigidBody · removeBody · raycast(...) (ENGINE space) ·
  createBox/Sphere/TrimeshCollider ·
  applyFloatingOriginOffset(offset, components):
    for (body of bodyMap.values()): t=body.translation();
      body.setTranslation({t - offset}, false)        // wake=false
    for (rb of components where body is kinematic with a pending target):
      rb.shiftPendingKinematicTarget(offset)          // shift the SELF-TRACKED target, then re-apply
                                                      // (avoids a kinematic snap; see RigidBodyComponent)
  dispose()
Async-shaped facade for future worker offload.
```

### RigidBodyComponent.ts — Physics ↔ Mesh Bridge

```
Module scratchpad: _tempVec3, _tempQuat (reused; no per-substep allocation).
Per-instance buffers: previous/current Position + Quaternion (BOTH = spawn transform at creation).
Ownership tag: {source:'asset', assetId} (cloned cached GLB — BORROWED via AssetCache) OR
  {source:'owned'} (procedural — owns geometry/material).
Pending kinematic target (self-tracked): pendingKinematicTarget: Vector3 | null. Set whenever we call
  setNextKinematicTranslation, so the engine never depends on reading it back from Rapier.

syncFromPhysics() (per sub-step): prev←curr; curr←body.translation()/rotation().
interpolate(alpha) (skipped while authority==='gizmo'): lerp/slerp prev→curr.
resetInterpolationBuffers(): prev = curr = current mesh transform.
shiftOrigin(offset): prev.sub(offset); curr.sub(offset); mesh.position.sub(offset).
  (For root-level physics meshes mesh.position is world; interpolate rewrites it next, so this is
  order-independent and shifts exactly once per the Scene-Graph Contract.)

setNextKinematicTranslation(target): pendingKinematicTarget = target.clone(); body.setNextKinematicTranslation(target)
shiftPendingKinematicTarget(offset):
  if (pendingKinematicTarget) { pendingKinematicTarget.sub(offset); body.setNextKinematicTranslation(pendingKinematicTarget) }

syncToPhysics() (gizmo drag, kinematic): setNextKinematicTranslation/Rotation from mesh.
setKinematicOverride(true/false): swap to/from KinematicPositionBased; on restore zero linvel/angvel.

teleport(enginePos, rotation?):                       authoritative relocation (AI set_transform, etc.)
  body.setTranslation(enginePos, true); if (rotation) body.setRotation(rotation, true)
  body.setLinvel({0,0,0}, true); body.setAngvel({0,0,0}, true)     no momentum carryover
  mesh.position.copy(enginePos); if (rotation) mesh.quaternion.copy(rotation); resetInterpolationBuffers()

Root motion — accumulate per frame, drain per fixed substep (frame-rate independent, zero-alloc):
  pendingRootMotion: Vector3, pendingTime: number
  accumulateRootMotion(frameDelta, dt): pendingRootMotion.add(frameDelta); pendingTime += dt
  consumeRootMotionForStep(FIXED_DT):
    if (pendingTime <= 0) return
    frac = clamp(FIXED_DT / pendingTime, 0, 1)
    _tempVec3.copy(pendingRootMotion).multiplyScalar(frac)         scratchpad, no clone()
    t = body.translation(); setNextKinematicTranslation({t + _tempVec3})   (self-tracks target)
    pendingRootMotion.sub(_tempVec3); pendingTime -= FIXED_DT
  scalePending(keepRatio): pendingRootMotion.multiplyScalar(keepRatio); pendingTime *= keepRatio
    ← scales BOTH so the invariant "pendingRootMotion represents pendingTime worth of motion" holds.
    SceneManager.scalePendingRootMotion fans this out to every rootMotionList member when Time drops
    physics debt, keeping pose and physics dilating together without corrupting drain velocity.

dispose():
  physicsWorld.removeBody(body); body = null
  if (tag.source === 'owned'):
    geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (mat of materials): for (v of Object.values(mat)) if (v && v.isTexture) v.dispose(); mat.dispose()
  else: assetCache.release(tag.assetId)                 refcount; shared resources freed only at 0;
                                                        never touches scene.environment
  parent.remove(mesh)
```

---

## Subsystem 4 · ECS

### SceneManager.ts — Map-Based ECS

```
type EntityId = number. Storage: entities Set; components Map<type, Map<EntityId, Component>>;
entityToChunk Map<EntityId, ChunkId | GLOBAL>; dirtyChunks: Set<ChunkId>. Hot lists with O(1)
swap-pop: rigidBodyList, rootMotionList. globalEntities: Set<EntityId>.

markDirty(chunkId): dirtyChunks.add(chunkId). Called on any create/modify/destroy of an entity in
  that chunk, so save can serialize only changed chunks.

Deferred structural operations:
  deferredOps: Array<{kind:'spawn'|'destroy', ...}>; requestSpawn / requestDestroy (safe from physics
    callbacks and async load resolutions). flushDeferredOperations() (loop step 8): loop-drained into
    local batches (covers cascades; never iterates the live queue while mutating). Spawn application
    converts at instantiation: worldOrigin.toEngineSpaceInto(out, op.worldPos).
  scalePendingRootMotion(keepRatio): for (c of rootMotionList) c.scalePending(keepRatio).

Entity hierarchy & destruction:
  Each physics entity owns a ROOT-LEVEL Object3D (Scene-Graph Contract). destroyEntity(id):
    1. Resolve child entities.
    2. childPolicy: 'cascade' → requestDestroy(child); 'reparentToRoot' → scene.attach(childRoot)
       (preserves world transform), child STAYS alive AND is promoted to global
       (entityToChunk[child]=GLOBAL; globalEntities.add) so it isn't re-spawned as a duplicate on reload.
    3. Dispose components (RigidBody releases/owns per tag), swap-pop lists, remove from all maps,
       parent.remove(thisRoot), markDirty(its chunk).

Per-chunk I/O — origin-independent, chunk-scoped:
  chunkGridOrigin(id) = (chunkX*CHUNK_SIZE, 0, chunkZ*CHUNK_SIZE)
  exportChunkToBinary(id): serializes ONLY entities where entityToChunk[e] === id (GLOBAL excluded,
    persisted with the world snapshot). worldPos = toWorldSpace(enginePos); localPos = worldPos - chunkGridOrigin(id)
  loadChunkFromBinary(id): enginePos = (chunkGridOrigin(id) + localPos) - worldOrigin.offset

Cross-chunk references — null-safe: { chunkId, entityId } tuples; resolve(tuple) → Entity | null
  (consumers MUST handle null). onChunkUnload(id) broadcast; chunk-spanning joints trigger tethering.
```

---

## Subsystem 5 · Chunk Streaming & Floating Origin

### WorldOrigin.ts

```
offset: THREE.Vector3 (single source of truth).
toEngineSpace(worldVec) → new Vector3; toEngineSpaceInto(out, worldVec) → out (no alloc).
toWorldSpace(engineVec) → new Vector3; toWorldSpaceInto(out, engineVec) → out (no alloc).
accumulate(shift)=offset.add(shift). Per-frame callers use the *Into variants.
```

### ChunkManager.ts

```
Constants: CHUNK_SIZE=256, LOAD_RADIUS=3, UNLOAD_RADIUS=5, FRAME_BUDGET_MS=2, ORIGIN_THRESHOLD=1000.
State: loaded, loading (in-flight), failed: Map<ChunkId, {retries, nextAttempt}>. Chunk format:
binary .glb / pre-parsed .bin (never raw JSON on the main thread).

update() (loop step 3):
  worldPos = toWorldSpace(camera.enginePosition())   ← chunk IDs are grid-anchored → world space
  desired = chunks within LOAD_RADIUS of floor(worldPos / CHUNK_SIZE)
  Phases, all time-budgeted:
    1. Fetch missing chunks not in loading/failed-backoff (network concurrency capped, off thread).
       Each load is wrapped: on fetch OR parse failure → log, remove from `loading`, record in
       `failed` with exponential backoff (retry when now ≥ nextAttempt, capped attempts), and
       continue — a bad chunk never wedges the queue or throws unhandled. Optionally instantiate a
       visible placeholder for a permanently-failed chunk.
    2. PARSE budget: GLTFLoader parse is main-thread → drained ≤ small N per frame OR via a worker
       loader (independent of the network cap, which throttles downloads only).
    3. INSTANTIATE budget: while (queue && now-start < FRAME_BUDGET_MS) instantiateNext().
    4. UNLOAD budget: disposal is NOT free → ≤ N entity destroys per frame on the same budget.

Tethering: cross-chunk Rapier ImpulseJoint links both chunks symmetrically. canUnload(id): blocked if
  tethered to a loaded chunk; else detach the joint, convert the boundary body to a static placeholder.

Floating origin (loop step 9 — before interpolation; supported during a gizmo drag):
  checkFloatingOrigin(enginePos):                      ← ENGINE space
    if (enginePos.length() < ORIGIN_THRESHOLD) return
    offset = enginePos.clone()
    Atomically, before the next world.step():
      1. NON-physics root-level Object3Ds (excluding physics-entity roots and the sun light):
         child.position.sub(offset)                    physics roots are handled by 2–3 + interpolate;
                                                        nested children move with their parent (Contract)
      2. all Rapier bodies + self-tracked kinematic targets: physicsWorld.applyFloatingOriginOffset(offset, components)
      3. every RigidBodyComponent: rb.shiftOrigin(offset)   (buffers + root-level mesh)
      4. camera: camera.position.sub(offset)
      5. if (gizmo.isDragging): gizmo.applyOriginShift(offset); rb.syncToPhysics() on the dragged body
      6. worldOrigin.accumulate(offset)
    Interpolation (10) writes meshes from shifted buffers; camera moved; render (11) consistent. Sun
    re-anchors at step 11. Joint anchors are body-local and survive.

  Not hard-locked during a drag — locking it would accumulate single-precision jitter kilometers out,
  defeating the system exactly when large-scale editing needs it.
```

---

## Subsystem 6 · Animation & Assets

### AssetCache.ts — Reference-Counted GPU Resource Owner

```
Canonical loaded GLB per assetId + refcounts for shared geometry/material/textures (clone() shares
them by reference). checkout(assetId) → THREE.Group (++refcount; sharing clone tagged {source:'asset'}).
release(assetId) (--refcount; at 0 or explicit evict, dispose shared geometry/materials/textures,
array-guarded; never scene.environment). evict / has / size. → destroying one of 100 identical NPCs
only releases a reference; shared resources die only when the last user does.
```

### AssetLoaderQueue.ts — Concurrency-Limited Loader

```
MAX_CONCURRENT_FETCH = 4. enqueue(id) → Promise<THREE.Group> dedupes by id. pump() starts fetches up
to the cap; parsing handed to the ChunkManager parse budget / worker. Load rejections propagate to
the caller (ChunkManager wraps them per the error-handling phase above). dispose() aborts in-flight.
```

### AssetManifest.ts — GLB Registry

```
Entry: id, path (enforced .glb), type, tags, skeleton?, boneMapping?.
register (throws if not .glb) · get · findByTag · preload(ids[]) · toJSON()
load(id): routes through AssetLoaderQueue, returns AssetCache.checkout(id) (own transform, shared GPU memory).
```

### AnimationStateMachine.ts — Retargeting & Blending

```
Bone resolution (in order): per-asset override → Mixamo preset (full body + fingers) → passthrough+warn.
Retarget once at load, cached. Update (loop step 5, variable dt): advance the mixer for a smooth pose,
extract the frame's root delta, rb.accumulateRootMotion(frameDelta, dt) — NO physics target here
(applied per fixed substep in the physics loop). Root track removed so the mixer writes only child
bones; physics owns the root. resume() recalculates the root-motion baseline against the current world
position. API: addAnimation · transition(state, fade=0.3) · pause() · resume() · update(dt) · getRootMotionDelta().
```

---

## Subsystem 7 · AI Bridge

### AIBridge.ts — Event Bus with Backpressure

```
commandQueue · COMMAND_BUDGET_MS = 2. register / execute (queues; never inline). processQueue()
once/frame, 2ms sync budget; async loads → AssetLoaderQueue, applied via requestSpawn.

Commands:
  spawn_entity { x, y, z, glbPath }   WORLD-space, stored on the load request; engine pos computed at
    instantiation (a mid-load origin shift can't misplace it).
  destroy_entity { entityId } → requestDestroy.
  set_transform  { entityId, position?, rotation? }   WORLD-space →
    toEngineSpaceInto(out, position); rb.teleport(out, rotation)   zero velocity + reset buffers.
  set_mode { mode }
  save_scene → serialize ONLY dirtyChunks (grid-local exportChunkToBinary) + globalEntities +
    worldOrigin.offset + AI metadata; clear dirty flags on success. GLTFExporter is reserved for
    MESH-ASSET export (BuildingExtruder) and is lossy for world state. DEV → /api/save-world; PROD →
    IndexedDB (+ optional backend).
```

---

## Subsystem 8 · Tools & Build

### BuildingExtruder.ts — SVG Extrusion + Box-Projection UVs

```
1. SVG path → THREE.Shape. 2. ExtrudeGeometry(shape,{depth,bevelEnabled:false}). 3. Box-projection UVs
per vertex (dominant abs-normal axis: X→YZ, Y→XZ, Z→XY) × uvScale → standard 'uv' attribute.
MeshStandardMaterial; PBR tiling correct; exports cleanly. Extruded meshes own their geometry/material
({source:'owned'}) and dispose them on destroy.
```

### vite.config.ts

```
No COOP/COEP headers (compat physics inlines its WASM; require-corp would block cross-origin GLB/
texture/DRACO-KTX2 assets and decoder workers). Two dev endpoints validating method + sanitizing
filenames via path.basename: /api/save-glb → public/assets/exports/ ; /api/save-world → public/worlds/.
```

---

## Dependency Graph

```
                       main.ts → Engine
        ┌──────────────┬───────────────┬────────────────┐
     AIBridge        Time           Viewport        InputManager (leaf, passive DOM, PL guard)
        │            (leaf: returns keepRatio,            │ consumed by
   WorldOrigin       no SceneManager dep)       EditorCamera   TransformGizmo (getHelper/applyOriginShift/blur)
        │                                                          │
        └──────────────────────────────────────────────── SceneManager
                       ┌───────────────────────┬───────────────────┐
              RigidBodyComponent        ChunkMgr + Tether     AssetManifest → AssetLoaderQueue → AssetCache
                  │          │                  │                              ▲
            PhysicsWorld  AssetCache ───────────┼──────────────────────────────┘ (RigidBody.dispose → release)
                  ▲                             │
                  └──────────── ChunkMgr ───────┘
       AnimationStateMachine → RigidBodyComponent (accumulateRootMotion) ; → AssetManifest (load)
       BuildingExtruder (standalone, Three.js only)
```

No circular dependencies. Time is a leaf (returns `keepRatio`; the Engine applies it). WorldOrigin and
AssetCache are shared offset/refcount state with no inbound loop deps.

---

## Build Order

**Step 2a — Core Runtime:** Time → InputManager → Viewport → WorldOrigin → EditorCamera → PhysicsWorld
→ SceneManager → RigidBodyComponent → TransformGizmo → Engine → main.ts.
*Milestone:* drop boxes, drag with the gizmo (helper visible, no cursor lag, survives alt-tab mid-drag),
fly with pointer-locked camera, correct aspect on resize, smooth alpha interpolation on 144Hz, survive
a forced GC pause with no spiral.

**Step 2b — Content Systems (dependency-ordered):** AssetCache → AssetManifest → AssetLoaderQueue →
ChunkManager → AnimationStateMachine → AIBridge → BuildingExtruder → vite.config.ts.
*Milestone:* stream binary chunks correctly across origin shifts (chunk IDs in world space) with
graceful failure on bad loads, walk a root-motion character at correct speed on 144Hz and 20Hz
(including a sub-12-FPS dip without velocity corruption), spawn 100 identical NPCs and destroy one
without blacking the rest, teleport via AI with no shoot-off, drag-edit at 5km with no jitter, save
only dirty chunks, reload with no duplicates.

---

## Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Root-motion velocity corrupted on debt-drop | Medium | High | scalePending scales pendingRootMotion AND pendingTime |
| Physics entity shifted twice (nesting) | Medium | Critical | Scene-Graph Contract: physics entities root-level; static pass skips them |
| Kinematic snap from unshifted pending target | Medium | High | Self-tracked target shifted + re-applied during the shift |
| Chunk IDs from post-shift engine pos | High | Critical | Stream from toWorldSpace(camera.enginePosition()) |
| AI teleport shoots off / smears | High | Critical | rb.teleport(): zero velocity + reset buffers |
| Stretched render after resize | High | Critical | camera.aspect + updateProjectionMatrix with setSize |
| Gizmo stuck dragging after alt-tab | High | Critical | TransformGizmo blur handler force-ends the drag |
| Root motion lost high-FPS / tunnel low-FPS | High | Critical | Accumulate + drain one fixed slice per substep |
| Shared material/texture mass-disposal | High | Critical | AssetCache refcount; release on destroy; envMap never disposed |
| Failed chunk load wedges/throws | Medium | High | try/catch → log → backoff retry → never blocks the queue |
| Build-order dependency violation | — | (process) | Step 2b ordered AssetCache→Manifest→Loader→ChunkMgr |
| Per-substep allocation (GC pressure) | Medium | Medium | Scratchpad in drain; *Into conversion variants |
| Spiral of death | Medium | Critical | dt clamp + MAX_SUBSTEPS + debt drop |
| Floating-origin smear / render displacement | High | Critical | shiftOrigin (buffers+mesh) before interpolation/render |
| Reparented entity duplicated on reload | Medium | High | Promote to global; chunk export filtered by entityToChunk |
| Whole world re-saved every save | Medium | Medium | dirtyChunks tracking; save only changed chunks |
| Gizmo-drag lag fighting interpolation | High | Critical | Interpolation skips gizmo-authority; reset buffers on drag-end |
| Float jitter during long drags | Medium | High | Origin shifts during drag via applyOriginShift |
| Sun shadow frustum wrong after shift | Medium | Medium | Camera-relative re-anchor each frame; sun excluded from generic shift |
| AI spawn lands offset away after shift | High | Critical | World→engine conversion at instantiation |
| Saved chunk loads in wrong place | High | Critical | Grid-static serialization anchor |
| Array-material disposal crash | High | Critical | Array-guard disposal (owned resources only) |
| Negative dt corrupts accumulator | Low | High | Lower-bound clamp to 0 |
| WASM init race | Low | Critical | await RAPIER.init() before loop |
| Scene renders black | High | High | Author light intensities + tone mapping |
| Chunk unload hitch | High | High | Time-budgeted unloads |
| Sync GLB parse stampede | Medium | High | Worker / per-frame parse budget, separate from fetch cap |
| Collision-callback mutation mid-loop | Medium | High | All creates + destroys deferred to one flush |
| Dangling cross-chunk reference | Medium | Medium | Null-safe resolve() + onChunkUnload |
| Open-world shadow quality | High | High | ShadowProvider; CSM in Step 3 |
| Stuck keys / pointer-lock vs gizmo | High/Medium | Medium | blur clears input; pointer-lock refused while dragging |
| Main-thread physics at 5k+ bodies | High | Medium | Async facade now, worker later |

---

## Verification Plan

| Test | Method | Pass Criteria |
|------|--------|---------------|
| Root motion under sub-12-FPS dip | Drop below 12 FPS while walking, then recover | Velocity correct after recovery (pendingTime scaled with motion) |
| Physics entity nesting guard | Attempt to nest a physics entity; cross 1000m | Contract enforced (root-level); shifts once; no 2x jump |
| Kinematic target across shift | Drag near 1000m so a shift fires mid-drag | No backward snap; drag continues under cursor |
| Streaming across origin shift | Walk past 1000m repeatedly | Correct chunks stay loaded; no reload churn |
| Bad chunk load | Point a chunk at a 404 / corrupt file | Logged, retried with backoff, queue unblocked, others stream |
| Dirty save | Modify one chunk, save | Only that chunk re-serialized; clean chunks untouched |
| Allocation under load | DevTools allocation profile during the sync loop | No sawtooth from the root-motion drain |
| AI teleport | set_transform on a moving dynamic body | Lands exactly, no velocity carry, no smear |
| Resize aspect | Drag the window to a new aspect ratio | No stretch/squish |
| Alt-tab mid-drag | Drag, alt-tab, return | Drag ended; mouse not hijacked; body placed |
| Reparent + reload | Reparent on parent death, save/unload/reload | Exactly one child; no duplicate/orphan |
| Sun shadow + shift | Cross 1000m, inspect shadows | Anchored to player; no frustum jump |
| Root motion high/low FPS | Walk at 144Hz then 20Hz into a wall | Correct speed; no tunnel; no buffer-flatten |
| Cloned-entity disposal | 100 identical NPCs, destroy one | Other 99 keep materials/textures; reflections intact |
| Pointer-lock vs gizmo | Brush RMB during an LMB gizmo drag | Pointer lock refused; gizmo unaffected |
| Physics consistency (in-session) | Same initial state, same build, twice, fixed timestep | Matching result. (Cross-platform bit-determinism and a record/replay harness are out of scope for Step 2.) |
| Spiral-of-death | Force a 2s stall | ≤ MAX_SUBSTEPS steps; sim resumes |
| Floating-origin smear | Cross 1000m with bodies moving | No smear; continuous motion |
| AI spawn across shift | Slow GLB; cross 1000m mid-load | Lands at intended world position |
| Save/load after relocation | Save at world X=10,000; reload at X=0 | Original world coords |
| Child destruction | Cascade vs reparent | Cascade gone; reparent alive at world pose, global |
| Chunk unload budget | Cross UNLOAD_RADIUS into many chunks | No hitch; spread across frames |
| AI burst | 500 spawns | ≤4 fetches; stream in; no freeze |
| Persistence round-trip | AI authors entities → refresh | Components/physics/cross-chunk/global restored |
| HMR stability | Edit+save 10× | No leaked listeners/renderers/loaders |
| Bone remapping | Mixamo / custom / unknown | Correct / correct / warn+passthrough |
| Open-world shadows | Inspect at draw distance | ShadowProvider swappable; CSM stable |
```
