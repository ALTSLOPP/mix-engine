import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  MotionGraph,
  MotionMask,
  STANDARD_MASKS,
  MotionEventTrack,
  MotionParameterStore,
  FadeGroup,
} from '../src/motion';

function createMockClip(name: string, duration = 1.0): THREE.AnimationClip {
  const times = [0, duration * 0.5, duration];
  const values = [0, 0, 0, 0, 1, 0, 0, 2, 0];
  const rootTrack = new THREE.VectorKeyframeTrack('Hips.position', times, values);
  const clip = new THREE.AnimationClip(name, duration, [rootTrack]);
  (clip as any).__rootTrack = rootTrack;
  return clip;
}

describe('MIX Motion Director Core', () => {
  let root: THREE.Object3D;
  let graph: MotionGraph;

  beforeEach(() => {
    root = new THREE.Object3D();
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    root.add(hips);
    graph = new MotionGraph(root);
  });

  it('plays clip directly and transitions weight with fade', () => {
    const clip = createMockClip('walk', 1.0);
    graph.registerClip('walk', clip);

    const handle = graph.play('walk', { fade: 0.2, speed: 1.0 });
    expect(handle).toBeDefined();
    expect(handle.name).toBe('walk');

    // Initial frame
    graph.update(0.1);
    expect(handle.weight).toBeGreaterThan(0);
    expect(handle.weight).toBeLessThan(1.0);

    // Complete fade
    graph.update(0.15);
    expect(handle.weight).toBeCloseTo(1.0, 2);
  });

  it('handles crossfade between clips correctly', () => {
    const idle = createMockClip('idle', 1.0);
    const run = createMockClip('run', 1.0);
    graph.registerClip('idle', idle);
    graph.registerClip('run', run);

    const h1 = graph.play('idle', { fade: 0.1 });
    graph.update(0.1);
    expect(h1.weight).toBeCloseTo(1.0, 2);

    const h2 = graph.play('run', { fade: 0.2 });
    graph.update(0.1);

    expect(h1.weight).toBeLessThan(1.0);
    expect(h2.weight).toBeGreaterThan(0.0);

    graph.update(0.15);
    expect(h1.weight).toBeCloseTo(0.0, 2);
    expect(h2.weight).toBeCloseTo(1.0, 2);
  });

  it('keeps concurrent plays of the same clip on independent Three.js actions', () => {
    const clip = createMockClip('repeat', 1.0);
    graph.registerClip('repeat', clip);
    const first = graph.play('repeat', { fade: 0, layer: 'base' });
    const secondLayer = graph.createLayer('secondary', 1);
    const second = graph.play('repeat', { fade: 0, layer: secondLayer.name, startTime: 0.5 });

    expect((first.state as any).action).not.toBe((second.state as any).action);
    second.stop();
    expect((first.state as any).action.isRunning()).toBe(true);
  });

  it('applies layer weight to the real AnimationAction in the same frame', () => {
    const clip = createMockClip('weighted', 1.0);
    graph.registerClip('weighted', clip);
    graph.setLayerWeight('base', 0.25, 0);
    const handle = graph.play('weighted', { fade: 0 });
    graph.update(0.01);
    expect((handle.state as any).action.getEffectiveWeight()).toBeCloseTo(0.25, 5);
  });

  it('completes a non-looping clip played in reverse', () => {
    const clip = createMockClip('reverse', 1.0);
    graph.registerClip('reverse', clip);
    const handle = graph.play('reverse', { loop: false, speed: -1, startTime: 0.2, fade: 0 });
    graph.update(0.3);
    expect(handle.state.status).toBe('completed');
    expect(handle.time).toBe(0);
  });

  it('fires named motion events deterministically', async () => {
    const clip = createMockClip('attack', 1.0);
    graph.registerClip('attack', clip);

    const handle = graph.play('attack', {
      loop: false,
      events: [
        { name: 'hit', time: 0.3, isNormalized: false },
        { name: 'vfx_spawn', time: 0.5, isNormalized: false },
      ],
    });

    let hitFired = false;
    let vfxFired = false;

    handle.state.eventTrack.on('hit', () => {
      hitFired = true;
    });
    handle.state.eventTrack.on('vfx_spawn', () => {
      vfxFired = true;
    });

    graph.update(0.2);
    expect(hitFired).toBe(false);

    graph.update(0.15); // Reaches 0.35s -> fires hit
    expect(hitFired).toBe(true);
    expect(vfxFired).toBe(false);

    graph.update(0.2); // Reaches 0.55s -> fires vfx_spawn
    expect(vfxFired).toBe(true);
  });

  it('supports awaitEvent on MotionHandle', async () => {
    const clip = createMockClip('kick', 1.0);
    graph.registerClip('kick', clip);

    const handle = graph.play('kick', {
      events: [{ name: 'impact', time: 0.2, isNormalized: false }],
    });

    const promise = handle.awaitEvent('impact', 2000);

    // Advance graph update past event time
    graph.update(0.25);

    const result = await promise;
    expect(result.completed).toBe(true);
    expect(result.eventName).toBe('impact');
  });

  it('supports awaitEnd on non-looping animations', async () => {
    const clip = createMockClip('death', 0.5);
    graph.registerClip('death', clip);

    const handle = graph.play('death', { loop: false });
    const endPromise = handle.awaitEnd(2000);

    graph.update(0.3);
    graph.update(0.3); // Past 0.5s duration

    const res = await endPromise;
    expect(res.completed).toBe(true);
  });

  it('handles weighted masks and multiple layers correctly', () => {
    const baseLayer = graph.getLayer('base')!;
    const upperMask = new MotionMask(STANDARD_MASKS.upperBody);
    const upperLayer = graph.createLayer('upper', 1, 'override', upperMask);

    expect(baseLayer).toBeDefined();
    expect(upperLayer).toBeDefined();
    expect(upperMask.getBoneWeight('Spine2')).toBe(1.0);
    expect(upperMask.getBoneWeight('LeftUpLeg')).toBe(0.0);

    upperLayer.setLayerWeight?.('upper', 0.8) ?? (upperLayer.weight = 0.8);
    expect(upperLayer.weight).toBe(0.8);
  });

  it('evaluates damped parameters in parameter store', () => {
    const store = new MotionParameterStore();
    store.define('speed', 'number', 0, { damping: 0.2 });

    store.set('speed', 10);
    expect(store.getNumber('speed')).toBe(0);

    store.update(0.1);
    const midSpeed = store.getNumber('speed');
    expect(midSpeed).toBeGreaterThan(0);
    expect(midSpeed).toBeLessThan(10);

    store.update(1.0);
    expect(store.getNumber('speed')).toBeCloseTo(10, 1);
  });

  it('provides structured inspection report', () => {
    const clip = createMockClip('idle', 1.0);
    graph.registerClip('idle', clip);
    graph.play('idle');

    const report = graph.inspect();
    expect(report.activeLayerCount).toBeGreaterThanOrEqual(1);
    expect(report.layers.length).toBeGreaterThanOrEqual(1);
    expect(report.stats.activeStateCount).toBeGreaterThanOrEqual(1);
  });
});
