import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MorphTargetSystem } from '../src/animation/MorphTargetSystem';

describe('MorphTargetSystem & Facial Blendshapes (S7)', () => {
  it('sets, gets, lists, and tweens blendshape weights', () => {
    const morphSys = new MorphTargetSystem();

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());

    mesh.morphTargetDictionary = {
      smile: 0,
      blink_left: 1,
      blink_right: 2,
    };
    mesh.morphTargetInfluences = [0, 0, 0];

    expect(morphSys.listMorphs(mesh)).toEqual(['smile', 'blink_left', 'blink_right']);

    // 1. Direct instant set
    morphSys.setWeight(mesh, 'smile', 0.8, 0);
    expect(morphSys.getWeight(mesh, 'smile')).toBe(0.8);
    expect(mesh.morphTargetInfluences[0]).toBe(0.8);

    // 2. Smooth tween over 0.2s
    morphSys.setWeight(mesh, 'blink_left', 1.0, 0.2);
    expect(morphSys.getWeight(mesh, 'blink_left')).toBe(0);

    // Advance 0.1s
    morphSys.update(0.1);
    expect(mesh.morphTargetInfluences[1]).toBeCloseTo(0.5, 2);

    // Advance remaining 0.1s
    morphSys.update(0.1);
    expect(mesh.morphTargetInfluences[1]).toBeCloseTo(1.0, 2);
  });

  it('decays facial morph weights beyond LOD threshold', () => {
    const morphSys = new MorphTargetSystem();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.position.set(0, 0, 0);
    mesh.morphTargetDictionary = { smile: 0 };
    mesh.morphTargetInfluences = [0.8];

    // Tween smile to 1.0
    morphSys.setWeight(mesh, 'smile', 1.0, 0.5);

    // Camera at 30m distance (> 20m LOD threshold)
    const cameraPos = new THREE.Vector3(0, 0, 30);
    morphSys.update(2.5, cameraPos);

    // Weight decays to 0
    expect(mesh.morphTargetInfluences[0]).toBe(0);
  });
});
