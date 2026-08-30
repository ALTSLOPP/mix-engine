# MIX Engine

AI-Native, text-first 3D open-world urban game engine.
**Stack:** TypeScript · Vite · Three.js (r0.170) · Rapier3D (`@dimforge/rapier3d-compat` 0.14)

Implements **Step 1 (Viewport/Camera/Gizmo)** and **Step 2 (AI Data Layer, Physics, ECS)** from
[`MIX-Engine-Plan-final_2.md`](MIX-Engine-Plan-final_2.md).

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (or the port Vite prints)
npm run build      # tsc --noEmit + vite build
npm run typecheck
```

### Demo controls
| Input | Action |
|-------|--------|
| Hold **RMB** + WASD / Q / E | Fly the editor camera (mouse looks, wheel adjusts speed) |
| **LMB** | Pick an entity (attaches the transform gizmo) |
| **1 / 2 / 3** | Gizmo translate / rotate / scale |
| **B** | Drop a box in front of the camera |
| **F5** | Toggle play / editor mode · **Esc** editor |

### Low-spec graphics

FSR 1 is enabled by default: 540p internal → 900p output, with expensive effects
off. Change FSR, resolution caps and sharpening in **Engine Settings** or
**Escape → Display**. Preferences are saved locally.
See [graphics and upscaling](docs/graphics-upscaling.md) for details and limitations.

### Controllers

Controllers are hot-pluggable and use Unity-style semantic paths such as `<Gamepad>/buttonSouth` and `<Gamepad>/leftStick`. Connected devices appear in the editor header and Engine Settings. IDE agents can discover devices and controls, then export or replace the complete JSON action asset through HELM or `mix.input`. See [Controller input](docs/controller-input.md).

## Architecture

18 source files across 8 subsystems (`src/`), built in dependency order. See the plan's
"Dependency Graph" and "Engine Loop". The render loop in [`Engine.ts`](src/engine/Engine.ts)
follows the canonical 12-step order exactly: input → camera → stream → AI → animation →
fixed-step physics → alpha/keep-ratio → deferred flush → floating-origin → interpolation →
render → endFrame.

## Rendering — "looks good out of the box"

The viewport ships a deferred-style post-processing pipeline modelled on what Unreal/Unity
enable by default ([`RenderPipeline.ts`](src/rendering/RenderPipeline.ts),
[`SkyEnvironment.ts`](src/rendering/SkyEnvironment.ts)):

- **Physically-based sky** (Preetham) rendered once into a cube map for the background and
  PMREM-filtered for image-based lighting — every PBR material gets coherent sky reflections.
- **HDR pipeline** (half-float targets) → **GTAO** ground-truth ambient occlusion → **UnrealBloom** →
  **ACES** tone map + sRGB (`OutputPass`) → **SMAA** antialiasing. Tone mapping happens once, last,
  so all effects run in scene-referred linear light (the correct ordering).
- **Sun aligned to the sky**, soft PCF shadows on a camera-following 2048² map, and **exponential
  height fog** tuned to the horizon for depth.

Tunable via `new RenderPipeline(renderer, scene, camera, { bloomStrength, bloomThreshold, aoRadius … })`
and `SkyEnvironment` options (`elevationDeg`, `turbidity`, `fogDensity` …).

## Bugs fixed from the plan during implementation

The plan was implemented faithfully, with these concrete corrections:

1. **`TransformControls` is not `THREE.TransformControls`** (plan §TransformGizmo). In r0.170 it is a
   separate ESM module (`three/examples/jsm/controls/TransformControls.js`) and is *not* an
   `Object3D` — the visual helper is added with `getHelper()`. Fixed in
   [`TransformGizmo.ts`](src/rendering/TransformGizmo.ts).
2. **Rapier `World.step()` takes no `dt`** (plan §PhysicsWorld). The timestep is `world.timestep`;
   `step(dt)` now sets `world.timestep = dt` (always `FIXED_DT`) before stepping.
   [`PhysicsWorld.ts`](src/physics/PhysicsWorld.ts).
3. **`InputManager.endFrame()` must clear per-frame state** — `keysPressed`, `mouseDelta`,
   `wheelDelta` — every frame, not only on blur, or `isKeyPressed`/deltas latch forever.
   [`InputManager.ts`](src/engine/InputManager.ts).
4. **Root-motion extraction order** — the root track must be *sampled* for its per-frame delta
   *before* it is removed from the mixer's bone influence; you cannot read a delta from a deleted
   track. [`AnimationStateMachine.ts`](src/animation/AnimationStateMachine.ts).
5. **Collision events require `ActiveEvents.COLLISION_EVENTS`** on the collider, otherwise
   `drainCollisionEvents` is always empty (unstated in the plan).
   [`PhysicsWorld.ts`](src/physics/PhysicsWorld.ts).

## Verified at runtime

Driven in a headless browser against the dev server:

- Physics simulates and a 6-box tower stacks stably; shadows from a camera-anchored sun.
- **Floating origin**: shoving the camera past 1000 units absorbs the shift into `worldOrigin.offset`,
  recenters the camera to engine-origin, and preserves every entity's world position with **zero drift**.
- **Gizmo authority**: attach swaps the body Dynamic→KinematicPositionBased→Dynamic and interpolation
  is skipped while the gizmo owns the entity.
- **AI `set_transform`**: world-space teleport lands exactly, with zero velocity carry.
- **Deferred destroy**: removes exactly one entity (swap-pop hot lists intact); owned-resource disposal
  never blacks out surviving entities.

> Note: chunk streaming is opt-in (`chunkManager.setStreamingEnabled(true)`) and expects chunk
> binaries under `public/worlds/chunks/`; with none present it backs off gracefully. The
> floating-origin system runs regardless. GLB-dependent paths (asset instancing, Mixamo retargeting)
> are implemented to spec and exercised when real `.glb` assets are registered.

## SENSORIUM — the AI's perception layer

**SENSORIUM** lets a vision-capable model (Claude, GPT-4V, Gemini …) actually *experience* a
playthrough: it **watches** the footage and **feels** the telemetry. Tell an agent "test the driving
mechanics" and the engine opens a driving scenario, drives the real `PlayerController` with synthetic
input, records video + per-frame telemetry, quantifies how it *felt*, and hands a vision model a
ready-to-analyze package. Grep `SENSORIUM` to find every file/command/endpoint. It lives in
[`src/sensorium/`](src/sensorium); the old `PLAYBACK` names remain as deprecated aliases.

**Pipeline** (`src/sensorium/`):
`ScenarioLibrary` (profile → timeline) → `SensoriumRunner` (orchestrator, runs on the engine loop) →
`TelemetryRecorder` + `SensoriumRecorder` (video/keyframes) → `AnomalyDetector` →
`FeelAnalyzer` (telemetry → FeelProfile) → `VisionReportBuilder` (prompt + contact-sheet + request).

**Drive it**
- IDE / CLI: `node scripts/mix-cli.js test --profile driving` (also `locomotion`, `jump`, `combat`,
  `camera`, `stress`), or POST `{ "type": "sensorium_test", "profile": "driving" }` to `/api/cli-command`.
- In-engine panel: bottom-right **◎ SENSORIUM** → pick a scenario; shows the live feel score.
- REPL: `mix.test('driving')`, `mix.runSensorium(script)`, `mix.saveBaseline('v1')`.

**The "feel" layer (`FeelAnalyzer`)** — kinesthetic proxies derived from physics telemetry, each a raw
value + a 0–100 score: **responsiveness** (input→motion latency), **snappiness** (accel onset),
**floatiness**, **stability** (jitter/catching), **camera smoothness**, **frame pacing**, **weight**,
and **grip** (driving slip angle). These feed the vision prompt so the model correlates what it *sees*
with what the engine *felt*. Save a run as a baseline and future runs diff against it to catch feel
regressions.

**Artifacts** land under `public/sensorium/<run>/`: `video.webm`, `keyframes/`, `contact-sheet.png`
(captioned montage for image-only models), `telemetry.jsonl`, `report.json`. The dev server exposes
`/api/sensorium/{video,keyframe,contactsheet,telemetry,report,list,get,baseline}` (and `/api/playback/*`
as a legacy alias).

### Bugs fixed rebuilding MiniMax's "Playback" into SENSORIUM

1. **The run never resolved.** `run()` and `loop()` each created a promise but shared one resolver
   field; only the inner one was ever resolved, so `await engine.runPlayback(...)` hung forever and
   the UI await-chain never completed. SENSORIUM uses a single promise resolved once in `finish()`.
2. **Zero velocity / "never moved" / empty feel.** The possessed character is a
   `KinematicPositionBased` body, for which Rapier's `linvel()` is always `0`. Telemetry, feel and
   anomalies now derive speed from **world-space position delta** (continuous across floating-origin
   shifts), so a visibly-moving character reads as moving.
3. **Synthetic input wiped on focus loss.** `blur`/`visibilitychange` cleared `keysDown`, freezing the
   character whenever the window wasn't focused — fatal for automated/CI/background runs. In test mode
   `clearTransient` is now a no-op, so scripted input survives.
4. **Keyframes 404'd.** Recorded URLs dropped the `keyframes/` path segment, so every frame handed to
   the model was a dead link. Client and server now generate the identical path.
5. **False collision anomalies.** The old detector flagged *every* fast collision because it never
   resolved which body was hit; it now attributes contacts to the possessed body via
   `rapierBodyFromColliderHandle` (a helper that previously existed but was unused).
6. **Wrong test duration in the prompt** (reported page-uptime), **first-frame FPS garbage** (`_lastTick`
   started at 0), **dropped assertions** (a top-level `assertions` array the runner never read — they're
   `assert` actions now), and **derivative spikes** at low frame-rate (acceleration is smoothed + p95).
   The runner also no longer runs a second rAF loop alongside the engine's.

## HELM — the agent control plane

The MIX Engine's defining strength is being **driven by an IDE coding agent** (Claude Code, Codex,
OpenCode, Copilot). The original bridge was fire-and-forget: an agent POSTed a command over the WS
bridge and got *nothing* back — no ack, no created id, no error — and had to poll a separate cache to
read state. **HELM** turns that one-way pipe into a real **request/response control plane**: every
request returns a structured result, and the agent can introspect, probe, checkpoint, and validate.
It lives in [`src/helm/`](src/helm) and is separate from SENSORIUM (HELM = *authoring/control*,
SENSORIUM = *vision/feel testing*).

**Ops** (`POST /api/helm/rpc` with `{ op, … }`):
- `do` — run a batch of `AICommand`s; returns the **entities created/removed**, warnings and errors.
- `plan` — preflight a batch with zero mutations; catches misspelled commands, missing parameters,
  unsafe payloads, and operations that cannot be rolled back atomically.
- `apply` — the preferred IDE authoring path: serializes concurrent agent edits, preflights, executes,
  returns a semantic **before/after diff**, verifies `expects`, rolls back failed scene edits, and uses a
  `requestKey` to make retries idempotent (no duplicate spawns when an IDE retries a timed-out call).
- `resolve` — maps stable IDE selectors (`@name`, `guid:…`, unique `tag:…`, `id:…`) to the current
  runtime entity. Ambiguous names/tags fail with candidates; HELM never guesses which object to edit.
- `describe` — token-efficient summary of the whole scene (entities, camera, bounds, selection, mode).
- `observe` — **render-grounded** "look at the screen": renders the live scene offscreen and reports frame
  health (black / blown-out) + each entity's on-screen **pixel coverage** + position + plain-English
  anomalies. Catches what state can't — an entity can *exist* yet draw zero pixels (invisible / occluded /
  mis-scaled). The agent's eyes when there's no human at the screen; works headless.
- `query` / `get` — filtered entity list / full info on one entity (world position + size + body type).
- `raycast` — what entity is under a screen point — the agent's "look at the crosshair".
- `checkpoint` / `restore` / `checkpoints` — named in-memory snapshots, so an agent can try edits and roll back.
- `assert` — expectations so the agent can **validate its own edits** — scene-state (`entity_exists`,
  `entity_count`, `entity_near`, `no_errors`) **and render-grounded** (`entity_visible`, `frame_renders`).
- `manifest` — the engine self-describes every op + `AICommand` (with parameters) so an agent/MCP can
  discover the API. `status` — liveness.

**How the round-trip works:** the dev server forwards a request to the browser over the WS bridge and
**holds the HTTP response** until the engine POSTs the matching result to `/api/helm/rpc-result`
(correlated by id, with a timeout). So an agent gets a synchronous-feeling structured reply.

**Drive it**
- CLI: `node scripts/mix-helm.js describe` · `… plan --file edits.json --atomic` ·
  `… apply --file edits.json --expects-file checks.json --request-key hero-pass-v1`
  · `… do '{"type":"spawn_entity","x":0,"y":1.5,"z":0,"glbPath":"ayo"}'`
  · `… query --kind character` · `… checkpoint --name v1` · `… assert '[{"kind":"entity_exists","name":"hero"}]'`
- **MCP server** (native tool-calls for the IDE): `node scripts/mix-mcp.js` — a stdio MCP server (Node
  built-ins, no deps) exposing `mix_describe`, `mix_observe`, `mix_query`, `mix_plan`, `mix_apply`, `mix_do`, `mix_raycast`,
  `mix_checkpoint`, `mix_assert`, … Register with e.g. `claude mcp add mix -- node scripts/mix-mcp.js`.
- REPL: `mix.helm({ op: 'describe' })`.

For authored scene changes, use `plan → apply` and give each logical edit a stable `requestKey`.
Atomic apply intentionally accepts only scene-graph commands it can fully reverse (spawn/destroy/transform,
naming/tagging/parenting, groups/scatter, and clear). Split audio, network, filesystem, weather, and other
runtime side effects into `atomic:false` batches after reviewing the plan; HELM refuses to claim a rollback
it cannot guarantee.

Use semantic references in entity-id fields so scripts survive reloads, checkpoints, and id reissuance:

```json
{
  "type": "set_transform",
  "entityId": "@hero",
  "position": { "x": 12, "y": 0, "z": -4 }
}
```

`@hero` resolves an exact entity name; `guid:7e…` is the strongest persistent identity; `tag:boss`
works only when exactly one entity carries that tag. Resolution happens during `plan`/`apply`, before
any mutation. The returned `normalizedCommands` show the exact numeric ids HELM will execute.

### World Composer — prompt to authored open world

IDE agents should prefer `world_compose` over manually chaining terrain, water, weather, foliage,
road, and navigation commands. A sparse recipe is expanded into deterministic terrain and biomes,
semantic points of interest, traversable painted roads/trails, carved rivers, cinematic atmosphere,
streamed vegetation, water, and an optional budgeted navmesh. `world_report` then gives the agent a
live readiness grade and specific fixes instead of making it guess whether the build landed.

```powershell
node scripts/mix-helm.js do '{"type":"world_compose","seed":42,"theme":"tropical","landform":"archipelago","mood":"cinematic","quality":"balanced"}'
node scripts/mix-helm.js do '{"type":"world_report"}'
```

For final-quality builds set `quality:"aaa"`. During iteration, `balanced` is deliberately faster.
Agents can provide `paths` (`road`, `trail`, `river`) and named `pointsOfInterest`, or leave
`autoLayout` enabled to receive a player start, landmark, vista, hero route, and theme-appropriate
watershed automatically. See [`docs/WORLD_COMPOSER_IDE.md`](docs/WORLD_COMPOSER_IDE.md).

Requires `npm run dev` with the engine open in a browser (HELM drives the live engine). Settle waits
are timer-based (not rAF) so a backgrounded engine tab never hangs a request; loop-dependent ops like
`do`-spawns still need the engine simulation running (keep the tab reasonably active).

## Polish & QoL pass

A hardening + quality-of-life pass over both systems:

- **HELM `do` now knows when a batch has *fully* landed**, not just dispatched. It waits until the
  command queue is empty **and** no async handler (GLB spawn / scene load) is in flight (`AIBridge.inFlightAsync`)
  **and** there are no pending deferred ops (`SceneManager.hasPendingDeferredOps`). The old fixed-timer
  settle could return *before* an async GLB spawn landed, so `do` would report no created entity.
- **HELM `checkpoint`/`restore` works for GLB-backed entities.** Restore re-preloads the snapshot's
  assets first (destroying the last instance evicts an asset from the cache, which used to make the
  rebuild throw) and isolates per-entity failures, so a character round-trips with its name + tags intact.
- **Agent edits reflect in the editor live.** HELM (`do`/`restore`) and SENSORIUM dispatch a
  `mix:scene-changed` event; the editor refreshes its outliner/inspector + autosaves (debounced) — no
  manual click needed.
- **Capability manifest is served statically** (`GET /api/helm/manifest`) — discoverable even before the
  engine tab is open, and returns the bare manifest.
- **SENSORIUM clean teardown**: a run restores editor mode + unpossesses on finish (set
  `record.keepPlayState: true` to stay in play mode), and a **watchdog** force-finishes if the engine
  loop stalls so `await runSensorium(...)` can never hang.
- **SENSORIUM panel** shows quick-links (▷ video · ▦ frames · ⤓ report) after a run, and the contact-sheet
  source set is memory-capped for long runs.
- The MCP server gained a `mix_sensorium_test` tool, bridging the two systems (an agent can launch a
  feel-test, then read the report from `/api/sensorium/`).
