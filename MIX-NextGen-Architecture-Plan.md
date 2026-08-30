# MIX Engine — Next-Gen Architecture Implementation Plan
**AI-Native AAA 3D Game Engine · 10 Subsystems · 5 Phases**

---

## 1. Executive Summary & System Architecture

MIX Engine already has a proven spine: the canonical 12-step loop (`src/engine/Engine.ts:1008`), fixed-timestep physics with debt-dropping interpolation (`src/engine/Time.ts`), floating origin via `WorldOrigin` + `ChunkManager.checkFloatingOrigin` (1000 m threshold, `src/streaming/ChunkManager.ts:194`), deferred structural mutations (`SceneManager.flushDeferredOperations`, step 8), HELM RPC transport over the Vite dev server (`/api/helm/rpc` → `mix:helm-rpc` WS), and SENSORIUM with telemetry/feel/vision pipelines.

This plan adds the 10 missing pillars while **extending, not replacing**, every existing contract. Every new system follows the four canonical integration rules: (1) fixed-step simulation in loop step 6, (2) structural mutations only at step 8, (3) world-space coordinates at all API boundaries with `WorldOrigin` conversion, (4) full HELM/AICommand + manifest + SENSORIUM coverage from day one.

### 1.1 Loop integration map (where each subsystem hooks in)

```
FRAME (Engine.ts loop, step numbers from source comments)
 1  time.update ── GamepadDriver.poll() [S3]  (before any consumer)
 2  editorCamera/player.update ── PlayerController refactored to drive
    CharacterLocomotor [S1]; InputContextStack.resolve() feeds actions [S3]
 3  chunkManager.update
 4  aiBridge.processQueue ── CommandHistory records inverse ops around each
    mutating AICommand; transaction state machine [S5]; audio.update →
    ReverbZone blend [S10]
 5  mixers/motion/tweens ── IK pass (MotionIKPipeline hooks) [S7]
 6  FIXED SUBSTEP LOOP:
      rootMotion drain → KCC.fixedStep(fixedDt) [S1] → component
      onFixedUpdate [S4] → vehicles.preStep → physicsWorld.step →
      drainCollisionEvents (now also fans to component onCollision/onTrigger
      [S4], joint motor sync [S2]) → syncFromPhysics
 8  flushDeferredOperations ── extended DeferredOps: 'reparent',
    'jointAttach', 'jointDetach', 'ragdollCreate' [S2/S4]
 9  checkFloatingOrigin ── KCC interpolation buffers + probe volumes +
    reverb zones shift via existing KinematicShiftable pattern [S1/S8/S10]
10  interpolate(alpha) → updateParentChildTransforms → IK ground-solve on
    interpolated poses [S7] → WorldUI billboard update [S6]
11  LightCluster.assign(camera, visibleSet) [S8] → cull → render →
    HUD/UI paint [S6] → post-render: onLateUpdate [S4]
12  input.endFrame ── InputContextStack.endFrame, gamepad edge-clear [S3]
```

### 1.2 Layered architecture

```
┌─ AGENT SURFACE   HELM ops (manifest.ts) · AICommands (AIBridge) · MCP tools
│                  CommandHistory [S5] · Inspector schemas [S4]
├─ GAMEPLAY        CharacterLocomotor/KCC [S1] · Joints/Ragdolls [S2]
│                  InputContextStack/Gamepad [S3] · WorldUI [S6]
├─ SIMULATION      ECS Components+lifecycle [S4] · Physics (fixed dt)
│                  CollisionMatrix · CCD [S2] · IK/Morph/Events [S7]
├─ PRESENTATION    LightCluster/CSM/Probes [S8] · Canvas UI [S6]
│                  KTX2/Meshopt pipeline [S10] · AudioDSP [S10]
└─ DELIVERY        GamePackager/Tauri export [S9] · Chunk I/O (existing)
    ↓ verticals: WorldOrigin conversion · SENSORIUM telemetry · determinism
```

---

## 2. Subsystem Detailed Designs

### Subsystem 4 first (it is the foundation the others mount on)

## S4 — Modular Component Architecture & Standard Lifecycle

**Problem today:** No `Component` base class. Only `RigidBodyComponent` + `ScriptComponent` (compiled via `new Function`, `ScriptComponent.ts:254`); scripts get variable-rate `update(dt)` only (`Engine.ts:1054`); no onFixedUpdate/onLateUpdate/onCollision/onEnable; only spawn/destroy are deferred (reparent is immediate, `SceneManager.ts:323`).

**Files (new):** `src/ecs/Component.ts`, `src/ecs/ComponentRegistry.ts`, `src/ecs/LifecycleScheduler.ts`
**Files (modify):** `src/ecs/SceneManager.ts`, `src/engine/Engine.ts` (steps 6/8/10b/11), `src/ai/commands/BridgeContext.ts`, `src/helm/manifest.ts`

```ts
// src/ecs/Component.ts
export interface CollisionInfo { otherEntity: EntityId; otherCollider: number; selfCollider: number; }
export abstract class Component {
  static readonly type: string;                    // registry key e.g. 'health'
  static readonly schema?: ComponentSchema;        // declarative, from @expose
  entity!: EntityId; enabled = true; started = false;
  protected ctx!: ComponentContext;                // narrow facade (sceneManager, physicsWorld, events, time, input)
  onAwake(): void {}                                // after attach, before first update
  onStart(): void {}                                // first frame, after all onAwake
  onEnable(): void {}; onDisable(): void {}         // enabled flag toggles
  onUpdate(dt: number): void {}                     // render-rate (loop step 4/5 region)
  onFixedUpdate(fixedDt: number): void {}           // INSIDE substep loop (step 6) — deterministic
  onLateUpdate(dt: number): void {}                 // post-interpolation, pre-render (after step 10b)
  onCollisionEnter(i: CollisionInfo): void {}; onCollisionExit(i: CollisionInfo): void {}
  onTriggerEnter(other: EntityId): void {}; onTriggerExit(other: EntityId): void {}
  onDestroy(): void {}
}
```

