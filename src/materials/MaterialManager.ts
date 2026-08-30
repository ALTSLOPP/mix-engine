import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { TextureStyle, TextureType } from './TexturePresets';

export interface MaterialDef {
  id: string;
  type?: 'standard' | 'basic' | 'physical';
  color?: number | string;
  roughness?: number;
  metalness?: number;
  emissive?: number | string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  wireframe?: boolean;
  texturePreset?: {
    style: TextureStyle;
    type: TextureType;
    repeat?: number;
  };
}

export class MaterialManager {
  private readonly materials = new Map<string, THREE.Material>();
  private readonly defs = new Map<string, MaterialDef>();

  constructor(private readonly engine: Engine) {}

  /** Register a material definition. */
  register(def: MaterialDef): void {
    this.defs.set(def.id, def);
    // Invalidate + dispose any previously-built material so a re-register (e.g. an
    // AI re-defining a material) doesn't leak the old GPU program/textures. The old
    // code dropped the cache entry without disposing.
    const stale = this.materials.get(def.id);
    if (stale) {
      const m = stale as THREE.MeshStandardMaterial;
      m.map?.dispose?.();
      (m as any).emissiveMap?.dispose?.();
      (m as any).normalMap?.dispose?.();
      (m as any).roughnessMap?.dispose?.();
      (m as any).metalnessMap?.dispose?.();
      m.dispose();
    }
    this.materials.delete(def.id);
  }

  /** Load and register multiple material definitions from a JSON URL. */
  async loadFromUrl(url: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MaterialManager: failed to fetch ${url} (status: ${res.status})`);
    const list = (await res.json()) as MaterialDef[];
    for (const def of list) {
      this.register(def);
    }
  }

  /** Retrieve an instantiated THREE.Material by ID. */
  get(id: string): THREE.Material | null {
    if (this.materials.has(id)) return this.materials.get(id)!;
    
    const def = this.defs.get(id);
    if (!def) return null;

    const mat = this.buildMaterial(def);
    this.materials.set(id, mat);
    return mat;
  }

  private buildMaterial(def: MaterialDef): THREE.Material {
    const color = def.color !== undefined ? def.color : 0xffffff;
    
    let mat: THREE.Material;

    if (def.type === 'basic') {
      mat = new THREE.MeshBasicMaterial({
        color,
        wireframe: def.wireframe,
        transparent: def.transparent || (def.opacity !== undefined && def.opacity < 1.0),
        opacity: def.opacity ?? 1.0,
      });
    } else {
      // Default to Standard
      const smat = new THREE.MeshStandardMaterial({
        color,
        roughness: def.roughness ?? 0.5,
        metalness: def.metalness ?? 0.0,
        emissive: def.emissive ?? 0x000000,
        emissiveIntensity: def.emissiveIntensity ?? 1.0,
        wireframe: def.wireframe,
        transparent: def.transparent || (def.opacity !== undefined && def.opacity < 1.0),
        opacity: def.opacity ?? 1.0,
      });
      mat = smat;
    }

    // Apply texture preset asynchronously if defined
    if (def.texturePreset && (mat as any).map === null) {
      const { style, type, repeat } = def.texturePreset;
      this.engine.textures.load(style, type, repeat).then((tex) => {
        (mat as any).map = tex;
        mat.needsUpdate = true;
      }).catch(console.error);
    }

    return mat;
  }

  /** Dispose every cached material + its textures (called by Engine.dispose). */
  dispose(): void {
    for (const mat of this.materials.values()) {
      const m = mat as THREE.MeshStandardMaterial;
      m.map?.dispose?.();
      (m as any).emissiveMap?.dispose?.();
      (m as any).normalMap?.dispose?.();
      (m as any).roughnessMap?.dispose?.();
      (m as any).metalnessMap?.dispose?.();
      m.dispose();
    }
    this.materials.clear();
  }
}
