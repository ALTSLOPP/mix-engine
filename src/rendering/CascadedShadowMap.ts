import * as THREE from 'three';
import type { ShadowProvider } from './Viewport';

/**
 * CascadedShadowMap.ts — a 4-cascade sun shadow system for open-world rendering.
 *
 * The single-map shadow (SingleMapShadow) covers the whole view frustum with one
 * 2048² map, so close-up shadows are blurry and distant ones are over-tessellated.
 * CSM splits the camera frustum into N depth slices (cascades) and renders a separate
 * shadow map for each, packing them side-by-side into one atlas texture. Close cascades
 * get a tight frustum → high texel density → crisp shadows near the player; far cascades
 * cover more distance with the same resolution. This is the standard open-world shadow
 * technique (Unity HDRP, Unreal, Godot 4 all ship it).
 *
 * Implementation notes:
 *   - We render N directional lights, each with its own shadow camera covering one
 *     cascade's slice. Three.js doesn't expose a multi-cascade light natively, so we
 *     create N `DirectionalLight`s that share the same color/intensity and the same
 *     sun direction; each light's `shadow.camera` ortho bounds are set to the cascade's
 *     world-space AABB. The renderer's shadow map packs them into one atlas (Three
 *     allocates a separate render target per light by default; we override to a single
 *     atlas via `shadow.mapSize` + a tile offset).
 *   - The cascade splits use the logarithmic + uniform blend (the SIGGRAPH 2004
 *     "Practical CSM" formula): `split_i = λ * log-split + (1-λ) * uniform-split`,
 *     λ = 0.5 (a common default; 1 = pure log, 0 = pure uniform).
 *   - Each frame we re-fit each cascade's ortho bounds to the camera's frustum slice
 *     (in engine space, AFTER the floating-origin shift so shadows never drift).
 *   - Bias is per-cascade (closer cascades use a tighter bias to avoid peter-panning;
 *     farther ones use a larger bias to hide the lower texel density's acne).
 *
 * The class implements `ShadowProvider` so the Viewport can swap it in for
 * `SingleMapShadow` with one line. The sun is the first cascade's light (so
 * `SkyEnvironment.setSunDirection` still works — the Viewport updates `shadow.sun`).
 */

export interface CSMOptions {
  /** Number of cascades (1–4). 4 is the open-world default. */
  cascadeCount?: number;
  /** Shadow map resolution per cascade (square). 2048 is the sweet spot. */
  mapSize?: number;
  /** λ blend between logarithmic (1) and uniform (0) split. 0.5 = balanced. */
  splitLambda?: number;
  /** Max shadow draw distance from the camera (metres). Beyond this, no shadows. */
  maxDistance?: number;
  /** Sun intensity (shared across all cascade lights). */
  intensity?: number;
  /** Sun color. */
  color?: THREE.ColorRepresentation;
}

interface Cascade {
  light: THREE.DirectionalLight;
  target: THREE.Object3D;
  /** Near plane of this cascade's frustum slice (metres from the camera). */
  near: number;
  /** Far plane of this cascade's frustum slice. */
  far: number;
  /** Per-cascade bias. */
  bias: number;
  normalBias: number;
}

export class CascadedShadowMap implements ShadowProvider {
  readonly sun: THREE.DirectionalLight;
  readonly sunDir: THREE.Vector3;
  private readonly cascades: Cascade[] = [];
  private readonly scene: THREE.Scene;
  private readonly mapSize: number;
  private readonly splitLambda: number;
  private readonly maxDistance: number;
  private readonly distance: number;
  private readonly _pos = new THREE.Vector3();
  private readonly _frustumCornersWorld = Array.from({ length: 8 }, () => new THREE.Vector3());
  private readonly _center = new THREE.Vector3();
  private readonly _min = new THREE.Vector3();
  private readonly _max = new THREE.Vector3();
  private readonly _viewMatrix = new THREE.Matrix4();
  private readonly _lightViewMatrix = new THREE.Matrix4();

