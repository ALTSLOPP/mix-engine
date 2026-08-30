import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { SceneManager } from '../src/ecs/SceneManager';
import { AssetCache } from '../src/animation/AssetCache';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { MeshFracturer } from '../src/physics/MeshFracturer';
import { RigidBodyComponent } from '../src/physics/RigidBodyComponent';

describe('Dynamic Destructible Geometry & Mesh Fracturing (S12)', () => {
  it('fractures target entity into multiple dynamic rigid body shards with explosive impulse', async () => {
    const physicsWorld = await PhysicsWorld.create();
    const scene = new THREE.Scene();
    const assetCache = new AssetCache();
    const worldOrigin = new WorldOrigin();
    const sm = new SceneManager(scene, physicsWorld, assetCache, worldOrigin);

    sm.registerBuilder('pillar', (pos, _p, ctx) => {
      const b = ctx.physicsWorld.createRigidBody(
        ctx.physicsWorld.RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z),
      );
      ctx.physicsWorld.createBoxCollider(b, 0.5, 2.0, 0.5);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1));
      m.position.copy(pos);
      return new RigidBodyComponent(ctx.physicsWorld, b, m, { source: 'owned' });
    });

    const targetId = sm.spawnNow(new THREE.Vector3(0, 5, 0), { kind: 'pillar', params: {} });
    expect(sm.hasEntity(targetId)).toBe(true);

    const fracturer = new MeshFracturer(physicsWorld, sm);
    const shards = fracturer.fractureEntity(targetId, new THREE.Vector3(0, 5, 0), {
      pieces: 8,
      explosionImpulse: 10.0,
    });

    // Original entity destroyed
    expect(sm.hasEntity(targetId)).toBe(false);

    // 8 shards spawned and tracked
    expect(shards.length).toBe(8);
    for (const sId of shards) {
      expect(sm.hasEntity(sId)).toBe(true);
      const rb = sm.getRigidBody(sId);
      expect(rb).toBeDefined();
      expect(rb!.rapierBody.isDynamic()).toBe(true);
    }
  });

  it('defers command-facing fracture mutations until the structural flush', async () => {
    const physicsWorld = await PhysicsWorld.create();
    const scene = new THREE.Scene();
    const sm = new SceneManager(scene, physicsWorld, new AssetCache(), new WorldOrigin());
    sm.registerBuilder('target', (pos, _params, ctx) => {
      const body = ctx.physicsWorld.createRigidBody(ctx.physicsWorld.RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z));
      ctx.physicsWorld.createBoxCollider(body, 0.5, 0.5, 0.5);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      return new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
    });
    const id = sm.spawnNow(new THREE.Vector3(), { kind: 'target', params: {} });
    const fracturer = new MeshFracturer(physicsWorld, sm);

    fracturer.requestFractureEntity(id, undefined, { pieces: 3, shardLifespan: 0.1 });
    expect(sm.hasEntity(id)).toBe(true);
    sm.flushDeferredOperations();
    expect(sm.hasEntity(id)).toBe(false);
    expect(sm.rigidBodyList).toHaveLength(3);

    fracturer.update(0.2);
    sm.flushDeferredOperations();
    expect(sm.rigidBodyList).toHaveLength(0);
  });
});
