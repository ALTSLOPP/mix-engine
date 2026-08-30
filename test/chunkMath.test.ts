import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CHUNK_SIZE,
  chunkIdFor,
  parseChunkId,
  chunkCoordsFromWorld,
  chunkGridOrigin,
} from '../src/streaming/chunkMath';

describe('chunkMath', () => {
  it('round-trips chunk ids including negative coordinates', () => {
    for (const [cx, cz] of [[0, 0], [3, -7], [-12, 40], [-1, -1]] as const) {
      const { cx: px, cz: pz } = parseChunkId(chunkIdFor(cx, cz));
      expect([px, pz]).toEqual([cx, cz]);
    }
  });

  it('floors world coordinates into the owning chunk (handles negatives)', () => {
    expect(chunkCoordsFromWorld(new THREE.Vector3(0, 0, 0))).toEqual({ cx: 0, cz: 0 });
    expect(chunkCoordsFromWorld(new THREE.Vector3(CHUNK_SIZE - 1, 0, CHUNK_SIZE))).toEqual({ cx: 0, cz: 1 });
    expect(chunkCoordsFromWorld(new THREE.Vector3(-1, 0, -CHUNK_SIZE - 1))).toEqual({ cx: -1, cz: -2 });
  });

  it('places the grid origin at the chunk corner', () => {
    const out = new THREE.Vector3();
    chunkGridOrigin(chunkIdFor(2, -3), out);
    expect(out.toArray()).toEqual([2 * CHUNK_SIZE, 0, -3 * CHUNK_SIZE]);
  });
});
