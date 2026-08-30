import type { AICommand } from '../ai/AIBridge';
import type { EntityBlueprint } from '../ecs/SceneManager';

/**
 * MIX Engine — Spawner / Wave schema.
 *
 * Declarative entity spawners: emit a blueprint over time within an area, bounded by a
 * concurrent cap (`maxAlive`) and a lifetime cap (`total`). Per-spawn `onSpawn` commands
 * configure each new entity (give it health, a nav agent, a script) — the spawned entity
 * id is substituted into any `"$entity"` placeholder. The system tracks living spawns and
 * emits `spawner_cleared` once a finished spawner's entities are all gone — so WAVES are
 * just spawners chained by gameplay rules (`on spawner_cleared id:wave1 → spawner_start
 * wave2`), no separate wave engine needed.
 */

export interface SpawnArea {
  shape?: 'point' | 'sphere' | 'box';
  /** WORLD-space centre. */
  center: [number, number, number];
  /** Sphere radius (shape 'sphere'). */
  radius?: number;
  /** Box full size (shape 'box'). */
  size?: [number, number, number];
}

export interface SpawnerDef {
  id: string;
  /** What to spawn — an ECS blueprint, e.g. { kind:'glbInstance', params:{ assetId:'Granny' } }
   *  or { kind:'box', params:{ size:1 } }. GLB assets must be preloaded first. */
  blueprint: EntityBlueprint;
  /** Where to spawn (defaults to a point at the engine origin if omitted). */
  area?: SpawnArea;
  /** How many entities per spawn tick (default 1). */
  count?: number;
  /** Seconds between spawn ticks (default 2). */
  interval?: number;
  /** Concurrent cap — never exceed this many alive from this spawner (default Infinity). */
  maxAlive?: number;
  /** Lifetime cap — stop after spawning this many total (default Infinity). */
  total?: number;
  /** Begin spawning on load. */
  autoStart?: boolean;
  /** Tags applied to every spawned entity (so gameplay/combat/nav can target them). */
  tags?: string[];
  /** Commands run per spawn; any `"$entity"` value is replaced with the new entity id
   *  (and `"$spawner"` with this spawner's id). */
  onSpawn?: AICommand[];
  /** Start disabled. */
  disabled?: boolean;
}

export interface SpawnerStatus {
  id: string;
  running: boolean;
  alive: number;
  spawnedTotal: number;
  exhausted: boolean;
}

export interface SpawnerHost {
  /** Spawn a blueprint at a WORLD position; returns the new entity id (or null on failure). */
  spawn(blueprint: EntityBlueprint, x: number, y: number, z: number): number | null;
  /** Destroy an entity. */
  despawn(entityId: number): void;
  /** Tag an entity. */
  tag(entityId: number, tag: string): void;
  /** Run an engine command (per-spawn `onSpawn` effects). */
  execute(cmd: AICommand): void;
  /** Raise a bus event (`spawned`, `spawner_cleared`). */
  emit(event: string, data?: unknown): void;
  /** Subscribe to the bus (for `entity_destroyed` → alive tracking). */
  on(event: string, cb: (data: unknown) => void): () => void;
  /** Injectable RNG for deterministic area sampling in tests (default Math.random). */
  random?(): number;
}
