import * as THREE from 'three';
import type { SplatMap } from './SplatMap';

export interface TerrainMaterialOptions {
  splatMap: SplatMap;
}

function makeSolidTexture(r: number, g: number, b: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

// Sensible default layer colours (sRGB bytes; decoded to linear in-shader) so a freshly-created
// terrain looks like ground instead of a white sheet. Replaced per-layer by setLayerTexture/Preset.
const DEFAULT_LAYERS = [
  makeSolidTexture(83, 110, 60),    // 0: grass
  makeSolidTexture(110, 85, 55),    // 1: dirt
  makeSolidTexture(120, 115, 110),  // 2: rock
  makeSolidTexture(196, 178, 130),  // 3: sand
];

export class TerrainMaterial extends THREE.MeshStandardMaterial {
  public uniforms: {
    tSplat: { value: THREE.Texture | null };
    tAlbedo0: { value: THREE.Texture | null };
    tAlbedo1: { value: THREE.Texture | null };
    tAlbedo2: { value: THREE.Texture | null };
    tAlbedo3: { value: THREE.Texture | null };
    repeat0: { value: number };
    repeat1: { value: number };
    repeat2: { value: number };
    repeat3: { value: number };
  };

  constructor(opts: TerrainMaterialOptions) {
    super({ color: 0xffffff, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
    
    this.uniforms = {
      tSplat: { value: opts.splatMap.texture },
      tAlbedo0: { value: DEFAULT_LAYERS[0] },
      tAlbedo1: { value: DEFAULT_LAYERS[1] },
      tAlbedo2: { value: DEFAULT_LAYERS[2] },
      tAlbedo3: { value: DEFAULT_LAYERS[3] },
      repeat0: { value: 10 },
      repeat1: { value: 10 },
      repeat2: { value: 10 },
      repeat3: { value: 10 },
    };

    this.onBeforeCompile = (shader) => {
      shader.uniforms.tSplat = this.uniforms.tSplat;
      shader.uniforms.tAlbedo0 = this.uniforms.tAlbedo0;
      shader.uniforms.tAlbedo1 = this.uniforms.tAlbedo1;
      shader.uniforms.tAlbedo2 = this.uniforms.tAlbedo2;
      shader.uniforms.tAlbedo3 = this.uniforms.tAlbedo3;
      shader.uniforms.repeat0 = this.uniforms.repeat0;
      shader.uniforms.repeat1 = this.uniforms.repeat1;
      shader.uniforms.repeat2 = this.uniforms.repeat2;
      shader.uniforms.repeat3 = this.uniforms.repeat3;

      shader.vertexShader = `
        varying vec2 vSplatUv;
        ${shader.vertexShader}
      `.replace(
        `#include <uv_vertex>`,
        `
        #include <uv_vertex>
        vSplatUv = uv;
        `
      );

      shader.fragmentShader = `
        uniform sampler2D tSplat;
        uniform sampler2D tAlbedo0;
        uniform sampler2D tAlbedo1;
        uniform sampler2D tAlbedo2;
        uniform sampler2D tAlbedo3;
        uniform float repeat0;
        uniform float repeat1;
        uniform float repeat2;
        uniform float repeat3;
        varying vec2 vSplatUv;
        ${shader.fragmentShader}
      `.replace(
        `#include <map_fragment>`,
        `
        vec4 splat = texture2D(tSplat, vSplatUv);
        // Custom samplers aren't auto colour-managed by three, so decode each layer sRGB→linear here.
        vec3 a0 = pow(texture2D(tAlbedo0, vSplatUv * repeat0).rgb, vec3(2.2));
        vec3 a1 = pow(texture2D(tAlbedo1, vSplatUv * repeat1).rgb, vec3(2.2));
        vec3 a2 = pow(texture2D(tAlbedo2, vSplatUv * repeat2).rgb, vec3(2.2));
        vec3 a3 = pow(texture2D(tAlbedo3, vSplatUv * repeat3).rgb, vec3(2.2));
        vec3 terrainBlend = a0 * splat.r + a1 * splat.g + a2 * splat.b + a3 * splat.a;
        diffuseColor.rgb *= terrainBlend;
`
      );
    };

    this.customProgramCacheKey = () => 'TerrainMaterial';
  }

  setLayerTexture(layer: number, texture: THREE.Texture, repeat: number = 10) {
    const previous = layer === 0 ? this.uniforms.tAlbedo0.value
      : layer === 1 ? this.uniforms.tAlbedo1.value
      : layer === 2 ? this.uniforms.tAlbedo2.value
      : this.uniforms.tAlbedo3.value;
    if (previous && previous !== texture && previous.userData.terrainOwned === true) previous.dispose();
    if (layer === 0) { this.uniforms.tAlbedo0.value = texture; this.uniforms.repeat0.value = repeat; }
    else if (layer === 1) { this.uniforms.tAlbedo1.value = texture; this.uniforms.repeat1.value = repeat; }
    else if (layer === 2) { this.uniforms.tAlbedo2.value = texture; this.uniforms.repeat2.value = repeat; }
    else if (layer === 3) { this.uniforms.tAlbedo3.value = texture; this.uniforms.repeat3.value = repeat; }
    this.needsUpdate = true;
  }

  setLayerPreset(layer: number, url: string, repeat: number = 10) {
    new THREE.TextureLoader().load(url, (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.userData.terrainOwned = true;
      this.setLayerTexture(layer, texture, repeat);
    });
  }

  override dispose(): void {
    for (const uniform of [this.uniforms.tAlbedo0, this.uniforms.tAlbedo1, this.uniforms.tAlbedo2, this.uniforms.tAlbedo3]) {
      const texture = uniform.value;
      if (texture?.userData.terrainOwned === true) texture.dispose();
    }
    super.dispose();
  }
}
