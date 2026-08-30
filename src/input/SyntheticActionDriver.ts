import type { ActionValue } from './types';

/**
 * Programmatic action driver enabling deterministic automated testing,
 * SENSORIUM scenario runs, and HELM remote control without native OS window focus.
 */
export class SyntheticActionDriver {
  private readonly actions = new Map<string, ActionValue>();

  setAction(name: string, value: ActionValue): void {
    this.actions.set(name, value);
  }

  pressAction(name: string): void {
    this.actions.set(name, true);
  }

  releaseAction(name: string): void {
    this.actions.set(name, false);
  }

  getAction(name: string): ActionValue | undefined {
    return this.actions.get(name);
  }

  clear(): void {
    this.actions.clear();
  }
}
