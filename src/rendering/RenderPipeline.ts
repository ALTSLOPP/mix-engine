import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { SpeedLinesPass, ImpactFramePass } from './SpeedLinesPass';
import { FsrUpscaler } from './FsrUpscaler';
import { AtmosphericDepthPass } from './anime/AtmosphericDepthPass';
import { AnimeTonemappingPass } from './anime/AnimeTonemappingPass';
import type { VisualStyleDescriptor } from './profiles/VisualStyleRegistry';
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
  /** Lightweight anime aerial atmosphere pass. */
  atmosphericDepth?: boolean;
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

/** GPU submissions across the prepass, scene, shadows, post effects and upscaler. */
export interface RenderFrameMetrics {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

/**
 * RenderPipeline.ts — a deferred-style post-processing chain, the kind every modern engine
 * runs by default:
 *
 *   RenderPass (HDR, linear) → GTAO → ContactShadows → SSR → VolumetricFog → AtmosphericDepth → TAA →
 *   UnrealBloom → GodRays → DoF → MotionBlur → Outline → Vignette → ColorGrade →
 *   ChromaticAberration → FilmGrain → AutoExposure → OutputPass (ACES + sRGB) → SMAA
 *
 * (TAA replaces SMAA when enabled — the pipeline disables one when the other turns on. The
 * camera is sub-pixel jittered only around the scene render so TAA can integrate frames.)
 *
 * The composer uses a half-float HDR target so bright highlights survive into bloom. Tone
 * mapping happens ONCE, in OutputPass (it reads renderer.toneMapping), so intermediate
 * passes operate in scene-referred linear light — exactly the Unreal/Unity ordering.
 */
export class RenderPipeline {
  readonly composer: EffectComposer;
  readonly bloomPass?: UnrealBloomPass;
  private aoPass?: GTAOPass;
  readonly ssrPass?: SSRPass;
  readonly volumetricFogPass?: VolumetricFogPass;
  readonly atmosphericDepthPass?: AtmosphericDepthPass;
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
  readonly tonemappingPass: AnimeTonemappingPass;
  private readonly smaaPass: SMAAPass;
  private readonly passes: Pass[] = [];
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;

  private gBufferRT?: THREE.WebGLRenderTarget;
  private readonly depthMaterial = new THREE.MeshDepthMaterial();
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly _invProj = new THREE.Matrix4();
  private readonly _viewProj = new THREE.Matrix4();
  private readonly _matWorldInv = new THREE.Matrix4();
  private readonly _camPos = new THREE.Vector3();
  readonly upscaler = new FsrUpscaler();
  private internalWidth = 1;
  private internalHeight = 1;
  private dynamicScale = 1;
  private _jitterFrame = 0;
  private _prevElapsed = -1;
  private lastFrameMetrics: RenderFrameMetrics | null = null;

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

    // Ambient occlusion
    if (opts.ao !== false) {
      try {
        const ao = new GTAOPass(scene, camera, size.x, size.y);
        ao.output = GTAOPass.OUTPUT.Default;
        ao.updateGtaoMaterial({ radius: opts.aoRadius ?? 0.5, distanceExponent: 1, scale: 1 });
        this.aoPass = ao;
        this.addPass(ao);
      } catch (err) {
        console.warn('[RenderPipeline] GTAO unavailable — continuing without AO:', err);
      }
    }

    // Screen-space contact shadows
    {
      const p = new ContactShadowsPass();
      p.setSize(size.x, size.y);
      p.enabled = opts.contactShadows ?? false;
      if (opts.contactShadowIntensity !== undefined) p.uniforms.intensity.value = opts.contactShadowIntensity;
      this.contactShadowsPass = p;
      this.addPass(p);
    }

    // Screen-space reflections
    {
      const p = new SSRPass();
      p.setSize(size.x, size.y);
      p.enabled = opts.ssr ?? false;
      if (opts.ssrIntensity !== undefined) p.uniforms.intensity.value = opts.ssrIntensity;
      this.ssrPass = p;
      this.addPass(p);
    }

