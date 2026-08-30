import { describe, it, expect } from 'vitest';
import { SpawnerSystem } from '../src/spawning';
import type { SpawnerHost } from '../src/spawning';
import { GameplayDirector } from '../src/gameplay';
import type { GameplayHost } from '../src/gameplay';
import type { AICommand } from '../src/ai/AIBridge';
import type { EntityBlueprint } from '../src/ecs/SceneManager';

function makeHost(rng?: () => number) {
  let nextId = 1;
  const spawned: Array<{ blueprint: EntityBlueprint; x: number; y: number; z: number; id: number }> = [];
  const despawned: number[] = [];
  const tagged: Array<{ id: number; tag: string }> = [];
  const executed: AICommand[] = [];
  const events: Array<{ event: string; data: any }> = [];
  const bus = new Map<string, Set<(d: unknown) => void>>();
  const host: SpawnerHost = {
    spawn: (blueprint, x, y, z) => { const id = nextId++; spawned.push({ blueprint, x, y, z, id }); return id; },
    despawn: (id) => { despawned.push(id); },
    tag: (id, tag) => { tagged.push({ id, tag }); },
    execute: (c) => executed.push(c),
    emit: (event, data) => { events.push({ event, data }); bus.get(event)?.forEach((cb) => cb(data)); },
    on: (event, cb) => { let s = bus.get(event); if (!s) { s = new Set(); bus.set(event, s); } s.add(cb); return () => s!.delete(cb); },
    random: rng,
  };
  const kill = (id: number) => host.emit('entity_destroyed', { entityId: id });
  return { host, spawned, despawned, tagged, executed, events, kill };
}

const box: EntityBlueprint = { kind: 'box', params: {} };

