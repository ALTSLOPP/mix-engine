import type { GameplayDef } from '../gameplay';

/**
 * MIX Engine — Save-game bundling.
 *
 * A single named slot that snapshots all the PROGRESS layers an LLM-authored game
 * accumulates: the gameplay definition + its runtime (quests, variables, timers,
 * zone/rule toggles), the inventory bags, the persistent key/value flags, and the
 * player's position. Loading restores them in one call — so games become resumable
 * (save points, load-on-death) without bespoke wiring.
 *
 * Scope note: this saves *logical* progress + player position, not arbitrary physics
 * geometry. A game's static level + spawners are re-created by its authoring/boot (the
 * standard pattern here); anything that must survive should live in a gameplay variable
 * / quest / inventory item, all of which round-trip exactly.
 */

export interface SaveBundle {
  v: 1;
  slot: string;
  savedAt: number;
  /** The loaded gameplay definition (so a load reconstructs the rules without re-running authoring). */
  gameplayDef: GameplayDef | null;
  /** GameplayDirector.serialize() — variables, quest progress, status, timers, toggles. */
  gameplayState: string | null;
  /** Versioned modular gameplay configuration and runtime snapshot. */
  gameplayFeatures?: Record<string, unknown> | null;
  /** InventorySystem.serialize() — every owner's bag. */
  inventory: string;
  /** Persistent key/value flags (excludes the system-owned __gameplay__/__inventory__ mirrors). */
  state: Record<string, unknown>;
  /** Possessed player's WORLD transform, or null if nobody is possessed. */
  player: { pos: [number, number, number]; quat: [number, number, number, number] } | null;
  /** Full mutable world snapshot — entities, transforms, hierarchy, scripts, tags, terrain.
   *  Null on very old saves (pre-world). Present from v1+cloud saves going forward. */
  world?: string | null;
}

export interface SaveSummary {
  slot: string;
  savedAt: number;
  hasGameplay: boolean;
  itemOwners: number;
  stateKeys: number;
  hasPlayer: boolean;
}

export interface SaveHost {
  gameplayDef(): GameplayDef | null;
  /** null when no gameplay def is loaded. */
  gameplaySerialize(): string | null;
  featuresSerialize?(): Record<string, unknown>;
  featuresValidate?(snapshot: Record<string, unknown>): void;
  featuresRestore?(snapshot: Record<string, unknown>): void;
  /** Quiet load — structure only, no `start` rules / autostart (see GameplayDirector.load). */
  gameplayLoad(def: GameplayDef): void;
  gameplayRestore(serialized: string): void;
  inventorySerialize(): string;
  inventoryRestore(serialized: string): void;
  /** Persistent kv store contents (system mirrors are filtered by SaveSystem). */
  stateGetAll(): Record<string, unknown>;
  stateSet(key: string, value: unknown): void;
  getPlayerTransform(): { pos: [number, number, number]; quat: [number, number, number, number] } | null;
  setPlayerTransform(pos: [number, number, number], quat: [number, number, number, number]): void;
  stateClear?(): void;
  /** Full mutable world (entities + hierarchy + scripts + terrain). Optional — older hosts return null. */
  worldSnapshot?(): string | null | Promise<string | null>;
  worldRestore?(snapshot: string): void;
  /** Slot storage (localStorage on the engine). */
  store(slot: string, json: string): void | Promise<void>;
  read(slot: string): string | null;
  listSlots(): string[];
  removeSlot(slot: string): void;
}
