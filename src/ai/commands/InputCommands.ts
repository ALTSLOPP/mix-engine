import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { GamepadDriver } from '../../input/GamepadDriver';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('input_context_push', (cmd: Extract<AICommand, { type: 'input_context_push' }>) => {
    ctx.input.contexts.push({
      name: cmd.name,
      priority: cmd.priority ?? 10,
      actions: cmd.actions ?? [],
      maskAllBelow: cmd.maskAllBelow,
    });
  });

  map.set('input_context_pop', (cmd: Extract<AICommand, { type: 'input_context_pop' }>) => {
    ctx.input.contexts.pop(cmd.name);
  });

  map.set('input_contexts', (_cmd: Extract<AICommand, { type: 'input_contexts' }>) => {
    return ctx.input.contexts.getContexts();
  });

  map.set('input_action_define', (cmd: Extract<AICommand, { type: 'input_action_define' }>) => {
    ctx.input.defineAction({
      name: cmd.name,
      kind: cmd.kind,
      bindings: cmd.bindings ?? [],
      deadzone: cmd.deadzone,
      responseCurve: cmd.responseCurve,
    }, cmd.context);
  });

  map.set('input_bind', (cmd: Extract<AICommand, { type: 'input_bind' }>) => {
    return ctx.input.contexts.map.bind(cmd.action, cmd.binding);
  });

  map.set('input_unbind', (cmd: Extract<AICommand, { type: 'input_unbind' }>) => {
    return ctx.input.clearActionBindings(cmd.action);
  });

  map.set('input_actions', (_cmd: Extract<AICommand, { type: 'input_actions' }>) => {
    return ctx.input.exportActionAsset();
  });

  map.set('input_remap', (cmd: Extract<AICommand, { type: 'input_remap' }>) => {
    return ctx.input.importActionAsset(cmd.actions, cmd.context);
  });

  map.set('input_action_state', (cmd: Extract<AICommand, { type: 'input_action_state' }>) => {
    return ctx.input.getActionValue(cmd.action);
  });

  map.set('input_gamepad_status', (_cmd: Extract<AICommand, { type: 'input_gamepad_status' }>) => {
    return ctx.input.gamepad.getStatus();
  });

  map.set('input_gamepad_controls', (_cmd: Extract<AICommand, { type: 'input_gamepad_controls' }>) => {
    return GamepadDriver.getControls();
  });

  map.set('input_gamepad_rumble', async (cmd: Extract<AICommand, { type: 'input_gamepad_rumble' }>) => {
    return await ctx.input.gamepad.rumble(cmd.pad, {
      durationMs: cmd.durationMs,
      weakMagnitude: cmd.weakMagnitude,
      strongMagnitude: cmd.strongMagnitude,
    });
  });

  map.set('input_synthetic', (cmd: Extract<AICommand, { type: 'input_synthetic' }>) => {
    ctx.input.synthetic.setAction(cmd.action, cmd.value);
  });
}
