/**
 * SpeedLinesPass & ImpactFramePass — Anime stylized action post-processing passes.
 *
 * Provides radial speed lines during high-speed flight/dashes and impact flash frames on hits.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const commonVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export class SpeedLinesPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0.0 },
    intensity: { value: 0.0 }, // 0.0 = off, 1.0 = full
    density: { value: 30.0 },
    innerRadius: { value: 0.35 },
    color: { value: new THREE.Color(1, 1, 1) },
    center: { value: new THREE.Vector2(0.5, 0.5) },
  };

  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float intensity;
      uniform float density;
      uniform float innerRadius;
      uniform vec3 color;
      uniform vec2 center;
      varying vec2 vUv;

      float hash(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        if (intensity <= 0.001) {
          gl_FragColor = base;
          return;
        }

        vec2 delta = vUv - center;
        float dist = length(delta);
        float angle = atan(delta.y, delta.x);

        // Angular rays with time jitter
        float rayIndex = floor(angle * density / 3.14159265);
        float noise = hash(rayIndex + floor(uTime * 24.0));

        // Radial falloff: mask out inner focus circle
        float mask = smoothstep(innerRadius, innerRadius + 0.3, dist);
        float line = step(0.65, noise) * mask * intensity;

        vec3 result = mix(base.rgb, color, line * 0.85);
        gl_FragColor = vec4(result, base.a);
      }
    `,
  });

  private readonly fsQuad = new FullScreenQuad(this.material);

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uTime.value += deltaTime ?? 0.016;

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

export class ImpactFramePass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    active: { value: 0.0 }, // 0.0 = normal, 1.0 = inverted high-contrast anime flash
    invertColor: { value: 1.0 }, // 1.0 = invert, 0.0 = threshold high-contrast
  };

  private readonly material = new THREE.ShaderMaterial({
    // Keep the public uniform handle compatible; `active` is reserved in GLSL.
    uniforms: { tDiffuse: this.uniforms.tDiffuse, uImpactActive: this.uniforms.active, invertColor: this.uniforms.invertColor },
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uImpactActive;
      uniform float invertColor;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        if (uImpactActive <= 0.01) {
          gl_FragColor = color;
          return;
        }

        // Grayscale conversion
        float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        float bw = step(0.5, lum);
        vec3 impactColor = invertColor > 0.5 ? vec3(1.0 - bw) : vec3(bw);

        gl_FragColor = vec4(impactColor, 1.0);
      }
    `,
  });

  private readonly fsQuad = new FullScreenQuad(this.material);

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
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
