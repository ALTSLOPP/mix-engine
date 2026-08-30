import * as THREE from 'three';

/** Side length of a square chunk in world units. */
export const CHUNK_SIZE = 256;

export type ChunkId = string;

/** Sentinel "chunk" for entities that belong to no chunk (persisted with the world snapshot). */
export const GLOBAL_CHUNK: ChunkId = '__global__';

export function chunkIdFor(cx: number, cz: number): ChunkId {
  return `${cx}|${cz}`;
}

export function parseChunkId(id: ChunkId): { cx: number; cz: number } {
  const sep = id.indexOf('|');
  return { cx: Number(id.slice(0, sep)), cz: Number(id.slice(sep + 1)) };
}

export function chunkCoordsFromWorld(worldPos: THREE.Vector3): { cx: number; cz: number } {
  return { cx: Math.floor(worldPos.x / CHUNK_SIZE), cz: Math.floor(worldPos.z / CHUNK_SIZE) };
}

/** The grid-static, origin-independent anchor of a chunk (world space). */
export function chunkGridOrigin(id: ChunkId, out: THREE.Vector3): THREE.Vector3 {
  const { cx, cz } = parseChunkId(id);
  return out.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
}
