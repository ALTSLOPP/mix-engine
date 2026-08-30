/**
 * runtime/bootstrap.ts — Clean runtime entry point (no editor, no Vite HMR, no /api).
 *
 * This is the ONLY code that runs in a shipped build (web/PWA/desktop).
 * It boots the Engine from a packaged manifest or .pak and never touches:
 *   - index.html editor panels
 *   - Vite import.meta.hot
 *   - /api/* dev-server endpoints
 *   - filesystem / local project files
 *   - dynamic /games/... imports
 *
 * Usage (web standalone):
 *   import { bootRuntime } from './runtime/bootstrap.js';
 *   await bootRuntime(document.getElementById('canvas-container'), {
 *     manifestUrl: './manifest.json',
 *   });
 *
 * Or directly with an inlined manifest (desktop):
 *   await bootRuntime(container, { manifest });
 */

import * as THREE from 'three';
import { Engine } from '../engine/Engine';
import type { GamePackageManifest } from '../export/GamePackager';
import { VirtualPak } from '../export/VirtualPak';
import { migrateProjectDocument, type ProjectDocument } from '../project/ProjectDocument';

export interface RuntimeOptions {
  /** Inlined manifest (preferred for desktop / embedded). */
  manifest?: GamePackageManifest | ProjectDocument;
  /** URL to fetch a manifest.json from (web standalone). */
  manifestUrl?: string;
  /** URL to fetch a .pak archive from (takes precedence when both are given). */
  pakUrl?: string;
  /** Inline .pak bytes (e.g., baked into the build). */
  pakBytes?: Uint8Array;
  /** Start in play mode? Default true for runtime, false keeps editor mode. */
  autoPlay?: boolean;
  /** Called once the Engine is ready and the scene is loaded. */
  onReady?: (engine: Engine) => void;
  /** Called if boot fails (manifest fetch, pak parse, etc.). */
  onError?: (err: unknown) => void;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function isProjectDocument(obj: any): boolean {
  return obj && typeof obj === 'object' && obj.kind === 'mix-project' && !!obj.scenes;
}

async function applyManifest(engine: Engine, manifest: GamePackageManifest | ProjectDocument): Promise<void> {
  // Visual style
  const style = (manifest as any).visualStyle ?? (manifest as any).visualStyleName;
  if (style && style !== 'default') {
    try { engine.setVisualStyle(style); } catch {}
  }

  // ProjectDocument path (canonical)
  if (isProjectDocument(manifest)) {
    const doc = migrateProjectDocument(manifest as any);
    const entry = doc.entryScene ?? Object.keys(doc.scenes)[0];
    const entities: any[] = (doc.scenes as any)[entry] ?? [];
    const needed = new Set<string>();
    for (const e of entities) {
      const aid = (e.blueprint?.params as any)?.assetId;
      if (typeof aid === 'string') needed.add(aid);
    }
    if (needed.size > 0) {
      const known = [...needed].filter((id) => !!(engine as any).manifest?.get?.(id));
      if (known.length > 0) { try { await (engine as any).manifest.preload(known); } catch {} }
    }
    const sm: any = engine.sceneManager;
    const guidToId = new Map<string, number>();
    for (const ent of entities) {
      const pos = new THREE.Vector3(ent.transform.position[0], ent.transform.position[1], ent.transform.position[2]);
      const id = sm.spawnNow(pos, ent.blueprint, { rootMotion: !!ent.rootMotion });
      guidToId.set(ent.guid, id);
      const rb = sm.getRigidBody(id);
      if (rb) {
        rb.mesh.quaternion.set(ent.transform.quaternion[0], ent.transform.quaternion[1], ent.transform.quaternion[2], ent.transform.quaternion[3]);
        rb.mesh.scale.set(ent.transform.scale[0], ent.transform.scale[1], ent.transform.scale[2]);
        rb.rescaleCollider(); rb.resetInterpolationBuffers(); rb.syncToPhysics();
        try {
          const body = rb.rapierBody; const R = engine.physicsWorld.RAPIER;
          if (ent.transform.bodyType === 'fixed') body.setBodyType(R.RigidBodyType.Fixed, true);
          else if (ent.transform.bodyType === 'kinematic') body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
          else body.setBodyType(R.RigidBodyType.Dynamic, true);
        } catch {}
        if (ent.transform.additionalMass !== undefined) rb.setAdditionalMass(ent.transform.additionalMass);
        if (ent.terrain?.hmBase64 && rb.mesh.userData.terrain) {
          try {
            rb.mesh.userData.terrain.hm.fromBase64(ent.terrain.hmBase64);
            rb.mesh.userData.terrain.rebuildCollider();
            rb.mesh.userData.terrain.applyRect({ i0: 0, i1: rb.mesh.userData.terrain.hm.res - 1, j0: 0, j1: rb.mesh.userData.terrain.hm.res - 1 });
            if (ent.terrain.splatBase64) rb.mesh.userData.terrain.splatMap.fromBase64(ent.terrain.splatBase64);
          } catch {}
        }
        if (ent.tags) for (const t of ent.tags) sm.addTag(id, t);
        if (ent.name) (engine as any).aiBridge?.setEntityName?.(id, ent.name);
        if (ent.scriptSource) try { sm.addScript(id, ent.scriptSource); } catch {}
      }
    }
    for (const ent of entities) {
      if (!ent.parentGuid) continue;
      const cid = guidToId.get(ent.guid);
      const pid = guidToId.get(ent.parentGuid);
      if (cid !== undefined && pid !== undefined) sm.parentEntity(cid, pid);
    }
    if (doc.runtime?.gameplayFeatures) engine.gameplayFeatures.fromJSON(doc.runtime.gameplayFeatures);
    if (doc.environment?.timeOfDay !== undefined) try { engine.setTimeOfDay(doc.environment.timeOfDay); } catch {}
    sm.flushDeferredOperations();
    return;
  }

  // Legacy GamePackageManifest path
  const pkg = manifest as GamePackageManifest;
  const assets: string[] = (pkg as any).assets ?? [];
  if (assets.length > 0) {
    const known = assets.filter((id) => !!(engine as any).manifest?.get?.(id));
    if (known.length > 0) { try { await (engine as any).manifest.preload(known); } catch {} }
  }
  let sceneData: any = (pkg.scenes as any)?.[pkg.entryScene];
  if (!sceneData) {
    const vals = Object.values((pkg.scenes as any) ?? {});
    if (vals.length > 0) sceneData = vals[0];
  }
  if (typeof sceneData === 'string') { try { sceneData = JSON.parse(sceneData); } catch {} }
  const list: any[] = Array.isArray(sceneData) ? sceneData : sceneData?.entities ?? (sceneData ? [sceneData] : []);
  const sm: any = engine.sceneManager;
  for (const desc of list) {
    const bp = desc.blueprint ?? (desc.kind ? { kind: desc.kind, params: desc.params ?? {} } : null);
    const pos = desc.position
      ? Array.isArray(desc.position) ? new THREE.Vector3(desc.position[0], desc.position[1], desc.position[2]) : new THREE.Vector3(desc.position.x ?? 0, desc.position.y ?? 0, desc.position.z ?? 0)
      : desc.transform?.position ? new THREE.Vector3(desc.transform.position[0], desc.transform.position[1], desc.transform.position[2]) : new THREE.Vector3(0, 0.5, 0);
    const quat = desc.quaternion ? new THREE.Quaternion(desc.quaternion[0], desc.quaternion[1], desc.quaternion[2], desc.quaternion[3])
      : desc.transform?.quaternion ? new THREE.Quaternion(desc.transform.quaternion[0], desc.transform.quaternion[1], desc.transform.quaternion[2], desc.transform.quaternion[3]) : undefined;
    let spawnBp = bp;
    if (!spawnBp) spawnBp = { kind: 'box', params: { hx: 0.5, hy: 0.5, hz: 0.5, color: 0x3a4455 } };
    try {
      const id = sm.spawnNow(pos, spawnBp, quat ? { quat } : {});
      if (desc.tags) for (const t of desc.tags) sm.addTag(id, t);
      if (desc.name) (engine as any).aiBridge?.setEntityName?.(id, desc.name);
      if (desc.scriptSource) try { sm.addScript(id, desc.scriptSource); } catch {}
      const rb = sm.getRigidBody(id);
      if (rb && desc.scale) rb.mesh.scale.set(desc.scale[0], desc.scale[1], desc.scale[2]);
    } catch (e) { console.warn('[runtime] spawn failed for', desc, e); }
  }
  sm.flushDeferredOperations();
}

async function applyPak(engine: Engine, pakBytes: Uint8Array): Promise<void> {
  let manifest: any = null;
  try {
    const bytes = VirtualPak.extract(pakBytes, 'manifest.json');
    if (bytes) manifest = JSON.parse(new TextDecoder().decode(bytes));
  } catch {}
  // Also try to read a ProjectDocument if embedded as project.json
  if (!manifest) {
    try {
      const bytes = VirtualPak.extract(pakBytes, 'project.json');
      if (bytes) manifest = JSON.parse(new TextDecoder().decode(bytes));
    } catch {}
  }
  if (manifest) {
    await applyManifest(engine, manifest);
  } else {
    console.warn('[runtime] pak contained no manifest.json / project.json — booting empty');
  }
  // Mount streamed chunks from pak (worlds/chunks/*.bin) via WorldStreamingCoordinator + ChunkManager.
  // Each chunk is extracted and queued for parsing on the next ChunkManager.update().
  try {
    const { entries } = VirtualPak.readTOC(pakBytes);
    for (const [p, entry] of entries) {
      if (!p.startsWith('worlds/chunks/') || !p.endsWith('.bin')) continue;
      const bytes = VirtualPak.extract(pakBytes, p, true);
      if (!bytes) continue;
      // Parse chunk id from path "worlds/chunks/<cx>_<cz>.bin"
      const base = p.slice('worlds/chunks/'.length, -'.bin'.length);
      const [cxStr, czStr] = base.split('_');
      const cx = Number(cxStr), cz = Number(czStr);
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
      // Queue via ChunkManager's parse queue (reuse its internal queue via fetchChunk path is fetch-only,
      // so we directly load the chunk binary into the scene manager for runtime pak boots).
      const chunkId = `${cx},${cz}` as any;
      try { engine.sceneManager.loadChunkFromBinary(chunkId, bytes); } catch {}
    }
  } catch { /* pak without TOC is non-fatal */ }
}

export async function bootRuntime(container: HTMLElement, opts: RuntimeOptions = {}): Promise<Engine> {
  const engine = await Engine.create(container);
  try {
    if (opts.pakBytes) {
      await applyPak(engine, opts.pakBytes);
    } else if (opts.pakUrl) {
      const bytes = await fetchBytes(opts.pakUrl);
      await applyPak(engine, bytes);
    } else if (opts.manifest) {
      await applyManifest(engine, opts.manifest as any);
    } else if (opts.manifestUrl) {
      const data = await fetchJson(opts.manifestUrl);
      await applyManifest(engine, data);
    } else {
      // No packaged data: try conventional locations (web build)
      for (const url of ['./manifest.json', './project.json', './game.json']) {
        try { const data = await fetchJson(url); await applyManifest(engine, data); break; } catch {}
      }
    }

    if (opts.autoPlay !== false) {
      // Enter play mode without editor UI (runtime never shows the editor mode toggle)
      engine.input.setMode('play');
    }

    // Minimal smoke test: ensure we booted something useful
    if (engine.sceneManager.entityCount === 0) {
      console.warn('[runtime] boot produced 0 entities — check your packaged scene');
    }

    opts.onReady?.(engine);
    return engine;
  } catch (err) {
    opts.onError?.(err);
    // Do not leak a headless loop on failure
    try { engine.dispose(); } catch {}
    throw err;
  }
}
