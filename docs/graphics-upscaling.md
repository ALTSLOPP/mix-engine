# Graphics and low-spec rendering

Fresh settings enable **FSR 1** with a **540p internal cap**, **900p output cap**,
and **35% sharpening**. At 16:9 this is 960×540 → 1600×900: the scene and its
post-processing shade 36% of the pixels of native 900p, before the upscaling cost.
Shadows, bloom and ambient occlusion start off. SMAA remains on to clean up edges.
This does not guarantee a particular frame rate or a total VRAM budget; large
textures, geometry, draw calls, physics and gameplay still matter.

Controls are in **Engine Settings → Display & performance**, and in play mode
under **Escape → Display**. They apply immediately and save locally when
“Remember player preferences” is enabled. Existing saved choices are respected;
use **Low-spec 540p → 900p** to restore the defaults. The editor
Cancel button only cancels the separate Blender configuration, not live graphics
preferences.

- FSR off uses basic bilinear presentation at the selected internal/output sizes.
- Native / Quality disables FSR and sets internal scale to 100%, with native
  output (device pixel ratio capped at 2). It also enables shadows, bloom and AO.
- Internal and output caps can be selected independently. Automatic internal
  sizing uses the resolution-scale slider (50–150%); values above 100% supersample.
- Sharpening zero skips RCAS and frees its target. FSR is bypassed when internal
  resolution is equal to or greater than output.
- Resolution caps fit inside a 16:9 pixel budget, preserve the viewport's aspect
  ratio, respect the GPU texture-size limit, and never inflate a small viewport.
  A docked editor panel therefore may render fewer pixels than a fullscreen game.
- Automatic quality scaling is still opt-in. It reduces internal resolution
  relative to the user's selection, leaving presentation resolution unchanged.
- Preferences are browser-local and namespaced by URL path; they are not an OS
  display mode change.

## Implementation and compatibility

The WebGL2 renderer uses a GLSL port of AMD's open-source FSR 1 EASU and RCAS.
See [AMD's FSR 1 overview](https://gpuopen.com/fidelityfx-superresolution/) and
[the upstream implementation](https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h).
The license ships in public/third-party/FidelityFX-FSR-LICENSE.txt.
This is spatial FSR 1, not FSR 2/3 temporal reconstruction or frame generation.
It does not require WebGPU, motion vectors or a frame-history buffer.

The port replaces texture gathers with twelve texel-centre RGB samples for
WebGL2 compatibility, uses guarded full-precision arithmetic, and exposes a
linear RCAS strength. The centre-pixel RCAS limiter includes AMD's oversharpening
fix. It is not an AMD-certified integration.

Pipeline: internal HDR scene/effects → OutputPass tone mapping and sRGB encoding
→ internal SMAA (or earlier TAA) → output EASU → output RCAS → browser UI.
No second tone mapping or sRGB conversion is applied. DOM HUD and menus remain
at display resolution. The composer, effect targets and depth prepass use the
internal size. RCAS needs one extra RGBA8 output target without depth
(5.49 MiB at 1600×900), allocated lazily and released when unnecessary.

FSR adds GPU work and cannot fix a CPU-bound scene or VRAM exhaustion. Very old
GPUs may perform better with FSR off and basic scaling. WebGL2 and the engine's
existing HDR render-target support are still required. Spatial upscaling cannot
recover all missing detail and thin objects may shimmer at low internal sizes.

## API

```ts
engine.gameplayFeatures.settings.setPreferences({
  fsrEnabled: true,
  internalHeight: 540,
  outputHeight: 900,
  fsrSharpness: 0.35,
});
engine.gameplayFeatures.settings.applyQuality('low');
engine.viewport.getRenderResolution(); // actual internal and output pixel dimensions
```

For a viewport without player settings, use viewport.setResolutionSettings(...).
The legacy viewport.setRenderScale(value) selects automatic internal sizing.

## Verification

Focused tests cover resolution budgeting, FSR target lifetime, native bypass,
settings validation/persistence and editor controls. Run:

```sh
npm test -- --maxWorkers=2 test/fsrUpscaling.test.ts test/fsrSettings.test.ts test/generalGameplay.test.ts test/postFxPasses.test.ts test/renderAndMaterials.test.ts
```

With the Vite dev server running, open /test/fixtures/fsr-smoke.html to compile
and exercise the real GPU shaders without loading a game. It checks flat colors
and borders, FSR versus basic scaling, sharpening bypass and native resizing.
During implementation, the type check and 54 focused tests passed. Live browser
verification timed out, and the full production build was stopped after it
ceased making visible progress; hardware performance is not yet verified.
