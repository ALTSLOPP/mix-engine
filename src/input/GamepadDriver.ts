import type { GamepadControl, ResponseCurve } from './types';

export interface RumbleOptions {
  durationMs?: number;
  weakMagnitude?: number;
  strongMagnitude?: number;
}

export interface GamepadDeviceInfo {
  index: number;
  id: string;
  connected: boolean;
  mapping: GamepadMappingType;
  layout: 'Gamepad' | 'Joystick';
  buttons: number;
  axes: number;
  haptics: boolean;
}

export interface GamepadControlInfo {
  path: string;
  control: GamepadControl;
  kind: 'button' | 'axis1d' | 'axis2d';
  aliases: string[];
}

export type GamepadDriverEvent = 'connected' | 'disconnected' | 'change';
export type GamepadDriverListener = (device: GamepadDeviceInfo) => void;

const BUTTON_INDEX: Partial<Record<GamepadControl, number>> = {
  buttonSouth: 0, buttonEast: 1, buttonWest: 2, buttonNorth: 3,
  leftShoulder: 4, rightShoulder: 5, leftTrigger: 6, rightTrigger: 7,
  select: 8, start: 9, leftStickPress: 10, rightStickPress: 11,
  dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15, home: 16,
};

const AXIS_INDEX: Partial<Record<GamepadControl, number>> = {
  'leftStick/x': 0, 'leftStick/y': 1, 'rightStick/x': 2, 'rightStick/y': 3,
};

const CONTROL_ALIASES: Record<string, GamepadControl> = {
  a: 'buttonSouth', cross: 'buttonSouth', buttonsouth: 'buttonSouth',
  b: 'buttonEast', circle: 'buttonEast', buttoneast: 'buttonEast',
  x: 'buttonWest', square: 'buttonWest', buttonwest: 'buttonWest',
  y: 'buttonNorth', triangle: 'buttonNorth', buttonnorth: 'buttonNorth',
  lb: 'leftShoulder', l1: 'leftShoulder', leftshoulder: 'leftShoulder',
  rb: 'rightShoulder', r1: 'rightShoulder', rightshoulder: 'rightShoulder',
  lt: 'leftTrigger', l2: 'leftTrigger', lefttrigger: 'leftTrigger',
  rt: 'rightTrigger', r2: 'rightTrigger', righttrigger: 'rightTrigger',
  back: 'select', view: 'select', select: 'select',
  menu: 'start', options: 'start', start: 'start',
  l3: 'leftStickPress', leftstickpress: 'leftStickPress',
  r3: 'rightStickPress', rightstickpress: 'rightStickPress',
  dpadup: 'dpadUp', dpaddown: 'dpadDown', dpadleft: 'dpadLeft', dpadright: 'dpadRight',
  guide: 'home', home: 'home',
  leftstick: 'leftStick', rightstick: 'rightStick',
  'leftstick/x': 'leftStick/x', 'leftstick/y': 'leftStick/y',
  'rightstick/x': 'rightStick/x', 'rightstick/y': 'rightStick/y',
};

