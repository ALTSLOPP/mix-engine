/**
 * ReleaseValidator — Pre-flight release and export sanity validation.
 *
 * Verifies project documents, GUID links, asset dependencies, and transaction cleanliness.
 */

import { PROJECT_DOCUMENT_KIND, PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../project/ProjectDocument';
import type { AssetDatabase } from '../assets/AssetDatabase';
import type { TransactionJournal } from './TransactionJournal';

export interface ReleaseValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  entityCount: number;
  sceneCount: number;
}

export class ReleaseValidator {
  /**
   * Runs comprehensive release validation across project document and subsystems.
   */
  static validate(options: {
    project: ProjectDocument;
    assetDb?: AssetDatabase;
    journal?: TransactionJournal;
  }): ReleaseValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const { project, assetDb, journal } = options;

    if ((project as any).kind !== PROJECT_DOCUMENT_KIND) errors.push(`Project kind must be '${PROJECT_DOCUMENT_KIND}'.`);
    if ((project as any).version !== PROJECT_DOCUMENT_VERSION) errors.push(`Project version must be ${PROJECT_DOCUMENT_VERSION}.`);

    if (!project.name || project.name.trim().length === 0) {
      warnings.push('Project name is empty.');
    }

    const sceneKeys = Object.keys(project.scenes ?? {});
    if (sceneKeys.length === 0) {
      errors.push('Project has no defined scenes.');
    }
    if (project.entryScene && !sceneKeys.includes(project.entryScene)) {
      errors.push(`Entry scene '${project.entryScene}' does not exist.`);
    }

    let totalEntities = 0;
    const globalGuidSet = new Set<string>();

    for (const sceneName of sceneKeys) {
      const entities = project.scenes[sceneName] ?? [];
      totalEntities += entities.length;
      const sceneGuids = new Set<string>();

      for (const e of entities) {
        if (!e.guid) {
          errors.push(`Entity in scene '${sceneName}' is missing a persistent GUID.`);
        } else if (sceneGuids.has(e.guid)) {
          errors.push(`Duplicate GUID '${e.guid}' detected in scene '${sceneName}'.`);
        } else {
          if (globalGuidSet.has(e.guid)) {
            errors.push(`Duplicate GUID '${e.guid}' detected across project scenes.`);
          }
          sceneGuids.add(e.guid);
          globalGuidSet.add(e.guid);
        }

        // Validate parenting
        if (e.parentGuid && !sceneGuids.has(e.parentGuid)) {
          // Check if parent exists anywhere in scene
          const parentExists = entities.some((ent) => ent.guid === e.parentGuid);
          if (!parentExists) {
            errors.push(`Entity '${e.name ?? e.guid}' references missing parent GUID '${e.parentGuid}'.`);
          }
        }
      }
    }

    // Check asset dependencies
    if (assetDb) {
      const cycles = assetDb.detectCycles();
      if (cycles.length > 0) {
        errors.push(`Asset database contains ${cycles.length} circular dependency cycles.`);
      }
      for (const asset of assetDb.allAssets()) {
        for (const dependency of asset.meta.dependencies ?? []) {
          if (!assetDb.getAssetByGuid(dependency)) {
            errors.push(`Asset '${asset.path}' references missing dependency GUID '${dependency}'.`);
          }
        }
      }
    }

    // Check transaction journal
    if (journal) {
      const uncommitted = journal.detectDanglingTransactions();
      if (uncommitted.length > 0) {
        warnings.push(`Transaction journal contains ${uncommitted.length} uncommitted/interrupted transactions.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      entityCount: totalEntities,
      sceneCount: sceneKeys.length,
    };
  }
}
