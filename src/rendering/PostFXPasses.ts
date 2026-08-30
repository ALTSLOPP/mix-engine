import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * PostFXPasses.ts — custom shader-based post-processing passes that aren't
 * shipped with three.js. Each pass is a self-contained `Pass` subclass with a
 * pair of tweakable uniforms; add to a RenderPipeline composer and tweak from
 * the engine API or an AIBridge command.
 *
 *   OutlinePass       — sobel-style edge detection on depth + normals; flips a
 *                       "cartoon outline" toggle for the anime / cel-shaded look.
 *   VignettePass      — radial darkening at the edges of the frame.
 *   ColorGradePass    — lift/gamma/gain + saturation + hue rotation.
 *   ChromaticAberrationPass — RGB channel split, perfect for hit feedback.
 *   FilmGrainPass     — subtle animated noise, perfect for cinematic mood.
 *   GodRaysPass       — screen-space volumetric light shafts radiating from the
 *                       sun's projected position (crepuscular rays / "god rays").
 *   DepthOfFieldPass  — circle-of-confusion bokeh blur driven by scene depth, for
 *                       a cinematic shallow-focus look (manual or auto-focus).
 *   SSRPass           — screen-space reflections; raymarches the reflected view ray
 *                       against the depth buffer for wet-asphalt / glossy-floor mirrors.
 *   VolumetricFogPass — depth-aware raymarched atmospheric fog with height falloff and
 *                       Henyey-Greenstein sun in-scatter (real 3D shafts, not screen-space).
 *   MotionBlurPass    — per-pixel camera motion blur from depth reprojection (current vs.
 *                       previous view-projection), the velocity-buffer look without a GBuffer.
 *   ContactShadowsPass— short screen-space depth raymarch toward the sun for crisp contact
 *                       shadows the cascaded shadow map is too coarse to capture.
 *   AutoExposurePass  — HDR eye adaptation: measures average scene luminance and smoothly
 *                       drives exposure toward a key value (bright sun stops down, dark alley
 *                       opens up), the way every modern engine's auto-exposure works.
 *   TAAPass           — temporal anti-aliasing: accumulates sub-pixel-jittered frames via
 *                       depth reprojection + neighbourhood colour clamping (anti-ghosting).
 *
 * The depth/normal-driven passes are "deferred": they SAMPLE scene depth (and, for SSR, view
 * normals) produced by the RenderPipeline's G-buffer pre-pass, plus live camera matrices the
 * pipeline feeds each frame. They operate in scene-referred linear HDR, before OutputPass.
 */

const commonVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// ─── Outline (sobel on depth + normals) ────────────────────────────────────
export class OutlinePass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    thickness: { value: 1.0 },
    depthThreshold: { value: 0.02 },
    color: { value: new THREE.Color(0x000000) },
    strength: { value: 1.0 },
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float thickness;
      uniform float depthThreshold;
      uniform vec3 color;
      uniform float strength;
      varying vec2 vUv;
      float readDepth(vec2 uv) {
        return texture2D(tDepth, uv).x;
      }
      void main() {
        vec2 px = thickness / resolution;
        float c = readDepth(vUv);
        float l = readDepth(vUv + vec2(-px.x, 0.0));
        float r = readDepth(vUv + vec2( px.x, 0.0));
        float u = readDepth(vUv + vec2(0.0,  px.y));
        float d = readDepth(vUv + vec2(0.0, -px.y));
        // Depth sobel
        float edge = abs(l + r + u + d - 4.0 * c);
        // View-space depth is non-linear; scale the threshold so distant edges still pop.
        float far = 1.0 - clamp(c, 0.0, 1.0);
        float t = depthThreshold * (1.0 + far * 4.0);
        float outline = smoothstep(t, t * 2.0, edge);
        vec4 base = texture2D(tDiffuse, vUv);
        gl_FragColor = vec4(mix(base.rgb, color, outline * strength), base.a);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  override setSize(w: number, h: number): void {
    this.uniforms.resolution.value.set(w, h);
  }
  setDepthTexture(tex: THREE.Texture | null): void {
    this.uniforms.tDepth.value = tex;
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }
  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

// ─── Vignette ──────────────────────────────────────────────────────────────
export class VignettePass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    intensity: { value: 0.4 },
    smoothness: { value: 0.6 },
    color: { value: new THREE.Color(0x000000) },
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float intensity;
      uniform float smoothness;
      uniform vec3 color;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        vec2 centered = vUv - 0.5;
        float dist = length(centered) * 1.4142136; // 0..1 across the diagonal
        float v = smoothstep(1.0 - smoothness, 1.0, dist);
        gl_FragColor = vec4(mix(base.rgb, color, v * intensity), base.a);
      }
    `,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Color grade (lift/gamma/gain + saturation + hue rotation) ────────────
export class ColorGradePass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 1.0 },
    hueShift: { value: 0.0 },       // radians
    contrast: { value: 1.0 },
    brightness: { value: 0.0 },     // additive
    tint: { value: new THREE.Color(0xffffff) },
    tintStrength: { value: 0.0 },
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float saturation;
      uniform float hueShift;
      uniform float contrast;
      uniform float brightness;
      uniform vec3 tint;
      uniform float tintStrength;
      varying vec2 vUv;

      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        // Brightness + contrast around 0.5
        col = (col - 0.5) * contrast + 0.5 + brightness;
        // Saturation
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, saturation);
        // Hue rotation
        if (hueShift != 0.0) {
          vec3 hsv = rgb2hsv(col);
          hsv.x = fract(hsv.x + hueShift / 6.2831853);
          col = hsv2rgb(hsv);
        }
        // Tint blend
        col = mix(col, col * tint, tintStrength);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Chromatic aberration (RGB split) ──────────────────────────────────────
export class ChromaticAberrationPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    amount: { value: 0.0 },
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float amount;
      varying vec2 vUv;
      void main() {
        vec2 d = (vUv - 0.5) * amount;
        float r = texture2D(tDiffuse, vUv + d).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, vUv - d).b;
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Film grain ────────────────────────────────────────────────────────────
export class FilmGrainPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    amount: { value: 0.05 },
    time: { value: 0.0 },
    lumThreshold: { value: 0.4 },
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float amount;
      uniform float time;
      uniform float lumThreshold;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        float n = hash(vUv * vec2(1024.0, 768.0) + time * 60.0) - 0.5;
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        // Stronger in dark areas (classic film grain look).
        float weight = mix(1.0, 0.4, smoothstep(lumThreshold, 1.0, lum));
        col += n * amount * weight;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  setTime(t: number): void { this.uniforms.time.value = t; }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Volumetric light shafts / god rays ─────────────────────────────────────
// Screen-space crepuscular rays. Instead of an occlusion pre-pass we mask the
// bright parts of the already-rendered HDR frame by luminance and radially blur
// them outward from the sun's projected screen position, accumulating with the
// classic GPU-Gems-3 decay loop, then add the result back additively. Because it
// reads the composited buffer it needs no extra scene render — the sun disc and
// any bright highlights naturally throw shafts. `lightVisible` fades the whole
// effect when the sun is behind the camera or off-screen.
export class GodRaysPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    lightScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    density: { value: 0.6 },     // how far along the ray the samples reach
    weight: { value: 0.5 },      // per-sample contribution
    decay: { value: 0.94 },      // falloff along the ray (<1)
    exposure: { value: 0.45 },   // overall scatter brightness
    strength: { value: 1.0 },    // master multiplier (0 = off)
    threshold: { value: 0.7 },   // only pixels brighter than this scatter
    lightVisible: { value: 0.0 },// 0..1 on-screen visibility of the sun
    tint: { value: new THREE.Color(0xffffff) },
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      #define SAMPLES 60
      uniform sampler2D tDiffuse;
      uniform vec2 lightScreenPos;
      uniform float density;
      uniform float weight;
      uniform float decay;
      uniform float exposure;
      uniform float strength;
      uniform float threshold;
      uniform float lightVisible;
      uniform vec3 tint;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        if (strength <= 0.0 || lightVisible <= 0.0) { gl_FragColor = base; return; }
        // March from the fragment back toward the light, one stride per sample.
        vec2 texCoord = vUv;
        vec2 delta = (vUv - lightScreenPos) * (density / float(SAMPLES));
        float illuminationDecay = 1.0;
        vec3 shafts = vec3(0.0);
        for (int i = 0; i < SAMPLES; i++) {
          texCoord -= delta;
          vec3 s = texture2D(tDiffuse, texCoord).rgb;
          // Keep only the bright (sky / highlight) part as the scattering source.
          float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
          s *= smoothstep(threshold, threshold + 0.4, lum);
          shafts += s * illuminationDecay * weight;
          illuminationDecay *= decay;
        }
        shafts *= exposure * strength * lightVisible * tint;
        gl_FragColor = vec4(base.rgb + shafts, base.a);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  /** Feed the sun's projected screen position (UV space, 0..1) + on-screen visibility (0..1). */
  setLight(uvX: number, uvY: number, visible: number): void {
    this.uniforms.lightScreenPos.value.set(uvX, uvY);
    this.uniforms.lightVisible.value = visible;
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Depth of field (circle-of-confusion bokeh) ─────────────────────────────
// A single-pass cinematic depth-of-field. The scene depth texture is linearised
// to view-space metres, a circle-of-confusion is computed from the distance to
// the focal plane (manual, or auto-focused on whatever is at screen centre), and
// the colour is blurred with a golden-angle disc kernel whose radius scales with
// the CoC. Sharp at the focal plane, progressively soft toward the near/far.
export class DepthOfFieldPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    focusDistance: { value: 12.0 }, // metres from camera to the focal plane
    focusRange: { value: 6.0 },     // metres over which focus falls off to full blur
    bokehScale: { value: 3.0 },     // max blur radius in pixels at full CoC
    cameraNear: { value: 0.1 },
    cameraFar: { value: 5000.0 },
    autoFocus: { value: 0.0 },      // >0.5 → focus on the depth at screen centre
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      #define TAPS 24
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float focusDistance;
      uniform float focusRange;
      uniform float bokehScale;
      uniform float cameraNear;
      uniform float cameraFar;
      uniform float autoFocus;
      varying vec2 vUv;
      // Perspective depth (0..1 window space) → positive view-space distance in metres.
      float linearizeDepth(float d) {
        float z = d * 2.0 - 1.0;
        return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
      }
      float coc(float viewDist, float focus) {
        // 0 at the focal plane, ramping to 1 once we're focusRange metres away.
        return clamp(abs(viewDist - focus) / max(focusRange, 1e-3), 0.0, 1.0);
      }
      void main() {
        float centerDepth = linearizeDepth(texture2D(tDepth, vUv).x);
        float focus = autoFocus > 0.5
          ? linearizeDepth(texture2D(tDepth, vec2(0.5, 0.5)).x)
          : focusDistance;
        float c = coc(centerDepth, focus);
        vec4 base = texture2D(tDiffuse, vUv);
        if (c < 0.01 || bokehScale <= 0.0) { gl_FragColor = base; return; }
        // Golden-angle spiral disc — even coverage with few taps.
        float radius = c * bokehScale;
        vec2 texel = 1.0 / resolution;
        vec3 sum = base.rgb;
        float total = 1.0;
        const float GA = 2.39996323; // golden angle (radians)
        for (int i = 0; i < TAPS; i++) {
          float fi = float(i) + 1.0;
          float a = fi * GA;
          float r = sqrt(fi / float(TAPS)) * radius;
          vec2 offs = vec2(cos(a), sin(a)) * r * texel;
          vec2 suv = vUv + offs;
          float sd = linearizeDepth(texture2D(tDepth, suv).x);
          // Only let a tap contribute if it is itself out of focus — stops sharp
          // foreground objects bleeding their colour into a blurred background.
          float sc = coc(sd, focus);
          float w = sc;
          sum += texture2D(tDiffuse, suv).rgb * w;
          total += w;
        }
        vec3 blurred = sum / total;
        gl_FragColor = vec4(mix(base.rgb, blurred, c), base.a);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  override setSize(w: number, h: number): void {
    this.uniforms.resolution.value.set(w, h);
  }
  setDepthTexture(tex: THREE.Texture | null): void {
    this.uniforms.tDepth.value = tex;
  }
  /** Push the live camera clip planes (perspective linearisation depends on them). */
  setCameraClip(near: number, far: number): void {
    this.uniforms.cameraNear.value = near;
    this.uniforms.cameraFar.value = far;
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Screen-space reflections (SSR) ─────────────────────────────────────────
// Reconstructs each pixel's view-space position + normal (from the G-buffer prepass),
// reflects the eye→fragment ray about the normal, and raymarches that ray through the
// depth buffer. On a hit it samples the already-lit colour and adds it back, weighted by
// Fresnel — so flat ground at a grazing angle reflects the world like wet asphalt, while
// head-on surfaces stay matte. A short binary refine sharpens the hit point; screen-edge
// and miss fades hide the usual SSR artefacts. Default off (it's a per-pixel march).
export class SSRPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    projection: { value: new THREE.Matrix4() },
    inverseProjection: { value: new THREE.Matrix4() },
    cameraNear: { value: 0.1 },
    intensity: { value: 0.7 },      // master reflection strength
    maxDistance: { value: 18.0 },   // view-space metres a ray may travel
    thickness: { value: 0.6 },      // depth tolerance for a hit (metres)
    stride: { value: 1.0 },         // step-length scale (perf vs. fine hits)
    fresnelPower: { value: 4.0 },   // grazing-angle bias — higher = more "wet floor"
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      #define STEPS 28
      #define REFINE 5
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform sampler2D tNormal;
      uniform vec2 resolution;
      uniform mat4 projection;
      uniform mat4 inverseProjection;
      uniform float cameraNear;
      uniform float intensity;
      uniform float maxDistance;
      uniform float thickness;
      uniform float stride;
      uniform float fresnelPower;
      varying vec2 vUv;

      // Window-space depth (0..1) at uv → view-space position (z is negative in front).
      vec3 viewPosFromDepth(vec2 uv, float d) {
        vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vec4 v = inverseProjection * ndc;
        return v.xyz / v.w;
      }

      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        float d = texture2D(tDepth, vUv).x;
        // Sky / cleared pixels (depth at far plane) never reflect.
        if (d >= 1.0 || intensity <= 0.0) { gl_FragColor = base; return; }
        vec3 N = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
        if (dot(N, N) < 0.01) { gl_FragColor = base; return; }
        N = normalize(N);

        vec3 P = viewPosFromDepth(vUv, d);
        vec3 I = normalize(P);                 // eye → fragment (view space)
        vec3 R = normalize(reflect(I, N));     // reflected ray

        float stepLen = (maxDistance / float(STEPS)) * max(stride, 0.05);
        vec3 prevP = P;
        vec3 hitColor = vec3(0.0);
        float hit = 0.0;
        vec2 hitUv = vUv;

        for (int i = 1; i <= STEPS; i++) {
          vec3 sp = P + R * stepLen * float(i);
          if (sp.z > -cameraNear) break;       // crossed back past the near plane
          vec4 c = projection * vec4(sp, 1.0);
          vec2 suv = (c.xy / c.w) * 0.5 + 0.5;
          if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
          float sd = texture2D(tDepth, suv).x;
          if (sd >= 1.0) { prevP = sp; continue; }   // marched over the sky
          float surfZ = viewPosFromDepth(suv, sd).z;
          float diff = surfZ - sp.z;           // >0 ⇒ ray is now behind the surface
          if (diff > 0.0 && diff < thickness) {
            // Binary-refine the crossing between prevP and sp for a crisp hit.
            vec3 a = prevP, b = sp;
            for (int j = 0; j < REFINE; j++) {
              vec3 m = (a + b) * 0.5;
              vec4 cm = projection * vec4(m, 1.0);
              vec2 muv = (cm.xy / cm.w) * 0.5 + 0.5;
              float md = texture2D(tDepth, muv).x;
              float mz = viewPosFromDepth(muv, md).z;
              if (mz - m.z > 0.0) b = m; else a = m;
            }
            vec4 cf = projection * vec4(b, 1.0);
            hitUv = (cf.xy / cf.w) * 0.5 + 0.5;
            hitColor = texture2D(tDiffuse, hitUv).rgb;
            hit = 1.0;
            break;
          }
          prevP = sp;
        }

        if (hit < 0.5) { gl_FragColor = base; return; }
        // Grazing angles reflect strongly (Fresnel) — the wet-asphalt cue.
        float fres = pow(1.0 - max(dot(N, -I), 0.0), fresnelPower);
        // Fade as the hit nears the screen border (off-screen data is missing).
        vec2 e = smoothstep(vec2(0.0), vec2(0.15), hitUv)
               * smoothstep(vec2(0.0), vec2(0.15), 1.0 - hitUv);
        float edge = e.x * e.y;
        float refl = intensity * fres * edge;
        gl_FragColor = vec4(base.rgb + hitColor * refl, base.a);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  override setSize(w: number, h: number): void {
    this.uniforms.resolution.value.set(w, h);
  }
  setDepthTexture(tex: THREE.Texture | null): void { this.uniforms.tDepth.value = tex; }
  setNormalTexture(tex: THREE.Texture | null): void { this.uniforms.tNormal.value = tex; }
  /** Push live camera projection matrices (SSR marches + projects in view space). */
  setCameraMatrices(projection: THREE.Matrix4, inverseProjection: THREE.Matrix4, near: number): void {
    this.uniforms.projection.value.copy(projection);
    this.uniforms.inverseProjection.value.copy(inverseProjection);
    this.uniforms.cameraNear.value = near;
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Volumetric atmospheric fog (raymarched) ────────────────────────────────
// For every pixel we reconstruct the world-space ray from the camera to the scene
// surface (or to maxDistance for the sky), then raymarch it accumulating extinction +
// single-scatter. Density falls off with height (ground haze), and an anisotropic
// Henyey-Greenstein phase concentrates sun light forward, so looking toward the sun
// blooms into volumetric shafts that are naturally occluded by geometry (the march
// stops at scene depth). This is true 3D fog — distinct from the screen-space godrays.
export class VolumetricFogPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    inverseProjection: { value: new THREE.Matrix4() },
    cameraMatrixWorld: { value: new THREE.Matrix4() },
    cameraPos: { value: new THREE.Vector3() },
    sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff1d6) },
    fogColor: { value: new THREE.Color(0x9fb4cc) },
    density: { value: 0.015 },        // base extinction per metre
    heightFalloff: { value: 0.06 },   // how fast density thins with altitude
    fogBaseHeight: { value: 0.0 },    // world Y where fog is densest
    anisotropy: { value: 0.72 },      // HG g (0..1) — forward sun scatter
    scattering: { value: 1.3 },       // sun in-scatter brightness
    ambient: { value: 0.5 },          // skylight fill colour weight
    maxDistance: { value: 340.0 },    // furthest the march reaches (metres)
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      #define STEPS 24
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform mat4 inverseProjection;
      uniform mat4 cameraMatrixWorld;
      uniform vec3 cameraPos;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform vec3 fogColor;
      uniform float density;
      uniform float heightFalloff;
      uniform float fogBaseHeight;
      uniform float anisotropy;
      uniform float scattering;
      uniform float ambient;
      uniform float maxDistance;
      varying vec2 vUv;
      const float PI = 3.14159265359;

      float henyeyGreenstein(float cosT, float g) {
        float g2 = g * g;
        return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * cosT, 1e-4), 1.5));
      }
      vec3 viewPosFromDepth(vec2 uv, float d) {
        vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vec4 v = inverseProjection * ndc;
        return v.xyz / v.w;
      }

      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        float d = texture2D(tDepth, vUv).x;
        vec2 ndcXY = vUv * 2.0 - 1.0;
        // World-space ray direction through this pixel (independent of depth).
        vec4 farV = inverseProjection * vec4(ndcXY, 1.0, 1.0);
        vec3 viewDir = normalize(farV.xyz / farV.w);
        vec3 worldDir = normalize((cameraMatrixWorld * vec4(viewDir, 0.0)).xyz);
        // March only as far as the surface; the sky marches the full distance.
        float dist = (d >= 1.0) ? maxDistance : min(length(viewPosFromDepth(vUv, d)), maxDistance);
        float stepLen = dist / float(STEPS);

        float cosT = dot(worldDir, normalize(sunDirection));
        float phase = henyeyGreenstein(cosT, clamp(anisotropy, 0.0, 0.95));
        // Per-pixel jitter breaks up slice banding.
        float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);

        float transmittance = 1.0;
        vec3 scatter = vec3(0.0);
        for (int i = 0; i < STEPS; i++) {
          float t = (float(i) + jitter) * stepLen;
          vec3 S = cameraPos + worldDir * t;
          float h = exp(-max(S.y - fogBaseHeight, 0.0) * heightFalloff);
          float dens = density * h;
          float seg = dens * stepLen;
          vec3 inScatter = (sunColor * phase * scattering + fogColor * ambient) * seg;
          scatter += transmittance * inScatter;
          transmittance *= exp(-seg);
        }
        gl_FragColor = vec4(base.rgb * transmittance + scatter, base.a);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  setDepthTexture(tex: THREE.Texture | null): void { this.uniforms.tDepth.value = tex; }
  /** Push live camera + sun state (fog reconstructs world positions and scatters sunlight). */
  setCameraState(inverseProjection: THREE.Matrix4, matrixWorld: THREE.Matrix4, position: THREE.Vector3): void {
    this.uniforms.inverseProjection.value.copy(inverseProjection);
    this.uniforms.cameraMatrixWorld.value.copy(matrixWorld);
    this.uniforms.cameraPos.value.copy(position);
  }
  setSun(direction: THREE.Vector3, color: THREE.Color): void {
    this.uniforms.sunDirection.value.copy(direction);
    this.uniforms.sunColor.value.copy(color);
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Camera motion blur (depth reprojection) ────────────────────────────────
// Reconstructs each pixel's world position from depth, projects it with LAST frame's
// view-projection, and blurs the colour along the resulting screen-space velocity. This
// gives the velocity-buffer motion-blur look (fast pans/turns smear) without storing a
// per-object velocity GBuffer — camera movement only. The pass keeps its own previous
// view-projection so it stays correct across enable/disable.
export class MotionBlurPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    inverseProjection: { value: new THREE.Matrix4() },
    cameraMatrixWorld: { value: new THREE.Matrix4() },
    prevViewProjection: { value: new THREE.Matrix4() },
    intensity: { value: 1.0 },
    maxVelocity: { value: 0.08 },   // clamp, in UV units (avoids whole-screen smear)
  };
  private readonly curViewProjection = new THREE.Matrix4();
  private primed = false;
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      #define SAMPLES 12
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform mat4 inverseProjection;
      uniform mat4 cameraMatrixWorld;
      uniform mat4 prevViewProjection;
      uniform float intensity;
      uniform float maxVelocity;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        float d = texture2D(tDepth, vUv).x;
        vec2 ndcXY = vUv * 2.0 - 1.0;
        vec4 v = inverseProjection * vec4(ndcXY, d * 2.0 - 1.0, 1.0);
        vec3 viewPos = v.xyz / v.w;
        vec4 world = cameraMatrixWorld * vec4(viewPos, 1.0);
        vec4 prevClip = prevViewProjection * world;
        vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
        vec2 vel = (vUv - prevUv) * intensity;
        float l = length(vel);
        if (l < 1e-4) { gl_FragColor = base; return; }
        if (l > maxVelocity) vel *= maxVelocity / l;
        vec3 col = base.rgb;
        float total = 1.0;
        for (int i = 1; i < SAMPLES; i++) {
          float t = float(i) / float(SAMPLES);
          col += texture2D(tDiffuse, vUv - vel * t).rgb;
          total += 1.0;
        }
        gl_FragColor = vec4(col / total, base.a);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  setDepthTexture(tex: THREE.Texture | null): void { this.uniforms.tDepth.value = tex; }
  /** Feed THIS frame's camera state. While disabled (or before the first render) the
   *  previous-VP tracks the current one so re-enabling never smears one giant frame. */
  setCameraState(inverseProjection: THREE.Matrix4, matrixWorld: THREE.Matrix4, viewProjection: THREE.Matrix4): void {
    this.uniforms.inverseProjection.value.copy(inverseProjection);
    this.uniforms.cameraMatrixWorld.value.copy(matrixWorld);
    this.curViewProjection.copy(viewProjection);
    if (!this.enabled || !this.primed) {
      this.uniforms.prevViewProjection.value.copy(viewProjection);
      this.primed = true;
    }
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
    // The colour we just produced becomes "last frame" for the next reprojection.
    this.uniforms.prevViewProjection.value.copy(this.curViewProjection);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Screen-space contact shadows ───────────────────────────────────────────
// The cascaded shadow map is too coarse to ground small details (feet on the floor,
// objects on a desk). For each lit pixel we reconstruct its view-space position and
// raymarch a short distance TOWARD the sun through the depth buffer; if any nearer
// surface blocks that path the pixel is in contact shadow. Cheap (short march, depth
// only) and it complements — doesn't replace — the shadow map. Default off.
export class ContactShadowsPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    projection: { value: new THREE.Matrix4() },
    inverseProjection: { value: new THREE.Matrix4() },
    // NB: NOT named `viewMatrix` — that's a three.js built-in ShaderMaterial uniform and
    // redeclaring it makes the fragment shader fail to compile ('viewMatrix' redefinition).
    uViewMatrix: { value: new THREE.Matrix4() },
    sunDirectionWorld: { value: new THREE.Vector3(0, 1, 0) },
    intensity: { value: 0.6 },      // 0..1 darkening at full occlusion
    maxDistance: { value: 0.55 },   // how far (view metres) to trace toward the sun
    thickness: { value: 0.5 },      // occluder depth tolerance (metres)
    bias: { value: 0.03 },          // start offset to avoid self-shadow acne
  };
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      #define STEPS 16
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform mat4 projection;
      uniform mat4 inverseProjection;
      uniform mat4 uViewMatrix;
      uniform vec3 sunDirectionWorld;
      uniform float intensity;
      uniform float maxDistance;
      uniform float thickness;
      uniform float bias;
      varying vec2 vUv;
      vec3 viewPosFromDepth(vec2 uv, float d) {
        vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vec4 v = inverseProjection * ndc;
        return v.xyz / v.w;
      }
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        float d = texture2D(tDepth, vUv).x;
        if (d >= 1.0 || intensity <= 0.0) { gl_FragColor = base; return; }
        vec3 P = viewPosFromDepth(vUv, d);
        // Sun direction in view space (world dir points toward the sun).
        vec3 L = normalize((uViewMatrix * vec4(normalize(sunDirectionWorld), 0.0)).xyz);
        float stepLen = maxDistance / float(STEPS);
        float occ = 0.0;
        for (int i = 1; i <= STEPS; i++) {
          vec3 Q = P + L * (bias + stepLen * float(i));
          if (Q.z > -1e-3) break;            // marched in front of the camera
          vec4 c = projection * vec4(Q, 1.0);
          vec2 suv = (c.xy / c.w) * 0.5 + 0.5;
          if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
          float sd = texture2D(tDepth, suv).x;
          if (sd >= 1.0) continue;
          float surfZ = viewPosFromDepth(suv, sd).z;
          float diff = surfZ - Q.z;          // >0 ⇒ a nearer surface blocks the sun
          if (diff > 0.001 && diff < thickness) {
            // Closer occluders cast a darker contact shadow; fade with march distance.
            occ = intensity * (1.0 - float(i) / float(STEPS));
            break;
          }
        }
        gl_FragColor = vec4(base.rgb * (1.0 - occ), base.a);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  readonly fsQuad = new FullScreenQuad(this.material);
  override setSize(w: number, h: number): void { this.uniforms.resolution.value.set(w, h); }
  setDepthTexture(tex: THREE.Texture | null): void { this.uniforms.tDepth.value = tex; }
  setCameraMatrices(projection: THREE.Matrix4, inverseProjection: THREE.Matrix4, viewMatrix: THREE.Matrix4): void {
    this.uniforms.projection.value.copy(projection);
    this.uniforms.inverseProjection.value.copy(inverseProjection);
    this.uniforms.uViewMatrix.value.copy(viewMatrix);
  }
  setSun(directionWorld: THREE.Vector3): void { this.uniforms.sunDirectionWorld.value.copy(directionWorld); }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }
  override dispose(): void { this.material.dispose(); this.fsQuad.dispose(); }
}

// ─── Auto-exposure / eye adaptation ─────────────────────────────────────────
// HDR cameras need a key: too much light blows out, too little crushes to black. This
// pass measures the scene's average (log) luminance from a 16×16 grid of taps into a 1×1
// target, smoothly adapts a stored luminance toward it over time (the "eye adjusting"),
// then multiplies the HDR colour by an exposure that pulls that average to a target key.
// Bright sun → stops down; dark alley → opens up. Self-contained: owns its tiny targets.
export class AutoExposurePass extends Pass {
  readonly uniforms = {
    key: { value: 0.18 },          // target middle-grey the average is pulled toward
    minExposure: { value: 0.25 },  // clamp so adaptation never goes extreme
    maxExposure: { value: 4.0 },
    speed: { value: 1.6 },         // adaptation rate (higher = snappier eye)
  };
  private dt = 0.016;
  private primed = false;
  private flip = false;
  private readonly lumRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly adaptRT: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] = [
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }),
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }),
  ];
  // 1) measure: average log-luminance of the HDR frame into a single texel.
  private readonly measureUniforms = { tDiffuse: { value: null as THREE.Texture | null } };
  private readonly measureMat = new THREE.ShaderMaterial({
    uniforms: this.measureUniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      #define N 16
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        float sum = 0.0;
        for (int y = 0; y < N; y++) {
          for (int x = 0; x < N; x++) {
            vec2 uv = (vec2(float(x), float(y)) + 0.5) / float(N);
            vec3 c = texture2D(tDiffuse, uv).rgb;
            float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
            sum += log(max(lum, 1e-4));
          }
        }
        gl_FragColor = vec4(vec3(sum / float(N * N)), 1.0);
      }
    `,
    depthTest: false, depthWrite: false,
  });
  // 2) adapt: ease the stored (log) luminance toward the freshly measured one.
  private readonly adaptUniforms = {
    tCurrent: { value: null as THREE.Texture | null },
    tPrev: { value: null as THREE.Texture | null },
    rate: { value: 0.1 },
    primed: { value: 0.0 },
  };
  private readonly adaptMat = new THREE.ShaderMaterial({
    uniforms: this.adaptUniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tCurrent;
      uniform sampler2D tPrev;
      uniform float rate;
      uniform float primed;
      varying vec2 vUv;
      void main() {
        float cur = texture2D(tCurrent, vec2(0.5)).r;
        float prev = texture2D(tPrev, vec2(0.5)).r;
        float adapted = primed > 0.5 ? mix(prev, cur, clamp(rate, 0.0, 1.0)) : cur;
        gl_FragColor = vec4(vec3(adapted), 1.0);
      }
    `,
    depthTest: false, depthWrite: false,
  });
  // 3) apply: scale the HDR colour by the exposure derived from the adapted luminance.
  private readonly applyUniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tAdapted: { value: null as THREE.Texture | null },
    key: this.uniforms.key,
    minExposure: this.uniforms.minExposure,
    maxExposure: this.uniforms.maxExposure,
  };
  private readonly applyMat = new THREE.ShaderMaterial({
    uniforms: this.applyUniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D tAdapted;
      uniform float key;
      uniform float minExposure;
      uniform float maxExposure;
      varying vec2 vUv;
      void main() {
        float avgLum = exp(texture2D(tAdapted, vec2(0.5)).r);
        float exposure = clamp(key / max(avgLum, 1e-4), minExposure, maxExposure);
        vec4 c = texture2D(tDiffuse, vUv);
        gl_FragColor = vec4(c.rgb * exposure, c.a);
      }
    `,
    depthTest: false, depthWrite: false,
  });
  private readonly fsQuad = new FullScreenQuad(this.measureMat);
  /** Feed the frame delta (seconds) so adaptation is framerate-independent. */
  setDeltaTime(dt: number): void { this.dt = dt; }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    // 1) measure → lumRT (1×1)
    this.measureUniforms.tDiffuse.value = readBuffer.texture;
    this.fsQuad.material = this.measureMat;
    renderer.setRenderTarget(this.lumRT);
    this.fsQuad.render(renderer);
    // 2) adapt: read prev adapted + current measure → write the other adapt target
    const prev = this.adaptRT[this.flip ? 1 : 0];
    const next = this.adaptRT[this.flip ? 0 : 1];
    this.adaptUniforms.tCurrent.value = this.lumRT.texture;
    this.adaptUniforms.tPrev.value = prev.texture;
    this.adaptUniforms.rate.value = 1.0 - Math.exp(-this.dt * this.uniforms.speed.value);
    this.adaptUniforms.primed.value = this.primed ? 1 : 0;
    this.fsQuad.material = this.adaptMat;
    renderer.setRenderTarget(next);
    this.fsQuad.render(renderer);
    this.primed = true;
    this.flip = !this.flip;
    // 3) apply exposure → writeBuffer / screen
    this.applyUniforms.tDiffuse.value = readBuffer.texture;
    this.applyUniforms.tAdapted.value = next.texture;
    this.fsQuad.material = this.applyMat;
    renderer.autoClear = prevAutoClear;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
    renderer.setRenderTarget(prevTarget);
  }
  override dispose(): void {
    this.measureMat.dispose(); this.adaptMat.dispose(); this.applyMat.dispose();
    this.fsQuad.dispose();
    this.lumRT.dispose(); this.adaptRT[0].dispose(); this.adaptRT[1].dispose();
  }
}