const CONTROL_INFO: GamepadControlInfo[] = [
  { path: '<Gamepad>/buttonSouth', control: 'buttonSouth', kind: 'button', aliases: ['A', 'Cross'] },
  { path: '<Gamepad>/buttonEast', control: 'buttonEast', kind: 'button', aliases: ['B', 'Circle'] },
  { path: '<Gamepad>/buttonWest', control: 'buttonWest', kind: 'button', aliases: ['X', 'Square'] },
  { path: '<Gamepad>/buttonNorth', control: 'buttonNorth', kind: 'button', aliases: ['Y', 'Triangle'] },
  { path: '<Gamepad>/leftShoulder', control: 'leftShoulder', kind: 'button', aliases: ['LB', 'L1'] },
  { path: '<Gamepad>/rightShoulder', control: 'rightShoulder', kind: 'button', aliases: ['RB', 'R1'] },
  { path: '<Gamepad>/leftTrigger', control: 'leftTrigger', kind: 'axis1d', aliases: ['LT', 'L2'] },
  { path: '<Gamepad>/rightTrigger', control: 'rightTrigger', kind: 'axis1d', aliases: ['RT', 'R2'] },
  { path: '<Gamepad>/select', control: 'select', kind: 'button', aliases: ['Back', 'View'] },
  { path: '<Gamepad>/start', control: 'start', kind: 'button', aliases: ['Menu', 'Options'] },
  { path: '<Gamepad>/leftStickPress', control: 'leftStickPress', kind: 'button', aliases: ['L3'] },
  { path: '<Gamepad>/rightStickPress', control: 'rightStickPress', kind: 'button', aliases: ['R3'] },
  { path: '<Gamepad>/dpadUp', control: 'dpadUp', kind: 'button', aliases: [] },
  { path: '<Gamepad>/dpadDown', control: 'dpadDown', kind: 'button', aliases: [] },
  { path: '<Gamepad>/dpadLeft', control: 'dpadLeft', kind: 'button', aliases: [] },
  { path: '<Gamepad>/dpadRight', control: 'dpadRight', kind: 'button', aliases: [] },
  { path: '<Gamepad>/home', control: 'home', kind: 'button', aliases: ['Guide'] },
  { path: '<Gamepad>/leftStick', control: 'leftStick', kind: 'axis2d', aliases: ['LS'] },
  { path: '<Gamepad>/rightStick', control: 'rightStick', kind: 'axis2d', aliases: ['RS'] },
  { path: '<Gamepad>/leftStick/x', control: 'leftStick/x', kind: 'axis1d', aliases: [] },
  { path: '<Gamepad>/leftStick/y', control: 'leftStick/y', kind: 'axis1d', aliases: [] },
  { path: '<Gamepad>/rightStick/x', control: 'rightStick/x', kind: 'axis1d', aliases: [] },
  { path: '<Gamepad>/rightStick/y', control: 'rightStick/y', kind: 'axis1d', aliases: [] },
];

/** Browser gamepad adapter with Unity-style semantic controls and hot-plug events. */
export class GamepadDriver {
  private readonly connectedPads = new Set<number>();
  private readonly listeners: Record<GamepadDriverEvent, Set<GamepadDriverListener>> = {
    connected: new Set(), disconnected: new Set(), change: new Set(),
  };

  private readonly onConnected = (event: Event) => {
    const gamepad = (event as GamepadEvent).gamepad;
    this.connectedPads.add(gamepad.index);
    this.emit('connected', this.describe(gamepad));
    this.emit('change', this.describe(gamepad));
  };

  private readonly onDisconnected = (event: Event) => {
    const gamepad = (event as GamepadEvent).gamepad;
    this.connectedPads.delete(gamepad.index);
    const info = { ...this.describe(gamepad), connected: false };
    this.emit('disconnected', info);
    this.emit('change', info);
  };

