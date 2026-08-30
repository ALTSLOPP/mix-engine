/**
 * AnimeMaterialFamily.ts — Factory and management utilities for MIX anime character materials.
 */

import * as THREE from 'three';
import { CelToonMaterial, type CelToonMaterialParameters, type AnimeSurfaceMode } from './CelToonMaterial';
import { AnimeLightingContext } from '../rendering/anime/AnimeLightingContext';

export interface AnimeCharacterMaterialOptions {
  skinColor?: THREE.ColorRepresentation;
  hairColor?: THREE.ColorRepresentation;
  eyeColor?: THREE.ColorRepresentation;
  clothColor?: THREE.ColorRepresentation;
  faceSdfMap?: THREE.Texture | null;
  faceSdfMode?: 'symmetric' | 'signed';
  hairHighlightStrength?: number;
  rimIntensity?: number;
  shadowTint?: THREE.ColorRepresentation;
  lightingContext?: AnimeLightingContext;
}

export class AnimeMaterialFamily {
  static create(surface: AnimeSurfaceMode, params: CelToonMaterialParameters = {}): CelToonMaterial {
    return new CelToonMaterial({ ...params, surface });
  }

  static createFace(params: CelToonMaterialParameters = {}): CelToonMaterial {
    return new CelToonMaterial({
      surface: 'face',
      shadowThreshold: 0.45,
      shadowSoftness: 0.08,
      rimIntensity: 0.25,
      ...params,
    });
  }

  static createHair(params: CelToonMaterialParameters = {}): CelToonMaterial {
    return new CelToonMaterial({
      surface: 'hair',
      bands: 3,
      hairHighlightStrength: 0.7,
      hairHighlightWidth: 0.12,
      rimIntensity: 0.5,
      ...params,
    });
  }

  static createSkin(params: CelToonMaterialParameters = {}): CelToonMaterial {
    return new CelToonMaterial({
      surface: 'skin',
      shadowThreshold: 0.5,
      shadowSoftness: 0.08,
      rimIntensity: 0.35,
      fillStrength: 0.25,
      ...params,
    });
  }

  static createEye(params: CelToonMaterialParameters = {}): CelToonMaterial {
    return new CelToonMaterial({
      surface: 'eye',
      eyeCatchlight: true,
      eyeEmissiveStrength: 0.25,
      rimIntensity: 0.0,
      bands: 2,
      ...params,
    });
  }

  static createCloth(params: CelToonMaterialParameters = {}): CelToonMaterial {
    return new CelToonMaterial({
      surface: 'cloth',
      bands: 3,
      shadowThreshold: 0.5,
      shadowSoftness: 0.04,
      rimIntensity: 0.4,
      roughness: 0.8,
      ...params,
    });
  }

  static createMetal(params: CelToonMaterialParameters = {}): CelToonMaterial {
    return new CelToonMaterial({
      surface: 'stylized_metal',
      bands: 4,
      highlightIntensity: 0.8,
      highlightThreshold: 0.75,
      rimIntensity: 0.6,
      roughness: 0.2,
      ...params,
    });
  }

  static createStylizedMetal(params: CelToonMaterialParameters = {}): CelToonMaterial {
    return this.createMetal(params);
  }

  /**
   * Automatically convert standard meshes in a character hierarchy to anime materials.
   */
  static applyToCharacter(root: THREE.Object3D, opts: AnimeCharacterMaterialOptions = {}): { converted: number; materials: CelToonMaterial[] } {
    let converted = 0;
    const materials: CelToonMaterial[] = [];

    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const convert = (oldMat: THREE.Material): CelToonMaterial => {
          const matName = (oldMat?.name || '').toLowerCase();
          // A slot's semantic name takes precedence over the compound mesh name.
          const name = /face|hair|eye|cloth|shirt|pant|jacket|dress|armor|metal|weapon|blade|skin|head|body|arm|leg|hand/.test(matName)
            ? matName : (mesh.name || '').toLowerCase();
          let surface: AnimeSurfaceMode = 'standard';
          let color: THREE.ColorRepresentation | undefined;

          if (name.includes('face')) {
            surface = 'face';
            color = opts.skinColor;
          } else if (name.includes('hair') || matName.includes('hair')) {
            surface = 'hair';
            color = opts.hairColor;
          } else if (name.includes('eye') || matName.includes('eye')) {
            surface = 'eye';
            color = opts.eyeColor;
          } else if (name.includes('cloth') || matName.includes('cloth') || name.includes('shirt') || name.includes('pant') || name.includes('jacket') || name.includes('dress') || name.includes('armor')) {
            surface = 'cloth';
            color = opts.clothColor;
          } else if (name.includes('metal') || matName.includes('metal') || name.includes('weapon') || name.includes('blade')) {
            surface = 'stylized_metal';
          } else if (name.includes('skin') || matName.includes('skin') || name.includes('head') || name.includes('body') || name.includes('arm') || name.includes('leg') || name.includes('hand')) {
            surface = 'skin';
            color = opts.skinColor;
          }
          const map = (oldMat as any)?.map ?? null;
          const oldColor = (oldMat as any)?.color;

          const newMat = this.create(surface, {
            color: color ?? oldColor ?? 0xffffff,
            map,
            shadowColor: opts.shadowTint,
            faceShadowMap: surface === 'face' ? opts.faceSdfMap : undefined,
            faceSdfMode: opts.faceSdfMode,
            hairHighlightStrength: opts.hairHighlightStrength,
            rimIntensity: opts.rimIntensity,
            lightingContext: opts.lightingContext,
            alphaMap: (oldMat as THREE.MeshStandardMaterial).alphaMap ?? null,
            transparent: oldMat.transparent,
            alphaTest: oldMat.alphaTest,
            opacity: oldMat.opacity,
            depthWrite: oldMat.depthWrite,
            side: oldMat.side,
          });

          newMat.name = oldMat.name;
          materials.push(newMat);
          converted++;
          return newMat;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
      }
    });

    return { converted, materials };
  }

  /**
   * Update all CelToonMaterials in a scene hierarchy from the shared AnimeLightingContext.
   */
  static updateAll(root: THREE.Object3D, ctx = AnimeLightingContext.get()): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m instanceof CelToonMaterial && m.useSharedLighting) {
            m.updateSharedLighting(ctx);
          }
        }
      }
    });
  }
}
