import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SpringBoneChain, type SphereCollider, type CapsuleCollider } from '../src/physics/SpringBoneChain';
import { SpringBoneSystem } from '../src/physics/SpringBoneSystem';

describe('SpringBoneChain & SpringBoneSystem', () => {
  it('creates a bone chain and integrates spring physics', () => {
    const parent = new THREE.Object3D();
    parent.position.set(0, 2, 0);

    const bone1 = new THREE.Object3D();
    bone1.position.set(0, -0.2, 0);
    parent.add(bone1);

    const bone2 = new THREE.Object3D();
    bone2.position.set(0, -0.4, 0);
    bone1.add(bone2);

    const chain = new SpringBoneChain([bone1, bone2], {
      stiffness: 0.5,
      damping: 0.8,
      gravity: new THREE.Vector3(0, -9.8, 0),
    });

    expect(chain.nodes.length).toBe(2);

    // Tick simulation
    chain.update(0.016);
    expect(chain.nodes[1].currentPos).toBeDefined();
  });

  it('deflects spring bones away from collision spheres', () => {
    const parent = new THREE.Object3D();
    parent.position.set(0, 2, 0);

    const bone1 = new THREE.Object3D();
    bone1.position.set(0, 0, 0);
    parent.add(bone1);

    const bone2 = new THREE.Object3D();
    bone2.position.set(0, 0, 0.5); // extending forward
    bone1.add(bone2);

    const chain = new SpringBoneChain([bone1, bone2], {
      radius: 0.1,
    });

    // Sphere collider placed in bone path
    const collider: SphereCollider = {
      center: new THREE.Vector3(0, 2, 0.5),
      radius: 0.3,
    };

    chain.update(0.016, [collider]);

    // Node position must be pushed outside collider minimum distance (0.1 + 0.3 = 0.4)
    const distToCenter = chain.nodes[1].currentPos.distanceTo(collider.center);
    expect(distToCenter).toBeGreaterThanOrEqual(0.39);
  });

  it('manages character rigs via SpringBoneSystem', () => {
    const system = new SpringBoneSystem();
    const bone = new THREE.Object3D();

    const chain = system.addChain(42, [bone]);
    expect(chain).toBeDefined();

    system.addCollider(42, new THREE.Vector3(0, 1.5, 0), 0.25);
    system.update(0.016);

    system.removeRig(42);
    system.clear();
  });

  it('resolves collisions against capsule segments', () => {
    const root = new THREE.Bone();
    const child = new THREE.Bone();
    child.position.set(0, 1, 0);
    root.add(child);
    root.updateMatrixWorld(true);
    const chain = new SpringBoneChain([root, child], { radius: 0.1 });
    const capsule: CapsuleCollider = {
      kind: 'capsule', start: new THREE.Vector3(-0.2, 0.8, 0), end: new THREE.Vector3(0.2, 0.8, 0), radius: 0.3,
    };
    chain.update(1 / 60, [capsule]);
    expect(child.quaternion.toArray().every(Number.isFinite)).toBe(true);
  });
});
