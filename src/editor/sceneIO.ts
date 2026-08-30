import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { todSlider, fogColor, fogSlider, ambientSlider, btnUndo, btnRedo } from './dom';
import { getAssetId, isCharacterRb } from './sceneHelpers';
import { updateOutliner } from './outliner';
import { updateInspector } from './inspector';
import {
  PROJECT_DOCUMENT_VERSION,
  PROJECT_DOCUMENT_KIND,
  migrateProjectDocument,
  validateProjectDocument,
  type ProjectDocument,
  type EntityRecord,
} from '../project/ProjectDocument';

function genGuid(): string {
  try { const c: any = (globalThis as any).crypto; if (c?.randomUUID) return c.randomUUID(); } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0; const v = ch === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
  });
}

// --- Undo/redo history -----------------------------------------------------
const undoStack: string[] = [];
const redoStack: string[] = [];
const MAX_HISTORY = 50;
let isRestoringState = false;

/** True while a save/undo/redo restore is replaying — suppresses re-capture + autosave. */
export function isRestoring(): boolean {
  return isRestoringState;
}

// --- QoL Helper Functions --------------------------------------------------
export function clearAllEntities(engine: Engine): void {
  engine.gizmo.detach();
  const sm = engine.sceneManager;
  const ids = sm.allEntityIds();
  for (const id of ids) {
    sm.requestDestroy(id);
  }
  sm.flushDeferredOperations();

  engine.worldOrigin.offset.set(0, 0, 0);
  engine.viewport.camera.position.set(0, 5, 12);
  engine.viewport.camera.lookAt(0, 0, 0);
  engine.editorCamera.syncToCamera();

  // Re-spawn the ground plane
  sm.spawnNow(new THREE.Vector3(0, -0.5, 0), {
    kind: 'box',
    params: { hx: 50, hy: 0.5, hz: 50, dynamic: false, color: 0x181a1f },
  });
}

export function serializeSceneState(engine: Engine): string {
  // New format embeds GUIDs, tags, scripts, and hierarchy while remaining
  // readable by legacy loaders (extra fields are ignored).
  const entities: any[] = [];
  const sm: any = engine.sceneManager;
  const entityIds = sm.allEntityIds();
  const guidMap = new Map<number, string>();
  for (const id of entityIds) {
    const g = typeof sm.ensureGuid === 'function' ? sm.ensureGuid(id) : (sm.getGuid?.(id) ?? genGuid());
    guidMap.set(id, g);
  }

  for (const id of entityIds) {
    const rb = sm.getRigidBody(id);
    const blueprint = sm.getBlueprint(id);
    if (!rb || !blueprint) continue;

    if (blueprint.kind === 'dojo' || blueprint.kind === 'mapModel') continue;
    if (
      blueprint.kind === 'box' &&
      blueprint.params.hx === 50 &&
      blueprint.params.hy === 0.5 &&
      blueprint.params.hz === 50 &&
      blueprint.params.dynamic === false
    ) {
      continue;
    }

    const worldPos = new THREE.Vector3();
    engine.worldOrigin.toWorldSpaceInto(worldPos, rb.mesh.position);
    const quat = rb.mesh.quaternion;
    const scale = rb.mesh.scale;
    const body = rb.rapierBody;

    let bodyType = 'dynamic';
    if (body.isFixed()) bodyType = 'fixed';
    else if (body.isKinematic()) bodyType = 'kinematic';

    const parentId = sm.getParent(id);
    const scriptComp: any = (sm as any).getComponent?.(id, 'script');
    const entityObj: any = {
      guid: guidMap.get(id),
      originalId: id,
      parentId,
      parentGuid: parentId !== undefined ? guidMap.get(parentId) ?? null : null,
      name: (engine as any).aiBridge?.getEntityName?.(id),
      tags: sm.getTags(id),
      blueprint,
      position: [worldPos.x, worldPos.y, worldPos.z],
      quaternion: [quat.x, quat.y, quat.z, quat.w],
      scale: [scale.x, scale.y, scale.z],
      bodyType,
      additionalMass: rb.additionalMass,
      rootMotion: sm.isRootMotion(id),
      scriptSource: scriptComp?.sourceCode ?? null,
    };
    if (blueprint.kind === 'terrain' && rb.mesh.userData.terrain) {
      entityObj.terrainBase64 = rb.mesh.userData.terrain.hm.toBase64();
      entityObj.splatBase64 = rb.mesh.userData.terrain.splatMap.toBase64();
    }
    // Preserve modular component snapshots when the component exposes toJSON/serialize
    try {
      const comps = (sm as any).getAllComponents?.(id) as any[];
      if (comps && comps.length > 0) {
        const snap: Record<string, unknown> = {};
        for (const c of comps) {
          const t = (c.constructor as any).type ?? c.type ?? 'unknown';
          if (typeof c.toJSON === 'function') snap[t] = c.toJSON();
          else if (typeof c.serialize === 'function') snap[t] = c.serialize();
        }
        if (Object.keys(snap).length > 0) entityObj.components = snap;
      }
    } catch {}
    entities.push(entityObj);
  }
  const state = {
    version: PROJECT_DOCUMENT_VERSION,
    kind: PROJECT_DOCUMENT_KIND,
    guid: true,
    entities,
    runtime: { gameplayFeatures: engine.gameplayFeatures?.toJSON() },
    timeOfDay: parseFloat(todSlider ? todSlider.value : '12'),
    fogColor: fogColor ? fogColor.value : '#06080a',
    fogDensity: parseFloat(fogSlider ? fogSlider.value : '0.00'),
    ambientIntensity: parseFloat(ambientSlider ? ambientSlider.value : '0.35'),
  };

  return JSON.stringify(state, null, 2);
}