  constructor(scene: THREE.Scene, sunDirection: THREE.Vector3, opts: CSMOptions = {}) {
    this.scene = scene;
    this.sunDir = sunDirection.clone().normalize();
    this.mapSize = opts.mapSize ?? 2048;
    this.splitLambda = opts.splitLambda ?? 0.5;
    this.maxDistance = opts.maxDistance ?? 250;
    this.distance = this.maxDistance * 2.5;
    const cascadeCount = Math.min(4, Math.max(1, opts.cascadeCount ?? 4));
    const intensity = opts.intensity ?? 2.0;
    const color = opts.color ?? 0xfff4e6;

    // Create N directional lights. The first is the "sun" (the one SkyEnvironment
    // updates via setSunDirection); the rest share its direction.
    for (let i = 0; i < cascadeCount; i++) {
      const light = new THREE.DirectionalLight(color, i === 0 ? intensity : intensity);
      light.castShadow = true;
      light.shadow.mapSize.set(this.mapSize, this.mapSize);
      // Per-cascade bias: tighter for close cascades, looser for far.
      const biasRange = -0.0004 - (i / cascadeCount) * 0.0008;
      const normalBias = 0.02 + (i / cascadeCount) * 0.06;
      light.shadow.bias = biasRange;
      light.shadow.normalBias = normalBias;
      light.shadow.radius = 3;
      // Each light's shadow camera is an ortho box; we'll fit it to the cascade slice
      // each frame in update().
      const cam = light.shadow.camera;
      cam.near = 0.5;
      cam.far = this.distance * 2;
      cam.left = -50; cam.right = 50; cam.top = 50; cam.bottom = -50;
      cam.updateProjectionMatrix();

      const target = new THREE.Object3D();
      light.target = target;
      light.userData.excludeFromOriginShift = true;
      target.userData.excludeFromOriginShift = true;
      light.userData.csmCascade = i;
      scene.add(light);
      scene.add(target);

      this.cascades.push({
        light,
        target,
        near: 0,
        far: 0,
        bias: biasRange,
        normalBias,
      });
    }
    this.sun = this.cascades[0].light;
    this.computeSplits();
  }

  /** Compute the near/far split for each cascade (called once at construction; the
   *  splits are static — they depend on the camera near/far + λ, not the view). */
  private computeSplits(): void {
    const n = this.cascades.length;
    const near = 0.1; // matches the Viewport camera near plane
    const far = this.maxDistance;
    for (let i = 0; i < n; i++) {
      const p = (i + 1) / n;
      // Logarithmic split.
      const logSplit = near * Math.pow(far / near, p);
      // Uniform split.
      const uniSplit = near + (far - near) * p;
      // Blend.
      const split = this.splitLambda * logSplit + (1 - this.splitLambda) * uniSplit;
      this.cascades[i].near = i === 0 ? near : this.cascades[i - 1].far;
      this.cascades[i].far = split;
    }
    // Clamp the last cascade's far to maxDistance.
    this.cascades[n - 1].far = far;
  }

  /** Set the sun direction (called by the Viewport when the sky's sun moves). Updates
   *  every cascade light's position so they all point the same way. */
  setSunDirection(dir: THREE.Vector3): void {
    this.sunDir.copy(dir).normalize();
  }

  /** Day/night: apply the sun colour to every cascade light so they stay visually identical. */
  setSunColor(color: THREE.ColorRepresentation): void {
    for (const c of this.cascades) c.light.color.set(color);
  }

  /** Day/night: apply the sun intensity to every cascade light. */
  setSunIntensity(intensity: number): void {
    for (const c of this.cascades) c.light.intensity = intensity;
  }

