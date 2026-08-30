// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CullingSystem } from '../src/rendering/CullingSystem';

/**
 * Exercises the hierarchical frustum cull + the software occlusion pass against a tiny
 * synthetic scene. The occlusion test verifies that a box behind a larger box is
 * reported occluded, and a box beside it is not.
 */
function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

function makeBox(x: number, w: number, h: number, d: number, color = 0x888888): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
  mesh.position.set(x, 0, 0);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('CullingSystem (hierarchical frustum + software occlusion)', () => {
  it('frustum-culls an object outside the frustum', () => {
    const scene = new THREE.Scene();
    const cam = makeCamera(); // at z=10 looking towards -Z (origin), far=100, fov=58
    // A box in front of the camera (at the origin) — should be visible.
    const inFront = makeBox(0, 1, 1, 1);
    inFront.position.set(0, 0, 0);
    inFront.updateMatrixWorld(true);
    scene.add(inFront);
    const cull = new CullingSystem(scene, cam, { occlusionEnabled: false, hierarchicalFrustum: true });
    cull.enable();
    cull.cull();
    expect(inFront.visible).toBe(true);
    // Now move it far off to the side (well outside the 58° horizontal FOV at z=0 from z=10).
    // At z=0, the horizontal half-extent of the frustum is tan(29°)*10 ≈ 5.5m. So x=20 is way outside.
    inFront.position.set(20, 0, 0);
    inFront.updateMatrixWorld(true);
    cull.rebuildBVH();
    cull.cull();
    expect(inFront.visible).toBe(false);
  });

  it('keeps an object spawned after enable() visible without a manual rebuild', () => {
    const scene = new THREE.Scene();
    const cam = makeCamera();
    const first = makeBox(0, 1, 1, 1);
    first.position.set(0, 0, 0);
    first.updateMatrixWorld(true);
    scene.add(first);
    const cull = new CullingSystem(scene, cam, { occlusionEnabled: false, hierarchicalFrustum: true });
    cull.enable();
    cull.cull();
    expect(first.visible).toBe(true);
    // Spawn a SECOND object in front of the camera AFTER the BVH snapshot was built (the
    // common case: a particle emitter / trail / spawned entity added during play). It is
    // not in the BVH, so the old code force-hid it every frame. The cull must notice the
    // top-level count changed and auto-rebuild instead of hiding it.
    const spawned = makeBox(0, 1, 1, 1, 0x00ff00);
    spawned.position.set(0, 0, -1);
    spawned.updateMatrixWorld(true);
    scene.add(spawned);
    cull.cull(); // deliberately NO manual rebuildBVH()
    expect(spawned.visible).toBe(true);
    expect(first.visible).toBe(true);
  });

  it('occlusion-culls a box fully behind a larger occluder', () => {
    const scene = new THREE.Scene();
    const cam = makeCamera();
    // A large occluder at the origin (close to the camera).
    const occluder = makeBox(0, 6, 6, 1);
    occluder.userData.occluder = true;
    scene.add(occluder);
    // A small box behind the occluder (further from the camera).
    const hidden = makeBox(0, 1, 1, 1, 0xff0000);
    hidden.position.set(0, 0, -2);
    hidden.updateMatrixWorld(true);
    scene.add(hidden);
    const cull = new CullingSystem(scene, cam, { occlusionEnabled: true, hierarchicalFrustum: true, occlusionResolution: 64 });
    cull.enable();
    cull.cull();
    // The hidden box should be occluded (visible=false) because the occluder covers it.
    expect(occluder.visible).toBe(true);
    expect(hidden.visible).toBe(false);
  });

  it('does NOT occlusion-cull a box beside the occluder', () => {
    const scene = new THREE.Scene();
    const cam = makeCamera();
    const occluder = makeBox(0, 2, 6, 1);
    occluder.userData.occluder = true;
    scene.add(occluder);
    // A box offset to the side — visible to the camera around the occluder's edge.
    const beside = makeBox(4, 1, 1, 1, 0xff0000);
    beside.position.set(4, 0, -2);
    beside.updateMatrixWorld(true);
    scene.add(beside);
    const cull = new CullingSystem(scene, cam, { occlusionEnabled: true, hierarchicalFrustum: true, occlusionResolution: 64 });
    cull.enable();
    cull.cull();
    expect(occluder.visible).toBe(true);
    expect(beside.visible).toBe(true);
  });

  it('disable() restores the original visibility of every object', () => {
    const scene = new THREE.Scene();
    const cam = makeCamera();
    const a = makeBox(0, 1, 1, 1);
    const b = makeBox(20, 1, 1, 1); // off to the side, likely outside a tight frustum
    scene.add(a, b);
    const aWas = a.visible;
    const bWas = b.visible;
    const cull = new CullingSystem(scene, cam, { occlusionEnabled: false });
    cull.enable();
    cull.cull();
    cull.disable();
    expect(a.visible).toBe(aWas);
    expect(b.visible).toBe(bWas);
  });

  it('cull_exclude objects are never touched', () => {
    const scene = new THREE.Scene();
    const cam = makeCamera();
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 0, 20); // behind the camera
    light.userData.cullExclude = true;
    scene.add(light);
    const cull = new CullingSystem(scene, cam, { occlusionEnabled: false });
    cull.enable();
    cull.cull();
    expect(light.visible).toBe(true); // untouched (Three sets lights visible=true by default)
    cull.disable();
  });
});
