import * as THREE from 'three';

/**
 * ParticleEmitter.ts — a self-contained GPU-friendly particle emitter for cinematic
 * VFX (fire, smoke, sparks, mist, explosions, magic). Designed so an IDE can spawn a
 * preset with a single AI command and get an instantly-cinematic effect.
 *
 * Each emitter owns its own THREE.Points cloud with a per-particle attribute buffer
 * (position, velocity, life, size, seed). The CPU updates a flat Float32Array each
 * frame (cheap — no per-particle object allocation) and flags the GPU attribute as
 * dirty. A custom ShaderMaterial renders additive, soft, scrolling particles with
 * per-particle size fade — looks far better than flat sprites at no extra draw calls.
 *
 * The emitter's origin is stored in ENGINE space (it's a scene object added to the
 * root), so it participates in the standard floating-origin shift like any other
 * root-level Object3D (the ChunkManager static shift translates it by `offset`).
 */

export type VfxPresetName =
  | 'fire'
  | 'smoke'
  | 'sparks'
  | 'explosion'
  | 'mist'
  | 'magic'
  | 'embers'
  | 'rain'
  | 'snow'
  | 'dust'
  | 'muzzle_flash'
  | 'splash'
  | 'blood'
  | 'heal'
  | 'electric'
  | 'teleport'
  | 'poison'
  | 'glow'
  | 'confetti'
  | 'sandstorm'
  | 'bubble'
  | 'aura_blue'
  | 'aura_dark'
  | 'aura_gold'
  | 'aura_red'
  | 'aura_green'
  | 'ki_charge'
  | 'ki_blast'
  | 'beam_fire'
  | 'impact_red'
  | 'smoke_stylized'
  | 'spark_glint';

export interface VfxPreset {
  rate: number;
  lifetime: [number, number];
  speed: [number, number];
  size: [number, number];
  gravity: number;
  drag: number;
  spread: number;
  upBias: number;
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
  opacity: number;
  additive: boolean;
  spriteScale: number;
  curl?: number;
  textureUrl?: string;
}