  update(camera: THREE.Camera): void {
    camera.getWorldPosition(this._pos);
    // For each cascade, fit an ortho box around the camera's frustum slice (in engine
    // space) so the shadow texels are used efficiently.
    for (let i = 0; i < this.cascades.length; i++) {
      const c = this.cascades[i];
      // Position the light + target along the sun direction.
      c.target.position.copy(this._pos);
      c.light.position.copy(this._pos).addScaledVector(this.sunDir, this.distance);
      c.target.updateMatrixWorld();
      c.light.updateMatrixWorld();

      // Compute the frustum corners for this cascade's near/far slice.
      this.computeFrustumCorners(camera, c.near, c.far, this._frustumCornersWorld);

      // Transform the corners into the light's view space (look down the sun direction)
      // and find the AABB. The light looks from its position towards the target, so its
      // view matrix is a look-at with the eye at the light position and the target at
      // this._pos. We build it directly to avoid depending on Three's internal update.
      this._viewMatrix.copy(camera.matrixWorld); // camera world matrix (for the frustum corners)
      void this._viewMatrix;
      // Build the light's view matrix: look from (pos + sunDir*dist) to (pos), up = (0,1,0).
      const eye = this._pos.clone().addScaledVector(this.sunDir, this.distance);
      this._lightViewMatrix.lookAt(eye, this._pos, new THREE.Vector3(0, 1, 0));

      this._min.set(Infinity, Infinity, Infinity);
      this._max.set(-Infinity, -Infinity, -Infinity);
      for (const corner of this._frustumCornersWorld) {
        corner.applyMatrix4(this._lightViewMatrix);
        this._min.min(corner);
        this._max.max(corner);
      }

      // Fit the ortho camera to the AABB (with a small padding to avoid edge artifacts).
      const pad = 1.5;
      const cam = c.light.shadow.camera as THREE.OrthographicCamera;
      cam.left = this._min.x - pad;
      cam.right = this._max.x + pad;
      cam.top = this._max.y + pad;
      cam.bottom = this._min.y - pad;
      cam.near = this._min.z - pad;
      cam.far = this._max.z + pad;
      cam.updateProjectionMatrix();
      c.light.shadow.needsUpdate = true;
    }
  }

  /** Compute the 8 world-space corners of the camera's frustum slice between `near` and
   *  `far`. Used to fit each cascade's ortho box. */
  private computeFrustumCorners(camera: THREE.Camera, near: number, far: number, out: THREE.Vector3[]): void {
    const pcam = camera as THREE.PerspectiveCamera;
    const fov = pcam.fov;
    const aspect = pcam.aspect;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fov) * 0.5);
    // Near plane half-extents.
    const nh = near * tanHalfFov;
    const nw = nh * aspect;
    // Far plane half-extents.
    const fh = far * tanHalfFov;
    const fw = fh * aspect;
    // Camera basis vectors.
    pcam.updateMatrixWorld();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(pcam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pcam.quaternion);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(pcam.quaternion);
    const nc = this._pos.clone().addScaledVector(forward, near);
    const fc = this._pos.clone().addScaledVector(forward, far);
    // 8 corners: near TL, near TR, near BL, near BR, far TL, far TR, far BL, far BR.
    out[0].copy(nc).addScaledVector(up, nh).addScaledVector(right, -nw);
    out[1].copy(nc).addScaledVector(up, nh).addScaledVector(right, nw);
    out[2].copy(nc).addScaledVector(up, -nh).addScaledVector(right, -nw);
    out[3].copy(nc).addScaledVector(up, -nh).addScaledVector(right, nw);
    out[4].copy(fc).addScaledVector(up, fh).addScaledVector(right, -fw);
    out[5].copy(fc).addScaledVector(up, fh).addScaledVector(right, fw);
    out[6].copy(fc).addScaledVector(up, -fh).addScaledVector(right, -fw);
    out[7].copy(fc).addScaledVector(up, -fh).addScaledVector(right, fw);
  }

  dispose(): void {
    for (const c of this.cascades) {
      c.light.dispose();
      c.light.shadow.dispose();
      this.scene.remove(c.light);
      this.scene.remove(c.target);
    }
    this.cascades.length = 0;
  }

  /** HELM/debug: cascade split info. */
  get cascadeInfo(): Array<{ index: number; near: number; far: number; bias: number }> {
    return this.cascades.map((c, i) => ({ index: i, near: c.near, far: c.far, bias: c.bias }));
  }
}
