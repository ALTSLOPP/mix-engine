import { describe, it, expect } from 'vitest';
import { InteractionSystem } from '../src/interaction';
import type { InteractionHost, IxEntity, PlayerPose } from '../src/interaction';
import { GameplayDirector } from '../src/gameplay';
import type { GameplayHost } from '../src/gameplay';
import type { AICommand } from '../src/ai/AIBridge';

function makeHost() {
  const executed: AICommand[] = [];
  const events: Array<{ event: string; data: any }> = [];
  const prompts: Array<{ text: string | null; entityId?: number }> = [];
  let entities: IxEntity[] = [];
  let pose: PlayerPose | null = null;
  let pressed = false;
  const host: InteractionHost = {
    execute: (c) => executed.push(c),
    emit: (event, data) => events.push({ event, data }),
    listEntities: () => entities,
    getPlayerPose: () => pose,
    isInteractPressed: () => pressed,
    showPrompt: (text, entityId) => prompts.push({ text, entityId }),
  };
  return {
    host, executed, events, prompts,
    setEntities: (e: IxEntity[]) => { entities = e; },
    setPose: (p: PlayerPose | null) => { pose = p; },
    press: (v = true) => { pressed = v; },
  };
}

const ent = (id: number, p: Partial<IxEntity> = {}): IxEntity => ({ id, tags: [], x: 0, y: 0, z: 0, ...p });
const pose = (x: number, z: number, fx = 0, fz = -1): PlayerPose => ({ x, y: 0, z, fx, fy: 0, fz });

describe('InteractionSystem', () => {
  it('shows a prompt in range and hides it out of range', () => {
    const h = makeHost();
    const sys = new InteractionSystem(h.host);
    sys.register({ id: 'door', entityId: 1, prompt: 'Open door', radius: 3 });
    h.setEntities([ent(1, { x: 0, y: 0, z: 0 })]);

    h.setPose(pose(1, 0)); // 1m away
    sys.update(0.1);
    expect(h.prompts.at(-1)).toEqual({ text: 'Open door', entityId: 1 });
    expect(sys.currentTargetId).toBe('door');

    h.setPose(pose(50, 0)); // far
    sys.update(0.1);
    expect(h.prompts.at(-1)).toEqual({ text: null, entityId: undefined });
    expect(sys.currentTargetId).toBe(null);
  });

  it('requireFacing gates the prompt', () => {
    const h = makeHost();
    const sys = new InteractionSystem(h.host);
    sys.register({ id: 'panel', entityId: 1, radius: 5, requireFacing: true });
    h.setEntities([ent(1, { x: 0, y: 0, z: -2 })]); // 2m in front (-z)

    h.setPose(pose(0, 0, 0, -1)); // looking -z → toward panel
    sys.update(0.1);
    expect(sys.currentTargetId).toBe('panel');

    h.setPose(pose(0, 0, 0, 1)); // looking +z → away
    sys.update(0.1);
    expect(sys.currentTargetId).toBe(null);
  });

  it('picks the nearest of several in-range interactables (by tag)', () => {
    const h = makeHost();
    const sys = new InteractionSystem(h.host);
    sys.register({ id: 'loot', tag: 'chest', prompt: 'Loot', radius: 10 });
    h.setEntities([ent(1, { tags: ['chest'], x: 5, z: 0 }), ent(2, { tags: ['chest'], x: 2, z: 0 })]);
    h.setPose(pose(0, 0));
    sys.update(0.1);
    expect(sys.status().current?.entityId).toBe(2); // the closer chest
  });

  it('pressing interact runs commands and emits `interacted`', () => {
    const h = makeHost();
    const sys = new InteractionSystem(h.host);
    sys.register({ id: 'lever', entityId: 1, radius: 3, commands: [{ type: 'gameplay_signal', name: 'pulled' } as AICommand] });
    h.setEntities([ent(1)]);
    h.setPose(pose(1, 0));
    h.press(true);
    sys.update(0.1);
    expect(h.executed).toHaveLength(1);
    expect((h.executed[0] as any).type).toBe('gameplay_signal');
    expect(h.events.some((e) => e.event === 'interacted' && e.data.id === 'lever')).toBe(true);
  });

  it('`once` disables after firing', () => {
    const h = makeHost();
    const sys = new InteractionSystem(h.host);
    sys.register({ id: 'shrine', entityId: 1, radius: 3, once: true, commands: [{ type: 'gameplay_signal', name: 'bless' } as AICommand] });
    h.setEntities([ent(1)]);
    h.setPose(pose(1, 0));
    h.press(true);
    sys.update(0.1);
    sys.update(0.1);
    sys.update(0.1);
    expect(h.executed).toHaveLength(1); // only once
  });

  it('`cooldown` throttles repeated activations', () => {
    const h = makeHost();
    const sys = new InteractionSystem(h.host);
    sys.register({ id: 'btn', entityId: 1, radius: 3, cooldown: 1.0, commands: [{ type: 'gameplay_signal', name: 'beep' } as AICommand] });
    h.setEntities([ent(1)]);
    h.setPose(pose(1, 0));
    h.press(true);
    sys.update(0.5); // elapsed .5 → fire
    sys.update(0.4); // elapsed .9 → blocked (<1 since last)
    expect(h.executed).toHaveLength(1);
    sys.update(0.7); // elapsed 1.6 → 1.1 since last → fire
    expect(h.executed).toHaveLength(2);
  });

  it('trigger(id) activates regardless of range; unregister clears the prompt', () => {
    const h = makeHost();
    const sys = new InteractionSystem(h.host);
    sys.register({ id: 'remote', entityId: 99, commands: [{ type: 'gameplay_signal', name: 'x' } as AICommand] });
    h.setEntities([]); // entity not even present
    h.setPose(pose(0, 0));
    expect(sys.trigger('remote')).toBe(true);
    expect(h.executed).toHaveLength(1);

    // Prompt clears on unregister of the current target.
    sys.register({ id: 'door', entityId: 1, prompt: 'Open', radius: 3 });
    h.setEntities([ent(1)]);
    sys.update(0.1);
    expect(sys.currentTargetId).toBe('door');
    sys.unregister('door');
    expect(h.prompts.at(-1)?.text).toBe(null);
  });
});

