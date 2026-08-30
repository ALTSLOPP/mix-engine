import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HlodImpostorGenerator } from '../src/rendering/HlodImpostorGenerator';

describe('HlodImpostorGenerator Open-World Billboard Clustering', () => {
  it('creates cross-quad impostor geometry with proper vertex attributes', () => {
    const geom = HlodImpostorGenerator.createCrossQuadGeometry(3.0, 5.0);
    expect(geom).toBeDefined();

    const pos = geom.getAttribute('position');
    const uv = geom.getAttribute('uv');
    const normal = geom.getAttribute('normal');
    const index = geom.getIndex();

    expect(pos.count).toBe(8);
    expect(uv.count).toBe(8);
    expect(normal.count).toBe(8);
    expect(index).not.toBeNull();
  });

  it('clusters multiple prop instances into a single consolidated mesh', () => {
    const treeInstances = [
      { position: new THREE.Vector3(10, 0, 10), scale: new THREE.Vector3(1, 1, 1) },
      { position: new THREE.Vector3(20, 0, 15), scale: new THREE.Vector3(1.2, 1.2, 1.2) },
      { position: new THREE.Vector3(5, 0, 30), scale: new THREE.Vector3(0.8, 0.8, 0.8) },
    ];

    const result = HlodImpostorGenerator.generateCluster(treeInstances, {
      nearDistance: 200,
      farDistance: 1500,
      impostorSize: new THREE.Vector2(3, 6),
    });

    expect(result.mesh).toBeDefined();
    expect(result.mesh.geometry.getAttribute('position').count).toBe(8 * 3); // 3 trees * 8 vertices
    expect(result.nearDistance).toBe(200);
    expect(result.farDistance).toBe(1500);
    expect(result.boundingRadius).toBeGreaterThan(0);
    expect(result.center).toBeDefined();
  });
});
