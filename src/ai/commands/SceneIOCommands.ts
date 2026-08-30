import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import type { EntityId } from '../../ecs/SceneManager';
import { GLOBAL_CHUNK } from '../../streaming/chunkMath';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('save_scene', (cmd: Extract<AICommand, { type: 'save_scene' }>) => {
    void ctx.trackAsync(saveScene(cmd.name ?? 'world', ctx));
  });

  map.set('load_scene', (cmd: Extract<AICommand, { type: 'load_scene' }>) => {
    void ctx.trackAsync(loadScene(cmd.name ?? 'world', ctx));
  });
}

async function saveScene(name: string, ctx: CmdCtx): Promise<void> {
  const dirty = [...ctx.sceneManager.dirtyChunks];
  const chunks: Record<string, string> = {};
  for (const id of dirty) {
    chunks[id] = uint8ToBase64(ctx.sceneManager.exportChunkToBinary(id));
  }
  const snapshot = {
    version: 2,
    offset: ctx.worldOrigin.offset.toArray(),
    chunks,
    globals: uint8ToBase64(ctx.sceneManager.exportGlobalsToBinary()),
    ai: {} as Record<string, unknown>,
    savedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(`/api/save-world?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ctx.sceneManager.clearDirty();
  } catch (devErr) {
    try {
      await saveToIndexedDB(name, snapshot);
      ctx.sceneManager.clearDirty();
    } catch (idbErr) {
      console.warn('[AIBridge] save_scene failed (dev + IndexedDB):', devErr, idbErr);
    }
  }
}

async function loadScene(name: string, ctx: CmdCtx): Promise<void> {
  let snapshot: { chunks?: Record<string, string>; globals?: string; offset?: number[] } | null = null;
  try {
    const res = await fetch(`/api/load-world?name=${encodeURIComponent(name)}`);
    if (res.ok) snapshot = await res.json();
  } catch {
    // dev endpoint absent in prod; fall through to IndexedDB.
  }
  if (!snapshot) {
    snapshot = (await loadFromIndexedDB(name).catch(() => null)) as {
      chunks?: Record<string, string>;
      globals?: string;
      offset?: number[];
    } | null;
  }
  if (!snapshot) {
    console.warn(`[AIBridge] load_scene: no snapshot named '${name}' found`);
    return;
  }

  // Clear current scene
  const sm = ctx.sceneManager as unknown as {
    entities: Set<EntityId>;
    requestDestroy: (id: EntityId) => void;
  };
  for (const id of [...sm.entities]) sm.requestDestroy(id);
  ctx.entityNames.clear();
  ctx.followers.length = 0;
  ctx.worldOrigin.offset.set(0, 0, 0);

  const idMap = new Map<EntityId, EntityId>();
  const relations: { childOldId: EntityId; parentOldId: EntityId }[] = [];
  if (snapshot.globals) {
    const bytes = base64ToUint8(snapshot.globals);
    try {
      ctx.sceneManager.loadChunkFromBinary(GLOBAL_CHUNK, bytes, idMap, relations);
      ctx.chunkManager?.markLoaded(GLOBAL_CHUNK);
    } catch (err) {
      console.warn('[AIBridge] load_scene globals failed:', err);
    }
  }
  if (snapshot.chunks) {
    for (const [id, b64] of Object.entries(snapshot.chunks)) {
      try {
        ctx.sceneManager.loadChunkFromBinary(id, base64ToUint8(b64), idMap, relations);
        ctx.chunkManager?.markLoaded(id);
      } catch (err) {
        console.warn(`[AIBridge] load_scene chunk ${id} failed:`, err);
      }
    }
  }
  for (const rel of relations) {
    const childNew = idMap.get(rel.childOldId);
    const parentNew = idMap.get(rel.parentOldId);
    if (childNew !== undefined && parentNew !== undefined) {
      ctx.sceneManager.parentEntity(childNew, parentNew);
    }
  }
  ctx.sceneManager.clearDirty();
}

function saveToIndexedDB(name: string, snapshot: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('mix-engine-worlds', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('worlds');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('worlds', 'readwrite');
      tx.objectStore('worlds').put(snapshot, name);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function loadFromIndexedDB(name: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('mix-engine-worlds', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('worlds');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('worlds', 'readonly');
      const req = tx.objectStore('worlds').get(name);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => reject(req.error);
    };
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
