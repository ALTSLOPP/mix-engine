import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { SkyEnvironment } from './SkyEnvironment';
import { RenderPipeline } from './RenderPipeline';
import { CascadedShadowMap } from './CascadedShadowMap';
import { LOW_SPEC_RESOLUTION, resolveRenderResolution, sanitizeResolution, type RenderResolutionSettings } from './RenderResolution';
import { AnimeLightingContext } from './anime/AnimeLightingContext';
import { VisualStyleRegistry } from './profiles/VisualStyleRegistry';
import { PerformanceTargetRegistry } from './profiles/PerformanceTargetRegistry';

/** Options for swapping in an image-based-lighting (HDRI) environment. */
export interface EnvironmentHDRIOptions {
  /** Also show the HDRI as the visible sky/background (default true). */
  background?: boolean;
  /** Multiplier on the image-based scene lighting (scene.environmentIntensity). */
  intensity?: number;
  /** Blur the background sky (0 = sharp, ~0.3 = soft); does not affect lighting. */
  blurriness?: number;
}

/**
 * A shadow strategy. Wrapped behind an interface because a single shadow map cannot
 * cover an open world without either a short range or acne. SingleMapShadow (Step 2)
 * owns the sun; CascadedShadowMap (Step 3) implements the same interface.
 */
export interface ShadowProvider {
  /** The sun Object3D — EXCLUDED from the generic floating-origin static shift. */
  readonly sun: THREE.Object3D;
  /** Re-anchor the sun + shadow camera to the main camera each frame (loop step 11). */
  update(camera: THREE.Camera): void;
  /** Set the sun colour across ALL shadow lights (CSM has one per cascade). For day/night. */
  setSunColor(color: THREE.ColorRepresentation): void;
  /** Set the sun intensity across ALL shadow lights. For day/night dimming at dawn/dusk/night. */
  setSunIntensity(intensity: number): void;
  dispose(): void;
}

/**
 * SingleMapShadow — owns the sun DirectionalLight and keeps its shadow frustum locked to
 * the camera's CURRENT engine-space position. Re-anchoring every frame AFTER the floating-
 * origin shift means origin shifts never displace the shadows, and the sun is excluded from
 * the generic static shift to avoid double-handling.
 */
export class SingleMapShadow implements ShadowProvider {
  readonly sun: THREE.DirectionalLight;
  private readonly target = new THREE.Object3D();
  readonly sunDir: THREE.Vector3;
  private readonly distance = 140;
  private readonly _pos = new THREE.Vector3();
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, sunDirection: THREE.Vector3, intensity = 2.0) {
    this.scene = scene;
    this.sunDir = sunDirection.clone().normalize();
    this.sun = new THREE.DirectionalLight(0xfff4e6, intensity);
    this.sun.castShadow = true;
    // 2048 is the sweet spot for a single camera-following map: crisp enough, ~16MB VRAM.
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;

    const cam = this.sun.shadow.camera;
    const half = 70;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 0.5;
    cam.far = this.distance * 2.5;
    cam.updateProjectionMatrix();

    this.sun.target = this.target;
    this.sun.userData.excludeFromOriginShift = true;
    this.target.userData.excludeFromOriginShift = true;
    scene.add(this.sun);
    scene.add(this.target);
  }

  update(camera: THREE.Camera): void {
    camera.getWorldPosition(this._pos);
    this.target.position.copy(this._pos);
    this.sun.position.copy(this._pos).addScaledVector(this.sunDir, this.distance);
    this.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  setSunColor(color: THREE.ColorRepresentation): void { this.sun.color.set(color); }
  setSunIntensity(intensity: number): void { this.sun.intensity = intensity; }

  dispose(): void {
    this.scene.remove(this.sun);
    this.scene.remove(this.target);
    this.sun.dispose();
    this.sun.shadow.dispose();
  }
}

/**
 * Viewport.ts — renderer, scene, camera, sky-based image lighting, shadows and a full
 * post-processing pipeline (bloom + ground-truth AO + ACES + SMAA).
 *
 * Physical lighting only: lights are authored at physical intensities and the sky provides
 * image-based fill, with ACES tone mapping applied in the post pipeline (OutputPass). The
 * environment + background are owned here and are NEVER disposed by entity/chunk teardown.
 */
