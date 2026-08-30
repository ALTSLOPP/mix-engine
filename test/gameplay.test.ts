import { describe, it, expect, vi } from 'vitest';
import { GameplayDirector } from '../src/gameplay';
import type { GameplayDef, GameplayHost, GpEntitySnapshot } from '../src/gameplay';
import type { AICommand } from '../src/ai/AIBridge';

// ─── Mock host ─────────────────────────────────────────────────────────────────
function makeHarness(opts: { random?: () => number } = {}) {
  const executed: AICommand[] = [];
  const listeners = new Map<string, Set<(d: unknown) => void>>();
  let entities: GpEntitySnapshot[] = [];
  let player: { x: number; y: number; z: number } | null = null;
  let persisted: string | undefined;

  const host: GameplayHost = {
    execute: (c) => executed.push(c),
    on: (event, cb) => {
      let s = listeners.get(event);
      if (!s) { s = new Set(); listeners.set(event, s); }
      s.add(cb);
      return () => s!.delete(cb);
    },
    emit: (event, data) => { listeners.get(event)?.forEach((cb) => cb(data)); },
    listEntities: () => entities,
    getPlayerPosition: () => player,
    persist: (s) => { persisted = s; },
    random: opts.random,
  };

  return {
    host,
    executed,
    emit: (e: string, d: unknown) => host.emit(e, d),
    setEntities: (e: GpEntitySnapshot[]) => { entities = e; },
    setPlayer: (p: { x: number; y: number; z: number } | null) => { player = p; },
    getPersisted: () => persisted,
  };
}

function ent(id: number, p: Partial<GpEntitySnapshot> = {}): GpEntitySnapshot {
  return { id, tags: [], x: 0, y: 0, z: 0, ...p };
}

describe('GameplayDirector — rules & variables', () => {
  it('fires `start` rules on load and runs command + setVar actions', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    const def: GameplayDef = {
      variables: { score: 0 },
      rules: [{
        on: { event: 'start' },
        do: [
          { setVar: 'score', value: 10 },
          { command: { type: 'set_master_volume', volume: 0.5 } as AICommand },
        ],
      }],
    };
    d.load(def);
    expect(d.getVar('score')).toBe(10);
    expect(h.executed).toHaveLength(1);
    expect((h.executed[0] as any).type).toBe('set_master_volume');
  });

  it('gates rule actions on `if` conditions', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { hasKey: false },
      rules: [{
        on: { event: 'signal', name: 'open_door' },
        if: [{ var: 'hasKey', value: true }],
        do: [{ setVar: 'doorOpen', value: true }],
      }],
    });
    d.signal('open_door');
    expect(d.getVar('doorOpen')).toBeUndefined(); // condition failed

    d.setVar('hasKey', true);
    d.signal('open_door');
    expect(d.getVar('doorOpen')).toBe(true);
  });

  it('addVar increments and var_changed rules chain', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { coins: 0 },
      rules: [
        { on: { event: 'signal', name: 'pickup' }, do: [{ addVar: 'coins', by: 1 }] },
        { on: { event: 'var_changed', var: 'coins' }, if: [{ var: 'coins', op: '>=', value: 3 }], do: [{ win: { message: 'rich!' } }] },
      ],
    });
    d.signal('pickup');
    d.signal('pickup');
    expect(d.status).toBe('playing');
    d.signal('pickup'); // coins=3 → win
    expect(d.status).toBe('won');
    expect(d.getStatus().message).toBe('rich!');
  });

  it('respects `once` and `cooldown`', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { n: 0, m: 0 },
      rules: [
        { on: { event: 'signal', name: 'a' }, once: true, do: [{ addVar: 'n', by: 1 }] },
        { on: { event: 'signal', name: 'b' }, cooldown: 1.0, do: [{ addVar: 'm', by: 1 }] },
      ],
    });
    d.signal('a'); d.signal('a'); d.signal('a');
    expect(d.getVar('n')).toBe(1); // once

    d.signal('b');             // fires (elapsed 0)
    d.signal('b');             // blocked by cooldown
    expect(d.getVar('m')).toBe(1);
    d.update(1.0);             // elapsed → 1.0
    d.signal('b');             // cooldown elapsed → fires
    expect(d.getVar('m')).toBe(2);
  });

  it('chance condition uses the injected RNG', () => {
    const rng = vi.fn().mockReturnValueOnce(0.9).mockReturnValueOnce(0.1);
    const h = makeHarness({ random: rng });
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { hits: 0 },
      rules: [{ on: { event: 'signal', name: 'roll' }, if: [{ chance: 0.5 }], do: [{ addVar: 'hits', by: 1 }] }],
    });
    d.signal('roll'); // rng 0.9 → fails 0.9 < 0.5 == false
    expect(d.getVar('hits')).toBe(0);
    d.signal('roll'); // rng 0.1 → passes
    expect(d.getVar('hits')).toBe(1);
  });
});

