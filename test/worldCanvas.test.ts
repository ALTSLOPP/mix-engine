import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldCanvas } from '../src/ui/WorldCanvas';

describe('WorldCanvas 3D In-World UI (S8)', () => {
  it('creates canvas texture and renders text with background', () => {
    const canvas = new WorldCanvas({
      width: 2.0,
      height: 1.0,
      resolution: [256, 128],
      billboard: 'camera',
    });

    expect(canvas.mesh).toBeDefined();
    expect(canvas.canvas.width).toBe(256);
    expect(canvas.canvas.height).toBe(128);

    canvas.drawText('HEALTH 100%', 128, 64, {
      color: '#00ff00',
      background: 'rgba(0,0,0,0.8)',
    });

    expect(canvas.texture.version).toBeGreaterThan(0);

    // Test camera billboard
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);

    canvas.update(camera);
    expect(canvas.mesh.quaternion.y).toBeCloseTo(camera.quaternion.y, 4);

    canvas.dispose();
  });

  it('supports yaw-only cylindrical billboard mode', () => {
    const canvas = new WorldCanvas({
      billboard: 'yaw_only',
    });
    canvas.mesh.position.set(0, 0, 0);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    // Camera is elevated and to the side
    camera.position.set(10, 10, 0);

    canvas.update(camera);
    // Pitch/roll should remain 0 while yaw rotates toward camera
    expect(canvas.mesh.quaternion.x).toBe(0);
    expect(canvas.mesh.quaternion.z).toBe(0);
    expect(canvas.mesh.quaternion.y).not.toBe(0);

    canvas.dispose();
  });
});
