import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { DeformableGroundSystem } from '../src/features/destruction/DeformableGroundSystem';
import { createMockEngine } from './helpers/gameplayEngine';

describe('DeformableGroundSystem — Ground Impact Craters & Vertex Denting', () => {
  let engine: any;
  let groundSystem: DeformableGroundSystem;
  let floorMesh: THREE.Mesh;

  beforeEach(() => {
    engine = createMockEngine();
    groundSystem = new DeformableGroundSystem(engine, {
      enabled: true,
      maxDepth: 5.0,
      defaultRadius: 4.0,
      defaultDepth: 1.5,
      defaultLipHeight: 0.4,
    });

    // Create a 20x20 planar ground grid with 40 segments
    const planeGeo = new THREE.PlaneGeometry(20, 20, 40, 40);
    planeGeo.rotateX(-Math.PI / 2); // Orient upwards facing +Y
    planeGeo.computeVertexNormals();

    floorMesh = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial());
    groundSystem.registerGroundMesh(floorMesh);
  });

  it('dents vertices downward at the impact center and creates a raised rim lip', () => {
    const impactPoint = new THREE.Vector3(0, 0, 0);
    const record = groundSystem.createCrater(impactPoint, {
      radius: 4.0,
      depth: 1.5,
      lipHeight: 0.4,
    });

    expect(record).not.toBeNull();
    expect(record?.radius).toBe(4.0);
    expect(record?.depth).toBe(1.5);

    const posAttr = floorMesh.geometry.getAttribute('position');
    let foundDepression = false;
    let foundLip = false;

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const dist = Math.sqrt(x * x + z * z);

      if (dist < 0.5) {
        // Center should be depressed
        if (y < -1.0) foundDepression = true;
      } else if (dist > 3.0 && dist < 3.8) {
        // Outer rim should be pushed above initial 0 height
        if (y > 0.05) foundLip = true;
      }
    }

    expect(foundDepression).toBe(true);
    expect(foundLip).toBe(true);
  });

  it('clamps maximum depth to avoid punching through finite mesh boundaries', () => {
    const impactPoint = new THREE.Vector3(0, 0, 0);
    // Huge impact attempting 15m crater on a 5m max depth setting
    groundSystem.createCrater(impactPoint, {
      radius: 4.0,
      depth: 15.0,
      maxDepth: 5.0,
    });

    const posAttr = floorMesh.geometry.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      expect(posAttr.getY(i)).toBeGreaterThanOrEqual(-5.0);
    }
  });

  it('resets all ground meshes back to pristine state', () => {
    groundSystem.createCrater(new THREE.Vector3(0, 0, 0), { depth: 2.0 });
    expect(groundSystem.getCraters().length).toBe(1);

    groundSystem.resetAllGround();
    expect(groundSystem.getCraters().length).toBe(0);

    const posAttr = floorMesh.geometry.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      expect(posAttr.getY(i)).toBeCloseTo(0, 4);
    }
  });
});
