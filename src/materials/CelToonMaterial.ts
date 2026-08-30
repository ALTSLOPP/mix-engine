/**
 * CelToonMaterial.ts — Real-time anime stepped cel-shading material family for MIX Engine.
 *
 * Features:
 * - Semantic surface modes: 'standard' | 'skin' | 'face' | 'hair' | 'eye' | 'cloth' | 'stylized_metal'
 * - Multi-band stepped toon lighting with customizable shadow thresholds, softness, and tint
 * - Artistic fill and Fresnel rim lighting
 * - Skinned meshes and morph targets support
 * - Face SDF directional facial shadow contouring with graceful fallback
 * - Graphic anime hair highlight bands
 * - High-readability anime eye catchlights and color preservation
 * - Shared AnimeLightingContext integration
 * - Text-first semantic inspection and description
 */

import * as THREE from 'three';
import { AnimeLightingContext } from '../rendering/anime/AnimeLightingContext';

export type AnimeSurfaceMode = 'standard' | 'skin' | 'face' | 'hair' | 'eye' | 'cloth' | 'stylized_metal';

export interface CelToonMaterialParameters {
  color?: THREE.ColorRepresentation;
  shadowColor?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
  transparent?: boolean;
  alphaTest?: number;
  opacity?: number;
  depthWrite?: boolean;
  side?: THREE.Side;
  bands?: number; // 2 or 3 stepped lighting bands
  rimIntensity?: number; // 0..1
  rimPower?: number; // Fresnel exponent (default 3.0)
  roughness?: number;
  metalness?: number;

  // Extended anime surface parameters
  surface?: AnimeSurfaceMode;
  shadowThreshold?: number; // 0..1 (default 0.5)
  shadowSoftness?: number; // 0..0.5 (default 0.05)
  shadowStrength?: number; // 0..1 (default 1.0)
  fillColor?: THREE.ColorRepresentation;
  fillStrength?: number;
  rimColor?: THREE.ColorRepresentation;
  highlightColor?: THREE.ColorRepresentation;
  highlightIntensity?: number;
  highlightThreshold?: number;

  // Face SDF shading
  faceShadowMap?: THREE.Texture | null;
  faceForward?: THREE.Vector3;
  faceRight?: THREE.Vector3;
  /** Symmetric half-face gradients mirror with the light; signed maps retain legacy sampling. */
  faceSdfMode?: 'symmetric' | 'signed';

  // Hair highlight band
  hairHighlightColor?: THREE.ColorRepresentation;
  hairHighlightStrength?: number;
  hairHighlightWidth?: number;
  hairHighlightCenter?: number;
  hairHighlightShift?: number;
  hairHighlightSoftness?: number;

  // Eye readability
  eyeCatchlight?: boolean;
  eyeCatchlightStrength?: number;
  eyeEmissiveStrength?: number;
  eyeReadabilityBoost?: number;

  // Shared context link
  useSharedLighting?: boolean;
  lightingContext?: AnimeLightingContext;
}

type LightingOverrides = Pick<CelToonMaterialParameters,
  'shadowColor' | 'fillColor' | 'fillStrength' | 'rimColor' | 'rimIntensity' | 'rimPower' | 'hairHighlightStrength'>;

export class CelToonMaterial extends THREE.ShaderMaterial {
  surfaceMode: AnimeSurfaceMode;
  useSharedLighting: boolean;
  private _metalness = 0.0;
  private lightingContext?: AnimeLightingContext;
  private lightingRevision = -1;
  private readonly lightingOverrides: LightingOverrides;

