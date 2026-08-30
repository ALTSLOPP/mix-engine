import type { PropertyMetadata, PropertyType, ValidationIssue } from './types';

export class PropertyNode {
  readonly path: string;
  readonly name: string;
  readonly parent: PropertyNode | null;
  readonly children = new Map<string, PropertyNode>();

  type: PropertyType = 'string';
  metadata: PropertyMetadata = {};
  isMixedValue = false;
  validationIssues: ValidationIssue[] = [];

  private getter: () => unknown;
  private setter: (val: unknown) => void;

  constructor(
    path: string,
    name: string,
    parent: PropertyNode | null,
    getter: () => unknown,
    setter: (val: unknown) => void,
    metadata: PropertyMetadata = {},
  ) {
    this.path = path;
    this.name = name;
    this.parent = parent;
    this.getter = getter;
    this.setter = setter;
    this.metadata = metadata;
    this.type = metadata.type ?? this.inferType(getter());
  }

  get value(): unknown {
    return this.getter();
  }

  set value(val: unknown) {
    this.setter(val);
  }

  addChild(node: PropertyNode): void {
    this.children.set(node.name, node);
  }

  getChild(name: string): PropertyNode | null {
    return this.children.get(name) ?? null;
  }

  inferType(val: unknown): PropertyType {
    if (typeof val === 'number') return 'number';
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'string') return 'string';
    if (Array.isArray(val)) return 'array';
    if (val instanceof Map) return 'map';
    if (val instanceof Set) return 'set';
    if (val && typeof val === 'object') return 'object';
    return 'custom';
  }
}
