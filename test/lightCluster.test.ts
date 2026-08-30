import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LightCluster } from '../src/rendering/LightCluster';
import { ShadowAtlas } from '../src/rendering/ShadowAtlas';
import { ReflectionProbe } from '../src/rendering/ReflectionProbe';

describe('Clustered Forward+, Shadow Atlas & Reflection Probes (S9)', () => {
  it('allocates and frees tiles dynamically in ShadowAtlas', () => {
    const atlas = new ShadowAtlas(1024);

    // Allocate two 512x512 tiles
    const tile1 = atlas.allocate('sun', 512);
    const tile2 = atlas.allocate('spot1', 512);

    expect(tile1).toBeDefined();
    expect(tile2).toBeDefined();
    expect(tile1!.size).toBe(512);
    expect(tile2!.size).toBe(512);
    expect(tile1!.x !== tile2!.x || tile1!.y !== tile2!.y).toBe(true);

    // Free tile1 and allocate smaller 256x256 tiles
    atlas.free('sun');
    expect(atlas.getTile('sun')).toBeUndefined();

    const tile3 = atlas.allocate('spot2', 256);
    expect(tile3).toBeDefined();
    expect(tile3!.size).toBe(256);
  });

  it('builds cluster grid and assigns point lights with LightCluster', () => {
    const cluster = new LightCluster({
      slicesX: 16,
      slicesY: 9,
      slicesZ: 24,
    });

    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // Place a light 5m in front of camera
    const lights = [
      { position: new THREE.Vector3(0, 0, -5), radius: 2.0 },
    ];

    cluster.build(lights, camera);

    // Check that at least one cluster recorded the light
    let totalAssigned = 0;
    for (let i = 0; i < cluster.totalClusters; i++) {
      totalAssigned += cluster.clusterLightCounts[i];
    }
    expect(totalAssigned).toBeGreaterThan(0);
  });

  it('manages local reflection probe position and bounds', () => {
    const probe = new ReflectionProbe(new THREE.Vector3(0, 5, 0), {
      boxSize: [10, 8, 12],
    });

    expect(probe.boxMin.x).toBe(-5);
    expect(probe.boxMax.x).toBe(5);
    expect(probe.boxMin.y).toBe(1);
    expect(probe.boxMax.y).toBe(9);

    probe.setPosition(new THREE.Vector3(10, 5, 10));
    expect(probe.boxMin.x).toBe(5);
    expect(probe.boxMax.x).toBe(15);
  });
});