    // Volumetric atmospheric fog
    {
      const p = new VolumetricFogPass();
      p.enabled = opts.volumetricFog ?? false;
      if (opts.fogDensity !== undefined) p.uniforms.density.value = opts.fogDensity;
      this.volumetricFogPass = p;
      this.addPass(p);
    }

    // Lightweight stylized atmospheric depth pass
    {
      const p = new AtmosphericDepthPass();
      p.enabled = opts.atmosphericDepth ?? false;
      this.atmosphericDepthPass = p;
      this.addPass(p);
    }

    // Temporal anti-aliasing
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

    // Volumetric light shafts (god rays)
    {
      const p = new GodRaysPass();
      p.enabled = opts.godRays ?? false;
      if (opts.godRaysStrength !== undefined) p.uniforms.strength.value = opts.godRaysStrength;
      this.godRaysPass = p;
      this.addPass(p);
    }

    // Cinematic depth-of-field
    {
      const p = new DepthOfFieldPass();
      p.enabled = opts.dof ?? false;
      if (opts.dofFocusDistance !== undefined) p.uniforms.focusDistance.value = opts.dofFocusDistance;
      if (opts.dofBokehScale !== undefined) p.uniforms.bokehScale.value = opts.dofBokehScale;
      this.dofPass = p;
      this.addPass(p);
    }

    // Camera motion blur
    {
      const p = new MotionBlurPass();
      p.enabled = opts.motionBlur ?? false;
      if (opts.motionBlurIntensity !== undefined) p.uniforms.intensity.value = opts.motionBlurIntensity;
      this.motionBlurPass = p;
      this.addPass(p);
    }

    // Custom passes
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

    // Auto exposure
    {
      const p = new AutoExposurePass();
      p.enabled = opts.autoExposure ?? false;
      if (opts.exposureKey !== undefined) p.uniforms.key.value = opts.exposureKey;
      this.autoExposurePass = p;
      this.addPass(p);
    }

    this.speedLinesPass = new SpeedLinesPass();
    this.impactFramePass = new ImpactFramePass();
    this.addPass(this.speedLinesPass);
    this.addPass(this.impactFramePass);

    // Selectable display tone mapping (ACES / MIX Anime / Neutral) + sRGB conversion
    this.tonemappingPass = new AnimeTonemappingPass('mix_anime', renderer.toneMappingExposure ?? 1.0);
    this.addPass(this.tonemappingPass);

