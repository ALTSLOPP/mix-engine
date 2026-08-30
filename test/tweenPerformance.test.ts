import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TweenDirectorManager } from '../src/tween/TweenDirectorManager';
import { TweenPool } from '../src/tween/TweenPool';

describe('TweenPerformance — High-Density Stress Tests & Pool Efficiency', () => {
  it('updates 1,000 simultaneous active scalar tweens deterministically', () => {
    const manager = new TweenDirectorManager();
    const targets: Array<{ val: number }> = [];

    for (let i = 0; i < 1000; i++) {
      const obj = { val: 0 };
      targets.push(obj);
      manager.to(obj, 'val', 100, { duration: 1.0, ease: 'linear' });
    }

    expect(manager.activeTweens.length).toBe(1000);

    const startTime = performance.now();
    manager.update(0.5);
    const midDuration = performance.now() - startTime;

    for (const obj of targets) {
      expect(obj.val).toBeCloseTo(50, 4);
    }

    manager.update(0.5);
    for (const obj of targets) {
      expect(obj.val).toBeCloseTo(100, 4);
    }

    expect(manager.activeTweens.length).toBe(0);
    // 1000 scalar tweens on modern CPU should easily update in < 50ms
    expect(midDuration).toBeLessThan(100);
  });

  it('updates 500 simultaneous active transform tweens efficiently', () => {
    const manager = new TweenDirectorManager();
    const meshes: THREE.Object3D[] = [];

    for (let i = 0; i < 500; i++) {
      const mesh = new THREE.Object3D();
      meshes.push(mesh);
      manager.move(mesh, { x: 10, y: 20, z: 30 }, { duration: 1.0, ease: 'linear' });
    }

    manager.update(0.5);
    for (const mesh of meshes) {
      expect(mesh.position.x).toBeCloseTo(5, 3);
      expect(mesh.position.y).toBeCloseTo(10, 3);
      expect(mesh.position.z).toBeCloseTo(15, 3);
    }

    manager.update(0.5);
    for (const mesh of meshes) {
      expect(mesh.position.x).toBeCloseTo(10, 3);
      expect(mesh.position.y).toBeCloseTo(20, 3);
      expect(mesh.position.z).toBeCloseTo(30, 3);
    }
  });

  it('acquires and releases scratch vectors from TweenPool without memory leak', () => {
    TweenPool.clearPools();

    const v1 = TweenPool.acquireVector3(1, 2, 3);
    expect(v1.x).toBe(1);
    expect(v1.y).toBe(2);
    expect(v1.z).toBe(3);

    TweenPool.releaseVector3(v1);
    expect(TweenPool.getPoolStats().vector3).toBe(1);

    const v2 = TweenPool.acquireVector3(4, 5, 6);
    expect(v2.x).toBe(4);
    expect(TweenPool.getPoolStats().vector3).toBe(0);
  });

  it('survives a multi-second populated-scene-style tween soak without stale nodes', () => {
    const manager = new TweenDirectorManager();
    const targets = Array.from({ length: 250 }, () => ({ value: 0 }));
    for (const target of targets) {
      manager.to(target, 'value', 1, { duration: 2, loops: 2, loopType: 'yoyo', ease: 'linear' });
    }
    for (let frame = 0; frame < 241; frame++) manager.update(1 / 60);
    expect(manager.activeTweens.length).toBe(0);
    expect(targets.every((target) => target.value === 0)).toBe(true);
  });
});
