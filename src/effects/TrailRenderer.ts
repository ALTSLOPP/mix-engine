import * as THREE from 'three';

/**
 * TrailRenderer.ts — a camera-facing RIBBON trail that follows a moving
 * position. Perfect for anime sword slashes, ki/limb arcs, jet exhaust,
 * magic projectiles, etc.
 *
 * Why a ribbon (not a line): WebGL line primitives are clamped to ~1px on
 * almost every platform, so the old `THREE.Line` trail was an invisible
 * hairline at any real distance. A ribbon is a real triangle strip with
 * world-space width that tapers head→tail and stays broadside to the camera,
 * which is exactly what reads as a glowing slash arc.
 *
 * Implementation: per-sample we keep a CENTER position + a per-sample `life`
 * (1 at the head → 0 at the tail). Each frame we rebuild a 2-vertices-per-
 * sample ribbon: for sample i we offset the center by ±halfWidth along the
 * "side" vector `normalize(cross(tangent, viewDir))`, so the ribbon always
 * faces the camera. Width and alpha both taper with `life`. The fill region
 * is bounded by a draw range so unwritten startup slots never draw a stray
 * triangle back to the origin.
 *
 * Position sampling: `updateHead(worldPos, now)` to drive it yourself, OR
 * `attachToObject(obj, offset)` to make the trail ride a Three.js Object3D.
 *
 * All public coordinates are WORLD space; the renderer subtracts the
 * worldOrigin internally so it integrates with the floating-origin pipeline.
 */

export interface TrailOptions {
  /** Number of sampled points along the trail. */
  segments?: number;
  /** Total trail lifetime in seconds. A head sample fades to 0 over this time. */
  lifetime?: number;
  /** Width at the head, in world units (tapers to 0 at the tail). */
  width?: number;
  /** Color (multiplied by the per-vertex alpha). */
  color?: THREE.ColorRepresentation;
  /** Additive blending (default true — the glowy anime look) or normal alpha. */
  additive?: boolean;
  /** Per-second friction for tangential motion (0 = no damping). Reserved. */
  drag?: number;
  /** Camera the ribbon orients toward. Injected by EffectsController; without it
   *  the ribbon falls back to a fixed broadside and still renders. */
  camera?: THREE.Camera;
  /** Optional texture scrolled along the ribbon (e.g. a beam-core streak) for
   *  extra flavour. Sampled as (u = along length, v = across width). */
  textureUrl?: string;
  /** Texture scroll speed along the length (UV units/sec). Default 0. */
  scroll?: number;
  /** Extra width gained per (m/s) of head speed, so fast swings flare. Default 0. */
  speedWiden?: number;
}

const VERT = /* glsl */ `
  attribute float aLife;     // 1 at head → 0 at tail
  attribute vec2 aUv;        // u along length, v across width
  varying float vLife;
  varying vec2 vUv;
  void main() {
    vLife = aLife;
    vUv = aUv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uScroll;
  uniform sampler2D uTexture;
  uniform bool uUseTexture;
  varying float vLife;
  varying vec2 vUv;
  void main() {
    if (vLife <= 0.0) discard;
    // Smooth fade along the tail + a soft edge across the width.
    float edge = smoothstep(0.0, 0.5, vLife);
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);   // 1 at centre → 0 at the rails
    float a = pow(vLife, 1.4) * uOpacity * (0.35 + 0.65 * across) * edge;
    vec3 col = uColor;
    if (uUseTexture) {
      vec4 t = texture2D(uTexture, vec2(vUv.x - uScroll, vUv.y));
      col *= t.rgb;
      a *= max(t.a, max(t.r, max(t.g, t.b)));      // works for alpha & greyscale streaks
    }
    gl_FragColor = vec4(col * a, a);
  }
`;

export class TrailRenderer {
  /** The ribbon mesh (added to the scene). */
  readonly mesh: THREE.Mesh;
  /** @deprecated Back-compat alias for `mesh` (older code/tests referenced `.line`). */
  get line(): THREE.Mesh { return this.mesh; }

  /** Per-sample CENTER positions (engine space), stride 3. */
  private readonly centers: Float32Array;
  /** Per-sample life (1 head → 0 tail). */
  private readonly sampleLives: Float32Array;
  /** GPU vertex buffers: 2 verts (left/right rail) per sample. */
  private readonly positions: Float32Array;
  private readonly lives: Float32Array;
  private readonly uvs: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;

  private readonly maxPoints: number;
  private readonly lifetime: number;
  private readonly drag: number;
  private readonly baseWidth: number;
  private readonly speedWiden: number;
  private readonly scroll: number;
  private readonly camera: THREE.Camera | null;

