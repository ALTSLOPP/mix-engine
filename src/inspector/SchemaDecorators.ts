import { SchemaRegistry } from './SchemaRegistry';
import type { ActionMetadata, GroupMetadata, InspectorSchemaDef, PropertyMetadata } from './types';

const PENDING_SCHEMAS = new WeakMap<any, InspectorSchemaDef>();

function getOrCreatePendingSchema(target: any): InspectorSchemaDef {
  let schema = PENDING_SCHEMAS.get(target);
  if (!schema) {
    schema = {
      properties: {},
      groups: {},
      actions: {},
    };
    PENDING_SCHEMAS.set(target, schema);
  }
  return schema;
}

/**
 * Class decorator to mark a class as inspectable.
 */
export function Inspectable(options: { title?: string; description?: string; icon?: string; version?: number } = {}) {
  return function (constructor: Function) {
    const pending = getOrCreatePendingSchema(constructor.prototype);
    pending.title = options.title ?? constructor.name;
    pending.description = options.description;
    pending.icon = options.icon;
    pending.version = options.version ?? 1;

    SchemaRegistry.define(constructor, pending);
  };
}

/**
 * Property decorator to attach inspector metadata to a field.
 */
export function InspectField(metadata: PropertyMetadata = {}) {
  return function (target: any, propertyKey: string) {
    const pending = getOrCreatePendingSchema(target);
    pending.properties[propertyKey] = {
      label: propertyKey,
      ...metadata,
    };
  };
}

/**
 * Method decorator to register an inspector button/action.
 */
export function InspectAction(metadata: ActionMetadata = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const pending = getOrCreatePendingSchema(target);
    pending.actions = pending.actions || {};
    pending.actions[propertyKey] = {
      id: propertyKey,
      label: metadata.label ?? propertyKey,
      execute: descriptor.value,
      ...metadata,
    };
  };
}

/**
 * Helper to define an inspector group.
 */
export function InspectGroup(groupName: string, metadata: GroupMetadata) {
  return function (constructor: Function) {
    const pending = getOrCreatePendingSchema(constructor.prototype);
    pending.groups = pending.groups || {};
    pending.groups[groupName] = metadata;
  };
}

export interface ExposeOptions {
  type?: 'range' | 'number' | 'string' | 'bool' | 'boolean' | 'enum' | 'vector3' | 'asset';
  min?: number;
  max?: number;
  step?: number;
  options?: string[] | Array<{ label: string; value: unknown }>;
  doc?: string;
  default?: unknown;
}

/**
 * Universal property decorator for exposing fields to Inspector Studio,
 * HELM manifest documentation, and Component schema metadata.
 */
export function expose(options: ExposeOptions = {}) {
  return function (target: any, propertyKey: string) {
    const pending = getOrCreatePendingSchema(target);
    const propType =
      options.type === 'bool' ? 'boolean' : (options.type as any) ?? 'number';
    pending.properties[propertyKey] = {
      label: propertyKey,
      type: propType,
      min: options.min,
      max: options.max,
      step: options.step,
      options: options.options,
      description: options.doc,
    };

    const ctor = target.constructor;
    if (ctor) {
      if (!Object.prototype.hasOwnProperty.call(ctor, '_schema') || !ctor._schema) {
        ctor._schema = { ...(ctor._schema || {}) };
      }
      ctor._schema[propertyKey] = {
        type: options.type ?? 'number',
        min: options.min,
        max: options.max,
        step: options.step,
        options: options.options,
        doc: options.doc,
        default: options.default,
      };
    }
  };
}
