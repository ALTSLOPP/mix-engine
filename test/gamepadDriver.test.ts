import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionMap } from '../src/input/ActionMap';
import { GamepadDriver } from '../src/input/GamepadDriver';
import { SyntheticActionDriver } from '../src/input/SyntheticActionDriver';

function button(value = 0): GamepadButton {
  return { pressed: value > 0.5, touched: value > 0, value };
}

function makePad(index: number, axes = [0, 0, 0, 0]): Gamepad {
  const buttons = Array.from({ length: 17 }, () => button());
  buttons[0] = button(1);
  buttons[7] = button(0.75);
  return {
    axes,
    buttons,
    connected: true,
    id: 'Test Wireless Controller',
    index,
    mapping: 'standard',
    timestamp: 1,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

afterEach(() => vi.unstubAllGlobals());

describe('GamepadDriver Unity-style controls', () => {
  it('normalizes Unity paths and common Xbox/PlayStation aliases', () => {
    expect(GamepadDriver.normalizeControl('<Gamepad>/buttonSouth')).toBe('buttonSouth');
    expect(GamepadDriver.normalizeControl('Cross')).toBe('buttonSouth');
    expect(GamepadDriver.normalizeControl('RT')).toBe('rightTrigger');
    expect(GamepadDriver.normalizeControl('<Gamepad>/rightStick')).toBe('rightStick');
    expect(GamepadDriver.normalizeControl('not-a-control')).toBeNull();
  });

  it('uses the first connected controller when its browser index is not zero', () => {
    const pad = makePad(2, [0.6, -0.8, 0.25, -0.5]);
    vi.stubGlobal('navigator', { getGamepads: () => [null, null, pad] });
    const driver = new GamepadDriver();

    expect(driver.getGamepad()?.index).toBe(2);
    expect(driver.isControlPressed('<Gamepad>/buttonSouth')).toBe(true);
    expect(driver.getControlValue('<Gamepad>/rightTrigger')).toBe(0.75);
    expect(driver.getControlVector('<Gamepad>/leftStick', 0)).toEqual({ x: 0.6, y: -0.8 });
    expect(driver.getStatus()[0]).toMatchObject({
      index: 2,
      layout: 'Gamepad',
      buttons: 17,
      axes: 4,
    });
    driver.dispose();
  });

  it('evaluates semantic action bindings without raw button or axis numbers', () => {
    const pad = makePad(3, [0.5, 0, 0, 0]);
    vi.stubGlobal('navigator', { getGamepads: () => [null, null, null, pad] });
    const driver = new GamepadDriver();
    const map = new ActionMap();
    const synthetic = new SyntheticActionDriver();
    const raw = { isKeyDown: () => false, isMouseButtonDown: () => false };

    map.defineAction({
      name: 'Jump',
      kind: 'button',
      bindings: [{ device: 'gamepad', control: '<Gamepad>/buttonSouth' }],
    });
    map.defineAction({
      name: 'Move',
      kind: 'axis2d',
      deadzone: 0,
      bindings: [{ device: 'gamepad', control: '<Gamepad>/leftStick' }],
    });

    expect(map.evaluateAction('Jump', raw, driver, synthetic)).toBe(true);
    expect(map.evaluateAction('Move', raw, driver, synthetic)).toEqual({ x: 0.5, y: 0 });
    expect(map.getActions()).toHaveLength(2);
    expect(map.replaceBindings('Jump', [])).toBe(true);
    expect(map.evaluateAction('Jump', raw, driver, synthetic)).toBe(false);
    driver.dispose();
  });
});
