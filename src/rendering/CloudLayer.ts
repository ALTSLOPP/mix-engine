import * as THREE from 'three';

/**
 * CloudLayer.ts — true raymarched VOLUMETRIC clouds for open-world skies. A camera-following sky
 * dome (BackSide sphere, inside the camera far plane) runs a per-fragment raymarch through a
 * horizontal cloud SLAB sampled from animated 3D value-noise: density accumulates along the view
 * ray, with a short secondary march toward the sun for self-shadowing, tinted by the day/night sun
 * colour. Transparent + depthWrite off + depthTest on, so the sky shows through gaps and terrain/
 * mountains correctly occlude the clouds.
 *
 * The dome radius doesn't set the cloud distance — the shader intersects the slab at true world
 * heights, so clouds sit at their real altitude with correct parallax regardless of dome size.
 */
export interface CloudOptions {
  enabled?: boolean;
  coverage?: number;      // 0 clear → 1 overcast
  density?: number;       // optical thickness multiplier
  speed?: number;         // wind speed (world units/sec)
  scale?: number;         // noise feature size (smaller = bigger puffs)
  heightBottom?: number;
  heightTop?: number;
  color?: THREE.ColorRepresentation;
}

const vertexShader = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */`
  precision highp float;
  #define STEPS 20
  #define LIGHT_STEPS 4
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uCoverage;
  uniform float uDensity;
  uniform float uScale;
  uniform vec2  uWind;
  uniform float uHeightBottom;
  uniform float uHeightTop;
  uniform vec3  uCloudColor;
  uniform vec3  uSunDir;
  uniform vec3  uSunColor;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }
    return s;
  }
  float cloudDensity(vec3 p) {
    vec3 q = p * uScale + vec3(uWind.x, 0.0, uWind.y) * uTime;
    float base = fbm(q);
    float hT = clamp((p.y - uHeightBottom) / max(uHeightTop - uHeightBottom, 1.0), 0.0, 1.0);
    float shape = smoothstep(0.0, 0.25, hT) * smoothstep(1.0, 0.6, hT); // puffy bottoms/tops
    // Soft coverage edge (smoothstep, not a hard cutoff) so clouds have feathered boundaries.
    float cov = smoothstep(0.0, 0.28, base - (1.0 - uCoverage));
    return cov * shape;
  }
  float lightMarch(vec3 p) {
    float st = (uHeightTop - uHeightBottom) * 0.16;
    vec3 ld = normalize(uSunDir);
    float sum = 0.0;
    for (int i = 1; i <= LIGHT_STEPS; i++) sum += cloudDensity(p + ld * st * float(i));
    return sum * uDensity * st;
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPos - cameraPosition);
    if (rd.y <= 0.02) discard;                          // clouds only above the horizon
    float tB = (uHeightBottom - ro.y) / rd.y;
    float tT = (uHeightTop - ro.y) / rd.y;
    float t0 = max(min(tB, tT), 0.0);
    float t1 = max(tB, tT);
    if (t1 <= t0) discard;
    t1 = min(t1, t0 + 6000.0);                          // cap march length near the horizon
    float dt = (t1 - t0) / float(STEPS);

    float transmittance = 1.0;
    vec3 scatter = vec3(0.0);
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd * (t0 + dt * float(i));
      float d = cloudDensity(p) * uDensity;
      if (d > 0.01) {
        float light = exp(-lightMarch(p));             // 1 lit → 0 shadowed
        vec3 col = uCloudColor * mix(0.35, 1.0, light) * uSunColor;
        float a = 1.0 - exp(-d * dt);
        scatter += transmittance * a * col;
        transmittance *= 1.0 - a;
      }
      if (transmittance < 0.02) break;
    }
    float alpha = 1.0 - transmittance;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(scatter, alpha);
  }
`;

export class CloudLayer {
  enabled = false;
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private time = 0;
  private speed = 12;
  private readonly _sun = new THREE.Vector3(0, 1, 0);

  constructor(private readonly scene: THREE.Scene, radius = 4500, opts: CloudOptions = {}) {
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
        uCoverage: { value: opts.coverage ?? 0.5 },
        uDensity: { value: opts.density ?? 1.2 },
        uScale: { value: opts.scale ?? 0.0016 },
        uWind: { value: new THREE.Vector2(1, 0.4) },
        uHeightBottom: { value: opts.heightBottom ?? 320 },
        uHeightTop: { value: opts.heightTop ?? 620 },
        uCloudColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xffffff) },
      },
    });
    this.speed = opts.speed ?? 12;

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;            // after opaque + (typically) water
    this.mesh.visible = false;
    this.mesh.userData.excludeFromOriginShift = true; // re-centred on the camera each frame
    this.scene.add(this.mesh);

    if (opts.enabled) this.setEnabled(true);
  }

  setEnabled(on: boolean): void { this.enabled = on; this.mesh.visible = on; }

  /** Set the cloud drift direction (XZ) — driven by the global WindSystem so clouds move with wind. */
  setWind(x: number, z: number): void {
    const len = Math.hypot(x, z) || 1;
    this.material.uniforms.uWind.value.set(x / len, z / len);
  }

  setParams(opts: CloudOptions): void {
    const u = this.material.uniforms;
    if (opts.coverage !== undefined) u.uCoverage.value = THREE.MathUtils.clamp(opts.coverage, 0, 1);
    if (opts.density !== undefined) u.uDensity.value = opts.density;
    if (opts.scale !== undefined) u.uScale.value = opts.scale;
    if (opts.speed !== undefined) this.speed = opts.speed;
    if (opts.heightBottom !== undefined) u.uHeightBottom.value = opts.heightBottom;
    if (opts.heightTop !== undefined) u.uHeightTop.value = opts.heightTop;
    if (opts.color !== undefined) u.uCloudColor.value.set(opts.color);
    if (opts.enabled !== undefined) this.setEnabled(opts.enabled);
  }

  /** Per-frame: advance wind, follow the camera, and take the live sun direction + colour. */
  update(dt: number, cameraPos: THREE.Vector3, sunDir: THREE.Vector3, sunColor: THREE.Color): void {
    if (!this.enabled) return;
    this.time += dt;
    this.material.uniforms.uTime.value = this.time * this.speed;
    this.mesh.position.copy(cameraPos);
    this.material.uniforms.uSunDir.value.copy(this._sun.copy(sunDir).normalize());
    this.material.uniforms.uSunColor.value.copy(sunColor);
  }

  info(): object {
    const u = this.material.uniforms;
    return {
      enabled: this.enabled, coverage: u.uCoverage.value, density: u.uDensity.value,
      speed: this.speed, heightBottom: u.uHeightBottom.value, heightTop: u.uHeightTop.value,
    };
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
