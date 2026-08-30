/**
 * CommandRegistry — Single Authoritative Source of Truth for MIX Engine Commands.
 *
 * Provides authoritative definitions, structural validation, alias resolution,
 * HELM manifest generation, MCP tool schemas, and TypeScript/Markdown generation.
 */

import { ALL_COMMAND_DEFINITIONS } from './registry';
import { SchemaValidator } from './SchemaValidator';
import type {
  CommandDefinition,
  CommandCategory,
  ValidationResult,
  HelmManifest,
  HelmManifestOp,
  HelmManifestCommandDoc,
} from './types';

export const HELM_PROTOCOL_VERSION = '3.1.0';

export class CommandRegistry {
  private static instance?: CommandRegistry;

  private readonly definitions = new Map<string, CommandDefinition>();
  private readonly aliasMap = new Map<string, string>();
  private readonly categoryMap = new Map<CommandCategory, CommandDefinition[]>();

  constructor(definitions: readonly CommandDefinition[] = ALL_COMMAND_DEFINITIONS) {
    for (const def of definitions) {
      this.register(def);
    }
  }

  static get default(): CommandRegistry {
    if (!this.instance) {
      this.instance = new CommandRegistry();
    }
    return this.instance;
  }

  /** Static helper to get definition from default registry */
  static get(type: string): CommandDefinition | undefined {
    return this.default.get(type);
  }

  /** Static helper to resolve alias from default registry */
  static resolveAlias(type: string): string {
    return this.default.resolveAlias(type);
  }

  /** Static helper to validate params from default registry */
  static validate(type: string, params: Record<string, unknown>): ValidationResult {
    const def = this.default.get(type);
    if (!def) {
      return {
        valid: false,
        errors: [{ path: '', message: `Unknown command type '${type}'`, code: 'invalid_custom' }],
      };
    }
    return SchemaValidator.validate(def.parameters, params);
  }

  /** Register a command definition */
  register(def: CommandDefinition): void {
    this.definitions.set(def.type, def);

    if (def.deprecatedAliases) {
      for (const alias of def.deprecatedAliases) {
        this.aliasMap.set(alias, def.type);
      }
    }

    if (!this.categoryMap.has(def.category)) {
      this.categoryMap.set(def.category, []);
    }
    this.categoryMap.get(def.category)!.push(def);
  }

  /** Retrieve definition by canonical name or alias */
  get(type: string): CommandDefinition | undefined {
    const canonical = this.resolveAlias(type);
    return this.definitions.get(canonical);
  }

  /** Check if a command or alias is registered */
  has(type: string): boolean {
    return this.definitions.has(this.resolveAlias(type));
  }

  /** Resolves an alias to canonical command name */
  resolveAlias(type: string): string {
    return this.aliasMap.get(type) ?? type;
  }

  /** Get all registered command definitions */
  getAll(): readonly CommandDefinition[] {
    return Array.from(this.definitions.values());
  }

  /** Get all categories */
  getCategories(): readonly CommandCategory[] {
    return Array.from(this.categoryMap.keys());
  }

  /** Get commands in a category */
  getByCategory(category: CommandCategory): readonly CommandDefinition[] {
    return this.categoryMap.get(category) ?? [];
  }

  /** Validate a single command object against its registered schema */
  validateCommand(cmd: unknown, path = 'command'): ValidationResult {
    if (typeof cmd !== 'object' || cmd === null || Array.isArray(cmd)) {
      return {
        valid: false,
        errors: [{
          path,
          message: `Command must be a non-null JSON object.`,
          code: 'type_mismatch',
          actual: typeof cmd,
        }],
      };
    }

    const obj = cmd as Record<string, unknown>;
    const rawType = obj.type;
    if (typeof rawType !== 'string' || !rawType.trim()) {
      return {
        valid: false,
        errors: [{
          path: `${path}.type`,
          message: `Command type must be a non-empty string.`,
          code: 'missing_required',
        }],
      };
    }

    const canonicalType = this.resolveAlias(rawType.trim());
    const def = this.definitions.get(canonicalType);
    if (!def) {
      return {
        valid: false,
        errors: [{
          path: `${path}.type`,
          message: `Unknown AICommand '${rawType}'.`,
          code: 'unknown_property',
          actual: rawType,
        }],
      };
    }

    return SchemaValidator.validate(obj, def.parameters, path);
  }