// ─── Temporal anti-aliasing (TAA) ───────────────────────────────────────────
// The pipeline jitters the camera a sub-pixel amount each frame (Halton). This pass
// reconstructs each pixel's world position from depth, reprojects it with LAST frame's
// view-projection to look up the accumulated history, clamps that history to the colour
// range of the current 3×3 neighbourhood (the standard anti-ghosting trick), and blends.
// Over a few frames the jittered samples integrate into a supersampled, crawl-free image.
// Use INSTEAD of SMAA (the pipeline disables SMAA when TAA is on). Owns its history target.
export class TAAPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tHistory: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    inverseProjection: { value: new THREE.Matrix4() },
    cameraMatrixWorld: { value: new THREE.Matrix4() },
    prevViewProjection: { value: new THREE.Matrix4() },
    feedback: { value: 0.9 },   // history weight; higher = more accumulation, less noise
  };
  private readonly curViewProjection = new THREE.Matrix4();
  private primed = false;
  private flip = false;
  private historyRT?: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readonly resolveMat = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform sampler2D tHistory;
      uniform vec2 resolution;
      uniform mat4 inverseProjection;
      uniform mat4 cameraMatrixWorld;
      uniform mat4 prevViewProjection;
      uniform float feedback;
      varying vec2 vUv;
      void main() {
        vec3 cur = texture2D(tDiffuse, vUv).rgb;
        float d = texture2D(tDepth, vUv).x;
        // Sky (no depth) or first frame: just pass the current colour through.
        if (d >= 1.0) { gl_FragColor = vec4(cur, 1.0); return; }
        // Reconstruct world position, reproject with last frame's view-projection.
        vec4 v = inverseProjection * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vec3 viewPos = v.xyz / v.w;
        vec4 world = cameraMatrixWorld * vec4(viewPos, 1.0);
        vec4 prevClip = prevViewProjection * world;
        vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
        if (prevUv.x < 0.0 || prevUv.x > 1.0 || prevUv.y < 0.0 || prevUv.y > 1.0) {
          gl_FragColor = vec4(cur, 1.0); return; // disoccluded — no valid history
        }
        // Colour AABB of the 3×3 current neighbourhood, to clamp stale history into.
        vec3 nmin = cur, nmax = cur;
        vec2 texel = 1.0 / resolution;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec3 c = texture2D(tDiffuse, vUv + vec2(float(x), float(y)) * texel).rgb;
            nmin = min(nmin, c); nmax = max(nmax, c);
          }
        }
        vec3 hist = texture2D(tHistory, prevUv).rgb;
        hist = clamp(hist, nmin, nmax);
        gl_FragColor = vec4(mix(cur, hist, feedback), 1.0);
      }
    `,
    depthTest: false, depthWrite: false,
  });
  // Cheap copy used to seed the history target from the resolved frame.
  private readonly copyUniforms = { tDiffuse: { value: null as THREE.Texture | null } };
  private readonly copyMat = new THREE.ShaderMaterial({
    uniforms: this.copyUniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; varying vec2 vUv;
      void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
    `,
    depthTest: false, depthWrite: false,
  });
  private readonly fsQuad = new FullScreenQuad(this.resolveMat);
  override setSize(w: number, h: number): void {
    this.uniforms.resolution.value.set(w, h);
    if (this.historyRT) { this.historyRT[0].setSize(w, h); this.historyRT[1].setSize(w, h); }
    this.primed = false; // history is stale after a resize
  }
  setDepthTexture(tex: THREE.Texture | null): void { this.uniforms.tDepth.value = tex; }
  /** Feed THIS frame's (un-jittered) camera state. Primes prev-VP while disabled so
   *  re-enabling never reprojects against a stale frame. */
  setCameraState(inverseProjection: THREE.Matrix4, matrixWorld: THREE.Matrix4, viewProjection: THREE.Matrix4): void {
    this.uniforms.inverseProjection.value.copy(inverseProjection);
    this.uniforms.cameraMatrixWorld.value.copy(matrixWorld);
    this.curViewProjection.copy(viewProjection);
    if (!this.enabled) { this.uniforms.prevViewProjection.value.copy(viewProjection); this.primed = false; }
  }
  private ensureHistory(w: number, h: number): [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] {
    if (!this.historyRT) {
      const mk = () => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
      this.historyRT = [mk(), mk()];
    }
    return this.historyRT;
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const w = readBuffer.width, h = readBuffer.height;
    // Track the live buffer size so the 3×3 neighbourhood texel is correct even if
    // setSize() hasn't been called yet (e.g. before the first resize).
    this.uniforms.resolution.value.set(w, h);
    const hist = this.ensureHistory(w, h);
    const prevHist = hist[this.flip ? 1 : 0];
    const nextHist = hist[this.flip ? 0 : 1];
    const prevTarget = renderer.getRenderTarget();
    if (!this.primed) {
      // First frame after enable/resize: seed history from the current frame, output it.
      this.copyUniforms.tDiffuse.value = readBuffer.texture;
      this.fsQuad.material = this.copyMat;
      renderer.setRenderTarget(nextHist);
      this.fsQuad.render(renderer);
      this.primed = true;
    } else {
      // Resolve current + reprojected history → the next history target.
      this.uniforms.tDiffuse.value = readBuffer.texture;
      this.uniforms.tHistory.value = prevHist.texture;
      this.fsQuad.material = this.resolveMat;
      renderer.setRenderTarget(nextHist);
      this.fsQuad.render(renderer);
    }
    // Copy the resolved history to the pass output (writeBuffer / screen).
    this.copyUniforms.tDiffuse.value = nextHist.texture;
    this.fsQuad.material = this.copyMat;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
    renderer.setRenderTarget(prevTarget);
    this.flip = !this.flip;
    this.uniforms.prevViewProjection.value.copy(this.curViewProjection);
  }
  override dispose(): void {
    this.resolveMat.dispose(); this.copyMat.dispose(); this.fsQuad.dispose();
    this.historyRT?.[0].dispose(); this.historyRT?.[1].dispose();
  }
}

