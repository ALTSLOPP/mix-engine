export type ActionKind = 'button' | 'axis1d' | 'axis2d';

export type ResponseCurve = 'linear' | 'expo1.3' | 'expo2';

/**
 * Semantic controls from the standard Web Gamepad layout. Names intentionally
 * match Unity Input System control paths, so an action authored as
 * `<Gamepad>/buttonSouth` can be copied between tools without translating raw
 * button numbers.
 */
export type GamepadControl =
  | 'buttonSouth'
  | 'buttonEast'
  | 'buttonWest'
  | 'buttonNorth'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftTrigger'
  | 'rightTrigger'
  | 'select'
  | 'start'
  | 'leftStickPress'
  | 'rightStickPress'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight'
  | 'home'
  | 'leftStick'
  | 'rightStick'
  | 'leftStick/x'
  | 'leftStick/y'
  | 'rightStick/x'
  | 'rightStick/y';

export type Binding =
  | { device: 'keyboard'; code: string }
  | { device: 'mouse'; button?: number; deltaAxis?: 'x' | 'y'; wheel?: boolean }
  | {
      device: 'gamepad';
      /** Unity-style semantic path, e.g. `<Gamepad>/buttonSouth` or `leftStick`. */
      control?: GamepadControl | string;
      /** Browser gamepad index. Omit to accept the first connected controller. */
      pad?: number;
      button?: number;
      axis?: number;
      invert?: boolean;
      triggerThreshold?: number;
    }
  | { device: 'synthetic' };

export interface ActionDef {
  name: string;
  kind: ActionKind;
  bindings: Binding[];
  deadzone?: number;
  responseCurve?: ResponseCurve;
}

export interface InputContext {
  name: string;
  priority: number;
  actions: ActionDef[];
  maskAllBelow?: boolean;
}

export interface InputActionAsset {
  version: 1;
  actions: ActionDef[];
}

export type ActionValue = boolean | number | { x: number; y: number };
