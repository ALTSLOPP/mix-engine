import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeCompoundBoxes } from '../src/assets/compoundCollider';

function boxMesh(name: string, pos: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  m.name = name;
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

describe('computeCompoundBoxes', () => {
  it('emits one box per child mesh in ROOT-LOCAL space (group transform removed)', () => {
    const group = new THREE.Group();
    group.position.set(5, 0, 5); // offset so we prove the transform is divided out
    group.add(boxMesh('left', [-1, 0, 0]));
    group.add(boxMesh('right', [1, 0, 0]));
    group.updateMatrixWorld(true);

    const boxes = computeCompoundBoxes(group);
    expect(boxes.length).toBe(2);
    // Each BoxGeometry(2) has half-extent 1; centres at ±1 in root-local space.
    for (const b of boxes) {
      expect(b.half.x).toBeCloseTo(1, 3);
      expect(b.half.y).toBeCloseTo(1, 3);
      expect(b.half.z).toBeCloseTo(1, 3);
    }
    const xs = boxes.map((b) => b.center.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-1, 3);
    expect(xs[1]).toBeCloseTo(1, 3);
  });

  it('skips *Helper meshes', () => {
    const group = new THREE.Group();
    group.add(boxMesh('body', [0, 0, 0]));
    group.add(boxMesh('BulbHelper', [3, 0, 0]));
    group.updateMatrixWorld(true);
    expect(computeCompoundBoxes(group).length).toBe(1);
  });

  it('falls back to a single whole-object box when there are no qualifying meshes', () => {
    const group = new THREE.Group();
    group.add(new THREE.Object3D()); // no geometry
    group.updateMatrixWorld(true);
    const boxes = computeCompoundBoxes(group);
    expect(boxes.length).toBe(1);
  });
});
