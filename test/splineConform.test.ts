import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { splineConform } from '../src/terrain/splineConform';
import { TerrainField } from '../src/terrain/TerrainField';
import { Heightmap } from '../src/terrain/Heightmap';
import { SplatMap } from '../src/terrain/SplatMap';
import type { PhysicsWorld } from '../src/physics/PhysicsWorld';
import type { RigidBodyComponent } from '../src/physics/RigidBodyComponent';

function fakeRb(): RigidBodyComponent {
  return { rapierBody: {} as any, mesh: new THREE.Group() } as unknown as RigidBodyComponent;
}

describe('splineConform pure kernel', () => {
  it('conforms terrain height to the spline', () => {
    const hm = new Heightmap(33, 100);
    const splatMap = new SplatMap(32);
    const material = new THREE.MeshStandardMaterial();
    const field = new TerrainField({} as PhysicsWorld, fakeRb(), hm, splatMap, material, null);

    field.hm.heights.fill(0); // flat ground

    const points = [
      new THREE.Vector3(-10, 5, 0),
      new THREE.Vector3(10, 5, 0),
    ];

    splineConform(field, points, 4, 1.0);

    // Center of the spline should be at height 5
    const centerH = field.hm.sampleLocal(0, 0);
    expect(centerH).toBeCloseTo(5, 1);
    
    // Outside the radius and its neighboring cells, height should remain 0
    const edgeH = field.hm.sampleLocal(0, 10);
    expect(edgeH).toBeCloseTo(0, 1);
  });

  it('carve mode cuts a channel down through a plateau', () => {
    const hm = new Heightmap(33, 100);
    const field = new TerrainField({} as PhysicsWorld, fakeRb(), hm, new SplatMap(32), new THREE.MeshStandardMaterial(), null);
    field.hm.heights.fill(10); // plateau at height 10
    splineConform(field, [new THREE.Vector3(-10, 2, 0), new THREE.Vector3(10, 2, 0)], 4, 1.0, { mode: 'carve' });
    expect(field.hm.sampleLocal(0, 0)).toBeCloseTo(2, 1); // carved down to the channel height
  });

  it('carve never fills terrain that is already below the path (river only digs)', () => {
    const hm = new Heightmap(33, 100);
    const field = new TerrainField({} as PhysicsWorld, fakeRb(), hm, new SplatMap(32), new THREE.MeshStandardMaterial(), null);
    field.hm.heights.fill(0); // ground at 0; path sits ABOVE it at height 5
    splineConform(field, [new THREE.Vector3(-10, 5, 0), new THREE.Vector3(10, 5, 0)], 4, 1.0, { mode: 'carve' });
    expect(field.hm.sampleLocal(0, 0)).toBeCloseTo(0, 1); // unchanged
  });
});
