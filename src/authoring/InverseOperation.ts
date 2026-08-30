/**
 * InverseOperation — Subsystem inverse operation definitions for
 * fine-grained, non-destructive transactional rollback.
 */

import * as THREE from 'three';
import type { AIBridge } from '../ai/AIBridge';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { Engine } from '../engine/Engine';

export interface InverseExecutionContext {
  engine: Engine;
  aiBridge: AIBridge;
  sceneManager: SceneManager;
}

export interface InverseOperation {
  subsystem:
    | 'entity'
    | 'transform'
    | 'parenting'
    | 'identity'
    | 'component'
    | 'material'
    | 'script'
    | 'terrain'
    | 'gameplay'
    | 'inventory'
    | 'interaction'
    | 'spawner'
    | 'environment';
  description: string;
  targetGuid?: string;
  recovery?: { kind: string; payload: Record<string, unknown> };
  execute(ctx: InverseExecutionContext): Promise<void> | void;
}

export class InverseFactory {
  /** Inverse of spawn_entity: destroys the spawned entity by GUID */
  static spawnInverse(guid: string, entityId?: EntityId): InverseOperation {
    return {
      subsystem: 'entity',
      description: `Destroy entity ${guid}`,
      targetGuid: guid,
      recovery: { kind: 'spawn', payload: { guid, entityId } },
      execute: (ctx) => {
        const id = ctx.sceneManager.getEntityByGuid(guid) ?? entityId;
        if (id !== undefined) {
          if (typeof ctx.sceneManager.destroyNow === 'function') {
            ctx.sceneManager.destroyNow(id, 'cascade');
          } else if (typeof (ctx.sceneManager as any).destroyEntity === 'function') {
            (ctx.sceneManager as any).destroyEntity(id);
          }
        }
      },
    };
  }

  /** Inverse of destroy_entity: respawns the entity with its previous snapshot and exact GUID */
  static destroyInverse(snapshot: {
    guid: string;
    kind?: string;
    name?: string;
    tags?: string[];
    position: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    parentGuid?: string;
    components?: Record<string, unknown>;
  }): InverseOperation {
    return {
      subsystem: 'entity',
      description: `Recreate entity ${snapshot.guid} (${snapshot.name ?? snapshot.kind ?? 'entity'})`,
      targetGuid: snapshot.guid,
      recovery: { kind: 'destroy', payload: { snapshot } },
      execute: (ctx) => {
        const blueprint = {
          kind: snapshot.kind ?? 'primitive',
          params: { assetId: snapshot.kind },
        };
        const pos = new THREE.Vector3(snapshot.position[0], snapshot.position[1], snapshot.position[2]);
        let newId: number;
        if (typeof ctx.sceneManager.spawnNow === 'function') {
          newId = ctx.sceneManager.spawnNow(pos, blueprint);
        } else {
          newId = (ctx.sceneManager as any).spawnEntity(blueprint, snapshot.position[0], snapshot.position[1], snapshot.position[2]);
        }
        ctx.sceneManager.setGuid(newId, snapshot.guid);
        if (snapshot.name) ctx.aiBridge.setEntityName(newId, snapshot.name);
        if (snapshot.tags) {
          for (const t of snapshot.tags) ctx.aiBridge.addEntityTag(newId, t);
        }
      },
    };
  }

  /** Inverse of transform change: restores prior position and rotation */
  static transformInverse(
    guid: string,
    before: {
      position: { x: number; y: number; z: number };
      rotation?: { x: number; y: number; z: number; w: number };
    }
  ): InverseOperation {
    return {
      subsystem: 'transform',
      description: `Restore transform for ${guid}`,
      targetGuid: guid,
      recovery: { kind: 'transform', payload: { guid, before } },
      execute: (ctx) => {
        const id = ctx.sceneManager.getEntityByGuid(guid);
        if (id !== undefined) {
          const rb = ctx.sceneManager.getRigidBody(id);
          if (rb) {
            rb.mesh.position.set(before.position.x, before.position.y, before.position.z);
            if (before.rotation) {
              rb.mesh.quaternion.set(before.rotation.x, before.rotation.y, before.rotation.z, before.rotation.w);
            }
          }
        }
      },
    };
  }

  /** Inverse of parenting change: restores prior parent */
  static parentingInverse(guid: string, beforeParentGuid: string | null): InverseOperation {
    return {
      subsystem: 'parenting',
      description: `Restore parent for ${guid} to ${beforeParentGuid ?? 'root'}`,
      targetGuid: guid,
      recovery: { kind: 'parenting', payload: { guid, beforeParentGuid } },
      execute: (ctx) => {
        const childId = ctx.sceneManager.getEntityByGuid(guid);
        if (childId !== undefined) {
          const parentId = beforeParentGuid ? ctx.sceneManager.getEntityByGuid(beforeParentGuid) : null;
          ctx.aiBridge.execute({
            type: 'parent_entity',
            entityId: childId,
            parentId: parentId ?? null,
          });
        }
      },
    };
  }