/** Canonical ProjectDocument serializer — stable GUIDs, scene map, assets, gameplay, input. */
export function serializeProjectDocument(engine: Engine, name = 'Untitled'): string {
  const entities: EntityRecord[] = [];
  const sm: any = engine.sceneManager;
  const guidMap = new Map<number, string>();
  for (const id of sm.allEntityIds()) {
    const g = typeof sm.ensureGuid === 'function' ? sm.ensureGuid(id) : (sm.getGuid?.(id) ?? genGuid());
    guidMap.set(id, g);
  }
  for (const id of sm.allEntityIds()) {
    const rb = sm.getRigidBody(id);
    const bp = sm.getBlueprint(id);
    if (!rb || !bp) continue;
    if (bp.kind === 'dojo' || bp.kind === 'mapModel') continue;
    if (bp.kind === 'box' && bp.params.hx === 50 && bp.params.hy === 0.5 && bp.params.hz === 50 && bp.params.dynamic === false) continue;
    const worldPos = new THREE.Vector3();
    engine.worldOrigin.toWorldSpaceInto(worldPos, rb.mesh.position);
    const q = rb.mesh.quaternion; const s = rb.mesh.scale;
    const body = rb.rapierBody;
    let bodyType: EntityRecord['transform']['bodyType'] = 'dynamic';
    try { if (body.isFixed()) bodyType = 'fixed'; else if (body.isKinematic()) bodyType = 'kinematic'; } catch {}
    const parentId = sm.getParent(id);
    const scriptComp: any = sm.getComponent?.(id, 'script');
    const rec: EntityRecord = {
      guid: guidMap.get(id)!,
      parentGuid: parentId !== undefined ? guidMap.get(parentId) ?? null : null,
      name: (engine as any).aiBridge?.getEntityName?.(id),
      tags: sm.getTags(id),
      blueprint: bp,
      transform: {
        position: [worldPos.x, worldPos.y, worldPos.z],
        quaternion: [q.x, q.y, q.z, q.w],
        scale: [s.x, s.y, s.z],
        bodyType,
        additionalMass: rb.additionalMass,
      },
      rootMotion: sm.isRootMotion(id),
      scriptSource: scriptComp?.sourceCode ?? null,
      chunkId: null,
    };
    if (bp.kind === 'terrain' && rb.mesh.userData.terrain) {
      rec.terrain = { hmBase64: rb.mesh.userData.terrain.hm.toBase64(), splatBase64: rb.mesh.userData.terrain.splatMap?.toBase64() };
    }
    entities.push(rec);
  }
  const engAny: any = engine as any;
  const runtime: any = { gameplayFeatures: engine.gameplayFeatures?.toJSON() };
  try {
    if (engAny.jointSystem?.serialize) runtime.joints = engAny.jointSystem.serialize();
    else if (engAny.jointSystem) runtime.joints = [];
    if (engAny.activeRagdolls) runtime.ragdolls = [];
    if (engAny.nav) runtime.nav = { agents: engAny.nav.getAgentCount?.() ?? 0 };
    if (engAny.tweens) runtime.tweens = engAny.tweens.serialize?.() ?? [];
    if (engAny.motion) runtime.animation = { motion: engAny.motion.serialize?.() ?? [] };
    if (engAny.audio) runtime.audio = { sources: engAny.audio.sources?.length ?? 0 };
    if (engAny.vfx) runtime.vfx = { emitters: 0 };
    if (engAny.foliage) runtime.foliage = engAny.foliage.serialize?.() ?? null;
  } catch {}
  const hasRuntime = Object.keys(runtime).length > 0 ? runtime : null;

  const doc: ProjectDocument = {
    kind: PROJECT_DOCUMENT_KIND,
    version: PROJECT_DOCUMENT_VERSION,
    id: genGuid(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    entryScene: 'main',
    scenes: { main: entities },
    assets: [],
    world: null,
    inputMappings: [],
    gameplay: null,
    environment: {
      timeOfDay: parseFloat(todSlider ? todSlider.value : '12'),
      fogColor: fogColor ? fogColor.value : '#06080a',
      fogDensity: parseFloat(fogSlider ? fogSlider.value : '0.00'),
      ambientIntensity: parseFloat(ambientSlider ? ambientSlider.value : '0.35'),
    },
    runtime: hasRuntime,
    meta: {},
  };
  return JSON.stringify(doc, null, 2);
}

export async function deserializeProjectDocument(engine: Engine, docStr: string): Promise<void> {
  let doc: any;
  try { doc = JSON.parse(docStr); } catch { return; }
  if (doc && doc.kind !== PROJECT_DOCUMENT_KIND && Array.isArray(doc.entities)) {
    // Legacy scene.json path — delegate to existing deserializer (handles parentId/guid migration)
    deserializeSceneState(engine, docStr);
    return;
  }
  const migrated: ProjectDocument = migrateProjectDocument(doc);
  const v = validateProjectDocument(migrated);
  if (!v.valid) console.warn('[sceneIO] ProjectDocument validation:', v.errors);
  const scene = migrated.scenes[migrated.entryScene] ?? Object.values(migrated.scenes)[0] ?? [];
  // Collect asset ids that need preloading (if the blueprint references an assetId)
  const needed = new Set<string>();
  for (const e of scene) {
    const aid = (e.blueprint.params as any)?.assetId;
    if (typeof aid === 'string') needed.add(aid);
  }
  if (needed.size > 0) {
    const known = [...needed].filter((id) => !!(engine as any).manifest?.get?.(id));
    if (known.length > 0) { try { await (engine as any).manifest.preload(known); } catch {} }
  }
  // Now spawn (synchronous — assets are preloaded)
  const sm: any = engine.sceneManager;
  clearAllEntities(engine);
  const guidToId = new Map<string, number>();
  for (const ent of scene) {
    const worldPos = new THREE.Vector3(ent.transform.position[0], ent.transform.position[1], ent.transform.position[2]);
    // Defer parenting until second pass
    const id = sm.spawnNow(worldPos, ent.blueprint, { rootMotion: !!ent.rootMotion });
    if (ent.guid && typeof sm.setGuid === 'function') sm.setGuid(id, ent.guid);
    guidToId.set(ent.guid, id);
    const rb = sm.getRigidBody(id);
    if (rb) {
      rb.mesh.quaternion.set(ent.transform.quaternion[0], ent.transform.quaternion[1], ent.transform.quaternion[2], ent.transform.quaternion[3]);
      rb.mesh.scale.set(ent.transform.scale[0], ent.transform.scale[1], ent.transform.scale[2]);
      rb.rescaleCollider(); rb.resetInterpolationBuffers(); rb.syncToPhysics();
      const body = rb.rapierBody; const R = engine.physicsWorld.RAPIER;
      if (ent.transform.bodyType === 'fixed') body.setBodyType(R.RigidBodyType.Fixed, true);
      else if (ent.transform.bodyType === 'kinematic') body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
      else body.setBodyType(R.RigidBodyType.Dynamic, true);
      if (ent.transform.additionalMass !== undefined) rb.setAdditionalMass(ent.transform.additionalMass);
      if (ent.terrain?.hmBase64 && rb.mesh.userData.terrain) {
        rb.mesh.userData.terrain.hm.fromBase64(ent.terrain.hmBase64);
        rb.mesh.userData.terrain.rebuildCollider();
        rb.mesh.userData.terrain.applyRect({ i0: 0, i1: rb.mesh.userData.terrain.hm.res - 1, j0: 0, j1: rb.mesh.userData.terrain.hm.res - 1 });
        if (ent.terrain.splatBase64) rb.mesh.userData.terrain.splatMap.fromBase64(ent.terrain.splatBase64);
      }
      if (ent.tags) for (const t of ent.tags) sm.addTag(id, t);
      if (ent.name) (engine as any).aiBridge?.setEntityName?.(id, ent.name);
      if (ent.scriptSource) sm.addScript(id, ent.scriptSource);
    }
  }
  for (const ent of scene) {
    if (!ent.parentGuid) continue;
    const childId = guidToId.get(ent.guid);
    const parentId = guidToId.get(ent.parentGuid);
    if (childId !== undefined && parentId !== undefined) sm.parentEntity(childId, parentId);
  }
  if (migrated.runtime?.gameplayFeatures) engine.gameplayFeatures?.fromJSON(migrated.runtime.gameplayFeatures);
  if (migrated.environment) {
    if (migrated.environment.timeOfDay !== undefined && todSlider) { todSlider.value = String(migrated.environment.timeOfDay); todSlider.dispatchEvent(new Event('input')); }
    if (migrated.environment.fogColor !== undefined && fogColor) { fogColor.value = migrated.environment.fogColor; fogColor.dispatchEvent(new Event('input')); }
    if (migrated.environment.fogDensity !== undefined && fogSlider) { fogSlider.value = String(migrated.environment.fogDensity); fogSlider.dispatchEvent(new Event('input')); }
    if (migrated.environment.ambientIntensity !== undefined && ambientSlider) { ambientSlider.value = String(migrated.environment.ambientIntensity); ambientSlider.dispatchEvent(new Event('input')); }
  }
  updateOutliner(engine); updateInspector(engine);
}

export function deserializeSceneState(engine: Engine, stateStr: string): void {
  try {
    const raw = JSON.parse(stateStr);
    if (!raw) return;
    // New ProjectDocument path — delegate to the async-capable migrator when shape matches
    if (raw.kind === PROJECT_DOCUMENT_KIND) {
      const migrated = migrateProjectDocument(raw);
      const scene = migrated.scenes[migrated.entryScene] ?? Object.values(migrated.scenes)[0] ?? [];
      // For sync callers (undo/redo), we hydrate synchronously if assets are already cached.
      // Streaming assets not yet cached will fail gracefully (entity spawns as fallback).
      const fakeStr = JSON.stringify({ entities: scene.map((e: any) => ({
        guid: e.guid, originalId: e.legacyId, parentGuid: e.parentGuid,
        blueprint: e.blueprint, position: e.transform?.position, quaternion: e.transform?.quaternion,
        scale: e.transform?.scale, bodyType: e.transform?.bodyType, additionalMass: e.transform?.additionalMass,
        rootMotion: e.rootMotion, tags: e.tags, name: e.name, scriptSource: e.scriptSource,
        terrainBase64: e.terrain?.hmBase64, splatBase64: e.terrain?.splatBase64,
      })), timeOfDay: migrated.environment?.timeOfDay, fogColor: migrated.environment?.fogColor,
        fogDensity: migrated.environment?.fogDensity, ambientIntensity: migrated.environment?.ambientIntensity });
      // Re-enter as legacy-shaped payload so the shared path below handles it
      const state = JSON.parse(fakeStr);
      deserializeLegacyState(engine, state);
      if (migrated.runtime?.gameplayFeatures) engine.gameplayFeatures?.fromJSON(migrated.runtime.gameplayFeatures);
      return;
    }
    if (!Array.isArray(raw.entities)) return;
    deserializeLegacyState(engine, raw);
    if (raw.runtime?.gameplayFeatures) engine.gameplayFeatures?.fromJSON(raw.runtime.gameplayFeatures);
  } catch (err) {
    console.error('[MIX Engine] Deserialization failed:', err);
  }
}

function deserializeLegacyState(engine: Engine, state: any): void {
    clearAllEntities(engine);

    if (state.timeOfDay !== undefined && todSlider) {
      todSlider.value = String(state.timeOfDay);
      todSlider.dispatchEvent(new Event('input'));
    }
    if (state.fogColor !== undefined && fogColor) {
      fogColor.value = state.fogColor;
      fogColor.dispatchEvent(new Event('input'));
    }
    if (state.fogDensity !== undefined && fogSlider) {
      fogSlider.value = String(state.fogDensity);
      fogSlider.dispatchEvent(new Event('input'));
    }
    if (state.ambientIntensity !== undefined && ambientSlider) {
      ambientSlider.value = String(state.ambientIntensity);
      ambientSlider.dispatchEvent(new Event('input'));
    }

    const sm = engine.sceneManager;
    const idMap = new Map<number, number>();
    const guidMap = new Map<string, number>();
    const parentRelations: { childOldId: number; parentOldId: number }[] = [];
    const guidRelations: { childGuid: string; parentGuid: string }[] = [];

    for (const ent of state.entities) {
      if (ent.blueprint?.kind === 'dojo' || ent.blueprint?.kind === 'mapModel') continue;
      const worldPos = new THREE.Vector3(ent.position[0], ent.position[1], ent.position[2]);
      const id = sm.spawnNow(worldPos, ent.blueprint, {
        rootMotion: ent.rootMotion || false
      });
      if (ent.guid && typeof (sm as any).setGuid === 'function') (sm as any).setGuid(id, ent.guid);

      if (ent.originalId !== undefined) idMap.set(ent.originalId, id);
      if (ent.guid) guidMap.set(ent.guid, id);
      if (ent.parentId !== undefined && ent.originalId !== undefined) {
        parentRelations.push({ childOldId: ent.originalId, parentOldId: ent.parentId });
      }
      if (ent.parentGuid && ent.guid) guidRelations.push({ childGuid: ent.guid, parentGuid: ent.parentGuid });

      const rb = sm.getRigidBody(id);
      if (rb) {
        rb.mesh.quaternion.set(ent.quaternion[0], ent.quaternion[1], ent.quaternion[2], ent.quaternion[3]);
        rb.mesh.scale.set(ent.scale[0], ent.scale[1], ent.scale[2]);
        rb.rescaleCollider();
        rb.resetInterpolationBuffers();
        rb.syncToPhysics();

        const body = rb.rapierBody;
        const R = engine.physicsWorld.RAPIER;
        if (ent.bodyType === 'fixed') body.setBodyType(R.RigidBodyType.Fixed, true);
        else if (ent.bodyType === 'kinematic') body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
        else body.setBodyType(R.RigidBodyType.Dynamic, true);

        if (ent.additionalMass !== undefined) rb.setAdditionalMass(ent.additionalMass);
        else if (ent.mass !== undefined) rb.setAdditionalMass(ent.mass);

        if (ent.tags) for (const t of ent.tags) sm.addTag(id, t);
        if (ent.name) (engine as any).aiBridge?.setEntityName?.(id, ent.name);
        if (ent.scriptSource && typeof ent.scriptSource === 'string') {
          try { sm.addScript(id, ent.scriptSource); } catch {}
        }

        if (ent.terrainBase64 && rb.mesh.userData.terrain) {
          rb.mesh.userData.terrain.hm.fromBase64(ent.terrainBase64);
          rb.mesh.userData.terrain.rebuildCollider();
          rb.mesh.userData.terrain.applyRect({ i0: 0, i1: rb.mesh.userData.terrain.hm.res - 1, j0: 0, j1: rb.mesh.userData.terrain.hm.res - 1 });
          if (ent.splatBase64) rb.mesh.userData.terrain.splatMap.fromBase64(ent.splatBase64);
        }
      }
    }

    for (const rel of parentRelations) {
      const childNewId = idMap.get(rel.childOldId);
      const parentNewId = idMap.get(rel.parentOldId);
      if (childNewId !== undefined && parentNewId !== undefined) sm.parentEntity(childNewId, parentNewId);
    }
    for (const rel of guidRelations) {
      const childNewId = guidMap.get(rel.childGuid);
      const parentNewId = guidMap.get(rel.parentGuid);
      if (childNewId !== undefined && parentNewId !== undefined) sm.parentEntity(childNewId, parentNewId);
    }

    updateOutliner(engine);
    updateInspector(engine);
}

/** Restore a serialized scene without polluting the undo history, then snapshot it.
 *  Used by boot (server scene-state) and the HMR scene-reload bridge. */
export function restoreSceneFromString(engine: Engine, stateStr: string): void {
  isRestoringState = true;
  deserializeSceneState(engine, stateStr);
  isRestoringState = false;
  captureState(engine);
}

export function captureState(engine: Engine): void {
  if (isRestoringState) return;
  const state = serializeSceneState(engine);
  if (undoStack.length > 0 && undoStack[undoStack.length - 1] === state) {
    return;
  }
  undoStack.push(state);
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack.length = 0;
  updateUndoRedoButtons();
}

export function performUndo(engine: Engine): void {
  if (undoStack.length <= 1) return;
  const currentState = undoStack.pop()!;
  redoStack.push(currentState);
  const prevState = undoStack[undoStack.length - 1];

  isRestoringState = true;
  deserializeSceneState(engine, prevState);
  isRestoringState = false;

  updateUndoRedoButtons();
  autoSaveToLocalStorage(engine);
}

export function performRedo(engine: Engine): void {
  if (redoStack.length === 0) return;
  const nextState = redoStack.pop()!;
  undoStack.push(nextState);

  isRestoringState = true;
  deserializeSceneState(engine, nextState);
  isRestoringState = false;

  updateUndoRedoButtons();
  autoSaveToLocalStorage(engine);
}

export function updateUndoRedoButtons(): void {
  if (btnUndo) {
    btnUndo.disabled = undoStack.length <= 1;
    btnUndo.style.opacity = undoStack.length <= 1 ? '0.4' : '1';
  }
  if (btnRedo) {
    btnRedo.disabled = redoStack.length === 0;
    btnRedo.style.opacity = redoStack.length === 0 ? '0.4' : '1';
  }
}

export function autoSaveToLocalStorage(engine: Engine): void {
  if (isRestoringState) return;
  try {
    const state = serializeSceneState(engine);
    // Write scene.json via Vite middleware (relying on server persistence instead of localStorage)
    fetch('/api/scene-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: state,
    }).catch(() => {});
  } catch (err) {
    console.warn('[MIX Engine] Auto-save to server failed:', err);
  }
}

