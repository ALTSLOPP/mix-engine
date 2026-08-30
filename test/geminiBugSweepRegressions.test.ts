import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import { LocalizationManager } from '../src/ui/LocalizationManager';
import { VirtualPak } from '../src/export/VirtualPak';
import { AssetCooker } from '../src/export/AssetCooker';
import { GamePackager } from '../src/export/GamePackager';
import { ParallelNode, ActionNode, Blackboard } from '../src/ai/BehaviorTree';
import { InputActionMap, type RawInputState } from '../src/input/InputActionMap';
import { MultiLayerNavMesh } from '../src/ai/MultiLayerNavMesh';
import { WebGPUClusteredLighting } from '../src/rendering/webgpu/WebGPUClusteredLighting';
import { WebGPUComputeParticles } from '../src/vfx/WebGPUComputeParticles';
import { HlodImpostorGenerator } from '../src/rendering/HlodImpostorGenerator';
import { StreamingAudioBank } from '../src/audio/StreamingAudioBank';

/**
 * Regressions for the bug sweep over the roadmap feature drop. Each case below
 * failed before the corresponding fix; they exist to keep the contracts from
 * quietly reverting.
 */
describe('bug sweep regressions', () => {
  it('LocalizationManager.t falls back to the key instead of undefined', () => {
    const loc = new LocalizationManager();
    loc.registerLanguage('en', { greeting: 'Hi {name}' });
    loc.setLanguage('fr');

    // Previously returned undefined, then threw inside str.replace().
    expect(loc.t('unknown_key')).toBe('unknown_key');
    expect(() => loc.t('unknown_key', { name: 'Ada' })).not.toThrow();
    expect(loc.t('greeting', { name: 'Ada' })).toBe('Hi Ada');
  });

  it('ParallelNode require_one reports FAILURE when every child fails', () => {
    const fail = new ActionNode(() => 'FAILURE' as const);
    const node = new ParallelNode([fail, fail], 'require_one');
    // Used to sit on RUNNING forever, wedging the parent branch.
    expect(node.tick(new Blackboard(), 0.016)).toBe('FAILURE');

    const succeed = new ActionNode(() => 'SUCCESS' as const);
    expect(new ParallelNode([fail, succeed], 'require_one').tick(new Blackboard(), 0.016))
      .toBe('SUCCESS');
  });

  it('InputActionMap matches modifiers exactly', () => {
    const map = new InputActionMap();
    map.bind('interact', { type: 'keyboard', code: 'KeyS' });
    map.bind('sprint', { type: 'keyboard', code: 'KeyS', ctrl: true });

    const ctrlHeld: RawInputState = {
      keysDown: new Set(['KeyS']),
      mouseButtonsDown: new Set<number>(),
      ctrlKey: true,
    };
    expect(map.isActionPressed('sprint', ctrlHeld)).toBe(true);
    // Previously true: an unmodified binding also fired under any modifier.
    expect(map.isActionPressed('interact', ctrlHeld)).toBe(false);

    const plain: RawInputState = {
      keysDown: new Set(['KeyS']),
      mouseButtonsDown: new Set<number>(),
      ctrlKey: false,
    };
    expect(map.isActionPressed('interact', plain)).toBe(true);
    expect(map.isActionPressed('sprint', plain)).toBe(false);
  });

  it('MultiLayerNavMesh numbers layers by elevation, not insertion order', () => {
    const nav = new MultiLayerNavMesh({ center: new THREE.Vector3(0, 0, 0), size: 16, cellSize: 1 });
    // Deliberately inserted top-down.
    nav.addSpan(2, 2, { floorY: 8, ceilingY: 11, walkable: true, normalY: 1 });
    nav.addSpan(2, 2, { floorY: 0, ceilingY: 3, walkable: true, normalY: 1 });
    nav.addSpan(2, 2, { floorY: 4, ceilingY: 7, walkable: true, normalY: 1 });

    // Cell (2,2) sits at world (originX + 2.5) = -5.5 for a size-16 grid at origin.
    const spans = nav.spansAt(-5.5, -5.5);
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.floorY)).toEqual([0, 4, 8]);
    // layerId used to come from insertion order, so the roof claimed layer 0.
    expect(spans.map((s) => s.layerId)).toEqual([0, 1, 2]);
  });

  it('VirtualPak.extract rejects a corrupted payload', () => {
    const pak = VirtualPak.pack([{ path: 'a.bin', data: new Uint8Array([1, 2, 3, 4]) }]);
    expect(Array.from(VirtualPak.extract(pak, 'a.bin')!)).toEqual([1, 2, 3, 4]);

    const corrupt = new Uint8Array(pak);
    corrupt[VirtualPak.HEADER_SIZE] = 0xff;
    // Previously returned the garbage bytes with no complaint.
    expect(() => VirtualPak.extract(corrupt, 'a.bin')).toThrow(/checksum/i);
    expect(Array.from(VirtualPak.extract(corrupt, 'a.bin', false)!)).toEqual([0xff, 2, 3, 4]);
  });

  it('AssetCooker keeps the real extension when it did not transcode', () => {
    const cooker = new AssetCooker();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const { record } = cooker.cookAsset('tex/wall.png', png);
    // Renaming to .ktx2 while passing PNG bytes through broke extension-keyed loaders.
    expect(record.cookedPath).toBe('tex/wall.png');
    expect(record.targetFormat).toBe('.ktx2');
    expect(record.transcoded).toBe(false);

    // Extensionless paths used to parse their last character as the extension.
    expect(cooker.cookAsset('data/README', png).record.type).toBe('data');
    expect(cooker.cookAsset('data/README', png).record.targetFormat).toBeNull();

    const { report } = cooker.cookAll([{ path: 'tex/wall.png', data: png }]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('.ktx2');
  });

  it('GamePackager escapes the game title in the HTML shell', () => {
    const html = GamePackager.generateWebStandaloneHtml('</title><script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });

  it('packLightBuffer matches the WGSL LightBuffer header layout', () => {
    const cl = new WebGPUClusteredLighting({ maxLights: 4 });
    const packed = cl.packLightBuffer([
      { position: new THREE.Vector3(1, 2, 3), radius: 9, color: new THREE.Color(1, 0, 0), intensity: 5 },
    ]);

    expect(packed.length).toBe(WebGPUClusteredLighting.HEADER_FLOATS + 4 * 8);
    expect(new Uint32Array(packed.buffer, 0, 1)[0]).toBe(1);
    // Light data starts after the header — packing from 0 shifted it by a vec4.
    expect(packed[WebGPUClusteredLighting.HEADER_FLOATS]).toBe(1);
    expect(packed[WebGPUClusteredLighting.HEADER_FLOATS + 3]).toBe(9);
  });

  it('cull shader honours a configured maxLightsPerCluster', () => {
    expect(WebGPUClusteredLighting.getCullLightsComputeShader()).toContain('array<u32, 32>');
    const wgsl = WebGPUClusteredLighting.getCullLightsComputeShader(64);
    expect(wgsl).toContain('array<u32, 64>');
    expect(wgsl).toContain('>= 64u');
  });

  it('particle hash is bounded so velocities cannot explode', () => {
    const wgsl = WebGPUComputeParticles.getParticleComputeShader();
    // Without fract() the hash returns ~1e4 and every particle left the world.
    expect(wgsl).toContain('fract(sin(q) * 43758.5453)');
  });

  it('HLOD bounding sphere does not alias the returned cluster centre', () => {
    const result = HlodImpostorGenerator.generateCluster([
      { position: new THREE.Vector3(0, 0, 0) },
      { position: new THREE.Vector3(10, 0, 0) },
    ]);
    const sphere = result.mesh.geometry.boundingSphere!;
    const before = sphere.center.clone();
    result.center.set(999, 999, 999);
    expect(sphere.center).not.toBe(result.center);
    expect(sphere.center.equals(before)).toBe(true);
  });

  it('StreamingAudioBank ramps volume through update() instead of cutting', () => {
    const bank = new StreamingAudioBank();
    bank.play('bgm', 'a.ogg', { volume: 1 });
    bank.fadeOut('bgm', 1.0);

    const track = bank.getTrack('bgm')!;
    expect(track.targetVolume).toBe(0);
    expect(track.volume).toBe(1);

    bank.update(0.5);
    // Previously targetVolume was set and never read, so nothing interpolated.
    expect(track.volume).toBeCloseTo(0.5, 5);

    bank.update(0.5);
    expect(track.volume).toBe(0);
    expect(track.isPlaying).toBe(false);
  });
});