  /** Inverse of name or tags change */
  static identityInverse(guid: string, beforeName?: string, beforeTags?: string[]): InverseOperation {
    return {
      subsystem: 'identity',
      description: `Restore name/tags for ${guid}`,
      targetGuid: guid,
      recovery: { kind: 'identity', payload: { guid, beforeName, beforeTags } },
      execute: (ctx) => {
        const id = ctx.sceneManager.getEntityByGuid(guid);
        if (id !== undefined) {
          if (beforeName !== undefined) {
            ctx.aiBridge.setEntityName(id, beforeName);
          }
        }
      },
    };
  }

  /** Inverse of component add/set/remove */
  static componentInverse(guid: string, componentName: string, beforeProps: Record<string, unknown> | null): InverseOperation {
    return {
      subsystem: 'component',
      description: `Restore component '${componentName}' on ${guid}`,
      targetGuid: guid,
      recovery: { kind: 'component', payload: { guid, componentName, beforeProps } },
      execute: (ctx) => {
        const id = ctx.sceneManager.getEntityByGuid(guid);
        if (id !== undefined) {
          if (beforeProps === null) {
            ctx.aiBridge.execute({
              type: 'component_remove',
              entityId: id,
              component: componentName,
            });
          } else {
            ctx.aiBridge.execute({
              type: 'component_add',
              entityId: id,
              component: componentName,
              props: beforeProps,
            });
          }
        }
      },
    };
  }

  /** Inverse of terrain sculpting / height modification */
  static terrainSculptInverse(
    entityId: number,
    beforeHeights: { index: number; height: number }[]
  ): InverseOperation {
    return {
      subsystem: 'terrain',
      description: `Restore ${beforeHeights.length} terrain vertex heights`,
      recovery: { kind: 'terrain', payload: { entityId, beforeHeights } },
      execute: (ctx) => {
        const terrainSys = (ctx.engine as any).terrainSystem;
        if (terrainSys && typeof terrainSys.setVertexHeights === 'function') {
          terrainSys.setVertexHeights(entityId, beforeHeights);
        }
      },
    };
  }

  /** Inverse of gameplay variable change */
  static gameplayVarInverse(key: string, beforeValue: unknown): InverseOperation {
    return {
      subsystem: 'gameplay',
      description: `Restore gameplay variable '${key}'`,
      recovery: { kind: 'gameplay', payload: { key, beforeValue } },
      execute: (ctx) => {
        if (beforeValue === undefined) {
          ctx.aiBridge.execute({ type: 'remove_state', key });
        } else {
          ctx.aiBridge.execute({ type: 'set_state', key, value: beforeValue });
        }
      },
    };
  }

  /** Inverse of inventory item transfer/give/remove */
  static inventoryInverse(owner: string, item: string, countDelta: number): InverseOperation {
    return {
      subsystem: 'inventory',
      description: `Reverse inventory change on '${owner}': ${item} (${countDelta})`,
      recovery: { kind: 'inventory', payload: { owner, item, countDelta } },
      execute: (ctx) => {
        if (countDelta > 0) {
          ctx.aiBridge.execute({ type: 'inventory_remove', owner, item, count: countDelta });
        } else if (countDelta < 0) {
          ctx.aiBridge.execute({ type: 'inventory_give', owner, item, count: Math.abs(countDelta) });
        }
      },
    };
  }

  /** Inverse of weather or environmental lighting settings */
  static environmentInverse(beforeSettings: Record<string, unknown>): InverseOperation {
    return {
      subsystem: 'environment',
      description: `Restore environment and sky settings`,
      recovery: { kind: 'environment', payload: { beforeSettings } },
      execute: (ctx) => {
        if (typeof beforeSettings.timeOfDay === 'number') {
          ctx.aiBridge.execute({ type: 'set_time_of_day', hour: beforeSettings.timeOfDay });
        }
      },
    };
  }

  /** Rehydrate a durable inverse descriptor into executable rollback logic. */
  static fromRecovery(recovery: { kind: string; payload: Record<string, unknown> }): InverseOperation | undefined {
    const p = recovery.payload as any;
    switch (recovery.kind) {
      case 'spawn': return this.spawnInverse(p.guid, p.entityId);
      case 'destroy': return this.destroyInverse(p.snapshot);
      case 'transform': return this.transformInverse(p.guid, p.before);
      case 'parenting': return this.parentingInverse(p.guid, p.beforeParentGuid ?? null);
      case 'identity': return this.identityInverse(p.guid, p.beforeName, p.beforeTags);
      case 'component': return this.componentInverse(p.guid, p.componentName, p.beforeProps ?? null);
      case 'terrain': return this.terrainSculptInverse(p.entityId, p.beforeHeights ?? []);
      case 'gameplay': return this.gameplayVarInverse(p.key, p.beforeValue);
      case 'inventory': return this.inventoryInverse(p.owner, p.item, p.countDelta);
      case 'environment': return this.environmentInverse(p.beforeSettings ?? {});
      default: return undefined;
    }
  }
}
