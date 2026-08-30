import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TweenDirectorManager } from '../src/tween/TweenDirectorManager';

describe('TweenHandleAndLifecycle — Awaitable Handles & Safe Promise Resolution', () => {
  it('resolves awaitComplete when tween reaches target duration', async () => {
    const manager = new TweenDirectorManager();
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const handle = manager.to(mesh, 'position.x', 10, { duration: 0.2 });

    const completionPromise = handle.awaitComplete();

    // Advance engine loop
    manager.update(0.1);
    manager.update(0.15);

    const reason = await completionPromise;
    expect(reason).toBe('completed');
    expect(mesh.position.x).toBeCloseTo(10, 3);
  });

  it('resolves awaitKill safely when killed prematurely with reason', async () => {
    const manager = new TweenDirectorManager();
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const handle = manager.to(mesh, 'position.x', 10, { duration: 1.0 });

    const killPromise = handle.awaitKill();

    handle.kill('cancelled');
    const reason = await killPromise;
    expect(reason).toBe('cancelled');
  });

  it('resolves awaitMarker on timeline sequence traversal', async () => {
    const manager = new TweenDirectorManager();
    const mesh = { position: new THREE.Vector3(0, 0, 0) };

    const seq = manager.sequence('marker_seq')
      .appendMove(mesh, { x: 5 }, 0.5)
      .appendMarker('midway')
      .appendMove(mesh, { x: 10 }, 0.5);

    let markerTriggered = false;
    const markerPromise = seq.getHandle().awaitMarker('midway').then(() => {
      markerTriggered = true;
    });

    manager.update(0.6);
    await markerPromise;
    expect(markerTriggered).toBe(true);
  });

  it('safely resolves all pending promises when director is disposed', async () => {
    const manager = new TweenDirectorManager();
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const handle = manager.to(mesh, 'position.x', 10, { duration: 5.0 });

    const completePromise = handle.awaitComplete();
    manager.dispose();

    const reason = await completePromise;
    expect(reason).toBe('destroyed_target');
  });

  it('awaitStart waits through delay and killed handles retain their reason', async () => {
    const manager = new TweenDirectorManager();
    const target = { value: 0 };
    const handle = manager.to(target, 'value', 1, { duration: 1, delay: 0.5 });
    let started = false;
    handle.awaitStart().then(() => { started = true; });
    await Promise.resolve();
    expect(started).toBe(false);
    manager.update(0.25);
    await Promise.resolve();
    expect(started).toBe(false);
    manager.update(0.3);
    await Promise.resolve();
    expect(started).toBe(true);

    handle.kill('replaced');
    expect(await handle.awaitComplete()).toBe('replaced');
    expect(Number.isNaN(await handle.awaitStep())).toBe(true);
  });
});
