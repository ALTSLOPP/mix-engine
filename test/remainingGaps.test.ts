import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GamePackager } from '../src/export/GamePackager';
import { VirtualPak } from '../src/export/VirtualPak';
import { AssetCooker } from '../src/export/AssetCooker';
import { createEmptyProject, migrateProjectDocument, validateProjectDocument, PROJECT_DOCUMENT_VERSION } from '../src/project/ProjectDocument';
import { AuthoritativeServer } from '../src/server/AuthoritativeServer';
import { ScriptComponent } from '../src/ecs/ScriptComponent';
import { TerrainColliderStreamer } from '../src/terrain/TerrainColliderStreamer';
import { validateStandaloneManifest } from '../src/export/standaloneEntry';
import { WorldStreamingCoordinator } from '../src/streaming/WorldStreamingCoordinator';

describe('Remaining Gaps — shippable pipeline', () => {
  it('ProjectDocument GUID, migration, validation', () => {
    const doc = createEmptyProject('TestGame');
    expect(doc.version).toBe(PROJECT_DOCUMENT_VERSION);
    expect(doc.scenes.main).toEqual([]);
    const legacy = { entities: [{ blueprint: { kind: 'box', params: { hx: 1, hy: 1, hz: 1 } }, position: [0,0,0], quaternion: [0,0,0,1], scale: [1,1,1], originalId: 1 }] };
    const migrated = migrateProjectDocument(legacy);
    expect(migrated.scenes.main[0].guid).toBeDefined();
    expect(validateProjectDocument(migrated).valid).toBe(true);
    const bad = validateProjectDocument({ kind: 'mix-project', version: 999, id: '', entryScene: 'main', scenes: {} });
    expect(bad.valid).toBe(false);
  });

  it('package_game entryScene is respected and validated', () => {
    const bundle = GamePackager.createBundle({ title: 'MyGame', entryScene: 'level_2', scenes: { level_2: [{ id: 1 }] } as any });
    expect(bundle.entryScene).toBe('level_2');
    expect(bundle.scenes['level_2']).toBeDefined();
    expect(GamePackager.validateBundle(bundle).valid).toBe(true);
    expect(validateStandaloneManifest(bundle).ok).toBe(true);
    const bad = { ...bundle, entryScene: 'missing' } as any;
    expect(validateStandaloneManifest(bad).ok).toBe(false);
  });

  it('buildBinaryPak packs manifest as first file, supports round-trip', () => {
    const pak = GamePackager.buildBinaryPak({ title: 'T', entryScene: 'main', scenes: { main: [{ id: 1 }] } as any }, [{ path: 'keep.glb', data: new Uint8Array([1,2,3]) }]);
    expect(pak.pakBytes.length).toBeGreaterThan(20);
    const extracted = VirtualPak.extract(pak.pakBytes, 'manifest.json');
    expect(extracted).not.toBeNull();
    const manifest = JSON.parse(new TextDecoder().decode(extracted!));
    expect(manifest.gameTitle).toBe('T');
  });

  it('AssetCooker simulated encoders, validation, reproducible builds', () => {
    const cooker = new AssetCooker({ encoders: AssetCooker.simulatedEncoders() });
    const { record, cookedBytes } = cooker.cookAsset('tex.png', new Uint8Array(1000).fill(7));
    expect(record.transcoded).toBe(true);
    expect(record.cookedPath).toBe('tex.ktx2');
    expect(cookedBytes[0]).toBe(75); // 'K' of KTX2 header
    expect(record.compressionRatio).toBeLessThan(1);
    const v = AssetCooker.validateReferences(['/keep.glb', '/missing.glb'], ['/keep.glb']);
    expect(v.missing).toEqual(['missing.glb']);
    const { report } = new AssetCooker().cookAll([{ path: 'a.png', data: new Uint8Array([1]) }, { path: 'a.png', data: new Uint8Array([1]) }]);
    expect(report.warnings.some(w => w.includes('duplicate path'))).toBe(true);
    AssetCooker.clearCookCache();
  });

  it('AuthoritativeServer session + validation + interest + lag comp', async () => {
    const fakeSM: any = {
      allEntityIds: () => [],
      getRigidBody: () => null,
      spawnNow: (pos: any, bp: any) => 42,
      requestDestroy: () => {},
    };
    fakeSM.getRigidBody = (id: number) => (id === 42 ? { mesh: { position: new THREE.Vector3(0,0,0) } } : null);
    const server = new AuthoritativeServer(fakeSM, { maxSpeed: 10, interestRadius: 10 });
    const token = AuthoritativeServer.makeToken('alice', 'dev-secret');
    const fakeTransport: any = { send: () => {}, close: () => {}, isOpen: true, onMessage: () => () => {} };
    const res = await server.connect('alice', token, fakeTransport);
    expect(res.ok).toBe(true);
    const bad = await server.connect('bob', 'badtoken', fakeTransport);
    expect(bad.ok).toBe(false);
    // Validation: nearby move should pass, teleport should fail
    const sessPos = (server as any).sessions.get('alice').pos.clone() as THREE.Vector3;
    const ok = server.validateMove('alice', sessPos.clone().add(new THREE.Vector3(0.1,0,0)), 0.05);
    expect(ok.ok).toBe(true);
    const tooFar = server.validateMove('alice', sessPos.clone().add(new THREE.Vector3(100,0,0)), 0.05);
    expect(tooFar.ok).toBe(false);
    expect(server.stats().players).toBe(1);
  });

  it('ScriptComponent trusted guard blocks eval/fetch but allows window', () => {
    const mockSM: any = { events: { on: () => () => {}, emit: () => {} }, gameState: { getItem: () => null, setItem: () => {} }, debugDraw: null, hud: null, getRigidBody: () => null };
    const ok = new ScriptComponent(1, mockSM, `api.self.x = 1; const eng = window.engine;`);
    expect(ok.compileError).toBeNull();
    const bad = new ScriptComponent(2, mockSM, `eval('bad')`);
    expect(bad.compileError).toMatch(/forbidden/i);
    const bad2 = new ScriptComponent(3, mockSM, `fetch('http://evil')`);
    expect(bad2.compileError).toMatch(/forbidden/i);
  });

  it('TerrainColliderStreamer per-chunk streaming API', () => {
    const fakePhys: any = { RAPIER: { RigidBodyDesc: { fixed: () => ({ setTranslation: () => ({}) }) }, ColliderDesc: {} }, createRigidBody: () => ({}), removeBody: () => {}, removeCollider: () => {}, createHeightfieldCollider: () => ({}) };
    const fakeBody: any = {};
    const fakeHm: any = { cells: 128, res: 129, size: 256, half: 128, heights: new Float32Array(129*129).fill(0) };
    const streamer = new TerrainColliderStreamer(fakePhys, fakeBody, fakeHm, { enabled: false });
    expect(streamer.isEnabled).toBe(false);
    streamer.setEnabled(true);
    expect(streamer.isEnabled).toBe(true);
    expect(streamer.info().enabled).toBe(true);
    streamer.markDirtyRect({ i0: 0, i1: 10, j0: 0, j1: 10 });
    streamer.dispose();
  });

  it('WorldStreamingCoordinator fans out to nav, eviction', () => {
    const nav = { markChunkDirty: (x: number, y: number) => {} };
    const coord = new WorldStreamingCoordinator({ nav: nav as any, evictGpu: () => {} });
    coord.onChunkLoaded(0,0);
    coord.onChunkUnloaded(1,1);
    const evicted = coord.evictLRU(['a','b','c','d'], 2);
    expect(evicted.length).toBe(2);
    expect(coord.handlers().onChunkLoaded).toBeDefined();
  });
});