export const VFX_PRESETS: Record<VfxPresetName, VfxPreset> = {
  fire: {
    rate: 60, lifetime: [0.6, 1.1], speed: [1.5, 3.5], size: [0.3, 0.9],
    gravity: -2.2, drag: 0.6, spread: 0.35, upBias: 1,
    colorStart: new THREE.Color('#ffd86b'), colorEnd: new THREE.Color('#ff2a00'),
    opacity: 0.9, additive: true, spriteScale: 1, curl: 0.4,
  },
  smoke: {
    rate: 28, lifetime: [1.8, 3.2], speed: [0.6, 1.4], size: [0.8, 2.2],
    gravity: -0.6, drag: 0.5, spread: 0.6, upBias: 1,
    colorStart: new THREE.Color('#cfcfcf'), colorEnd: new THREE.Color('#2a2a2a'),
    opacity: 0.55, additive: false, spriteScale: 1.4, curl: 0.6,
  },
  sparks: {
    rate: 120, lifetime: [0.4, 0.9], speed: [3, 7], size: [0.05, 0.12],
    gravity: 5, drag: 0.2, spread: 1.0, upBias: 0,
    colorStart: new THREE.Color('#fff3a8'), colorEnd: new THREE.Color('#ff5500'),
    opacity: 1, additive: true, spriteScale: 1,
  },
  explosion: {
    rate: 0, lifetime: [0.6, 1.1], speed: [4, 9], size: [0.3, 1.4],
    gravity: 3, drag: 0.4, spread: 1.0, upBias: 0,
    colorStart: new THREE.Color('#fff2c0'), colorEnd: new THREE.Color('#7a0a00'),
    opacity: 1, additive: true, spriteScale: 1.3,
  },
  mist: {
    rate: 14, lifetime: [3, 5], speed: [0.2, 0.6], size: [1.5, 3.5],
    gravity: 0, drag: 0.6, spread: 0.8, upBias: 0,
    colorStart: new THREE.Color('#aebcc8'), colorEnd: new THREE.Color('#5b6770'),
    opacity: 0.25, additive: false, spriteScale: 2, curl: 0.3,
  },
  magic: {
    rate: 50, lifetime: [1, 1.8], speed: [0.8, 2.2], size: [0.12, 0.3],
    gravity: 0, drag: 0.4, spread: 1.0, upBias: 0.2,
    colorStart: new THREE.Color('#b98bff'), colorEnd: new THREE.Color('#33ddff'),
    opacity: 0.95, additive: true, spriteScale: 1.1, curl: 0.8,
  },
  embers: {
    rate: 22, lifetime: [2, 4], speed: [0.6, 1.6], size: [0.04, 0.1],
    gravity: -1.2, drag: 0.3, spread: 0.5, upBias: 1,
    colorStart: new THREE.Color('#ffb24a'), colorEnd: new THREE.Color('#5a0a00'),
    opacity: 0.95, additive: true, spriteScale: 1,
  },
  rain: {
    rate: 200, lifetime: [0.4, 0.8], speed: [22, 28], size: [0.02, 0.04],
    gravity: 0, drag: 0, spread: 0.05, upBias: 0,
    colorStart: new THREE.Color('#9fb6c8'), colorEnd: new THREE.Color('#9fb6c8'),
    opacity: 0.5, additive: false, spriteScale: 0.6,
  },
  // ─── New: combat / game-feel presets ────────────────────────────────
  snow: {
    rate: 80, lifetime: [3, 5], speed: [0.4, 1.1], size: [0.05, 0.18],
    gravity: -1.6, drag: 0.2, spread: 0.6, upBias: 0,
    colorStart: new THREE.Color('#f3f7fb'), colorEnd: new THREE.Color('#cfd8e0'),
    opacity: 0.9, additive: false, spriteScale: 1, curl: 0.3,
  },
  dust: {
    rate: 45, lifetime: [1.5, 2.8], speed: [0.6, 1.6], size: [0.25, 0.7],
    gravity: -0.4, drag: 0.7, spread: 0.6, upBias: 0.1,
    colorStart: new THREE.Color('#d2c1a0'), colorEnd: new THREE.Color('#6a553a'),
    opacity: 0.5, additive: false, spriteScale: 1.2, curl: 0.4,
  },
  muzzle_flash: {
    rate: 0, lifetime: [0.05, 0.12], speed: [4, 8], size: [0.4, 0.9],
    gravity: 0, drag: 0.1, spread: 0.4, upBias: 0,
    colorStart: new THREE.Color('#fff7c0'), colorEnd: new THREE.Color('#ff9020'),
    opacity: 1, additive: true, spriteScale: 1.2,
  },
  splash: {
    rate: 30, lifetime: [0.6, 1.2], speed: [3, 7], size: [0.08, 0.2],
    gravity: 12, drag: 0.1, spread: 0.7, upBias: 0.6,
    colorStart: new THREE.Color('#cfeaff'), colorEnd: new THREE.Color('#5b9bd0'),
    opacity: 0.85, additive: false, spriteScale: 1,
  },
  blood: {
    rate: 50, lifetime: [0.3, 0.7], speed: [2, 5], size: [0.06, 0.14],
    gravity: 9, drag: 0.1, spread: 0.6, upBias: 0.1,
    colorStart: new THREE.Color('#ff3a3a'), colorEnd: new THREE.Color('#5a0a0a'),
    opacity: 1, additive: false, spriteScale: 0.9,
  },
  heal: {
    rate: 40, lifetime: [0.8, 1.6], speed: [0.6, 1.4], size: [0.12, 0.28],
    gravity: -0.8, drag: 0.2, spread: 0.7, upBias: 1,
    colorStart: new THREE.Color('#aaffb2'), colorEnd: new THREE.Color('#1ea9ff'),
    opacity: 0.95, additive: true, spriteScale: 1.1, curl: 0.4,
  },
  electric: {
    rate: 80, lifetime: [0.15, 0.4], speed: [3, 8], size: [0.04, 0.12],
    gravity: 0, drag: 0, spread: 1.0, upBias: 0,
    colorStart: new THREE.Color('#bdf3ff'), colorEnd: new THREE.Color('#5b7bff'),
    opacity: 1, additive: true, spriteScale: 1, curl: 1.2,
  },
  teleport: {
    rate: 60, lifetime: [0.5, 1.0], speed: [0.5, 1.5], size: [0.1, 0.3],
    gravity: 0, drag: 0.4, spread: 0.8, upBias: 1,
    colorStart: new THREE.Color('#9d6dff'), colorEnd: new THREE.Color('#22e7ff'),
    opacity: 1, additive: true, spriteScale: 1.2, curl: 0.6,
  },
  poison: {
    rate: 40, lifetime: [1.2, 2.2], speed: [0.4, 1.2], size: [0.2, 0.5],
    gravity: -0.4, drag: 0.4, spread: 0.6, upBias: 0.4,
    colorStart: new THREE.Color('#9bff5c'), colorEnd: new THREE.Color('#223a0e'),
    opacity: 0.7, additive: false, spriteScale: 1.3, curl: 0.5,
  },
  glow: {
    rate: 35, lifetime: [1.2, 2.0], speed: [0.3, 0.8], size: [0.2, 0.4],
    gravity: 0, drag: 0.2, spread: 0.7, upBias: 0.2,
    colorStart: new THREE.Color('#ffeaa3'), colorEnd: new THREE.Color('#ff7a3a'),
    opacity: 0.7, additive: true, spriteScale: 1.4, curl: 0.4,
  },
  confetti: {
    rate: 80, lifetime: [2.0, 3.5], speed: [2, 5], size: [0.08, 0.16],
    gravity: 5, drag: 0.3, spread: 0.8, upBias: 0.3,
    colorStart: new THREE.Color('#ff5577'), colorEnd: new THREE.Color('#44aaff'),
    opacity: 1, additive: false, spriteScale: 1,
  },
  sandstorm: {
    rate: 200, lifetime: [1.5, 3.0], speed: [3, 7], size: [0.06, 0.16],
    gravity: 0, drag: 0, spread: 0.3, upBias: 0,
    colorStart: new THREE.Color('#d4b888'), colorEnd: new THREE.Color('#8a6a3a'),
    opacity: 0.6, additive: false, spriteScale: 1.2,
  },
  bubble: {
    rate: 25, lifetime: [2, 4], speed: [0.6, 1.2], size: [0.1, 0.3],
    gravity: -0.6, drag: 0.1, spread: 0.5, upBias: 0.3,
    colorStart: new THREE.Color('#a8e6ff'), colorEnd: new THREE.Color('#2a6a8a'),
    opacity: 0.5, additive: false, spriteScale: 1, curl: 0.4,
  },
  aura_blue: {
    rate: 40, lifetime: [1, 2], speed: [0.5, 1.5], size: [1.0, 2.5],
    gravity: -0.2, drag: 0.5, spread: 0.2, upBias: 1.5,
    colorStart: new THREE.Color('#aae8ff'), colorEnd: new THREE.Color('#0055ff'),
    opacity: 0.8, additive: true, spriteScale: 1.5, curl: 0.8, textureUrl: '/assets/vfx/blueaura2.jpg'
  },
  aura_dark: {
    rate: 40, lifetime: [1, 2], speed: [0.5, 1.5], size: [1.0, 2.5],
    gravity: -0.2, drag: 0.5, spread: 0.2, upBias: 1.5,
    colorStart: new THREE.Color('#5500aa'), colorEnd: new THREE.Color('#110033'),
    opacity: 0.8, additive: true, spriteScale: 1.5, curl: 0.8, textureUrl: '/assets/vfx/darkaura.jpg'
  },
  beam_fire: {
    rate: 80, lifetime: [0.5, 1.0], speed: [5, 15], size: [0.6, 1.6],
    gravity: 0, drag: 0.1, spread: 0.1, upBias: 0,
    colorStart: new THREE.Color('#ffccaa'), colorEnd: new THREE.Color('#ff2200'),
    opacity: 0.9, additive: true, spriteScale: 1.8, textureUrl: '/assets/vfx/firebeamcore.jpg'
  },
  impact_red: {
    rate: 0, lifetime: [0.2, 0.5], speed: [2, 6], size: [0.8, 1.8],
    gravity: 0, drag: 0.5, spread: 1.0, upBias: 0,
    colorStart: new THREE.Color('#ffaaaa'), colorEnd: new THREE.Color('#ff0000'),
    opacity: 1.0, additive: true, spriteScale: 1.8, textureUrl: '/assets/vfx/redimpact.jpg'
  },
  smoke_stylized: {
    rate: 30, lifetime: [1.5, 3.0], speed: [0.5, 2.0], size: [1.2, 2.6],
    gravity: -0.5, drag: 0.5, spread: 0.5, upBias: 1.0,
    colorStart: new THREE.Color('#dddddd'), colorEnd: new THREE.Color('#333333'),
    opacity: 0.6, additive: false, spriteScale: 1.8, curl: 0.6, textureUrl: '/assets/vfx/STYLIZEDSMOKE2.jpg'
  },
  spark_glint: {
    rate: 100, lifetime: [0.3, 0.8], speed: [4, 8], size: [0.3, 0.9],
    gravity: 3, drag: 0.2, spread: 1.0, upBias: 0,
    colorStart: new THREE.Color('#ffffff'), colorEnd: new THREE.Color('#ffaa00'),
    opacity: 1.0, additive: true, spriteScale: 1.2, textureUrl: '/assets/vfx/SparkGlint.jpeg'
  },
  // ─── Anime power-up auras (textured, additive — the "charging" glow column) ──
  aura_gold: {
    rate: 46, lifetime: [0.9, 1.8], speed: [0.8, 2.2], size: [0.6, 1.4],
    gravity: -0.3, drag: 0.5, spread: 0.18, upBias: 2.0,
    colorStart: new THREE.Color('#fff4b0'), colorEnd: new THREE.Color('#ff9500'),
    opacity: 0.85, additive: true, spriteScale: 1.6, curl: 0.9, textureUrl: '/assets/vfx/Ayosaura.jpg'
  },
  aura_red: {
    rate: 44, lifetime: [0.9, 1.8], speed: [0.7, 2.0], size: [0.6, 1.4],
    gravity: -0.25, drag: 0.5, spread: 0.2, upBias: 1.8,
    colorStart: new THREE.Color('#ffb0b0'), colorEnd: new THREE.Color('#ff1133'),
    opacity: 0.85, additive: true, spriteScale: 1.5, curl: 0.9, textureUrl: '/assets/vfx/redaura.jpg'
  },
  aura_green: {
    rate: 44, lifetime: [0.9, 1.8], speed: [0.7, 2.0], size: [0.6, 1.4],
    gravity: -0.25, drag: 0.5, spread: 0.2, upBias: 1.8,
    colorStart: new THREE.Color('#c6ffb0'), colorEnd: new THREE.Color('#22cc44'),
    opacity: 0.85, additive: true, spriteScale: 1.5, curl: 0.9, textureUrl: '/assets/vfx/greenaura.jpg'
  },
  // Dense bright energy stream that rushes upward — the charge "build-up" core.
  ki_charge: {
    rate: 120, lifetime: [0.4, 0.9], speed: [3, 7], size: [0.4, 1.0],
    gravity: -3.5, drag: 0.25, spread: 0.35, upBias: 3.0,
    colorStart: new THREE.Color('#ffffff'), colorEnd: new THREE.Color('#ffc24a'),
    opacity: 0.95, additive: true, spriteScale: 1.3, curl: 0.6, textureUrl: '/assets/vfx/godfirebeamcore.jpg'
  },
  // One-shot energy detonation for melee/ki impacts (rate 0 → use burst()).
  ki_blast: {
    rate: 0, lifetime: [0.25, 0.6], speed: [4, 11], size: [0.6, 1.4],
    gravity: 0, drag: 0.5, spread: 1.0, upBias: 0,
    colorStart: new THREE.Color('#ffffff'), colorEnd: new THREE.Color('#ffaa22'),
    opacity: 1.0, additive: true, spriteScale: 1.6, textureUrl: '/assets/vfx/ayoimpact.jpg'
  }
};

