import { describe, it, expect } from 'vitest';
import { GamePackager } from '../src/export/GamePackager';
import { TauriConfigBuilder } from '../src/export/TauriConfigBuilder';

describe('GamePackager & Standalone Export Pipeline (S10)', () => {
  it('bundles game scenes, assets, and rules into validated manifest', () => {
    const bundle = GamePackager.createBundle({
      title: 'Neon Odyssey',
      entryScene: 'level_1',
      visualStyle: 'cyberpunk',
      referencedAssets: ['model_hero.glb', 'ambient.mp3', 'model_hero.glb'], // dupe asset
      scenes: {
        level_1: [{ id: 1, name: 'Hero' }],
      },
    });

    expect(bundle.gameTitle).toBe('Neon Odyssey');
    expect(bundle.entryScene).toBe('level_1');
    expect(bundle.visualStyle).toBe('cyberpunk');
    expect(bundle.assets.length).toBe(2); // deduplicated

    const validation = GamePackager.validateBundle(bundle);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it('generates valid Tauri desktop packaging config', () => {
    const conf = TauriConfigBuilder.generateTauriConf({
      title: 'Neon Odyssey',
      version: '1.2.0',
      fullscreen: true,
    });

    expect(conf.package).toEqual({
      productName: 'Neon Odyssey',
      version: '1.2.0',
    });

    const tauri = conf.tauri as any;
    expect(tauri.windows[0].title).toBe('Neon Odyssey');
    expect(tauri.windows[0].fullscreen).toBe(true);
    expect(tauri.bundle.identifier).toBe('com.mixengine.neonodyssey');
  });

  it('tree-shakes unreferenced assets and emits installable PWA files', () => {
    const built = GamePackager.buildBinaryPak({
      entryScene: 'main',
      scenes: { main: {} },
      referencedAssets: ['/keep.glb'],
    }, [
      { path: 'keep.glb', data: new Uint8Array([1]) },
      { path: 'unused.glb', data: new Uint8Array([2]) },
    ]);
    expect(built.cookReport.assets.map((asset) => asset.sourcePath)).toEqual(['keep.glb']);

    const pwa = GamePackager.generatePwaFiles('Neon Odyssey');
    expect(pwa.map((file) => file.path)).toEqual([
      'index.html', 'manifest.webmanifest', 'service-worker.js', 'register-sw.js',
    ]);
    expect(new TextDecoder().decode(pwa[0].data)).toContain('manifest.webmanifest');
  });
});
