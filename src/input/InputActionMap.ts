export interface KeyChordBinding {
  type: 'keyboard';
  code: string; // e.g. 'KeyW', 'Space', 'KeyE'
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface MouseBinding {
  type: 'mouse';
  button: number; // 0 = Left, 1 = Middle, 2 = Right
}

export interface GamepadButtonBinding {
  type: 'gamepad_button';
  button: number; // 0 = A, 1 = B, 2 = X, 3 = Y, 4 = LB, 5 = RB, etc.
}

export interface GamepadAxisBinding {
  type: 'gamepad_axis';
  axis: number; // 0 = LX, 1 = LY, 2 = RX, 3 = RY
  direction: 'positive' | 'negative';
  deadzone?: number;
}

export type InputBinding =
  | KeyChordBinding
  | MouseBinding
  | GamepadButtonBinding
  | GamepadAxisBinding;

export interface RawInputState {
  keysDown: Set<string>;
  mouseButtonsDown: Set<number>;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  gamepadButtons?: boolean[];
  gamepadAxes?: number[];
}

/**
 * InputActionMap.ts — Flexible input mapping with chord combinations, analog deadzones, and JSON persistence.
 */
export class InputActionMap {
  private readonly actions = new Map<string, InputBinding[]>();

  /** Bind one or more input sources to an action name. */
  bind(action: string, ...bindings: InputBinding[]): void {
    const list = this.actions.get(action) || [];
    list.push(...bindings);
    this.actions.set(action, list);
  }

  /** Unbind all inputs for an action. */
  unbind(action: string): void {
    this.actions.delete(action);
  }

  /** Check if any binding mapped to the action is currently triggered. */
  isActionPressed(action: string, state: RawInputState): boolean {
    const bindings = this.actions.get(action);
    if (!bindings || bindings.length === 0) return false;

    for (const b of bindings) {
      if (this.evalBinding(b, state)) {
        return true;
      }
    }
    return false;
  }

  /** Get analog action float value (0.0 to 1.0) with deadzone normalization. */
  getActionValue(action: string, state: RawInputState): number {
    const bindings = this.actions.get(action);
    if (!bindings || bindings.length === 0) return 0;

    let maxValue = 0;

    for (const b of bindings) {
      if (b.type === 'gamepad_axis') {
        const rawAxis = state.gamepadAxes?.[b.axis] ?? 0;
        const deadzone = b.deadzone ?? 0.15;
        let val = 0;

        if (b.direction === 'positive' && rawAxis > deadzone) {
          val = (rawAxis - deadzone) / (1.0 - deadzone);
        } else if (b.direction === 'negative' && rawAxis < -deadzone) {
          val = (-rawAxis - deadzone) / (1.0 - deadzone);
        }
        maxValue = Math.max(maxValue, Math.min(1.0, val));
      } else if (this.evalBinding(b, state)) {
        maxValue = Math.max(maxValue, 1.0);
      }
    }

    return maxValue;
  }

  private evalBinding(binding: InputBinding, state: RawInputState): boolean {
    switch (binding.type) {
      case 'keyboard': {
        const hasKey = state.keysDown.has(binding.code);
        if (!hasKey) return false;
        // Exact modifier match. Previously an unmodified binding also fired while a
        // modifier was held, so 'KeyS' (save) and 'Ctrl+KeyS' both triggered on Ctrl+S.
        if (!!binding.ctrl !== !!state.ctrlKey) return false;
        if (!!binding.shift !== !!state.shiftKey) return false;
        if (!!binding.alt !== !!state.altKey) return false;
        return true;
      }
      case 'mouse': {
        return state.mouseButtonsDown.has(binding.button);
      }
      case 'gamepad_button': {
        return !!state.gamepadButtons?.[binding.button];
      }
      case 'gamepad_axis': {
        const rawAxis = state.gamepadAxes?.[binding.axis] ?? 0;
        const deadzone = binding.deadzone ?? 0.2;
        if (binding.direction === 'positive') return rawAxis > deadzone;
        if (binding.direction === 'negative') return rawAxis < -deadzone;
        return false;
      }
    }
  }

  /** Serialize bindings to JSON for savegame settings. */
  exportBindings(): string {
    const obj: Record<string, InputBinding[]> = {};
    for (const [action, list] of this.actions.entries()) {
      obj[action] = list;
    }
    return JSON.stringify(obj, null, 2);
  }

  /** Restore bindings from JSON. */
  importBindings(json: string): void {
    try {
      const obj = JSON.parse(json) as Record<string, InputBinding[]>;
      this.actions.clear();
      for (const [action, list] of Object.entries(obj)) {
        this.actions.set(action, list);
      }
    } catch (err) {
      console.warn('[InputActionMap] Failed to import bindings:', err);
    }
  }
}
