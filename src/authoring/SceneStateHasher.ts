/**
 * SceneStateHasher — Deterministic, pure hashing of authored engine state.
 *
 * Produces canonical hash fingerprints for entities, GUIDs, transforms, components,
 * terrain patches, and gameplay state to guarantee byte-identical verification.
 */

export interface CanonicalEntityState {
  guid?: string;
  name?: string;
  kind?: string;
  tags?: string[];
  parentGuid?: string;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  components?: Record<string, unknown>;
  scriptSource?: string | null;
  material?: Record<string, unknown>;
  terrain?: Record<string, unknown>;
}

export interface CanonicalProjectState {
  entities: CanonicalEntityState[];
  terrain?: Record<string, unknown>;
  gameplay?: Record<string, unknown>;
  environment?: Record<string, unknown>;
}

export class SceneStateHasher {
  /**
   * Generates a 64-bit FNV-1a hex hash from a string.
   */
  static fnv1a64(str: string): string {
    let hash = 0xcbf29ce484222325n;
    const bytes = new TextEncoder().encode(str);
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
  }

  /**
   * Deterministically canonicalizes any JSON-compatible object by sorting all object keys.
   */
  static canonicalizeJson(val: unknown): string {
    if (val === null || val === undefined) return String(val);
    if (typeof val === 'number') {
      if (Number.isNaN(val)) return '"NaN"';
      if (val === Infinity) return '"Infinity"';
      if (val === -Infinity) return '"-Infinity"';
      if (Object.is(val, -0)) return '-0';
      return val.toString();
    }
    if (typeof val === 'boolean' || typeof val === 'string') {
      return JSON.stringify(val);
    }
    if (Array.isArray(val)) {
      return '[' + val.map((elem) => this.canonicalizeJson(elem)).join(',') + ']';
    }
    if (typeof val === 'object') {
      const keys = Object.keys(val as Record<string, unknown>).sort();
      const entries = keys
        .filter((k) => (val as Record<string, unknown>)[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${this.canonicalizeJson((val as Record<string, unknown>)[k])}`);
      return '{' + entries.join(',') + '}';
    }
    return JSON.stringify(String(val));
  }

  /**
   * Computes a deterministic hash for canonical entity collection.
   */
  static hashEntities(entities: CanonicalEntityState[]): string {
    // Sort entities by GUID (or name/kind fallback) for stable order
    const sorted = entities.slice().sort((a, b) => {
      const idA = a.guid ?? a.name ?? '';
      const idB = b.guid ?? b.name ?? '';
      return idA.localeCompare(idB);
    });
    const canonicalStr = this.canonicalizeJson(sorted);
    return this.fnv1a64(canonicalStr);
  }

  /**
   * Computes a full project state hash.
   */
  static hashState(state: CanonicalProjectState): string {
    const normalized: CanonicalProjectState = {
      ...state,
      entities: state.entities
        ? state.entities.slice().sort((a, b) => {
            const idA = a.guid ?? a.name ?? '';
            const idB = b.guid ?? b.name ?? '';
            return idA.localeCompare(idB);
          })
        : [],
    };
    const canonicalStr = this.canonicalizeJson(normalized);
    return this.fnv1a64(canonicalStr);
  }
}
