import type { AICommand } from '../ai/AIBridge';
import { CommandRegistry } from '../commands/CommandRegistry';

export type PreflightSeverity = 'error' | 'warning';

export interface PreflightIssue {
  severity: PreflightSeverity;
  commandIndex: number;
  commandType?: string;
  path: string;
  message: string;
  suggestion?: string;
}

export interface CommandPlanItem {
  index: number;
  type: string;
  known: boolean;
  effect: 'read' | 'scene' | 'runtime' | 'external';
  atomicSafe: boolean;
}

export interface CommandPreflightResult {
  valid: boolean;
  commandCount: number;
  plan: CommandPlanItem[];
  issues: PreflightIssue[];
  atomicSafe: boolean;
  summary: string;
}

/**
 * Commands whose effects are completely covered by HELM's scene-graph snapshot.
 * Atomic apply intentionally rejects everything else instead of promising a rollback
 * for audio, networking, files, weather, gameplay state, or other side effects that a
 * scene snapshot cannot reverse.
 */
export const ATOMIC_SCENE_COMMANDS = new Set([
  'spawn_entity',
  'destroy_entity',
  'set_transform',
  'set_entity_name',
  'tag_entity',
  'remove_tag',
  'parent_entity',
  'spawn_group',
  'scatter',
  'clear_scene',
  'selection_set',
  'selection_add',
  'selection_toggle',
  'selection_clear',
  'component_add',
  'component_remove',
  'add_script',
]);

/** Pure, deterministic validation used by HELM plan/apply and unit tests. */
export function preflightCommands(input: unknown, atomic = false): CommandPreflightResult {
  const raw = Array.isArray(input) ? input : input === undefined ? [] : [input];
  const issues: PreflightIssue[] = [];
  const plan: CommandPlanItem[] = [];
  const registry = CommandRegistry.default;

  if (raw.length === 0) {
    issues.push({ severity: 'error', commandIndex: -1, path: 'commands', message: 'At least one command is required.' });
  }

  raw.forEach((value, index) => {
    if (!isPlainObject(value)) {
      issues.push({ severity: 'error', commandIndex: index, path: `commands[${index}]`, message: 'Command must be a JSON object.' });
      plan.push({ index, type: '(invalid)', known: false, effect: 'runtime', atomicSafe: false });
      return;
    }

    const rawType = typeof value.type === 'string' ? value.type.trim() : '';
    if (!rawType) {
      issues.push({ severity: 'error', commandIndex: index, path: `commands[${index}].type`, message: 'Command type must be a non-empty string.' });
      plan.push({ index, type: '(missing)', known: false, effect: 'runtime', atomicSafe: false });
      return;
    }

    const canonicalType = registry.resolveAlias(rawType);
    const def = registry.get(canonicalType);
    const known = !!def;
    const atomicSafe = ATOMIC_SCENE_COMMANDS.has(canonicalType) || (def?.atomicSupport === 'full' && def.sideEffect !== 'external');
    plan.push({ index, type: rawType, known, effect: def?.sideEffect ?? classifyEffect(rawType), atomicSafe });

    if (!def) {
      const suggestion = nearestCommand(rawType, registry);
      issues.push({
        severity: 'error',
        commandIndex: index,
        commandType: rawType,
        path: `commands[${index}].type`,
        message: `Unknown AICommand '${rawType}'.`,
        suggestion: suggestion ? `Did you mean '${suggestion}'?` : 'Call manifest to discover supported commands.',
      });
      return;
    }

    // Run structural schema validation
    const validationResult = registry.validateCommand(value, `commands[${index}]`);
    if (!validationResult.valid) {
      for (const err of validationResult.errors) {
        issues.push({
          severity: 'error',
          commandIndex: index,
          commandType: rawType,
          path: err.path,
          message: err.message,
        });
      }
    }

    if (atomic && !atomicSafe) {
      issues.push({
        severity: 'error',
        commandIndex: index,
        commandType: rawType,
        path: `commands[${index}]`,
        message: `'${rawType}' is not scene-snapshot safe and cannot run in an atomic batch.`,
        suggestion: 'Use atomic:false after plan review, or split reversible scene edits into a separate atomic apply.',
      });
    }

    findUnsafeKeys(value, `commands[${index}]`, index, rawType, issues);
  });

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  return {
    valid: errors === 0,
    commandCount: raw.length,
    plan,
    issues,
    atomicSafe: plan.length > 0 && plan.every((item) => item.atomicSafe),
    summary: `preflight: ${raw.length} command(s), ${errors} error(s), ${warnings} warning(s)` +
      (atomic ? `, atomic ${errors === 0 ? 'ready' : 'blocked'}` : ''),
  };
}

export function asCommands(input: unknown): AICommand[] {
  return (Array.isArray(input) ? input : [input]) as AICommand[];
}

function classifyEffect(type: string): CommandPlanItem['effect'] {
  if (/(_get|_list|_status|_query)$/.test(type) || /^(query_|find_path|scene_diff|components_list|joints_list|history_list)/.test(type)) return 'read';
  if (/^(save_|load_|screenshot|package_|export_|network_|audio_|play_sound|stop_sound)/.test(type)) return 'external';
  if (ATOMIC_SCENE_COMMANDS.has(type) || /^(terrain_|prefab_|component_|inspect_|set_material)/.test(type)) return 'scene';
  return 'runtime';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function findUnsafeKeys(value: unknown, path: string, commandIndex: number, commandType: string, issues: PreflightIssue[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => findUnsafeKeys(item, `${path}[${i}]`, commandIndex, commandType, issues));
    return;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.getOwnPropertyNames(obj);
  for (const key of keys) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      issues.push({ severity: 'error', commandIndex, commandType, path: `${path}.${key}`, message: `Unsafe object key '${key}' is not allowed.` });
      continue;
    }
    findUnsafeKeys(obj[key], `${path}.${key}`, commandIndex, commandType, issues);
  }
}

function nearestCommand(type: string, registry: CommandRegistry): string | undefined {
  let best: string | undefined;
  let distance = Infinity;
  for (const candidate of registry.getAll().map((d) => d.type)) {
    const d = levenshtein(type, candidate);
    if (d < distance) { best = candidate; distance = d; }
  }
  return distance <= Math.max(2, Math.floor(type.length * 0.34)) ? best : undefined;
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return row[b.length];
}
