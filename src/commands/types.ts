/**
 * CommandRegistry types — Authoritative definition of MIX Engine commands,
 * JSON Schema parameters, permission capabilities, and side effects.
 */

export type CommandCategory =
  | 'entity'
  | 'scene'
  | 'physics'
  | 'rendering'
  | 'environment'
  | 'audio'
  | 'cinematic'
  | 'camera'
  | 'scripting'
  | 'navigation'
  | 'ai'
  | 'terrain'
  | 'water'
  | 'foliage'
  | 'gameplay'
  | 'inventory'
  | 'interaction'
  | 'spawner'
  | 'save'
  | 'state'
  | 'debug'
  | 'vfx'
  | 'combat'
  | 'vehicles'
  | 'sensorium'
  | 'assets'
  | 'animation'
  | 'motion'
  | 'inspector'
  | 'tween'
  | 'viewport'
  | 'export'
  | 'input'
  | 'joints'
  | 'ragdoll'
  | 'networking'
  | 'profiler'
  | 'selection'
  | 'history'
  | 'cloth'
  | 'bakes'
  | 'realism'
  | 'misc';

export type SideEffectType = 'read' | 'scene' | 'runtime' | 'external';

export type AtomicSupport = 'full' | 'partial' | 'none';

export type PermissionCapability =
  | 'scene.read'
  | 'scene.write'
  | 'script.attach'
  | 'asset.import'
  | 'network.start'
  | 'package.build'
  | 'external.process'
  | 'destructive.clear'
  | 'runtime.mutate'
  | 'gameplay.mutate'
  | 'debug.draw'
  | 'system.read'
  | 'audio.control'
  | 'viewport.control';

export type SchemaPrimitiveType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'
  | 'object'
  | 'array'
  | 'tuple'
  | 'any';

export interface CommandParamSchema {
  type?: SchemaPrimitiveType | readonly SchemaPrimitiveType[];
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: readonly (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  items?: CommandParamSchema | readonly CommandParamSchema[];
  properties?: Record<string, CommandParamSchema>;
  requiredProperties?: readonly string[];
  additionalProperties?: boolean | CommandParamSchema;
  oneOf?: readonly CommandParamSchema[];
  anyOf?: readonly CommandParamSchema[];
  unit?: string;
}

export interface CommandExample {
  description?: string;
  command: Record<string, unknown>;
}

export interface CommandDefinition {
  /** The unique canonical command name (e.g. 'spawn_entity') */
  type: string;
  /** Human-readable single-line summary of what the command does */
  summary: string;
  /** Categorization for documentation and grouping */
  category: CommandCategory;
  /** Parameter schema defining required and optional arguments */
  parameters: CommandParamSchema;
  /** Side-effect classification for planning and concurrency safety */
  sideEffect: SideEffectType;
  /** Degree of atomic rollback support */
  atomicSupport: AtomicSupport;
  /** Stated boundary or rationale when atomicSupport is partial or none */
  atomicBoundary?: string;
  /** Security permission capability required to execute this command */
  capability: PermissionCapability;
  /** Engine version when this command was introduced */
  versionIntroduced: string;
  /** Deprecated aliases pointing to this command (e.g. 'ragdoll_spawn' -> 'ragdoll_create') */
  deprecatedAliases?: readonly string[];
  /** Examples of valid invocation */
  examples?: readonly CommandExample[];
}

export interface ValidationError {
  path: string;
  message: string;
  code:
    | 'type_mismatch'
    | 'missing_required'
    | 'unknown_property'
    | 'out_of_bounds'
    | 'invalid_enum'
    | 'invalid_length'
    | 'union_mismatch'
    | 'invalid_custom';
  expected?: unknown;
  actual?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface HelmManifestOpArg {
  name: string;
  type: string;
  required?: boolean;
  description: string;
  default?: unknown;
}

export interface HelmManifestOp {
  op: string;
  summary: string;
  args: HelmManifestOpArg[];
}

export interface HelmManifestCommandDoc {
  type: string;
  summary: string;
  params: string[];
}

export interface HelmManifest {
  name: string;
  version: string;
  description: string;
  ops: HelmManifestOp[];
  commands: HelmManifestCommandDoc[];
}
