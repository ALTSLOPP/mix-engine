import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshSlicer } from '../src/features/destruction/MeshSlicer';

describe('MeshSlicer — Procedural 3D Mesh Slicing', () => {
  it('cleanly slices a cube BufferGeometry along a horizontal plane with solid caps', () => {
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const planePoint = new THREE.Vector3(0, 0, 0);
    const planeNormal = new THREE.Vector3(0, 1, 0); // Horizontal cut through Y=0

    const { positive, negative, cutArea } = MeshSlicer.sliceGeometry(boxGeo, planePoint, planeNormal, {
      capFaces: true,
    });

    // Both positive and negative halves should exist and contain triangles
    const posPos = positive.getAttribute('position');
    const negPos = negative.getAttribute('position');

    expect(posPos).toBeDefined();
    expect(negPos).toBeDefined();
    expect(posPos.count).toBeGreaterThan(0);
    expect(negPos.count).toBeGreaterThan(0);

    // Cross-section cut area of a 2x2 box is 4.0 m^2
    expect(cutArea).toBeGreaterThan(3.5);
    expect(cutArea).toBeLessThan(4.5);

    // All positive vertices should have Y >= -1e-4
    for (let i = 0; i < posPos.count; i++) {
      expect(posPos.getY(i)).toBeGreaterThanOrEqual(-1e-4);
    }

    // All negative vertices should have Y <= 1e-4
    for (let i = 0; i < negPos.count; i++) {
      expect(negPos.getY(i)).toBeLessThanOrEqual(1e-4);
    }
  });

  it('slices a mesh along an angled diagonal plane', () => {
    const cylinderGeo = new THREE.CylinderGeometry(1, 1, 4, 16);
    const planePoint = new THREE.Vector3(0, 0, 0);
    const planeNormal = new THREE.Vector3(1, 1, 0).normalize(); // Diagonal 45-deg cut

    const { positive, negative, cutArea } = MeshSlicer.sliceGeometry(cylinderGeo, planePoint, planeNormal, {
      capFaces: true,
    });

    expect(positive.getAttribute('position').count).toBeGreaterThan(0);
    expect(negative.getAttribute('position').count).toBeGreaterThan(0);
    expect(cutArea).toBeGreaterThan(0);
  });

  it('slices a Three.js Mesh in world space', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(5, 10, 0);
    mesh.updateMatrixWorld(true);

    const planePointWorld = new THREE.Vector3(5, 10, 0);
    const planeNormalWorld = new THREE.Vector3(0, 1, 0);

    const { positiveMesh, negativeMesh, cutArea } = MeshSlicer.sliceMesh(
      mesh,
      planePointWorld,
      planeNormalWorld,
      { capFaces: true }
    );

    expect(positiveMesh.position.x).toBe(5);
    expect(positiveMesh.position.y).toBe(10);
    expect(negativeMesh.position.x).toBe(5);
    expect(negativeMesh.position.y).toBe(10);
    expect(cutArea).toBeGreaterThan(0);
  });
});
