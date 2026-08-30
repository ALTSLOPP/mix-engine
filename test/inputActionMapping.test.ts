import { describe, it, expect } from 'vitest';
import { ActionMap } from '../src/input/ActionMap';
import { InputContextStack } from '../src/input/InputContextStack';
import { GamepadDriver } from '../src/input/GamepadDriver';
import { SyntheticActionDriver } from '../src/input/SyntheticActionDriver';

describe('Universal Input Action Mapping & Context Stack (S3)', () => {
  it('evaluates button and axis actions via ActionMap', () => {
    const map = new ActionMap();
    const gamepad = new GamepadDriver();
    const synthetic = new SyntheticActionDriver();

    map.defineAction({
      name: 'Jump',
      kind: 'button',
      bindings: [
        { device: 'keyboard', code: 'Space' },
      ],
    });

    map.defineAction({
      name: 'Move',
      kind: 'axis2d',
      bindings: [
        { device: 'keyboard', code: 'KeyW' },
        { device: 'keyboard', code: 'KeyS' },
        { device: 'keyboard', code: 'KeyA' },
        { device: 'keyboard', code: 'KeyD' },
      ],
    });

    // Case 1: no keys down
    const emptyState = {
      isKeyDown: () => false,
      isMouseButtonDown: () => false,
    };
    expect(map.evaluateAction('Jump', emptyState, gamepad, synthetic)).toBe(false);
    expect(map.evaluateAction('Move', emptyState, gamepad, synthetic)).toEqual({ x: 0, y: 0 });

    // Case 2: Space down
    const spaceDown = {
      isKeyDown: (code: string) => code === 'Space',
      isMouseButtonDown: () => false,
    };
    expect(map.evaluateAction('Jump', spaceDown, gamepad, synthetic)).toBe(true);

    // Case 3: KeyW and KeyD down (forward-right diagonal)
    const moveDiag = {
      isKeyDown: (code: string) => code === 'KeyW' || code === 'KeyD',
      isMouseButtonDown: () => false,
    };
    const moveVal = map.evaluateAction('Move', moveDiag, gamepad, synthetic) as { x: number; y: number };
    expect(moveVal.x).toBeCloseTo(Math.SQRT1_2, 3);
    expect(moveVal.y).toBeCloseTo(-Math.SQRT1_2, 3);
  });

  it('manages context priority and masking in InputContextStack', () => {
    const stack = new InputContextStack();
    const gamepad = new GamepadDriver();
    const synthetic = new SyntheticActionDriver();

    const emptyState = {
      isKeyDown: (code: string) => code === 'Space' || code === 'KeyE',
      isMouseButtonDown: () => false,
    };

    // 1. Push gameplay on-foot context
    stack.push({
      name: 'OnFoot',
      priority: 0,
      actions: [
        {
          name: 'Jump',
          kind: 'button',
          bindings: [{ device: 'keyboard', code: 'Space' }],
        },
        {
          name: 'Interact',
          kind: 'button',
          bindings: [{ device: 'keyboard', code: 'KeyE' }],
        },
      ],
    });

    expect(stack.evaluate('Jump', emptyState, gamepad, synthetic)).toBe(true);
    expect(stack.evaluate('Interact', emptyState, gamepad, synthetic)).toBe(true);

    // 2. Push modal menu context with maskAllBelow
    stack.push({
      name: 'Menu',
      priority: 100,
      maskAllBelow: true,
      actions: [
        {
          name: 'Confirm',
          kind: 'button',
          bindings: [{ device: 'keyboard', code: 'Enter' }],
        },
      ],
    });

    // Gameplay actions should now be masked
    expect(stack.evaluate('Jump', emptyState, gamepad, synthetic)).toBe(false);
    expect(stack.evaluate('Interact', emptyState, gamepad, synthetic)).toBe(false);

    // 3. Pop menu context
    stack.pop('Menu');
    expect(stack.evaluate('Jump', emptyState, gamepad, synthetic)).toBe(true);
  });

  it('supports synthetic overrides in headless mode', () => {
    const stack = new InputContextStack();
    const gamepad = new GamepadDriver();
    const synthetic = new SyntheticActionDriver();

    const emptyState = {
      isKeyDown: () => false,
      isMouseButtonDown: () => false,
    };

    stack.push({
      name: 'OnFoot',
      priority: 0,
      actions: [
        {
          name: 'Move',
          kind: 'axis2d',
          bindings: [],
        },
      ],
    });

    synthetic.setAction('Move', { x: 0.5, y: -0.5 });
    const val = stack.evaluate('Move', emptyState, gamepad, synthetic);
    expect(val).toEqual({ x: 0.5, y: -0.5 });

    synthetic.clear();
    expect(stack.evaluate('Move', emptyState, gamepad, synthetic)).toEqual({ x: 0, y: 0 });
  });

  it('replaces a context action asset without leaking stale definitions', () => {
    const stack = new InputContextStack();
    stack.push({
      name: 'OnFoot',
      priority: 0,
      actions: [
        { name: 'OldAction', kind: 'button', bindings: [{ device: 'keyboard', code: 'KeyO' }] },
      ],
    });

    stack.replaceActions([
      { name: 'NewAction', kind: 'button', bindings: [{ device: 'gamepad', control: '<Gamepad>/buttonSouth' }] },
    ]);

    expect(stack.map.getAction('OldAction')).toBeUndefined();
    expect(stack.map.getActions().map((action) => action.name)).toEqual(['NewAction']);
    expect(stack.getContexts()[0].actions[0].name).toBe('NewAction');
  });

  it('restores lower-priority bindings after an overlay context is removed', () => {
    const stack = new InputContextStack();
    stack.push({
      name: 'OnFoot',
      priority: 0,
      actions: [{ name: 'Jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'Space' }] }],
    });
    stack.push({
      name: 'Vehicle',
      priority: 100,
      actions: [{ name: 'Jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'KeyF' }] }],
    });

    expect(stack.map.getAction('Jump')?.bindings).toEqual([{ device: 'keyboard', code: 'KeyF' }]);
    stack.pop('Vehicle');
    expect(stack.map.getAction('Jump')?.bindings).toEqual([{ device: 'keyboard', code: 'Space' }]);
  });
});
