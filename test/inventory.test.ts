import { describe, it, expect } from 'vitest';
import { Inventory, InventorySystem } from '../src/items';
import type { InventoryHost } from '../src/items';
import { GameplayDirector } from '../src/gameplay';
import type { GameplayHost } from '../src/gameplay';
import type { AICommand } from '../src/ai/AIBridge';

// ─── Pure container ──────────────────────────────────────────────────────────────
describe('Inventory (pure container)', () => {
  it('stacks up to maxStack then opens new stacks', () => {
    const inv = new Inventory('player');
    const def = { id: 'arrow', maxStack: 10 };
    expect(inv.add('arrow', 25, def)).toBe(25);
    expect(inv.count('arrow')).toBe(25);
    expect(inv.list()).toEqual([{ item: 'arrow', count: 25 }]); // merged view
  });

  it('respects slot capacity and reports a partial add', () => {
    const inv = new Inventory('player', { slots: 2 });
    const def = { id: 'gem', maxStack: 5 };
    expect(inv.add('gem', 5, def)).toBe(5);                // slot 1 fills to maxStack
    expect(inv.add('gem', 7, def)).toBe(5);                // slot 2 takes 5; remaining 2 has no slot → 5 added
    expect(inv.count('gem')).toBe(10);
    expect(inv.add('ruby', 1, { id: 'ruby' })).toBe(0);    // both slots used → nothing added
  });

  it('non-stackable items take one slot each', () => {
    const inv = new Inventory('player', { slots: 2 });
    const def = { id: 'sword', stackable: false };
    expect(inv.add('sword', 3, def)).toBe(2); // only 2 slots
    expect(inv.count('sword')).toBe(2);
  });

  it('removes across stacks and reports the amount removed', () => {
    const inv = new Inventory('player');
    inv.add('coin', 100, { id: 'coin', maxStack: 30 });
    expect(inv.remove('coin', 45)).toBe(45);
    expect(inv.count('coin')).toBe(55);
    expect(inv.remove('coin', 999)).toBe(55); // only 55 left
    expect(inv.isEmpty).toBe(true);
  });

  it('snapshot/restore round-trips', () => {
    const inv = new Inventory('chest', { slots: 8 });
    inv.add('key', 2, { id: 'key' });
    inv.add('potion', 3, { id: 'potion' });
    const snap = inv.snapshot();
    const inv2 = new Inventory('chest');
    inv2.restore(snap);
    expect(inv2.count('key')).toBe(2);
    expect(inv2.count('potion')).toBe(3);
  });
});

// ─── System ──────────────────────────────────────────────────────────────────────
function makeSystem() {
  const executed: AICommand[] = [];
  const events: Array<{ event: string; data: any }> = [];
  const host: InventoryHost = {
    execute: (c) => executed.push(c),
    emit: (event, data) => events.push({ event, data }),
    persist: () => {},
  };
  return { items: new InventorySystem(host), executed, events };
}

describe('InventorySystem', () => {
  it('give/take emit item_acquired/item_removed with running total', () => {
    const { items, events } = makeSystem();
    items.give('player', 'apple', 3);
    items.take('player', 'apple', 1);
    expect(items.count('player', 'apple')).toBe(2);
    expect(events).toEqual([
      { event: 'item_acquired', data: { owner: 'player', item: 'apple', count: 3, total: 3 } },
      { event: 'item_removed', data: { owner: 'player', item: 'apple', count: 1, total: 2 } },
    ]);
  });

  it('use runs onUse effects, consumes a consumable, and fires item_used', () => {
    const { items, executed, events } = makeSystem();
    items.define({ id: 'potion', onUse: [{ type: 'set_master_volume', volume: 1 } as AICommand] });
    items.give('player', 'potion', 2);
    expect(items.use('player', 'potion')).toBe(true);
    expect(executed).toHaveLength(1);            // onUse ran
    expect((executed[0] as any).type).toBe('set_master_volume');
    expect(items.count('player', 'potion')).toBe(1); // consumed one
    expect(events.some((e) => e.event === 'item_used')).toBe(true);
  });

  it('non-consumable items are not removed on use', () => {
    const { items } = makeSystem();
    items.define({ id: 'lantern', consumable: false, onUse: [{ type: 'set_master_volume', volume: 0.5 } as AICommand] });
    items.give('player', 'lantern', 1);
    items.use('player', 'lantern');
    expect(items.count('player', 'lantern')).toBe(1);
  });

  it('use returns false when the owner does not hold the item', () => {
    const { items, executed } = makeSystem();
    items.define({ id: 'ghost', onUse: [{ type: 'set_master_volume', volume: 1 } as AICommand] });
    expect(items.use('player', 'ghost')).toBe(false);
    expect(executed).toHaveLength(0);
  });

  it('transfer moves items and refunds overflow when the destination is full', () => {
    const { items } = makeSystem();
    items.define({ id: 'ore', maxStack: 99 });
    items.give('chest', 'ore', 10);
    items.inventoryOf('player', /* slots */ 0); // player has zero slots → cannot receive
    const moved = items.transfer('chest', 'player', 'ore', 10);
    expect(moved).toBe(0);
    expect(items.count('chest', 'ore')).toBe(10); // refunded
  });

  it('serialize/restore round-trips every owner', () => {
    const { items } = makeSystem();
    items.give('player', 'gold', 50);
    items.give('chest_01', 'sword', 1);
    const saved = items.serialize();
    const { items: items2 } = makeSystem();
    items2.restore(saved);
    expect(items2.count('player', 'gold')).toBe(50);
    expect(items2.count('chest_01', 'sword')).toBe(1);
  });
});

