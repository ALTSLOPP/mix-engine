import * as THREE from 'three';
import { Engine } from '../engine/Engine';
import type { GamePackageManifest } from './GamePackager';

function spawnDescriptor(engine: Engine, desc: any): void {
  // Prefer a full blueprint if present
  const blueprint = desc.blueprint ?? (desc.kind ? { kind: desc.kind, params: desc.params ?? {} } : null);
  const pos = desc.position
    ? Array.isArray(desc.position)
      ? new THREE.Vector3(desc.position[0], desc.position[1], desc.position[2])
      : new THREE.Vector3(desc.position.x ?? 0, desc.position.y ?? 0, desc.position.z ?? 0)
    : desc.worldPos
      ? new THREE.Vector3(desc.worldPos[0], desc.worldPos[1], desc.worldPos[2])
      : new THREE.Vector3(0, 0.5, 0);
  const quat = desc.quaternion
    ? new THREE.Quaternion(desc.quaternion[0], desc.quaternion[1], desc.quaternion[2], desc.quaternion[3])
    : desc.quat
      ? new THREE.Quaternion(desc.quat[0], desc.quat[1], desc.quat[2], desc.quat[3])
      : undefined;
  const tags: string[] | undefined = desc.tags;
  const name: string | undefined = desc.name;

  let spawnBlueprint = blueprint;
  if (!spawnBlueprint) {
    // Minimal descriptor from legacy package_game (only id/tags/position):
    // spawn a placeholder so the packaged scene is at least visibly populated,
    // rather than shipping an empty world.
    spawnBlueprint = { kind: 'box', params: { hx: 0.5, hy: 0.5, hz: 0.5, color: 0x3a4455 } };
  }
  try {
    const id = engine.sceneManager.spawnNow(pos, spawnBlueprint, { quat });
    if (tags) for (const t of tags) engine.sceneManager.addTag(id, t);
    if (name) engine.aiBridge.setEntityName?.(id, name);
    // Preserve script source if the descriptor carries it
    if (desc.scriptSource && typeof desc.scriptSource === 'string') {
      engine.sceneManager.addScript(id, desc.scriptSource);
    }
  } catch (err) {
    console.warn('[standalone] failed to spawn descriptor:', desc, err);
  }
}

export async function bootstrapStandaloneGame(
  container: HTMLElement,
  manifest: GamePackageManifest,
): Promise<Engine> {
  const engine = await Engine.create(container);

  // Apply visual style (no editor dependency)
  if (manifest.visualStyle && manifest.visualStyle !== 'default') {
    try {
      engine.setVisualStyle(manifest.visualStyle as any);
    } catch {
      // fallback
    }
  }

  // Preload any referenced assets that are registered in the manifest
  if (manifest.assets && manifest.assets.length > 0) {
    const known = manifest.assets.filter((id) => !!engine.manifest.get(id));
    if (known.length > 0) {
      try { await engine.manifest.preload(known); } catch { /* missing assets are non-fatal */ }
    }
  }

  // Load entry scene — supports multiple shapes:
  //  - Array<EntityDescriptor>
  //  - { entities: [...] }  (serializeSceneState shape)
  //  - JSON string of either
  //  - Record<string, unknown> map of scenes (now correctly keyed by entryScene)
  let sceneData: unknown = (manifest.scenes as any)?.[manifest.entryScene];
  if (!sceneData) {
    // Fallback: first available scene (back-compat for old 'main'-only bundles)
    const vals = Object.values(manifest.scenes ?? {});
    if (vals.length > 0) sceneData = vals[0];
  }
  if (typeof sceneData === 'string') {
    try { sceneData = JSON.parse(sceneData); } catch { /* keep as string */ }
  }
  if (sceneData) {
    try {
      if (Array.isArray(sceneData)) {
        for (const desc of sceneData) spawnDescriptor(engine, desc);
      } else if (typeof sceneData === 'object' && sceneData !== null) {
        const obj = sceneData as any;
        if (Array.isArray(obj.entities)) {
          for (const desc of obj.entities) spawnDescriptor(engine, desc);
          // Restore ambient / fog if present
          if (typeof obj.timeOfDay === 'number') engine.setTimeOfDay(obj.timeOfDay);
        } else {
          // Single descriptor object
          spawnDescriptor(engine, obj);
        }
      }
      engine.sceneManager.flushDeferredOperations();

      // Optional: hydrate gameplay / input from manifest if authored
      if (manifest.gameplayRules && Array.isArray(manifest.gameplayRules) && manifest.gameplayRules.length > 0) {
        try { engine.aiBridge.execute({ type: 'gameplay_load', def: { rules: manifest.gameplayRules } } as any); } catch {}
      }
      if (manifest.inputActions && Array.isArray(manifest.inputActions) && manifest.inputActions.length > 0) {
        try { engine.aiBridge.execute({ type: 'input_remap', actions: manifest.inputActions } as any); } catch {}
      }
    } catch (err) {
      console.error('[standalone] scene load failed:', err);
    }
  }

  // Smoke test: verify at least ground or one entity exists post-boot
  if (engine.sceneManager.entityCount === 0) {
    console.warn('[standalone] manifest produced 0 entities — entryScene may be empty');
  }

  return engine;
}

/**
 * Validate a packaged manifest can boot without throwing (for `package_game` post-export smoke test).
 * Returns { ok, errors } — does not require a DOM container when run headless (check shape only).
 */
export function validateStandaloneManifest(manifest: GamePackageManifest): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest.entryScene) errors.push('Missing entryScene');
  if (!manifest.scenes || typeof manifest.scenes !== 'object') errors.push('Invalid scenes');
  else if (!(manifest.entryScene in manifest.scenes)) errors.push(`EntryScene '${manifest.entryScene}' not in scenes`);
  if (!manifest.gameTitle) errors.push('Missing gameTitle');
  return { ok: errors.length === 0, errors };
}
