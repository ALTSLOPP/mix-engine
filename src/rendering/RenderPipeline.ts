import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { SpeedLinesPass, ImpactFramePass } from './SpeedLinesPass';
import { FsrUpscaler } from './FsrUpscaler';
import {
  OutlinePass,
  VignettePass,
  ColorGradePass,
  ChromaticAberrationPass,
  FilmGrainPass,
  GodRaysPass,
  DepthOfFieldPass,
  SSRPass,
  VolumetricFogPass,
  MotionBlurPass,
  ContactShadowsPass,
  AutoExposurePass,
  TAAPass,
} from './PostFXPasses';

/** Halton low-discrepancy sequence — the standard TAA sub-pixel jitter generator. */
function halton(index: number, base: number): number {
  let result = 0, f = 1, i = index;
  while (i > 0) { f /= base; result += f * (i % base); i = Math.floor(i / base); }
  return result;
}

export interface RenderPipelineOptions {
  ao?: boolean;
  bloom?: boolean;
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  /** Ground-truth AO sampling radius, in world units. */
  aoRadius?: number;
  /** Custom extensions — all default off so the chain stays cheap. */
  outline?: boolean;
  vignette?: boolean;
  vignetteIntensity?: number;
  colorGrade?: boolean;
  chromaticAberration?: boolean;
  filmGrain?: boolean;
  filmGrainAmount?: number;
  /** Volumetric light shafts radiating from the sun. */
  godRays?: boolean;
  godRaysStrength?: number;
  /** Cinematic depth-of-field (circle-of-confusion bokeh). */
  dof?: boolean;
  dofFocusDistance?: number;
  dofBokehScale?: number;
  /** Screen-space reflections (wet-asphalt / glossy-floor mirrors). */
  ssr?: boolean;
  ssrIntensity?: number;
  /** Raymarched volumetric atmospheric fog with sun in-scatter. */
  volumetricFog?: boolean;
  fogDensity?: number;
  /** Camera motion blur (velocity from depth reprojection). */
  motionBlur?: boolean;
  motionBlurIntensity?: number;
  /** Screen-space contact shadows (fine sun-traced contact darkening). */
  contactShadows?: boolean;
  contactShadowIntensity?: number;
  /** HDR auto-exposure / eye adaptation. */
  autoExposure?: boolean;
  exposureKey?: number;
  /** Temporal anti-aliasing (jitter + reproject + clamp); replaces SMAA when on. */
  taa?: boolean;
}

/**
 * RenderPipeline.ts — a deferred-style post-processing chain, the kind every modern engine
 * runs by default:
 *
 *   RenderPass (HDR, linear) → GTAO → ContactShadows → SSR → VolumetricFog → TAA →
 *   UnrealBloom → GodRays → DoF → MotionBlur → Outline → Vignette → ColorGrade →
 *   ChromaticAberration → FilmGrain → AutoExposure → OutputPass (ACES + sRGB) → SMAA
 *
 * (TAA replaces SMAA when enabled — the pipeline disables one when the other turns on. The
 * camera is sub-pixel jittered only around the scene render so TAA can integrate frames.)
 *
 * The composer uses a half-float HDR target so bright highlights survive into bloom. Tone
 * mapping happens ONCE, in OutputPass (it reads renderer.toneMapping), so intermediate
 * passes operate in scene-referred linear light — exactly the Unreal/Unity ordering.
 *
 * Custom passes (Outline, Vignette, ColorGrade, ChromaticAberration, FilmGrain) are exposed
 * for the engine API / AI bridge so an IDE can dial in a cinematic look at runtime.
 */
export class RenderPipeline {
  readonly composer: EffectComposer;
  readonly bloomPass?: UnrealBloomPass;
  private aoPass?: GTAOPass;
  readonly ssrPass?: SSRPass;
  readonly volumetricFogPass?: VolumetricFogPass;
  readonly motionBlurPass?: MotionBlurPass;
  readonly contactShadowsPass?: ContactShadowsPass;
  readonly autoExposurePass?: AutoExposurePass;
  readonly taaPass?: TAAPass;
  readonly godRaysPass?: GodRaysPass;
  readonly dofPass?: DepthOfFieldPass;
  readonly outlinePass?: OutlinePass;
  readonly vignettePass?: VignettePass;
  readonly colorGradePass?: ColorGradePass;
  readonly chromaticAberrationPass?: ChromaticAberrationPass;
  readonly filmGrainPass?: FilmGrainPass;
  readonly speedLinesPass: SpeedLinesPass;
  readonly impactFramePass: ImpactFramePass;
  private readonly smaaPass: SMAAPass;
  private readonly passes: Pass[] = [];
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;