  /** How many real head samples have landed (caps at maxPoints). */
  private filled = 0;
  private headSpeed = 0;
  private lastHead: THREE.Vector3 | null = null;
  private lastHeadTime = 0;
  private attachedObject: THREE.Object3D | null = null;
  private readonly attachedOffset = new THREE.Vector3();
  private _fadeOut = 1;
  private _scrollOffset = 0;
  private readonly worldOffset = new THREE.Vector3();

  constructor(scene: THREE.Scene, opts: TrailOptions = {}) {
    this.maxPoints = Math.max(4, opts.segments ?? 24);
    this.lifetime = Math.max(0.05, opts.lifetime ?? 0.4);
    this.drag = opts.drag ?? 0;
    this.baseWidth = opts.width ?? 0.1;
    this.speedWiden = opts.speedWiden ?? 0;
    this.scroll = opts.scroll ?? 0;
    this.camera = opts.camera ?? null;

    this.centers = new Float32Array(this.maxPoints * 3);
    this.sampleLives = new Float32Array(this.maxPoints);   // all 0 = empty (nothing drawn)
    this.positions = new Float32Array(this.maxPoints * 2 * 3);
    this.lives = new Float32Array(this.maxPoints * 2);
    this.uvs = new Float32Array(this.maxPoints * 2 * 2);

    // Static UVs: u runs along the trail, v is 0 (left rail) / 1 (right rail).
    for (let i = 0; i < this.maxPoints; i++) {
      const u = i / (this.maxPoints - 1);
      this.uvs[(i * 2) * 2] = u;     this.uvs[(i * 2) * 2 + 1] = 0;
      this.uvs[(i * 2 + 1) * 2] = u; this.uvs[(i * 2 + 1) * 2 + 1] = 1;
    }

    // Index buffer: a quad (2 tris) between every adjacent pair of samples.
    const index = new Uint16Array((this.maxPoints - 1) * 6);
    for (let i = 0; i < this.maxPoints - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      const o = i * 6;
      index[o] = a; index[o + 1] = c; index[o + 2] = b;
      index[o + 3] = b; index[o + 4] = c; index[o + 5] = d;
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(this.uvs, 2));
    this.geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.geo.setDrawRange(0, 0); // nothing until samples land

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
        uOpacity: { value: 1.0 },
        uScroll: { value: 0 },
        uTexture: { value: null },
        uUseTexture: { value: false },
      },
    });

    if (opts.textureUrl) {
      new THREE.TextureLoader().load(opts.textureUrl, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        this.mat.uniforms.uTexture.value = tex;
        this.mat.uniforms.uUseTexture.value = true;
      });
    }

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Set the world-origin offset so positions you pass are interpreted as WORLD. */
  setWorldOrigin(offset: THREE.Vector3): void {
    this.worldOffset.copy(offset);
  }

  /**
   * Pin the trail's head to a Three.js Object3D. The local `offset` is added
   * to the object's world position each frame. Pass `offset = null` to detach.
   */
  attachToObject(obj: THREE.Object3D, offset: THREE.Vector3 = new THREE.Vector3()): void {
    this.attachedObject = obj;
    this.attachedOffset.copy(offset);
  }

  /** Push a new head sample. Call every frame (or only when the head moves). */
  updateHead(worldPos: THREE.Vector3, now: number): void {
    const p = _head.copy(worldPos);
    if (this.worldOffset.lengthSq() > 0) p.sub(this.worldOffset); // world → engine

    // Estimate head speed for optional width flare.
    if (this.lastHead) {
      const dt = Math.max(0.0001, now - this.lastHeadTime);
      this.headSpeed = p.distanceTo(this.lastHead) / dt;
    }
    (this.lastHead ??= new THREE.Vector3()).copy(p);
    this.lastHeadTime = now;

    // Shift sample centers + lives back by one (drop the oldest tail), seed head.
    for (let i = this.maxPoints - 1; i > 0; i--) {
      this.centers[i * 3]     = this.centers[(i - 1) * 3];
      this.centers[i * 3 + 1] = this.centers[(i - 1) * 3 + 1];
      this.centers[i * 3 + 2] = this.centers[(i - 1) * 3 + 2];
      this.sampleLives[i] = this.sampleLives[i - 1];
    }
    this.centers[0] = p.x; this.centers[1] = p.y; this.centers[2] = p.z;
    this.sampleLives[0] = 1;
    this.filled = Math.min(this.filled + 1, this.maxPoints);
  }

  update(dt: number, now: number): void {
    if (this.attachedObject) {
      this.attachedObject.getWorldPosition(_attached);
      if (this.attachedOffset.lengthSq() > 0) {
        // Offset rides the object's LOCAL frame (so a "+Z tip offset" tracks the blade
        // tip as it swings, not a fixed world direction).
        _off.copy(this.attachedOffset).applyQuaternion(this.attachedObject.getWorldQuaternion(_q));
        _attached.add(_off);
      }
      this.updateHead(_attached, now);
    }

    // Age every sample's life. A head (life 1) reaches 0 after `lifetime` seconds.
    const ageStep = dt / this.lifetime;
    for (let i = 0; i < this.maxPoints; i++) {
      this.sampleLives[i] = Math.max(0, this.sampleLives[i] - ageStep);
    }

    this.rebuildRibbon();

    this._scrollOffset = (this._scrollOffset + (this.scroll + this.headSpeed * 0.02) * dt) % 1;
    this.mat.uniforms.uScroll.value = this.scroll !== 0 || this.mat.uniforms.uUseTexture.value ? this._scrollOffset : 0;
    this.mat.uniforms.uOpacity.value = this._fadeOut;
  }

  /** Rebuild the camera-facing ribbon vertices from the sample centers. */
  private rebuildRibbon(): void {
    if (this.filled < 1) { this.geo.setDrawRange(0, 0); return; }

    // Camera position in engine space (the scene camera is root-level, so .position
    // is its world position — no matrixWorld timing dependency).
    if (this.camera) _camPos.copy(this.camera.position);
    else _camPos.set(0, 0, 1e6);

    const hw = this.baseWidth * 0.5 + this.headSpeed * this.speedWiden * 0.5;

    for (let i = 0; i < this.filled; i++) {
      _center.fromArray(this.centers, i * 3);

      // Tangent along the trail (use available neighbours).
      const prev = Math.max(0, i - 1);
      const next = Math.min(this.filled - 1, i + 1);
      _tangent.set(
        this.centers[next * 3] - this.centers[prev * 3],
        this.centers[next * 3 + 1] - this.centers[prev * 3 + 1],
        this.centers[next * 3 + 2] - this.centers[prev * 3 + 2],
      );
      if (_tangent.lengthSq() < 1e-10) _tangent.set(1, 0, 0);
      _tangent.normalize();

      // Side = tangent × viewDir → ribbon faces the camera.
      _view.copy(_camPos).sub(_center);
      if (_view.lengthSq() < 1e-10) _view.set(0, 0, 1);
      _view.normalize();
      _side.crossVectors(_tangent, _view);
      if (_side.lengthSq() < 1e-8) _side.crossVectors(_tangent, _up); // looking down the trail
      if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0);
      _side.normalize();

      const life = this.sampleLives[i];
      const w = hw * Math.max(life, 0.0); // width tapers head→tail with life
      const li = i * 2;
      const ri = i * 2 + 1;
      // Left rail.
      this.positions[li * 3]     = _center.x + _side.x * w;
      this.positions[li * 3 + 1] = _center.y + _side.y * w;
      this.positions[li * 3 + 2] = _center.z + _side.z * w;
      // Right rail.
      this.positions[ri * 3]     = _center.x - _side.x * w;
      this.positions[ri * 3 + 1] = _center.y - _side.y * w;
      this.positions[ri * 3 + 2] = _center.z - _side.z * w;
      this.lives[li] = life;
      this.lives[ri] = life;
    }

    // Only draw quads spanning the filled region; this keeps startup slots (still
    // at the origin) from stretching a stray triangle back to (0,0,0).
    this.geo.setDrawRange(0, Math.max(0, this.filled - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
  }

  /** Per-sample life (1 at the head → 0 at the tail); 0 = empty/expired slot. */
  sampleLife(i: number): number { return this.sampleLives[i] ?? 0; }
  /** Per-sample CENTER position (engine space). */
  sampleCenter(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.fromArray(this.centers, i * 3);
  }
  /** Number of real head samples that have landed (caps at `segments`). */
  get sampleCount(): number { return this.filled; }

  /** Global opacity multiplier (0..1) — useful for "winding down" a trail. */
  setOpacity(v: number): void { this._fadeOut = Math.max(0, Math.min(1, v)); }
  setColor(c: THREE.ColorRepresentation): void {
    (this.mat.uniforms.uColor.value as THREE.Color).set(c);
  }
  get speed(): number { return this.headSpeed; }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    const tex = this.mat.uniforms.uTexture.value as THREE.Texture | null;
    if (tex && tex.isTexture) tex.dispose();
  }
}

const _head = new THREE.Vector3();
const _attached = new THREE.Vector3();
const _off = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _camPos = new THREE.Vector3();
const _center = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _view = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