export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  shadow: ShadowProvider;
  readonly skyEnv: SkyEnvironment;
  readonly pipeline: RenderPipeline;
  readonly animeLighting = new AnimeLightingContext();

  private readonly container: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private resizeDirty = false;
  private resolutionSettings: RenderResolutionSettings = { ...LOW_SPEC_RESOLUTION };

  /** When false, an HDRI environment is active and render() must NOT rebind the
   *  procedural sky over scene.background / scene.environment each frame. */
  private useSkyEnvironment = true;
  private hdrEnvRT?: THREE.WebGLRenderTarget;

  // Scratch vectors for projecting the sun to screen space (god-ray light source).
  private readonly _sunWorld = new THREE.Vector3();
  private readonly _sunNdc = new THREE.Vector3();
  private readonly _camForward = new THREE.Vector3();
  private directionalLights: THREE.DirectionalLight[] = [];
  private _lightRevision = 0;

  get lightRevision(): number { return this._lightRevision; }

  /** Engine-maintained light membership cache; avoids a full scene traversal in render(). */
  setDirectionalLights(lights: readonly THREE.Light[]): void {
    this.directionalLights = lights.filter(
      (light): light is THREE.DirectionalLight => (light as THREE.DirectionalLight).isDirectionalLight === true,
    );
    this._lightRevision++;
  }

  constructor(container: HTMLElement, sceneOverride?: THREE.Scene, cameraOverride?: THREE.PerspectiveCamera) {
    this.container = container;

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    AnimeLightingContext.bindRenderer(this.renderer, this.animeLighting);
    const resolution = resolveRenderResolution(w, h, window.devicePixelRatio, this.resolutionSettings, this.renderer.capabilities.maxTextureSize);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(resolution.outputWidth, resolution.outputHeight, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    // ACES filmic — the same tone-mapping curve Unreal ships with. Applied in OutputPass.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // The Sky shader outputs very high HDR luminance; at exposure 1.0 the sky and ground
    // blew out to white. 0.6 (paired with scene.backgroundIntensity to tame the sky) gives
    // a natural mid-day exposure where the ground and characters read clearly.
    this.renderer.toneMappingExposure = 0.6;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // RectAreaLights need their BRDF lookup tables uploaded once before first use,
    // or they render black. Safe + idempotent to call here.
    RectAreaLightUniformsLib.init();
    container.appendChild(this.renderer.domElement);

    this.scene = sceneOverride || new THREE.Scene();

    const prevBackground = this.scene.background;
    const prevEnvironment = this.scene.environment;
    const prevFog = this.scene.fog;

    // Sky → background + image-based lighting; gives us the sun direction.
    this.skyEnv = new SkyEnvironment(this.scene, this.renderer, { elevationDeg: 26, azimuthDeg: 150 });

    if (sceneOverride) {
      this.scene.background = prevBackground;
      this.scene.environment = prevEnvironment;
      this.scene.fog = prevFog;
    }

    // Subtle hemisphere fill on top of the IBL (sky vs. bounced ground light).
    if (!sceneOverride) {
      const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4034, 0.35);
      this.scene.add(hemi);
    }

    this.camera = cameraOverride || new THREE.PerspectiveCamera(58, w / h, 0.1, 5000);
    if (!cameraOverride) {
      this.camera.position.set(6, 5, 12);
      this.camera.lookAt(0, 1.5, 0);
    }

    // Sun aligned to the sky's sun.
    this.shadow = new SingleMapShadow(this.scene, this.skyEnv.sunDirection);

    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera, {
      ao: true,
      bloom: true,
      bloomStrength: 0.6,
      bloomThreshold: 0.6,
      bloomRadius: 0.55,
    });
    // Keep optional passes available for user toggles, but do not draw them by default.
    if (this.pipeline.bloomPass) this.pipeline.bloomPass.enabled = false;
    this.pipeline.setAmbientOcclusion(false);
    this.applyResolution();

    this.resizeObserver = new ResizeObserver(() => {
      this.resizeDirty = true;
    });
    this.resizeObserver.observe(container);
  }

  setRenderScale(scale: number): void {
    this.setResolutionSettings({ renderScale: scale, internalHeight: 0 });
  }

  setResolutionSettings(settings: Partial<RenderResolutionSettings>): void {
    const next = sanitizeResolution(settings, this.resolutionSettings);
    if (Object.keys(next).every(key => next[key as keyof RenderResolutionSettings] === this.resolutionSettings[key as keyof RenderResolutionSettings])) return;
    this.resolutionSettings = next;
    this.pipeline.upscaler.configure(next.fsrEnabled, next.fsrSharpness);
    this.resizeDirty = true;
  }

  getResolutionSettings(): Readonly<RenderResolutionSettings> { return { ...this.resolutionSettings }; }

  applyVisualStyle(styleId: string): void {
    const style = VisualStyleRegistry.get(styleId);
    this.animeLighting.applyStyle(style);
    this.pipeline.applyVisualStyle(style);
  }

  applyPerformanceTarget(targetId: string): void {
    const target = PerformanceTargetRegistry.get(targetId);
    this.setResolutionSettings({
      fsrEnabled: target.fsrEnabled,
      fsrSharpness: target.fsrSharpness,
      internalHeight: target.internalHeight,
      outputHeight: target.outputHeight,
      renderScale: target.renderScale,
    });
    this.renderer.shadowMap.enabled = target.shadowsEnabled;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.pipeline.bloomPass) this.pipeline.bloomPass.enabled = target.bloomEnabled;
    this.pipeline.setAmbientOcclusion(target.aoEnabled);
    if (this.pipeline.ssrPass) this.pipeline.ssrPass.enabled = target.ssrEnabled;
    if (this.pipeline.dofPass) this.pipeline.dofPass.enabled = target.dofEnabled;
    if (this.pipeline.volumetricFogPass) this.pipeline.volumetricFogPass.enabled = target.volumetricFogEnabled;
    if (this.pipeline.contactShadowsPass) this.pipeline.contactShadowsPass.enabled = target.contactShadowsEnabled;
  }

  getRenderResolution() {
    const target = this.pipeline.composer.renderTarget1;
    return {
      internalWidth: target.width, internalHeight: target.height,
      outputWidth: this.renderer.domElement.width, outputHeight: this.renderer.domElement.height,
    };
  }

  private applyResolution(): void {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    const r = resolveRenderResolution(w, h, window.devicePixelRatio, this.resolutionSettings, this.renderer.capabilities.maxTextureSize);
    this.renderer.setSize(r.outputWidth, r.outputHeight, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline.setSize(r.internalWidth, r.internalHeight);
    this.pipeline.setOutputSize(r.outputWidth, r.outputHeight);
    this.pipeline.upscaler.configure(this.resolutionSettings.fsrEnabled, this.resolutionSettings.fsrSharpness);
  }

  /** Apply a pending resize, re-anchor shadows, draw through the post pipeline (loop step 11). */
  render(): void {
    if (this.resizeDirty) {
      this.resizeDirty = false;
      this.applyResolution();
    }

    const useSky = this.useSkyEnvironment;
    const prevBackground = this.scene.background;
    const prevEnvironment = this.scene.environment;

    if (useSky) {
      if ((this.skyEnv as any).cubeRT) {
        this.scene.background = (this.skyEnv as any).cubeRT.texture;
      }
      if ((this.skyEnv as any).envRT) {
        this.scene.environment = (this.skyEnv as any).envRT.texture;
      }
    }

    const toggledLights: THREE.DirectionalLight[] = [];
    const ourSun = (this.shadow as any).sun;
    const isCSM = (this.shadow as any).cascades !== undefined;

    try {
      for (const dl of this.directionalLights) {
        if (!dl.parent) continue;
        const isOurs = isCSM
          ? (dl.userData.csmCascade !== undefined)
          : (dl === ourSun);
        if (!isOurs && dl.visible) {
          dl.visible = false;
          toggledLights.push(dl);
        }
      }

      this.shadow.update(this.camera);
      this.updateSunScreenPosition();
      this.pipeline.setCameraState(this.camera);
      this.pipeline.setSunState(this.skyEnv.sunDirection, (this.shadow as any).sun?.color ?? new THREE.Color(0xfff1d6));
      this.animeLighting.setSun(
        this.skyEnv.sunDirection,
        (this.shadow as any).sun?.color ?? new THREE.Color(0xfff1d6),
        (this.shadow as any).sun?.intensity ?? 1.8
      );
      this.pipeline.render();
    } finally {
      if (useSky) {
        this.scene.background = prevBackground;
        this.scene.environment = prevEnvironment;
      }
      for (const dl of toggledLights) dl.visible = true;
    }
  }

  /** Project the sky's sun (a direction at infinity) to screen UV space and estimate
   *  its on-screen visibility, then feed the god-rays pass. Cheap; runs every frame. */
  private updateSunScreenPosition(): void {
    const cam = this.camera;
    // A point far along the sun direction from the camera ≈ the sun at infinity.
    this._sunWorld.copy(cam.position).addScaledVector(this.skyEnv.sunDirection, 1e4);
    this._sunNdc.copy(this._sunWorld).project(cam);
    this._camForward.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const facing = this._camForward.dot(this.skyEnv.sunDirection); // >0 ⇒ sun in front
    const uvX = this._sunNdc.x * 0.5 + 0.5;
    const uvY = this._sunNdc.y * 0.5 + 0.5;
    // Behind the camera ⇒ 0; fade out as the sun travels off the frame.
    const edge = Math.max(Math.abs(this._sunNdc.x), Math.abs(this._sunNdc.y));
    let visible = THREE.MathUtils.clamp(facing * 4, 0, 1);
    visible *= 1 - THREE.MathUtils.smoothstep(edge, 1.1, 2.4);
    this.pipeline.setSunScreenPosition(uvX, uvY, visible);
  }

  /** Load an equirectangular .hdr/.exr and use it as image-based lighting (and,
   *  optionally, the visible background) instead of the procedural sky. Resolves
   *  once the PMREM-filtered environment is live. */
  setEnvironmentHDRI(url: string, opts: EnvironmentHDRIOptions = {}): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      new RGBELoader().load(
        url,
        (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          const pmrem = new THREE.PMREMGenerator(this.renderer);
          const rt = pmrem.fromEquirectangular(tex);
          // Swap in the filtered env; release the previous HDRI target if any.
          this.hdrEnvRT?.dispose();
          this.hdrEnvRT = rt;
          this.useSkyEnvironment = false;
          this.scene.environment = rt.texture;
          if (opts.background !== false) this.scene.background = rt.texture;
          if (opts.intensity !== undefined) this.scene.environmentIntensity = opts.intensity;
          this.scene.backgroundBlurriness = opts.blurriness ?? 0;
          tex.dispose();
          pmrem.dispose();
          resolve();
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  /** Tune IBL / background intensity without changing the environment source.
   *  Works for both the procedural sky and an HDRI. */
  setEnvironmentParams(opts: { environmentIntensity?: number; backgroundIntensity?: number; backgroundBlurriness?: number }): void {
    if (opts.environmentIntensity !== undefined) this.scene.environmentIntensity = opts.environmentIntensity;
    if (opts.backgroundIntensity !== undefined) this.scene.backgroundIntensity = opts.backgroundIntensity;
    if (opts.backgroundBlurriness !== undefined) this.scene.backgroundBlurriness = opts.backgroundBlurriness;
  }

  /** Revert from an HDRI environment back to the procedural sky. */
  useProceduralSky(): void {
    this.useSkyEnvironment = true;
    this.scene.backgroundBlurriness = 0;
    this.hdrEnvRT?.dispose();
    this.hdrEnvRT = undefined;
    // render() will rebind the sky cube + env next frame; set them now too so an
    // immediate screenshot/readback is correct.
    const skyAny = this.skyEnv as any;
    if (skyAny.envRT) this.scene.environment = skyAny.envRT.texture;
    if (skyAny.cubeRT) this.scene.background = skyAny.cubeRT.texture;
  }

  /** Swap the shadow strategy at runtime. `single` = the Step-2 single-map shadow;
   *  `csm` = cascaded shadow maps (4 cascades, crisp near + far coverage). The old
   *  strategy is disposed; the new one is constructed from the current sky sun direction. */
  setShadowStrategy(strategy: 'single' | 'csm'): void {
    this.shadow.dispose();
    if (strategy === 'csm') {
      this.shadow = new CascadedShadowMap(this.scene, this.skyEnv.sunDirection, {
        cascadeCount: 4,
        mapSize: 2048,
        maxDistance: 250,
        intensity: 2.0,
      });
    } else {
      this.shadow = new SingleMapShadow(this.scene, this.skyEnv.sunDirection);
    }
    // Signal the Engine's all-light cache to refresh before the next render.
    this._lightRevision++;
  }

  /** The current shadow strategy name (HELM/debug). */
  get shadowStrategy(): 'single' | 'csm' {
    return (this.shadow as unknown as { cascades?: unknown }).cascades !== undefined ? 'csm' : 'single';
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.pipeline.dispose();
    this.shadow.dispose();
    this.skyEnv.dispose();
    this.hdrEnvRT?.dispose();
    this.scene.environment = null;
    this.scene.background = null;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
