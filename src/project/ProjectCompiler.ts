/**
 * ProjectCompiler — Bidirectional compiler between declarative ProjectDocuments and AICommand streams.
 */

import type { Engine } from '../engine/Engine';
import type { AIBridge, AICommand } from '../ai/AIBridge';
import {
  type ProjectDocument,
  type EntityRecord,
  createEmptyProject,
  PROJECT_DOCUMENT_KIND,
  PROJECT_DOCUMENT_VERSION,
} from './ProjectDocument';

export class ProjectCompiler {
  /**
   * Compiles a declarative ProjectDocument (or specific scene) into a stream of executable AICommands.
   */
  static compileDocument(doc: ProjectDocument, sceneName?: string): AICommand[] {
    const commands: AICommand[] = [];
    const targetScene = sceneName ?? doc.entryScene ?? Object.keys(doc.scenes)[0] ?? 'main';
    const entities = doc.scenes[targetScene] ?? [];

    // 1. Environment & Sky
    if (doc.environment) {
      if (typeof doc.environment.timeOfDay === 'number') {
        commands.push({ type: 'set_time_of_day', hour: doc.environment.timeOfDay });
      }
      if (typeof doc.environment.fogDensity === 'number' && doc.environment.fogDensity > 0) {
        commands.push({
          type: 'fog_set_params',
          density: doc.environment.fogDensity,
          color: doc.environment.fogColor ?? '#ffffff',
        });
      }
    }

    // 2. Spawn entities
    const aliases = createGuidAliases(entities.map((entity) => entity.guid));
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const alias = aliases.get(e.guid)!;
      const pos = e.transform?.position ?? [0, 0, 0];
      const kind = e.blueprint?.kind ?? 'box';

      commands.push({
        type: 'spawn_entity',
        // BatchPlanner treats a top-level `as` as an output binding while the
        // command remains directly executable and backwards-compatible.
        as: alias,
        guid: e.guid,
        x: pos[0],
        y: pos[1],
        z: pos[2],
        glbPath: (e.blueprint?.params?.assetId as string) ?? kind,
        params: { ...(e.blueprint?.params ?? {}), rootMotion: e.rootMotion },
        blueprint: e.blueprint,
      } as AICommand);

      const quat = e.transform?.quaternion ?? [0, 0, 0, 1];
      const scale = e.transform?.scale ?? [1, 1, 1];
      commands.push({
        type: 'set_transform',
        entityId: { $ref: `${alias}.id` } as any,
        rotation: { x: quat[0], y: quat[1], z: quat[2], w: quat[3] },
        scale: { x: scale[0], y: scale[1], z: scale[2] },
      });

      if (e.name) {
        commands.push({
          type: 'set_entity_name',
          entityId: { $ref: `${alias}.id` } as any,
          name: e.name,
        });
      }

      if (e.tags && Array.isArray(e.tags)) {
        for (const tag of e.tags) {
          commands.push({
            type: 'tag_entity',
            entityId: { $ref: `${alias}.id` } as any,
            tag,
          });
        }
      }

      if (e.components) {
        for (const [compName, props] of Object.entries(e.components)) {
          commands.push({
            type: 'component_add',
            entityId: { $ref: `${alias}.id` } as any,
            component: compName,
            props: props as Record<string, unknown>,
          });
        }
      }

      if (e.scriptSource) {
        commands.push({
          type: 'add_script',
          entityId: { $ref: `${alias}.id` } as any,
          sourceCode: e.scriptSource,
        });
      }
    }

    // 3. Parenting pass (after all entities exist)
    for (const e of entities) {
      if (e.parentGuid) {
        commands.push({
          type: 'parent_entity',
          entityId: { $ref: `${aliases.get(e.guid)!}.id` } as any,
          parentId: aliases.has(e.parentGuid)
            ? ({ $ref: `${aliases.get(e.parentGuid)!}.id` } as any)
            : (`guid:${e.parentGuid}` as any),
        });
      }
    }

    return commands;
  }

  /**
   * Decompiles the live engine scene state into a canonical ProjectDocument.
   */
  static decompileToDocument(
    engine: Engine,
    aiBridge: AIBridge,
    options?: { projectName?: string; sceneName?: string }
  ): ProjectDocument {
    const doc = createEmptyProject(options?.projectName ?? 'Project');
    const sceneName = options?.sceneName ?? 'main';
    const sm = engine.sceneManager;
    const entityIds = sm.allEntityIds();
    const records: EntityRecord[] = [];

    for (const id of entityIds) {
      const rb = sm.getRigidBody(id);
      const bp = sm.getBlueprint(id);
      const guid = sm.ensureGuid(id);
      const parentGuid = sm.getParentGuid(id) ?? null;
      const name = aiBridge.getEntityName(id);
      const tags = aiBridge.getEntityTags(id);

      let pos: [number, number, number] = [0, 0, 0];
      let quat: [number, number, number, number] = [0, 0, 0, 1];
      let scale: [number, number, number] = [1, 1, 1];

      if (rb) {
        pos = [rb.mesh.position.x, rb.mesh.position.y, rb.mesh.position.z];
        quat = [rb.mesh.quaternion.x, rb.mesh.quaternion.y, rb.mesh.quaternion.z, rb.mesh.quaternion.w];
        scale = [rb.mesh.scale.x, rb.mesh.scale.y, rb.mesh.scale.z];
      }

      const components: Record<string, unknown> = {};
      const attached = sm.getAllComponents(id);
      for (const comp of attached) {
        const type = (comp.constructor as any).type ?? comp.constructor.name;
        components[type] = (comp as any).serialize?.() ?? {};
      }

      records.push({
        guid,
        name,
        parentGuid,
        tags: tags.length > 0 ? tags : undefined,
        blueprint: bp ?? { kind: 'box', params: {} },
        transform: {
          position: pos,
          quaternion: quat,
          scale,
        },
        components: Object.keys(components).length > 0 ? components : undefined,
      });
    }

    doc.scenes[sceneName] = records;
    doc.updatedAt = Date.now();
    return doc;
  }
}

function createGuidAliases(guids: string[]): Map<string, string> {
  const aliases = new Map<string, string>();
  const used = new Set<string>();
  for (const guid of guids) {
    if (aliases.has(guid)) throw new Error(`ProjectCompiler: duplicate entity GUID '${guid}'.`);
    const base = `spawn_${guid.replace(/[^A-Za-z0-9_]/g, '_') || 'entity'}`;
    let alias = base;
    let suffix = 2;
    while (used.has(alias)) alias = `${base}_${suffix++}`;
    used.add(alias);
    aliases.set(guid, alias);
  }
  return aliases;
}
