import * as THREE from 'three';
import type { PhysicsWorld } from './PhysicsWorld';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { JointSystem } from './JointSystem';
import { RigidBodyComponent } from './RigidBodyComponent';

export interface RagdollPart {
  name: string;
  entityId: EntityId;
  boneName: string;
  size: [number, number, number];
}

export interface RagdollInstance {
  rootEntity: EntityId;
  parts: RagdollPart[];
  jointIds: string[];
  active: boolean;
}

export class RagdollBuilder {
  private readonly ragdolls = new Map<EntityId, RagdollInstance>();

  constructor(
    private readonly physicsWorld: PhysicsWorld,
    private readonly sceneManager: SceneManager,
    private readonly jointSystem: JointSystem,
  ) {
    this.sceneManager.registerBuilder('ragdoll_bone', (pos, params, ctx) => {
      const size = (params?.size as [number, number, number]) ?? [0.1, 0.1, 0.1];
      const mass = (params?.mass as number) ?? 5.0;
      const desc = ctx.physicsWorld.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setAdditionalMass(mass);
      const body = ctx.physicsWorld.createRigidBody(desc);
      ctx.physicsWorld.createBoxCollider(body, size[0], size[1], size[2], false, false, 'Ragdoll');
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2),
        new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 }),
      );
      mesh.position.copy(pos);
      return new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
    });
  }

  createHumanoidRagdoll(rootEntity: EntityId, rootPos: THREE.Vector3): RagdollInstance {
    const parts: RagdollPart[] = [];
    const jointIds: string[] = [];

    // Helper to spawn a bone body
    const spawnPart = (
      name: string,
      boneName: string,
      offset: THREE.Vector3,
      size: [number, number, number],
      mass = 5.0,
    ): EntityId => {
      const partPos = rootPos.clone().add(offset);
      const entityId = this.sceneManager.spawnNow(partPos, {
        kind: 'ragdoll_bone',
        params: { size, mass },
      });
      parts.push({ name, entityId, boneName, size });
      return entityId;
    };

    // 1. Core torso & head
    const hips = spawnPart('hips', 'Hips', new THREE.Vector3(0, 1.0, 0), [0.18, 0.12, 0.12], 15);
    const chest = spawnPart('chest', 'Spine1', new THREE.Vector3(0, 1.35, 0), [0.2, 0.15, 0.14], 15);
    const head = spawnPart('head', 'Head', new THREE.Vector3(0, 1.7, 0), [0.1, 0.12, 0.1], 5);

    // 2. Arms
    const upperArmL = spawnPart('upperArmL', 'LeftArm', new THREE.Vector3(-0.35, 1.35, 0), [0.08, 0.15, 0.08], 4);
    const lowerArmL = spawnPart('lowerArmL', 'LeftForeArm', new THREE.Vector3(-0.35, 1.0, 0), [0.07, 0.14, 0.07], 3);

    const upperArmR = spawnPart('upperArmR', 'RightArm', new THREE.Vector3(0.35, 1.35, 0), [0.08, 0.15, 0.08], 4);
    const lowerArmR = spawnPart('lowerArmR', 'RightForeArm', new THREE.Vector3(0.35, 1.0, 0), [0.07, 0.14, 0.07], 3);

    // 3. Legs
    const upperLegL = spawnPart('upperLegL', 'LeftUpLeg', new THREE.Vector3(-0.15, 0.65, 0), [0.09, 0.2, 0.09], 8);
    const lowerLegL = spawnPart('lowerLegL', 'LeftLeg', new THREE.Vector3(-0.15, 0.25, 0), [0.08, 0.2, 0.08], 6);

    const upperLegR = spawnPart('upperLegR', 'RightUpLeg', new THREE.Vector3(0.15, 0.65, 0), [0.09, 0.2, 0.09], 8);
    const lowerLegR = spawnPart('lowerLegR', 'RightLeg', new THREE.Vector3(0.15, 0.25, 0), [0.08, 0.2, 0.08], 6);

    // 4. Connect joints
    const addSpherical = (eA: EntityId, eB: EntityId, anchorA: [number, number, number], anchorB: [number, number, number]) => {
      const jId = this.jointSystem.createJoint({
        type: 'spherical',
        entityA: eA,
        entityB: eB,
        anchorA: { x: anchorA[0], y: anchorA[1], z: anchorA[2] },
        anchorB: { x: anchorB[0], y: anchorB[1], z: anchorB[2] },
      });
      jointIds.push(jId);
    };

    addSpherical(hips, chest, [0, 0.15, 0], [0, -0.15, 0]);
    addSpherical(chest, head, [0, 0.18, 0], [0, -0.12, 0]);

    addSpherical(chest, upperArmL, [-0.22, 0.05, 0], [0, 0.15, 0]);
    addSpherical(upperArmL, lowerArmL, [0, -0.15, 0], [0, 0.15, 0]);

    addSpherical(chest, upperArmR, [0.22, 0.05, 0], [0, 0.15, 0]);
    addSpherical(upperArmR, lowerArmR, [0, -0.15, 0], [0, 0.15, 0]);

    addSpherical(hips, upperLegL, [-0.12, -0.12, 0], [0, 0.2, 0]);
    addSpherical(upperLegL, lowerLegL, [0, -0.2, 0], [0, 0.2, 0]);

    addSpherical(hips, upperLegR, [0.12, -0.12, 0], [0, 0.2, 0]);
    addSpherical(upperLegR, lowerLegR, [0, -0.2, 0], [0, 0.2, 0]);

    const instance: RagdollInstance = {
      rootEntity,
      parts,
      jointIds,
      active: true,
    };

    this.ragdolls.set(rootEntity, instance);
    return instance;
  }

  /** Queue ragdoll construction so all bodies and joints appear at the Step 8 flush. */
  requestHumanoidRagdoll(rootEntity: EntityId, rootPos: THREE.Vector3): void {
    const position = rootPos.clone();
    this.sceneManager.queueDeferredOp({
      kind: 'ragdollCreate',
      fn: () => { this.createHumanoidRagdoll(rootEntity, position); },
    });
  }

  getRagdoll(rootEntity: EntityId): RagdollInstance | undefined {
    return this.ragdolls.get(rootEntity);
  }

  setRagdollActive(rootEntity: EntityId, active: boolean): void {
    const ragdoll = this.ragdolls.get(rootEntity);
    if (!ragdoll) return;
    ragdoll.active = active;
    for (const part of ragdoll.parts) {
      const rb = this.sceneManager.getComponent<RigidBodyComponent>(part.entityId, 'rigidBody');
      if (rb) {
        rb.setKinematicOverride(!active);
      }
    }
  }

  requestSetRagdollActive(rootEntity: EntityId, active: boolean): void {
    this.sceneManager.queueDeferredOp({
      kind: 'structuralMutation',
      fn: () => { this.setRagdollActive(rootEntity, active); },
    });
  }

  destroyRagdoll(rootEntity: EntityId): void {
    const ragdoll = this.ragdolls.get(rootEntity);
    if (!ragdoll) return;

    for (const jId of ragdoll.jointIds) {
      this.jointSystem.removeJoint(jId);
    }
    for (const part of ragdoll.parts) {
      this.sceneManager.requestDestroy(part.entityId);
    }
    this.ragdolls.delete(rootEntity);
  }

  requestDestroyRagdoll(rootEntity: EntityId): void {
    this.sceneManager.queueDeferredOp({
      kind: 'structuralMutation',
      fn: () => { this.destroyRagdoll(rootEntity); },
    });
  }
}
