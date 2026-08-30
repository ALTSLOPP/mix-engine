import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { DEFAULT_OWNER } from '../../items';

/**
 * InventoryCommands — text-first surface for the Items & Inventory system. An LLM
 * defines item types once (`item_define`, with `onUse` effects), then gives/removes/
 * transfers/uses them by owner string ('player' by default). All no-op (with a warning)
 * if the inventory system wasn't injected.
 */
export function register(map: CommandMap, ctx: CmdCtx): void {
  const warn = (cmd: string) =>
    console.warn(`[AIBridge] ${cmd}: inventory system unavailable (no InventorySystem wired).`);

  map.set('item_define', (cmd: Extract<AICommand, { type: 'item_define' }>) => {
    if (!ctx.items) return warn('item_define');
    ctx.items.define(cmd.def);
  });

  map.set('inventory_give', (cmd: Extract<AICommand, { type: 'inventory_give' }>) => {
    if (!ctx.items) return warn('inventory_give');
    const added = ctx.items.give(cmd.owner ?? DEFAULT_OWNER, cmd.item, cmd.count ?? 1);
    ctx.setQueryResult({ owner: cmd.owner ?? DEFAULT_OWNER, item: cmd.item, added });
  });

  map.set('inventory_remove', (cmd: Extract<AICommand, { type: 'inventory_remove' }>) => {
    if (!ctx.items) return warn('inventory_remove');
    const removed = ctx.items.take(cmd.owner ?? DEFAULT_OWNER, cmd.item, cmd.count ?? 1);
    ctx.setQueryResult({ owner: cmd.owner ?? DEFAULT_OWNER, item: cmd.item, removed });
  });

  map.set('inventory_transfer', (cmd: Extract<AICommand, { type: 'inventory_transfer' }>) => {
    if (!ctx.items) return warn('inventory_transfer');
    const moved = ctx.items.transfer(cmd.from, cmd.to, cmd.item, cmd.count ?? 1);
    ctx.setQueryResult({ from: cmd.from, to: cmd.to, item: cmd.item, moved });
  });

  map.set('inventory_use', (cmd: Extract<AICommand, { type: 'inventory_use' }>) => {
    if (!ctx.items) return warn('inventory_use');
    const used = ctx.items.use(cmd.owner ?? DEFAULT_OWNER, cmd.item);
    ctx.setQueryResult({ owner: cmd.owner ?? DEFAULT_OWNER, item: cmd.item, used });
  });

  map.set('inventory_list', (cmd: Extract<AICommand, { type: 'inventory_list' }>) => {
    if (!ctx.items) return warn('inventory_list');
    if (cmd.owner) ctx.setQueryResult({ owner: cmd.owner, items: ctx.items.list(cmd.owner) });
    else ctx.setQueryResult(ctx.items.status());
  });

  map.set('inventory_clear', (cmd: Extract<AICommand, { type: 'inventory_clear' }>) => {
    if (!ctx.items) return warn('inventory_clear');
    ctx.items.clear(cmd.owner ?? DEFAULT_OWNER);
  });
}
