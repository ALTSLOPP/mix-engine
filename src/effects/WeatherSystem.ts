import * as THREE from 'three';

/**
 * WeatherSystem.ts — global atmospheric effects (rain, snow, fog haze).
 * Implementation: a single `THREE.Points` cloud that follows the camera and
 * always re-spawns particles above the camera. Cheap, one draw call, no
 * per-particle allocation per frame.
 *
 * Usage:
 *   const weather = new WeatherSystem(scene);
 *   weather.set('rain', { intensity: 0.7 });
 *   weather.set('clear');
 *
 * Public presets: 'rain', 'snow', 'haze', 'ash', 'clear'.
 */

export type WeatherKind = 'rain' | 'snow' | 'haze' | 'ash' | 'clear';

export interface WeatherPreset {
  rate: number;            // particles per second
  size: [number, number];
  speed: [number, number];
  lifetime: [number, number];
  gravity: number;
  color: THREE.Color;
  opacity: number;
  additive: boolean;
  spread: number;          // spawn radius around the camera
  height: number;          // spawn height above the camera
  tumble?: number;         // extra lateral noise (snow, ash)
}

const PRESETS: Record<WeatherKind, WeatherPreset> = {
  clear: {
    rate: 0, size: [0.01, 0.01], speed: [0, 0], lifetime: [0, 0], gravity: 0,
    color: new THREE.Color(0xffffff), opacity: 0, additive: false, spread: 0, height: 0,
  },
  rain: {
    rate: 600, size: [0.02, 0.05], speed: [22, 28], lifetime: [0.6, 1.0], gravity: 0,
    color: new THREE.Color('#9fb6c8'), opacity: 0.55, additive: false, spread: 28, height: 18,
  },
  snow: {
    rate: 200, size: [0.05, 0.18], speed: [0.6, 1.6], lifetime: [3, 5], gravity: -1.6,
    color: new THREE.Color('#f3f7fb'), opacity: 0.9, additive: false, spread: 28, height: 18,
    tumble: 0.6,
  },
  haze: {
    rate: 60, size: [1.2, 2.6], speed: [0.2, 0.4], lifetime: [4, 7], gravity: 0,
    color: new THREE.Color('#cad4dc'), opacity: 0.12, additive: false, spread: 30, height: 6,
  },
  ash: {
    rate: 90, size: [0.04, 0.1], speed: [0.3, 0.9], lifetime: [4, 7], gravity: -0.4,
    color: new THREE.Color('#c7c0b6'), opacity: 0.85, additive: true, spread: 28, height: 18,
    tumble: 0.9,
  },
};

interface WeatherRuntime {
  preset: WeatherPreset;
  intensity: number; // 0..1 multiplier on rate
}

const VERT = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  varying float vLife;
  uniform float uPxRatio;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPxRatio * (300.0 / -mv.z);
  }
`;
const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vLife;
  void main() {
    if (vLife <= 0.0) discard;
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;
    float falloff = 1.0 - r2;
    falloff = pow(falloff, 1.4);
    gl_FragColor = vec4(uColor, falloff * uOpacity * vLife);
  }
`;

export class WeatherSystem {
  readonly points: THREE.Points;
  private readonly scene: THREE.Scene;
  private readonly positions: Float32Array;
  private readonly lives: Float32Array;
  private readonly sizes: Float32Array;
  private readonly seeds: Float32Array;
  /** Per-particle age (seconds since emit). Kept separate from `seeds` so `seeds[si+1]`
   *  can be a fixed per-particle z-tumble random — reusing it for age made snow/ash
   *  accelerate sideways as they aged. */
  private readonly ages: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly max = 1500;
  private cursor = 0;
  private emitAcc = 0;
  private runtime: WeatherRuntime = { preset: PRESETS.clear, intensity: 0 };
  private _current: WeatherKind = 'clear';

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.positions = new Float32Array(this.max * 3);
    this.lives = new Float32Array(this.max);
    this.sizes = new Float32Array(this.max);
    this.seeds = new Float32Array(this.max * 2);
    this.ages = new Float32Array(this.max);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 2));
    this.geo.setDrawRange(0, 0);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 0 },
        uPxRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /**
   * Switch the active weather. `intensity` is a 0..1 multiplier on the rate
   * so you can fade in / out smoothly (call set with intensity=0.1, 0.3, 0.7, 1).
   */
  set(kind: WeatherKind, opts: { intensity?: number } = {}): void {
    this._current = kind;
    const preset = PRESETS[kind] ?? PRESETS.clear;
    this.runtime = { preset, intensity: THREE.MathUtils.clamp(opts.intensity ?? 1, 0, 1) };
    this.mat.uniforms.uColor.value = preset.color.clone();
    this.mat.uniforms.uOpacity.value = preset.opacity;
  }

  setIntensity(v: number): void {
    this.runtime.intensity = THREE.MathUtils.clamp(v, 0, 1);
  }

  /** Tick: emit, integrate, and re-anchor the cloud to the camera each frame. */
  update(dt: number, camera: THREE.Camera): void {
    const p = this.runtime.preset;
    const rate = p.rate * this.runtime.intensity;
    this.emitAcc += rate * dt;
    while (this.emitAcc >= 1 && rate > 0) {
      this.emit(camera);
      this.emitAcc -= 1;
    }

    // Integrate
    let highest = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.lives[i] <= 0) continue;
      const pi = i * 3;
      const si = i * 2;
      this.positions[pi + 1] -= p.speed[0] * dt;
      this.positions[pi + 0] += this.seeds[si] * (p.tumble ?? 0) * dt;
      this.positions[pi + 2] += this.seeds[si + 1] * (p.tumble ?? 0) * dt;
      // Gravity (negative = pulls up; positive = pulls down).
      this.positions[pi + 1] += p.gravity * dt;
      // Age
      // Use the dedicated ages array (seeds[si+1] is now a fixed z-tumble random).
      this.ages[i] = (this.ages[i] + dt) % 99;
      const lifetime = p.lifetime[0] + (p.lifetime[1] - p.lifetime[0]) * 0.5;
      this.lives[i] = Math.max(0, 1 - this.ages[i] / lifetime);
      if (i + 1 > highest) highest = i + 1;
    }
    this.geo.setDrawRange(0, highest);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
  }

  private emit(camera: THREE.Camera): void {
    if (this.runtime.preset.rate <= 0) return;
    let slot = this.cursor;
    let scanned = 0;
    while (this.lives[slot] > 0 && scanned < this.max) {
      slot = (slot + 1) % this.max;
      scanned++;
    }
    this.cursor = (slot + 1) % this.max;
    const p = this.runtime.preset;
    const cam = camera.position;
    const r = p.spread;
    const pi = slot * 3;
    this.positions[pi]     = cam.x + (Math.random() - 0.5) * r;
    this.positions[pi + 1] = cam.y + p.height + (Math.random() - 0.5) * 2;
    this.positions[pi + 2] = cam.z + (Math.random() - 0.5) * r;
    this.lives[slot] = 1;
    this.sizes[slot] = p.size[0] + Math.random() * (p.size[1] - p.size[0]);
    const si = slot * 2;
    this.seeds[si] = (Math.random() - 0.5) * 2;
    this.seeds[si + 1] = (Math.random() - 0.5) * 2; // fixed per-particle z-tumble
    this.ages[slot] = 0; // age counter (separate from the tumble random)
  }

  get current(): WeatherKind { return this._current; }
  get intensity(): number { return this.runtime.intensity; }

  dispose(): void {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
