/**
 * ProjectReconciler — Computes minimal transactional diffs between desired project documents
 * and live engine state using persistent GUIDs.
 */

import type { AICommand } from '../ai/AIBridge';
import type { EntityRecord, ProjectDocument } from './ProjectDocument';

export interface ReconciliationReport {
  addedGuids: string[];
  removedGuids: string[];
  modifiedGuids: string[];
  unchangedGuids: string[];
  commands: AICommand[];
}

function bindingAlias(guid: string): string {
  return `spawn_${guid.replace(/[^A-Za-z0-9_]/g, '_') || 'entity'}`;
}

export class ProjectReconciler {
  /**
   * Reconciles a desired ProjectDocument scene against live entity records.
   * Returns a minimal stream of commands to transition live state into desired state without tearing down unchanged entities.
   */
  static reconcile(
    desiredEntities: EntityRecord[],
    liveEntities: EntityRecord[]
  ): ReconciliationReport {
    const commands: AICommand[] = [];
    const liveMap = new Map<string, EntityRecord>();
    for (const e of liveEntities) liveMap.set(e.guid, e);

    const desiredMap = new Map<string, EntityRecord>();
    for (const e of desiredEntities) {
      if (desiredMap.has(e.guid)) throw new Error(`ProjectReconciler: duplicate desired GUID '${e.guid}'.`);
      desiredMap.set(e.guid, e);
    }
    const addedAliases = new Map<string, string>();
    const usedAliases = new Set<string>();
    for (const e of desiredEntities) {
      if (liveMap.has(e.guid)) continue;
      const base = bindingAlias(e.guid);
      let alias = base;
      let suffix = 2;
      while (usedAliases.has(alias)) alias = `${base}_${suffix++}`;
      usedAliases.add(alias);
      addedAliases.set(e.guid, alias);
    }

    const addedGuids: string[] = [];
    const removedGuids: string[] = [];
    const modifiedGuids: string[] = [];
    const unchangedGuids: string[] = [];

    // Step 1: Detect removed entities (in live, not in desired)
    for (const [guid] of liveMap) {
      if (!desiredMap.has(guid)) {
        removedGuids.push(guid);
        commands.push({
          type: 'destroy_entity',
          entityId: `guid:${guid}` as any,
        });
      }
    }

    // Step 2: Detect added entities (in desired, not in live)
    for (const [guid, desired] of desiredMap) {
      if (!liveMap.has(guid)) {
        addedGuids.push(guid);
        const pos = desired.transform?.position ?? [0, 0, 0];
        const kind = desired.blueprint?.kind ?? 'box';

        const alias = addedAliases.get(guid)!;
        commands.push({
          type: 'spawn_entity',
          as: alias,
          guid,
          x: pos[0],
          y: pos[1],
          z: pos[2],
          glbPath: (desired.blueprint?.params?.assetId as string) ?? kind,
          params: { ...(desired.blueprint?.params ?? {}), rootMotion: desired.rootMotion },
          blueprint: desired.blueprint,
        } as AICommand);

        const quat = desired.transform?.quaternion ?? [0, 0, 0, 1];
        const scale = desired.transform?.scale ?? [1, 1, 1];
        commands.push({
          type: 'set_transform',
          entityId: { $ref: `${alias}.id` } as any,
          rotation: { x: quat[0], y: quat[1], z: quat[2], w: quat[3] },
          scale: { x: scale[0], y: scale[1], z: scale[2] },
        });

        if (desired.name) {
          commands.push({
            type: 'set_entity_name',
            entityId: { $ref: `${alias}.id` } as any,
            name: desired.name,
          });
        }

        if (desired.tags) {
          for (const tag of desired.tags) {
            commands.push({
              type: 'tag_entity',
              entityId: { $ref: `${alias}.id` } as any,
              tag,
            });
          }
        }

        if (desired.components) {
          for (const [compName, props] of Object.entries(desired.components)) {
            commands.push({
              type: 'component_add',
              entityId: { $ref: `${alias}.id` } as any,
              component: compName,
              props: props as Record<string, unknown>,
            });
          }
        }

        if (desired.scriptSource) {
          commands.push({
            type: 'add_script',
            entityId: { $ref: `${alias}.id` } as any,
            sourceCode: desired.scriptSource,
          });
        }
      }
    }

    // Parent added entities only after every spawn binding is available. Existing
    // parents continue to resolve semantically from the live scene.
    for (const [guid, desired] of desiredMap) {
      if (liveMap.has(guid) || !desired.parentGuid) continue;
      const parentRef = !liveMap.has(desired.parentGuid) && desiredMap.has(desired.parentGuid)
        ? ({ $ref: `${addedAliases.get(desired.parentGuid)!}.id` } as any)
        : (`guid:${desired.parentGuid}` as any);
      commands.push({
        type: 'parent_entity',
        entityId: { $ref: `${addedAliases.get(guid)!}.id` } as any,
        parentId: parentRef,
      });
    }

    // Step 3: Detect modifications on existing entities
    for (const [guid, desired] of desiredMap) {
      const live = liveMap.get(guid);
      if (!live) continue;

      let isModified = false;

      // Check transform
      const livePos = live.transform?.position ?? [0, 0, 0];
      const desiredPos = desired.transform?.position ?? [0, 0, 0];
      const posChanged =
        Math.abs(livePos[0] - desiredPos[0]) > 0.0001 ||
        Math.abs(livePos[1] - desiredPos[1]) > 0.0001 ||
        Math.abs(livePos[2] - desiredPos[2]) > 0.0001;
      const liveQuat = live.transform?.quaternion ?? [0, 0, 0, 1];
      const desiredQuat = desired.transform?.quaternion ?? [0, 0, 0, 1];
      const liveScale = live.transform?.scale ?? [1, 1, 1];
      const desiredScale = desired.transform?.scale ?? [1, 1, 1];
      const rotationChanged = desiredQuat.some((v, i) => Math.abs(v - liveQuat[i]) > 0.0001);
      const scaleChanged = desiredScale.some((v, i) => Math.abs(v - liveScale[i]) > 0.0001);

      if (posChanged || rotationChanged || scaleChanged) {
        isModified = true;
        commands.push({
          type: 'set_transform',
          entityId: `guid:${guid}` as any,
          position: posChanged ? { x: desiredPos[0], y: desiredPos[1], z: desiredPos[2] } : undefined,
          rotation: rotationChanged ? { x: desiredQuat[0], y: desiredQuat[1], z: desiredQuat[2], w: desiredQuat[3] } : undefined,
          scale: scaleChanged ? { x: desiredScale[0], y: desiredScale[1], z: desiredScale[2] } : undefined,
        });
      }

      // Check name
      if (desired.name !== live.name) {
        isModified = true;
        if (desired.name) {
          commands.push({
            type: 'set_entity_name',
            entityId: `guid:${guid}` as any,
            name: desired.name,
          });
        }
      }

      // Check tags
      const liveTags = new Set(live.tags ?? []);
      const desiredTags = new Set(desired.tags ?? []);
      for (const t of desiredTags) {
        if (!liveTags.has(t)) {
          isModified = true;
          commands.push({ type: 'tag_entity', entityId: `guid:${guid}` as any, tag: t });
        }
      }
      for (const t of liveTags) {
        if (!desiredTags.has(t)) {
          isModified = true;
          commands.push({ type: 'remove_tag', entityId: `guid:${guid}` as any, tag: t });
        }
      }

      // Check components
      const liveComps = live.components ?? {};
      const desiredComps = desired.components ?? {};
      for (const [compName, props] of Object.entries(desiredComps)) {
        if (JSON.stringify(liveComps[compName]) !== JSON.stringify(props)) {
          isModified = true;
          commands.push({
            type: 'component_add',
            entityId: `guid:${guid}` as any,
            component: compName,
            props: props as Record<string, unknown>,
          });
        }
      }
      for (const compName of Object.keys(liveComps)) {
        if (!(compName in desiredComps)) {
          isModified = true;
          commands.push({
            type: 'component_remove',
            entityId: `guid:${guid}` as any,
            component: compName,
          });
        }
      }

      // Check parenting
      if (desired.parentGuid !== live.parentGuid) {
        isModified = true;
        commands.push({
          type: 'parent_entity',
          entityId: `guid:${guid}` as any,
          parentId: desired.parentGuid ? (`guid:${desired.parentGuid}` as any) : null,
        });
      }

      if (isModified) {
        modifiedGuids.push(guid);
      } else {
        unchangedGuids.push(guid);
      }
    }

    return {
      addedGuids,
      removedGuids,
      modifiedGuids,
      unchangedGuids,
      commands,
    };
  }
}
