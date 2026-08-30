import * as THREE from 'three';
import type { GerstnerWave } from './gerstner';
import { maxAmplitude } from './gerstner';

const MAX_WAVES = 8;

/**
 * WaterMaterial — a MeshStandardMaterial (so it inherits the engine's lights, shadows, FogExp2,
 * tonemapping, the sky-environment reflection — which re-bakes with the day/night cycle — AND the
 * screen-space-reflection post pass) extended via onBeforeCompile with:
 *   • Gerstner vertex displacement + analytic normals (so specular/reflection ripple with the swell),
 *   • a deep/shallow Fresnel tint, and foam on the crests.
 * The GLSL phase formula is byte-for-byte the same as gerstner.ts so the GPU crest and the CPU
 * buoyancy sampler (WaterSystem.sampleHeight) agree.
 *
 * The water mesh is built directly in the XZ plane (y=0) and only ever TRANSLATED (no rotation/
 * scale), so a vertex's world XZ is just `position.xz + modelMatrix[3].xz` and the world-space wave
 * displacement can be added straight to the object-space position.
 */
export class WaterMaterial extends THREE.MeshStandardMaterial {
  readonly uniforms = {
    uTime: { value: 0 },
    uWorldOffset: { value: new THREE.Vector2() },
    uWaveCount: { value: 0 },
    uWaveDir: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector2(1, 0)) },
    uWaveParams: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4(0, 1, 1, 0)) },
    uMaxAmp: { value: 1 },
    uFoam: { value: 1 },
    uDeepColor: { value: new THREE.Color(0x0b3a54) },
    uShallowColor: { value: new THREE.Color(0x2e8aa8) },
    uFoamColor: { value: new THREE.Color(0xeaf6ff) },
  };

  constructor() {
    super({
      color: 0xffffff, roughness: 0.06, metalness: 0.0,
      transparent: true, opacity: 0.9, side: THREE.FrontSide,
    });
    this.envMapIntensity = 1.3;

    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);

      shader.vertexShader = `
        #define MAX_WAVES ${MAX_WAVES}
        uniform float uTime;
        uniform vec2 uWorldOffset;
        uniform int uWaveCount;
        uniform vec2 uWaveDir[MAX_WAVES];
        uniform vec4 uWaveParams[MAX_WAVES];   // x=steepness y=wavelength z=speed w=amplitude
        uniform float uMaxAmp;
        uniform float uFoam;
        varying vec3 vWorldPos;
        varying float vFoam;
        ${shader.vertexShader}
      `.replace(
        '#include <beginnormal_vertex>',
        `
        vec2 wxz = (modelMatrix * vec4(position, 1.0)).xz + uWorldOffset;
        vec3 gDisp = vec3(0.0);
        vec3 gN = vec3(0.0);
        for (int i = 0; i < MAX_WAVES; i++) {
          if (i >= uWaveCount) break;
          vec2 d = normalize(uWaveDir[i]);
          float steep = uWaveParams[i].x;
          float L = uWaveParams[i].y;
          float amp = uWaveParams[i].w;
          float k = 6.28318530718 / L;
          float omega = uWaveParams[i].z * sqrt(9.81 * k);
          float phase = k * dot(d, wxz) - omega * uTime;
          float c = cos(phase), s = sin(phase);
          gDisp.x += steep * amp * d.x * c;
          gDisp.z += steep * amp * d.y * c;
          gDisp.y += amp * s;
          float WA = k * amp;
          gN.x -= d.x * WA * c;
          gN.z -= d.y * WA * c;
          gN.y -= steep * WA * s;
        }
        vec3 objectNormal = normalize(vec3(gN.x, 1.0 + gN.y, gN.z));
        vFoam = clamp((gDisp.y / max(uMaxAmp, 0.001)) * uFoam, 0.0, 1.0);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif
        `
      ).replace(
        '#include <begin_vertex>',
        `
        vec3 transformed = vec3(position) + gDisp;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
      );

      shader.fragmentShader = `
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uFoamColor;
        varying vec3 vWorldPos;
        varying float vFoam;
        ${shader.fragmentShader}
      `.replace(
        '#include <map_fragment>',
        `
        vec3 Vdir = normalize(cameraPosition - vWorldPos);
        // Grazing angles see more of the surface/sky → lighter shallow tint; straight down → deep.
        float facing = clamp(dot(Vdir, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
        vec3 water = mix(uShallowColor, uDeepColor, facing);
        water = mix(water, uFoamColor, vFoam);
        diffuseColor.rgb *= water;
        `
      );
    };

    this.customProgramCacheKey = () => 'WaterMaterial';
  }

  /** Push a wave set into the shader uniforms (and recompute the max crest height for foam/bounds). */
  setWaves(waves: GerstnerWave[]): void {
    const n = Math.min(waves.length, MAX_WAVES);
    this.uniforms.uWaveCount.value = n;
    for (let i = 0; i < n; i++) {
      const w = waves[i];
      this.uniforms.uWaveDir.value[i].set(w.dirX, w.dirZ);
      this.uniforms.uWaveParams.value[i].set(w.steepness, w.wavelength, w.speed, w.amplitude);
    }
    this.uniforms.uMaxAmp.value = Math.max(0.001, maxAmplitude(waves.slice(0, n)));
  }

  setColors(deep?: THREE.ColorRepresentation, shallow?: THREE.ColorRepresentation, foam?: THREE.ColorRepresentation): void {
    if (deep !== undefined) this.uniforms.uDeepColor.value.set(deep);
    if (shallow !== undefined) this.uniforms.uShallowColor.value.set(shallow);
    if (foam !== undefined) this.uniforms.uFoamColor.value.set(foam);
  }

  setFoam(amount: number): void { this.uniforms.uFoam.value = amount; }
  setTime(t: number): void { this.uniforms.uTime.value = t; }
  setWorldOffset(x: number, z: number): void { this.uniforms.uWorldOffset.value.set(x, z); }
}
