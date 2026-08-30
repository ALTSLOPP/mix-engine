import type { AICommand } from '../ai/AIBridge';

/**
 * MIX Engine — Items & Inventory schema.
 *
 * The gameplay-logic layer ({@link ../gameplay}) gives a game rules and goals; this
 * layer gives it *stuff* — items the player (or a chest, or an NPC) holds, transfers
 * and uses. Item definitions are declarative data an LLM authors once; a used item's
 * effects are just {@link AICommand}s, so an item reaches the whole engine (heal via
 * combat_apply_damage with negative damage, spawn an explosion, play a sound, open a
 * door by raising a gameplay signal, …) without bespoke code.
 *
 * Inventories are keyed by an OWNER STRING ('player' by default, or any label like
 * 'chest_01' / 'merchant'), deliberately decoupled from numeric entity ids (which are
 * reissued across reloads) so authored games survive save/restore.
 */

/** A registered item type. */
export interface ItemDef {
  id: string;
  /** Display name (defaults to id). */
  name?: string;
  description?: string;
  /** Emoji or image URL for HUD/UI. */
  icon?: string;
  /** Multiple units share one slot (default true). */
  stackable?: boolean;
  /** Max units per stack (default 99; ignored when !stackable ⇒ 1). */
  maxStack?: number;
  /** Free-form tags ('key', 'weapon', 'quest', 'consumable'). */
  tags?: string[];
  /** Removed from the inventory when used (defaults to true iff `onUse` is present). */
  consumable?: boolean;
  /** Effects run when the item is used — any engine commands. */
  onUse?: AICommand[];
  /** Arbitrary gameplay payload (healAmount, damage, value, …) for an authored game. */
  data?: Record<string, unknown>;
}

/** A quantity of one item type within an inventory. */
export interface ItemStack {
  item: string;
  count: number;
}

/** Snapshot of one inventory (for persistence / introspection). */
export interface InventorySnapshot {
  owner: string;
  slots: number | null;
  stacks: ItemStack[];
}