// ─── Gameplay ↔ Interaction ──────────────────────────────────────────────────────
describe('Gameplay ↔ Interaction', () => {
  it('an `interact` trigger fires a gameplay rule', () => {
    const bus = new Map<string, Set<(d: unknown) => void>>();
    const on = (e: string, cb: (d: unknown) => void) => {
      let s = bus.get(e); if (!s) { s = new Set(); bus.set(e, s); } s.add(cb);
      return () => s!.delete(cb);
    };
    const emit = (e: string, d?: unknown) => bus.get(e)?.forEach((cb) => cb(d));
    const executed: AICommand[] = [];

    const ixHost: InteractionHost = {
      execute: (c) => executed.push(c),
      emit,
      listEntities: () => [ent(1, { x: 0, z: 0 })],
      getPlayerPose: () => pose(1, 0),
      isInteractPressed: () => true,
      showPrompt: () => {},
    };
    const gpHost: GameplayHost = {
      execute: (c) => executed.push(c),
      on, emit,
      listEntities: () => [], getPlayerPosition: () => null,
    };
    const interaction = new InteractionSystem(ixHost);
    const director = new GameplayDirector(gpHost);
    director.load({
      variables: { chestOpen: false },
      rules: [{ on: { event: 'interact', id: 'chest' }, do: [{ setVar: 'chestOpen', value: true }] }],
    });
    interaction.register({ id: 'chest', entityId: 1, radius: 3, prompt: 'Open chest' });

    interaction.update(0.1); // in range + pressed → interacted → director rule
    expect(director.getVar('chestOpen')).toBe(true);
  });
});
