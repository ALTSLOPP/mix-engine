import type { ActionDef, ActionValue, Binding } from './types';
import type { GamepadDriver } from './GamepadDriver';
import type { SyntheticActionDriver } from './SyntheticActionDriver';

export interface RawInputState {
  isKeyDown: (code: string) => boolean;
  isMouseButtonDown: (button: number) => boolean;
  mouseDeltaX?: number;
  mouseDeltaY?: number;
}

export class ActionMap {
  private readonly actions = new Map<string, ActionDef>();

  defineAction(def: ActionDef): void {
    this.actions.set(def.name, def);
  }

  getAction(name: string): ActionDef | undefined {
    return this.actions.get(name);
  }

  removeAction(name: string): boolean {
    return this.actions.delete(name);
  }

  clear(): void {
    this.actions.clear();
  }

  getActions(): ActionDef[] {
    return [...this.actions.values()].map((action) => ({
      ...action,
      bindings: action.bindings.map((binding) => ({ ...binding })),
    }));
  }

  bind(actionName: string, binding: Binding): boolean {
    const act = this.actions.get(actionName);
    if (act) {
      act.bindings.push(binding);
      return true;
    }
    return false;
  }

  replaceBindings(actionName: string, bindings: Binding[]): boolean {
    const action = this.actions.get(actionName);
    if (!action) return false;
    action.bindings = bindings.map((binding) => ({ ...binding }));
    return true;
  }

  unbind(actionName: string): boolean {
    return this.replaceBindings(actionName, []);
  }

  evaluateAction(
    actionName: string,
    rawInput: RawInputState,
    gamepadDriver: GamepadDriver,
    syntheticDriver: SyntheticActionDriver,
    device?: Binding['device'],
  ): ActionValue {
    // 1. Synthetic override takes highest precedence if set
    const synVal = syntheticDriver.getAction(actionName);
    if ((!device || device === 'synthetic') && synVal !== undefined) {
      return synVal;
    }

    const def = this.actions.get(actionName);
    if (!def) {
      return false;
    }

    if (def.kind === 'button') {
      for (const b of def.bindings) {
        if (device && b.device !== device) continue;
        if (b.device === 'keyboard' && rawInput.isKeyDown(b.code)) {
          return true;
        }
        if (b.device === 'mouse' && b.button !== undefined && rawInput.isMouseButtonDown(b.button)) {
          return true;
        }
        if (b.device === 'gamepad') {
          if (b.control && gamepadDriver.isControlPressed(b.control, b.pad, b.triggerThreshold ?? 0.5)) {
            return true;
          }
          if (b.button !== undefined && gamepadDriver.isButtonPressed(b.button, b.pad)) {
            return true;
          }
          if (b.axis !== undefined) {
            const val = gamepadDriver.getAxisValue(b.axis, b.pad);
            const thresh = b.triggerThreshold ?? 0.5;
            if (Math.abs(val) > thresh) return true;
          }
        }
      }
      return false;
    }

    if (def.kind === 'axis2d') {
      let x = 0;
      let y = 0;

      for (const b of def.bindings) {
        if (device && b.device !== device) continue;
        if (b.device === 'keyboard') {
          if (b.code === 'KeyW' || b.code === 'ArrowUp') {
            if (rawInput.isKeyDown(b.code)) y -= 1;
          } else if (b.code === 'KeyS' || b.code === 'ArrowDown') {
            if (rawInput.isKeyDown(b.code)) y += 1;
          } else if (b.code === 'KeyA' || b.code === 'ArrowLeft') {
            if (rawInput.isKeyDown(b.code)) x -= 1;
          } else if (b.code === 'KeyD' || b.code === 'ArrowRight') {
            if (rawInput.isKeyDown(b.code)) x += 1;
          }
        } else if (b.device === 'gamepad' && (b.control || b.axis !== undefined)) {
          const stick = b.control
            ? gamepadDriver.getControlVector(b.control, def.deadzone, def.responseCurve, b.pad)
            : gamepadDriver.getStickVector(
              b.axis!,
              b.axis! + 1,
              def.deadzone ?? 0.15,
              def.responseCurve ?? 'linear',
              b.pad,
            );
          x += stick.x;
          y += stick.y;
        } else if (b.device === 'mouse') {
          if ((!b.deltaAxis || b.deltaAxis === 'x') && rawInput.mouseDeltaX !== undefined) x += rawInput.mouseDeltaX;
          if ((!b.deltaAxis || b.deltaAxis === 'y') && rawInput.mouseDeltaY !== undefined) y += rawInput.mouseDeltaY;
        }
      }

      const len = Math.hypot(x, y);
      if (len > 1.0) {
        x /= len;
        y /= len;
      }
      return { x, y };
    }

    if (def.kind === 'axis1d') {
      let val = 0;
      for (const b of def.bindings) {
        if (device && b.device !== device) continue;
        if (b.device === 'keyboard' && rawInput.isKeyDown(b.code)) {
          val = 1.0;
        } else if (b.device === 'gamepad') {
          if (b.control) {
            val = gamepadDriver.getControlValue(b.control, b.pad);
            if (b.invert) val = -val;
          } else if (b.axis !== undefined) {
            val = gamepadDriver.getAxisValue(b.axis, b.pad);
            if (b.invert) val = -val;
          } else if (b.button !== undefined) {
            val = gamepadDriver.getButtonValue(b.button, b.pad);
          }
        }
      }
      return val;
    }

    return false;
  }
}
