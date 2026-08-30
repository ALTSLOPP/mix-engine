/**
 * GLSL port of AMD FidelityFX FSR 1 (EASU + RCAS), GPUOpen-Effects/FidelityFX-FSR.
 * Copyright (c) 2021 Advanced Micro Devices, Inc. MIT; see third-party/FidelityFX-FSR-LICENSE.txt.
 * Changes: scalar texel-centre samples instead of gathers (WebGL2 has no textureGather),
 * exact reciprocals with zero guards, and a user-facing RCAS strength.
 * Operates on tone-mapped, sRGB-encoded RGB; never apply another output transform.
 */
export const fsrVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const fsrEasuShader = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 inputSize;
  varying vec2 vUv;
  vec3 loadPixel(vec2 p) {
    return texture2D(tInput, (clamp(p, vec2(0.0), inputSize - 1.0) + 0.5) / inputSize).rgb;
  }
  float luma(vec3 c) { return c.g + 0.5 * (c.r + c.b); }
  void edge(inout vec2 dir, inout float len, float w, float a, float b, float c, float d, float e) {
    vec2 gradient = vec2(d - b, e - a);
    vec2 span = max(abs(vec2(d - c, e - c)), abs(vec2(c - b, c - a)));
    vec2 strength = clamp(abs(gradient) / max(span, vec2(1e-6)), 0.0, 1.0);
    dir += gradient * w;
    len += dot(strength, strength) * w;
  }
  void tap(inout vec3 color, inout float weight, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
    vec2 v = vec2(dot(off, dir), dot(off, vec2(-dir.y, dir.x))) * len;
    float d2 = min(dot(v, v), clp);
    float wb = 0.4 * d2 - 1.0;
    float wa = lob * d2 - 1.0;
    wb = 1.5625 * wb * wb - 0.5625;
    float w = wb * wa * wa;
    color += c * w;
    weight += w;
  }
  void main() {
    vec2 pos = vUv * inputSize - 0.5;
    vec2 base = floor(pos), pp = fract(pos);
    vec3 b = loadPixel(base + vec2(0.0, -1.0));
    vec3 c = loadPixel(base + vec2(1.0, -1.0));
    vec3 e = loadPixel(base + vec2(-1.0, 0.0));
    vec3 f = loadPixel(base + vec2(0.0, 0.0));
    vec3 g = loadPixel(base + vec2(1.0, 0.0));
    vec3 h = loadPixel(base + vec2(2.0, 0.0));
    vec3 i = loadPixel(base + vec2(-1.0, 1.0));
    vec3 j = loadPixel(base + vec2(0.0, 1.0));
    vec3 k = loadPixel(base + vec2(1.0, 1.0));
    vec3 l = loadPixel(base + vec2(2.0, 1.0));
    vec3 n = loadPixel(base + vec2(0.0, 2.0));
    vec3 o = loadPixel(base + vec2(1.0, 2.0));
    vec2 dir = vec2(0.0);
    float len = 0.0;
    edge(dir, len, (1.0-pp.x)*(1.0-pp.y), luma(b), luma(e), luma(f), luma(g), luma(j));
    edge(dir, len, pp.x*(1.0-pp.y), luma(c), luma(f), luma(g), luma(h), luma(k));
    edge(dir, len, (1.0-pp.x)*pp.y, luma(f), luma(i), luma(j), luma(k), luma(n));
    edge(dir, len, pp.x*pp.y, luma(g), luma(j), luma(k), luma(l), luma(o));
    float dir2 = dot(dir, dir);
    dir = dir2 < (1.0/32768.0) ? vec2(1.0, 0.0) : dir * inversesqrt(dir2);
    len *= 0.5;
    len *= len;
    float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
    vec2 kernel = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
    float lob = 0.5 - 0.29 * len, clp = 1.0 / lob;
    vec3 color = vec3(0.0);
    float weight = 0.0;
    tap(color, weight, vec2(0.0, -1.0) - pp, dir, kernel, lob, clp, b);
    tap(color, weight, vec2(1.0, -1.0) - pp, dir, kernel, lob, clp, c);
    tap(color, weight, vec2(-1.0, 0.0) - pp, dir, kernel, lob, clp, e);
    tap(color, weight, vec2(0.0, 0.0) - pp, dir, kernel, lob, clp, f);
    tap(color, weight, vec2(1.0, 0.0) - pp, dir, kernel, lob, clp, g);
    tap(color, weight, vec2(2.0, 0.0) - pp, dir, kernel, lob, clp, h);
    tap(color, weight, vec2(-1.0, 1.0) - pp, dir, kernel, lob, clp, i);
    tap(color, weight, vec2(0.0, 1.0) - pp, dir, kernel, lob, clp, j);
    tap(color, weight, vec2(1.0, 1.0) - pp, dir, kernel, lob, clp, k);
    tap(color, weight, vec2(2.0, 1.0) - pp, dir, kernel, lob, clp, l);
    tap(color, weight, vec2(0.0, 2.0) - pp, dir, kernel, lob, clp, n);
    tap(color, weight, vec2(1.0, 2.0) - pp, dir, kernel, lob, clp, o);
    vec3 lo = min(min(f, g), min(j, k)), hi = max(max(f, g), max(j, k));
    gl_FragColor = vec4(clamp(color / max(weight, 1e-6), lo, hi), 1.0);
  }
`;

export const fsrRcasShader = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 inputSize;
  uniform float sharpness;
  varying vec2 vUv;
  void main() {
    vec2 px = 1.0 / inputSize;
    vec3 b = texture2D(tInput, vUv + vec2(0.0, -px.y)).rgb;
    vec3 d = texture2D(tInput, vUv + vec2(-px.x, 0.0)).rgb;
    vec3 e = texture2D(tInput, vUv).rgb;
    vec3 f = texture2D(tInput, vUv + vec2(px.x, 0.0)).rgb;
    vec3 h = texture2D(tInput, vUv + vec2(0.0, px.y)).rgb;
    vec3 lo = min(min(b, d), min(f, h)), hi = max(max(b, d), max(f, h));
    // Include the centre tap in the limiters (AMD's isolated-pixel oversharpening fix).
    vec3 hitMin = min(lo, e) / max(4.0 * hi, vec3(1e-6));
    vec3 hitMax = (1.0 - max(hi, e)) / min(4.0 * lo - 4.0, vec3(-1e-6));
    vec3 lobes = max(-hitMin, hitMax);
    float lobe = max(-0.1875, min(max(max(lobes.r, lobes.g), lobes.b), 0.0)) * sharpness;
    gl_FragColor = vec4(clamp((lobe * (b+d+f+h) + e) / (4.0*lobe + 1.0), 0.0, 1.0), 1.0);
  }
`;

export const fsrCopyShader = /* glsl */ `
  uniform sampler2D tInput;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tInput, vUv); }
`;