describe('GameplayDirector — zones', () => {
  it('fires zone_enter / zone_exit as the player moves through a sphere', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { inside: false },
      zones: [{ id: 'pit', center: [0, 0, 0], radius: 5, watch: 'player' }],
      rules: [
        { on: { event: 'zone_enter', zone: 'pit' }, do: [{ setVar: 'inside', value: true }] },
        { on: { event: 'zone_exit', zone: 'pit' }, do: [{ setVar: 'inside', value: false }] },
      ],
    });
    h.setPlayer({ x: 100, y: 0, z: 0 });
    d.update(0.016);
    expect(d.getVar('inside')).toBe(false);

    h.setPlayer({ x: 1, y: 0, z: 0 }); // inside r=5
    d.update(0.016);
    expect(d.getVar('inside')).toBe(true);

    h.setPlayer({ x: 100, y: 0, z: 0 }); // left
    d.update(0.016);
    expect(d.getVar('inside')).toBe(false);
  });

  it('tracks tagged entities in a box zone', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { count: 0 },
      zones: [{ id: 'goal', center: [0, 0, 0], shape: 'box', size: [4, 4, 4], watch: 'tag:sheep' }],
      rules: [{ on: { event: 'zone_enter', zone: 'goal' }, do: [{ addVar: 'count', by: 1 }] }],
    });
    h.setEntities([ent(1, { tags: ['sheep'], x: 1, y: 0, z: 0 }), ent(2, { tags: ['wolf'], x: 1, y: 0, z: 0 })]);
    d.update(0.016);
    expect(d.getVar('count')).toBe(1); // only the sheep counted
  });

  it('a `once` zone latches after the first enter', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { n: 0 },
      zones: [{ id: 'z', center: [0, 0, 0], radius: 5, once: true }],
      rules: [{ on: { event: 'zone_enter', zone: 'z' }, do: [{ addVar: 'n', by: 1 }] }],
    });
    h.setPlayer({ x: 0, y: 0, z: 0 });
    d.update(0.016);
    h.setPlayer({ x: 100, y: 0, z: 0 }); d.update(0.016); // leave
    h.setPlayer({ x: 0, y: 0, z: 0 }); d.update(0.016);   // re-enter — should NOT fire
    expect(d.getVar('n')).toBe(1);
  });
});

describe('GameplayDirector — quests', () => {
  it('auto-starts, advances objectives, completes, and runs rewards', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    const def: GameplayDef = {
      quests: [{
        id: 'collect',
        title: 'Collect 3 gems',
        autoStart: true,
        objectives: [{ id: 'gems', description: 'Gather gems', count: 3 }],
        rewards: [{ setVar: 'rewarded', value: true }],
      }],
      rules: [{ on: { event: 'quest_completed', quest: 'collect' }, do: [{ win: {} }] }],
    };
    d.load(def);
    let st = d.getStatus();
    expect(st.quests[0].state).toBe('active');

    d.advanceObjective('collect', 'gems');
    d.advanceObjective('collect', 'gems');
    st = d.getStatus();
    expect(st.quests[0].objectives[0].progress).toBe(2);
    expect(st.quests[0].objectives[0].completed).toBe(false);

    d.advanceObjective('collect', 'gems'); // 3/3 → objective + quest complete
    st = d.getStatus();
    expect(st.quests[0].state).toBe('completed');
    expect(d.getVar('rewarded')).toBe(true);
    expect(d.status).toBe('won');
  });

  it('optional objectives do not gate completion; advancing an inactive quest is a no-op', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      quests: [{
        id: 'q',
        title: 'Mixed',
        objectives: [
          { id: 'main', description: 'Required', count: 1 },
          { id: 'bonus', description: 'Optional', count: 1, optional: true },
        ],
      }],
    });
    d.advanceObjective('q', 'main'); // quest inactive → ignored
    expect(d.getStatus().quests[0].objectives[0].progress).toBe(0);

    d.startQuest('q');
    d.advanceObjective('q', 'main'); // required done → quest completes despite bonus incomplete
    expect(d.getStatus().quests[0].state).toBe('completed');
  });
});

