import { describe, it, expect } from 'vitest';
import { GameplayDirector } from '../src/gameplay';
import type { GameplayHost } from '../src/gameplay';
import type { AICommand } from '../src/ai/AIBridge';

/** Harness: capture the `dialogue_show` commands the director emits, and simulate a UI
 *  click by reading a choice's embedded `gameplay_dialogue_choose` index and calling back. */
function makeDirector() {
  const executed: AICommand[] = [];
  const bus = new Map<string, Set<(d: unknown) => void>>();
  const on = (e: string, cb: (d: unknown) => void) => {
    let s = bus.get(e); if (!s) { s = new Set(); bus.set(e, s); } s.add(cb);
    return () => s!.delete(cb);
  };
  const emit = (e: string, d?: unknown) => bus.get(e)?.forEach((cb) => cb(d));
  const host: GameplayHost = {
    execute: (c) => executed.push(c),
    on, emit,
    listEntities: () => [], getPlayerPosition: () => null,
  };
  const director = new GameplayDirector(host);
  const lastDialogue = () => [...executed].reverse().find((c: any) => c.type === 'dialogue_show') as any;
  const clickChoice = (text: string) => {
    const dlg = lastDialogue();
    const ch = dlg.choices.find((c: any) => c.text === text);
    if (!ch) throw new Error(`no choice "${text}" (have: ${dlg.choices.map((c: any) => c.text).join(', ')})`);
    director.chooseDialogue(ch.command.index);
  };
  const clickContinue = () => director.chooseDialogue(-1);
  return { director, executed, lastDialogue, clickChoice, clickContinue };
}

describe('Dialogue trees', () => {
  it('walks a linear conversation and fires dialogue_ended at the leaf', () => {
    const h = makeDirector();
    h.director.load({
      variables: { ended: false },
      dialogues: [{ id: 'intro', start: 'a', nodes: [
        { id: 'a', speaker: 'Sage', text: 'Hello, traveler.', next: 'b' },
        { id: 'b', text: 'Farewell.' },
      ] }],
      rules: [{ on: { event: 'dialogue_ended', dialogue: 'intro' }, do: [{ setVar: 'ended', value: true }] }],
    });
    h.director.startDialogue('intro');
    let d = h.lastDialogue();
    expect(d.text).toBe('Hello, traveler.');
    expect(d.speaker).toBe('Sage');
    expect(d.choices.map((c: any) => c.text)).toEqual(['Continue']);
    expect(h.director.getStatus().activeDialogue).toEqual({ id: 'intro', node: 'a' });

    h.clickContinue();                 // a.next → b
    d = h.lastDialogue();
    expect(d.text).toBe('Farewell.');

    h.clickContinue();                 // b is terminal → end
    expect(h.director.getStatus().activeDialogue).toBe(null);
    expect(h.director.getVar('ended')).toBe(true);
  });

  it('hides choices whose conditions fail; choice actions + branching apply', () => {
    const h = makeDirector();
    h.director.load({
      variables: { gold: 0, bought: false },
      dialogues: [{ id: 'shop', start: 'greet', nodes: [
        { id: 'greet', speaker: 'Merchant', text: 'Buy a sword?', choices: [
          { text: 'Yes (10g)', if: [{ var: 'gold', op: '>=', value: 10 }], do: [{ addVar: 'gold', by: -10 }, { setVar: 'bought', value: true }], next: 'thanks' },
          { text: 'No thanks' },
        ] },
        { id: 'thanks', text: 'Pleasure doing business.' },
      ] }],
    });

    h.director.startDialogue('shop');
    expect(h.lastDialogue().choices.map((c: any) => c.text)).toEqual(['No thanks']); // can't afford
    h.clickChoice('No thanks');        // no `next` → ends
    expect(h.director.getStatus().activeDialogue).toBe(null);

    h.director.setVar('gold', 50);
    h.director.startDialogue('shop');
    expect(h.lastDialogue().choices.map((c: any) => c.text)).toEqual(['Yes (10g)', 'No thanks']);
    h.clickChoice('Yes (10g)');        // do: -10 gold + bought; next → thanks
    expect(h.director.getVar('gold')).toBe(40);
    expect(h.director.getVar('bought')).toBe(true);
    expect(h.lastDialogue().text).toBe('Pleasure doing business.');
  });

  it('runs node.actions when a node is shown', () => {
    const h = makeDirector();
    h.director.load({
      variables: { reached: false },
      dialogues: [{ id: 't', start: 'n', nodes: [{ id: 'n', text: 'hi', actions: [{ setVar: 'reached', value: true }] }] }],
    });
    h.director.startDialogue('t');
    expect(h.director.getVar('reached')).toBe(true);
    expect(h.director.getStatus().activeDialogue).toEqual({ id: 't', node: 'n' });
  });

  it('a `startDialogue` action (from a rule) opens the tree', () => {
    const h = makeDirector();
    h.director.load({
      dialogues: [{ id: 'npc', start: 'n', nodes: [{ id: 'n', text: 'Well met.' }] }],
      rules: [{ on: { event: 'signal', name: 'talk' }, do: [{ startDialogue: 'npc' }] }],
    });
    h.director.signal('talk');
    expect(h.lastDialogue().text).toBe('Well met.');
    expect(h.director.getStatus().activeDialogue?.id).toBe('npc');
  });

  it('a dialogue choice can end the game', () => {
    const h = makeDirector();
    h.director.load({
      dialogues: [{ id: 'fate', start: 'n', nodes: [{ id: 'n', text: 'Choose.', choices: [
        { text: 'Surrender', do: [{ lose: { message: 'You gave up.' } }] },
        { text: 'Fight on' },
      ] }] }],
    });
    h.director.startDialogue('fate');
    h.clickChoice('Surrender');
    expect(h.director.status).toBe('lost');
    expect(h.director.getStatus().message).toBe('You gave up.');
  });
});
