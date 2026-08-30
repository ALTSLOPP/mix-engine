export type MigrationHandler = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * SerializationEngine — Deterministic polymorphic serializer with migrations, diffing, and type tags.
 */
export class SerializationEngine {
  private static typeRegistry = new Map<string, any>();
  private static migrations = new Map<string, Map<number, MigrationHandler>>();

  static registerType(name: string, constructor: any): void {
    this.typeRegistry.set(name, constructor);
  }

  static registerMigration(typeName: string, fromVersion: number, toVersion: number, handler: MigrationHandler): void {
    if (!this.migrations.has(typeName)) {
      this.migrations.set(typeName, new Map());
    }
    this.migrations.get(typeName)!.set(fromVersion, handler);
  }

  static serialize(obj: any): string {
    const visited = new Set<unknown>();
    const root = this.serializeValue(obj, visited);
    return JSON.stringify(root, null, 2);
  }

  static deserialize<T = unknown>(jsonStr: string): T {
    const parsed = JSON.parse(jsonStr);
    return this.deserializeValue(parsed) as T;
  }

  static clone<T = unknown>(obj: T): T {
    return this.deserialize<T>(this.serialize(obj));
  }

  static diff(a: any, b: any): Record<string, { oldVal: unknown; newVal: unknown }> {
    const diffs: Record<string, { oldVal: unknown; newVal: unknown }> = {};
    const keys = new Set<string>([...Object.keys(a || {}), ...Object.keys(b || {})]);

    for (const key of keys) {
      const vA = a ? a[key] : undefined;
      const vB = b ? b[key] : undefined;
      if (JSON.stringify(vA) !== JSON.stringify(vB)) {
        diffs[key] = { oldVal: vA, newVal: vB };
      }
    }
    return diffs;
  }

  private static serializeValue(val: any, visited: Set<unknown>): unknown {
    if (val === null || val === undefined) return val;
    if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') return val;

    // Safety checks: reject functions, DOM nodes, GPU resources
    if (typeof val === 'function') return undefined;
    if (typeof HTMLElement !== 'undefined' && val instanceof HTMLElement) return undefined;
    if (val.isWebGLTexture || val.isWebGLBuffer || val.isWebGLProgram) return undefined;

    if (visited.has(val)) {
      return { $ref: true }; // circular protection
    }
    visited.add(val);

    if (Array.isArray(val)) {
      return val.map((item) => this.serializeValue(item, visited));
    }

    if (val instanceof Map) {
      const entries: Array<[unknown, unknown]> = [];
      for (const [k, v] of val.entries()) {
        entries.push([this.serializeValue(k, visited), this.serializeValue(v, visited)]);
      }
      return { $type: '__Map__', entries };
    }

    if (val instanceof Set) {
      const items: unknown[] = [];
      for (const item of val.values()) {
        items.push(this.serializeValue(item, visited));
      }
      return { $type: '__Set__', items };
    }

    if (ArrayBuffer.isView(val) && !(val instanceof DataView)) {
      return {
        $type: '__TypedArray__',
        viewType: val.constructor.name,
        data: Array.from(val as unknown as number[]),
      };
    }

    // Generic Object or Polymorphic class
    const out: Record<string, unknown> = {};
    const constructorName = val.constructor ? val.constructor.name : 'Object';

    if (constructorName !== 'Object') {
      out.$type = constructorName;
    }

    for (const key of Object.keys(val)) {
      if (key.startsWith('__')) continue;
      const propVal = this.serializeValue(val[key], visited);
      if (propVal !== undefined) {
        out[key] = propVal;
      }
    }

    return out;
  }

  private static deserializeValue(val: any): unknown {
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;

    if (Array.isArray(val)) {
      return val.map((item) => this.deserializeValue(item));
    }

    if (val.$type === '__Map__') {
      const map = new Map();
      for (const [k, v] of val.entries || []) {
        map.set(this.deserializeValue(k), this.deserializeValue(v));
      }
      return map;
    }

    if (val.$type === '__Set__') {
      const set = new Set();
      for (const item of val.items || []) {
        set.add(this.deserializeValue(item));
      }
      return set;
    }

    if (val.$type === '__TypedArray__') {
      const arr = val.data || [];
      switch (val.viewType) {
        case 'Float32Array':
          return new Float32Array(arr);
        case 'Float64Array':
          return new Float64Array(arr);
        case 'Uint8Array':
          return new Uint8Array(arr);
        case 'Int32Array':
          return new Int32Array(arr);
        default:
          return arr;
      }
    }

    // Handle polymorphic types & migrations
    let objData = { ...val };
    const typeName = val.$type;

    if (typeName && this.migrations.has(typeName)) {
      const ver = val.$version ?? 1;
      const typeMigrations = this.migrations.get(typeName)!;
      let currVer = ver;
      while (typeMigrations.has(currVer)) {
        const handler = typeMigrations.get(currVer)!;
        objData = handler(objData);
        currVer++;
      }
    }

    let instance: any = {};
    if (typeName && this.typeRegistry.has(typeName)) {
      const Ctor = this.typeRegistry.get(typeName);
      instance = new Ctor();
    }

    for (const key of Object.keys(objData)) {
      if (key === '$type' || key === '$version') continue;
      instance[key] = this.deserializeValue(objData[key]);
    }

    return instance;
  }
}
