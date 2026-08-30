# Round 2 bug sweep verification

Eight findings warranted fixes. Three were not confirmed against the current engine contracts and were left unchanged.

| Finding | Verdict | Evidence and action |
| --- | --- | --- |
| 18: render metrics | Confirmed, different cause | Three.js retains counters between synchronous renders; asynchronous queries do not inherently read zero. However, each post-processing render resets the counters, leaving only the final pass. `RenderPipeline` now accumulates all frame submissions and saves a completed-frame snapshot. Both commands use that snapshot and return an unavailable-sample error before the first completed frame. Triangle counts include repeated submissions across prepasses, shadows and post effects. |
| 19: non-physics entity lookup | Not confirmed in supported entity path | `SceneManager.instantiate()` always attaches a `rigidBody` component, and `EntityBuilder` returns that component. Static entities are still represented this way. There is no alternate render-object component or entity-ID mapping for arbitrary scene objects to query. Adding a new non-physics entity architecture is outside this bug fix. |
| 20: global anime lighting | Confirmed | Each viewport now owns its lighting context, registered by renderer through a weak map. Material draw hooks select that renderer's context, including when viewports share a scene or material. The legacy singleton remains only as a standalone compatibility default. |
| 21: existing materials remain stale | Confirmed | Materials refresh when their context or its revision changes at draw time, without requiring a manual scene traversal. Explicit material lighting overrides and `useSharedLighting: false` remain respected. |
| 22: material-array flattening | Confirmed | Conversion preserves the array, slot order and geometry groups, converts each slot, retains its texture and name, and prefers slot semantics over a compound mesh's name. The converted count counts material slots. Source materials are not disposed because other meshes may share them. |
| 23: alpha and sidedness loss | Confirmed | Conversion preserves transparency, alpha threshold, opacity, depth-write setting and side. The shader now consumes texture alpha and alpha-map green, discards cutouts, outputs alpha, and handles back-facing normals. UVs are assigned explicitly so texture sampling works without built-in material-map defines. |
| 24: total clip duration | Confirmed | The analyzer now sums all clip durations rather than taking their maximum. |
| 25: zero-cost savings | Confirmed with narrower reproduction | All explicitly supplied source costs can be zero, producing `NaN`. The planner now returns zero savings in that case. Missing metrics alone do not reproduce the issue because the planner supplies nonzero estimates. |
| 26: orthographic FOV | Not confirmed in supported viewport path | `Viewport.camera` and its constructor override are explicitly `PerspectiveCamera`; resize logic also relies on perspective aspect. Orthographic rendering exists in lower-level rendering APIs, but those are not the `Viewport` accepted by this describer. No camera support was added in this sweep. |
| 27: registry reference leak | Confirmed | Deep copies now cover quality steps and their nested disabled-pass arrays on lookup, fallback, listing and registration. |
| 28: compounded adaptive scale | Intentional existing behavior | `docs/graphics-upscaling.md` specifies adaptive scaling relative to the user's selected internal resolution. `internalHeight` is a cap, not a floor. The fixed-height resolver ignores `renderScale`; only the adaptive factor subsequently reduces the base buffer. Thus 540 × 0.60 = 324 pixels is permitted by the existing quality policy, not an accidental double application of the base setting. No resolution policy was changed. |

## Regression coverage

Validation: `npm run typecheck` and `git diff --check` passed. The focused run passed 59 tests, including nine new regression tests. The full run passed 1,202 tests across 174 files, but exited with a worker-startup timeout for `generalGameplay.test.ts`. Rerunning that file alone passed all 15 tests: 1,217 tests passed across the two runs, covering all 175 files. The initial full run itself was not a clean exit.

`test/renderBugSweepRound2.test.ts` covers grouped conversion, transparency properties, viewport isolation, style refresh, lighting overrides, total clip duration, zero costs, nested registry mutation, completed-frame accumulation, failed-frame behavior and both query commands.

`test/fixtures/anime-material-smoke.html` is a repeatable WebGL readback fixture for cutouts, opacity, alpha maps, back faces and runtime style changes. Run the Vite development server and open `/test/fixtures/anime-material-smoke.html`; its result panel reports `ALL PASSED` or a failure. Browser execution was unavailable in this session; this fixture was not GPU-validated here.
