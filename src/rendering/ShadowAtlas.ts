import * as THREE from 'three';

export interface AtlasTile {
  id: string | number;
  x: number;
  y: number;
  size: number;
  viewport: [number, number, number, number]; // [u, v, widthU, heightV]
  dirty: boolean;
}

export class ShadowAtlas {
  readonly size: number;
  private readonly tiles = new Map<string | number, AtlasTile>();
  private readonly freeBlocks: Array<{ x: number; y: number; size: number }> = [];

  constructor(size = 2048) {
    this.size = size;
    this.freeBlocks.push({ x: 0, y: 0, size });
  }

  allocate(id: string | number, desiredSize: number): AtlasTile | null {
    const targetSize = THREE.MathUtils.ceilPowerOfTwo(Math.max(desiredSize, 16));
    if (targetSize > this.size) return null;

    if (this.tiles.has(id)) {
      const existing = this.tiles.get(id)!;
      if (existing.size === targetSize) return existing;
      this.free(id);
    }

    // Find best-fit free block
    let bestIdx = -1;
    for (let i = 0; i < this.freeBlocks.length; i++) {
      if (this.freeBlocks[i].size >= targetSize) {
        if (bestIdx === -1 || this.freeBlocks[i].size < this.freeBlocks[bestIdx].size) {
          bestIdx = i;
        }
      }
    }

    if (bestIdx === -1) return null; // Atlas full

    const block = this.freeBlocks.splice(bestIdx, 1)[0];

    // Subdivide if block is larger than requested
    while (block.size > targetSize) {
      const half = block.size / 2;
      this.freeBlocks.push({ x: block.x + half, y: block.y, size: half });
      this.freeBlocks.push({ x: block.x, y: block.y + half, size: half });
      this.freeBlocks.push({ x: block.x + half, y: block.y + half, size: half });
      block.size = half;
    }

    const u = block.x / this.size;
    const v = block.y / this.size;
    const uvSize = targetSize / this.size;

    const tile: AtlasTile = {
      id,
      x: block.x,
      y: block.y,
      size: targetSize,
      viewport: [u, v, uvSize, uvSize],
      dirty: true,
    };

    this.tiles.set(id, tile);
    return tile;
  }

  free(id: string | number): void {
    const tile = this.tiles.get(id);
    if (!tile) return;

    this.freeBlocks.push({ x: tile.x, y: tile.y, size: tile.size });
    this.tiles.delete(id);
  }

  getTile(id: string | number): AtlasTile | undefined {
    return this.tiles.get(id);
  }

  allocatedIds(): Array<string | number> {
    return Array.from(this.tiles.keys());
  }

  markDirty(id: string | number): void {
    const tile = this.tiles.get(id);
    if (tile) tile.dirty = true;
  }

  clear(): void {
    this.tiles.clear();
    this.freeBlocks.length = 0;
    this.freeBlocks.push({ x: 0, y: 0, size: this.size });
  }
}
