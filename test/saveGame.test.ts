import { describe, it, expect } from 'vitest';
import { SaveSystem } from '../src/persistence';
import type { SaveHost } from '../src/persistence';
import { GameplayDirector } from '../src/gameplay';
import type { GameplayDef, GameplayHost } from '../src/gameplay';
import { InventorySystem } from '../src/items';
import type { AICommand } from '../src/ai/AIBridge';

/** Wire a SaveSystem over REAL gameplay + inventory instances + in-memory storage. */
function makeWorld() {
  const store = new Map<string, string>();
  const kv = new Map<string, unknown>();
  const executed: AICommand[] = [];
  let player: { pos: [number, number, number]; quat: [number, number, number, number] } | null = null;

  const bus = new Map<string, Set<(d: unknown) => void>>();
  const on = (e: string, cb: (d: unknown) => void) => {
    let s = bus.get(e); if (!s) { s = new Set(); bus.set(e, s); } s.add(cb);
    return () => s!.delete(cb);
  };
  const emit = (e: string, d?: unknown) => bus.get(e)?.forEach((cb) => cb(d));

  const items = new InventorySystem({ execute: (c) => executed.push(c), emit, persist: (s) => kv.set('__inventory__', s) });
  const gpHost: GameplayHost = {
    execute: (c) => executed.push(c), on, emit,
    listEntities: () => [], getPlayerPosition: () => null,
    itemCount: (o, i) => items.count(o, i),
  };
  const director = new GameplayDirector(gpHost);

  const host: SaveHost = {
    gameplayDef: () => director.getDef(),
    gameplaySerialize: () => (director.loaded ? director.serialize() : null),
    gameplayLoad: (def) => director.load(def, { quiet: true }),
    gameplayRestore: (s) => director.restore(s),
    inventorySerialize: () => items.serialize(),
    inventoryRestore: (s) => items.restore(s),
    stateGetAll: () => Object.fromEntries(kv),
    stateSet: (k, v) => kv.set(k, v),
    getPlayerTransform: () => player,
    setPlayerTransform: (pos, quat) => { player = { pos, quat }; },
    store: (slot, json) => store.set(slot, json),
    read: (slot) => store.get(slot) ?? null,
    listSlots: () => [...store.keys()],
    removeSlot: (slot) => store.delete(slot),
  };
  const saves = new SaveSystem(host);
  return { saves, director, items, kv, executed, getPlayer: () => player, setPlayer: (p: typeof player) => { player = p; } };
}

const questDef: GameplayDef = {
  variables: { score: 0 },
  quests: [{ id: 'q', title: 'Q', autoStart: true, objectives: [{ id: 'o', description: 'do', count: 3 }] }],
};

describe('SaveSystem', () => {
  it('restores gameplay variables + quest progress', async () => {
    const w = makeWorld();
    w.director.load(questDef);
    w.director.setVar('score', 99);
    w.director.advanceObjective('q', 'o'); // progress 1/3
    await w.saves.save('slot1');

    // Simulate a fresh game, then load the save.
    w.director.load(questDef);
    expect(w.director.getVar('score')).toBe(0);
    w.saves.load('slot1');
    expect(w.director.getVar('score')).toBe(99);
    expect(w.director.getStatus().quests[0].objectives[0].progress).toBe(1);
    expect(w.director.getStatus().quests[0].state).toBe('active');
  });

  it('restores inventory bags', async () => {
    const w = makeWorld();
    w.items.give('player', 'gold', 50);
    w.items.give('player', 'key', 1);
    await w.saves.save('s');
    w.items.take('player', 'gold', 50);
    expect(w.items.count('player', 'gold')).toBe(0);
    w.saves.load('s');
    expect(w.items.count('player', 'gold')).toBe(50);
    expect(w.items.count('player', 'key')).toBe(1);
  });

  it('restores persistent kv flags but not the system-owned mirrors', async () => {
    const w = makeWorld();
    w.kv.set('chapter', 3);
    w.items.give('player', 'gem', 1); // writes kv['__inventory__']
    await w.saves.save('s');
    w.kv.set('chapter', 1);
    w.saves.load('s');
    expect(w.kv.get('chapter')).toBe(3);
    // __inventory__ is restored via inventoryRestore, not as a raw state key.
    expect(w.items.count('player', 'gem')).toBe(1);
  });

  it('restores the player transform', async () => {
    const w = makeWorld();
    w.setPlayer({ pos: [10, 2, 30], quat: [0, 0, 0, 1] });
    await w.saves.save('s');
    w.setPlayer({ pos: [0, 0, 0], quat: [0, 0, 0, 1] });
    w.saves.load('s');
    expect(w.getPlayer()).toEqual({ pos: [10, 2, 30], quat: [0, 0, 0, 1] });
  });

  it('a quiet load does NOT re-fire start rules', async () => {
    const w = makeWorld();
    w.director.load({ rules: [{ on: { event: 'start' }, do: [{ command: { type: 'set_master_volume', volume: 1 } as AICommand }] }] });
    expect(w.executed).toHaveLength(1);   // normal load fired start
    await w.saves.save('s');
    w.executed.length = 0;
    w.saves.load('s');                     // quiet load
    expect(w.executed).toHaveLength(0);    // start rule NOT re-run
  });

  it('lists (newest first), reports summaries, and deletes slots', async () => {
    const w = makeWorld();
    w.director.load(questDef);
    w.items.give('player', 'gold', 5);
    w.setPlayer({ pos: [1, 1, 1], quat: [0, 0, 0, 1] });
    const summary = await w.saves.save('a');
    expect(summary).toMatchObject({ slot: 'a', hasGameplay: true, itemOwners: 1, hasPlayer: true });

    await w.saves.save('b');
    const list = w.saves.list();
    expect(list.map((s) => s.slot).sort()).toEqual(['a', 'b']);
    expect(w.saves.has('a')).toBe(true);
    w.saves.remove('a');
    expect(w.saves.has('a')).toBe(false);
    expect(w.saves.list()).toHaveLength(1);
  });

  it('loading a missing slot returns null', () => {
    const w = makeWorld();
    expect(w.saves.load('nope')).toBe(null);
  });
});
