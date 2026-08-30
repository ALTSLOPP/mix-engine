/**
 * SidecarMetadata — Persistent sidecar metadata files (<asset>.meta.json)
 * providing stable GUIDs and dependency tracking for project assets.
 */

export type AssetType = 'mesh' | 'texture' | 'audio' | 'animation' | 'material' | 'prefab' | 'scene' | 'data';

export interface AssetSidecarMeta {
  guid: string;
  type: AssetType;
  version: number;
  hash?: string;
  fileSize?: number;
  importerSettings?: Record<string, unknown>;
  dependencies?: string[]; // Asset GUIDs this asset depends on
  tags?: string[];
  lastModified?: number;
}

export class SidecarMetadata {
  /** Generate a new v4-compliant GUID */
  static generateGuid(): string {
    try {
      const c = (globalThis as any).crypto;
      if (c?.randomUUID) return c.randomUUID();
    } catch {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      const v = ch === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** Infer asset type from file extension */
  static inferAssetType(filePath: string): AssetType {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    switch (ext) {
      case 'glb':
      case 'gltf':
      case 'fbx':
      case 'obj':
        return 'mesh';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'ktx2':
        return 'texture';
      case 'wav':
      case 'mp3':
      case 'ogg':
      case 'flac':
        return 'audio';
      case 'anim':
        return 'animation';
      case 'mat':
        return 'material';
      case 'prefab':
        return 'prefab';
      case 'json':
        return 'data';
      default:
        return 'data';
    }
  }

  /** Create default sidecar metadata for a given file */
  static createDefault(filePath: string, customGuid?: string): AssetSidecarMeta {
    return {
      guid: customGuid ?? this.generateGuid(),
      type: this.inferAssetType(filePath),
      version: 1,
      dependencies: [],
      tags: [],
      importerSettings: {},
      lastModified: Date.now(),
    };
  }

  /** Serialize metadata to formatted JSON */
  static serialize(meta: AssetSidecarMeta): string {
    return JSON.stringify(meta, null, 2);
  }

  /** Parse and validate metadata JSON */
  static parse(jsonStr: string): AssetSidecarMeta {
    const obj = JSON.parse(jsonStr) as AssetSidecarMeta;
    if (!obj || typeof obj.guid !== 'string') {
      throw new Error('Invalid asset metadata: missing guid.');
    }
    return {
      guid: obj.guid,
      type: obj.type ?? 'data',
      version: obj.version ?? 1,
      hash: obj.hash,
      fileSize: typeof obj.fileSize === 'number' ? obj.fileSize : undefined,
      dependencies: Array.isArray(obj.dependencies) ? obj.dependencies : [],
      tags: Array.isArray(obj.tags) ? obj.tags : [],
      importerSettings: obj.importerSettings ?? {},
      lastModified: obj.lastModified ?? Date.now(),
    };
  }
}
