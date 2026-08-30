/**
 * AtmosphericDepthPass.ts — Lightweight stylized distance & height atmospheric pass.
 *
 * Designed for modest GPUs (500 GFLOPS class) where expensive volumetric raymarching is disabled.
 * Provides rich anime aerial perspective: crisp high-contrast foreground, gentle midground tint,
 * and deep background atmosphere.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const vertShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec3 foregroundTint;
  uniform vec3 midgroundTint;
  uniform vec3 backgroundTint;
  uniform float nearDistance;
  uniform float midDistance;
  uniform float farDistance;
  uniform float intensity;
  uniform float cameraNear;
  uniform float cameraFar;

  varying vec2 vUv;

  float linearizeDepth(float depth) {
    float z_ndc = depth * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z_ndc * (cameraFar - cameraNear));
  }

  void main() {
    vec4 baseColor = texture2D(tDiffuse, vUv);
    float rawDepth = texture2D(tDepth, vUv).x;

    // Sky/background at depth 1.0 is left unmodified or tinted smoothly
    if (rawDepth >= 0.9999) {
      gl_FragColor = baseColor;
      return;
    }

    float linearDist = linearizeDepth(rawDepth);

    // Multi-stage atmospheric gradient
    float midFactor = smoothstep(nearDistance, midDistance, linearDist);
    float farFactor = smoothstep(midDistance, farDistance, linearDist);

    vec3 atmColor = mix(midgroundTint, backgroundTint, farFactor);
    float blendFactor = max(midFactor * 0.35, farFactor * 0.8) * intensity;

    vec3 finalRgb = mix(baseColor.rgb, atmColor, clamp(blendFactor, 0.0, 1.0));
    gl_FragColor = vec4(finalRgb, baseColor.a);
  }
`;

export class AtmosphericDepthPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    foregroundTint: { value: new THREE.Color(0xffffff) },
    midgroundTint: { value: new THREE.Color(0xa0b4d0) },
    backgroundTint: { value: new THREE.Color(0x6078a0) },
    nearDistance: { value: 10.0 },
    midDistance: { value: 60.0 },
    farDistance: { value: 250.0 },
    intensity: { value: 0.6 },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000.0 },
  };

  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: vertShader,
    fragmentShader: fragShader,
    depthTest: false,
    depthWrite: false,
  });

  private readonly fsQuad = new FullScreenQuad(this.material);

  setDepthTexture(depthTex: THREE.Texture | null): void {
    this.uniforms.tDepth.value = depthTex;
  }

  setCameraClip(near: number, far: number): void {
    this.uniforms.cameraNear.value = near;
    this.uniforms.cameraFar.value = far;
  }

  setTints(mid: THREE.ColorRepresentation, bg: THREE.ColorRepresentation, intensity = 0.6): void {
    this.uniforms.midgroundTint.value.set(mid);
    this.uniforms.backgroundTint.value.set(bg);
    this.uniforms.intensity.value = intensity;
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