- **Scheduler:** `LifecycleScheduler` maintains hot lists (awakeQueue drained at step 8 flush; fixedList iterated inside the substep `while` at `Engine.ts:1074`; lateList after `updateParentChildTransforms` at `Engine.ts:1119`). Same swap-pop O(1) pattern as existing `scriptList` (`SceneManager.ts:390-456`).
- **Collision fan-out:** extend `Engine.handleCollision` (`Engine.ts:1151`) and `handleIntersection` (`Engine.ts:1183`) to also dispatch to per-entity component maps — reuse the existing `collision_start/end` + `sensor_enter/exit` EventBus events, add component method dispatch alongside.
- **Deferred ops extension:** `DeferredOp` union gains `{ kind: 'reparent'; id; parent } | { kind: 'jointAttach'|'jointDetach'|'ragdollCreate'; ... }` — `parentEntity()` becomes queued, satisfying the invariant "reparenting only at flush".
- **Schema & exposure:** reuse `src/inspector/SchemaDecorators.ts` + `SchemaRegistry.ts`. New `@expose({ type: 'range'|'number'|'string'|'bool'|'enum'|'vector3'|'asset', min?, max?, doc })` decorator auto-populates: Inspector Studio property tree, HELM manifest entry (`params` with types + docs), `inspect_serialize` state, and validation via `ValidatorRegistry`. Auto-generates a `manifest` section listing every registered component type with its exposed schema — agents can discover components by reading `/api/helm/manifest`.
- **HELM/AICommands:** `component_add { entity, component: string, props?: Record<string, unknown> }`, `component_remove`, `component_set { entity, component, prop, value }`, `component_get`, `components_list` (registry dump w/ schemas). Registration follows the canonical 4-step recipe (AIBridge union → `src/ai/commands/ComponentCommands.ts` handler → ctor `registerComponents(...)` → manifest entry).
- **SENSORIUM:** lifecycle counters (awake/start/destroy per second), `component_error` anomaly kind; test: spawn 200 entities each with a test component doing fixed-step accumulation, assert accumulated value == expected after N seconds (proves fixedUpdate ran exactly round(N/fixedDt) times) — determinism proof.

---

## S1 — Production Kinematic Character Controller

**Problem today:** `PlayerController.ts:231-248` ray-snaps Y (single 5 m ray, `+0.9` offset); jump is an animation-state trigger only (`PlayerController.ts:170-173`) with zero vertical physics; no slopes/stairs/coyote/dash/crouch; runs at frame-dt (step 2) not fixed-dt; no platform inheritance.

**Files (new):** `src/character/CharacterLocomotor.ts` (KCC core), `src/character/KccDynamics.ts` (jump/gravity state machine), `src/character/KccParams.ts` (typed param set + schema), `src/character/PlatformRider.ts`, `src/character/KccTelemetry.ts`
**Files (modify):** `src/engine/PlayerController.ts` (thin input→intent adapter), `src/engine/Engine.ts` (step 6 insertion), `src/engine/builders.ts` (character builder opt-in KCC mode), `src/physics/PhysicsWorld.ts` (expose `createCharacterController`), `src/streaming/ChunkManager.ts` + `src/physics/RigidBodyComponent.ts` (KCC implements `KinematicShiftable`-style `shiftOrigin`)

**Algorithm (per fixed substep, inserted at `Engine.ts:1076` before `vehicles.preStep`):**

```
1. Rapier controller setup (once): world.createCharacterController(skin=0.02)
   .enableAutostep(maxHeight=0.35, minWidth=0.15, includeDynamic=false)
   .enableSnapToGround(stepDown=0.3) .setMaxSlopeClimbAngle(50°)
   .setMinSlopeSlideAngle(35°) .setApplyImpulsesToDynamicBodies(true)
2. desiredMove = (inputMove * maxSpeed) * fixedDt            // horizontal intent
3. Dynamics layer (KccDynamics, explicit fixed-dt integration):
   grounded := cc.computedGrounded() from previous substep
   v.y -= G * gravityScale(fixedDt)   where gravityScale:
     |v.y| < apexThreshold && jumpHeld → apexHangScale (0.55)  // apex dilation
     ascending && !jumpHeld          → jumpCutScale (1.8)      // variable height
     else 1.0
   v.y = max(v.y, -terminalVelocity)                          // clamp
   coyote: airborneTime < coyoteTime(0.12s) → jump still allowed
   buffer: jumpPressedTime within bufferWindow(0.15s) → jump fires on landing
   onJump: v.y = sqrt(2 * G * jumpHeight)                     // kinematic jump
4. cc.computeColliderMovement(collider, desiredMove + v.y*fixedDt*up,
   filterGroups=collisionMatrix.layerMask('Player'))
5. moved := cc.computedMovement(); groundNormal := cc.computedGroundNormal()
   if groundAngle(groundNormal) > slideAngle:                  // steep slope
       slideDir = normalize(projectOnPlane(gravity, groundNormal))
       v += slideDir * slideAccel * fixedDt; disable snap (cc.disableSnapToGround this step)
   rb.setNextKinematicTranslation(pos + moved)
6. PlatformRider: if grounded, groundBody := rapierBodyFromCollider(cc ground contact)
   if kinematic: platformVel = (bodyPos - bodyPrevPos)/fixedDt
   desiredMove += platformVel * fixedDt; on jump: v += platformVel  // momentum carry
7. Crouch: colliderRebuilder hook (Rapier colliders immutable — remove+recreate
   capsule at half height, matches existing rescaleCollider pattern)
```

**KccParams (schema-exposed):** `maxWalkSpeed, maxRunSpeed, acceleration (ground/air), deceleration, jumpHeight, apexThreshold, apexHangScale, jumpCutScale, terminalVelocity, coyoteTime, jumpBufferWindow, maxSlopeClimb, minSlopeSlide, slideAccel, stepUpHeight, stepDownDistance, crouchHeightRatio, dashSpeed, dashDuration, dashCooldown`.

**HELM/AICommands:** `set_kcc_params {entity?, patch: Partial<KccParams>}` (validated against schema), `get_kcc_params`, `kcc_jump {height?}`, `kcc_crouch {on}`, `kcc_dash {dir:[x,z]}`, `kcc_teleport {pos}`, `kcc_state` → `{grounded, groundNormal, groundBody, velocity, state: 'idle'|'run'|'air'|'slide'|'dash'|'crouch'}`.