  // G-buffer pre-pass: the deferred-style passes (outline, DoF, SSR, fog, motion blur)
  // need to SAMPLE scene depth — and SSR additionally needs view-space normals. Sampling
  // the composer's own depth attachment while rendering into a ping-pong target it's bound
  // to forms a GL feedback loop (INVALID_OPERATION). Instead we render a single cheap pass
  // into this dedicated target (colour = view normals, plus a real depth texture) and
  // sample THAT. The override material is the normal material when SSR is on (so the colour
  // attachment carries normals) and the cheaper depth material otherwise; either way the
  // depth texture is valid. Gated to run only when some consumer is enabled.
  private gBufferRT?: THREE.WebGLRenderTarget;
  private readonly depthMaterial = new THREE.MeshDepthMaterial();
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  // Scratch matrices reused each frame for the camera-state feeds (no per-frame allocation).
  private readonly _invProj = new THREE.Matrix4();
  private readonly _viewProj = new THREE.Matrix4();
  private readonly _matWorldInv = new THREE.Matrix4();
  private readonly _camPos = new THREE.Vector3();
  readonly upscaler = new FsrUpscaler();
  private internalWidth = 1;
  private internalHeight = 1;
  private dynamicScale = 1;
  // TAA sub-pixel jitter + auto-exposure timing state.
  private _jitterFrame = 0;
  private _prevElapsed = -1;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    opts: RenderPipelineOptions = {},
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();

