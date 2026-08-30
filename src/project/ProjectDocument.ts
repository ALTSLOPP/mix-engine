import * as THREE from 'three';

/**
 * Canonical Project Document — the single source of truth for a MIX game.
 *
 * Replaces the ad-hoc scene.json { entities: [...] } + localStorage saves
 * with a versioned, GUID-stable, migration-aware schema that captures
 * entities, hierarchy, scripts, assets, world chunks, input and gameplay.
 * Numeric runtime IDs are NEVER persisted — every entity carries a stable
 * GUID that survives reload, streaming, and multiplayer replication.
 */

export const PROJECT_DOCUMENT_VERSION = 3;
export const PROJECT_DOCUMENT_KIND = 'mix-project';

function genGuid(): string {
  try {
    // Prefer crypto.randomUUID when available (browser + Node 19+)
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  // Fallback: uuid v4-ish
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Entity ──────────────────────────────────────────────────────────────
export interface EntityRecord {
  /** Stable GUID — the identity that persists across saves, streaming, and net. */
  guid: string;
  /** Legacy numeric id at author time (kept for migration, never used as identity). */
  legacyId?: number;
  /** Logical parent GUID, if any. */
  parentGuid?: string | null;
  name?: string;
  tags?: string[];
  blueprint: { kind: string; params: Record<string, unknown> };
  /** World-space transform at serialization time. */
  transform: {
    position: [number, number, number];
    quaternion: [number, number, number, number];
    scale: [number, number, number];
    bodyType?: 'dynamic' | 'fixed' | 'kinematic';
    additionalMass?: number;
  };
  /** Modular components (CharacterLocomotor, Script state, etc). Opaque per-type blob. */
  components?: Record<string, unknown>;
  /** Script source attached via SceneManager.addScript, if any. */
  scriptSource?: string | null;
  /** Per-entity ScriptComponent self state (persisted when available). */
  scriptSelf?: Record<string, unknown> | null;
  /** Root-motion flag. */
  rootMotion?: boolean;
  /** Terrain height/splat blobs when kind === 'terrain'. */
  terrain?: { hmBase64?: string; splatBase64?: string } | null;
  /** Chunk that owns this entity (null → global). */
  chunkId?: string | null;
}

// ── Asset reference ─────────────────────────────────────────────────────
export interface AssetRef {
  guid: string;
  path: string;
  type: 'texture' | 'mesh' | 'audio' | 'data' | 'script' | 'map';
  hash?: string | null;
  importMeta?: Record<string, unknown> | null;
}

// ── World / chunk ───────────────────────────────────────────────────────
export interface WorldRecord {
  kind: 'heightmap' | 'chunked';
  chunkSize?: number;
  chunks?: Record<string, { entities: string[] }>;
  // Raw chunk binaries can be inlined as base64 for portable export, or external files in a .pak.
  externalChunkDir?: string | null;
}

// ── Runtime systems persisted alongside entities ───────────────────────
export interface RuntimeSnapshot {
  gameplayFeatures?: Record<string, unknown>;
  /** Physics joints + ragdolls (JointSystem, RagdollBuilder) */
  joints?: Array<{ a: string; b: string; type: string; params: Record<string, unknown> }>;
  ragdolls?: Array<{ entityGuid: string; state: unknown }>;
  /** Nav agents + built navmesh tiles (NavigationSystem) */
  nav?: { agents?: unknown[]; tiles?: unknown[] };
  /** Animation state: active ASM + tween director queues */
  animation?: { asm?: unknown[]; tweens?: unknown[]; motion?: unknown[] };
  /** Audio sources + reverb zones */
  audio?: { sources?: unknown[]; reverb?: unknown[] };
  /** VFX emitters + GPU particles */
  vfx?: { emitters?: unknown[]; gpu?: unknown };
  /** Foliage / scatter */
  foliage?: unknown;
}

// ── Project sections ────────────────────────────────────────────────────
export interface ProjectDocument {
  kind: typeof PROJECT_DOCUMENT_KIND;
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  entryScene: string;
  scenes: Record<string, EntityRecord[]>;
  assets: AssetRef[];
  world?: WorldRecord | null;
  inputMappings?: unknown[];
  gameplay?: unknown | null;
  environment?: {
    timeOfDay?: number;
    fogColor?: string;
    fogDensity?: number;
    ambientIntensity?: number;
  } | null;
  /** Full engine state: joints, ragdolls, nav, animation, tweens, audio, VFX, foliage — all
   *  previously omitted from scene serialization. Null on legacy docs; populated on v3 saves. */
  runtime?: RuntimeSnapshot | null;
  meta?: Record<string, unknown>;
}

// ── Helpers ─────────────────────────────────────────────────────────────

export function createEmptyProject(name = 'Untitled'): ProjectDocument {
  const now = Date.now();
  return {
    kind: PROJECT_DOCUMENT_KIND,
    version: PROJECT_DOCUMENT_VERSION,
    id: genGuid(),
    name,
    createdAt: now,
    updatedAt: now,
    entryScene: 'main',
    scenes: { main: [] },
    assets: [],
    world: null,
    inputMappings: [],
    gameplay: null,
    environment: null,
    runtime: null,
    meta: {},
  };
}

export function ensureGuid(e: Partial<EntityRecord> & { guid?: string }): string {
  if (e.guid && typeof e.guid === 'string' && e.guid.length >= 8) return e.guid;
  return genGuid();
}

/**
 * Upgrade any older document shape to the current version.
 * Handles: legacy scene.json { entities: [...] } and v1/v2 project docs.
 */
export function migrateProjectDocument(raw: any): ProjectDocument {
  if (!raw || typeof raw !== 'object') return createEmptyProject();

  // Already a current project doc
  if (raw.kind === PROJECT_DOCUMENT_KIND && raw.version === PROJECT_DOCUMENT_VERSION) {
    return raw as ProjectDocument;
  }

  // Legacy scene.json shape: { entities: [...] } (no GUIDs, numeric IDs)
  if (Array.isArray(raw.entities) && !raw.scenes) {
    const entities: EntityRecord[] = raw.entities.map((ent: any) => ({
      guid: genGuid(),
      legacyId: ent.originalId,
      parentGuid: null, // resolved in second pass if parentId present
      name: ent.name,
      tags: ent.tags,
      blueprint: ent.blueprint ?? { kind: ent.kind ?? 'box', params: ent.params ?? {} },
      transform: {
        position: ent.position ?? [0, 0, 0],
        quaternion: ent.quaternion ?? [0, 0, 0, 1],
        scale: ent.scale ?? [1, 1, 1],
        bodyType: ent.bodyType,
        additionalMass: ent.additionalMass ?? ent.mass,
      },
      scriptSource: ent.scriptSource ?? null,
      rootMotion: !!ent.rootMotion,
      terrain: ent.terrainBase64 ? { hmBase64: ent.terrainBase64, splatBase64: ent.splatBase64 } : null,
      chunkId: null,
    }));
    // Second pass: wire parentGuid from legacy parentId if present
    const byLegacy = new Map<number, EntityRecord>();
    for (const e of entities) if (e.legacyId !== undefined) byLegacy.set(e.legacyId, e);
    for (let i = 0; i < raw.entities.length; i++) {
      const src = raw.entities[i];
      if (src.parentId !== undefined) {
        const parent = byLegacy.get(src.parentId);
        if (parent) entities[i].parentGuid = parent.guid;
      }
    }
    return {
      kind: PROJECT_DOCUMENT_KIND,
      version: PROJECT_DOCUMENT_VERSION,
      id: genGuid(),
      name: raw.name ?? 'Migrated Scene',
      runtime: raw.runtime ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      entryScene: 'main',
      scenes: { main: entities },
      assets: [],
      world: null,
      inputMappings: [],
      gameplay: null,
      environment: {
        timeOfDay: raw.timeOfDay,
        fogColor: raw.fogColor,
        fogDensity: raw.fogDensity,
        ambientIntensity: raw.ambientIntensity,
      },
      meta: { migratedFrom: 'legacy_scene_json', legacyVersion: raw.version ?? 0 },
    };
  }

  // Generic older project doc — bump version + fill defaults
  if (raw.kind === PROJECT_DOCUMENT_KIND) {
    const doc: ProjectDocument = {
      kind: PROJECT_DOCUMENT_KIND,
      version: PROJECT_DOCUMENT_VERSION,
      id: raw.id ?? genGuid(),
      name: raw.name ?? 'Untitled',
      createdAt: raw.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      entryScene: raw.entryScene ?? 'main',
      scenes: raw.scenes ?? { main: [] },
      assets: raw.assets ?? [],
      world: raw.world ?? null,
      inputMappings: raw.inputMappings ?? [],
      gameplay: raw.gameplay ?? null,
      environment: raw.environment ?? null,
      runtime: raw.runtime ?? null,
      meta: { ...(raw.meta ?? {}), migratedFromVersion: raw.version },
    };
    // Ensure every entity has a GUID (older docs used numeric ids)
    for (const key of Object.keys(doc.scenes)) {
      doc.scenes[key] = (doc.scenes[key] as any[]).map((e: any) => ({
        guid: e.guid ?? genGuid(),
        legacyId: e.legacyId ?? e.originalId,
        parentGuid: e.parentGuid ?? null,
        blueprint: e.blueprint,
        transform: e.transform ?? {
          position: e.position ?? [0, 0, 0],
          quaternion: e.quaternion ?? [0, 0, 0, 1],
          scale: e.scale ?? [1, 1, 1],
          bodyType: e.bodyType,
        },
        tags: e.tags,
        name: e.name,
        scriptSource: e.scriptSource ?? null,
        rootMotion: !!e.rootMotion,
        chunkId: e.chunkId ?? null,
        ...e,
      }));
    }
    return doc;
  }

  // Unknown shape — wrap as empty with raw preserved in meta
  return {
    ...createEmptyProject(raw.name ?? 'Imported'),
    meta: { importedRaw: raw },
  };
}

export function validateProjectDocument(doc: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!doc) errors.push('Document is null/undefined');
  else {
    if (doc.kind !== PROJECT_DOCUMENT_KIND) errors.push(`kind must be '${PROJECT_DOCUMENT_KIND}'`);
    if (typeof doc.version !== 'number') errors.push('version must be a number');
    else if (doc.version > PROJECT_DOCUMENT_VERSION) errors.push(`version ${doc.version} is newer than engine ${PROJECT_DOCUMENT_VERSION}`);
    if (!doc.id || typeof doc.id !== 'string') errors.push('id (GUID) is required');
    if (!doc.entryScene || typeof doc.entryScene !== 'string') errors.push('entryScene is required');
    if (!doc.scenes || typeof doc.scenes !== 'object') errors.push('scenes must be an object');
    else if (!(doc.entryScene in doc.scenes)) errors.push(`entryScene '${doc.entryScene}' not in scenes`);
    // Check GUID uniqueness per scene
    for (const [sceneName, entities] of Object.entries(doc.scenes as Record<string, EntityRecord[]>)) {
      if (!Array.isArray(entities)) { errors.push(`scenes['${sceneName}'] must be an array`); continue; }
      const seen = new Set<string>();
      for (const e of entities) {
        if (!e.guid) errors.push(`Entity in '${sceneName}' missing guid`);
        else if (seen.has(e.guid)) errors.push(`Duplicate guid ${e.guid} in '${sceneName}'`);
        else seen.add(e.guid);
        if (!e.blueprint?.kind) errors.push(`Entity ${e.guid ?? '?'} in '${sceneName}' missing blueprint.kind`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── Engine ↔ Document bridging (used by sceneIO & SaveSystem) ──────────

export interface EngineLikeForDoc {
  sceneManager: {
    allEntityIds(): number[];
    getRigidBody(id: number): any;
    getBlueprint(id: number): any;
    getTags(id: number): string[];
    getParent(id: number): number | undefined;
    isRootMotion(id: number): boolean;
    getComponent(id: number, type: string): any;
  };
  aiBridge?: { getEntityName(id: number): string | undefined };
  worldOrigin: { toWorldSpaceInto(out: THREE.Vector3, enginePos: THREE.Vector3): void };
}

/** Build EntityRecords from the live engine (for save / export). */
export function entitiesFromEngine(engine: EngineLikeForDoc, opts: { includeMapModels?: boolean } = {}): EntityRecord[] {
  const out: EntityRecord[] = [];
  const idToGuid = new Map<number, string>();
  for (const id of engine.sceneManager.allEntityIds()) {
    const bp = engine.sceneManager.getBlueprint(id);
    if (!bp) continue;
    if (!opts.includeMapModels && (bp.kind === 'dojo' || bp.kind === 'mapModel')) continue;
    const guid = genGuid();
    idToGuid.set(id, guid);
  }
  for (const id of engine.sceneManager.allEntityIds()) {
    if (!idToGuid.has(id)) continue;
    const rb = engine.sceneManager.getRigidBody(id);
    const bp = engine.sceneManager.getBlueprint(id);
    if (!rb || !bp) continue;
    // Skip ground fixture by shape heuristic is now handled via blueprint include filter;
    // additionally skip the canonical ground box if it's exactly that shape
    if (bp.kind === 'box' && bp.params.hx === 50 && bp.params.hy === 0.5 && bp.params.hz === 50 && bp.params.dynamic === false) continue;

    const worldPos = new THREE.Vector3();
    engine.worldOrigin.toWorldSpaceInto(worldPos, rb.mesh.position);
    const q = rb.mesh.quaternion;
    const s = rb.mesh.scale;
    const body = rb.rapierBody;
    let bodyType: EntityRecord['transform']['bodyType'] = 'dynamic';
    try {
      if (body.isFixed()) bodyType = 'fixed';
      else if (body.isKinematic()) bodyType = 'kinematic';
    } catch {}

    const parentId = engine.sceneManager.getParent(id);
    const parentGuid = parentId !== undefined ? (idToGuid.get(parentId) ?? null) : null;
    const scriptComp = engine.sceneManager.getComponent(id, 'script') as any;
    const rec: EntityRecord = {
      guid: idToGuid.get(id)!,
      legacyId: id,
      parentGuid,
      name: engine.aiBridge?.getEntityName(id),
      tags: engine.sceneManager.getTags(id),
      blueprint: bp,
      transform: {
        position: [worldPos.x, worldPos.y, worldPos.z],
        quaternion: [q.x, q.y, q.z, q.w],
        scale: [s.x, s.y, s.z],
        bodyType,
        additionalMass: rb.additionalMass,
      },
      rootMotion: engine.sceneManager.isRootMotion(id),
      scriptSource: scriptComp?.sourceCode ?? null,
      chunkId: null,
    };
    if (bp.kind === 'terrain' && rb.mesh.userData.terrain) {
      rec.terrain = {
        hmBase64: rb.mesh.userData.terrain.hm.toBase64(),
        splatBase64: rb.mesh.userData.terrain.splatMap?.toBase64(),
      };
    }
    out.push(rec);
  }
  return out;
}