// ─── Screen-Space Global Illumination (SSGI) ────────────────────────────────
export class SSGIPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraProjectionMatrix: { value: new THREE.Matrix4() },
    cameraInverseProjectionMatrix: { value: new THREE.Matrix4() },
    intensity: { value: 1.0 },
    maxDistance: { value: 10.0 },
    raySteps: { value: 16 },
    thickness: { value: 0.5 },
  };

  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform sampler2D tNormal;
      uniform vec2 resolution;
      uniform mat4 cameraProjectionMatrix;
      uniform mat4 cameraInverseProjectionMatrix;
      uniform float intensity;
      uniform float maxDistance;
      uniform int raySteps;
      uniform float thickness;
      varying vec2 vUv;

      vec3 getViewPosition(vec2 uv, float depth) {
        vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 view = cameraInverseProjectionMatrix * clip;
        return view.xyz / view.w;
      }

      void main() {
        vec4 baseColor = texture2D(tDiffuse, vUv);
        float depth = texture2D(tDepth, vUv).r;
        if (depth >= 1.0) {
          gl_FragColor = baseColor;
          return;
        }

        vec3 viewPos = getViewPosition(vUv, depth);
        vec3 viewNormal = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);

        vec3 indirectLight = vec3(0.0);
        float stepSize = maxDistance / float(raySteps);

        // Simple hemisphere ray march for indirect diffuse bounce
        for (int i = 1; i <= 8; i++) {
          float fi = float(i);
          vec3 rayDir = normalize(viewNormal + vec3(sin(fi * 2.3), cos(fi * 1.7), sin(fi * 4.1)) * 0.5);
          vec3 samplePos = viewPos + rayDir * (fi * stepSize);

          vec4 clip = cameraProjectionMatrix * vec4(samplePos, 1.0);
          vec2 sampleUv = (clip.xy / clip.w) * 0.5 + 0.5;

          if (sampleUv.x >= 0.0 && sampleUv.x <= 1.0 && sampleUv.y >= 0.0 && sampleUv.y <= 1.0) {
            float sampleDepth = texture2D(tDepth, sampleUv).r;
            vec3 hitPos = getViewPosition(sampleUv, sampleDepth);

            float depthDiff = samplePos.z - hitPos.z;
            if (depthDiff > 0.0 && depthDiff < thickness) {
              vec3 hitColor = texture2D(tDiffuse, sampleUv).rgb;
              float atten = 1.0 / (1.0 + length(hitPos - viewPos));
              indirectLight += hitColor * atten;
            }
          }
        }

        indirectLight = (indirectLight / 8.0) * intensity;
        gl_FragColor = vec4(baseColor.rgb + indirectLight, baseColor.a);
      }
    `,
  });

  private readonly fsQuad = new FullScreenQuad(this.material);

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.fsQuad.material = this.material;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  override setSize(width: number, height: number): void {
    this.uniforms.resolution.value.set(width, height);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

// ─── Ground Truth Ambient Occlusion (GTAO) ───────────────────────────────────
export class GTAOPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    radius: { value: 1.5 },
    intensity: { value: 1.2 },
    falloff: { value: 0.8 },
  };

  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform sampler2D tNormal;
      uniform vec2 resolution;
      uniform float radius;
      uniform float intensity;
      uniform float falloff;
      varying vec2 vUv;

      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        float centerDepth = texture2D(tDepth, vUv).r;
        if (centerDepth >= 1.0) {
          gl_FragColor = base;
          return;
        }

        vec2 texel = 1.0 / resolution;
        float occlusion = 0.0;
        int samples = 8;

        for (int i = 0; i < 8; i++) {
          float angle = float(i) * 0.785398; // 2 * PI / 8
          vec2 offset = vec2(cos(angle), sin(angle)) * radius * texel;
          float sampleDepth = texture2D(tDepth, vUv + offset).r;
          float diff = (centerDepth - sampleDepth) * 100.0;

          if (diff > 0.001 && diff < falloff) {
            occlusion += (1.0 - diff / falloff);
          }
        }

        float ao = clamp(1.0 - (occlusion / float(samples)) * intensity, 0.0, 1.0);
        gl_FragColor = vec4(base.rgb * ao, base.a);
      }
    `,
  });

  private readonly fsQuad = new FullScreenQuad(this.material);

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.fsQuad.material = this.material;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  override setSize(width: number, height: number): void {
    this.uniforms.resolution.value.set(width, height);
  }

  override dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

