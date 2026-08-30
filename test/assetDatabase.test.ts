import { describe, it, expect, beforeEach } from 'vitest';
import {
  SidecarMetadata,
  AssetDatabase,
  AssetCooker,
  type AssetSidecarMeta,
} from '../src/assets';

describe('SidecarMetadata Unit Tests', () => {
  it('infers asset types from file extensions', () => {
    expect(SidecarMetadata.inferAssetType('models/hero.glb')).toBe('mesh');
    expect(SidecarMetadata.inferAssetType('textures/diffuse.png')).toBe('texture');
    expect(SidecarMetadata.inferAssetType('audio/slash.wav')).toBe('audio');
    expect(SidecarMetadata.inferAssetType('config/settings.json')).toBe('data');
  });

  it('serializes and parses sidecar metadata accurately', () => {
    const original: AssetSidecarMeta = {
      guid: 'g-asset-12345',
      type: 'mesh',
      version: 1,
      hash: 'hash-abc',
      dependencies: ['g-tex-1', 'g-tex-2'],
      tags: ['hero', 'character'],
      importerSettings: { generateNormals: true },
      lastModified: 1700000000000,
    };

    const json = SidecarMetadata.serialize(original);
    const parsed = SidecarMetadata.parse(json);

    expect(parsed.guid).toBe(original.guid);
    expect(parsed.type).toBe('mesh');
    expect(parsed.dependencies).toEqual(['g-tex-1', 'g-tex-2']);
    expect(parsed.tags).toEqual(['hero', 'character']);
  });
});

describe('AssetDatabase Unit Tests', () => {
  let db: AssetDatabase;

  beforeEach(() => {
    db = new AssetDatabase();
  });

  it('registers assets and preserves GUID on move/rename', () => {
    const entry = db.registerAsset('models/hero.glb');
    const assignedGuid = entry.guid;

    expect(db.getAssetByGuid(assignedGuid)?.path).toBe('models/hero.glb');
    expect(db.getAssetByPath('models/hero.glb')?.guid).toBe(assignedGuid);

    // Move asset to new directory
    const moved = db.moveAsset('models/hero.glb', 'assets/characters/hero.glb');
    expect(moved).toBe(true);

    // Old path is gone
    expect(db.getAssetByPath('models/hero.glb')).toBeUndefined();
    // New path retains same persistent GUID
    expect(db.getAssetByPath('assets/characters/hero.glb')?.guid).toBe(assignedGuid);
    expect(db.getAssetByGuid(assignedGuid)?.path).toBe('assets/characters/hero.glb');
  });

  it('tracks forward and reverse dependencies', () => {
    // Register texture
    const tex = db.registerAsset('textures/hero_albedo.png');
    // Register material depending on texture
    const mat = db.registerAsset('materials/hero_mat.mat', {
      guid: 'g-mat-hero',
      type: 'material',
      version: 1,
      dependencies: [tex.guid],
    });
    // Register mesh depending on material
    const mesh = db.registerAsset('models/hero.glb', {
      guid: 'g-mesh-hero',
      type: 'mesh',
      version: 1,
      dependencies: [mat.guid],
    });

    // Forward dependencies
    expect(db.getDependencies(mesh.guid)).toEqual([mat.guid]);
    expect(db.getDependencies(mat.guid)).toEqual([tex.guid]);

    // Reverse dependencies
    expect(db.getDependents(tex.guid)).toEqual([mat.guid]);
    expect(db.getDependents(mat.guid)).toEqual([mesh.guid]);
  });

  it('detects circular dependency cycles', () => {
    db.registerAsset('assetA.json', {
      guid: 'g-a',
      type: 'data',
      version: 1,
      dependencies: ['g-b'],
    });
    db.registerAsset('assetB.json', {
      guid: 'g-b',
      type: 'data',
      version: 1,
      dependencies: ['g-c'],
    });
    db.registerAsset('assetC.json', {
      guid: 'g-c',
      type: 'data',
      version: 1,
      dependencies: ['g-a'], // Cycle back to A
    });

    const cycles = db.detectCycles();
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe('AssetCooker Unit Tests', () => {
  it('cooks clean asset database into verified manifest', () => {
    const db = new AssetDatabase();
    const tex = db.registerAsset('textures/grass.png');
    db.registerAsset('materials/grass.mat', {
      guid: 'g-mat-grass',
      type: 'material',
      version: 1,
      dependencies: [tex.guid],
    });

    const result = AssetCooker.cook(db);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.manifest).toBeDefined();
    expect(result.manifest?.totalAssets).toBe(2);
  });

  it('rejects cooking when dependencies are missing', () => {
    const db = new AssetDatabase();
    db.registerAsset('models/orphan.glb', {
      guid: 'g-orphan',
      type: 'mesh',
      version: 1,
      dependencies: ['non-existent-guid'],
    });

    const result = AssetCooker.cook(db);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('missing dependency'))).toBe(true);
  });

  it('hashes actual source bytes for a verified deployment manifest', () => {
    const db = new AssetDatabase();
    db.registerAsset('data/config.json');
    const result = AssetCooker.cook(db, {
      requireContent: true,
      readAsset: () => new TextEncoder().encode('{"quality":"high"}'),
    });
    expect(result.ok).toBe(true);
    expect(result.manifest?.verified).toBe(true);
    expect(result.manifest?.assets[0].verified).toBe(true);
    expect(result.manifest?.assets[0].sizeBytes).toBe(18);
  });

  it('refuses to overwrite a different asset at the destination path', () => {
    const db = new AssetDatabase();
    const first = db.registerAsset('a.glb');
    const second = db.registerAsset('b.glb');
    expect(db.moveAsset('a.glb', 'b.glb')).toBe(false);
    expect(db.getAssetByPath('a.glb')?.guid).toBe(first.guid);
    expect(db.getAssetByPath('b.glb')?.guid).toBe(second.guid);
  });
});
