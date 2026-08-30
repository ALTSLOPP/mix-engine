import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { PhysicsWorld } from './PhysicsWorld';
import { RigidBodyComponent } from './RigidBodyComponent';

export interface FractureOptions {
  pieces?: number; // default 6
  explosionImpulse?: number; // default 5.0
  shardLifespan?: number; // seconds before shards despawn (default 8.0)
}

export class MeshFracturer {
  private readonly shardLifetimes = new Map<EntityId, number>();
  constructor(
    private readonly physicsWorld: PhysicsWorld,
    private readonly sceneManager: SceneManager,
  ) {
    // Register shard builder
    this.sceneManager.registerBuilder('fracture_shard', (pos, params, ctx) => {
      const size = (params?.size as [number, number, number]) ?? [0.2, 0.2, 0.2];
      const mass = (params?.mass as number) ?? 1.0;
      const desc = ctx.physicsWorld.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setAdditionalMass(mass);
      const body = ctx.physicsWorld.createRigidBody(desc);
      ctx.physicsWorld.createBoxCollider(body, size[0], size[1], size[2]);

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2),
        new THREE.MeshStandardMaterial({
          color: (params?.color as number) ?? 0x7f8c8d,
          roughness: 0.9,
        }),
      );
      mesh.position.copy(pos);
      return new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
    });
  }

  fractureEntity(
    entityId: EntityId,
    epicenter?: THREE.Vector3,
    options: FractureOptions = {},
  ): EntityId[] {
    const rb = this.sceneManager.getRigidBody(entityId);
    if (!rb) return [];

    const origin = rb.mesh.position.clone();
    const hitPoint = epicenter ? epicenter.clone() : origin.clone();
    const pieces = options.pieces ?? 6;
    const impulseMag = options.explosionImpulse ?? 5.0;
    const shardLifespan = Math.max(0, options.shardLifespan ?? 8.0);

    // Destroy original entity
    this.sceneManager.destroyNow(entityId);

    const shardIds: EntityId[] = [];

    // Spawn fracture shards
    for (let i = 0; i < pieces; i++) {
      // Random offset around center
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
      );
      const shardPos = origin.clone().add(offset);

      const shardSize: [number, number, number] = [
        0.1 + Math.random() * 0.15,
        0.1 + Math.random() * 0.15,
        0.1 + Math.random() * 0.15,
      ];

      const shardId = this.sceneManager.spawnNow(shardPos, {
        kind: 'fracture_shard',
        params: { size: shardSize, mass: 2.0 },
      });

      const shardRb = this.sceneManager.getRigidBody(shardId);
      if (shardRb) {
        // Outward radial impulse from hitPoint
        const dir = shardPos.clone().sub(hitPoint).normalize();
        if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);

        const impulse = dir.multiplyScalar(impulseMag * (0.8 + Math.random() * 0.4));
        shardRb.rapierBody.applyImpulse({ x: impulse.x, y: impulse.y + 2.0, z: impulse.z }, true);
        shardRb.rapierBody.applyTorqueImpulse(
          {
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            z: (Math.random() - 0.5) * 2,
          },
          true,
        );
      }

      shardIds.push(shardId);
      if (shardLifespan > 0) this.shardLifetimes.set(shardId, shardLifespan);
    }

    return shardIds;
  }

  /** Queue the entire fracture transaction for the canonical Step 8 flush. */
  requestFractureEntity(
    entityId: EntityId,
    epicenter?: THREE.Vector3,
    options: FractureOptions = {},
  ): void {
    const hitPoint = epicenter?.clone();
    const copiedOptions = { ...options };
    this.sceneManager.queueDeferredOp({
      kind: 'structuralMutation',
      fn: () => { this.fractureEntity(entityId, hitPoint, copiedOptions); },
    });
  }

  update(dt: number): void {
    for (const [id, remaining] of Array.from(this.shardLifetimes.entries())) {
      const next = remaining - dt;
      if (next <= 0) {
        this.sceneManager.requestDestroy(id);
        this.shardLifetimes.delete(id);
      } else {
        this.shardLifetimes.set(id, next);
      }
    }
  }

  dispose(): void {
    this.shardLifetimes.clear();
  }
}