export function syncTelemetryWithServer(engine: Engine, fps: number): void {
  try {
    const cam = engine.viewport.camera;
    const camPos = cam.position;

    const worldCamPos = new THREE.Vector3();
    engine.worldOrigin.toWorldSpaceInto(worldCamPos, camPos);

    const entities: any[] = [];
    const sm = engine.sceneManager;
    const entityIds = sm.allEntityIds();

    for (const id of entityIds) {
      const rb = sm.getRigidBody(id);
      const blueprint = sm.getBlueprint(id);
      if (!rb || !blueprint) continue;

      const worldPos = new THREE.Vector3();
      engine.worldOrigin.toWorldSpaceInto(worldPos, rb.mesh.position);

      entities.push({
        id,
        kind: blueprint.kind,
        assetId: getAssetId(rb),
        position: [worldPos.x, worldPos.y, worldPos.z],
      });
    }

    const telemetry = {
      camera: {
        position: [worldCamPos.x, worldCamPos.y, worldCamPos.z],
        direction: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).toArray(),
      },
      fps,
      drawCalls: engine.viewport.renderer.info.render.calls,
      triangles: engine.viewport.renderer.info.render.triangles,
      entities,
      timestamp: Date.now(),
    };

    fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telemetry),
    }).catch(() => {});
  } catch (err) {
    // Ignore error
  }
}

