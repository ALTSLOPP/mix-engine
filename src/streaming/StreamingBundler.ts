/**
 * StreamingBundler — Packages spatial partition cells into streaming chunks
 * with grid-local coordinates and bundle manifests.
 */

import { chunkGridOrigin, type ChunkId } from './chunkMath';
import type { PartitionedCell, PartitionResult } from './WorldPartitioner';
import * as THREE from 'three';

export interface SerializedLocalEntity {
  guid: string;
  kind: string;
  blueprintParams: Record<string, unknown>;
  name?: string;
  tags?: string[];
  parentGuid?: string | null;
  localPos: [number, number, number];
  localQuat: [number, number, number, number];
  scale: [number, number, number];
  components?: Record<string, unknown>;
  scriptSource?: string | null;
  scriptSelf?: Record<string, unknown> | null;
  rootMotion?: boolean;
  bodyType?: 'dynamic' | 'fixed' | 'kinematic';
  additionalMass?: number;
  terrain?: { hmBase64?: string; splatBase64?: string } | null;
  sourceChunkId?: string | null;
}

export interface ChunkBundle {
  chunkId: ChunkId;
  cx: number;
  cz: number;
  origin: [number, number, number];
  entityCount: number;
  entities: SerializedLocalEntity[];
  hash: string;
}

export interface WorldBundle {
  version: number;
  generatedAt: number;
  cellSize: number;
  totalChunks: number;
  totalEntities: number;
  globalEntities: SerializedLocalEntity[];
  chunks: Record<ChunkId, ChunkBundle>;
  issues: string[];
}

export class StreamingBundler {
  private static readonly _anchor = new THREE.Vector3();

  /**
   * Bundles a single partitioned cell into a grid-local ChunkBundle.
   */
  static bundleCell(cell: PartitionedCell, cellSize?: number): ChunkBundle {
    let anchorX: number, anchorY: number, anchorZ: number;
    if (cell.bounds?.min) {
      anchorX = cell.bounds.min[0];
      anchorY = 0;
      anchorZ = cell.bounds.min[2];
    } else if (cellSize !== undefined) {
      anchorX = cell.cx * cellSize;
      anchorY = 0;
      anchorZ = cell.cz * cellSize;
    } else {
      chunkGridOrigin(cell.chunkId, this._anchor);
      anchorX = this._anchor.x;
      anchorY = this._anchor.y;
      anchorZ = this._anchor.z;
    }

    const localEntities: SerializedLocalEntity[] = cell.entities.map((e) => {
      const pos = e.transform?.position ?? [0, 0, 0];
      const quat = e.transform?.quaternion ?? [0, 0, 0, 1];
      const scale = e.transform?.scale ?? [1, 1, 1];

      return {
        guid: e.guid,
        kind: e.blueprint?.kind ?? 'primitive',
        blueprintParams: e.blueprint?.params ?? {},
        name: e.name,
        tags: e.tags,
        parentGuid: e.parentGuid,
        localPos: [pos[0] - anchorX, pos[1] - anchorY, pos[2] - anchorZ],
        localQuat: quat,
        scale,
        components: e.components,
        scriptSource: e.scriptSource,
        scriptSelf: e.scriptSelf,
        rootMotion: e.rootMotion,
        bodyType: e.transform?.bodyType,
        additionalMass: e.transform?.additionalMass,
        terrain: e.terrain,
        sourceChunkId: e.chunkId,
      };
    });

    const payload = JSON.stringify(localEntities);
    // Simple hash stamp
    let hashVal = 0;
    for (let i = 0; i < payload.length; i++) {
      hashVal = (hashVal * 31 + payload.charCodeAt(i)) >>> 0;
    }

    return {
      chunkId: cell.chunkId,
      cx: cell.cx,
      cz: cell.cz,
      origin: [anchorX, anchorY, anchorZ],
      entityCount: localEntities.length,
      entities: localEntities,
      hash: hashVal.toString(16),
    };
  }

  /**
   * Bundles a full PartitionResult into a streaming WorldBundle.
   */
  static bundleWorld(partition: PartitionResult): WorldBundle {
    const chunks: Record<ChunkId, ChunkBundle> = {};

    for (const [chunkId, cell] of partition.cells) {
      chunks[chunkId] = this.bundleCell(cell, partition.cellSize);
    }

    const globalEntities: SerializedLocalEntity[] = partition.globalEntities.map((e) => {
      const pos = e.transform?.position ?? [0, 0, 0];
      const quat = e.transform?.quaternion ?? [0, 0, 0, 1];
      const scale = e.transform?.scale ?? [1, 1, 1];
      return {
        guid: e.guid,
        kind: e.blueprint?.kind ?? 'primitive',
        blueprintParams: e.blueprint?.params ?? {},
        name: e.name,
        tags: e.tags,
        parentGuid: e.parentGuid,
        localPos: pos,
        localQuat: quat,
        scale,
        components: e.components,
        scriptSource: e.scriptSource,
        scriptSelf: e.scriptSelf,
        rootMotion: e.rootMotion,
        bodyType: e.transform?.bodyType,
        additionalMass: e.transform?.additionalMass,
        terrain: e.terrain,
        sourceChunkId: e.chunkId,
      };
    });

    return {
      version: 1,
      generatedAt: Date.now(),
      cellSize: partition.cellSize,
      totalChunks: partition.cells.size,
      totalEntities: partition.totalEntities,
      globalEntities,
      chunks,
      issues: [...partition.issues],
    };
  }
}
