import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { FPS_STARTER_CONTENT, createFpsStarterWeapons, registerFpsStarterAssets } from '../src/content/FpsStarterPack';
import { ContentModelInstance } from '../src/content/ContentModelInstance';
import { AssetManifest } from '../src/animation/AssetManifest';
import { AssetCache } from '../src/animation/AssetCache';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { createMockEngine } from './helpers/gameplayEngine';

describe('bundled FPS content integrity', () => {
  it('keeps the public provenance catalog identical to the bundled module catalog', () => {
    expect(JSON.parse(readFileSync(new URL('../public/assets/fps-starter/content.json', import.meta.url), 'utf8'))).toEqual(FPS_STARTER_CONTENT);
  });
  it.each(FPS_STARTER_CONTENT.assets)('$id matches its source hash and has self-contained data', asset => {
    const bytes = readFileSync(new URL(`../public${asset.path}`, import.meta.url));
    expect(bytes.length).toBe(asset.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    if (asset.kind === 'audio') {
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
      expect(bytes.includes(Buffer.from('data'))).toBe(true);
    } else {
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
      expect(gltf.buffers.every((b: any) => !b.uri)).toBe(true);
      expect((gltf.images ?? []).every((i: any) => i.bufferView !== undefined || i.uri?.startsWith('data:'))).toBe(true);
      if (asset.kind === 'model') expect(gltf.meshes.length).toBeGreaterThan(0);
      else expect(gltf.animations.length).toBeGreaterThan(0);
    }
  });

  it('registers models and animations and keeps presets independent', () => {
    const register = vi.fn();
    registerFpsStarterAssets({ register });
    expect(register).toHaveBeenCalledTimes(17);
    expect(new Set(FPS_STARTER_CONTENT.assets.map(a => a.id)).size).toBe(28);
    const weapons = createFpsStarterWeapons();
    expect(weapons[0].fireRate).toBe(12.5);
    expect(weapons[4].modelAssetId).toBe('fps_mp4');
    weapons[0].damage = 999;
    expect(createFpsStarterWeapons()[0].damage).toBe(34);
    expect(FPS_STARTER_CONTENT.licenseStatus).toBe('unverified');
  });
});

describe('FPS starter gameplay integration', () => {
  it('retains imported tuning and sounds on slot changes; semi-auto requires release', () => {
    const engine = createMockEngine();
    engine.audio.play = vi.fn();
    const manager = new GameplayFeatureManager(engine);
    engine.gameplayFeatures = manager;
    manager.applyPreset('fps_starter');
    expect(manager.ranged.weapon?.id).toBe('fps_ak47');
    expect(manager.ranged.getConfig().showViewModel).toBe(true);
    expect(manager.ranged.trigger(true)).toBe(true);
    manager.ranged.update(0.1);
    expect(manager.ranged.trigger(true)).toBe(true);
    manager.loadout.selectSlot(4);
    expect(manager.ranged.weapon?.audioFire).toContain('pistol-fire.wav');
    expect(manager.ranged.weapon?.modelAssetId).toBe('fps_hipoint');
    manager.ranged.trigger(false);
    manager.ranged.update(0.3);
    expect(manager.ranged.trigger(true)).toBe(true);
    manager.ranged.update(0.3);
    expect(manager.ranged.trigger(true)).toBe(false);
    manager.ranged.trigger(false);
    expect(manager.ranged.trigger(true)).toBe(true);
    expect(engine.audio.play).toHaveBeenLastCalledWith('/assets/fps-starter/audio/pistol-fire.wav', expect.anything());
    const saved = manager.toJSON();
    manager.fromJSON(saved);
    expect(manager.ranged.getConfig().weapons).toEqual(createFpsStarterWeapons());
    manager.dispose();
  });

  it('renders thrown grenades, plays their explosion and releases their asset', async () => {
    const engine = createMockEngine();
    engine.viewport.scene = new THREE.Scene();
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    engine.manifest = { load: vi.fn(async () => model.clone()) };
    engine.assetCache = { release: vi.fn() };
    engine.audio.play = vi.fn();
    const manager = new GameplayFeatureManager(engine);
    engine.gameplayFeatures = manager;
    manager.applyPreset('fps_starter');
    expect(manager.explosives.throwGrenade()).toBe(true);
    await Promise.resolve();
    const grenade = engine.viewport.scene.children.find((x: THREE.Object3D) => x.name === 'ContentModel:fps_grenade');
    expect(grenade?.children.length).toBe(1);
    manager.explosives.update(3);
    expect(manager.explosives.grenades).toHaveLength(0);
    expect(grenade.parent).toBeNull();
    expect(engine.audio.play).toHaveBeenCalledWith('/assets/fps-starter/audio/explosion.wav', expect.anything());
    expect(engine.assetCache.release).toHaveBeenCalledWith('fps_grenade');
    manager.dispose();
  });
});

describe('content model lifetime', () => {
  it('normalizes in local space and isolates overlay materials', async () => {
    const source = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    source.position.set(8, 3, 4);
    source.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), material));
    const release = vi.fn();
    const instance = new ContentModelInstance({ load: async () => source }, { release }, 'test', 0.6, true);
    instance.root.position.set(100, 2, 0);
    expect(await instance.ready).toBe(true);
    const bounds = new THREE.Box3().setFromObject(instance.root);
    expect(bounds.getCenter(new THREE.Vector3()).distanceTo(instance.root.position)).toBeLessThan(1e-5);
    expect(bounds.getSize(new THREE.Vector3()).z).toBeCloseTo(0.6);
    expect((source.children[0] as THREE.Mesh).material).not.toBe(material);
    expect(material.depthTest).toBe(true);
    instance.dispose(); instance.dispose();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases a late checkout after disposal without attaching a ghost model', async () => {
    let resolve!: (g: THREE.Group) => void;
    const load = new Promise<THREE.Group>(r => { resolve = r; });
    const release = vi.fn();
    const instance = new ContentModelInstance({ load: () => load }, { release }, 'late', 1);
    instance.dispose();
    resolve(new THREE.Group());
    expect(await instance.ready).toBe(false);
    expect(instance.root.children).toHaveLength(0);
    expect(release).toHaveBeenCalledExactlyOnceWith('late');
  });

  it('installs one canonical for concurrent requests without disposing its textures', async () => {
    const source = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    source.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
    const cache = new AssetCache();
    const queue = { enqueue: vi.fn(async () => source) };
    const manifest = new AssetManifest(queue as any, cache);
    manifest.register({ id: 'gun', path: '/gun.glb', type: 'prop', tags: [] });
    const models = await Promise.all([manifest.load('gun'), manifest.load('gun'), manifest.load('gun')]);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
    expect(new Set(models).size).toBe(3);
    cache.release('gun'); cache.release('gun');
    expect(dispose).not.toHaveBeenCalled();
    cache.release('gun');
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
