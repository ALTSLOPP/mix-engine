import type { ItemDef, ItemStack, InventorySnapshot } from './types';

/**
 * Inventory — a single owner's bag of item stacks. Pure data structure (no engine
 * dependency) so it unit-tests standalone. Capacity is expressed as a SLOT count
 * (distinct stacks); per-stack size is bounded by each item's `maxStack`.
 *
 * `add`/`remove` return the amount ACTUALLY moved (capacity- and stack-limited), so a
 * caller can detect a partial pickup ("inventory full") rather than silently losing
 * items.
 */
export class Inventory {
  readonly owner: string;
  /** Max distinct stacks, or null for unlimited. */
  private slots: number | null;
  private readonly stacks: ItemStack[] = [];

  constructor(owner: string, opts: { slots?: number | null } = {}) {
    this.owner = owner;
    this.slots = opts.slots ?? null;
  }

  /** Add up to `count`; returns the amount actually added (≤ count when capacity-bound). */
  add(item: string, count: number, def?: ItemDef): number {
    if (count <= 0) return 0;
    const stackable = def?.stackable !== false;
    const maxStack = !stackable ? 1 : Math.max(1, def?.maxStack ?? 99);
    let remaining = count;

    if (stackable) {
      // Top up existing stacks first.
      for (const s of this.stacks) {
        if (s.item !== item || remaining <= 0) continue;
        const room = maxStack - s.count;
        if (room <= 0) continue;
        const moved = Math.min(room, remaining);
        s.count += moved;
        remaining -= moved;
      }
    }
    // Open new stacks for the overflow.
    while (remaining > 0 && (this.slots === null || this.stacks.length < this.slots)) {
      const moved = Math.min(maxStack, remaining);
      this.stacks.push({ item, count: moved });
      remaining -= moved;
    }
    return count - remaining;
  }

  /** Remove up to `count`; returns the amount actually removed. */
  remove(item: string, count: number): number {
    if (count <= 0) return 0;
    let remaining = count;
    for (let i = this.stacks.length - 1; i >= 0 && remaining > 0; i--) {
      const s = this.stacks[i];
      if (s.item !== item) continue;
      const moved = Math.min(s.count, remaining);
      s.count -= moved;
      remaining -= moved;
      if (s.count <= 0) this.stacks.splice(i, 1);
    }
    return count - remaining;
  }

  count(item: string): number {
    let n = 0;
    for (const s of this.stacks) if (s.item === item) n += s.count;
    return n;
  }

  has(item: string, count = 1): boolean {
    return this.count(item) >= count;
  }

  /** Distinct item types currently held. */
  get isEmpty(): boolean { return this.stacks.length === 0; }

  /** Merged view: one entry per item type (stacks of the same item combined). */
  list(): ItemStack[] {
    const merged = new Map<string, number>();
    for (const s of this.stacks) merged.set(s.item, (merged.get(s.item) ?? 0) + s.count);
    return [...merged.entries()].map(([item, count]) => ({ item, count }));
  }

  clear(): void { this.stacks.length = 0; }

  setSlots(slots: number | null): void { this.slots = slots; }

  snapshot(): InventorySnapshot {
    return { owner: this.owner, slots: this.slots, stacks: this.list() };
  }

  restore(snap: InventorySnapshot, defs?: (id: string) => ItemDef | undefined): void {
    this.slots = snap.slots;
    this.stacks.length = 0;
    for (const s of snap.stacks) this.add(s.item, s.count, defs?.(s.item));
  }
}
