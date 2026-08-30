import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { SceneManager } from '../src/ecs/SceneManager';
import { AssetCache } from '../src/animation/AssetCache';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { JointSystem } from '../src/physics/JointSystem';
import { RagdollBuilder } from '../src/physics/RagdollBuilder';
import { RigidBodyComponent } from '../src/physics/RigidBodyComponent';

describe('Physics Joint System & Humanoid Ragdolls (S2)', () => {
  it('creates and simulates various joint types', async () => {
    const physicsWorld = await PhysicsWorld.create();
    const scene = new THREE.Scene();
    const assetCache = new AssetCache();
    const worldOrigin = new WorldOrigin();
    const sm = new SceneManager(scene, physicsWorld, assetCache, worldOrigin);

    sm.registerBuilder('block', (pos, _p, ctx) => {
      const b = ctx.physicsWorld.createRigidBody(
        ctx.physicsWorld.RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z),
      );
      ctx.physicsWorld.createBoxCollider(b, 0.5, 0.5, 0.5);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      m.position.copy(pos);
      return new RigidBodyComponent(ctx.physicsWorld, b, m, { source: 'owned' });
    });

    const e1 = sm.spawnNow(new THREE.Vector3(0, 5, 0), { kind: 'block', params: {} });
    const e2 = sm.spawnNow(new THREE.Vector3(0, 3, 0), { kind: 'block', params: {} });

    const jointSys = new JointSystem(physicsWorld, sm);

    // 1. Create spherical joint
    const jId = jointSys.createJoint({
      type: 'spherical',
      entityA: e1,
      entityB: e2,
      anchorA: { x: 0, y: -1, z: 0 },
      anchorB: { x: 0, y: 1, z: 0 },
    });

    expect(jId).toBeDefined();
    expect(jointSys.getJoint(jId)).toBeDefined();

    // Step physics
    for (let i = 0; i < 10; i++) {
      physicsWorld.step(1 / 60);
      jointSys.fixedStep(1 / 60);
    }

    // 2. Remove joint
    const removed = jointSys.removeJoint(jId);
    expect(removed).toBe(true);
    expect(jointSys.getJoint(jId)).toBeUndefined();
  });

  it('creates and manages a humanoid ragdoll instance', async () => {
    const physicsWorld = await PhysicsWorld.create();
    const scene = new THREE.Scene();
    const assetCache = new AssetCache();
    const worldOrigin = new WorldOrigin();
    const sm = new SceneManager(scene, physicsWorld, assetCache, worldOrigin);
    const jointSys = new JointSystem(physicsWorld, sm);
    const ragdollBuilder = new RagdollBuilder(physicsWorld, sm, jointSys);

    const rootEntity = 999;
    const ragdoll = ragdollBuilder.createHumanoidRagdoll(rootEntity, new THREE.Vector3(0, 2, 0));

    expect(ragdoll).toBeDefined();
    expect(ragdoll.parts.length).toBe(11); // hips, chest, head, 4 arm bones, 4 leg bones
    expect(ragdoll.jointIds.length).toBe(10);
    expect(ragdoll.active).toBe(true);

    // Toggle ragdoll simulation state
    ragdollBuilder.setRagdollActive(rootEntity, false);
    expect(ragdoll.active).toBe(false);

    ragdollBuilder.setRagdollActive(rootEntity, true);
    expect(ragdoll.active).toBe(true);

    // Destroy ragdoll
    ragdollBuilder.destroyRagdoll(rootEntity);
    expect(ragdollBuilder.getRagdoll(rootEntity)).toBeUndefined();
  });
});