describe('SpawnerSystem', () => {
  it('spawns on its interval, respecting count', () => {
    const h = makeHost();
    const sys = new SpawnerSystem(h.host);
    sys.create({ id: 's', blueprint: box, interval: 1, count: 2, total: 100, maxAlive: 100, autoStart: true });
    sys.update(1);   // first batch (sinceTick primed to interval)
    expect(h.spawned).toHaveLength(2);
    sys.update(0.5); // not yet
    expect(h.spawned).toHaveLength(2);
    sys.update(0.6); // next batch
    expect(h.spawned).toHaveLength(4);
  });

  it('maxAlive caps concurrent spawns; deaths free up room', () => {
    const h = makeHost();
    const sys = new SpawnerSystem(h.host);
    sys.create({ id: 's', blueprint: box, interval: 1, maxAlive: 2, total: 100, autoStart: true });
    sys.update(1); sys.update(1); sys.update(1); // 3 ticks but capped at 2 alive
    expect(h.spawned).toHaveLength(2);
    h.kill(h.spawned[0].id);                      // free a slot
    sys.update(1);
    expect(h.spawned).toHaveLength(3);
  });

  it('total caps lifetime and emits spawner_cleared once when emptied', () => {
    const h = makeHost();
    const sys = new SpawnerSystem(h.host);
    sys.create({ id: 'wave', blueprint: box, interval: 1, total: 2, maxAlive: 5, autoStart: true });
    sys.update(1); sys.update(1);                 // spawn 2 (total reached)
    sys.update(1);
    expect(h.spawned).toHaveLength(2);
    expect(h.events.filter((e) => e.event === 'spawner_cleared')).toHaveLength(0); // still alive

    h.kill(h.spawned[0].id);
    h.kill(h.spawned[1].id);
    sys.update(0.1);                              // now emptied → cleared
    sys.update(0.1);                              // must not re-emit
    expect(h.events.filter((e) => e.event === 'spawner_cleared')).toHaveLength(1);
    expect((sys.status('wave') as any).exhausted).toBe(true);
  });

  it('applies tags and runs onSpawn with $entity substituted', () => {
    const h = makeHost();
    const sys = new SpawnerSystem(h.host);
    sys.create({
      id: 's', blueprint: box, interval: 1, total: 1, autoStart: true, tags: ['enemy'],
      onSpawn: [{ type: 'combat_add_health', entityId: '$entity', hp: 50 } as unknown as AICommand],
    });
    sys.update(1);
    const id = h.spawned[0].id;
    expect(h.tagged).toContainEqual({ id, tag: 'enemy' });
    const hc = h.executed.find((c) => (c as any).type === 'combat_add_health') as any;
    expect(hc.entityId).toBe(id);   // substituted from "$entity"
    expect(hc.hp).toBe(50);
  });

  it('start/stop pause spawning; clearSpawned despawns the living', () => {
    const h = makeHost();
    const sys = new SpawnerSystem(h.host);
    sys.create({ id: 's', blueprint: box, interval: 1, total: 100, autoStart: false });
    sys.update(1);
    expect(h.spawned).toHaveLength(0); // not started
    sys.start('s');
    sys.update(1);
    sys.update(1);
    expect(h.spawned.length).toBeGreaterThanOrEqual(2);
    sys.stop('s');
    const n = h.spawned.length;
    sys.update(1);
    expect(h.spawned).toHaveLength(n); // paused
    sys.clearSpawned('s');
    expect(h.despawned.length).toBe(n); // all living despawned
  });

  it('samples points within a box area using the injected RNG', () => {
    const h = makeHost(() => 1); // rng=1 → corner offset +size/2
    const sys = new SpawnerSystem(h.host);
    sys.create({ id: 's', blueprint: box, interval: 1, total: 1, autoStart: true,
      area: { shape: 'box', center: [10, 0, 10], size: [4, 0, 4] } });
    sys.update(1);
    const s = h.spawned[0];
    expect(s.x).toBeCloseTo(12); // 10 + (1-0.5)*4
    expect(s.z).toBeCloseTo(12);
  });

  it('restarts a finished spawner on start()', () => {
    const h = makeHost();
    const sys = new SpawnerSystem(h.host);
    sys.create({ id: 's', blueprint: box, interval: 1, total: 1, autoStart: true });
    sys.update(1);
    h.kill(h.spawned[0].id);
    sys.update(0.1); // cleared
    expect((sys.status('s') as any).spawnedTotal).toBe(1);
    sys.start('s');  // restart → counters reset
    sys.update(1);
    expect(h.spawned).toHaveLength(2);
  });
});

// ─── Gameplay ↔ Spawner (waves) ───────────────────────────────────────────────────
describe('Gameplay ↔ Spawner', () => {
  it('a spawner_cleared event drives a gameplay rule (wave chaining)', () => {
    const bus = new Map<string, Set<(d: unknown) => void>>();
    const on = (e: string, cb: (d: unknown) => void) => {
      let s = bus.get(e); if (!s) { s = new Set(); bus.set(e, s); } s.add(cb);
      return () => s!.delete(cb);
    };
    const emit = (e: string, d?: unknown) => bus.get(e)?.forEach((cb) => cb(d));
    let nextId = 100;
    const spawnedIds: number[] = [];
    const spawner = new SpawnerSystem({
      spawn: () => { const id = nextId++; spawnedIds.push(id); return id; },
      despawn: () => {}, tag: () => {}, execute: () => {}, emit, on,
    });
    const gpHost: GameplayHost = { execute: () => {}, on, emit, listEntities: () => [], getPlayerPosition: () => null };
    const director = new GameplayDirector(gpHost);
    director.load({
      variables: { wave1Cleared: false },
      rules: [{ on: { event: 'spawner_cleared', spawner: 'wave1' }, do: [{ setVar: 'wave1Cleared', value: true }] }],
    });

    spawner.create({ id: 'wave1', blueprint: box, interval: 1, total: 1, autoStart: true });
    spawner.update(1);                 // spawn one
    emit('entity_destroyed', { entityId: spawnedIds[0] });
    spawner.update(0.1);               // emptied → spawner_cleared → director rule
    expect(director.getVar('wave1Cleared')).toBe(true);
  });
});
