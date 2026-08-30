/**
 * CelToonMaterial — Real-time anime stepped cel-shading material with shadow tinting and rim glow.
 */

import * as THREE from 'three';

export interface CelToonMaterialParameters {
  color?: THREE.ColorRepresentation;
  shadowColor?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  bands?: number; // 2 or 3 stepped lighting bands
  rimIntensity?: number; // 0..1
  rimPower?: number; // Fresnel exponent (default 3.0)
  roughness?: number;
}

export class CelToonMaterial extends THREE.ShaderMaterial {
  constructor(params: CelToonMaterialParameters = {}) {
    const baseColor = new THREE.Color(params.color ?? 0xffffff);
    const shadowColor = new THREE.Color(params.shadowColor ?? 0x554477);

    super({
      uniforms: {
        uColor: { value: baseColor },
        uShadowColor: { value: shadowColor },
        uMap: { value: params.map ?? null },
        uHasMap: { value: params.map ? 1.0 : 0.0 },
        uBands: { value: params.bands ?? 3.0 },
        uRimIntensity: { value: params.rimIntensity ?? 0.4 },
        uRimPower: { value: params.rimPower ?? 3.0 },
        uRoughness: { value: THREE.MathUtils.clamp(params.roughness ?? 0.5, 0, 1) },
        uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.4).normalize() },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <uv_pars_vertex>
        #include <morphtarget_pars_vertex>
        #include <skinning_pars_vertex>
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;

        void main() {
          #include <uv_vertex>
          #include <beginnormal_vertex>
          #include <morphnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          vNormal = normalize(normalMatrix * objectNormal);
          #include <begin_vertex>
          #include <morphtarget_vertex>
          #include <skinning_vertex>
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uShadowColor;
        uniform sampler2D uMap;
        uniform float uHasMap;
        uniform float uBands;
        uniform float uRimIntensity;
        uniform float uRimPower;
        uniform float uRoughness;
        uniform vec3 uLightDir;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;

        void main() {
          vec3 baseTex = uColor;
          if (uHasMap > 0.5) {
            baseTex *= texture2D(uMap, vUv).rgb;
          }

          // Stepped diffuse lighting ramp
          vec3 viewLightDir = normalize(mat3(viewMatrix) * uLightDir);
          float NdotL = max(dot(normalize(vNormal), viewLightDir), 0.0);
          float bandCount = max(2.0, floor(uBands + 0.5));
          float stepped = floor(NdotL * bandCount) / (bandCount - 1.0);
          vec3 litColor = mix(uShadowColor * baseTex, baseTex, stepped);

          // Fresnel Rim light
          float NdotV = max(dot(vNormal, vViewDir), 0.0);
          float rim = pow(1.0 - NdotV, uRimPower) * uRimIntensity;
          vec3 finalColor = litColor + vec3(rim * (1.0 - 0.5 * uRoughness));

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }
}
