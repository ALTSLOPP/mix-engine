import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DecalSystem } from '../src/rendering/DecalSystem';

describe('Decal Projection System (S12)', () => {
  it('spawns decals oriented along surface normal and removes expired decals', () => {
    const scene = new THREE.Scene();
    const decalSys = new DecalSystem(scene);

    const mesh = decalSys.spawnDecal({
      position: new THREE.Vector3(0, 1, 0),
      normal: new THREE.Vector3(0, 1, 0), // facing UP
      size: 0.5,
      lifespan: 2.0,
      fadeDuration: 1.0,
    });

    expect(decalSys.activeCount).toBe(1);
    expect(scene.children).toContain(mesh);

    // Advance 1.5s -> fadeout in progress (50% remaining of fade duration)
    decalSys.update(1.5);
    expect(decalSys.activeCount).toBe(1);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    expect(mat.opacity).toBeLessThan(0.9);

    // Advance another 1.0s -> total 2.5s > 2.0s lifespan, should be destroyed
    decalSys.update(1.0);
    expect(decalSys.activeCount).toBe(0);
    expect(scene.children).not.toContain(mesh);
  });
});
