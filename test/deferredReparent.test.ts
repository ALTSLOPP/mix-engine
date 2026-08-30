import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../src/ecs/SceneManager';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { AssetCache } from '../src/animation/AssetCache';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { RigidBodyComponent } from '../src/physics/RigidBodyComponent';

describe('Deferred Reparenting Invariant (S4)', () => {
  it('defers reparentEntity until flushDeferredOperations runs', async () => {
    const physicsWorld = await PhysicsWorld.create();
    const scene = new THREE.Scene();
    const assetCache = new AssetCache();
    const worldOrigin = new WorldOrigin();
    const sm = new SceneManager(scene, physicsWorld, assetCache, worldOrigin);

    sm.registerBuilder('box', (pos, _p, _ctx) => {
      const b = physicsWorld.createRigidBody(physicsWorld.RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z));
      physicsWorld.createBoxCollider(b, 0.5, 0.5, 0.5);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      m.position.copy(pos);
      return new RigidBodyComponent(physicsWorld, b, m, { source: 'owned' });
    });

    let parentId = 0;
    let childId = 0;

    sm.requestSpawn(new THREE.Vector3(0, 0, 0), { kind: 'box', params: {} }, {
      onSpawned: id => {
        parentId = id;
      },
    });

    sm.requestSpawn(new THREE.Vector3(0, 2, 0), { kind: 'box', params: {} }, {
      onSpawned: id => {
        childId = id;
      },
    });

    sm.flushDeferredOperations();

    expect(parentId).toBeGreaterThan(0);
    expect(childId).toBeGreaterThan(0);

    // Call reparentEntity without immediate flag
    sm.parentEntity(childId, parentId);

    // Reparent should not have executed immediately (structural mutation invariant)
    // Update transforms should not move child yet
    const childRb = sm.getRigidBody(childId)!;
    const parentRb = sm.getRigidBody(parentId)!;

    // Flush step 8
    sm.flushDeferredOperations();

    // Now parent-child link is established
    parentRb.teleport(new THREE.Vector3(10, 0, 0), parentRb.mesh.quaternion);
    sm.updateParentChildTransforms();

    // Child should have moved with parent
    expect(childRb.mesh.position.x).toBeCloseTo(10, 1);
    expect(childRb.mesh.position.y).toBeCloseTo(2, 1);
  });
});