  constructor(params: CelToonMaterialParameters = {}) {
    const baseColor = new THREE.Color(params.color ?? 0xffffff);
    const shadowColor = new THREE.Color(params.shadowColor ?? 0x554477);
    const fillColor = new THREE.Color(params.fillColor ?? 0x222030);
    const rimColor = new THREE.Color(params.rimColor ?? 0xe0d8ff);
    const highlightColor = new THREE.Color(params.highlightColor ?? 0xffffff);
    const hairHighlightColor = new THREE.Color(params.hairHighlightColor ?? 0xffffff);
    const surface = params.surface ?? 'standard';
    const useSharedLighting = params.useSharedLighting ?? true;

    const surfaceModeInt = {
      standard: 0,
      skin: 1,
      face: 2,
      hair: 3,
      eye: 4,
      cloth: 5,
      stylized_metal: 6,
    }[surface];

    super({
      fog: true,
      transparent: params.transparent ?? false,
      alphaTest: params.alphaTest ?? 0,
      opacity: params.opacity ?? 1,
      depthWrite: params.depthWrite ?? true,
      side: params.side ?? THREE.FrontSide,
      uniforms: {
        uColor: { value: baseColor },
        uShadowColor: { value: shadowColor },
        uFillColor: { value: fillColor },
        uFillStrength: { value: params.fillStrength ?? 0.2 },
        uRimColor: { value: rimColor },
        uMap: { value: params.map ?? null },
        uHasMap: { value: params.map ? 1.0 : 0.0 },
        uAlphaMap: { value: params.alphaMap ?? null },
        uHasAlphaMap: { value: params.alphaMap ? 1.0 : 0.0 },
        uOpacity: { value: params.opacity ?? 1 },
        uAlphaTest: { value: params.alphaTest ?? 0 },
        uBands: { value: params.bands ?? 3.0 },
        uRimIntensity: { value: params.rimIntensity ?? 0.5 },
        uRimPower: { value: params.rimPower ?? 3.0 },
        uRoughness: { value: THREE.MathUtils.clamp(params.roughness ?? 0.5, 0, 1) },
        uMetalness: { value: THREE.MathUtils.clamp(params.metalness ?? 0.0, 0, 1) },
        uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.4).normalize() },
        uSunDirection: { value: new THREE.Vector3(0.5, 1.0, 0.4).normalize() },
        uLightColor: { value: new THREE.Color(0xfff4e6) },
        uLightIntensity: { value: 1.5 },

        uSurfaceMode: { value: surfaceModeInt },
        uShadowThreshold: { value: params.shadowThreshold ?? 0.5 },
        uShadowSoftness: { value: params.shadowSoftness ?? 0.05 },
        uShadowStrength: { value: params.shadowStrength ?? 1.0 },

        uHighlightColor: { value: highlightColor },
        uHighlightIntensity: { value: params.highlightIntensity ?? 0.3 },
        uHighlightThreshold: { value: params.highlightThreshold ?? 0.85 },

        // Face SDF
        uFaceSDF: { value: params.faceShadowMap ?? null },
        tFaceSdf: { value: params.faceShadowMap ?? null },
        uHasFaceSDF: { value: params.faceShadowMap ? 1.0 : 0.0 },
        uUseFaceSdf: { value: params.faceShadowMap ? 1.0 : 0.0 },
        uFaceForward: { value: params.faceForward?.clone().normalize() ?? new THREE.Vector3(0, 0, 1) },
        uFaceRight: { value: params.faceRight?.clone().normalize() ?? new THREE.Vector3(1, 0, 0) },
        uSymmetricFaceSdf: { value: params.faceSdfMode === 'signed' ? 0 : 1 },

        // Hair highlight
        uHairHighlightColor: { value: hairHighlightColor },
        uHairHighlightStrength: { value: params.hairHighlightStrength ?? 0.6 },
        uHairHighlightWidth: { value: params.hairHighlightWidth ?? 0.15 },
        uHairHighlightCenter: { value: params.hairHighlightCenter ?? 0.5 },
        uHairHighlightShift: { value: params.hairHighlightShift ?? 0.0 },
        uHairHighlightSoftness: { value: params.hairHighlightSoftness ?? 0.05 },

        // Eye
        uEyeCatchlight: { value: params.eyeCatchlight !== false ? 1.0 : 0.0 },
        uEyeCatchlightStrength: { value: params.eyeCatchlightStrength ?? (params.eyeCatchlight !== false ? 1.0 : 0.0) },
        uEyeEmissiveStrength: { value: params.eyeEmissiveStrength ?? 0.2 },
        uEyeReadabilityBoost: { value: params.eyeReadabilityBoost ?? 0.2 },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        #include <morphtarget_pars_vertex>
        #include <skinning_pars_vertex>
        // Face axes are authored in mesh-local bind space, just like vertex positions.
        uniform vec3 uFaceForward;
        uniform vec3 uFaceRight;
        varying vec3 vFaceForward;
        varying vec3 vFaceRight;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        void main() {
          vUv = uv;
          #include <beginnormal_vertex>
          #include <morphnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          vec4 faceForward = vec4(uFaceForward, 0.0);
          vec4 faceRight = vec4(uFaceRight, 0.0);
          #ifdef USE_SKINNING
            faceForward = skinMatrix * faceForward;
            faceRight = skinMatrix * faceRight;
          #endif
          vFaceForward = normalize((modelMatrix * faceForward).xyz);
          vFaceRight = normalize((modelMatrix * faceRight).xyz);
          #ifdef FLIP_SIDED
            objectNormal = -objectNormal;
          #endif
          vNormal = normalize(normalMatrix * objectNormal);
          vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);

          #include <begin_vertex>
          #include <morphtarget_vertex>
          #include <skinning_vertex>
          vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
          vWorldPos = worldPosition.xyz;
          vec4 mvPosition = viewMatrix * worldPosition;
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uColor;
        uniform vec3 uShadowColor;
        uniform vec3 uFillColor;
        uniform float uFillStrength;
        uniform vec3 uRimColor;
        uniform sampler2D uMap;
        uniform float uHasMap;
        uniform sampler2D uAlphaMap;
        uniform float uHasAlphaMap;
        uniform float uOpacity;
        uniform float uAlphaTest;
        uniform float uBands;
        uniform float uRimIntensity;
        uniform float uRimPower;
        uniform float uRoughness;
        uniform float uMetalness;
        uniform vec3 uLightDir;
        uniform vec3 uLightColor;
        uniform float uLightIntensity;

        uniform int uSurfaceMode;
        uniform float uShadowThreshold;
        uniform float uShadowSoftness;
        uniform float uShadowStrength;

        uniform vec3 uHighlightColor;
        uniform float uHighlightIntensity;
        uniform float uHighlightThreshold;

        uniform sampler2D uFaceSDF;
        uniform float uHasFaceSDF;
        uniform vec3 uHairHighlightColor;
        uniform float uSymmetricFaceSdf;
        varying vec3 vFaceForward;
        varying vec3 vFaceRight;
        uniform float uHairHighlightStrength;
        uniform float uHairHighlightWidth;
        uniform float uHairHighlightCenter;
        uniform float uHairHighlightShift;
        uniform float uHairHighlightSoftness;

        uniform float uEyeCatchlight;
        uniform float uEyeCatchlightStrength;
        uniform float uEyeEmissiveStrength;
        uniform float uEyeReadabilityBoost;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        void main() {
          vec3 baseTex = uColor;
          float alpha = uOpacity;
          if (uHasMap > 0.5) {
            vec4 texel = texture2D(uMap, vUv);
            baseTex *= texel.rgb;
            alpha *= texel.a;
          }
          if (uHasAlphaMap > 0.5) alpha *= texture2D(uAlphaMap, vUv).g;
          if (alpha < uAlphaTest) discard;

          vec3 viewLightDir = normalize(mat3(viewMatrix) * uLightDir);
          vec3 norm = normalize(vNormal);
          #ifdef DOUBLE_SIDED
            norm *= gl_FrontFacing ? 1.0 : -1.0;
          #endif
          float NdotL = dot(norm, viewLightDir);
          float halfLambert = NdotL * 0.5 + 0.5;

          float litFactor = 1.0;

          if (uSurfaceMode == 2) {
            // --- FACE SDF SHADING ---
            if (uHasFaceSDF > 0.5) {
              // Directional angle relative to face forward / right
              vec3 lightNorm = normalize(uLightDir);
              float forwardDot = dot(normalize(vFaceForward), lightNorm);
              float rightDot = dot(normalize(vFaceRight), lightNorm);
              float angle = length(vec2(rightDot, forwardDot)) > 0.000001 ? atan(rightDot, forwardDot) : 0.0;
              float sdfThreshold = (angle / 3.14159265) * 0.5 + 0.5;

              vec2 sdfUv = vUv;
              if (uSymmetricFaceSdf > 0.5) {
                if (rightDot < 0.0) sdfUv.x = 1.0 - sdfUv.x;
                sdfThreshold = abs(angle) / 3.14159265;
              }
              vec4 sdfSample = texture2D(uFaceSDF, sdfUv);
              float sdfVal = sdfSample.r;
              litFactor = smoothstep(sdfThreshold - uShadowSoftness, sdfThreshold + uShadowSoftness, sdfVal);
            } else {
              // Graceful geometric face fallback: softer cartoon transition
              float faceThreshold = uShadowThreshold * 0.9;
              litFactor = smoothstep(faceThreshold - uShadowSoftness * 1.5, faceThreshold + uShadowSoftness * 1.5, halfLambert);
            }
          } else if (uSurfaceMode == 1) {
            // --- SKIN SHADING --- softer 2-band cel ramp with warm sub-fill
            float threshold = uShadowThreshold;
            litFactor = smoothstep(threshold - uShadowSoftness * 2.0, threshold + uShadowSoftness * 2.0, halfLambert);
          } else {
            // --- STANDARD / CLOTH / METAL / HAIR stepped cel ramp ---
            float bandCount = max(2.0, floor(uBands + 0.5));
            float rawStepped = floor(halfLambert * bandCount) / (bandCount - 1.0);
            float smoothRamp = smoothstep(uShadowThreshold - uShadowSoftness, uShadowThreshold + uShadowSoftness, halfLambert);
            litFactor = mix(rawStepped, smoothRamp, uShadowSoftness * 2.0);
          }

          litFactor = clamp(litFactor, 0.0, 1.0);
          vec3 shadowTinted = mix(mix(baseTex, uShadowColor * baseTex, uShadowStrength), baseTex, litFactor);
          vec3 ambientFill = uFillColor * uFillStrength * (1.0 - litFactor);
          vec3 litColor = shadowTinted + ambientFill;

          // --- FRESNEL RIM LIGHT ---
          float NdotV = max(dot(norm, vViewDir), 0.0);
          float rim = pow(1.0 - NdotV, uRimPower) * uRimIntensity;
          rim *= (1.0 - 0.5 * uRoughness);
          vec3 rimLight = uRimColor * rim;

          // --- HAIR HIGHLIGHT BAND ---
          vec3 hairSpec = vec3(0.0);
          if (uSurfaceMode == 3) {
            float hairCoord = vUv.y + uHairHighlightShift;
            float centerDist = abs(fract(hairCoord * 2.0) - uHairHighlightCenter);
            float band = 1.0 - smoothstep(uHairHighlightWidth - uHairHighlightSoftness, uHairHighlightWidth + uHairHighlightSoftness, centerDist);
            float viewFacing = max(0.0, dot(norm, vec3(0.0, 0.0, 1.0)));
            hairSpec = uHairHighlightColor * (band * uHairHighlightStrength * viewFacing * (litFactor * 0.5 + 0.5));
          }

          // --- SPECULAR / METAL HIGHLIGHT ---
          vec3 specHighlight = vec3(0.0);
          if (uSurfaceMode == 6 || uHighlightIntensity > 0.0 || uMetalness > 0.0) {
            vec3 halfVec = normalize(viewLightDir + vViewDir);
            float NdotH = max(0.0, dot(norm, halfVec));
            float specPower = mix(32.0, 4.0, uRoughness);
            float spec = pow(NdotH, specPower);
            float stepSpec = step(uHighlightThreshold, spec);
            vec3 specColor = mix(uHighlightColor, baseTex, uMetalness);
            specHighlight = specColor * (stepSpec * uHighlightIntensity * (1.0 + uMetalness * 0.5));
          }

          // --- EYE READABILITY ---
          vec3 eyeBonus = vec3(0.0);
          if (uSurfaceMode == 4) {
            eyeBonus = baseTex * (uEyeEmissiveStrength + uEyeReadabilityBoost * 0.5);
            if (uEyeCatchlight > 0.5) {
              vec3 halfVec = normalize(viewLightDir + vViewDir);
              float NdotH = max(0.0, dot(norm, halfVec));
              float catchlight = pow(NdotH, 64.0);
              eyeBonus += vec3(catchlight * uEyeCatchlightStrength);
            }
          }

          vec3 finalColor = (litColor * uLightColor * (uLightIntensity * 0.6 + 0.4)) + rimLight + hairSpec + specHighlight + eyeBonus;

          gl_FragColor = vec4(finalColor, alpha);
          #include <fog_fragment>
        }
      `,
    });

    this.surfaceMode = surface;
    this.useSharedLighting = useSharedLighting;
    this._metalness = params.metalness ?? 0.0;
    this.lightingContext = params.lightingContext;
    this.lightingOverrides = {
      shadowColor: params.shadowColor,
      fillColor: params.fillColor,
      fillStrength: params.fillStrength,
      rimColor: params.rimColor,
      rimIntensity: params.rimIntensity,
      rimPower: params.rimPower,
      hairHighlightStrength: params.hairHighlightStrength,
    };
    if (useSharedLighting) {
      this.updateSharedLighting();
    }
  }

  override onBeforeRender(renderer: THREE.WebGLRenderer): void {
    if (this.useSharedLighting) {
      const ctx = AnimeLightingContext.forRenderer(renderer) ?? this.lightingContext ?? AnimeLightingContext.get();
      if (ctx !== this.lightingContext || ctx.revision !== this.lightingRevision) this.updateSharedLighting(ctx);
    }
    this.uniforms.uOpacity.value = this.opacity;
    this.uniforms.uAlphaTest.value = this.alphaTest;
    // A material may be reused by successive draws or viewports with different uniforms.
    this.uniformsNeedUpdate = true;
  }

  setLightingOverrides(overrides: LightingOverrides): void {
    Object.assign(this.lightingOverrides, overrides);
    this.applyLightingOverrides();
  }

  private applyLightingOverrides(): void {
    const p = this.lightingOverrides;
    if (p.shadowColor !== undefined) this.uniforms.uShadowColor.value.set(p.shadowColor);
    if (p.fillColor !== undefined) this.uniforms.uFillColor.value.set(p.fillColor);
    if (p.fillStrength !== undefined) this.uniforms.uFillStrength.value = p.fillStrength;
    if (p.rimColor !== undefined) this.uniforms.uRimColor.value.set(p.rimColor);
    if (p.rimIntensity !== undefined) this.uniforms.uRimIntensity.value = p.rimIntensity;
    if (p.rimPower !== undefined) this.uniforms.uRimPower.value = p.rimPower;
    if (p.hairHighlightStrength !== undefined) this.uniforms.uHairHighlightStrength.value = p.hairHighlightStrength;
  }

  get color(): THREE.Color {
    return this.uniforms.uColor.value;
  }
  set color(v: THREE.Color) {
    this.uniforms.uColor.value.copy(v);
  }

  get roughness(): number {
    return this.uniforms.uRoughness.value;
  }
  set roughness(v: number) {
    this.uniforms.uRoughness.value = v;
  }

  get metalness(): number {
    return this.uniforms.uMetalness ? this.uniforms.uMetalness.value : this._metalness;
  }
  set metalness(v: number) {
    this._metalness = v;
    if (this.uniforms.uMetalness) this.uniforms.uMetalness.value = THREE.MathUtils.clamp(v, 0, 1);
  }

  setFaceSdf(tex: THREE.Texture, forward?: THREE.Vector3, right?: THREE.Vector3): this {
    this.uniforms.uFaceSDF.value = tex;
    this.uniforms.tFaceSdf.value = tex;
    this.uniforms.uHasFaceSDF.value = 1.0;
    this.uniforms.uUseFaceSdf.value = 1.0;
    if (forward) this.uniforms.uFaceForward.value.copy(forward).normalize();
    if (right) this.uniforms.uFaceRight.value.copy(right).normalize();
    return this;
  }

  syncWithLightingContext(ctx = this.lightingContext ?? AnimeLightingContext.get()): void {
    this.updateSharedLighting(ctx);
  }

  updateSharedLighting(ctx = this.lightingContext ?? AnimeLightingContext.get()): void {
    this.lightingContext = ctx;
    this.lightingRevision = ctx.revision;
    this.uniforms.uLightDir.value.copy(ctx.sunDirection);
    this.uniforms.uSunDirection.value.copy(ctx.sunDirection);
    this.uniforms.uLightColor.value.copy(ctx.sunColor);
    this.uniforms.uLightIntensity.value = ctx.sunIntensity;
    this.uniforms.uShadowColor.value.copy(ctx.shadowTint);
    this.uniforms.uFillColor.value.copy(ctx.ambientColor);
    this.uniforms.uFillStrength.value = ctx.ambientIntensity;
    this.uniforms.uRimColor.value.copy(ctx.rimColor);
    this.uniforms.uRimIntensity.value = ctx.rimIntensity;
    this.uniforms.uRimPower.value = ctx.rimPower;
    this.uniforms.uHairHighlightColor.value.copy(ctx.hairHighlightColor);
    if (this.lightingOverrides.hairHighlightStrength === undefined) {
      this.uniforms.uHairHighlightStrength.value = ctx.hairHighlightStrength;
    }
    this.applyLightingOverrides();
  }

  setSurface(surface: AnimeSurfaceMode): void {
    this.surfaceMode = surface;
    const surfaceModeInt = {
      standard: 0,
      skin: 1,
      face: 2,
      hair: 3,
      eye: 4,
      cloth: 5,
      stylized_metal: 6,
    }[surface];
    this.uniforms.uSurfaceMode.value = surfaceModeInt;
  }

  describe(): string {
    const col = this.uniforms.uColor.value as THREE.Color;
    const shadow = this.uniforms.uShadowColor.value as THREE.Color;
    const rim = this.uniforms.uRimColor.value as THREE.Color;
    const bands = this.uniforms.uBands.value as number;
    const rimInt = this.uniforms.uRimIntensity.value as number;
    const surface = this.surfaceMode;

    const lines = [
      `CelToonMaterial (${surface.toUpperCase()} surface)`,
      `- Surface Mode: ${surface}`,
      `- Base Color / Base Tint: #${col.getHexString()}`,
      `- Shadow Tint: #${shadow.getHexString()} (Threshold: ${(this.uniforms.uShadowThreshold.value as number).toFixed(2)}, Softness: ${(this.uniforms.uShadowSoftness.value as number).toFixed(2)})`,
      `- Cel Bands: ${Math.round(bands)} stepped regions`,
      `- Rim Light: #${rim.getHexString()} (Intensity: ${rimInt.toFixed(2)}, Power: ${(this.uniforms.uRimPower.value as number).toFixed(1)})`,
    ];

    if (surface === 'face') {
      const hasSdf = (this.uniforms.uHasFaceSDF.value as number) > 0.5;
      lines.push(`- Face SDF: ${hasSdf ? 'ACTIVE texture map' : 'geometric cartoon fallback'}`);
    } else if (surface === 'hair') {
      lines.push(`- Hair Highlight: strength ${(this.uniforms.uHairHighlightStrength.value as number).toFixed(2)}, width ${(this.uniforms.uHairHighlightWidth.value as number).toFixed(2)}`);
    } else if (surface === 'eye') {
      lines.push(`- Eye Readability: emissive boost ${(this.uniforms.uEyeEmissiveStrength.value as number).toFixed(2)}, catchlight ${(this.uniforms.uEyeCatchlight.value as number) > 0.5 ? 'ON' : 'OFF'}`);
    }

    return lines.join('\n');
  }
}
