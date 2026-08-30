/**
 * WorldPartitioner — Offline and runtime spatial partitioning for open-world scenes.
 *
 * Divides large scenes into deterministic grid cells, resolves chunk boundaries,
 * bundles parent-child hierarchies, and generates cell manifests.
 */

import * as THREE from 'three';
import { CHUNK_SIZE, GLOBAL_CHUNK, chunkIdFor, type ChunkId } from './chunkMath';
import type { EntityRecord, ProjectDocument } from '../project/ProjectDocument';

export interface PartitionedCell {
  chunkId: ChunkId;
  cx: number;
  cz: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  entities: EntityRecord[];
  entityCount: number;
}

export interface PartitionResult {
  cellSize: number;
  totalEntities: number;
  globalEntities: EntityRecord[];
  cells: Map<ChunkId, PartitionedCell>;
  issues: string[];
  manifest: {
    chunkCount: number;
    globalCount: number;
    chunks: Array<{ chunkId: ChunkId; cx: number; cz: number; entityCount: number }>;
  };
}

export class WorldPartitioner {
  /**
   * Partitions an entity collection or ProjectDocument into grid cells.
   */
  static partition(entities: EntityRecord[], cellSize = CHUNK_SIZE): PartitionResult {
    const globalEntities: EntityRecord[] = [];
    const cells = new Map<ChunkId, PartitionedCell>();
    const entityGuidToChunk = new Map<string, ChunkId>();
    const issues: string[] = [];
    const entityByGuid = new Map(entities.map((entity) => [entity.guid, entity]));

    // Pass 1: Identify root positions and assign chunks
    for (const e of entities) {
      if (e.chunkId === GLOBAL_CHUNK || (!e.transform && !e.parentGuid)) {
        globalEntities.push(e);
        entityGuidToChunk.set(e.guid, GLOBAL_CHUNK);
        continue;
      }

      // If entity has parent, we will resolve its chunk from parent in Pass 2
      if (e.parentGuid) continue;

      const pos = e.transform?.position ?? [0, 0, 0];
      const cx = Math.floor(pos[0] / cellSize);
      const cz = Math.floor(pos[2] / cellSize);
      const chunkId = chunkIdFor(cx, cz);
      entityGuidToChunk.set(e.guid, chunkId);

      let cell = cells.get(chunkId);
      if (!cell) {
        cell = {
          chunkId,
          cx,
          cz,
          bounds: {
            min: [cx * cellSize, -1000, cz * cellSize],
            max: [(cx + 1) * cellSize, 2000, (cz + 1) * cellSize],
          },
          entities: [],
          entityCount: 0,
        };
        cells.set(chunkId, cell);
      }

      cell.entities.push(e);
      cell.entityCount++;
    }

    // Pass 2: Assign child entities to the same chunk as their root parent
    for (const e of entities) {
      if (e.parentGuid && !entityGuidToChunk.has(e.guid)) {
        let parentGuid: string | null | undefined = e.parentGuid;
        let rootChunk: ChunkId | undefined;

        const visited = new Set<string>();
        while (parentGuid && !visited.has(parentGuid)) {
          visited.add(parentGuid);
          rootChunk = entityGuidToChunk.get(parentGuid);
          if (rootChunk) break;
          const parentEntity = entityByGuid.get(parentGuid);
          if (!parentEntity) {
            issues.push(`Entity '${e.guid}' references missing parent '${parentGuid}'.`);
            break;
          }
          parentGuid = parentEntity?.parentGuid;
        }

        if (parentGuid && visited.has(parentGuid) && !rootChunk) {
          issues.push(`Entity '${e.guid}' belongs to a cyclic parent hierarchy involving '${parentGuid}'.`);
        }

        const assignedChunk = rootChunk ?? GLOBAL_CHUNK;
        entityGuidToChunk.set(e.guid, assignedChunk);

        if (assignedChunk === GLOBAL_CHUNK) {
          globalEntities.push(e);
        } else {
          const cell = cells.get(assignedChunk);
          if (cell) {
            cell.entities.push(e);
            cell.entityCount++;
          } else {
            globalEntities.push(e);
          }
        }
      }
    }

    const chunkSummaries = Array.from(cells.values()).map((c) => ({
      chunkId: c.chunkId,
      cx: c.cx,
      cz: c.cz,
      entityCount: c.entityCount,
    }));

    return {
      cellSize,
      totalEntities: entities.length,
      globalEntities,
      cells,
      issues,
      manifest: {
        chunkCount: cells.size,
        globalCount: globalEntities.length,
        chunks: chunkSummaries,
      },
    };
  }

  /**
   * Partitions a complete ProjectDocument's active scene.
   */
  static partitionProject(doc: ProjectDocument, sceneName?: string, cellSize = CHUNK_SIZE): PartitionResult {
    const sceneKey = sceneName ?? doc.entryScene ?? Object.keys(doc.scenes)[0] ?? 'main';
    const entities = doc.scenes[sceneKey] ?? [];
    return this.partition(entities, cellSize);
  }
}
