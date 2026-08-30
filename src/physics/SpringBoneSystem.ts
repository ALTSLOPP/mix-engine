import type { SpringCollider } from './SpringBoneChain';
import { SpringBoneChain, type SpringBoneParams } from './SpringBoneChain';
import * as THREE from 'three';

export interface CharacterSpringRig {
  entityId: number;
  chains: SpringBoneChain[];
  colliders: SpringCollider[];
  /** Optional objects each collider tracks, index-aligned with `colliders`. */
  followTargets: Array<{ start: THREE.Object3D | null; end?: THREE.Object3D | null }>;
}

/**
 * SpringBoneSystem.ts — Manages and updates all secondary spring physics chains.
 */
export class SpringBoneSystem {
  private readonly rigs = new Map<number, CharacterSpringRig>();

  /** Register a spring-bone chain on a character entity. */
  addChain(entityId: number, bones: THREE.Object3D[], params?: SpringBoneParams): SpringBoneChain {
    let rig = this.rigs.get(entityId);
    if (!rig) {
      rig = { entityId, chains: [], colliders: [], followTargets: [] };
      this.rigs.set(entityId, rig);
    }

    const chain = new SpringBoneChain(bones, params);
    rig.chains.push(chain);
    return chain;
  }

  /** Add a collision body (head, chest, shoulder) protecting the character against clipping. */
  addCollider(entityId: number, center: THREE.Vector3, radius: number, follow: THREE.Object3D | null = null): void {
    let rig = this.rigs.get(entityId);
    if (!rig) {
      rig = { entityId, chains: [], colliders: [], followTargets: [] };
      this.rigs.set(entityId, rig);
    }
    rig.colliders.push({ center: center.clone(), radius });
    // Body colliders (head, chest, shoulders) move with the character. Cloning the
    // centre and never updating it froze them at the world position they had at
    // registration, so hair and cloth clipped straight through the body as soon as
    // the character walked away from that spot. Pass `follow` to track a bone.
    rig.followTargets.push({ start: follow });
  }

  /** Add a capsule collider spanning two moving bones/objects. */
  addCapsuleCollider(entityId: number, start: THREE.Object3D, end: THREE.Object3D, radius: number): void {
    let rig = this.rigs.get(entityId);
    if (!rig) {
      rig = { entityId, chains: [], colliders: [], followTargets: [] };
      this.rigs.set(entityId, rig);
    }
    const startPos = start.getWorldPosition(new THREE.Vector3());
    const endPos = end.getWorldPosition(new THREE.Vector3());
    rig.colliders.push({ kind: 'capsule', start: startPos, end: endPos, radius });
    rig.followTargets.push({ start, end });
  }

  /** Update all registered spring bone chains for a time delta. */
  update(dt: number): void {
    if (dt <= 0) return;
    for (const rig of this.rigs.values()) {
      for (let i = 0; i < rig.colliders.length; i++) {
        const follow = rig.followTargets[i];
        const collider = rig.colliders[i];
        if (collider.kind === 'capsule') {
          follow.start?.getWorldPosition(collider.start);
          follow.end?.getWorldPosition(collider.end);
        } else if (follow.start) {
          follow.start.getWorldPosition(collider.center);
        }
      }
      for (const chain of rig.chains) {
        chain.update(dt, rig.colliders);
      }
    }
  }

  /** Remove all chains for an entity. */
  removeRig(entityId: number): void {
    this.rigs.delete(entityId);
  }

  clear(): void {
    this.rigs.clear();
  }
}