describe('GameplayDirector — timers', () => {
  it('repeating timer fires each interval; one-shot fires once', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { ticks: 0, once: 0 },
      timers: [
        { id: 'beat', interval: 1, repeat: true, autoStart: true },
        { id: 'bomb', interval: 2, autoStart: true },
      ],
      rules: [
        { on: { event: 'timer', timer: 'beat' }, do: [{ addVar: 'ticks', by: 1 }] },
        { on: { event: 'timer', timer: 'bomb' }, do: [{ addVar: 'once', by: 1 }] },
      ],
    });
    d.update(1); expect(d.getVar('ticks')).toBe(1);
    d.update(1); expect(d.getVar('ticks')).toBe(2); expect(d.getVar('once')).toBe(1);
    d.update(5); // bomb already fired (one-shot), beat fires once more (guarded against huge dt loop spam → counts each whole interval)
    expect(d.getVar('once')).toBe(1);
    expect(d.getVar('ticks')).toBeGreaterThanOrEqual(3);
  });
});

describe('GameplayDirector — bus triggers (collision / destroyed)', () => {
  it('collision trigger matches by tags in either order', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { hurt: 0 },
      rules: [{ on: { event: 'collision', tag: 'player', otherTag: 'spike' }, do: [{ addVar: 'hurt', by: 1 }] }],
    });
    h.setEntities([ent(1, { tags: ['player'] }), ent(2, { tags: ['spike'] })]);
    d.update(0.016); // refresh entity meta cache
    h.emit('collision_start', { entityA: 2, entityB: 1 }); // reversed order
    expect(d.getVar('hurt')).toBe(1);
  });

  it('destroyed trigger reads the tags the entity had before removal', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { kills: 0 },
      rules: [{ on: { event: 'destroyed', tag: 'enemy' }, do: [{ addVar: 'kills', by: 1 }] }],
    });
    h.setEntities([ent(7, { tags: ['enemy'] })]);
    d.update(0.016); // cache the enemy's tags
    h.setEntities([]); // it's gone from the live scene
    h.emit('entity_destroyed', { entityId: 7 });
    expect(d.getVar('kills')).toBe(1);
  });
});

describe('GameplayDirector — entity conditions & win/lose lock', () => {
  it('entityCount condition reads the live scene', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      rules: [{
        on: { event: 'signal', name: 'check' },
        if: [{ entityCount: { tag: 'enemy' }, op: '==', value: 0 }],
        do: [{ win: { message: 'cleared' } }],
      }],
    });
    h.setEntities([ent(1, { tags: ['enemy'] })]);
    d.signal('check');
    expect(d.status).toBe('playing'); // 1 enemy left

    h.setEntities([]);
    d.signal('check');
    expect(d.status).toBe('won');
  });

  it('after win, update() and further signals are inert', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      variables: { n: 0 },
      rules: [
        { on: { event: 'start' }, do: [{ win: {} }] },
        { on: { event: 'signal', name: 'x' }, do: [{ addVar: 'n', by: 1 }] },
      ],
    });
    expect(d.status).toBe('won');
    d.signal('x');
    d.update(1);
    expect(d.getVar('n')).toBe(0);
  });
});

describe('GameplayDirector — persistence', () => {
  it('serialize/restore round-trips variables, quest progress and status', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    const def: GameplayDef = {
      variables: { score: 0 },
      quests: [{ id: 'q', title: 'Q', autoStart: true, objectives: [{ id: 'o', description: 'do', count: 2 }] }],
    };
    d.load(def);
    d.setVar('score', 42);
    d.advanceObjective('q', 'o');
    const saved = d.serialize();
    expect(h.getPersisted()).toBeTruthy(); // persist hook fired

    const d2 = new GameplayDirector(h.host);
    d2.load(def); // fresh
    expect(d2.getVar('score')).toBe(0);
    d2.restore(saved);
    expect(d2.getVar('score')).toBe(42);
    expect(d2.getStatus().quests[0].objectives[0].progress).toBe(1);
  });

  it('summarize() renders a readable digest', () => {
    const h = makeHarness();
    const d = new GameplayDirector(h.host);
    d.load({
      name: 'Test Game',
      variables: { score: 5 },
      quests: [{ id: 'q', title: 'Win', autoStart: true, objectives: [{ id: 'o', description: 'Reach exit' }] }],
    });
    const text = d.summarize();
    expect(text).toContain('Test Game');
    expect(text).toContain('score=5');
    expect(text).toContain('Reach exit');
  });
});
