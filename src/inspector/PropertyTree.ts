import { PropertyNode } from './PropertyNode';
import type { InspectorSchemaDef, PropertyMetadata } from './types';

export type PropertyChangeCallback = (path: string, newValue: unknown, oldValue: unknown) => void;

const FORBIDDEN_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

function assertSafePath(path: string): string[] {
  const parts = path.split('.');
  if (!path || parts.some((part) => !part || FORBIDDEN_PATH_PARTS.has(part))) {
    throw new Error(`[PropertyTree] Unsafe or invalid property path '${path}'`);
  }
  return parts;
}

export interface PropertyHistoryEntry {
  path: string;
  oldVal: unknown;
  newVal: unknown;
  timestamp: number;
}

function safeClone<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(val);
    }
    return JSON.parse(JSON.stringify(val));
  } catch {
    if (Array.isArray(val)) {
      return [...val] as unknown as T;
    }
    return { ...val } as unknown as T;
  }
}

/**
 * PropertyTree — High-performance cached hierarchical reflection tree with multi-target support,
 * transactional undo/redo history, and dynamic array/map collection mutations.
 */
export class PropertyTree {
  readonly targets: any[];
  readonly schema: InspectorSchemaDef | null;
  readonly rootNode: PropertyNode;

  private nodeByPath = new Map<string, PropertyNode>();
  private changeListeners = new Set<PropertyChangeCallback>();

  private undoStack: PropertyHistoryEntry[] = [];
  private redoStack: PropertyHistoryEntry[] = [];
  private isApplyingHistory = false;

  constructor(targetOrTargets: any | any[], schema: InspectorSchemaDef | null = null) {
    this.targets = Array.isArray(targetOrTargets) ? targetOrTargets : [targetOrTargets];
    this.schema = schema;

    this.rootNode = new PropertyNode(
      '',
      'root',
      null,
      () => this.targets[0],
      (val) => {
        for (const t of this.targets) {
          Object.assign(t, val);
        }
      },
    );

    this.rebuild();
  }

  rebuild(): void {
    this.nodeByPath.clear();
    this.nodeByPath.set('', this.rootNode);
    const primary = this.targets[0];
    if (!primary || typeof primary !== 'object') return;

    const visited = new Set<unknown>([primary]);
    this.buildChildren(this.rootNode, primary, '', visited, 0);
  }

  private buildChildren(
    parentNode: PropertyNode,
    obj: any,
    currentPath: string,
    visited: Set<unknown>,
    depth: number,
  ): void {
    if (depth > 12) return; // Circular reference / depth protection

    const schemaProps = this.schema?.properties ?? {};

    // Get all keys (from object or schema)
    const keys = new Set<string>([...Object.keys(obj), ...Object.keys(schemaProps)]);

    for (const key of keys) {
      if (key.startsWith('__') || typeof obj[key] === 'function') continue;

      const path = currentPath ? `${currentPath}.${key}` : key;
      const meta: PropertyMetadata = schemaProps[path] ?? schemaProps[key] ?? {};

      const node = new PropertyNode(
        path,
        key,
        parentNode,
        () => this.readValue(path),
        (val) => this.writeValue(path, val),
        meta,
      );

      // Check multi-object mixed value state
      node.isMixedValue = this.checkIsMixed(path);

      parentNode.addChild(node);
      this.nodeByPath.set(path, node);

      // Recurse into objects / arrays (unless handled by a dedicated compound drawer like polymorphic)
      const val = obj[key];
      const isCompoundDrawer = meta.type === 'polymorphic' || Boolean(meta.polymorphicTypes);
      if (val && typeof val === 'object' && !isCompoundDrawer && !visited.has(val)) {
        visited.add(val);
        this.buildChildren(node, val, path, visited, depth + 1);
      }
    }
  }

  readValue(path: string): unknown {
    const primary = this.targets[0];
    if (!path) return primary;
    return this.getPathValue(primary, path);
  }

  writeValue(path: string, val: unknown): void {
    const primary = this.targets[0];
    const oldVal = this.getPathValue(primary, path);

    // Record history
    if (!this.isApplyingHistory) {
      this.undoStack.push({
        path,
        oldVal: safeClone(oldVal),
        newVal: safeClone(val),
        timestamp: performance.now(),
      });
      if (this.undoStack.length > 100) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }

    for (const target of this.targets) {
      this.setPathValue(target, path, val);
      for (const listener of this.changeListeners) {
        listener(path, val, oldVal);
      }
    }

    const node = this.nodeByPath.get(path);
    if (node) {
      node.isMixedValue = this.checkIsMixed(path);
    }
  }

