import { SchemaRegistry } from './SchemaRegistry';
import type { GroupMetadata, InspectorSchemaDef, PropertyMetadata } from './types';

/**
 * VisualDesigner — Schema authoring and designer runtime for Inspector Studio.
 */
export class VisualDesigner {
  readonly targetTypeOrName: any;
  schema: InspectorSchemaDef;

  constructor(targetTypeOrName: any) {
    this.targetTypeOrName = targetTypeOrName;
    const existing = SchemaRegistry.get(targetTypeOrName);
    this.schema = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          title: typeof targetTypeOrName === 'string' ? targetTypeOrName : targetTypeOrName.name,
          groups: {},
          properties: {},
          actions: {},
        };
  }

  setPropertyMetadata(property: string, meta: PropertyMetadata): this {
    this.schema.properties[property] = {
      ...(this.schema.properties[property] || {}),
      ...meta,
    };
    return this;
  }

  removePropertyMetadata(property: string): this {
    delete this.schema.properties[property];
    return this;
  }

  setGroup(groupName: string, meta: GroupMetadata): this {
    this.schema.groups = this.schema.groups || {};
    this.schema.groups[groupName] = meta;
    return this;
  }

  removeGroup(groupName: string): this {
    if (this.schema.groups) {
      delete this.schema.groups[groupName];
    }
    return this;
  }

  saveToRegistry(): void {
    SchemaRegistry.define(this.targetTypeOrName, this.schema);
  }

  exportTypeScriptCode(): string {
    const title = this.schema.title || 'CustomSchema';
    const json = JSON.stringify(this.schema, null, 2);
    return `import { defineInspector } from '../inspector';\n\nexport const ${title}Schema = defineInspector('${title}', ${json});\n`;
  }

  exportJSON(): string {
    return JSON.stringify(this.schema, null, 2);
  }
}