export interface ParticleEmitterOptions {
  preset?: VfxPresetName;
  /** Max alive particles (buffer is pre-allocated to this size). */
  maxParticles?: number;
  /** Auto-emit; set false for one-shot bursts (call burst()). */
  loop?: boolean;
  /** Stop emitting after this many seconds (loop=false overrides). */
  duration?: number;
  /** Apply a strong upward cone for smoke/fire. */
  localUp?: [number, number, number];
  /** Physics collision: if set, each particle raycasts against the physics world and
   *  bounces off surfaces. The callback receives (origin, dir, maxDist) and returns the
   *  hit distance (or null). Injected by the Engine so ParticleEmitter stays decoupled
   *  from the physics world. */
  collide?: (origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) => number | null;
  /** Bounce coefficient for physics collisions (0 = stop, 1 = perfectly elastic). */
  bounce?: number;
  /** Per-instance overrides used by the ECS ParticleEmitterComponent. */
  rate?: number;
  color?: THREE.ColorRepresentation;
  size?: number;
  lifetime?: number;
}

// x,y,z — MUST equal the `position` BufferAttribute itemSize (3) below. The writer
// (emitOne/update) and the GPU reader index the same buffer, so any mismatch makes
// every particle past index 0 sample a neighbour's coordinates. Per-particle life is
// stored separately in `this.lives`, so positions are a tight xyz array.
const ATTRS_PER_PARTICLE = 3;
const VELS_PER_PARTICLE = 4;  // vx,vy,vz,age
const SEEDS_PER_PARTICLE = 2; // seed, sizeFactor