// ─── Gameplay ↔ Items integration ─────────────────────────────────────────────────
function makeWorld() {
  const bus = new Map<string, Set<(d: unknown) => void>>();
  const on = (e: string, cb: (d: unknown) => void) => {
    let s = bus.get(e); if (!s) { s = new Set(); bus.set(e, s); } s.add(cb);
    return () => s!.delete(cb);
  };
  const emit = (e: string, d?: unknown) => bus.get(e)?.forEach((cb) => cb(d));
  const executed: AICommand[] = [];
  let items: InventorySystem;
  // Mimic the real AIBridge routing inventory_* commands to the InventorySystem.
  const route = (cmd: AICommand) => {
    switch (cmd.type) {
      case 'inventory_give': items.give((cmd as any).owner ?? 'player', (cmd as any).item, (cmd as any).count ?? 1); break;
      case 'inventory_remove': items.take((cmd as any).owner ?? 'player', (cmd as any).item, (cmd as any).count ?? 1); break;
      case 'inventory_use': items.use((cmd as any).owner ?? 'player', (cmd as any).item); break;
      default: executed.push(cmd);
    }
  };
  items = new InventorySystem({ execute: route, emit, persist: () => {} });
  const host: GameplayHost = {
    execute: route, on, emit,
    listEntities: () => [], getPlayerPosition: () => null,
    itemCount: (o, i) => items.count(o, i),
  };
  return { items, director: new GameplayDirector(host), executed };
}

describe('Gameplay ↔ Items', () => {
  it('an item_acquired trigger advances a quest as giveItem flows through the bridge', () => {
    const { director } = makeWorld();
    director.load({
      quests: [{ id: 'gather', title: 'Gather', autoStart: true, objectives: [{ id: 'apples', description: 'Get 2 apples', count: 2 }] }],
      rules: [
        { on: { event: 'start' }, do: [{ giveItem: 'apple', count: 1 }] },
        { on: { event: 'signal', name: 'pick' }, do: [{ giveItem: 'apple', count: 1 }] },
        { on: { event: 'item_acquired', item: 'apple' }, do: [{ advance: { quest: 'gather', objective: 'apples' } }] },
        { on: { event: 'quest_completed', quest: 'gather' }, do: [{ win: {} }] },
      ],
    });
    // start → giveItem → item_acquired → advance (1/2)
    expect(director.getStatus().quests[0].objectives[0].progress).toBe(1);
    director.signal('pick'); // → giveItem → item_acquired → advance (2/2) → quest complete → win
    expect(director.getStatus().quests[0].state).toBe('completed');
    expect(director.status).toBe('won');
  });

  it('hasItem condition gates a rule; useItem consumes and runs the effect', () => {
    const { director, items, executed } = makeWorld();
    items.define({ id: 'key', tags: ['quest'] });
    items.define({ id: 'bomb', onUse: [{ type: 'explosion_feedback', x: 0, y: 0, z: 0 } as AICommand] });
    director.load({
      variables: { opened: false },
      rules: [
        { on: { event: 'signal', name: 'try_open' }, if: [{ hasItem: 'key' }], do: [{ setVar: 'opened', value: true }] },
        { on: { event: 'signal', name: 'detonate' }, do: [{ useItem: 'bomb' }] },
      ],
    });
    director.signal('try_open');
    expect(director.getVar('opened')).toBe(false); // no key yet — rule gated, stays at initial value

    items.give('player', 'key', 1);
    director.signal('try_open');
    expect(director.getVar('opened')).toBe(true);

    items.give('player', 'bomb', 1);
    director.signal('detonate');
    expect(items.count('player', 'bomb')).toBe(0); // consumed
    expect(executed.some((c) => (c as any).type === 'explosion_feedback')).toBe(true);
  });
});
