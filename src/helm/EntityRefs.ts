export type HelmEntityRef =
  | number
  | `@${string}`
  | `guid:${string}`
  | `tag:${string}`
  | `id:${number}`
  | { id: number }
  | { name: string }
  | { guid: string }
  | { tag: string };

export interface EntityRefRecord {
  id: number;
  guid?: string;
  name?: string;
  tags?: string[];
}

export interface EntityRefResolution {
  ref: unknown;
  ok: boolean;
  id?: number;
  entity?: EntityRefRecord;
  error?: string;
  candidates?: EntityRefRecord[];
}

export interface CommandRefResolution {
  commands: unknown[];
  resolved: Array<{ path: string; ref: unknown; id: number }>;
  errors: Array<{ path: string; ref: unknown; message: string; candidates?: EntityRefRecord[] }>;
}

/** Resolve one stable IDE-facing selector. Names and tags must be unique by design. */
export function resolveEntityRef(ref: unknown, entities: EntityRefRecord[]): EntityRefResolution {
  let kind: 'id' | 'name' | 'guid' | 'tag';
  let value: string | number;

  if (typeof ref === 'number' && Number.isInteger(ref)) { kind = 'id'; value = ref; }
  else if (typeof ref === 'string') {
    const text = ref.trim();
    if (text.startsWith('@')) { kind = 'name'; value = text.slice(1); }
    else if (text.startsWith('guid:')) { kind = 'guid'; value = text.slice(5); }
    else if (text.startsWith('tag:')) { kind = 'tag'; value = text.slice(4); }
    else if (/^id:\d+$/.test(text)) { kind = 'id'; value = Number(text.slice(3)); }
    else return { ref, ok: false, error: `Invalid entity ref '${text}'. Use @name, guid:<guid>, tag:<tag>, id:<number>, or a selector object.` };
  } else if (isSelector(ref)) {
    const selectors = (['id', 'name', 'guid', 'tag'] as const).filter((key) => ref[key] !== undefined);
    if (selectors.length !== 1) return { ref, ok: false, error: 'Entity selector object must contain exactly one of: id, name, guid, tag.' };
    kind = selectors[0]; value = ref[kind] as string | number;
  } else return { ref, ok: false, error: 'Entity ref must be a numeric id, selector string, or selector object.' };

  if ((typeof value === 'string' && !value.trim()) || (kind === 'id' && (!Number.isInteger(value) || Number(value) < 0))) {
    return { ref, ok: false, error: `Entity ${kind} selector is empty or invalid.` };
  }

  const matches = entities.filter((entity) => {
    if (kind === 'id') return entity.id === Number(value);
    if (kind === 'name') return entity.name === value;
    if (kind === 'guid') return entity.guid === value;
    return entity.tags?.includes(String(value)) ?? false;
  });
  if (matches.length === 1) return { ref, ok: true, id: matches[0].id, entity: matches[0] };
  if (matches.length === 0) return { ref, ok: false, error: `No entity matches ${kind}:${String(value)}.` };
  return {
    ref, ok: false, candidates: matches,
    error: `${matches.length} entities match ${kind}:${String(value)}; refusing an ambiguous edit. Use guid:<guid> or id:<number>.`,
  };
}

/**
 * Deep-clone a command batch and replace values only in known entity-reference fields.
 * This deliberately does not inspect arbitrary `id` fields (timeline ids, asset ids,
 * joint ids, etc.) and therefore cannot corrupt unrelated command data.
 */
export function resolveCommandRefs(input: unknown, entities: EntityRefRecord[]): CommandRefResolution {
  const source = Array.isArray(input) ? input : input === undefined ? [] : [input];
  const resolved: CommandRefResolution['resolved'] = [];
  const errors: CommandRefResolution['errors'] = [];

  const visit = (value: unknown, path: string, key?: string, commandType?: string): unknown => {
    if (key && isRefArrayField(key)) {
      if (!Array.isArray(value)) return value;
      return value.map((entry, index) => resolveAt(entry, `${path}[${index}]`));
    }
    if (key && (isRefField(key) || (key === 'primary' && commandType === 'selection_set'))) {
      if (value === null && (key === 'parentId' || key === 'targetEntityId' || key === 'attackerId')) return value;
      return resolveAt(value, path);
    }
    if (Array.isArray(value)) return value.map((entry, index) => visit(entry, `${path}[${index}]`, undefined, commandType));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        out[childKey] = visit(child, `${path}.${childKey}`, childKey, commandType);
      }
      return out;
    }
    return value;
  };

  const resolveAt = (ref: unknown, path: string): unknown => {
    if (ref && typeof ref === 'object' && !Array.isArray(ref) && typeof (ref as Record<string, unknown>).$ref === 'string') {
      // Dynamic intra-batch output binding reference — resolved during batch dataflow execution
      return ref;
    }
    const result = resolveEntityRef(ref, entities);
    if (result.ok) {
      resolved.push({ path, ref, id: result.id! });
      return result.id;
    }
    errors.push({ path, ref, message: result.error!, candidates: result.candidates });
    return ref;
  };

  return {
    commands: source.map((command, index) => {
      const commandType = command && typeof command === 'object' && typeof (command as Record<string, unknown>).type === 'string'
        ? String((command as Record<string, unknown>).type) : undefined;
      return visit(command, `commands[${index}]`, undefined, commandType);
    }),
    resolved,
    errors,
  };
}

function isRefField(key: string): boolean {
  return /entityId$/i.test(key) || key === 'parentId' || key === 'rootEntity' || key === 'entityA' || key === 'entityB' ||
    key === 'attackerId' || key === 'targetId';
}

function isRefArrayField(key: string): boolean { return key === 'entityIds'; }

function isSelector(value: unknown): value is { id?: number; name?: string; guid?: string; tag?: string } {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