  // --- Transactional Undo / Redo -------------------------------------------

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    const entry = this.undoStack.pop()!;
    this.redoStack.push(entry);

    this.isApplyingHistory = true;
    try {
      this.writeValue(entry.path, entry.oldVal);
      this.rebuild();
    } finally {
      this.isApplyingHistory = false;
    }
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    const entry = this.redoStack.pop()!;
    this.undoStack.push(entry);

    this.isApplyingHistory = true;
    try {
      this.writeValue(entry.path, entry.newVal);
      this.rebuild();
    } finally {
      this.isApplyingHistory = false;
    }
    return true;
  }

  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  // --- Dynamic Collection Operations ---------------------------------------
  insertArrayItem(path: string, index: number, value: unknown): void {
    const arr = this.readValue(path);
    if (!Array.isArray(arr)) return;
    const newArr = [...arr];
    const insertIdx = Math.max(0, Math.min(newArr.length, index));
    newArr.splice(insertIdx, 0, value);
    this.writeValue(path, newArr);
    this.rebuild();
  }

  removeArrayItem(path: string, index: number): void {
    const arr = this.readValue(path);
    if (!Array.isArray(arr) || index < 0 || index >= arr.length) return;
    const newArr = [...arr];
    newArr.splice(index, 1);
    this.writeValue(path, newArr);
    this.rebuild();
  }

  moveArrayItem(path: string, fromIndex: number, toIndex: number): void {
    const arr = this.readValue(path);
    if (!Array.isArray(arr) || fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return;
    const newArr = [...arr];
    const [item] = newArr.splice(fromIndex, 1);
    newArr.splice(toIndex, 0, item);
    this.writeValue(path, newArr);
    this.rebuild();
  }

  setMapEntry(path: string, key: string, value: unknown): void {
    const mapOrObj = this.readValue(path) as Record<string, unknown> | Map<string, unknown>;
    if (!mapOrObj) return;
    if (mapOrObj instanceof Map) {
      const updated = new Map(mapOrObj);
      updated.set(key, value);
      this.writeValue(path, updated);
    } else if (typeof mapOrObj === 'object') {
      if (FORBIDDEN_PATH_PARTS.has(key)) throw new Error(`[PropertyTree] Unsafe map key '${key}'`);
      const updated = { ...mapOrObj, [key]: value };
      this.writeValue(path, updated);
    }
    this.rebuild();
  }

  removeMapEntry(path: string, key: string): void {
    const mapOrObj = this.readValue(path) as Record<string, unknown> | Map<string, unknown>;
    if (!mapOrObj) return;
    if (mapOrObj instanceof Map) {
      const updated = new Map(mapOrObj);
      updated.delete(key);
      this.writeValue(path, updated);
    } else if (typeof mapOrObj === 'object') {
      if (FORBIDDEN_PATH_PARTS.has(key)) throw new Error(`[PropertyTree] Unsafe map key '${key}'`);
      const updated = { ...mapOrObj };
      delete updated[key];
      this.writeValue(path, updated);
    }
    this.rebuild();
  }

  findNode(path: string): PropertyNode | null {
    return this.nodeByPath.get(path) ?? null;
  }

  getAllNodes(): PropertyNode[] {
    return Array.from(this.nodeByPath.values());
  }

  onChange(callback: PropertyChangeCallback): () => void {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }

  private checkIsMixed(path: string): boolean {
    if (this.targets.length <= 1) return false;
    const firstVal = this.getPathValue(this.targets[0], path);
    for (let i = 1; i < this.targets.length; i++) {
      const v = this.getPathValue(this.targets[i], path);
      if (v !== firstVal) return true;
    }
    return false;
  }

  private getPathValue(obj: any, path: string): unknown {
    if (!obj) return undefined;
    const parts = assertSafePath(path);
    let curr = obj;
    for (const p of parts) {
      if (curr === null || curr === undefined) return undefined;
      curr = curr[p];
    }
    return curr;
  }

  private setPathValue(obj: any, path: string, val: unknown): void {
    if (!obj) return;
    const parts = assertSafePath(path);
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!curr[p] || typeof curr[p] !== 'object') {
        curr[p] = {};
      }
      curr = curr[p];
    }
    curr[parts[parts.length - 1]] = val;
  }
}
