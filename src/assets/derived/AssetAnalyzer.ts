/**
 * AssetAnalyzer.ts — Machine-readable asset metrics and cost analysis.
 *
 * Extracts exact structural statistics for meshes, textures, and animations
 * without performing destructive modifications.
 */

import * as THREE from 'three';

export interface MeshMetrics {
  vertexCount: number;
  triangleCount: number;
  indexCount: number;
  meshCount: number;
  materialCount: number;
  uvChannels: number;
  isSkinned: boolean;
  boneCount: number;
  morphTargetCount: number;
  attributeMemoryBytes: number;
  indexMemoryBytes: number;
  totalMemoryBytes: number;
  bounds: {
    /** World-space bounds, including transforms throughout the hierarchy. */
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
  existingLods: number;
}

export interface TextureMetrics {
  width: number;
  height: number;
  channels: number;
  format: string;
  colorSpace: 'srgb' | 'linear' | 'data';
  hasAlpha: boolean;
  hasMipmaps: boolean;
  estimatedGpuMemoryBytes: number;
}

export interface AnimationMetrics {
  clipCount: number;
  totalDurationSeconds: number;
  trackCount: number;
  keyCount: number;
  boneTrackCount: number;
  morphTrackCount: number;
  hasRootMotion: boolean;
  estimatedMemoryBytes: number;
}

export interface AssetAnalysisReport {
  assetId: string;
  type: 'mesh' | 'texture' | 'animation' | 'composite';
  mesh?: MeshMetrics;
  texture?: TextureMetrics;
  animation?: AnimationMetrics;
  warnings: string[];
}

export class AssetAnalyzer {
  static analyzeMesh(object: THREE.Object3D, assetId = 'unknown'): MeshMetrics {
    let vertexCount = 0;
    let triangleCount = 0;
    let indexCount = 0;
    let meshCount = 0;
    const materialSet = new Set<THREE.Material>();
    let uvChannels = 0;
    let isSkinned = false;
    const boneSet = new Set<string>();
    let morphTargetCount = 0;
    let attributeMemoryBytes = 0;
    let indexMemoryBytes = 0;
    let existingLods = 0;

    const box = new THREE.Box3();
    const transformedBox = new THREE.Box3();
    let hasBounds = false;

    object.updateWorldMatrix(true, true);

    object.traverse((child) => {
      if ((child as any).isLOD) {
        existingLods = Math.max(existingLods, (child as any).levels?.length ?? 1);
      }

      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        const mesh = child as THREE.Mesh;
        const geom = mesh.geometry;

        if (mesh instanceof THREE.SkinnedMesh || (mesh as any).isSkinnedMesh) {
          isSkinned = true;
          const skeleton = (mesh as THREE.SkinnedMesh).skeleton;
          if (skeleton && skeleton.bones) {
            for (const b of skeleton.bones) boneSet.add(b.name || b.uuid);
          }
        }

        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            for (const m of mesh.material) materialSet.add(m);
          } else {
            materialSet.add(mesh.material);
          }
        }

        if (geom) {
          const bBox = geom.boundingBox ?? (() => { geom.computeBoundingBox(); return geom.boundingBox; })();
          if (bBox && !bBox.isEmpty()) {
            transformedBox.copy(bBox).applyMatrix4(child.matrixWorld);
            box.union(transformedBox);
            hasBounds = true;
          }

          const pos = geom.getAttribute('position');
          if (pos) {
            vertexCount += pos.count;
            attributeMemoryBytes += pos.count * pos.itemSize * 4; // float32
          }

          if (geom.getAttribute('uv')) uvChannels = Math.max(uvChannels, 1);
          if (geom.getAttribute('uv2')) uvChannels = Math.max(uvChannels, 2);

          for (const attrName of Object.keys(geom.attributes)) {
            if (attrName !== 'position') {
              const attr = geom.getAttribute(attrName);
              if (attr) {
                const bytesPerElem = attr.array instanceof Float32Array ? 4 : (attr.array instanceof Uint16Array ? 2 : 1);
                attributeMemoryBytes += attr.count * attr.itemSize * bytesPerElem;
              }
            }
          }

          if (geom.morphAttributes && Object.keys(geom.morphAttributes).length > 0) {
            const morphChannelNames = Object.keys(geom.morphAttributes);
            const channelMax = Math.max(...morphChannelNames.map(k => geom.morphAttributes[k]?.length ?? 0));
            morphTargetCount += channelMax;
            for (const key of morphChannelNames) {
              const list = geom.morphAttributes[key];
              if (Array.isArray(list)) {
                for (const attr of list) {
                  if (attr) {
                    const bytesPerElem = attr.array instanceof Float32Array ? 4 : (attr.array instanceof Uint16Array ? 2 : 1);
                    attributeMemoryBytes += attr.count * attr.itemSize * bytesPerElem;
                  }
                }
              }
            }
          }

          if (geom.index) {
            indexCount += geom.index.count;
            triangleCount += Math.floor(geom.index.count / 3);
            indexMemoryBytes += geom.index.count * (geom.index.array instanceof Uint32Array ? 4 : 2);
          } else if (pos) {
            triangleCount += Math.floor(pos.count / 3);
          }
        }
      }
    });

    const bMin: [number, number, number] = hasBounds ? [box.min.x, box.min.y, box.min.z] : [0, 0, 0];
    const bMax: [number, number, number] = hasBounds ? [box.max.x, box.max.y, box.max.z] : [0, 0, 0];
    const size: [number, number, number] = [bMax[0] - bMin[0], bMax[1] - bMin[1], bMax[2] - bMin[2]];

    return {
      vertexCount,
      triangleCount,
      indexCount,
      meshCount,
      materialCount: materialSet.size,
      uvChannels,
      isSkinned,
      boneCount: boneSet.size,
      morphTargetCount,
      attributeMemoryBytes,
      indexMemoryBytes,
      totalMemoryBytes: attributeMemoryBytes + indexMemoryBytes,
      bounds: { min: bMin, max: bMax, size },
      existingLods,
    };
  }

  static analyzeTexture(texture: THREE.Texture, semanticHint?: string): TextureMetrics {
    const img = texture.image as { width?: number; height?: number } | undefined;
    const width = img?.width ?? (texture as any).width ?? 1024;
    const height = img?.height ?? (texture as any).height ?? 1024;
    const channels = 4;

    let colorSpace: 'srgb' | 'linear' | 'data' = 'srgb';
    const name = (texture.name || semanticHint || '').toLowerCase();

    if (name.includes('normal') || name.includes('roughness') || name.includes('metallic') || name.includes('metal') || name.includes('ao') || name.includes('mask') || name.includes('sdf') || name.includes('depth')) {
      colorSpace = 'linear';
    } else if (texture.colorSpace === THREE.SRGBColorSpace) {
      colorSpace = 'srgb';
    }

    const hasAlpha = name.includes('alpha') || name.includes('opacity') || name.includes('trans');
    const hasMipmaps = (texture.mipmaps && texture.mipmaps.length > 0) || texture.generateMipmaps;
    const baseBytes = width * height * channels;
    const estimatedGpuMemoryBytes = hasMipmaps ? Math.floor(baseBytes * 1.333) : baseBytes;

    return {
      width,
      height,
      channels,
      format: texture.format === THREE.RGBAFormat ? 'RGBA8' : 'RGB8',
      colorSpace,
      hasAlpha,
      hasMipmaps,
      estimatedGpuMemoryBytes,
    };
  }

  static analyzeAnimation(clips: THREE.AnimationClip[]): AnimationMetrics {
    let totalDurationSeconds = 0;
    let trackCount = 0;
    let keyCount = 0;
    let boneTrackCount = 0;
    let morphTrackCount = 0;
    let hasRootMotion = false;

    for (const clip of clips) {
      totalDurationSeconds += clip.duration;
      trackCount += clip.tracks.length;

      for (const track of clip.tracks) {
        keyCount += track.times.length;
        const name = track.name.toLowerCase();
        if (name.includes('morph') || name.includes('blendshape')) {
          morphTrackCount++;
        } else {
          boneTrackCount++;
        }
        if (name.includes('root') || name.includes('hips')) {
          if (name.endsWith('.position')) hasRootMotion = true;
        }
      }
    }

    const estimatedMemoryBytes = keyCount * 16; // approximate time + 3D/quat payload

    return {
      clipCount: clips.length,
      totalDurationSeconds,
      trackCount,
      keyCount,
      boneTrackCount,
      morphTrackCount,
      hasRootMotion,
      estimatedMemoryBytes,
    };
  }

  static analyzeAsset(params: {
    assetId: string;
    object?: THREE.Object3D;
    texture?: THREE.Texture;
    clips?: THREE.AnimationClip[];
  }): AssetAnalysisReport {
    const warnings: string[] = [];
    const report: AssetAnalysisReport = {
      assetId: params.assetId,
      type: params.object ? 'mesh' : (params.texture ? 'texture' : 'animation'),
      warnings,
    };

    if (params.object) {
      report.mesh = this.analyzeMesh(params.object, params.assetId);
      if (report.mesh.triangleCount > 50000) {
        warnings.push(`High triangle count (${report.mesh.triangleCount.toLocaleString()} tris). Consider generating LOD variants.`);
      }
      if (report.mesh.isSkinned && report.mesh.boneCount > 120) {
        warnings.push(`High bone count (${report.mesh.boneCount} bones) for skinned mesh.`);
      }
    }

    if (params.texture) {
      report.texture = this.analyzeTexture(params.texture);
      if (report.texture.width > 2048 || report.texture.height > 2048) {
        warnings.push(`High texture resolution (${report.texture.width}x${report.texture.height}). Consider derived downscaling for modest profiles.`);
      }
    }

    if (params.clips && params.clips.length > 0) {
      report.animation = this.analyzeAnimation(params.clips);
      if (report.animation.keyCount > 10000) {
        warnings.push(`High animation keyframe count (${report.animation.keyCount.toLocaleString()} keys). Consider curve simplification.`);
      }
    }

    return report;
  }
}