  constructor() {
    this.scanConnectedPads();
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.onConnected);
      window.addEventListener('gamepaddisconnected', this.onDisconnected);
    }
  }

  static normalizeControl(control: string): GamepadControl | null {
    const path = control.trim().replace(/^<gamepad>\//i, '').replace(/^gamepad\//i, '');
    return CONTROL_ALIASES[path.toLowerCase()] ?? null;
  }

  static getControls(): GamepadControlInfo[] {
    return CONTROL_INFO.map((entry) => ({ ...entry, aliases: [...entry.aliases] }));
  }

  on(event: GamepadDriverEvent, listener: GamepadDriverListener): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }

  getGamepad(padIndex?: number): Gamepad | null {
    const pads = this.readPads();
    if (padIndex !== undefined) return pads[padIndex] ?? null;
    for (const index of [...this.connectedPads].sort((a, b) => a - b)) {
      const pad = pads[index];
      if (pad?.connected) return pad;
    }
    return pads.find((pad): pad is Gamepad => !!pad?.connected) ?? null;
  }

  isButtonPressed(buttonIndex: number, padIndex?: number): boolean {
    return !!this.getGamepad(padIndex)?.buttons[buttonIndex]?.pressed;
  }

  getButtonValue(buttonIndex: number, padIndex?: number): number {
    return this.getGamepad(padIndex)?.buttons[buttonIndex]?.value ?? 0;
  }

  getAxisValue(axisIndex: number, padIndex?: number): number {
    return this.getGamepad(padIndex)?.axes[axisIndex] ?? 0;
  }

  isControlPressed(controlPath: string, padIndex?: number, threshold = 0.5): boolean {
    const control = GamepadDriver.normalizeControl(controlPath);
    if (!control) return false;
    const button = BUTTON_INDEX[control];
    if (button !== undefined) {
      const state = this.getGamepad(padIndex)?.buttons[button];
      return !!state && (state.pressed || state.value > threshold);
    }
    return Math.abs(this.getControlValue(control, padIndex)) > threshold;
  }

  getControlValue(controlPath: string, padIndex?: number): number {
    const control = GamepadDriver.normalizeControl(controlPath);
    if (!control) return 0;
    const button = BUTTON_INDEX[control];
    if (button !== undefined) return this.getButtonValue(button, padIndex);
    const axis = AXIS_INDEX[control];
    return axis === undefined ? 0 : this.getAxisValue(axis, padIndex);
  }

  getControlVector(
    controlPath: string,
    deadzone = 0.15,
    curve: ResponseCurve = 'linear',
    padIndex?: number,
  ): { x: number; y: number } {
    const control = GamepadDriver.normalizeControl(controlPath);
    if (control === 'leftStick') return this.getStickVector(0, 1, deadzone, curve, padIndex);
    if (control === 'rightStick') return this.getStickVector(2, 3, deadzone, curve, padIndex);
    return { x: 0, y: 0 };
  }

  getStickVector(
    axisX: number,
    axisY: number,
    deadzone = 0.15,
    curve: ResponseCurve = 'linear',
    padIndex?: number,
  ): { x: number; y: number } {
    const rawX = this.getAxisValue(axisX, padIndex);
    const rawY = this.getAxisValue(axisY, padIndex);
    const mag = Math.hypot(rawX, rawY);
    if (mag <= deadzone || mag === 0) return { x: 0, y: 0 };

    const normalized = Math.min(Math.max((mag - deadzone) / (1 - deadzone), 0), 1);
    const scaled = curve === 'expo2'
      ? normalized ** 2
      : curve === 'expo1.3' ? normalized ** 1.3 : normalized;
    return { x: (rawX / mag) * scaled, y: (rawY / mag) * scaled };
  }

  async rumble(padIndex?: number, options: RumbleOptions = {}): Promise<boolean> {
    const pad = this.getGamepad(padIndex);
    if (!pad) return false;
    const actuator = (pad as Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: unknown) => Promise<unknown> } }).vibrationActuator;
    if (typeof actuator?.playEffect !== 'function') return false;
    try {
      await actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: options.durationMs ?? 200,
        weakMagnitude: options.weakMagnitude ?? 0.5,
        strongMagnitude: options.strongMagnitude ?? 0.5,
      });
      return true;
    } catch {
      return false;
    }
  }

  getStatus(): GamepadDeviceInfo[] {
    this.scanConnectedPads();
    return this.readPads().filter((pad): pad is Gamepad => !!pad).map((pad) => this.describe(pad));
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', this.onConnected);
      window.removeEventListener('gamepaddisconnected', this.onDisconnected);
    }
    this.connectedPads.clear();
    for (const listeners of Object.values(this.listeners)) listeners.clear();
  }

  private readPads(): (Gamepad | null)[] {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
    return Array.from(navigator.getGamepads());
  }

  private scanConnectedPads(): void {
    for (const pad of this.readPads()) if (pad?.connected) this.connectedPads.add(pad.index);
  }

  private describe(pad: Gamepad): GamepadDeviceInfo {
    const actuator = (pad as Gamepad & { vibrationActuator?: unknown }).vibrationActuator;
    return {
      index: pad.index,
      id: pad.id,
      connected: pad.connected,
      mapping: pad.mapping,
      layout: pad.mapping === 'standard' ? 'Gamepad' : 'Joystick',
      buttons: pad.buttons.length,
      axes: pad.axes.length,
      haptics: !!actuator,
    };
  }

  private emit(event: GamepadDriverEvent, device: GamepadDeviceInfo): void {
    for (const listener of this.listeners[event]) listener(device);
  }
}
