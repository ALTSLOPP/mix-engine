import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SelectionManager } from '../src/editor/SelectionManager';

describe('SelectionManager multi-select and marquee', () => {
  it('supports set, add, toggle, and primary selection', () => {
    const selection = new SelectionManager();
    selection.set([1, 2], 1);
    selection.add(3);
    expect(selection.list()).toEqual([1, 2, 3]);
    expect(selection.primary).toBe(3);
    selection.toggle(3);
    expect(selection.list()).toEqual([1, 2]);
    expect(selection.primary).toBe(2);
  });

  it('marquee-selects projected entity centers', () => {
    const inside = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    inside.position.set(0, 0, -5);
    const outside = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    outside.position.set(10, 0, -5);
    inside.updateMatrixWorld(true); outside.updateMatrixWorld(true);
    const scene = {
      rigidBodyList: [{ mesh: inside }, { mesh: outside }],
      entityAtIndex: (i: number) => i + 1,
    } as any;
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const selection = new SelectionManager();
    selection.selectScreenRect(scene, camera, 100, 100, 25, 25, 75, 75);
    expect(selection.list()).toEqual([1]);
  });
});