    // SMAA
    this.smaaPass = new SMAAPass(size.x * pr, size.y * pr);
    this.addPass(this.smaaPass);
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
      this.atmosphericDepthPass?.enabled ||
      this.motionBlurPass?.enabled ||
      this.contactShadowsPass?.enabled ||
      this.taaPass?.enabled
    );
  }

  private renderGBufferPrepass(): void {
    if (!this.depthConsumersActive()) return;
    const rt = this.ensureGBufferRT();
    const r = this.renderer;
    const wantNormals = !!this.ssrPass?.enabled;
    const prevTarget = r.getRenderTarget();
    const prevShadowAuto = r.shadowMap.autoUpdate;
    const prevOverride = this.scene.overrideMaterial;
    r.shadowMap.autoUpdate = false;
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
    if (this.atmosphericDepthPass) this.atmosphericDepthPass.setDepthTexture(depth);
    if (this.motionBlurPass) this.motionBlurPass.setDepthTexture(depth);
    if (this.taaPass) this.taaPass.setDepthTexture(depth);
    if (this.contactShadowsPass) { this.contactShadowsPass.setDepthTexture(depth); this.contactShadowsPass.setSize(w, h); }
    if (this.ssrPass) {
      this.ssrPass.setDepthTexture(depth);
      this.ssrPass.setNormalTexture(rt.texture);
      this.ssrPass.setSize(w, h);
    }
  }

  applyVisualStyle(style: VisualStyleDescriptor): void {
    if (this.tonemappingPass) {
      this.tonemappingPass.setColorTransform(style.colorTransform);
      this.tonemappingPass.setExposure(this.renderer.toneMappingExposure ?? 1.0);
    }
    if (this.colorGradePass) {
      this.colorGradePass.enabled = style.saturation !== 1.0 || style.contrast !== 1.0 || style.brightness !== 1.0;
      this.colorGradePass.uniforms.saturation.value = style.saturation;
      this.colorGradePass.uniforms.contrast.value = style.contrast;
      this.colorGradePass.uniforms.brightness.value = style.brightness - 1.0;
    }
    if (this.outlinePass) {
      this.outlinePass.enabled = style.outlineThickness > 0;
      this.outlinePass.uniforms.thickness.value = style.outlineThickness;
      this.outlinePass.uniforms.color.value.set(style.outlineColor);
    }
    if (this.bloomPass) {
      this.bloomPass.threshold = style.bloomThreshold;
      this.bloomPass.strength = style.bloomStrength;
      this.bloomPass.radius = style.bloomRadius;
    }
  }

  tick(timeSeconds: number): void {
    if (this.filmGrainPass) this.filmGrainPass.setTime(timeSeconds);
    if (this.dofPass) {
      const cam = this.camera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) this.dofPass.setCameraClip(cam.near, cam.far);
    }
    if (this.atmosphericDepthPass) {
      const cam = this.camera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) this.atmosphericDepthPass.setCameraClip(cam.near, cam.far);
    }
    if (this.autoExposurePass) {
      const dt = this._prevElapsed < 0 ? 0.016 : Math.max(0, Math.min(0.1, timeSeconds - this._prevElapsed));
      this.autoExposurePass.setDeltaTime(dt);
    }
    this._prevElapsed = timeSeconds;
  }

  setSunScreenPosition(uvX: number, uvY: number, visible: number): void {
    this.godRaysPass?.setLight(uvX, uvY, visible);
  }

  setCameraState(camera: THREE.Camera): void {
    const persp = camera as THREE.PerspectiveCamera;
    camera.updateMatrixWorld();
    this._invProj.copy(camera.projectionMatrix).invert();
    this._matWorldInv.copy(camera.matrixWorld).invert();
    this._camPos.setFromMatrixPosition(camera.matrixWorld);
    const near = persp.isPerspectiveCamera ? persp.near : 0.1;
    this._viewProj.multiplyMatrices(camera.projectionMatrix, this._matWorldInv);
    if (this.ssrPass) this.ssrPass.setCameraMatrices(camera.projectionMatrix, this._invProj, near);
    if (this.volumetricFogPass) this.volumetricFogPass.setCameraState(this._invProj, camera.matrixWorld, this._camPos);
    if (this.motionBlurPass) this.motionBlurPass.setCameraState(this._invProj, camera.matrixWorld, this._viewProj);
    if (this.contactShadowsPass) this.contactShadowsPass.setCameraMatrices(camera.projectionMatrix, this._invProj, this._matWorldInv);
    if (this.taaPass) this.taaPass.setCameraState(this._invProj, camera.matrixWorld, this._viewProj);
  }

  setSunState(direction: THREE.Vector3, color: THREE.Color): void {
    this.volumetricFogPass?.setSun(direction, color);
    this.contactShadowsPass?.setSun(direction);
  }

  private addPass(pass: Pass): void {
    this.composer.addPass(pass);
    this.passes.push(pass);
  }

  render(): void {
    const info = this.renderer.info;
    const autoReset = info.autoReset;
    info.autoReset = false;
    info.reset();
    try {
      this.renderFrame();
      this.lastFrameMetrics = {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      };
    } finally {
      info.autoReset = autoReset;
    }
  }

  getLastFrameMetrics(): RenderFrameMetrics | null {
    return this.lastFrameMetrics ? { ...this.lastFrameMetrics } : null;
  }

  private renderFrame(): void {
    this.renderGBufferPrepass();
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

  setTemporalAA(on: boolean): void {
    if (this.taaPass) this.taaPass.enabled = on;
    this.smaaPass.enabled = !on;
  }

  setAmbientOcclusion(enabled: boolean): void { if (this.aoPass) this.aoPass.enabled = enabled; }

  setPixelRatio(ratio: number): void { this.setDynamicResolutionScale(ratio); }

  setOutputSize(width: number, height: number): void { this.upscaler.setSize(width, height); }

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