    // HDR working target so highlights above 1.0 reach the bloom pass intact. A depth
    // RENDERBUFFER (not a sampled texture) is enough for the RenderPass's own depth
    // testing; depth that post passes SAMPLE comes from the standalone prepass target.
    const hdrTarget = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
    });
    this.composer = new EffectComposer(renderer, hdrTarget);
    this.composer.setPixelRatio(1);
    this.composer.setSize(size.x, size.y);
    this.composer.renderToScreen = false;

    this.addPass(new RenderPass(scene, camera));

    // Ambient occlusion — defensive, since GTAO is the most version-sensitive pass.
    if (opts.ao !== false) {
      try {
        const ao = new GTAOPass(scene, camera, size.x, size.y);
        ao.output = GTAOPass.OUTPUT.Default;
        // Tune for a metre-scale scene: tight radius, gentle darkening.
        ao.updateGtaoMaterial({ radius: opts.aoRadius ?? 0.5, distanceExponent: 1, scale: 1 });
        this.aoPass = ao;
        this.addPass(ao);
      } catch (err) {
        console.warn('[RenderPipeline] GTAO unavailable — continuing without AO:', err);
      }
    }

    // Screen-space contact shadows — right after AO so the contact darkening lands on the
    // base lit image (before reflections/fog/bloom). Reads the G-buffer depth + sun dir.
    {
      const p = new ContactShadowsPass();
      p.setSize(size.x, size.y);
      p.enabled = opts.contactShadows ?? false;
      if (opts.contactShadowIntensity !== undefined) p.uniforms.intensity.value = opts.contactShadowIntensity;
      this.contactShadowsPass = p;
      this.addPass(p);
    }

    // Screen-space reflections — sits before bloom so reflected highlights bloom too.
    // Reads the lit HDR colour + the G-buffer depth/normals (fed each frame).
    {
      const p = new SSRPass();
      p.setSize(size.x, size.y);
      p.enabled = opts.ssr ?? false;
      if (opts.ssrIntensity !== undefined) p.uniforms.intensity.value = opts.ssrIntensity;
      this.ssrPass = p;
      this.addPass(p);
    }

    // Volumetric atmospheric fog — before bloom so the sun in-scatter shafts bloom.
    {
      const p = new VolumetricFogPass();
      p.enabled = opts.volumetricFog ?? false;
      if (opts.fogDensity !== undefined) p.uniforms.density.value = opts.fogDensity;
      this.volumetricFogPass = p;
      this.addPass(p);
    }

    // Temporal anti-aliasing — resolves the jittered scene (incl. noisy SSR/fog above it)
    // BEFORE bloom, so bloom/DoF see a clean, temporally-stable image. Replaces SMAA.
    {
      const p = new TAAPass();
      p.enabled = opts.taa ?? false;
      this.taaPass = p;
      this.addPass(p);
    }

    if (opts.bloom !== false) {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(size.x, size.y),
        opts.bloomStrength ?? 0.35,
        opts.bloomRadius ?? 0.5,
        opts.bloomThreshold ?? 0.9,
      );
      this.addPass(this.bloomPass);
    }

    // Volumetric light shafts (god rays). Reads the bloomed HDR buffer so the bright
    // sun/sky scatters; the Viewport feeds the sun's screen position each frame.
    {
      const p = new GodRaysPass();
      p.enabled = opts.godRays ?? false;
      if (opts.godRaysStrength !== undefined) p.uniforms.strength.value = opts.godRaysStrength;
      this.godRaysPass = p;
      this.addPass(p);
    }

    // Cinematic depth-of-field. Reads the scene depth texture (same one the outline
    // pass uses) and blurs by circle-of-confusion. In linear HDR → bright bokeh.
    {
      const p = new DepthOfFieldPass();
      p.enabled = opts.dof ?? false;
      if (opts.dofFocusDistance !== undefined) p.uniforms.focusDistance.value = opts.dofFocusDistance;
      if (opts.dofBokehScale !== undefined) p.uniforms.bokehScale.value = opts.dofBokehScale;
      this.dofPass = p;
      this.addPass(p);
    }

    // Camera motion blur — late in the HDR chain so it smears the fully-composed scene
    // (bloom, god rays, DoF included), the way a real shutter integrates the frame.
    {
      const p = new MotionBlurPass();
      p.enabled = opts.motionBlur ?? false;
      if (opts.motionBlurIntensity !== undefined) p.uniforms.intensity.value = opts.motionBlurIntensity;
      this.motionBlurPass = p;
      this.addPass(p);
    }

    // Optional custom passes — all default off so the chain stays cheap out of the box.
    // We ALWAYS create them (just keep them disabled) so the FX toggle can flip them
    // on at runtime without recreating the composer.
    {
      const p = new OutlinePass();
      p.setSize(size.x, size.y);
      p.enabled = opts.outline ?? false;
      this.outlinePass = p;
      this.addPass(p);
    }
    {
      const p = new VignettePass();
      p.uniforms.intensity.value = opts.vignetteIntensity ?? 0.45;
      p.enabled = opts.vignette ?? false;
      this.vignettePass = p;
      this.addPass(p);
    }
    {
      const p = new ColorGradePass();
      p.enabled = opts.colorGrade ?? false;
      this.colorGradePass = p;
      this.addPass(p);
    }
    {
      const p = new ChromaticAberrationPass();
      p.enabled = opts.chromaticAberration ?? false;
      this.chromaticAberrationPass = p;
      this.addPass(p);
    }
    {
      const p = new FilmGrainPass();
      p.uniforms.amount.value = opts.filmGrainAmount ?? 0.05;
      p.enabled = opts.filmGrain ?? false;
      this.filmGrainPass = p;
      this.addPass(p);
    }

    // HDR auto-exposure / eye adaptation — the LAST thing before tone mapping, so it scales
    // the fully-composed scene-referred HDR toward a key value (then OutputPass tonemaps).
    {
      const p = new AutoExposurePass();
      p.enabled = opts.autoExposure ?? false;
      if (opts.exposureKey !== undefined) p.uniforms.key.value = opts.exposureKey;
      this.autoExposurePass = p;
      this.addPass(p);
    }

    // Stylized action passes stay in the chain at negligible cost while inactive;
    // gameplay can drive their public uniforms without rebuilding the composer.
    this.speedLinesPass = new SpeedLinesPass();
    this.impactFramePass = new ImpactFramePass();
    this.addPass(this.speedLinesPass);
    this.addPass(this.impactFramePass);

    // ACES tone map + sRGB conversion (reads renderer.toneMapping / exposure).
    this.addPass(new OutputPass());

    // Antialias the final image (cheap, temporally stable, no ghosting).
    this.smaaPass = new SMAAPass(size.x * pr, size.y * pr);
    this.addPass(this.smaaPass);
    // TAA and SMAA both anti-alias — if TAA starts on, SMAA stays off.
    if (this.taaPass?.enabled) this.smaaPass.enabled = false;
    this.setSize(size.x, size.y);
    this.upscaler.setSize(Math.round(size.x * pr), Math.round(size.y * pr));
  }

  private ensureGBufferRT(): THREE.WebGLRenderTarget {
    const w = this.composer.renderTarget1.width;
    const h = this.composer.renderTarget1.height;
    if (!this.gBufferRT) {
      const dt = new THREE.DepthTexture(w, h);
      dt.format = THREE.DepthFormat;
      dt.type = THREE.UnsignedIntType;
      // Colour attachment carries view-space normals (when the normal material runs).
      // NoColorSpace so the renderer doesn't sRGB-encode the packed [0,1] normals.
      this.gBufferRT = new THREE.WebGLRenderTarget(w, h, { depthTexture: dt, depthBuffer: true });
      this.gBufferRT.texture.colorSpace = THREE.NoColorSpace;
    } else if (this.gBufferRT.width !== w || this.gBufferRT.height !== h) {
      this.gBufferRT.setSize(w, h);
    }
    return this.gBufferRT;
  }

  private depthConsumersActive(): boolean {
    return !!(
      this.dofPass?.enabled ||
      this.outlinePass?.enabled ||
      this.ssrPass?.enabled ||
      this.volumetricFogPass?.enabled ||
      this.motionBlurPass?.enabled ||
      this.contactShadowsPass?.enabled ||
      this.taaPass?.enabled
    );
  }

  /** Cheap G-buffer render into a standalone target, sampled by the deferred passes.
   *  Avoids the composer-depth feedback loop. No-op unless a consumer is enabled.
   *  Renders the normal material when SSR is on (colour = view normals), else the
   *  cheaper depth material; either way the depth texture is valid for everyone. */
  private renderGBufferPrepass(): void {
    if (!this.depthConsumersActive()) return;
    const rt = this.ensureGBufferRT();
    const r = this.renderer;
    const wantNormals = !!this.ssrPass?.enabled;
    const prevTarget = r.getRenderTarget();
    const prevShadowAuto = r.shadowMap.autoUpdate;
    const prevOverride = this.scene.overrideMaterial;
    r.shadowMap.autoUpdate = false;            // prepass needs no shadows
    this.scene.overrideMaterial = wantNormals ? this.normalMaterial : this.depthMaterial;
    r.setRenderTarget(rt);
    r.clear();
    r.render(this.scene, this.camera);
    this.scene.overrideMaterial = prevOverride;
    r.shadowMap.autoUpdate = prevShadowAuto;
    r.setRenderTarget(prevTarget);
    const depth = rt.depthTexture;
    const w = rt.width, h = rt.height;
    if (this.dofPass) { this.dofPass.setDepthTexture(depth); this.dofPass.setSize(w, h); }
    if (this.outlinePass) { this.outlinePass.setDepthTexture(depth); this.outlinePass.setSize(w, h); }
    if (this.volumetricFogPass) this.volumetricFogPass.setDepthTexture(depth);
    if (this.motionBlurPass) this.motionBlurPass.setDepthTexture(depth);
    if (this.taaPass) this.taaPass.setDepthTexture(depth);
    if (this.contactShadowsPass) { this.contactShadowsPass.setDepthTexture(depth); this.contactShadowsPass.setSize(w, h); }
    if (this.ssrPass) {
      this.ssrPass.setDepthTexture(depth);
      this.ssrPass.setNormalTexture(rt.texture);
      this.ssrPass.setSize(w, h);
    }
  }

  /** Push per-frame data into the time/camera-dependent passes (call each frame). */
  tick(timeSeconds: number): void {
    if (this.filmGrainPass) this.filmGrainPass.setTime(timeSeconds);
    // DoF linearises perspective depth, which depends on the live clip planes.
    if (this.dofPass) {
      const cam = this.camera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) this.dofPass.setCameraClip(cam.near, cam.far);
    }
    // Frame delta drives framerate-independent eye adaptation.
    if (this.autoExposurePass) {
      const dt = this._prevElapsed < 0 ? 0.016 : Math.max(0, Math.min(0.1, timeSeconds - this._prevElapsed));
      this.autoExposurePass.setDeltaTime(dt);
    }
    this._prevElapsed = timeSeconds;
  }

  /** Feed the sun's projected screen position (UV 0..1) + on-screen visibility (0..1)
   *  into the god-rays pass. The Viewport computes this from the sky's sun direction. */
  setSunScreenPosition(uvX: number, uvY: number, visible: number): void {
    this.godRaysPass?.setLight(uvX, uvY, visible);
  }

  /** Push the live camera matrices into the deferred passes (SSR view-space march,
   *  fog world-ray reconstruction, motion-blur reprojection). Call each frame, after
   *  the camera's world matrix is up to date. Cheap; reuses scratch matrices. */
  setCameraState(camera: THREE.Camera): void {
    const persp = camera as THREE.PerspectiveCamera;
    // matrixWorldInverse is only refreshed by the renderer at draw time, but we run
    // before composer.render() — so derive everything from the (current) world matrix.
    camera.updateMatrixWorld();
    this._invProj.copy(camera.projectionMatrix).invert();
    this._matWorldInv.copy(camera.matrixWorld).invert();
    this._camPos.setFromMatrixPosition(camera.matrixWorld);
    const near = persp.isPerspectiveCamera ? persp.near : 0.1;
    // viewProjection = projection * viewMatrix (world → clip), for reprojection.
    this._viewProj.multiplyMatrices(camera.projectionMatrix, this._matWorldInv);
    if (this.ssrPass) this.ssrPass.setCameraMatrices(camera.projectionMatrix, this._invProj, near);
    if (this.volumetricFogPass) this.volumetricFogPass.setCameraState(this._invProj, camera.matrixWorld, this._camPos);
    if (this.motionBlurPass) this.motionBlurPass.setCameraState(this._invProj, camera.matrixWorld, this._viewProj);
    if (this.contactShadowsPass) this.contactShadowsPass.setCameraMatrices(camera.projectionMatrix, this._invProj, this._matWorldInv);
    if (this.taaPass) this.taaPass.setCameraState(this._invProj, camera.matrixWorld, this._viewProj);
  }

  /** Feed the sun direction + colour into the passes that scatter/trace sunlight
   *  (volumetric fog in-scatter, contact-shadow trace direction). */
  setSunState(direction: THREE.Vector3, color: THREE.Color): void {
    this.volumetricFogPass?.setSun(direction, color);
    this.contactShadowsPass?.setSun(direction);
  }

  private addPass(pass: Pass): void {
    this.composer.addPass(pass);
    this.passes.push(pass);
  }

  render(): void {
    this.renderGBufferPrepass();
    // TAA: nudge the camera a sub-pixel amount (Halton) for THIS scene render only, so
    // successive frames sample different sub-pixel positions and the resolve integrates
    // them into a supersampled image. Applied directly to projectionMatrix.m02/m12 (a
    // constant screen-space shift) and restored immediately after, so nothing else sees it.
    const cam = this.camera as THREE.PerspectiveCamera;
    const taaOn = !!this.taaPass?.enabled && cam.isPerspectiveCamera;
    let e8 = 0, e9 = 0;
    if (taaOn) {
      const w = this.composer.renderTarget1.width || 1;
      const h = this.composer.renderTarget1.height || 1;
      this._jitterFrame = (this._jitterFrame + 1) % 8;
      const jx = (halton(this._jitterFrame + 1, 2) - 0.5) * 2 / w;
      const jy = (halton(this._jitterFrame + 1, 3) - 0.5) * 2 / h;
      e8 = cam.projectionMatrix.elements[8];
      e9 = cam.projectionMatrix.elements[9];
      cam.projectionMatrix.elements[8] = e8 + jx;
      cam.projectionMatrix.elements[9] = e9 + jy;
    }
    try {
      this.composer.render();
      this.upscaler.render(this.renderer, this.composer.readBuffer);
    } finally {
      if (taaOn) {
        cam.projectionMatrix.elements[8] = e8;
        cam.projectionMatrix.elements[9] = e9;
      }
    }
  }

  /** TAA and SMAA are mutually exclusive (both anti-alias). Turning one on disables the
   *  other; the AIBridge calls this so a single command flips the whole AA strategy. */
  setTemporalAA(on: boolean): void {
    if (this.taaPass) this.taaPass.enabled = on;
    this.smaaPass.enabled = !on;
  }

  setAmbientOcclusion(enabled: boolean): void { if (this.aoPass) this.aoPass.enabled = enabled; }

  /** Legacy adapter: changes internal resolution only, never presentation size. */
  setPixelRatio(ratio: number): void { this.setDynamicResolutionScale(ratio); }

  setOutputSize(width: number, height: number): void { this.upscaler.setSize(width, height); }

  /** Physical internal pixels. Output size and devicePixelRatio are independent. */
  setSize(width: number, height: number): void {
    this.internalWidth = Math.max(1, Math.round(width));
    this.internalHeight = Math.max(1, Math.round(height));
    this.resizeInternal();
  }

  setDynamicResolutionScale(scale: number): void {
    if (!Number.isFinite(scale)) return;
    this.dynamicScale = Math.max(0.5, Math.min(1, scale));
    this.resizeInternal();
  }

  private resizeInternal(): void {
    const width = Math.max(1, Math.round(this.internalWidth * this.dynamicScale));
    const height = Math.max(1, Math.round(this.internalHeight * this.dynamicScale));
    // EffectComposer propagates these exact dimensions to EVERY pass, including TAA.
    this.composer.setSize(width, height);
    this.gBufferRT?.setSize(width, height);
  }

  dispose(): void {
    for (const pass of this.passes) (pass as { dispose?: () => void }).dispose?.();
    this.composer.dispose();
    this.upscaler.dispose();
    this.gBufferRT?.dispose();
    this.depthMaterial.dispose();
    this.normalMaterial.dispose();
  }
}