const VERT = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  attribute float aSeed;
  varying float vLife;
  varying float vSeed;
  uniform float uPxRatio;
  uniform float uMaxPx;
  void main() {
    vLife = aLife;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Perspective attenuated size, clamped to the GPU/driver point-size limit so very
    // close / oversized particles don't degenerate into giant blurry squares (a major
    // cause of the previous "low quality, blurry" look — point sprites were blowing
    // past ALIASED_POINT_SIZE_RANGE and clamping inconsistently across drivers).
    gl_PointSize = min(aSize * uPxRatio * (300.0 / max(-mv.z, 0.001)), uMaxPx);
  }
`;

const FRAG = /* glsl */ `
  varying float vLife;
  varying float vSeed;
  uniform vec3 uColorStart;
  uniform vec3 uColorEnd;
  uniform float uOpacity;
  uniform sampler2D uTexture;
  uniform bool uUseTexture;
  uniform float uIntensity;     // HDR multiplier so bright additive cores push > 1.0 → bloom
  void main() {
    // Centre coords in [-1,1]; soft radial alpha mask keeps every particle within a
    // disc (no hard sprite-square edges) regardless of whether a texture is bound.
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    float radial = pow(1.0 - r2, 1.4);

    // 1.0 at birth → 0.0 at death.
    float t = clamp(vLife, 0.0, 1.0);
    vec3 col = mix(uColorEnd, uColorStart, t);
    // Per-particle brightness jitter (energy "shimmer").
    float jitter = 0.85 + 0.15 * sin(vSeed * 12.9898 + t * 8.0);
    col *= jitter;

    float alpha = radial;
    if (uUseTexture) {
      // Rotate the texture sample per-particle (by vSeed) so identical emission isn't
      // a single stamped orientation — reads as non-uniform, "alive" particles.
      vec2 uv = gl_PointCoord - 0.5;
      float ang = vSeed * 6.2831853;
      float sa = sin(ang), ca = cos(ang);
      vec2 ruv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y) + 0.5;
      vec4 tex = texture2D(uTexture, ruv);
      // Use the texture's RGB as ACTUAL colour contribution (so the anime aura/impact
      // photos show through) and gate the alpha by overall texture brightness modulated
      // with the procedural radial falloff → soft round particles, not hard squares.
      col *= 0.5 + 1.5 * tex.rgb;
      alpha *= clamp(max(max(tex.r, tex.g), tex.b), 0.25, 1.0);
    } else {
      // Inner-core / outer-halo split for a volumetric read (procedural path).
      float core = pow(1.0 - r2, 3.0);
      col += core * 0.8;
    }

    // HDR boost: push bright cores above 1.0 so the bloom pass actually kicks in.
    col *= uIntensity;

    gl_FragColor = vec4(col, alpha * uOpacity * t);
  }
