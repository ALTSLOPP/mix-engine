import * as THREE from 'three';
import type { Engine } from '../engine/Engine';

export type TextureStyle = 'anime' | 'realistic';
export type TextureType = 'grass' | 'sidewalk' | 'street' | 'wood' | 'brick' | 'asphalt' | 'water' | 'dirt' | 'sand' | 'scifi' | 'barrier' | 'chainlink' | 'concrete' | 'metal_grate' | 'rooftop' | 'school_wood' | 'stadium' | 'subway_tile' | 'tatami' | 'billboard' | 'brick_alley' | 'cracked_earth' | 'dojo_mat' | 'energy_cracks' | 'glass_shattered' | 'graffiti_wall' | 'school_tile' | 'shrine_wood' | 'vending_machine' | 'arcade_carpet' | 'chain_fence' | 'corrugated_metal' | 'cursed_runes' | 'dojo_wood' | 'konbini_glass' | 'muddy_ground' | 'scorched_earth' | 'train_exterior' | 'train_floor';

/**
 * TexturePresets provides a unified dictionary for the AI IDE to access the pre-generated 
 * texture maps for different styles (cel-shaded anime vs. photorealistic PBR).
 */
export class TexturePresets {
  private readonly loader = new THREE.TextureLoader();
  private readonly cache = new Map<string, THREE.Texture>();

  constructor(private readonly engine: Engine) {}

  /**
   * Load a preset texture asynchronously.
   * @param style 'anime' or 'realistic'
   * @param type The type of material (grass, wood, etc.)
   * @param repeat How many times to tile the texture across the geometry (default 1)
   */
  async load(style: TextureStyle, type: TextureType, repeat = 1): Promise<THREE.Texture> {
    const key = `${style}_${type}`;
    if (this.cache.has(key)) {
      const tex = this.cache.get(key)!.clone();
      tex.needsUpdate = true;
      if (repeat > 1) {
        tex.repeat.set(repeat, repeat);
      }
      return tex;
    }

    // Resolve the filename based on the requested style and type
    // Fallback logic for 'street' vs 'asphalt' naming
    let filename = `${style}_${type}.png`;
    if (style === 'realistic' && type === 'street') filename = `realistic_asphalt.png`;
    if (style === 'realistic' && type === 'sidewalk') filename = `realistic_asphalt.png`; // Fallback
    if (style === 'anime' && type === 'asphalt') filename = `anime_street.png`;

    const url = `/assets/textures/${style}/${filename}`;

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          
          if (style === 'anime') {
            // Anime styles look better without mipmap blurring
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.colorSpace = THREE.SRGBColorSpace;
          } else {
            texture.colorSpace = THREE.SRGBColorSpace;
          }

          this.cache.set(key, texture);

          const tex = texture.clone();
          tex.needsUpdate = true;
          if (repeat > 1) {
            tex.repeat.set(repeat, repeat);
          }
          resolve(tex);
        },
        undefined,
        (err) => reject(new Error(`TexturePresets: Failed to load ${url}`))
      );
    });
  }

  /** Applies a preset material to a target mesh synchronously (renders black until loaded). */
  apply(mesh: THREE.Mesh, style: TextureStyle, type: TextureType, repeat = 1): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    mat.userData.__texPresetOwned = true; // tag so a later apply() can dispose it safely

    if (style === 'anime') {
      mat.roughness = 0.9;
      mat.metalness = 0.0;
    } else {
      mat.roughness = 0.6;
      mat.metalness = 0.1;
    }

    // Dispose the material a PREVIOUS apply() created here (avoids a GPU leak on repeated
    // calls), but never a shared asset/builder material we didn't own.
    const prev = mesh.material;
    if (prev && !Array.isArray(prev) && prev.userData?.__texPresetOwned) {
      (prev as THREE.Material & { map?: THREE.Texture | null }).map?.dispose();
      prev.dispose();
    }

    mesh.material = mat;

    this.load(style, type, repeat).then((texture) => {
      mat.map = texture;
      mat.needsUpdate = true;
    }).catch(console.error);
  }
}