  /** Validate a batch of commands */
  validateBatch(commands: unknown[]): ValidationResult {
    const allErrors: ValidationResult['errors'] = [];
    if (!Array.isArray(commands) || commands.length === 0) {
      return {
        valid: false,
        errors: [{
          path: 'commands',
          message: 'At least one command is required.',
          code: 'missing_required',
        }],
      };
    }

    commands.forEach((cmd, idx) => {
      const res = this.validateCommand(cmd, `commands[${idx}]`);
      if (!res.valid) {
        allErrors.push(...res.errors);
      }
    });

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
    };
  }

  /** Generate the standard HELM capability manifest */
  getHelmManifest(customOps?: HelmManifestOp[]): HelmManifest {
    const defaultOps: HelmManifestOp[] = [
      {
        op: 'do',
        summary: 'Execute a batch of AICommands; returns created/removed entities, warnings and errors.',
        args: [
          { name: 'commands', type: 'AICommand | AICommand[]', required: true, description: 'One command or an array (applied in order).' },
          { name: 'settleMs', type: 'number', description: 'How long to wait for async spawns/asset loads after the queue drains (default 200).' },
        ],
      },
      {
        op: 'plan',
        summary: 'Preflight an AICommand batch without changing the engine: catches unknown commands, missing required parameters, unsafe payload keys, and atomic-rollback incompatibilities.',
        args: [
          { name: 'commands', type: 'AICommand | AICommand[]', required: true, description: 'One command or an ordered array to validate.' },
          { name: 'atomic', type: 'boolean', description: 'When true, also require every command to be safely reversible by a scene snapshot.' },
        ],
      },
      {
        op: 'apply',
        summary: 'GUARDED APPLY: serialize competing IDE edits, preflight, execute, return a semantic diff, verify postconditions, auto-rollback failed scene edits, and deduplicate retries.',
        args: [
          { name: 'commands', type: 'AICommand | AICommand[]', required: true, description: 'One command or an ordered array. Entity fields accept numeric ids or stable @name, guid:<guid>, tag:<tag>, and selector-object refs resolved before mutation.' },
          { name: 'expects', type: 'HelmExpectation[]', description: 'Optional postconditions; a failure rolls back an atomic batch.' },
          { name: 'atomic', type: 'boolean', description: 'Require snapshot-safe commands and roll back failures (default true).' },
          { name: 'dryRun', type: 'boolean', description: 'Validate and return the plan without executing.' },
          { name: 'requestKey', type: 'string', description: 'Stable retry key (1..128 chars); identical retries return the original result without re-execution.' },
          { name: 'settleMs', type: 'number', description: 'How long to wait after async work settles (default 200).' },
        ],
      },
      {
        op: 'resolve',
        summary: 'Resolve one stable semantic entity reference to its current numeric id and full entity info. Ambiguous names/tags fail with candidates instead of guessing.',
        args: [{ name: 'ref', type: 'number | @name | guid:<guid> | tag:<tag> | id:<number> | {id|name|guid|tag}', required: true, description: 'Stable selector to resolve against the current scene.' }],
      },
      { op: 'describe', summary: 'Token-efficient summary of the whole scene (entities, camera, bounds, selection, mode).', args: [] },
      {
        op: 'query',
        summary: 'Filtered, structured list of entities.',
        args: [{ name: 'filter', type: '{ kind?, tag?, name? }', description: 'Optional filter; omit for everything.' }],
      },
      {
        op: 'get',
        summary: 'Full info on one entity (kind, name, tags, world position + size, body type).',
        args: [{ name: 'entityId', type: 'number', required: true, description: 'Entity id.' }],
      },
      {
        op: 'raycast',
        summary: 'Which entity is under a screen point — the agent\'s "look at the crosshair".',
        args: [{ name: 'screen', type: '{ x, y }', description: 'Normalized [0,1] screen point; defaults to centre (0.5,0.5).' }],
      },
      {
        op: 'checkpoint',
        summary: 'Save a named in-memory snapshot of the scene.',
        args: [{ name: 'name', type: 'string', required: true, description: 'Snapshot name.' }],
      },
      {
        op: 'restore',
        summary: 'Restore a previously-saved snapshot (entity ids are reissued).',
        args: [{ name: 'name', type: 'string', required: true, description: 'Snapshot name.' }],
      },
      { op: 'checkpoints', summary: 'List the names of saved snapshots.', args: [] },
      {
        op: 'observe',
        summary: 'RENDER-grounded visual check (the agent\'s "look at the screen"): renders the live scene offscreen and reports frame health (black/blown-out) + per-entity on-screen PIXEL coverage + on-screen position + plain-English anomalies. Catches what state queries cannot — an entity can exist yet draw zero pixels (invisible, occluded, mis-scaled). Works headless.',
        args: [{ name: 'filter', type: '{ kind?, tag?, name? }', description: 'Optional; omit to observe all physics entities.' }],
      },
      {
        op: 'assert',
        summary: 'Evaluate expectations so the agent can validate its own edits — including RENDER-grounded visual ones.',
        args: [{ name: 'expects', type: 'HelmExpectation[]', required: true, description: 'entity_exists | entity_count | entity_near | no_errors | entity_visible (name?/tag?/entityKind?/minCoveragePct?) | frame_renders.' }],
      },
      { op: 'manifest', summary: 'Return this capability manifest.', args: [] },
      { op: 'status', summary: 'Engine liveness + a one-line scene summary.', args: [] },
      {
        op: 'find_path',
        summary: 'A* path between two world points (NavigationSystem). Returns waypoints + length.',
        args: [
          { name: 'from', type: '[number, number, number]', required: true, description: 'World-space start.' },
          { name: 'to', type: '[number, number, number]', required: true, description: 'World-space goal.' },
          { name: 'smooth', type: 'boolean', description: 'String-pull smoothing (default true).' },
          { name: 'goalTolerance', type: 'number', description: 'Goal snap radius in metres.' },
        ],
      },
      { op: 'nav_status', summary: 'Navmesh build state + every NavAgent (mode, speed, path, target).', args: [] },
    ];

    const commandDocs: HelmManifestCommandDoc[] = this.getAll()
      .slice()
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((def) => {
        const params: string[] = [];
        if (def.parameters.properties) {
          for (const [propName, propSchema] of Object.entries(def.parameters.properties)) {
            params.push(propSchema.required ? propName : `${propName}?`);
          }
        }
        return {
          type: def.type,
          summary: def.summary,
          params,
        };
      });

    return {
      name: 'HELM',
      version: HELM_PROTOCOL_VERSION,
      description:
        "The MIX Engine's control plane for IDE coding agents. Send an op over /api/helm/rpc " +
        'and get a structured result back (created/removed entities, errors, query data). All ' +
        'coordinates are WORLD space.',
      ops: customOps ?? defaultOps,
      commands: commandDocs,
    };
  }

  /** Generate Markdown documentation for all commands */
  generateMarkdownDocs(): string {
    const lines: string[] = [
      '# MIX Engine — AI Command Reference',
      '',
      'All coordinates are WORLD space (metres). Commands sent via `/api/cli-command` WS, `window.engine.runScript([...])`, or `node scripts/mix-cli.js`.',
      '',
    ];

    const categories = this.getCategories().slice().sort();
    for (const cat of categories) {
      lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
      const cmds = this.getByCategory(cat).slice().sort((a, b) => a.type.localeCompare(b.type));
      for (const cmd of cmds) {
        const paramsList = Object.entries(cmd.parameters.properties || {})
          .map(([k, v]) => (v.required ? k : `${k}?`))
          .join(', ');
        lines.push(`- \`${cmd.type} {${paramsList}}\` — ${cmd.summary}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Generate TypeScript declaration file content (.claude/mix-engine.d.ts) */
  generateTypeScriptDeclarations(): string {
    const lines: string[] = [
      '// MIX Engine — IDE type declarations',
      '// Generated by CommandRegistry — do not edit manually.',
      '',
      'declare namespace MixEngine {',
      '',
      '  interface ScriptAPI {',
      '    entityId: number;',
      "    readonly position: import('three').Vector3 | undefined;",
      "    readonly rotation: import('three').Quaternion | undefined;",
      '    events: ScriptEvent[];',
      '    state: PersistentStateAPI;',
      '    debug: DebugDrawAPI;',
      '  }',
      '',
      '  interface ScriptEvent {',
      "    type: 'sensor';",
      '    otherEntityId: number;',
      '    intersecting: boolean;',
      '  }',
      '',
      '  interface PersistentStateAPI {',
      '    getItem: <T = unknown>(key: string) => T | undefined;',
      '    setItem: (key: string, value: unknown) => void;',
      '    removeItem: (key: string) => void;',
      '    clear: () => void;',
      '    getAll: () => Record<string, unknown>;',
      '  }',
      '',
      '  interface DebugDrawAPI {',
      "    drawLine(from: import('three').Vector3, to: import('three').Vector3, color?: number | string, lifetime?: number): void;",
      "    drawRay(origin: import('three').Vector3, direction: import('three').Vector3, length: number, color?: number | string, lifetime?: number): void;",
      "    drawBox(center: import('three').Vector3, size: import('three').Vector3, color?: number | string, lifetime?: number): void;",
      "    drawSphere(center: import('three').Vector3, radius: number, color?: number | string, lifetime?: number): void;",
      "    drawText(position: import('three').Vector3, text: string, color?: number | string, size?: number, lifetime?: number): void;",
      '    clearAll(): void;',
      '  }',
      '',
      "  type AudioBus = 'music' | 'sfx' | 'ambient' | 'voice';",
      "  type InputMode = 'editor' | 'character' | 'vehicle' | 'cinematic';",
      "  type NavAgentMode = 'idle' | 'wander' | 'seek' | 'flee' | 'pursue' | 'evade' | 'pathfollow' | 'patrol' | 'behavior_tree' | 'queue';",
      '  type VfxPresetName = string;',
      '  type AssetType = string;',
      '  type DamageType = string;',
      '  type ScenarioProfile = string;',
      '',
      '  interface EntityBlueprint { kind: string; params: Record<string, unknown> }',
      '  interface SteeringParams { maxSpeed?: number; maxForce?: number; arriveRadius?: number; wanderJitter?: number; wanderRadius?: number; wanderDistance?: number; separationRadius?: number; separationWeight?: number; alignmentWeight?: number; cohesionWeight?: number; obstacleAvoidanceRadius?: number; obstacleAvoidanceWeight?: number; }',
      '  interface WheelSpecInput { attach: [number, number, number]; suspensionRestLength?: number; springStiffness?: number; springDamping?: number; radius: number; maxTravel?: number; lateralFriction?: number; longitudinalFriction?: number; driven?: boolean; steered?: boolean; }',
      '',
      '  type AICommand =',
    ];

    const sortedDefs = this.getAll().slice().sort((a, b) => a.type.localeCompare(b.type));
    for (const def of sortedDefs) {
      const props: string[] = [`type: '${def.type}'`];
      if (def.parameters.properties) {
        for (const [k, v] of Object.entries(def.parameters.properties)) {
          let typeStr = 'any';
          if (v.type === 'string') typeStr = 'string';
          else if (v.type === 'number' || v.type === 'integer') typeStr = 'number';
          else if (v.type === 'boolean') typeStr = 'boolean';
          else if (v.type === 'array') typeStr = 'any[]';
          else if (v.type === 'object') typeStr = 'Record<string, any>';
          else if (Array.isArray(v.type)) typeStr = v.type.map((t) => (t === 'object' ? 'Record<string, any>' : t)).join(' | ');
          props.push(`${k}${v.required ? '' : '?'}: ${typeStr}`);
        }
      }
      lines.push(`    | { ${props.join('; ')} }`);
    }

    lines.push('}', '');
    return lines.join('\n');
  }

  /** Generate JSON Schema for HELM RPC operations */
  generateHelmJsonSchema(): Record<string, unknown> {
    const manifest = this.getHelmManifest();
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'HELM RPC Request',
      description: 'Schema for HELM control-plane requests sent to /api/helm/rpc',
      type: 'object',
      required: ['op'],
      properties: {
        id: { type: 'string', description: 'Optional request id echoed back' },
        op: {
          type: 'string',
          enum: manifest.ops.map((o) => o.op),
          description: 'Operation to perform',
        },
        commands: {
          type: 'array',
          items: { type: 'object' },
          description: 'AICommands for op:do, plan, or apply',
        },
        settleMs: { type: 'number', default: 200, description: 'Settle time for op:do / apply' },
        filter: {
          type: 'object',
          properties: {
            kind: { type: 'string' },
            tag: { type: 'string' },
            name: { type: 'string' },
          },
          description: 'Filter for op:query or op:observe',
        },
        entityId: { type: 'number', description: 'Entity id for op:get' },
        screen: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          description: 'NDC for op:raycast',
        },
        name: { type: 'string', description: 'Checkpoint name for op:checkpoint / op:restore' },
        expects: {
          type: 'array',
          items: { type: 'object' },
          description: 'Expectations for op:assert or op:apply',
        },
        from: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'World [x,y,z] for op:find_path',
        },
        to: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        smooth: { type: 'boolean', default: true },
        goalTolerance: { type: 'number' },
      },
    };
  }

  /** Generate MCP tool definitions schema */
  generateMcpSchema(): Record<string, unknown> {
    const manifest = this.getHelmManifest();
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'MIX Engine MCP Tool Definitions',
      description: 'Exposed Model Context Protocol tools for AI coding agents',
      tools: manifest.ops.map((op) => ({
        name: `mix_${op.op}`,
        description: op.summary,
        inputSchema: {
          type: 'object',
          properties: Object.fromEntries(
            op.args.map((arg) => [
              arg.name,
              {
                type: arg.type.includes('number') ? 'number' : arg.type.includes('boolean') ? 'boolean' : 'string',
                description: arg.description,
              },
            ])
          ),
          required: op.args.filter((a) => a.required).map((a) => a.name),
        },
      })),
    };
  }
}
