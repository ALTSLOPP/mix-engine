import type { InspectorSchemaDef, PropertyMetadata } from './types';

/**
 * SchemaRegistry — Central registry for metadata-driven inspector schemas.
 */
export class SchemaRegistry {
  private static schemas = new Map<any, InspectorSchemaDef>();
  private static nameToKey = new Map<string, any>();

  static define(target: any, def: InspectorSchemaDef): InspectorSchemaDef {
    const key = typeof target === 'function' ? target : target;
    const name = typeof target === 'function' ? target.name : String(target);

    // Check inheritance if specified
    let mergedDef: InspectorSchemaDef = {
      ...def,
      groups: { ...(def.groups || {}) },
      properties: { ...(def.properties || {}) },
      actions: { ...(def.actions || {}) },
    };

    if (def.inheritedFrom && this.schemas.has(def.inheritedFrom)) {
      const parentDef = this.schemas.get(def.inheritedFrom)!;
      mergedDef = {
        ...parentDef,
        ...mergedDef,
        groups: { ...(parentDef.groups || {}), ...(mergedDef.groups || {}) },
        properties: { ...(parentDef.properties || {}), ...(mergedDef.properties || {}) },
        actions: { ...(parentDef.actions || {}), ...(mergedDef.actions || {}) },
      };
    }

    this.schemas.set(key, mergedDef);
    this.nameToKey.set(name, key);
    return mergedDef;
  }

  static get(target: any): InspectorSchemaDef | null {
    if (!target) return null;
    if (this.schemas.has(target)) {
      return this.schemas.get(target)!;
    }
    if (typeof target === 'object' && target.constructor && this.schemas.has(target.constructor)) {
      return this.schemas.get(target.constructor)!;
    }
    if (typeof target === 'string' && this.nameToKey.has(target)) {
      const k = this.nameToKey.get(target);
      return this.schemas.get(k) ?? null;
    }
    return null;
  }

  static patch(target: any, patchDef: Partial<InspectorSchemaDef>): InspectorSchemaDef | null {
    const existing = this.get(target);
    if (!existing) return null;

    const updated: InspectorSchemaDef = {
      ...existing,
      ...patchDef,
      groups: { ...(existing.groups || {}), ...(patchDef.groups || {}) },
      properties: { ...(existing.properties || {}), ...(patchDef.properties || {}) },
      actions: { ...(existing.actions || {}), ...(patchDef.actions || {}) },
    };

    const key = typeof target === 'function' ? target : (this.nameToKey.get(String(target)) ?? target);
    this.schemas.set(key, updated);
    return updated;
  }

  static list(): Array<{ name: string; schema: InspectorSchemaDef }> {
    const list: Array<{ name: string; schema: InspectorSchemaDef }> = [];
    for (const [key, schema] of this.schemas.entries()) {
      const name = typeof key === 'function' ? key.name : String(key);
      list.push({ name, schema });
    }
    return list;
  }

  static clear(): void {
    this.schemas.clear();
    this.nameToKey.clear();
  }
}

/**
 * Convenient standalone builder helper.
 *
 * Example:
 * ```ts
 * defineInspector(CharacterCombatConfig, {
 *   title: "Combat",
 *   groups: { attacks: { type: "tab", label: "Attacks" } },
 *   properties: {
 *     stamina: { type: "number", range: [0, 100], validate: "stamina >= 0" }
 *   }
 * });
 * ```
 */
export function defineInspector(target: any, schema: InspectorSchemaDef): InspectorSchemaDef {
  return SchemaRegistry.define(target, schema);
}
