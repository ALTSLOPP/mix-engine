import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TweenDirectorManager } from '../src/tween/TweenDirectorManager';
import { TweenPath } from '../src/tween/TweenPath';

describe('TweenTransforms — Movements, Rotations, Splines & Physics Helpers', () => {
  let manager: TweenDirectorManager;

  beforeEach(() => {
    manager = new TweenDirectorManager();
  });

  it('moves object smoothly to target vector', () => {
    const mesh = new THREE.Object3D();
    manager.move(mesh, { x: 10, y: 5, z: -2 }, { duration: 1.0, ease: 'linear' });

    manager.update(0.5);
    expect(mesh.position.x).toBeCloseTo(5, 4);
    expect(mesh.position.y).toBeCloseTo(2.5, 4);
    expect(mesh.position.z).toBeCloseTo(-1, 4);

    manager.update(0.5);
    expect(mesh.position.x).toBeCloseTo(10, 4);
  });

  it('handles world move under parent hierarchy transformation', () => {
    const parent = new THREE.Object3D();
    parent.position.set(10, 0, 0);
    parent.updateMatrixWorld();

    const child = new THREE.Object3D();
    parent.add(child);

    // Target world position (15, 5, 0) -> in parent's local space should be (5, 5, 0)
    manager.moveWorld(child, { x: 15, y: 5, z: 0 }, { duration: 1.0, ease: 'linear' });

    manager.update(1.0);
    expect(child.position.x).toBeCloseTo(5, 3);
    expect(child.position.y).toBeCloseTo(5, 3);
  });

  it('looks at target point smoothly using LookAt helper', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);

    manager.lookAt(camera, new THREE.Vector3(10, 0, 10), { duration: 1.0, ease: 'linear' });

    manager.update(1.0);
    // Camera is at (0, 0, 10) looking right towards (10, 0, 10), so rotation around Y should be ~ -PI/2
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion);
    expect(euler.y).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('performs decaying punch spring oscillation on position', () => {
    const mesh = new THREE.Object3D();
    manager.punch(mesh, 'position', new THREE.Vector3(0, 2, 0), { duration: 0.5, vibrato: 10 });

    manager.update(0.1);
    expect(mesh.position.y).not.toBe(0);

    manager.update(0.4);
    // After punch finishes, it should decay back close to 0
    expect(Math.abs(mesh.position.y)).toBeLessThan(0.05);
  });

  it('performs constant-speed arc-length parameterization for spline paths', () => {
    const waypoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(10, 10, 0),
      new THREE.Vector3(0, 10, 0),
    ];

    const path = new TweenPath(waypoints, { type: 'linear' });
    expect(path.length).toBeCloseTo(30, 2);

    // Sample halfway by distance (15m along 30m total)
    const midPos = path.samplePosition(0.5);
    expect(midPos.x).toBeCloseTo(10, 2);
    expect(midPos.y).toBeCloseTo(5, 2);
  });

  it('traverses parabolic jump arc trajectory', () => {
    const mesh = new THREE.Object3D();
    manager.jump(mesh, new THREE.Vector3(10, 0, 0), 4.0, 1, { duration: 1.0 });

    manager.update(0.5); // Peak of jump
    expect(mesh.position.x).toBeCloseTo(5, 3);
    expect(mesh.position.y).toBeCloseTo(4, 3); // Peak height

    manager.update(0.5); // Landing
    expect(mesh.position.x).toBeCloseTo(10, 3);
    expect(mesh.position.y).toBeCloseTo(0, 3);
  });
});
