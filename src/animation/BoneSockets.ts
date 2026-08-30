/**
 * BoneSockets — Skeleton bone attachment system for props, weapons, hitboxes, and VFX emitters.
 *
 * Updates attached child transforms after skeleton matrix evaluation every frame.
 */

import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';

export interface SocketTransformOffset {
  position?: [number, number, number];
  rotation?: [number, number, number, number]; // Quaternion [x, y, z, w]
  scale?: [number, number, number];
}

export interface BoneSocketAttachment {
  childId: EntityId;
  parentId: EntityId;
  boneName: string;
  localPosition: THREE.Vector3;
  localRotation: THREE.Quaternion;
  localScale: THREE.Vector3;
}

export class BoneSocketManager {
  private readonly attachments = new Map<EntityId, BoneSocketAttachment>();
  private readonly parentToChildren = new Map<EntityId, Set<EntityId>>();

  private readonly _tempBoneMat = new THREE.Matrix4();
  private readonly _tempLocalMat = new THREE.Matrix4();
  private readonly _tempWorldMat = new THREE.Matrix4();
  private readonly _tempPos = new THREE.Vector3();
  private readonly _tempQuat = new THREE.Quaternion();
  private readonly _tempScale = new THREE.Vector3();
  private readonly boneCache = new WeakMap<THREE.Object3D, Map<string, THREE.Object3D | null>>();

  /**
   * Attaches a child entity to a named bone on the parent skeleton.
   */
  attach(
    childId: EntityId,
    parentId: EntityId,
    boneName: string,
    offset?: SocketTransformOffset
  ): void {
    const pos = new THREE.Vector3(
      offset?.position?.[0] ?? 0,
      offset?.position?.[1] ?? 0,
      offset?.position?.[2] ?? 0
    );
    const quat = new THREE.Quaternion(
      offset?.rotation?.[0] ?? 0,
      offset?.rotation?.[1] ?? 0,
      offset?.rotation?.[2] ?? 0,
      offset?.rotation?.[3] ?? 1
    );
    const scale = new THREE.Vector3(
      offset?.scale?.[0] ?? 1,
      offset?.scale?.[1] ?? 1,
      offset?.scale?.[2] ?? 1
    );

    // Clean up any existing attachment for this child
    this.detach(childId);

    const attachment: BoneSocketAttachment = {
      childId,
      parentId,
      boneName,
      localPosition: pos,
      localRotation: quat,
      localScale: scale,
    };

    this.attachments.set(childId, attachment);

    let children = this.parentToChildren.get(parentId);
    if (!children) {
      children = new Set();
      this.parentToChildren.set(parentId, children);
    }
    children.add(childId);
  }

  /**
   * Detaches a child entity from its bone socket.
   */
  detach(childId: EntityId): boolean {
    const existing = this.attachments.get(childId);
    if (!existing) return false;

    this.attachments.delete(childId);
    const children = this.parentToChildren.get(existing.parentId);
    if (children) {
      children.delete(childId);
      if (children.size === 0) this.parentToChildren.delete(existing.parentId);
    }
    return true;
  }

  /**
   * Common socket preset names for humanoid characters.
   */
  static readonly Presets = {
    RIGHT_HAND: 'RightHand',
    LEFT_HAND: 'LeftHand',
    HEAD: 'Head',
    SPINE: 'Spine',
    CHEST: 'Chest',
    ROOT: 'Root',
    WEAPON_R: 'WeaponSocket_R',
    WEAPON_L: 'WeaponSocket_L',
    FOOT_R: 'RightFoot',
    FOOT_L: 'LeftFoot',
  } as const;

  /**
   * Gets socket attachment info for a child entity.
   */
  getAttachment(childId: EntityId): BoneSocketAttachment | undefined {
    return this.attachments.get(childId);
  }

  /**
   * Returns all child entity IDs attached to a parent entity.
   */
  getAttachedChildren(parentId: EntityId): EntityId[] {
    const set = this.parentToChildren.get(parentId);
    return set ? Array.from(set) : [];
  }

  /**
   * Returns all active socket attachments.
   */
  getAllAttachments(): readonly BoneSocketAttachment[] {
    return Array.from(this.attachments.values());
  }

  /**
   * Finds a bone or child object by name in a parent entity's hierarchy with fuzzy matching.
   */
  findBone(parentMesh: THREE.Object3D, boneName: string): THREE.Object3D | null {
    let byName = this.boneCache.get(parentMesh);
    if (!byName) {
      byName = new Map();
      this.boneCache.set(parentMesh, byName);
    }
    if (byName.has(boneName)) return byName.get(boneName) ?? null;
    let found: THREE.Object3D | null = null;
    const cleanQuery = boneName.toLowerCase().replace(/[^a-z0-9]/g, '');

    parentMesh.traverse((child) => {
      if (found) return;
      const cleanName = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanName === cleanQuery || cleanName.endsWith(cleanQuery)) {
        found = child;
      }
    });

    byName.set(boneName, found);
    return found;
  }

  /**
   * Updates all attached child entity transforms based on parent bone world transforms.
   */
  update(sceneManager: SceneManager): void {
    if (this.attachments.size === 0) return;

    for (const [childId, att] of this.attachments.entries()) {
      const parentRb = sceneManager.getRigidBody(att.parentId);
      const childRb = sceneManager.getRigidBody(childId);
      if (!parentRb || !childRb) {
        this.detach(childId);
        continue;
      }

      const bone = this.findBone(parentRb.mesh, att.boneName);
      const anchor = bone ?? parentRb.mesh;

      // Compute final world matrix = bone.matrixWorld * localOffset
      anchor.updateWorldMatrix(true, false);
      this._tempLocalMat.compose(att.localPosition, att.localRotation, att.localScale);
      this._tempWorldMat.multiplyMatrices(anchor.matrixWorld, this._tempLocalMat);
      this._tempWorldMat.decompose(this._tempPos, this._tempQuat, this._tempScale);

      // Keep the physics body and render transform under the same authority. A
      // mesh-only write would be overwritten by the next Rapier interpolation.
      childRb.transformAuthority = 'animation';
      childRb.teleport(this._tempPos, this._tempQuat);
      childRb.mesh.scale.copy(this._tempScale);
      childRb.mesh.updateMatrixWorld(true);
    }
  }

  /**
   * Clears all socket attachments.
   */
  clear(): void {
    for (const attachment of this.attachments.values()) {
      // Authority is reset lazily by whichever controller next owns the body.
      void attachment;
    }
    this.attachments.clear();
    this.parentToChildren.clear();
  }
}
