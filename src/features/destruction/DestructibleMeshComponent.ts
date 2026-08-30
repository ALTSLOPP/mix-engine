import * as THREE from 'three';
import { MeshSlicer } from './MeshSlicer';
import type { Engine } from '../../engine/Engine';
import { RigidBodyComponent } from '../../physics/RigidBodyComponent';

export interface SliceImpactEvent {
  entityId: number;
  planePoint: THREE.Vector3;
  planeNormal: THREE.Vector3;
  separationForce?: number;
  lifetime?: number;
}

export class MeshSlicingSystem {
  private static readonly DEFAULT_LIFETIME = 10.0;
  private static readonly DEFAULT_SEPARATION = 6.0;
  private readonly activeTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly engine: Engine) {
    if (typeof this.engine.sceneManager?.registerBuilder === 'function') {
      this.engine.sceneManager.registerBuilder('slice_piece', (pos, params, ctx) => {
        const mesh = (params?.mesh as THREE.Mesh) || new THREE.Mesh();
        const mass = (params?.mass as number) ?? 1.0;
        const desc = ctx.physicsWorld.RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(pos.x, pos.y, pos.z)
          .setAdditionalMass(mass);
        const body = ctx.physicsWorld.createRigidBody(desc);
        ctx.physicsWorld.createBoxCollider(body, 0.5, 0.5, 0.5);

        mesh.position.copy(pos);
        return new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
      });
    }
  }

  /**
   * Slices an entity mesh in the scene along a plane, spawns two separate physical pieces,
   * applies explosive outward separation velocities, and cleans up the original entity.
   */
  sliceEntity(
    entityId: number,
    planePointWorld: THREE.Vector3,
    planeNormalWorld: THREE.Vector3,
    separationForce = MeshSlicingSystem.DEFAULT_SEPARATION,
    lifetime = MeshSlicingSystem.DEFAULT_LIFETIME
  ): { pieceA: number | null; pieceB: number | null; cutArea: number } {
    const rb = this.engine.sceneManager.getRigidBody(entityId);
    if (!rb || !(rb as any).mesh) {
      return { pieceA: null, pieceB: null, cutArea: 0 };
    }

    const mesh = (rb as any).mesh as THREE.Mesh;
    if (!mesh.geometry) {
      return { pieceA: null, pieceB: null, cutArea: 0 };
    }

    const norm = planeNormalWorld.clone().normalize();
    const { positiveMesh, negativeMesh, cutArea } = MeshSlicer.sliceMesh(
      mesh,
      planePointWorld,
      norm,
      { capFaces: true }
    );

    if (cutArea <= 0 || positiveMesh.geometry.getAttribute('position').count === 0 || negativeMesh.geometry.getAttribute('position').count === 0) {
      return { pieceA: null, pieceB: null, cutArea: 0 };
    }

    // Spawn positive piece
    positiveMesh.name = `${mesh.name || 'Slice'}_PieceA`;
    const posSpawnPos = positiveMesh.position.clone();
    const pieceAId = this.engine.sceneManager.spawnNow(posSpawnPos, {
      kind: 'slice_piece',
      params: { mesh: positiveMesh },
    });

    // Spawn negative piece
    negativeMesh.name = `${mesh.name || 'Slice'}_PieceB`;
    const negSpawnPos = negativeMesh.position.clone();
    const pieceBId = this.engine.sceneManager.spawnNow(negSpawnPos, {
      kind: 'slice_piece',
      params: { mesh: negativeMesh },
    });

    // Apply outward impulse along the cutting plane normal
    const impulseA = norm.clone().multiplyScalar(separationForce);
    const impulseB = norm.clone().multiplyScalar(-separationForce);

    const rbA = this.engine.sceneManager.getRigidBody(pieceAId);
    const rbB = this.engine.sceneManager.getRigidBody(pieceBId);

    if (rbA && (rbA as any).rapierBody) {
      (rbA as any).rapierBody.applyImpulse({ x: impulseA.x, y: impulseA.y + 1.0, z: impulseA.z }, true);
      (rbA as any).rapierBody.applyTorqueImpulse({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }, true);
    }
    if (rbB && (rbB as any).rapierBody) {
      (rbB as any).rapierBody.applyImpulse({ x: impulseB.x, y: impulseB.y + 1.0, z: impulseB.z }, true);
      (rbB as any).rapierBody.applyTorqueImpulse({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }, true);
    }

    // Destroy original entity
    this.engine.sceneManager.requestDestroy(entityId);

    // Schedule cleanup lifetime for pieces
    if (lifetime > 0) {
      const timer = setTimeout(() => {
        this.engine.sceneManager.requestDestroy(pieceAId);
        this.engine.sceneManager.requestDestroy(pieceBId);
        this.activeTimers.delete(timer);
      }, lifetime * 1000);
      this.activeTimers.add(timer);
    }

    this.engine.sceneManager.events.emit('entity_sliced', {
      originalId: entityId,
      pieceA: pieceAId,
      pieceB: pieceBId,
      cutArea,
      planePoint: planePointWorld,
      planeNormal: planeNormalWorld,
    });

    return { pieceA: pieceAId, pieceB: pieceBId, cutArea };
  }

  dispose(): void {
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }
}