`;

/**
 * A single particle emitter. Add its `points` to the scene; call `update(dt)` each
 * frame; call `dispose()` when done. The emitter is fully self-contained.
 */
export class ParticleEmitter {
  readonly points: THREE.Points;
  private readonly preset: VfxPreset;
  private readonly max: number;
  private readonly positions: Float32Array;
  private readonly lives: Float32Array;
  private readonly velocities: Float32Array;
  private readonly sizes: Float32Array;
  private readonly seeds: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private cursor = 0;
  private emitAcc = 0;
  private elapsed = 0;
  private readonly duration: number;
  loop: boolean;
  private readonly localUp: THREE.Vector3;
  /** Physics collision callback (optional; set via opts.collide). */
  private readonly collide?: (origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) => number | null;
  private readonly bounce: number;
  private _dead = false;

  constructor(scene: THREE.Scene, enginePos: THREE.Vector3, opts: ParticleEmitterOptions = {}) {
    const presetName = opts.preset ?? 'fire';
    this.preset = { ...VFX_PRESETS[presetName] };
    if (opts.rate !== undefined) this.preset.rate = Math.max(0, opts.rate);
    if (opts.color !== undefined) {
      this.preset.colorStart = new THREE.Color(opts.color);
      this.preset.colorEnd = new THREE.Color(opts.color);
    }
    if (opts.size !== undefined) this.preset.size = [Math.max(0.001, opts.size), Math.max(0.001, opts.size)];
    if (opts.lifetime !== undefined) this.preset.lifetime = [Math.max(0.01, opts.lifetime), Math.max(0.01, opts.lifetime)];
    this.max = Math.max(8, opts.maxParticles ?? 600);
    this.loop = opts.loop ?? true;
    this.duration = opts.duration ?? 0;
    this.localUp = opts.localUp
      ? new THREE.Vector3(opts.localUp[0], opts.localUp[1], opts.localUp[2]).normalize()
      : new THREE.Vector3(0, 1, 0);
    this.collide = opts.collide;
    this.bounce = opts.bounce ?? 0.3;

    this.positions = new Float32Array(this.max * ATTRS_PER_PARTICLE);
    this.lives = new Float32Array(this.max);            // 1 → 0 while alive, 0 = dead
    this.velocities = new Float32Array(this.max * VELS_PER_PARTICLE);
    this.sizes = new Float32Array(this.max);
    this.seeds = new Float32Array(this.max * SEEDS_PER_PARTICLE);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, SEEDS_PER_PARTICLE));
    this.geo.setDrawRange(0, 0);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: this.preset.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uColorStart: { value: this.preset.colorStart.clone() },
        uColorEnd: { value: this.preset.colorEnd.clone() },
        uOpacity: { value: this.preset.opacity },
        uPxRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uMaxPx: { value: 1024 },
        // HDR multiplier — additive energy particles push past 1.0 so the bloom pass
        // (threshold 0.6 in Viewport) actually catches their cores; non-additive
        // smoke/dust stays at 1.0 to keep its colour faithful.
        uIntensity: { value: this.preset.additive ? 2.0 : 1.0 },
        uTexture: { value: null },
        uUseTexture: { value: false },
      },
    });

    if (this.preset.textureUrl) {
      new THREE.TextureLoader().load(this.preset.textureUrl, (tex) => {
        // Explicit filtering — defaults are these, but pin them so the previously
        // blurry look (no mipmaps on downsampled sprites) can't come back. The texture
        // RGB is now sampled as colour, not as an alpha mask, so quality matters.
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 4;
        tex.colorSpace = THREE.NoColorSpace;
        tex.needsUpdate = true;
        this.mat.uniforms.uTexture.value = tex;
        this.mat.uniforms.uUseTexture.value = true;
      });
    }

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.position.copy(enginePos);
    // Intentionally NOT marked physicsRoot: the floating-origin generic shift moves
    // root-level non-physics objects (child.position.sub(offset)), which is exactly
    // what an emitter needs so its origin rides the world; particles are local to the
    // emitter so they translate with it for free.
    scene.add(this.points);
  }

  /** One-shot burst — emits N particles immediately regardless of `loop`. */
  burst(count: number): void {
    for (let i = 0; i < count; i++) this.emitOne();
  }

  update(dt: number): void {
    if (this._dead) return;
    this.elapsed += dt;

    // Continuous emission.
    if (this.loop || (this.duration > 0 && this.elapsed < this.duration)) {
      this.emitAcc += this.preset.rate * dt;
      while (this.emitAcc >= 1) {
        this.emitOne();
        this.emitAcc -= 1;
      }
    }

    // Integrate.
    const g = this.preset.gravity;
    const drag = this.preset.drag;
    const curl = this.preset.curl ?? 0;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const li = this.lives[i];
      if (li <= 0) continue;
      const vi = i * VELS_PER_PARTICLE;
      const pi = i * ATTRS_PER_PARTICLE;
      // Velocity integration (drag + gravity + subtle curl noise for flame flicker).
      const vx = this.velocities[vi];
      const vy = this.velocities[vi + 1];
      const vz = this.velocities[vi + 2];
      const d = Math.max(0, 1 - drag * dt);
      let nvx = vx * d;
      let nvy = vy * d + g * dt;
      let nvz = vz * d;
      if (curl > 0) {
        const t = this.elapsed + this.seeds[i * SEEDS_PER_PARTICLE] * 6.283;
        nvx += Math.sin(t * 1.7 + i) * curl * dt;
        nvz += Math.cos(t * 1.3 + i * 1.3) * curl * dt;
      }
      this.velocities[vi] = nvx;
      this.velocities[vi + 1] = nvy;
      this.velocities[vi + 2] = nvz;
      // Physics collision: raycast from the current position along the velocity vector.
      // If it hits before the full step, move to the hit point and reflect the velocity.
      if (this.collide) {
        const stepLen = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz) * dt;
        if (stepLen > 1e-4) {
          const px = this.positions[pi], py = this.positions[pi + 1], pz = this.positions[pi + 2];
          const dx = (nvx * dt) / stepLen, dy = (nvy * dt) / stepLen, dz = (nvz * dt) / stepLen;
          const hit = this.collide(_colOrigin.set(px, py, pz), _colDir.set(dx, dy, dz), stepLen);
          if (hit !== null && hit < stepLen) {
            // Move to the hit point.
            this.positions[pi] = px + dx * hit;
            this.positions[pi + 1] = py + dy * hit;
            this.positions[pi + 2] = pz + dz * hit;
            // Reflect the velocity (bounce). The normal is approximated as -dir (the
            // surface normal is the reverse of the ray direction at the hit).
            const dot = nvx * dx + nvy * dy + nvz * dz;
            const b = this.bounce;
            this.velocities[vi] = (nvx - 2 * dot * dx) * b;
            this.velocities[vi + 1] = (nvy - 2 * dot * dy) * b;
            this.velocities[vi + 2] = (nvz - 2 * dot * dz) * b;
            // Skip the normal position integration (we already moved to the hit point).
            // (Gravity is already included in nvy and thus in the bounced velocity — do
            // NOT add it again here; the old extra `+= g * dt` gave bounced particles
            // double gravity and made them settle too fast.)
            // Age the particle.
            const age = this.velocities[vi + 3] + dt;
            this.velocities[vi + 3] = age;
            const lifetime = this.seeds[i * SEEDS_PER_PARTICLE + 1] || 1;
            this.lives[i] = Math.max(0, 1 - age / lifetime);
            if (this.lives[i] <= 0) { this.lives[i] = 0; continue; }
            alive++;
            continue;
          }
        }
      }
      this.positions[pi] += nvx * dt;
      this.positions[pi + 1] += nvy * dt;
      this.positions[pi + 2] += nvz * dt;
      // Age the particle: lives[i] starts at 1 and decays to 0 over its lifetime.
      const age = this.velocities[vi + 3] + dt;
      this.velocities[vi + 3] = age;
      const lifetime = this.seeds[i * SEEDS_PER_PARTICLE + 1] || 1;
      this.lives[i] = Math.max(0, 1 - age / lifetime);
      if (this.lives[i] <= 0) {
        this.lives[i] = 0;
        continue;
      }
      alive++;
    }

    // Update draw range to cover the whole buffer; dead particles are kept at life=0
    // (cheap; avoids compaction). We only draw `max` verts and the frag discards dead
    // ones — but to save fill, we shrink the draw range to the highest alive index.
    let highest = 0;
    for (let i = this.max - 1; i >= 0; i--) {
      if (this.lives[i] > 0) { highest = i + 1; break; }
    }
    this.geo.setDrawRange(0, highest);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    // The per-particle seed (random flicker phase) is written in emitOne; without
    // flagging needsUpdate the GPU buffer never re-uploads after the initial zeros,
    // so every particle's `vSeed` reads 0 and the shader flicker is identical across
    // all particles (no per-particle variation).
    this.geo.attributes.aSeed.needsUpdate = true;

    // Auto-teardown: a non-loop emitter with no living particles is finished.
    if (!this.loop && this.elapsed >= this.duration && alive === 0) {
      this._dead = true;
    }
  }

  get finished(): boolean {
    return this._dead;
  }

  private emitOne(): void {
    // Ring-buffer slot reuse.
    let slot = this.cursor;
    let scanned = 0;
    while (this.lives[slot] > 0 && scanned < this.max) {
      slot = (slot + 1) % this.max;
      scanned++;
    }
    if (scanned >= this.max) {
      // All slots alive — overwrite the oldest (lowest remaining life).
      let minLife = Infinity;
      let minIdx = 0;
      for (let i = 0; i < this.max; i++) {
        if (this.lives[i] < minLife) { minLife = this.lives[i]; minIdx = i; }
      }
      slot = minIdx;
    }
    this.cursor = (slot + 1) % this.max;

    const p = this.preset;
    const pi = slot * ATTRS_PER_PARTICLE;
    const vi = slot * VELS_PER_PARTICLE;
    const si = slot * SEEDS_PER_PARTICLE;

    // Spawn within a small radius around the emitter origin.
    const r = Math.random() * 0.15;
    const theta = Math.random() * Math.PI * 2;
    this.positions[pi] = Math.cos(theta) * r;
    this.positions[pi + 1] = 0;
    this.positions[pi + 2] = Math.sin(theta) * r;

    // Direction: localUp + spread cone.
    const speed = THREE.MathUtils.lerp(p.speed[0], p.speed[1], Math.random());
    const spread = p.spread;
    const dir = _dir
      .copy(this.localUp)
      .add(_rnd.set((Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 2 * spread))
      .normalize();
    this.velocities[vi] = dir.x * speed;
    this.velocities[vi + 1] = dir.y * speed + p.upBias * 0.5;
    this.velocities[vi + 2] = dir.z * speed;
    const lifetime = THREE.MathUtils.lerp(p.lifetime[0], p.lifetime[1], Math.random());
    this.velocities[vi + 3] = 0;
    this.lives[slot] = 1;
    this.sizes[slot] = THREE.MathUtils.lerp(p.size[0], p.size[1], Math.random()) * p.spriteScale * 10;
    this.seeds[si] = Math.random();
    this.seeds[si + 1] = lifetime;
  }

  /** Floating-origin shift: move the emitter root Object3D (handled generically too). */
  shiftOrigin(offset: THREE.Vector3): void {
    this.points.position.sub(offset);
  }

  dispose(): void {
    this._dead = true;
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    // material.dispose() does NOT dispose textures — free the GPU texture loaded for
    // textured presets (aura_*, beam_fire, impact_red, smoke_stylized, spark_glint)
    // so repeated effect triggers don't leak one texture each.
    const tex = this.mat.uniforms.uTexture.value;
    if (tex && (tex as THREE.Texture).isTexture) (tex as THREE.Texture).dispose();
  }
}

const _dir = new THREE.Vector3();
const _rnd = new THREE.Vector3();
const _colOrigin = new THREE.Vector3();
const _colDir = new THREE.Vector3();
