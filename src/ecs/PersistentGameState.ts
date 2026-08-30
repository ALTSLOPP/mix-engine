const STORAGE_PREFIX = 'mix_engine_state_';

export class PersistentGameState {
  private readonly store = new Map<string, unknown>();
  private readonly storageKey: string;

  constructor(namespace = 'default') {
    this.storageKey = `${STORAGE_PREFIX}${namespace}`;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [k, v] of Object.entries(parsed)) {
            this.store.set(k, v);
          }
        }
      }
    } catch {
      // localStorage unavailable or corrupt — start fresh
    }
  }

  private saveToStorage(): void {
    try {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of this.store) {
        obj[k] = v;
      }
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch {
      // localStorage full or unavailable — silently fail
    }
  }

  getItem<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  setItem(key: string, value: unknown): void {
    this.store.set(key, value);
    this.saveToStorage();
  }

  removeItem(key: string): void {
    this.store.delete(key);
    this.saveToStorage();
  }

  clear(): void {
    this.store.clear();
    this.saveToStorage();
  }

  getAll(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.store) {
      obj[k] = v;
    }
    return obj;
  }

  /** Serialise the entire state to a JSON-safe object for export/snapshot. */
  snapshot(): string {
    return JSON.stringify(this.getAll());
  }

  /** Load a snapshot (replaces all current data). */
  loadSnapshot(json: string): void {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed === 'object' && parsed !== null) {
        this.store.clear();
        for (const [k, v] of Object.entries(parsed)) {
          this.store.set(k, v);
        }
        this.saveToStorage();
      }
    } catch {
      // invalid JSON — ignore
    }
  }

  /** Save a named snapshot to a separate localStorage key. */
  saveSnapshot(name: string): void {
    try {
      localStorage.setItem(`${this.storageKey}_snap_${name}`, this.snapshot());
    } catch {
      // storage unavailable
    }
  }

  /** Restore state from a named snapshot. */
  loadSnapshotByName(name: string): boolean {
    try {
      const raw = localStorage.getItem(`${this.storageKey}_snap_${name}`);
      if (!raw) return false;
      this.loadSnapshot(raw);
      return true;
    } catch {
      return false;
    }
  }

  /** List all named snapshots. */
  listSnapshots(): string[] {
    const snaps: string[] = [];
    const prefix = `${this.storageKey}_snap_`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) {
        snaps.push(k.slice(prefix.length));
      }
    }
    return snaps;
  }
}