export function duplicateEntity(engine: Engine, id: number): void {
  const sm = engine.sceneManager;
  const rb = sm.getRigidBody(id);
  const blueprint = sm.getBlueprint(id);
  if (!rb || !blueprint) return;

  const currentPos = new THREE.Vector3();
  engine.worldOrigin.toWorldSpaceInto(currentPos, rb.mesh.position);
  const dupPos = currentPos.clone().add(new THREE.Vector3(1.5, 0, 1.5));
  const isCharacter = isCharacterRb(rb);

  sm.requestSpawn(dupPos, {
    kind: blueprint.kind,
    params: { ...blueprint.params }
  }, {
    rootMotion: isCharacter,
    onSpawned: (newId) => {
      const newRb = sm.getRigidBody(newId);
      if (newRb) {
        newRb.mesh.quaternion.copy(rb.mesh.quaternion);
        newRb.mesh.scale.copy(rb.mesh.scale);
        newRb.rescaleCollider();
        newRb.resetInterpolationBuffers();
        newRb.syncToPhysics();

        const body = newRb.rapierBody;
        const origBody = rb.rapierBody;
        body.setBodyType(origBody.bodyType(), true);
        // Copy the tracked additional mass directly (origBody.mass() is total → wrong).
        newRb.setAdditionalMass(rb.additionalMass);

        engine.gizmo.attach(newRb);
      }

      updateOutliner(engine);
      updateInspector(engine);
      captureState(engine);
      autoSaveToLocalStorage(engine);
    }
  });
}

export function deleteEntity(engine: Engine, id: number): void {
  const sm = engine.sceneManager;
  const activeRb = engine.gizmo.attached;
  const rb = sm.getRigidBody(id);
  if (activeRb && activeRb === rb) {
    engine.gizmo.detach();
  }

  sm.requestDestroy(id);
  // Flush the deferred destroy synchronously so the UI reflects the removal on the same
  // frame (the deferred-flush point is loop step 8; the UI layer already uses this pattern
  // in clearAllEntities). Avoids the fragile 50ms setTimeout which could fire after HMR
  // teardown against a disposed engine.
  sm.flushDeferredOperations();
  updateOutliner(engine);
  updateInspector(engine);
  captureState(engine);
  autoSaveToLocalStorage(engine);
}
