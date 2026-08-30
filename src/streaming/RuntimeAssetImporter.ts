/**
 * RuntimeAssetImporter.ts — download + cache third-party assets at runtime.
 *
 * The AssetManifest is static — assets must be pre-registered before the engine loads
 * them. For an AI-native engine where an LLM might say "download this GLB from a URL
 * and spawn it", we need a runtime import pipeline that:
 *   1. Fetches the asset from a URL (any reachable HTTP URL, not just /public/).
 *   2. Caches the ArrayBuffer in IndexedDB so a re-load is instant + works offline.
 *   3. Registers it with the AssetManifest so it can be spawned by id.
 *
 * This module handles steps 1–2; step 3 is the caller's responsibility (the AIBridge
 * `import_asset` command does all three). The IndexedDB store is `mix-engine-assets`,
 * keyed by the asset URL. A cache hit returns the stored ArrayBuffer; a miss fetches +
 * caches. The cache survives across sessions (IndexedDB is persistent).
 */

const DB_NAME = 'mix-engine-assets';
const STORE = 'assets';
const DB_VERSION = 1;

export class RuntimeAssetImporter {
  private db: IDBDatabase | null = null;

  /** Open (or create) the IndexedDB database. Called once on first use. */
  private openDB(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => { this.db = req.result; resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
  }

  /** Import an asset from a URL. Returns the ArrayBuffer (cached or freshly fetched).
   *  `id` is the manifest id the caller will register the asset under. */
  async importAsset(id: string, url: string): Promise<ArrayBuffer> {
    const db = await this.openDB();
    // Try the cache first.
    const cached = await this.getFromCache(db, id);
    if (cached) return cached;
    // Fetch + cache.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to import asset '${id}' from '${url}': HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    await this.putInCache(db, id, buffer);
    return buffer;
  }

  private getFromCache(db: IDBDatabase, id: string): Promise<ArrayBuffer | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  private putInCache(db: IDBDatabase, id: string, buffer: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(buffer, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** List all cached asset ids (for the HELM `import_status` op). */
  async listCached(): Promise<string[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
  }

  /** Clear a cached asset (or all if id is omitted). */
  async clearCache(id?: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (id) tx.objectStore(STORE).delete(id);
      else tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  dispose(): void {
    this.db?.close();
    this.db = null;
  }
}
