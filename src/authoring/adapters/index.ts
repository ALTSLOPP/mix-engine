/**
 * Subsystem Transaction Adapters — Capture fine-grained inverse operations
 * before and after command mutations.
 */

import { InverseFactory, type InverseOperation } from '../InverseOperation';
import type { SceneManager, EntityId } from '../../ecs/SceneManager';
import type { AIBridge } from '../../ai/AIBridge';

export class EntityTransactionAdapter {
  static captureSpawn(sceneManager: SceneManager, entityId: EntityId): InverseOperation {
    const guid = sceneManager.getGuid(entityId) ?? `guid-${entityId}`;
    return InverseFactory.spawnInverse(guid, entityId);
  }

  static captureTransform(sceneManager: SceneManager, entityId: EntityId): InverseOperation | null {
    const guid = sceneManager.getGuid(entityId);
    const rb = sceneManager.getRigidBody(entityId);
    if (!guid || !rb) return null;
    return InverseFactory.transformInverse(guid, {
      position: { x: rb.mesh.position.x, y: rb.mesh.position.y, z: rb.mesh.position.z },
      rotation: { x: rb.mesh.quaternion.x, y: rb.mesh.quaternion.y, z: rb.mesh.quaternion.z, w: rb.mesh.quaternion.w },
    });
  }

  static captureParenting(sceneManager: SceneManager, entityId: EntityId): InverseOperation | null {
    const guid = sceneManager.getGuid(entityId);
    if (!guid) return null;
    const parentGuid = sceneManager.getParentGuid(entityId);
    return InverseFactory.parentingInverse(guid, parentGuid ?? null);
  }

  static captureIdentity(sceneManager: SceneManager, aiBridge: AIBridge, entityId: EntityId): InverseOperation | null {
    const guid = sceneManager.getGuid(entityId);
    if (!guid) return null;
    const name = aiBridge.getEntityName(entityId);
    const tags = aiBridge.getEntityTags(entityId);
    return InverseFactory.identityInverse(guid, name, tags);
  }
}

export class ComponentTransactionAdapter {
  static captureComponent(sceneManager: SceneManager, entityId: EntityId, componentName: string, beforeProps: Record<string, unknown> | null): InverseOperation | null {
    const guid = sceneManager.getGuid(entityId);
    if (!guid) return null;
    return InverseFactory.componentInverse(guid, componentName, beforeProps);
  }
}

export class GameplayTransactionAdapter {
  static captureVar(key: string, beforeValue: unknown): InverseOperation {
    return InverseFactory.gameplayVarInverse(key, beforeValue);
  }

  static captureInventory(owner: string, item: string, delta: number): InverseOperation {
    return InverseFactory.inventoryInverse(owner, item, delta);
  }
}
