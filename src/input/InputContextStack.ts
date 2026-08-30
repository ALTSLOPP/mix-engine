import type { ActionDef, ActionValue, Binding, InputContext } from './types';
import { ActionMap, type RawInputState } from './ActionMap';
import type { GamepadDriver } from './GamepadDriver';
import type { SyntheticActionDriver } from './SyntheticActionDriver';

export class InputContextStack {
  private stack: InputContext[] = [];
  private readonly actionMap = new ActionMap();

  get map(): ActionMap {
    return this.actionMap;
  }

  /** Define an action and make it visible to evaluation in the requested context. */
  defineAction(def: ActionDef, contextName = 'OnFoot'): void {
    const context = this.stack.find((entry) => entry.name === contextName);
    if (!context) {
      this.stack.push({ name: contextName, priority: 0, actions: [def] });
      this.stack.sort((a, b) => b.priority - a.priority);
      this.syncActionMap();
      return;
    }
    const index = context.actions.findIndex((action) => action.name === def.name);
    if (index === -1) context.actions.push(def);
    else context.actions[index] = def;
    this.syncActionMap();
  }

  replaceActions(actions: ActionDef[], contextName = 'OnFoot'): void {
    const context = this.stack.find((entry) => entry.name === contextName);
    if (context) {
      context.actions = [];
    }
    for (const action of actions) this.defineAction(action, contextName);
    this.syncActionMap();
  }

  push(context: InputContext): void {
    // Avoid duplicate insertions
    this.pop(context.name);

    this.stack.push(context);
    // Sort descending by priority
    this.stack.sort((a, b) => b.priority - a.priority);
    this.syncActionMap();
  }

  pop(contextName?: string): void {
    if (!contextName) {
      const removed = this.stack.shift();
      if (removed) this.syncActionMap();
      return;
    }
    const idx = this.stack.findIndex((c) => c.name === contextName);
    if (idx !== -1) {
      this.stack.splice(idx, 1);
      this.syncActionMap();
    }
  }

  has(contextName: string): boolean {
    return this.stack.some((c) => c.name === contextName);
  }

  getContexts(): InputContext[] {
    return [...this.stack];
  }

  /** Rebuild effective definitions so popping an overlay restores lower bindings. */
  private syncActionMap(): void {
    this.actionMap.clear();
    // Stack is high-to-low priority. Define low first so higher contexts override
    // only actions with matching names while lower actions remain available.
    for (const context of [...this.stack].reverse()) {
      for (const action of context.actions) this.actionMap.defineAction(action);
    }
  }

  evaluate(
    actionName: string,
    rawInput: RawInputState,
    gamepadDriver: GamepadDriver,
    syntheticDriver: SyntheticActionDriver,
    device?: Binding['device'],
  ): ActionValue {
    // 1. Synthetic overrides evaluate first regardless of mask
    const syn = syntheticDriver.getAction(actionName);
    if ((!device || device === 'synthetic') && syn !== undefined) {
      return syn;
    }

    // 2. Traverse context stack from highest priority to lowest
    for (const ctx of this.stack) {
      const hasAction = ctx.actions.some((a) => a.name === actionName);
      if (hasAction) {
        return this.actionMap.evaluateAction(actionName, rawInput, gamepadDriver, syntheticDriver, device);
      }
      if (ctx.maskAllBelow) {
        // Higher priority context masks lower actions
        break;
      }
    }

    return false;
  }
}
