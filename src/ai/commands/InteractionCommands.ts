import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

/**
 * InteractionCommands — text-first surface for the InteractionSystem. Mark entities as
 * interactable (by id/name/tag) with a prompt + commands; the engine handles proximity,
 * facing, the prompt and the interact key. No-op (with a warning) if no system is wired.
 */
export function register(map: CommandMap, ctx: CmdCtx): void {
  const warn = (cmd: string) =>
    console.warn(`[AIBridge] ${cmd}: interaction system unavailable (no InteractionSystem wired).`);

  map.set('interaction_register', (cmd: Extract<AICommand, { type: 'interaction_register' }>) => {
    if (!ctx.interaction) return warn('interaction_register');
    ctx.interaction.register(cmd.def);
  });

  map.set('interaction_unregister', (cmd: Extract<AICommand, { type: 'interaction_unregister' }>) => {
    if (!ctx.interaction) return warn('interaction_unregister');
    ctx.interaction.unregister(cmd.id);
  });

  map.set('interaction_set_enabled', (cmd: Extract<AICommand, { type: 'interaction_set_enabled' }>) => {
    if (!ctx.interaction) return warn('interaction_set_enabled');
    ctx.interaction.setEnabled(cmd.id, cmd.enabled);
  });

  map.set('interaction_trigger', (cmd: Extract<AICommand, { type: 'interaction_trigger' }>) => {
    if (!ctx.interaction) return warn('interaction_trigger');
    const fired = ctx.interaction.trigger(cmd.id);
    ctx.setQueryResult({ id: cmd.id, fired });
  });

  map.set('interaction_status', () => {
    if (!ctx.interaction) return warn('interaction_status');
    ctx.setQueryResult(ctx.interaction.status());
  });
}
