import type { SaveBundle, SaveHost, SaveSummary } from './types';
import { stringifyAsync } from './asyncJson';

/** Keys owned by other systems (mirrored into the kv store) — excluded from the bundle's
 *  `state` because they're captured authoritatively in their own fields. */
const RESERVED_STATE_KEYS = new Set(['__gameplay__', '__inventory__']);

/**
 * SaveSystem — bundles every progress layer into a named slot and restores them in one
 * call. Decoupled from the Engine via {@link SaveHost} so it unit-tests standalone.
 * Synchronous: no scene rebuild (logical state + player position only).
 */
export class SaveSystem {
  constructor(private readonly host: SaveHost) {}

  /** Snapshot the current game into `slot`; returns a summary of what was saved. */
  async save(slot: string): Promise<SaveSummary> {
    const state: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.host.stateGetAll())) {
      if (!RESERVED_STATE_KEYS.has(k)) state[k] = v;
    }
    const bundle: SaveBundle = {
      v: 1,
      slot,
      savedAt: Date.now(),
      gameplayDef: this.host.gameplayDef(),
      gameplayState: this.host.gameplaySerialize(),
      inventory: this.host.inventorySerialize(),
      state,
      player: this.host.getPlayerTransform(),
      world: this.host.worldSnapshot ? await this.host.worldSnapshot() : null,
    };
    await this.host.store(slot, await stringifyAsync(bundle));
    return this.summarize(bundle);
  }

  /** Restore a slot. Returns the summary, or null if the slot is missing/corrupt. */
  load(slot: string): SaveSummary | null {
    const bundle = this.readBundle(slot);
    if (!bundle) return null;

    // 0. Full mutable world first — destroys/moves spawns are authoritative.
    //    If the bundle has no world (old saves), we keep the current scene intact.
    if (bundle.world && this.host.worldRestore) {
      try { this.host.worldRestore(bundle.world); } catch (err) {
        console.warn('[SaveSystem] world restore failed, continuing with inventory/gameplay:', err);
      }
    }

    // Clear persistent state first if supported
    if (this.host.stateClear) {
      this.host.stateClear();
    }

    // 1. Persistent flags first (a gameplay rule's conditions may read them).
    for (const [k, v] of Object.entries(bundle.state ?? {})) this.host.stateSet(k, v);
    // 2. Gameplay: rebuild structure quietly (no start rules), then apply saved runtime.
    if (bundle.gameplayDef) {
      this.host.gameplayLoad(bundle.gameplayDef);
      if (bundle.gameplayState) this.host.gameplayRestore(bundle.gameplayState);
    }
    // 3. Inventory bags.
    if (bundle.inventory) this.host.inventoryRestore(bundle.inventory);
    // 4. Player position.
    if (bundle.player) this.host.setPlayerTransform(bundle.player.pos, bundle.player.quat);

    return this.summarize(bundle);
  }

  /** Summaries of every saved slot (for a load menu). */
  list(): SaveSummary[] {
    const out: SaveSummary[] = [];
    for (const slot of this.host.listSlots()) {
      const b = this.readBundle(slot);
      if (b) out.push(this.summarize(b));
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }

  has(slot: string): boolean { return this.host.read(slot) !== null; }
  remove(slot: string): void { this.host.removeSlot(slot); }

  private readBundle(slot: string): SaveBundle | null {
    const json = this.host.read(slot);
    if (!json) return null;
    try {
      const b = JSON.parse(json) as SaveBundle;
      return b && b.v === 1 ? b : null;
    } catch { return null; }
  }

  private summarize(b: SaveBundle): SaveSummary {
    let itemOwners = 0;
    try { itemOwners = (JSON.parse(b.inventory).inventories ?? []).length; } catch { /* ignore */ }
    return {
      slot: b.slot,
      savedAt: b.savedAt,
      hasGameplay: !!b.gameplayDef,
      itemOwners,
      stateKeys: Object.keys(b.state ?? {}).length,
      hasPlayer: !!b.player,
    };
  }
}
