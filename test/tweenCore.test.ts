import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Tween } from '../src/tween/Tween';
import { TweenDirectorManager } from '../src/tween/TweenDirectorManager';

describe('TweenCore — Value Adapters, Types, and Loop Modes', () => {
  it('interpolates scalar numbers accurately', () => {
    const obj = { val: 10 };
    const tw = new Tween(obj, 'val', 50, { duration: 1.0, ease: 'linear' });

    tw.update(0.5);
    expect(obj.val).toBeCloseTo(30, 4);

    tw.update(0.5);
    expect(obj.val).toBeCloseTo(50, 4);
    expect(tw.status).toBe('completed');
  });

  it('interpolates booleans with step flip at mid-progress', () => {
    const obj = { visible: false };
    const tw = new Tween(obj, 'visible', true, { duration: 1.0 });

    tw.update(0.4);
    expect(obj.visible).toBe(false);

    tw.update(0.2);
    expect(obj.visible).toBe(true);
  });

  it('interpolates THREE.Vector3 smoothly', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const tw = new Tween(mesh, 'position', new THREE.Vector3(10, 20, -30), { duration: 2.0, ease: 'linear' });

    tw.update(1.0);
    expect(mesh.position.x).toBeCloseTo(5, 4);
    expect(mesh.position.y).toBeCloseTo(10, 4);
    expect(mesh.position.z).toBeCloseTo(-15, 4);

    tw.update(1.0);
    expect(mesh.position.x).toBeCloseTo(10, 4);
    expect(mesh.position.y).toBeCloseTo(20, 4);
    expect(mesh.position.z).toBeCloseTo(-30, 4);
  });

  it('interpolates THREE.Euler angles via shortest angular path avoiding 360 wrap discontinuities', () => {
    const obj = { rotation: new THREE.Euler(0, 0.1, 0) };
    // Rotate to 2*PI - 0.1 (which is close to -0.1 in angular space)
    const targetAngle = Math.PI * 2 - 0.1;
    const tw = new Tween(obj, 'rotation', new THREE.Euler(0, targetAngle, 0), { duration: 1.0, ease: 'linear' });

    tw.update(0.5);
    // Shortest path should go across 0, so at halfway it should be close to 0
    expect(Math.abs(obj.rotation.y)).toBeLessThan(0.15);
  });

  it('interpolates THREE.Quaternion using shortest-path normalized slerp', () => {
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
    // q2 is 90 degrees around Y, but with opposite sign (-q is identical rotation)
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    q2.set(-q2.x, -q2.y, -q2.z, -q2.w);

    const obj = { quat: q1.clone() };
    const tw = new Tween(obj, 'quat', q2, { duration: 1.0, ease: 'linear' });

    tw.update(0.5);
    // At halfway, angle should be 45 degrees
    const euler = new THREE.Euler().setFromQuaternion(obj.quat);
    expect(euler.y).toBeCloseTo(Math.PI / 4, 3);
  });

  it('interpolates THREE.Color RGB components', () => {
    const material = { color: new THREE.Color(0x000000) };
    const tw = new Tween(material, 'color', new THREE.Color(0xffffff), { duration: 1.0, ease: 'linear' });

    tw.update(0.5);
    expect(material.color.r).toBeCloseTo(0.5, 3);
    expect(material.color.g).toBeCloseTo(0.5, 3);
    expect(material.color.b).toBeCloseTo(0.5, 3);
  });

  it('interpolates typewriter text strings progressively', () => {
    const ui = { text: '' };
    const tw = new Tween(ui, 'text', 'Hello World!', { duration: 1.0, stringMode: 'typewriter' });

    tw.update(0.5);
    expect(ui.text).toBe('Hello ');

    tw.update(0.5);
    expect(ui.text).toBe('Hello World!');
  });

  it('interpolates numeric string counters', () => {
    const ui = { score: '100' };
    const tw = new Tween(ui, 'score', '500', { duration: 1.0, stringMode: 'numeric' });

    tw.update(0.5);
    expect(ui.score).toBe('300');

    tw.update(0.5);
    expect(ui.score).toBe('500');
  });

  it('supports nested dot-property path traversal', () => {
    const entity = {
      transform: {
        position: {
          y: 0,
        },
      },
    };

    const tw = new Tween(entity, 'transform.position.y', 10, { duration: 1.0 });
    tw.update(0.5);
    expect(entity.transform.position.y).toBeCloseTo(5, 4);

    tw.update(0.5);
    expect(entity.transform.position.y).toBeCloseTo(10, 4);
  });

  it('handles Yoyo loop mode correctly', () => {
    const obj = { val: 0 };
    const tw = new Tween(obj, 'val', 10, { duration: 1.0, loops: 2, loopType: 'yoyo', ease: 'linear' });

    tw.update(0.5);
    expect(obj.val).toBeCloseTo(5, 4);

    tw.update(0.5); // loop 1 completes at 10, starts reverse
    expect(obj.val).toBeCloseTo(10, 4);
    expect(tw.isReversed).toBe(true);

    tw.update(0.5); // moving back to 0
    expect(obj.val).toBeCloseTo(5, 4);

    tw.update(0.5); // completes at 0
    expect(obj.val).toBeCloseTo(0, 4);
    expect(tw.status).toBe('completed');
  });

  it('handles Incremental loop mode by accumulating deltas', () => {
    const obj = { val: 0 };
    const tw = new Tween(obj, 'val', 10, { duration: 1.0, loops: 3, loopType: 'incremental', ease: 'linear' });

    tw.update(1.0); // loop 1 end -> 10
    expect(obj.val).toBeCloseTo(10, 4);

    tw.update(0.5); // loop 2 halfway -> 15
    expect(obj.val).toBeCloseTo(15, 4);

    tw.update(0.5); // loop 2 end -> 20
    expect(obj.val).toBeCloseTo(20, 4);

    tw.update(1.0); // loop 3 end -> 30
    expect(obj.val).toBeCloseTo(30, 4);
    expect(tw.status).toBe('completed');
  });

  it('crosses multiple loops deterministically in one large update', () => {
    const obj = { val: 0 };
    const tw = new Tween(obj, 'val', 10, { duration: 1, loops: 4, loopType: 'restart', ease: 'linear' });
    tw.update(3.5);
    expect(tw.loopCount).toBe(3);
    expect(tw.status).toBe('playing');
    expect(obj.val).toBeCloseTo(5, 5);
    tw.update(0.5);
    expect(tw.status).toBe('completed');
    expect(obj.val).toBe(10);
  });

  it('reads nested current values correctly for from tweens', () => {
    const target = { transform: { position: { y: 10 } } };
    const manager = new TweenDirectorManager();
    manager.from(target, 'transform.position.y', 2, { duration: 1, ease: 'linear' });
    manager.update(0.5);
    expect(target.transform.position.y).toBeCloseTo(6, 5);
  });

  it('uses an accumulated fixed clock for object graph tweens', () => {
    const target = { value: 0 };
    const manager = new TweenDirectorManager();
    manager.to(target, 'value', 1, { duration: 1, ease: 'linear', updateMode: 'fixed' });
    manager.update(1 / 120);
    expect(target.value).toBe(0);
    manager.update(1 / 120);
    expect(target.value).toBeCloseTo(1 / 60, 5);
  });

  it('advances manual tweens only through manualUpdate', () => {
    const target = { value: 0 };
    const manager = new TweenDirectorManager();
    manager.to(target, 'value', 10, { duration: 1, ease: 'linear', updateMode: 'manual' });
    manager.update(0.5);
    expect(target.value).toBe(0);
    manager.manualUpdate(0.5);
    expect(target.value).toBeCloseTo(5, 5);
  });

  it('keeps unscaled tweens on wall-clock time while normal tweens follow scaled time', () => {
    const normal = { value: 0 };
    const unscaled = { value: 0 };
    const manager = new TweenDirectorManager();
    manager.to(normal, 'value', 10, { duration: 1, ease: 'linear' });
    manager.to(unscaled, 'value', 10, { duration: 1, ease: 'linear', updateMode: 'unscaled' });
    manager.update(0.25, 0.5);
    expect(normal.value).toBeCloseTo(2.5, 5);
    expect(unscaled.value).toBeCloseTo(5, 5);
  });

  it('handles start delays and loop delays', () => {
    const obj = { val: 0 };
    const tw = new Tween(obj, 'val', 10, { duration: 1.0, delay: 0.5, ease: 'linear' });

    tw.update(0.3);
    expect(obj.val).toBe(0);

    tw.update(0.4); // 0.2 overshoot into duration
    expect(obj.val).toBeCloseTo(2, 4);
  });

  it('supports seek, seekNormalized, rewind, and restart', () => {
    const obj = { val: 0 };
    const tw = new Tween(obj, 'val', 100, { duration: 2.0, ease: 'linear' });

    tw.seek(1.0);
    expect(obj.val).toBeCloseTo(50, 4);

    tw.seekNormalized(0.25);
    expect(obj.val).toBeCloseTo(25, 4);

    tw.rewind();
    expect(obj.val).toBeCloseTo(0, 4);
    expect(tw.status).toBe('paused');

    tw.restart();
    expect(tw.status).toBe('playing');
  });

  it('completes instantaneously when duration is zero', () => {
    const obj = { val: 0 };
    const tw = new Tween(obj, 'val', 50, { duration: 0, ease: 'linear' });
    const done = tw.update(0.1);

    expect(done).toBe(true);
    expect(obj.val).toBe(50);
    expect(tw.status).toBe('completed');
  });

  it('honors finite loop modes when duration is zero', () => {
    const incremental = { val: 0 };
    const loops: number[] = [];
    const tw = new Tween(incremental, 'val', 10, {
      duration: 0,
      loops: 3,
      loopType: 'incremental',
      onLoop: (index) => loops.push(index),
    });
    expect(tw.update(0.1)).toBe(true);
    expect(incremental.val).toBe(30);
    expect(loops).toEqual([1, 2, 3]);

    const yoyo = { val: 0 };
    const yoyoTween = new Tween(yoyo, 'val', 10, { duration: 0, loops: 2, loopType: 'yoyo' });
    expect(yoyoTween.update(0.1)).toBe(true);
    expect(yoyo.val).toBe(0);
  });
});
