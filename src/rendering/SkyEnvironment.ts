import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface SkyOptions {
  /** Sun height above the horizon, degrees. Lower = longer, more dramatic shadows. */
  elevationDeg?: number;
  azimuthDeg?: number;
  turbidity?: number;
  rayleigh?: number;
  mieCoefficient?: number;
  mieDirectionalG?: number;
  /** Exponential fog density tuned to the horizon; 0 disables fog. */
  fogDensity?: number;
}

/**
 * SkyEnvironment.ts — physically-based sky used for BOTH the background and image-based
 * lighting, the way Unreal/Unity light a scene from a sky/HDRI instead of a flat colour.
 *
 * The Sky shader is rendered once into a cube target (→ scene.background) and PMREM-filtered
 * (→ scene.environment) so every PBR material gets coherent sky reflections out of the box.
 * The Sky mesh itself is never added to the live scene (so it can't fight the camera far
 * plane or the floating-origin shift).
 */
export class SkyEnvironment {
  /** Unit direction FROM the scene TO the sun — share with the shadow's DirectionalLight. */
  readonly sunDirection = new THREE.Vector3();

  private readonly cubeRT: THREE.WebGLCubeRenderTarget;
  private envRT: THREE.WebGLRenderTarget;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly renderer: THREE.WebGLRenderer;
  /** Retained sky scene + camera so the sky can be re-baked when the sun moves. */
  private readonly captureScene: THREE.Scene;
  private readonly captureCam: THREE.CubeCamera;
  private readonly sky: Sky;
  private currentFogDensity: number;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, opts: SkyOptions = {}) {
    this.renderer = renderer;
    const elevation = opts.elevationDeg ?? 28;
    const azimuth = opts.azimuthDeg ?? 150;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunDirection.setFromSphericalCoords(1, phi, theta);

    // Build the sky in a throwaway scene so it never enters the live scene graph.
    const sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = opts.turbidity ?? 8;
    // Lower Rayleigh: the default sky blew out to near-white. ~1.3 keeps a believable
    // blue without the top of the frame washing to pure white.
    u.rayleigh.value = opts.rayleigh ?? 1.3;
    u.mieCoefficient.value = opts.mieCoefficient ?? 0.005;
    u.mieDirectionalG.value = opts.mieDirectionalG ?? 0.8;
    u.sunPosition.value.copy(this.sunDirection);
    this.sky = sky;

    const captureScene = new THREE.Scene();
    captureScene.add(sky);
    this.captureScene = captureScene;

    // Background: a real cube render of the sky.
    this.cubeRT = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
    const captureCam = new THREE.CubeCamera(0.1, 2000, this.cubeRT);
    this.captureCam = captureCam;
    captureCam.update(renderer, captureScene);
    scene.background = this.cubeRT.texture;
    // Dim only the VISIBLE sky (not the IBL that lights the scene) so a bright midday
    // sky doesn't wash the top of the frame to white. Scene lighting is unaffected.
    scene.backgroundIntensity = 0.5;

    // Environment: PMREM-filtered sky for correct roughness response.
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = this.pmrem.fromScene(captureScene, 0, 0.1, 2000);
    scene.environment = this.envRT.texture;

    // Atmospheric depth — matches the hazy horizon colour for a soft distance falloff.
    this.currentFogDensity = opts.fogDensity ?? 0.0016;
    if (this.currentFogDensity > 0) scene.fog = new THREE.FogExp2(0xaec6e4, this.currentFogDensity);
  }

  /**
   * Re-bake the sky cube + PMREM environment for a new sun direction. Moderately expensive
   * (one cube render + one PMREM filter), so callers should invoke on slider `change`
   * (release), not per-pixel `input`. The sky mesh itself is reused.
   */
  setSunDirection(dir: THREE.Vector3, scene: THREE.Scene): void {
    if (!this.renderer) return;
    this.sunDirection.copy(dir).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection);
    // Re-render the cube background and re-filter the IBL.
    this.captureCam.update(this.renderer, this.captureScene);
    // Dispose the previous env target before replacing it.
    this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.captureScene, 0, 0.1, 2000);
    scene.environment = this.envRT.texture;
  }

  /** Update the Preetham atmosphere uniforms (turbidity/Rayleigh/Mie) and re-bake the sky cube + IBL. */
  setAtmosphere(opts: { turbidity?: number; rayleigh?: number; mieCoefficient?: number; mieDirectionalG?: number }, scene?: THREE.Scene): void {
    const u = this.sky.material.uniforms;
    if (opts.turbidity !== undefined) u.turbidity.value = opts.turbidity;
    if (opts.rayleigh !== undefined) u.rayleigh.value = opts.rayleigh;
    if (opts.mieCoefficient !== undefined) u.mieCoefficient.value = opts.mieCoefficient;
    if (opts.mieDirectionalG !== undefined) u.mieDirectionalG.value = opts.mieDirectionalG;
    if (this.renderer) {
      this.captureCam.update(this.renderer, this.captureScene);
      this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.captureScene, 0, 0.1, 2000);
      if (scene) scene.environment = this.envRT.texture;
    }
  }

  /** Current atmosphere uniforms (for bake/capture round-trips). */
  get atmosphere(): { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number } {
    const u = this.sky.material.uniforms;
    return { turbidity: u.turbidity.value, rayleigh: u.rayleigh.value, mieCoefficient: u.mieCoefficient.value, mieDirectionalG: u.mieDirectionalG.value };
  }

  /** Update the fog colour without re-baking the sky. */
  setFogColor(color: THREE.ColorRepresentation, scene: THREE.Scene): void {
    if (scene.fog && (scene.fog as THREE.FogExp2).isFogExp2) {
      (scene.fog as THREE.FogExp2).color.set(color);
    } else if (this.currentFogDensity > 0) {
      scene.fog = new THREE.FogExp2(color, this.currentFogDensity);
    }
  }

  setFogDensity(density: number, scene: THREE.Scene): void {
    this.currentFogDensity = density;
    if (density > 0) {
      const prevColor = scene.fog ? (scene.fog as THREE.FogExp2).color.getHex() : 0xaec6e4;
      if (scene.fog && (scene.fog as THREE.FogExp2).isFogExp2) {
        (scene.fog as THREE.FogExp2).density = density;
      } else {
        scene.fog = new THREE.FogExp2(prevColor, density);
      }
    } else {
      scene.fog = null;
    }
  }

  dispose(): void {
    this.cubeRT.dispose();
    this.envRT.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
  }
}
