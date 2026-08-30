/**
 * DataflowResolver — Safe, AST/object-based resolver for batch output bindings.
 *
 * Resolves explicit `$ref` syntax like `{ "$ref": "hero.created[0].id" }` or
 * `{ "$ref": "hero.id" }` against execution bindings without using eval or Function.
 */

export interface OutputRef {
  $ref: string;
}

export class DataflowResolver {
  private static readonly FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  /** Check if a value is an OutputRef object */
  static isRef(val: unknown): val is OutputRef {
    return (
      typeof val === 'object' &&
      val !== null &&
      !Array.isArray(val) &&
      typeof (val as Record<string, unknown>).$ref === 'string'
    );
  }

  /** Extract all referenced binding names from an object/command */
  static extractRefs(input: unknown): string[] {
    const refs: string[] = [];
    this.collectRefs(input, refs);
    return Array.from(new Set(refs));
  }

  private static collectRefs(val: unknown, acc: string[]): void {
    if (!val || typeof val !== 'object') return;
    if (this.isRef(val)) {
      const binding = val.$ref.split('.')[0].split('[')[0];
      if (binding) acc.push(binding);
      return;
    }
    if (Array.isArray(val)) {
      for (const item of val) this.collectRefs(item, acc);
      return;
    }
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (this.FORBIDDEN_KEYS.has(k)) continue;
      this.collectRefs(v, acc);
    }
  }

  /**
   * Safely navigate a dot/bracket path into bindings object.
   * e.g. "hero.created[0].id" -> bindings.get("hero").created[0].id
   */
  static resolvePath(refPath: string, bindings: Map<string, unknown> | Record<string, unknown>): { value: unknown; found: boolean; error?: string } {
    if (!refPath || typeof refPath !== 'string') {
      return { value: undefined, found: false, error: 'Empty or invalid $ref path.' };
    }

    const segments = this.parsePathSegments(refPath);
    if (segments.length === 0) {
      return { value: undefined, found: false, error: `Invalid $ref path format: '${refPath}'.` };
    }

    for (const seg of segments) {
      if (this.FORBIDDEN_KEYS.has(seg)) {
        return { value: undefined, found: false, error: `Access to forbidden property '${seg}' in $ref path '${refPath}'.` };
      }
    }

    const rootKey = segments[0];
    let current: unknown;
    if (bindings instanceof Map) {
      if (!bindings.has(rootKey)) {
        return { value: undefined, found: false, error: `Binding '${rootKey}' has not been declared or executed.` };
      }
      current = bindings.get(rootKey);
    } else {
      if (!Object.prototype.hasOwnProperty.call(bindings, rootKey)) {
        return { value: undefined, found: false, error: `Binding '${rootKey}' has not been declared or executed.` };
      }
      current = bindings[rootKey];
    }

    // Shorthand resolution support: if root object has created/id conveniences
    if (segments.length === 2 && (segments[1] === 'id' || segments[1] === 'entityId')) {
      if (current && typeof current === 'object') {
        const obj = current as Record<string, unknown>;
        if (obj.id !== undefined) return { value: obj.id, found: true };
        if (obj.entityId !== undefined) return { value: obj.entityId, found: true };
        if (Array.isArray(obj.created) && obj.created.length > 0 && obj.created[0]?.id !== undefined) {
          return { value: obj.created[0].id, found: true };
        }
      }
    }

    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      if (current === null || current === undefined) {
        return { value: undefined, found: false, error: `Cannot read property '${seg}' of ${String(current)} in $ref path '${refPath}'.` };
      }

      if (Array.isArray(current)) {
        const idx = Number(seg);
        if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
          return { value: undefined, found: false, error: `Index '${seg}' out of bounds in array at $ref path '${refPath}'.` };
        }
        current = current[idx];
      } else if (typeof current === 'object') {
        const obj = current as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(obj, seg)) {
          // If accessing .id or .entityId on result container with created array
          if ((seg === 'id' || seg === 'entityId') && Array.isArray(obj.created) && obj.created.length > 0) {
            current = obj.created[0]?.id;
            continue;
          }
          return { value: undefined, found: false, error: `Property '${seg}' not found on object in $ref path '${refPath}'.` };
        }
        current = obj[seg];
      } else {
        return { value: undefined, found: false, error: `Cannot read property '${seg}' on primitive value in $ref path '${refPath}'.` };
      }
    }

    return { value: current, found: true };
  }

  /**
   * Deeply resolves all `{ "$ref": "..." }` nodes in an object.
   * Returns a cloned object with references replaced.
   */
  static resolveRefs<T>(
    input: T,
    bindings: Map<string, unknown> | Record<string, unknown>
  ): { resolved: T; errors: string[] } {
    const errors: string[] = [];
    const resolved = this.deepResolveNode(input, bindings, errors) as T;
    return { resolved, errors };
  }

  private static deepResolveNode(
    val: unknown,
    bindings: Map<string, unknown> | Record<string, unknown>,
    errors: string[]
  ): unknown {
    if (val === null || val === undefined) return val;

    if (this.isRef(val)) {
      const res = this.resolvePath(val.$ref, bindings);
      if (!res.found) {
        errors.push(res.error ?? `Failed to resolve $ref '${val.$ref}'.`);
        return val;
      }
      return res.value;
    }

    if (Array.isArray(val)) {
      return val.map((elem) => this.deepResolveNode(elem, bindings, errors));
    }

    if (typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (this.FORBIDDEN_KEYS.has(k)) continue;
        out[k] = this.deepResolveNode(v, bindings, errors);
      }
      return out;
    }

    return val;
  }

  /** Parses paths like "hero.created[0].id" into ['hero', 'created', '0', 'id'] */
  private static parsePathSegments(pathStr: string): string[] {
    const normalized = pathStr.replace(/\[(\w+)\]/g, '.$1');
    return normalized
      .split('.')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
}
