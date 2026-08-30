import type { SpawnerDef, SpawnerHost, SpawnerStatus, SpawnArea } from './types';
import type { AICommand } from '../ai/AIBridge';

interface SpawnerRuntime {
  def: SpawnerDef;
  running: boolean;
  sinceTick: number;
  spawnedTotal: number;
  alive: Set<number>;
  /** Reverse map maintained for O(1) death handling shared across spawners. */
  exhaustedEmitted: boolean;
}

/**
 * SpawnerSystem — declarative, time-based entity spawners with concurrent + lifetime
 * caps. Decoupled from the Engine via {@link SpawnerHost} so it unit-tests standalone.
 *
 * Tracks the entities each spawner created (via the global `entity_destroyed` event) and
 * emits `spawner_cleared` when a finished spawner's last entity dies — the hook gameplay
 * rules use to advance waves / quests.
 */
export class SpawnerSystem {
  private readonly host: SpawnerHost;
  private readonly spawners = new Map<string, SpawnerRuntime>();
  /** entityId → spawner id, so a single entity_destroyed handler can find the owner. */
  private readonly ownerOf = new Map<number, string>();
  private readonly unsub: () => void;

  constructor(host: SpawnerHost) {
    this.host = host;
    this.unsub = host.on('entity_destroyed', (d) => this.onDestroyed(d));
  }

  // ── Registration ────────────────────────────────────────────────────────────

  create(def: SpawnerDef): void {
    // Replacing an existing spawner: keep its live entities tracked under the new def.
    const existing = this.spawners.get(def.id);
    this.spawners.set(def.id, {
      def,
      running: existing?.running ?? (!def.disabled && !!def.autoStart),
      sinceTick: existing?.sinceTick ?? (def.interval ?? 2), // first tick fires promptly
      spawnedTotal: existing?.spawnedTotal ?? 0,
      alive: existing?.alive ?? new Set(),
      exhaustedEmitted: existing?.exhaustedEmitted ?? false,
    });
  }

  start(id: string): void {
    const s = this.spawners.get(id);
    if (!s) return;
    // Restart a finished spawner so it can run again (the common "start next wave" use).
    if (s.spawnedTotal >= (s.def.total ?? Infinity) && s.alive.size === 0) {
      s.spawnedTotal = 0;
      s.exhaustedEmitted = false;
    }
    s.running = true;
    s.sinceTick = s.def.interval ?? 2;
  }

  stop(id: string): void {
    const s = this.spawners.get(id);
    if (s) s.running = false;
  }

  remove(id: string): void {
    const s = this.spawners.get(id);
    if (!s) return;
    for (const e of s.alive) this.ownerOf.delete(e);
    this.spawners.delete(id);
  }

  /** Despawn every entity this spawner created (e.g. clear the arena). */
  clearSpawned(id: string): void {
    const s = this.spawners.get(id);
    if (!s) return;
    for (const e of [...s.alive]) { this.host.despawn(e); this.ownerOf.delete(e); }
    s.alive.clear();
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────

  update(dt: number): void {
    if (!(dt > 0) || this.spawners.size === 0) return;
    for (const s of this.spawners.values()) {
      if (!s.running) continue;
      const total = s.def.total ?? Infinity;
      const maxAlive = s.def.maxAlive ?? Infinity;
      s.sinceTick += dt;
      const interval = Math.max(0.001, s.def.interval ?? 2);
      // Spawn at most one batch per frame even if dt overshoots several intervals.
      if (s.sinceTick >= interval) {
        s.sinceTick = 0;
        const want = s.def.count ?? 1;
        const room = Math.min(want, maxAlive - s.alive.size, total - s.spawnedTotal);
        for (let i = 0; i < room; i++) this.spawnOne(s);
      }
      // Exhausted + emptied → cleared (emit once).
      if (!s.exhaustedEmitted && s.spawnedTotal >= total && s.alive.size === 0) {
        s.exhaustedEmitted = true;
        s.running = false;
        this.host.emit('spawner_cleared', { spawner: s.def.id });
      }
    }
  }

  private spawnOne(s: SpawnerRuntime): void {
    const [x, y, z] = this.samplePoint(s.def.area);
    const id = this.host.spawn(s.def.blueprint, x, y, z);
    if (id === null || id === undefined) return;
    s.spawnedTotal++;
    s.alive.add(id);
    this.ownerOf.set(id, s.def.id);
    for (const tag of s.def.tags ?? []) this.host.tag(id, tag);
    if (s.def.onSpawn) {
      for (const cmd of s.def.onSpawn) this.host.execute(substitute(cmd, id, s.def.id) as AICommand);
    }
    this.host.emit('spawned', { spawner: s.def.id, entityId: id });
  }

  private samplePoint(area?: SpawnArea): [number, number, number] {
    if (!area) return [0, 0, 0];
    const [cx, cy, cz] = area.center;
    const rnd = () => (this.host.random?.() ?? Math.random());
    if (area.shape === 'box') {
      const [sx, sy, sz] = area.size ?? [1, 1, 1];
      return [cx + (rnd() - 0.5) * sx, cy + (rnd() - 0.5) * sy, cz + (rnd() - 0.5) * sz];
    }
    if (area.shape === 'sphere') {
      const r = area.radius ?? 1;
      // Uniform-ish point in a horizontal disk (ground spawns) + small vertical jitter.
      const ang = rnd() * Math.PI * 2;
      const rad = Math.sqrt(rnd()) * r;
      return [cx + Math.cos(ang) * rad, cy, cz + Math.sin(ang) * rad];
    }
    return [cx, cy, cz];
  }

  private onDestroyed(data: unknown): void {
    const id = (data as { entityId?: number })?.entityId;
    if (id === undefined) return;
    const owner = this.ownerOf.get(id);
    if (owner === undefined) return;
    this.ownerOf.delete(id);
    this.spawners.get(owner)?.alive.delete(id);
  }

  // ── Introspection ─────────────────────────────────────────────────────────────

  status(id?: string): SpawnerStatus | SpawnerStatus[] {
    const toStatus = (s: SpawnerRuntime): SpawnerStatus => ({
      id: s.def.id,
      running: s.running,
      alive: s.alive.size,
      spawnedTotal: s.spawnedTotal,
      exhausted: s.spawnedTotal >= (s.def.total ?? Infinity),
    });
    if (id) {
      const s = this.spawners.get(id);
      return s ? toStatus(s) : { id, running: false, alive: 0, spawnedTotal: 0, exhausted: false };
    }
    return [...this.spawners.values()].map(toStatus);
  }

  clear(): void {
    this.spawners.clear();
    this.ownerOf.clear();
  }

  dispose(): void {
    this.unsub();
    this.clear();
  }
}

/** Deep-clone a command, replacing "$entity" → entityId and "$spawner" → spawnerId. */
function substitute(obj: unknown, entityId: number, spawnerId: string): unknown {
  if (obj === '$entity') return entityId;
  if (obj === '$spawner') return spawnerId;
  if (Array.isArray(obj)) return obj.map((x) => substitute(x, entityId, spawnerId));
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) out[k] = substitute((obj as Record<string, unknown>)[k], entityId, spawnerId);
    return out;
  }
  return obj;
}
