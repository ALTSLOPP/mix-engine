import { describe, it, expect } from 'vitest';
import { InputActionMap, type RawInputState } from '../src/input/InputActionMap';
import { VirtualGamepad } from '../src/input/VirtualGamepad';

describe('InputActionMap & VirtualGamepad', () => {
  it('maps chords, buttons, and analog axes with deadzones', () => {
    const inputMap = new InputActionMap();

    inputMap.bind('sprint_interact', {
      type: 'keyboard',
      code: 'KeyE',
      shift: true,
    });

    inputMap.bind('fire', {
      type: 'mouse',
      button: 0,
    });

    inputMap.bind('move_forward', {
      type: 'gamepad_axis',
      axis: 1, // Left Stick Y
      direction: 'negative',
      deadzone: 0.2,
    });

    // Test Keyboard Chord (Shift + E)
    const stateNoShift: RawInputState = {
      keysDown: new Set(['KeyE']),
      mouseButtonsDown: new Set(),
      shiftKey: false,
    };
    expect(inputMap.isActionPressed('sprint_interact', stateNoShift)).toBe(false);

    const stateWithShift: RawInputState = {
      keysDown: new Set(['KeyE']),
      mouseButtonsDown: new Set(),
      shiftKey: true,
    };
    expect(inputMap.isActionPressed('sprint_interact', stateWithShift)).toBe(true);

    // Test Gamepad Axis Deadzone
    const stateStickInDeadzone: RawInputState = {
      keysDown: new Set(),
      mouseButtonsDown: new Set(),
      gamepadAxes: [0, -0.1, 0, 0], // -0.1 is within 0.2 deadzone
    };
    expect(inputMap.getActionValue('move_forward', stateStickInDeadzone)).toBe(0);

    const stateStickPushed: RawInputState = {
      keysDown: new Set(),
      mouseButtonsDown: new Set(),
      gamepadAxes: [0, -0.6, 0, 0], // -0.6 is active
    };
    expect(inputMap.getActionValue('move_forward', stateStickPushed)).toBeCloseTo(0.5); // (0.6 - 0.2) / 0.8 = 0.5
  });

  it('exports and imports input configuration JSON', () => {
    const map = new InputActionMap();
    map.bind('jump', { type: 'keyboard', code: 'Space' });

    const json = map.exportBindings();
    expect(json).toContain('Space');

    const restoredMap = new InputActionMap();
    restoredMap.importBindings(json);

    const state: RawInputState = {
      keysDown: new Set(['Space']),
      mouseButtonsDown: new Set(),
    };
    expect(restoredMap.isActionPressed('jump', state)).toBe(true);
  });

  it('tracks mobile touch virtual joystick and buttons', () => {
    const pad = new VirtualGamepad(50);
    pad.addButton('Attack', 300, 300, 40);

    // Touch button
    pad.handleTouchStart(1, 305, 302, false);
    expect(pad.isButtonPressed('Attack')).toBe(true);

    pad.handleTouchEnd(1);
    expect(pad.isButtonPressed('Attack')).toBe(false);

    // Touch joystick (left screen)
    pad.handleTouchStart(2, 100, 200, true);
    pad.handleTouchMove(2, 125, 200); // 25px to the right (half of 50px maxRadius)

    const vec = pad.getStickVector();
    expect(vec.x).toBeCloseTo(0.5);
    expect(vec.y).toBe(0);

    pad.handleTouchEnd(2);
    expect(pad.getStickVector().x).toBe(0);
  });
});
