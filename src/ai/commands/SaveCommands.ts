import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

/**
 * SaveCommands — text-first save-game bundling. `save_game`/`load_game` snapshot &
 * restore all progress layers (gameplay def+runtime, inventory, persistent flags,
 * player position) under a named slot. Distinct from `save_scene` (scene geometry to
 * disk) and `save_state_snapshot` (kv-only). No-op (with a warning) if no system wired.
 */
export function register(map: CommandMap, ctx: CmdCtx): void {
  const warn = (cmd: string) =>
    console.warn(`[AIBridge] ${cmd}: save system unavailable (no SaveSystem wired).`);

  map.set('save_game', (cmd: Extract<AICommand, { type: 'save_game' }>) => {
    if (!ctx.saves) return warn('save_game');
    void ctx.trackAsync(ctx.saves.save(cmd.slot).then((summary) => {
      ctx.setQueryResult(summary);
    }));
  });

  map.set('load_game', (cmd: Extract<AICommand, { type: 'load_game' }>) => {
    if (!ctx.saves) return warn('load_game');
    const summary = ctx.saves.load(cmd.slot);
    ctx.setQueryResult(summary ?? { error: `no save in slot '${cmd.slot}'` });
  });

  map.set('list_saves', () => {
    if (!ctx.saves) return warn('list_saves');
    ctx.setQueryResult(ctx.saves.list());
  });

  map.set('delete_save', (cmd: Extract<AICommand, { type: 'delete_save' }>) => {
    if (!ctx.saves) return warn('delete_save');
    ctx.saves.remove(cmd.slot);
  });
}
