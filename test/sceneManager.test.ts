import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../src/ecs/SceneManager';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { AssetCache } from '../src/animation/AssetCache';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { RigidBodyComponent } from '../src/physics/RigidBodyComponent';

/**
 * Exercises the ECS core that has the subtlest invariants: O(1) swap-pop removal keeping
 * the entity↔index maps consistent, the parallel root-motion list, deferred structural
 * mutation, and the cascade child-destruction policy. Uses a real Rapier body via a tiny
 * registered builder so RigidBodyComponent.dispose() runs its real teardown path.
 */
async function makeSceneManager(): Promise<SceneManager> {
  const physics = await PhysicsWorld.create();
  const sm = new SceneManager(new THREE.Scene(), physics, new AssetCache(), new WorldOrigin());
  sm.registerBuilder('test', (enginePos, _params, ctx) => {
    const R = ctx.physicsWorld.RAPIER;
    const body = ctx.physicsWorld.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(enginePos.x, enginePos.y, enginePos.z),
    );
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.position.copy(enginePos);
    return new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
  });
  return sm;
}

const at = (x: number) => new THREE.Vector3(x, 0, 0);
const bp = () => ({ kind: 'test', params: {} });

describe('SceneManager', () => {
  let sm: SceneManager;
  beforeEach(async () => { sm = await makeSceneManager(); });

  it('spawns and round-trips entity ↔ rigid body', () => {
    const id = sm.spawnNow(at(0), bp());
    const rb = sm.getRigidBody(id);
    expect(rb).not.toBeNull();
    expect(sm.entityOf(rb!)).toBe(id);
    expect(sm.entityAtIndex(0)).toBe(id);
    expect(sm.entityCount).toBe(1);
  });

  it('keeps the entity↔index maps consistent after a middle swap-pop removal', () => {
    const a = sm.spawnNow(at(0), bp());
    const b = sm.spawnNow(at(1), bp());
    const c = sm.spawnNow(at(2), bp());
    expect(sm.rigidBodyList.length).toBe(3);

    sm.requestDestroy(b);
    sm.flushDeferredOperations();

    expect(sm.rigidBodyList.length).toBe(2);
    expect(sm.getRigidBody(b)).toBeNull();
    // a and c must still resolve correctly (c was swapped into b's old slot).
    for (const id of [a, c]) {
      const rb = sm.getRigidBody(id);
      expect(rb).not.toBeNull();
      expect(sm.entityOf(rb!)).toBe(id);
    }
    // Every live list slot maps back to a live entity.
    for (let i = 0; i < sm.rigidBodyList.length; i++) {
      expect(sm.entityOf(sm.rigidBodyList[i])).toBe(sm.entityAtIndex(i));
    }
  });

  it('tracks the parallel root-motion list only for rootMotion entities', () => {
    const plain = sm.spawnNow(at(0), bp());
    const rm = sm.spawnNow(at(1), bp(), { rootMotion: true });
    expect(sm.isRootMotion(plain)).toBe(false);
    expect(sm.isRootMotion(rm)).toBe(true);
    expect(sm.rootMotionList.length).toBe(1);

    sm.requestDestroy(rm);
    sm.flushDeferredOperations();
    expect(sm.rootMotionList.length).toBe(0);
  });

  it('defers spawns/destroys until flush', () => {
    sm.requestSpawn(at(0), bp());
    expect(sm.hasPendingDeferredOps()).toBe(true);
    expect(sm.entityCount).toBe(0);
    sm.flushDeferredOperations();
    expect(sm.hasPendingDeferredOps()).toBe(false);
    expect(sm.entityCount).toBe(1);
  });

  it('cascades destruction to children and records the parent link', () => {
    const parent = sm.spawnNow(at(0), bp());
    const child = sm.spawnNow(at(1), bp(), { parent });
    expect(sm.getParent(child)).toBe(parent);

    sm.requestDestroy(parent, 'cascade');
    sm.flushDeferredOperations();
    // Cascades are recursive and complete inside the parent operation.
    expect(sm.getRigidBody(parent)).toBeNull();
    expect(sm.getRigidBody(child)).toBeNull();
    expect(sm.entityCount).toBe(0);
  });

  it('destroyNow removes descendants synchronously and notifies children first', () => {
    const parent = sm.spawnNow(at(0), bp());
    const child = sm.spawnNow(at(1), bp(), { parent });
    const order: number[] = [];
    sm.onEntityDestroyed = (id) => order.push(id);

    sm.destroyNow(parent, 'cascade');

    expect(sm.entityCount).toBe(0);
    expect(sm.hasPendingDeferredOps()).toBe(false);
    expect(order).toEqual([child, parent]);
  });

  it('reparentToRoot keeps the child alive and promotes it to global', () => {
    const parent = sm.spawnNow(at(0), bp());
    const child = sm.spawnNow(at(1), bp(), { parent });

    sm.requestDestroy(parent, 'reparentToRoot');
    sm.flushDeferredOperations();
    expect(sm.getRigidBody(parent)).toBeNull();
    expect(sm.getRigidBody(child)).not.toBeNull();
    expect(sm.getParent(child)).toBeUndefined();
  });
});