**SENSORIUM:** `KccTelemetry` emits per-substep: groundContactRatio, slopeSlipEvents, wallHitCount, jitter = variance of |Δpos| over 30-substep window, airTime, landingImpactG, platformCarryError. New `ScenarioProfile` entries: `'kcc_stairs'` (spawn stair fixture in setup, assert `position_gt y` at top + `no_anomaly`), `'kcc_slope'` (steep ramp: assert `velocity_lt` — character slides, doesn't climb), `'kcc_coyote'` (walk off ledge, jump at t+0.08s: assert `position_gt y` — jump fired), `'kcc_tunneling'` (dash at 30 m/s into 0.1 m wall: assert `position_lt` past wall). New assertion kinds: `grounded_is {entityRef, expected}`, `kcc_state_is {state}`. `FeelAnalyzer` gains `jitter` and `grounding` metrics (weighted into locomotion profile).

**Floating-origin proof:** KCC stores no absolute coordinates (all `setNextKinematicTranslation` engine-space, shifted via existing `shiftPendingKinematicTarget`); regression test: teleport character 1500 m out, force origin shift, assert `kcc_state` continuity + ground snap intact.

---

## S2 — Joints, Collision Matrix, CCD & Ragdolls

**Problem today:** Zero joint usage anywhere (`grep ImpulseJoint → 0`). No collision groups (all colliders default everything-collides-everything, `PhysicsWorld.ts:125-129` only sets ActiveEvents/sensor). No CCD (`grep ccd → 0`).

**Files (new):** `src/physics/JointSystem.ts`, `src/physics/CollisionMatrix.ts`, `src/physics/RagdollBuilder.ts`, `test/collisionMatrix.test.ts`, `test/joints.test.ts`
**Files (modify):** `src/physics/PhysicsWorld.ts` (joint factories wrap `RAPIER.JointData` + `world.createImpulseJoint`; `setCcdEnabled` passthrough), `src/ecs/SceneManager.ts` (DeferredOps), `src/engine/builders.ts` (spawn-time `ccd`, `collisionLayer` params), `src/animation/SkeletonProfile.ts` (feed ragdoll mapping)

**Collision matrix (declarative):**
```ts
// src/physics/CollisionMatrix.ts
interface CollisionLayerDef { name: string; id: number; /* 0..15 */ collidesWith: string[]; }
class CollisionMatrix {
  compile(defs): Map<string, number>   // Rapier 32-bit: (memberships << 16) | filter
  layerMask(layer): number             // applied via desc.setCollisionGroups at creation
}
```
Layer set: `Player, Enemy, Projectile, Trigger, StaticTerrain, Debris, Vehicle, Ragdoll, Interactable, CameraBlocker` (10 of 16 bits used). Default JSON `src/physics/defaultCollisionMatrix.json`, overridable per-game at `games/<name>/collision.json`. Sensor filtering uses the same mechanism (`filterGroups` arg to `computeColliderMovement`, raycasts get `filterExcludeCollider`/groups).

**HELM/AICommands:** `collision_layer_define {name, collidesWith[]}`, `collision_set_layer {entity|tag, layer}`, `collision_matrix_get`, `set_ccd {entity, on}`, spawn params `ccd?: boolean, collisionLayer?: string` on `spawn_entity`/`spawn_group`/`scatter`.

**Joints ECS:**
```ts
interface JointSpec {
  type: 'revolute'|'prismatic'|'spherical'|'fixed'|'distance'|'generic6dof';
  entityA: EntityId; entityB: EntityId;
  anchorA: [n,n,n]; anchorB: [n,n,n];      // local frames
  axis?: [n,n,n];                            // revolute/prismatic
  limits?: { min: number; max: number };     // radians or meters
  motor?: { targetVel: number; factor: number; damping: number; stiffness: number };
  breakForce?: number;
}
```
`JointSystem` creates via `RAPIER.JointData.revolute(anchorA, anchorB, axis)` etc., generic 6DoF via `JointData.generic(config)` with per-axis `[min,max]` locked/free arrays. Creation/destruction queued as `DeferredOp('jointAttach'|'jointDetach')` — invariant preserved. Joints serialize into chunk `SerializedEntity` records (id-remap aware on chunk load, mirroring the parent-relation pattern at `SceneManager.ts:586-618`).

**Ragdoll:** `RagdollBuilder.fromSkeleton(entityId, preset: 'humanoid')` walks `detectSkeletonProfile` output (`src/animation/SkeletonProfile.ts:438`), computes limb capsule dims from bone rest lengths, spawns dynamic bodies (layer `Ragdoll`), binds revolute joints with humanoid limit table (neck ±45°, elbow 0-150°, knee 0-150°, spine ±30°…), copies bone world transforms. **Anim→ragdoll blend:** drive motors toward current animated pose (stiffness ramp-down over `blendTime`, default 0.4 s), then motors off → free ragdoll. Trigger: `ragdoll_create` or impulse threshold from `combat_apply_damage`.

**HELM/AICommands:** `joint_create {spec: JointSpec}`, `joint_remove {id}`, `joint_set_motor {id, motor}`, `joint_list`, `ragdoll_create {entity, blendTime?}`, `ragdoll_apply_impulse {entity, dir, magnitude}`.

**SENSORIUM:** joint telemetry: per-joint stretch distance (|anchorA_world − anchorB_world|) — `joint_stretch_max < 5cm` assertion; ragdoll test profile: spawn character 2 m above stairs, `ragdoll_create`, assert all limbs `velocity_lt 0.1` within 5 s (settle) + no joint stretch + `no_anomaly`. CCD test: `combat_fire` projectile at 80 m/s through 1-unit-thick wall, assert wall hit registered (`collision_count_gte`) and no entity beyond wall.

---

## S3 — Universal Input Action Mapping & Multi-Device Layer

**Problem today:** `InputManager` (`src/engine/InputManager.ts`) is raw `KeyboardEvent.code` polling; consumers hardcode `KeyW` etc. (`PlayerController.ts:176-184`); zero gamepad support; SENSORIUM injects keys directly.

**Files (new):** `src/input/ActionMap.ts`, `src/input/InputContextStack.ts`, `src/input/GamepadDriver.ts`, `src/input/SyntheticActionDriver.ts`, `src/input/types.ts`
**Files (modify):** `src/engine/InputManager.ts` (owns drivers, exposes action layer), `src/engine/Engine.ts` (step 1 poll, step 12 endFrame), `src/engine/PlayerController.ts` (consume actions not keys), games glue remains compatible (legacy `isKeyDown` untouched)

```ts
// src/input/types.ts
interface ActionDef {
  name: string;                                 // 'move', 'jump', 'attack', 'aim'
  kind: 'button' | 'axis1d' | 'axis2d';
  bindings: Binding[]; deadzone?: number;       // radial for 2D
  responseCurve?: 'linear' | 'expo1.3' | 'expo2';
}
type Binding =
  | { device: 'keyboard'; code: string }        // 'KeyW'
  | { device: 'mouse'; button?: number; deltaAxis?: 'x'|'y'; wheel?: true }
  | { device: 'gamepad'; pad: number; button?: number; axis?: number;   // standard mapping
      invert?: boolean; triggerThreshold?: number }
  | { device: 'synthetic' };                    // settable by HELM/SENSORIUM only
interface InputContext { name: string; priority: number; actions: ActionDef[];
  maskAllBelow: boolean; }                      // 'Cinematic' masks everything below
```

- **Context stack:** push/pop with priority masking — `OnFoot(0), InVehicle(10), Dialogue(50), Menu(80), Cinematic(100)`. Top context with `maskAllBelow` hides lower-priority action values (reports 0). Same action name can resolve differently per context (e.g., `A` button = jump vs handbrake).
- **GamepadDriver:** `navigator.getGamepads()` poll at step 1; radial deadzone with remap (magnitude rescale avoiding snap at deadzone edge), expo curves on sticks, analog triggers with threshold, `gamepad.vibrationActuator.playEffect('dual-rumble', {...})` for haptics. Reconnect handling via `gamepadconnected` events.
- **SyntheticActionDriver:** action-level injection (`setAction('move', {x:0,y:1})`, `pressAction('jump')`) layered ABOVE key-level `injectKey` (both kept). SENSORIUM's `SensoriumRunner.actionMove`/`tapKey` migrate to action-level — context-stack aware, so tests of menus/dialogue work without faking movement keys.
- **HELM/AICommands:** `input_context_push {name}`, `input_context_pop {name?}`, `input_contexts` (stack dump), `input_action_define {context, def}`, `input_bind {action, binding}`, `input_action_state {action}` (query — also lets HUD bind `{input.move.magnitude}`), `input_gamepad_status`, `input_gamepad_rumble {pad, weak, strong, durationMs}`, `input_synthetic {action, value|down}` (agent drives gameplay without focus).

**SENSORIUM:** `TestAction` gains `{ type: 'action'; name: string; value?: any; down?: boolean }` alongside existing key injection; input-latency telemetry: timestamp injection → first possessed-entity velocity change (responsiveness metric already exists in `FeelAnalyzer`; now measured per-action with attribution). Test: context mask regression (push `Menu`, assert `move` action reads 0 while keys held).

---

## S5 — Transactional Command History (Agent Undo/Redo & Diffing)

**Problem today:** four disconnected undo stacks: full-JSON scene snapshots (`src/editor/sceneIO.ts:8-11`), terrain (`src/terrain/TerrainHistory.ts`), inspector properties (`src/inspector/PropertyTree.ts:142-151`), HELM checkpoints (`HelmBridge.ts:43`). Nothing covers AICommand-level rollback; no branching; no diffs.

**Files (new):** `src/history/CommandHistory.ts`, `src/history/InverseOps.ts`, `src/history/SceneDiffer.ts`, `src/history/types.ts`, `test/history.test.ts`
**Files (modify):** `src/ai/AIBridge.ts` (`dispatch()` wraps handlers in history capture), `src/editor/sceneIO.ts` (JSON-stack becomes consumer of op-based history), `src/terrain/TerrainSystem.ts` (ops emit invertible records), `src/helm/manifest.ts`

```ts
interface InverseOp { apply(): void | Promise<void>; label: string; }
interface HistoryNode { ops: InverseOp[]; branch: number; parent?: number; label: string; at: number; }
class CommandHistory {
  begin(label: string): void;                    // collect subsequent inverse ops
  commit(): void;                                // push HistoryNode (transaction)
  rollback(): void;                              // apply ops in reverse, discard node
  undo(): void; redo(): void;                    // tree-walking with redo branches
  checkpoint(name: string): void; diff(name: string): SceneDiff;
}
```

- **Inverse op capture:** each mutating command module registers an inverse builder alongside its handler — `spawn_entity` → inverse = destroy created ids (captured from `opDo`'s before/after id diff, `HelmBridge.ts:105-137` already computes this); `set_transform` → inverse restores prior pos/quat; `terrain_sculpt` → inverse restores affected heightmap region (old samples copied before brush, compressed RLE); `component_set`/`inspect_property_set` → prior value; `parent_entity` → prior parent. Editor gizmo drags (existing `captureState` call sites, `main.ts:254-257`) route through `history.begin('gizmo')/commit()`.
- **Branching:** history is a tree; `undo` moves to parent, new edits create a redo branch (node counter). `history_status` reports position + branch count — agents can explore edit variants.
- **Scene diffs:** canonical projection of entities (`blueprint, worldPos, quat, scale, tags, components: {type → props}`) → structural diff `{ added: EntityRecord[]; removed: EntityId[]; changed: { id, fields: {path, before, after}[] }[] }` against any named checkpoint or HEAD~N.
- **HELM/AICommands:** `undo {steps?}`, `redo {steps?}`, `history_status`, `transaction_begin {label}`, `transaction_commit`, `transaction_rollback`, `history_checkpoint {name}`, `scene_diff {against}`. HELM `opDo` auto-wraps every batch in an implicit transaction (label = command list) — a failed `assert` inside a batch can optionally trigger `transaction_rollback` (`do` gains `atomic?: boolean` flag).

**SENSORIUM/verification:** unit tests: 40-random-command fuzz (seeded), undo-to-start, assert scene serialization hash equals initial hash (bit-identical via `serializeSceneState`). Origin-shift interaction test: undo a spawn after an origin shift — inverse must destroy by entity id (never store absolute coords in inverse ops; capture world-space but re-convert through current `WorldOrigin` at apply time).

---

## S6 — In-Engine Canvas & World-Space 3D UI Framework

**Problem today:** UI is DOM-only: HUD JSON with 5 fixed widget types (`src/ui/HUD.ts:85`), `{state.x}`/`{entity.N.hp}` bindings (only `hp` implemented, `HUD.ts:108-113`), no world-space UI at all, no buttons/sliders/lists.

**Files (new):** `src/ui/world/WorldUIBillboard.ts`, `src/ui/world/WorldCanvas.ts` (CanvasTexture quad pool), `src/ui/world/TerminalScreen.ts`, `src/ui/widgets/` (`ButtonWidget.ts`, `SliderWidget.ts`, `ProgressWidget.ts`, `DropdownWidget.ts`, `ScrollViewWidget.ts`, `RadialWidget.ts`), `src/ui/layout/FlexLayout.ts`, `src/ui/layout/NineSlice.ts`
**Files (modify):** `src/ui/HUD.ts` (widget registry + layout engine + binding resolver extension), `src/ai/commands/HudCommands.ts`, `src/rendering/SceneDiagnostics.ts` (billboard coverage)

**World-space layer (canvas-texture quads — confirmed):**
```ts
interface WorldUIElement {
  id: string; follow: { entity: EntityId; bone?: string; offset?: [n,n,n] }
           | { worldPos: [n,n,n] };
  kind: 'healthbar'|'nameplate'|'counter'|'waypoint'|'damageNumber'|'custom';
  size: [n, n];                       // meters
  content: JsonUI;                    // same declarative tree as screen UI (shared renderer)
  billboarding: 'none'|'yaw'|'full'; occlusionTest?: boolean; distanceFade?: {near, far};
  ttl?: number;                       // damage numbers auto-expire
}
```
`WorldCanvas` draws to pooled 2D canvases (512-1024px, resolution scale by distance) → `CanvasTexture` quads, depth-tested, updated at step 10b (post-interpolation positions, pre-render) — **visible in SENSORIUM screenshots/video and Tauri captures** since they render in the WebGL pass. Bone-following resolves via `SkeletonUtils.getBoneObject` each frame; `shiftOrigin` moves quads (no stored absolute coords). Damage numbers: world-space, velocity-drift + fade, pooled. Terminal screens: non-billboard static quads with raycast interaction (pointer events from camera ray → canvas-space UV hit → widget event).

**Screen-space layer (evolved HUD — confirmed):**
- **Layout tree:** `panel` gains `layout: { dir: 'row'|'column', gap, align, justify }` flex auto-layout; every widget gains `anchor` (9-point or %), `pivot`, `sizeMode: 'fixed'|'stretch'|'aspect'`; 9-slice via `border: [t,r,b,l]` + tileable image.
- **Widgets:** registry-driven (`HUD.registerWidget(type, class)`) so games can extend; each widget implements `{ render(ctx|el), onPointer, onFocus, serialize, schema }`. Buttons emit named events on `sceneManager.events` (`ui_click:{id}` — scripts/agents can listen); sliders/scroll/radial support pointer drag + gamepad focus navigation (from S3 context stack — `Menu` context auto-created when a HUD with interactive widgets shows).
- **Bindings:** resolver extended beyond `hp` to full `RigidBodyComponent` fields + registered component schemas (S4) + gameplay vars + input actions, with reactive refresh budget (existing `refreshInterval`).

**HELM/AICommands:** `hud_load` (extended schema, backward compatible), `hud_set {id, props}` (live mutate + reactive rebind), `hud_widget_call {id, action: 'click'|'setValue', value?}` (agent drives UI), `hud_state_get {id?}` (assertion source), `ui_world_attach {element: WorldUIElement}`, `ui_world_update {id, content}`, `ui_world_remove {id}`, `ui_world_list`.

**SENSORIUM:** `entity_visible` expectation now covers billboard quads (SceneDiagnostics pixel-coverage extension); new assertion kind `hud_state_is {id, prop, value}`; UI responsiveness metric (time from `hud_set`/input to rendered change, measured via post-render hook). Test scenario: attach health bars to 20 entities, possess, verify bars visible in contact sheet (vision rubric line: "health bars readable at 10 m"), drive a button via `hud_widget_call`, assert event fired.

---

## S7 — Procedural Animation, IK & Morph Targets

**Problem today:** `MotionIKHooks.solveTwoBoneIK` computes mid-bone angle but never applies it (partial implementation, `src/motion/MotionIKHooks.ts:14`); no foot planting; morph targets zero matches; `MotionEventTrack` (deterministic, loop-safe, `src/motion/MotionEventTrack.ts:17`) exists only in the MotionGraph path — not in `AnimationStateMachine`.

**Files (new):** `src/motion/ik/FootIKSolver.ts`, `src/motion/ik/AimIKSolver.ts`, `src/animation/MorphTargetSystem.ts`, `src/animation/StateMachineEventBridge.ts`
**Files (modify):** `src/motion/MotionIKHooks.ts` (fix + reuse primitives), `src/animation/AnimationStateMachine.ts` (event bridge), `src/ai/commands/AnimCommands.ts`, `src/engine/builders.ts` (character IK rig flags)

**Foot IK (two-bone, per render frame at step 10b on interpolated poses):**
```
for each foot: ray = pos(foot) + up*probeUp(0.5) → down (2*probeUp)
  hit → target = hit.point + ankleOffset·hit.normal
  d = clamp(|target − hipWorld|, |l1−l2|+ε, l1+l2−ε)
  cosHip  = (l1² + d² − l2²)/(2·l1·d); cosKnee = (l1² + l2² − d²)/(2·l1·l2)
  hip:  rotate so limb axis aims at target (pole vector = knee-forward hint)
  knee: bend by π − acos(cosKnee) around pole-perpendicular   ← the missing apply
  foot: orient sole to hit.normal (clamped ±25°), preserve toe-off timing weight
pelvis lowering: rootOffset = min(0, minFootError)·0.7 (both feet planted on uneven ground)
weights: fade by state (airborne → 0, grounded → 1), per-foot trace of anim phase
```
**Aim/LookAt IK:** bone chain (head + 2 spine bones) with per-bone weight distribution `w_i·clamp(angle)` and per-bone angle limits; aim mode aligns weapon bone (hand → target, clamped chest rotation) — reuses the fixed two-bone primitive.

**Morph targets:** GLTFLoader parses `morphAttributes` + dictionary automatically; `MorphTargetSystem` binds mesh → named targets, exposes: `morph_set {entity, target, weight}`, normalization groups (visemes exclusive-sum-1, expressions additive-clamp-1), morph track playback via existing mixer (THREE supports morph weight tracks), phoneme lip-sync: `morph_lipsync {entity, cues: [{t, phoneme, weight}] }` (simple keyframe blend; no TTS dependency).

**Anim events → AnimationStateMachine:** `StateMachineEventBridge` ports `MotionEventTrack` semantics (exactly-once, loop/reverse safe) to the ASM clip set; event metadata ships in `ANIM_MAPPING` extension JSON: `clip → [{t: 0.42, name: 'footstep_l'}, {t, name:'hitbox_on', payload:{part:'fist'}}]`. Combat wiring: `hitbox_on/off` events toggle `CombatSystem.hitboxes` (`CombatSystem.ts:45-53`) — frame-accurate attack windows; `combat_wire_events {entity}` command.

**HELM/AICommands:** `ik_enable {entity, footIK|aimIK, params?}`, `ik_set_target {entity, kind: 'aim'|'look', target: [n,n,n]|entityId}`, `morph_set`, `morph_targets_list {entity}`, `morph_lipsync`, `anim_events_on {entity, clip?, listener: 'event'|'script'}`, `combat_wire_events`.

**SENSORIUM:** foot IK telemetry: foot-ground gap per foot (raycast vs posed ankle) — assertion `foot_gap_lt 0.05m` on slope-walk scenario (vision rubric: "no foot sinking on 30° slope"); event determinism test: run clip 3 loops, assert each event fired exactly 3× (counter query); morph test: `morph_set` smile 0→1, vision report line "facial expression visible in portrait framing".

---

## S8 — Clustered Forward+ Lighting & Reflection Probes

**Problem today:** stock three.js forward lighting; CSM exists (`CascadedShadowMap.ts`, 4-cascade); point/spot shadows unbounded (each `add_light` casts 1024² shadow = death at scale); no clustering, no probes (only sky PMREM, `SkyEnvironment.ts:65-77`).

**Files (new):** `src/rendering/lighting/LightBudgetSystem.ts` (Stage A), `src/rendering/lighting/LightCluster.ts` (Stage B), `src/rendering/lighting/ClusteredPatch.ts`, `src/rendering/lighting/ShadowAtlas.ts`, `src/rendering/lighting/ReflectionProbe.ts`, `src/rendering/lighting/ProbeVolumeManager.ts`
**Files (modify):** `src/rendering/Viewport.ts`, `src/engine/builders.ts` (light builder → logical light registry), `src/ai/commands/RenderCommands.ts`, `src/water/WaterMaterial.ts` + `src/terrain/TerrainMaterial.ts` + `src/world/FoliageMaterial.ts` (patched or probe-aware)

**Stage A — Light virtualization (unlimited logical lights, bounded GPU cost):**
- `add_light` registers into `LogicalLightRegistry` (no THREE light created). Each frame, `LightBudgetSystem` picks the best K physical lights (K = quality setting, default 24 point + 8 spot): score = `intensity · attenuationToNearestVisibleEntity · screenCoverage(camera)` (uses frustum + CullingSystem visibility). Repurposes a fixed pool of `THREE.PointLight/SpotLight` — position/color/intensity/shader-relevant props are cheap mutations; shadow casters limited to top-N by score.
- Zero shader changes; drops into Phase 4 early; the `light` AICommand surface is unchanged.

**Stage B — True clustered Forward+:**
```
grid: 16×9×24 clusters in view space (depth slices: exponential 1m..200m)
assign (step 11 pre-render): for each active light: sphere/AABB ↔ cluster AABB
  test (view-space math, CPU, ~0.1ms for 200 lights); store indices in
  DataTexture (RGBA16UI: cluster → light index list, 128 max/cluster)
shader injection (ClusteredPatch.onBeforeCompile on MeshStandardMaterial):
  replace lights_fragment_begin / lights_point_begin iteration:
    fetch cluster id from gl_FragCoord → light list → loop point/spot lights
    from uniform arrays (positions view-space, color, range, decay, spot cone)
  directional/CSM path untouched (three's built-ins preserved)
patch application: material factory wraps ALL standard-derived materials
  (terrain/water/foliage get the same onBeforeCompile chained before their own)
```
- **Shadow atlas:** single 2048² atlas — 4 spot tiles (priority by screen coverage) + point lights use 1-tile-per-face virtual cube or drop to unshadowed by priority; CSM keeps its own path. `ShadowAtlas.ts` renders atlas in a pre-pass, patches `shadowmap_pars`.
- **Reflection probes:** `ReflectionProbe {type:'box'|'sphere', bounds, resolution:256, cubecam → PMREM (reuse SkyEnvironment pattern at SkyEnvironment.ts:65-77), parallax box correction: clamp reflected ray to local AABB in envmap sampling chunk}`. `ProbeVolumeManager` assigns probes to materials by entity position (world-space, probe bounds shift with `WorldOrigin`); blending: nearest-2 probes crossfade by distance to bounds. Bake triggers: `reflection_probe_bake` (agent-invoked, async outside loop via settle), or auto on first placement.

**HELM/AICommands:** `light_cluster_status` (clusters, lightsAssigned, budget), `light_budget_set {maxPointLights, maxSpotShadows}`, `reflection_probe_create {type, size, resolution?}`, `reflection_probe_bake {id}`, `reflection_probe_remove {id}`, `reflection_probes_list`, `set_light_priority {entity, priority}`.

**SENSORIUM:** stress profile extension: setup spawns 60 point lights in a grid; assertions `fps_gt 45`, `light_cluster_status.lightsAssigned > 0`, no `low_fps` anomaly; probe vision test: indoor room with probe vs outdoor — vision rubric "reflections parallax-correct in doorway shot"; regression: terrain/water/foliage material golden-image diff (existing SceneDiagnostics baseline mechanism) after patch.

---

## S9 — Standalone Game Packaging & Export Pipeline

**Problem today:** `vite build` bundles the whole editor; `tauri build` packages the engine app (`src-tauri/tauri.conf.json`); games are dev-server data folders (`games/<name>/`) — no distributable per-game artifact exists.

**Files (new):** `src/game-main.ts` (standalone entry — no `src/editor/*`, no HELM WS client, no inspector/sensorium panels), `vite.game.config.ts` (mode `game`: entry swap, `define: { 'MIX_STANDALONE': 'true' }`, no dev middleware), `scripts/build-game.mjs` (orchestrator: web + desktop), `scripts/prepare-game-assets.mjs` (asset precompile), `src/export/GamePackager.ts` (runtime side: game.json manifest schema + scene pre-bundling), `src-tauri/tauri.game.conf.json` (per-game Tauri overlay)
**Files (modify):** `src/engine/Engine.ts` (compile-gated branches: `if (MIX_STANDALONE)` skips editor wiring), `vite.config.ts` (new `/api/export` endpoint, dev-only)

**Pipeline (`mix build-game <name> --targets web,windows`):**
```
1. validate: games/<name>/scene.json + game.json {title, icon, entryScene, window{w,h,fullscreen}}
2. prepare-game-assets: run texture pipeline (S10: KTX2 transcode), meshopt-compress GLBs
   (gltf-transform CLI), audio transcode (opus), emit manifest with content hashes
3. scene pre-bundle: scene.json + world chunks → single binary bundle (reuse chunk
   format at SceneManager.ts:553-618, concatenated + indexed)
4. vite build --config vite.game.config.ts --mode game  → dist-game/
   (tree-shaken: no editor DOM, no outliner/inspector/gizmo, no dev WS, HUD/UI/audio/
   physics/render full — MIX_STANDALONE gates ~14 imports)
5. web target: dist-game/ is shippable (static)
6. desktop: tauri build --config tauri.game.conf.json (overlay: productName=<title>,
   frontendDist=../dist-game, bundle targets per-OS) → .exe / .app / binary
```
- **HELM/agent control:** `export_game {game, targets, outDir?}` command → POST `/api/export` (dev server shells the script, streams progress via existing WS) — an IDE agent can ship a playable build end-to-end.
- **SENSORIUM:** export verification profile — after `export_game`, auto-launch `vite preview` on dist-game, run a smoke TestScript (possess, move 5 s, `frame_renders`, `no_errors`), then assert the report; guarantees exported builds are playable before delivery.

---

## S10 — Asset Compression & Environmental Audio DSP

**Problem today:** Draco only (`AssetLoaderQueue.ts:39`); KTX2 absent; `meshoptimizer@0.18.1` sits in node_modules undeclared/unused; audio has no ConvolverNode/reverb, no HTMLAudioElement streaming (`AudioManager.ts:16-21` is pure WebAudio buffer).

**Files (new):** `src/assets/loaders/KTX2TextureLoader.ts`, `src/assets/loaders/MeshoptLoader.ts`, `src/audio/ReverbZoneSystem.ts`, `src/audio/StreamingMusic.ts`, `src/audio/IRGenerator.ts`, `scripts/texture-pipeline.mjs` (offline: gltf-transform + tokrix → KTX2/BC7/ASTC)
**Files (modify):** `src/animation/AssetLoaderQueue.ts` (format dispatch), `src/audio/AudioManager.ts` (bus insert points: per-source → zone DSP chain → master), `src/audio/AudioMixer.ts`, `package.json` (add `meshoptimizer`, `ktx-parser`/transcoder artifacts in `public/basis/`)

- **KTX2 runtime:** `KTX2Loader.setTranscoderPath('/basis/').detectSupport(viewport.renderer)` wired into GLTFLoader (`setKTX2Loader`) + standalone texture loads; offline pipeline authors true GPU-compressed BC7 (desktop) / ASTC (mobile) — runtime transcode fallback handles the rest. VRAM-direct: `CompressedTexture` upload, no main-thread decode.
- **Meshopt:** `MeshoptDecoder` from `meshoptimizer` → GLTFLoader `setMeshoptDecoder`; `EXT_meshopt_compression` GLBs load transparently; `preload_assets` reports compressed formats in its stats.
- **Reverb zones:** `ReverbZone {id, shape:'sphere'|'box', bounds, mix, preset:'cave'|'hall'|'room'|'underwater'|'custom', irParams{decay, damp, size}, filter:{type:'lowpass', cutoff}}`. `IRGenerator` synthesizes impulse responses procedurally (exponentially-decaying filtered noise, stereo decorrelated — no IR assets needed; params → buffer). Chain: `dryBus + ConvolverNode(wet·mix) → filter → master`. Listener-position blending: inside multiple zones → weighted by distance-to-boundary falloff (matches existing `TriggerZoneConfig` update pattern at `AudioMixer.ts:226-254`); underwater preset also drives lowpass + pitch bend.
- **Streaming BGM:** `StreamingMusic` uses `HTMLAudioElement` → `createMediaElementSource` into the music bus (keeps mixer/crossfade working) for long tracks (no full decode); gapless queue + existing crossfade engine reused.
- **HELM/AICommands:** `audio_zone_create {zone}`, `audio_zone_remove`, `audio_zones_list`, `audio_zone_test {position}` (returns resolved wet/dry/filter state — assertion source), `music_stream {url, loop?}`, `asset_compression_status` (formats detected per asset).
- **SENSORIUM:** DSP assertions via `audio_zone_test` (deterministic, no audio hardware needed); vision test: cave scene with zone — unchanged visuals but telemetry asserts listener state transitions on entry/exit; perf: KTX2 vs PNG load-time benchmark in a preload stress profile (`fps_gt` during streaming).

---

## 3. Step-by-Step Implementation Roadmap

### Phase 1 — Foundations: ECS Lifecycle, Collision Matrix, CCD *(~2 weeks)*
| # | Task | Files |
|---|------|-------|
| 1.1 | `Component` base + `ComponentRegistry` + `@expose` schema bridge to Inspector | `src/ecs/Component.ts` (new), `src/ecs/ComponentRegistry.ts` (new), `src/inspector/SchemaDecorators.ts` (mod) |
| 1.2 | `LifecycleScheduler` (awake/start/fixed/late lists) + Engine loop wiring at steps 6/10b/11 | `src/ecs/LifecycleScheduler.ts` (new), `src/engine/Engine.ts:1074-1121` (mod), `src/ecs/SceneManager.ts` (mod) |
| 1.3 | Collision fan-out to component `onCollision*/onTrigger*` | `src/engine/Engine.ts:1151-1199` (mod) |
| 1.4 | DeferredOps extension: `reparent`, joint ops; `parentEntity` becomes deferred | `src/ecs/SceneManager.ts:70-72,323` (mod) |
| 1.5 | `CollisionMatrix` (compile, layer masks) + apply at every collider factory + KCC/ray filters | `src/physics/CollisionMatrix.ts` (new), `src/physics/PhysicsWorld.ts:125-183` (mod), `src/engine/builders.ts` (mod), `src/physics/defaultCollisionMatrix.json` (new) |
| 1.6 | CCD toggle (`bodyDesc.setCcdEnabled`, `set_ccd` command, spawn param) | `src/physics/PhysicsWorld.ts` (mod), `src/ai/commands/PhysicsCommands.ts` (mod) |
| 1.7 | `component_add/remove/set/get/list` commands + manifest + schema docs | `src/ai/commands/ComponentCommands.ts` (new), `src/ai/AIBridge.ts` (mod), `src/helm/manifest.ts` (mod) |
| 1.8 | Port `HealthComponent`/`InventorySystem` behind the new component model (compat shims) | `src/ecs/CombatSystem.ts` (mod), `src/items/InventorySystem.ts` (mod) |

### Phase 2 — Kinetic Core: KCC, Input, Joints/Ragdolls *(~3 weeks)*
| # | Task | Files |
|---|------|-------|
| 2.1 | `CharacterLocomotor` (Rapier KCC setup, fixed-step move, slope slide, autostep, snap) + Engine step-6 insertion | `src/character/CharacterLocomotor.ts` (new), `src/engine/Engine.ts:1076` (mod), `src/physics/PhysicsWorld.ts` (mod) |
| 2.2 | `KccDynamics` (gravity/apex/jump-cut/terminal/coyote/buffer) + `KccParams` schema | `src/character/KccDynamics.ts` (new), `src/character/KccParams.ts` (new) |
| 2.3 | `PlatformRider` (ground-body detection, velocity inheritance) | `src/character/PlatformRider.ts` (new) |
| 2.4 | Crouch (capsule rebuild) + dash; refactor `PlayerController` to intent-adapter over locomotor | `src/engine/PlayerController.ts` (mod), `src/character/CharacterLocomotor.ts` |
| 2.5 | KCC commands (`set_kcc_params`, `kcc_*`) + KccTelemetry + 4 SENSORIUM profiles (`kcc_stairs/slope/coyote/tunneling`) + jitter/grounding feel metrics | `src/ai/commands/CharacterCommands.ts` (new), `src/character/KccTelemetry.ts` (new), `src/sensorium/ScenarioLibrary.ts` (mod), `src/sensorium/FeelAnalyzer.ts` (mod), `src/sensorium/types.ts` (mod) |
| 2.6 | Input layer: `ActionMap`, `InputContextStack`, `GamepadDriver`, `SyntheticActionDriver`; migrate PlayerController + SENSORIUM runner to actions | `src/input/*` (new ×5), `src/engine/InputManager.ts` (mod), `src/sensorium/SensoriumRunner.ts:239-347` (mod) |
| 2.7 | Input commands + gamepad rumble + `input_synthetic` | `src/ai/commands/InputCommands.ts` (new) |
| 2.8 | `JointSystem` (6 joint types, motors, limits, break) + DeferredOps wiring + serialization | `src/physics/JointSystem.ts` (new), `src/ecs/SceneManager.ts` (mod) |
| 2.9 | `RagdollBuilder` (skeleton→bodies, humanoid limits, anim→ragdoll motor blend) + `ragdoll_*` commands | `src/physics/RagdollBuilder.ts` (new), `src/ai/commands/JointCommands.ts` (new) |

### Phase 3 — Agent Authoring: History, IK, Morph, Events *(~2.5 weeks)*
| # | Task | Files |
|---|------|-------|
| 3.1 | `CommandHistory` (transactions, branching, undo/redo) + AIBridge dispatch capture + editor gizmo/terrain/inspector integration | `src/history/*` (new ×4), `src/ai/AIBridge.ts:973` (mod), `src/editor/sceneIO.ts` (mod), `src/terrain/TerrainSystem.ts` (mod) |
| 3.2 | `SceneDiffer` + `history_*`/`transaction_*`/`scene_diff` commands + HELM `atomic` batches | `src/history/SceneDiffer.ts` (new), `src/helm/HelmBridge.ts:105` (mod) |
| 3.3 | Fix `solveTwoBoneIK` mid-bone application; `FootIKSolver` (ground probe, pole vectors, pelvis lowering) + `ik_*` commands | `src/motion/MotionIKHooks.ts` (mod), `src/motion/ik/FootIKSolver.ts` (new) |
| 3.4 | `AimIKSolver` (spine/head weights, weapon aim) | `src/motion/ik/AimIKSolver.ts` (new) |
| 3.5 | `MorphTargetSystem` (groups, lip-sync cues) + `morph_*` commands | `src/animation/MorphTargetSystem.ts` (new) |
| 3.6 | `StateMachineEventBridge` (ASM events) + `combat_wire_events` (hitbox windows from events) | `src/animation/StateMachineEventBridge.ts` (new), `src/ecs/CombatSystem.ts` (mod) |
| 3.7 | SENSORIUM: foot-gap assertions, event-fire-count assertions, slope-walk vision profile | `src/sensorium/*` (mod) |

### Phase 4 — Presentation: UI, Lighting, Audio, Compression *(~4 weeks)*
| # | Task | Files |
|---|------|-------|
| 4.1 | HUD evolution: layout engine (flex/anchor/pivot/9-slice), widget registry, 6 widget classes, gamepad focus nav | `src/ui/HUD.ts` (mod), `src/ui/widgets/*` (new ×6), `src/ui/layout/*` (new ×2) |
| 4.2 | Binding resolver extension (components/actions/gameplay) + `hud_set`/`hud_widget_call`/`hud_state_get` | `src/ui/HUD.ts` (mod), `src/ai/commands/HudCommands.ts` (mod) |
| 4.3 | World-space layer: `WorldCanvas` pool, `WorldUIBillboard`, damage numbers, `TerminalScreen` + `ui_world_*` commands + SceneDiagnostics coverage | `src/ui/world/*` (new ×3), `src/rendering/SceneDiagnostics.ts` (mod) |
| 4.4 | Lighting Stage A: `LogicalLightRegistry` + `LightBudgetSystem` virtualization (no shader change) | `src/rendering/lighting/LightBudgetSystem.ts` (new), `src/engine/builders.ts:495` (mod), `src/ai/commands/RenderCommands.ts:83` (mod) |
| 4.5 | Lighting Stage B: `LightCluster` grid + `ClusteredPatch` shader injection + material factory patching (terrain/water/foliage) | `src/rendering/lighting/LightCluster.ts`, `ClusteredPatch.ts` (new) |
| 4.6 | `ShadowAtlas` (prioritized spot/point tiles) + `set_light_priority` | `src/rendering/lighting/ShadowAtlas.ts` (new) |
| 4.7 | `ReflectionProbe` + `ProbeVolumeManager` (box/sphere, PMREM bake, parallax correction, 2-probe blend) + commands | `src/rendering/lighting/ReflectionProbe.ts`, `ProbeVolumeManager.ts` (new) |
| 4.8 | KTX2 pipeline (runtime + `scripts/texture-pipeline.mjs` offline) + Meshopt decoder + `AssetLoaderQueue` dispatch | `src/assets/loaders/*` (new ×2), `src/animation/AssetLoaderQueue.ts` (mod), `scripts/texture-pipeline.mjs` (new), `package.json` (mod) |
| 4.9 | `ReverbZoneSystem` + `IRGenerator` + `StreamingMusic` + zone/stream commands | `src/audio/*` (new ×3), `src/audio/AudioManager.ts` (mod) |
| 4.10 | SENSORIUM: 60-light stress profile, probe vision tests, UI coverage assertions, DSP state tests, material golden-image baselines | `src/sensorium/ScenarioLibrary.ts` (mod) |

### Phase 5 — Ship It: Export Pipeline & Hardening *(~2 weeks)*
| # | Task | Files |
|---|------|-------|
| 5.1 | `src/game-main.ts` standalone entry + `MIX_STANDALONE` compile gates in Engine | `src/game-main.ts` (new), `src/engine/Engine.ts` (mod) |
| 5.2 | `vite.game.config.ts` + `scripts/build-game.mjs` + `scripts/prepare-game-assets.mjs` | (new ×3) |
| 5.3 | `GamePackager` (game.json schema, scene binary pre-bundle) + `src-tauri/tauri.game.conf.json` overlay | `src/export/GamePackager.ts` (new), `src-tauri/tauri.game.conf.json` (new) |
| 5.4 | `export_game` command + `/api/export` dev endpoint + export smoke-test automation | `vite.config.ts` (mod), `scripts/build-game.mjs` |
| 5.5 | Full regression pass + perf budgets + docs (README, `.claude/MIX-COMMANDS.md`, manifest regen via `gen-typings`) | `docs/`, `scripts/gen-typings.js` run |

---

## 4. Verification & Regression Plan

**Per-phase gates (all must pass before the next phase starts):**

| Phase | Gate |
|-------|------|
| 1 | Unit: matrix compile, lifecycle counts (fixedUpdate == expected for N s), deferred-reparent invariant. Determinism: seeded 500-command HELM fuzz ×2 runs → identical `serializeSceneState` hash. |
| 2 | SENSORIUM: `kcc_stairs/slope/coyote/tunneling` green; `no_anomaly` incl. `fall_through=0` (the known current risk); feel scores ≥ baseline − tolerance (existing 6-point diff rule, `SensoriumRunner.ts:642`); jitter metric < 2mm std-dev at rest. Floating origin: 1500 m teleport + shift → `kcc_state` continuous, ground snap intact. Gamepad: synthetic `setAction` drives possessed character (action-state assertions). Joint stretch < 5 cm under ragdoll settle test. |
| 3 | History fuzz: 40 random mutating commands → full undo → hash-identical scene; undo-after-origin-shift correct; transaction rollback on failed assert. Foot-gap < 5 cm on 30° slope walk; event-fire-count exact over 3 loops; lip-sync weights sum to 1 (invariant assertion). |
| 4 | Stress: 60 lights @ `fps_gt 45`; material golden-image diffs (terrain/water/foliage pre/post patch) within baseline tolerance; billboard coverage in contact sheets; probe indoor/outdoor vision rubric pass; KTX2 load-time < 50% of PNG equivalent; reverb state machine unit tests + `audio_zone_test` assertions. |
| 5 | Exported web build passes the smoke profile (possess → 5 s move → `frame_renders` + `no_errors`); exported `.exe` boots fullscreen via Tauri on CI runner; bundle size budget (< editor bundle − 40%); no `editor`/`helm` strings in standalone bundle (grep gate). |

**Continuous invariants (checked every phase):**
1. **`npm run typecheck` + `npm test` (64 existing test files) green** — no regressions in tween/terrain/retarget suites.
2. **HELM manifest sync** — every new AICommand has a manifest entry (add a unit test asserting union ↔ manifest parity, replacing the hand-sync note at `manifest.ts:10-12`).
3. **Floating origin** — scripted 1000 m+ travel test per phase; no system may store unshifted absolute coordinates (code-review gate + origin-shift unit test battery).
4. **Determinism** — replay determinism maintained (`replay_play` on recorded input yields identical trajectory hash).
5. **SENSORIUM baseline discipline** — every new profile gets a stored baseline (`/api/sensorium/baseline`); CI diffs with the existing 6-point tolerance.
