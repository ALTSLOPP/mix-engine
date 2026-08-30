import { Inventory } from './Inventory';
import type { ItemDef, ItemStack } from './types';
import type { AICommand } from '../ai/AIBridge';

export const DEFAULT_OWNER = 'player';

export interface InventoryHost {
  /** Run an engine command (drives item `onUse` effects). */
  execute(cmd: AICommand): void;
  /** Raise a bus event so the gameplay director + scripts can react. */
  emit(event: string, data?: unknown): void;
  /** Persist the serialized inventory state (optional). */
  persist?(serialized: string): void;
}

/**
 * InventorySystem — engine-facing manager for {@link ItemDef}s and per-owner
 * {@link Inventory} bags. Decoupled from Engine via {@link InventoryHost} (so it
 * unit-tests standalone like the gameplay director).
 *
 * Emits three EventBus signals the gameplay layer turns into first-class triggers:
 *   - `item_acquired` { owner, item, count, total }
 *   - `item_removed`  { owner, item, count, total }
 *   - `item_used`     { owner, item, def }
 */
export class InventorySystem {
  private readonly host: InventoryHost;
  private readonly defs = new Map<string, ItemDef>();
  private readonly inventories = new Map<string, Inventory>();

  constructor(host: InventoryHost) {
    this.host = host;
  }

  // ── Definitions ─────────────────────────────────────────────────────────────

  define(def: ItemDef): void {
    this.defs.set(def.id, def);
  }

  getDef(id: string): ItemDef | undefined { return this.defs.get(id); }

  // ── Inventories ─────────────────────────────────────────────────────────────

  /** Get (lazily creating) an owner's inventory. */
  inventoryOf(owner = DEFAULT_OWNER, slots?: number | null): Inventory {
    let inv = this.inventories.get(owner);
    if (!inv) {
      inv = new Inventory(owner, { slots: slots ?? null });
      this.inventories.set(owner, inv);
    } else if (slots !== undefined) {
      inv.setSlots(slots);
    }
    return inv;
  }

  // ── Operations ──────────────────────────────────────────────────────────────

  /** Add items to an owner. Returns the amount actually added (capacity-limited). */
  give(owner: string, item: string, count = 1): number {
    const inv = this.inventoryOf(owner);
    const added = inv.add(item, count, this.defs.get(item));
    if (added > 0) {
      this.persist();
      this.host.emit('item_acquired', { owner, item, count: added, total: inv.count(item) });
    }
    return added;
  }

  /** Remove items from an owner. Returns the amount actually removed. */
  take(owner: string, item: string, count = 1): number {
    const inv = this.inventoryOf(owner);
    const removed = inv.remove(item, count);
    if (removed > 0) {
      this.persist();
      this.host.emit('item_removed', { owner, item, count: removed, total: inv.count(item) });
    }
    return removed;
  }

  /** Move items between owners; returns the amount actually transferred (bounded by
   *  both the source's stock and the destination's capacity — partial transfers roll
   *  back into the source so no items vanish). */
  transfer(from: string, to: string, item: string, count = 1): number {
    const src = this.inventoryOf(from);
    const have = Math.min(count, src.count(item));
    if (have <= 0) return 0;
    src.remove(item, have);
    const added = this.inventoryOf(to).add(item, have, this.defs.get(item));
    if (added < have) src.add(item, have - added, this.defs.get(item)); // refund overflow
    if (added > 0) {
      this.persist();
      this.host.emit('item_removed', { owner: from, item, count: added, total: src.count(item) });
      this.host.emit('item_acquired', { owner: to, item, count: added, total: this.inventoryOf(to).count(item) });
    }
    return added;
  }

  /**
   * Use one unit of an item: runs its `onUse` commands, consumes it if consumable,
   * and emits `item_used`. Returns false if the owner doesn't hold the item.
   */
  use(owner: string, item: string): boolean {
    const inv = this.inventoryOf(owner);
    if (!inv.has(item, 1)) return false;
    const def = this.defs.get(item);
    const consumable = def?.consumable ?? !!def?.onUse;
    if (def?.onUse) for (const cmd of def.onUse) this.host.execute(cmd);
    if (consumable) inv.remove(item, 1);
    this.persist();
    this.host.emit('item_used', { owner, item, def });
    return true;
  }

  has(owner: string, item: string, count = 1): boolean {
    return this.inventories.get(owner)?.has(item, count) ?? false;
  }

  count(owner: string, item: string): number {
    return this.inventories.get(owner)?.count(item) ?? 0;
  }

  list(owner = DEFAULT_OWNER): ItemStack[] {
    return this.inventories.get(owner)?.list() ?? [];
  }

  clear(owner: string): void {
    this.inventories.get(owner)?.clear();
    this.persist();
  }

  /** Full introspection payload (every owner's bag + the registered item count). */
  status(): {
    itemCount: number;
    owners: Array<{ owner: string; slots: number | null; items: ItemStack[] }>;
  } {
    return {
      itemCount: this.defs.size,
      owners: [...this.inventories.values()].map((inv) => {
        const snap = inv.snapshot();
        return { owner: snap.owner, slots: snap.slots, items: snap.stacks };
      }),
    };
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  serialize(): string {
    return JSON.stringify({
      v: 1,
      inventories: [...this.inventories.values()].map((inv) => inv.snapshot()),
    });
  }

  restore(serialized: string): void {
    let s: any;
    try { s = JSON.parse(serialized); } catch { return; }
    if (!s || s.v !== 1) return;
    this.inventories.clear();
    for (const snap of s.inventories ?? []) {
      const inv = new Inventory(snap.owner, { slots: snap.slots });
      inv.restore(snap, (id) => this.defs.get(id));
      this.inventories.set(snap.owner, inv);
    }
  }

  private persist(): void {
    this.host.persist?.(this.serialize());
  }

  dispose(): void {
    this.defs.clear();
    this.inventories.clear();
  }
}
