import { describe, it, expect } from 'vitest';
import { CommandHistory } from '../src/authoring/CommandHistory';
import { SceneDiffer } from '../src/authoring/SceneDiffer';

describe('CommandHistory & SceneDiffer (S5)', () => {
  it('manages undo/redo stacks and coalesces rapid updates', async () => {
    const history = new CommandHistory(10);
    let value = 0;

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    // 1. Record an action
    history.record({
      id: 'act1',
      name: 'Set Value to 10',
      timestamp: 1000,
      undo: () => { value = 0; },
      redo: () => { value = 10; },
    });
    value = 10;

    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // 2. Undo
    await history.undo();
    expect(value).toBe(0);
    expect(history.canRedo()).toBe(true);

    // 3. Redo
    await history.redo();
    expect(value).toBe(10);

    // 4. Coalescing rapid changes with same coalesceKey
    history.record({
      id: 'tweak1',
      name: 'Tweak pos',
      timestamp: 2000,
      coalesceKey: 'pos:1',
      undo: () => { value = 10; },
      redo: () => { value = 20; },
    });
    value = 20;

    history.record({
      id: 'tweak2',
      name: 'Tweak pos',
      timestamp: 2100, // < 500ms later
      coalesceKey: 'pos:1',
      undo: () => { value = 20; },
      redo: () => { value = 30; },
    });
    value = 30;

    // Stack should still have only 2 entries due to coalescing
    expect(history.getEntries().length).toBe(2);

    // Undo should restore initial state before coalesce group
    await history.undo();
    expect(value).toBe(10);
  });

  it('computes semantic JSON scene differences with SceneDiffer', () => {
    const before = [
      { id: 1, name: 'Player', position: { x: 0, y: 0, z: 0 }, tags: ['hero'] },
      { id: 2, name: 'Enemy', position: { x: 5, y: 0, z: 5 } },
    ];

    const after = [
      { id: 1, name: 'Player', position: { x: 1, y: 0, z: 0 }, tags: ['hero', 'powered'] }, // modified
      { id: 3, name: 'Pickup', position: { x: 10, y: 0, z: 10 } }, // added
    ];

    const diff = SceneDiffer.diff(before, after);

    expect(diff.added.length).toBe(1);
    expect(diff.added[0].id).toBe(3);

    expect(diff.removed).toEqual([2]);

    expect(diff.modified.length).toBe(1);
    expect(diff.modified[0].id).toBe(1);
    expect(diff.modified[0].changes.position).toBeDefined();
    expect(diff.modified[0].changes.tags).toBeDefined();
  });
});
