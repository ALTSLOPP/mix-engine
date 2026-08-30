import { describe, it, expect } from 'vitest';
import {
  WorldPartitioner,
  StreamingBundler,
  CHUNK_SIZE,
  GLOBAL_CHUNK,
} from '../src/streaming';
import type { EntityRecord } from '../src/project/ProjectDocument';

describe('WorldPartitioner Unit Tests', () => {
  it('partitions entities into grid cells by world position', () => {
    const entities: EntityRecord[] = [
      {
        guid: 'g-1',
        name: 'OriginBox',
        blueprint: { kind: 'box', params: {} },
        transform: { position: [10, 0, 10], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
      {
        guid: 'g-2',
        name: 'EastBox',
        blueprint: { kind: 'box', params: {} },
        transform: { position: [CHUNK_SIZE + 10, 0, 10], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
      {
        guid: 'g-3',
        name: 'GlobalSun',
        chunkId: GLOBAL_CHUNK,
        blueprint: { kind: 'sun', params: {} },
        transform: { position: [0, 100, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
    ];

    const result = WorldPartitioner.partition(entities, CHUNK_SIZE);

    expect(result.totalEntities).toBe(3);
    expect(result.globalEntities).toHaveLength(1);
    expect(result.globalEntities[0].guid).toBe('g-3');

    // Two distinct spatial cells
    expect(result.cells.size).toBe(2);
    expect(result.cells.has('0|0')).toBe(true);
    expect(result.cells.has('1|0')).toBe(true);

    const cell00 = result.cells.get('0|0')!;
    expect(cell00.entities).toHaveLength(1);
    expect(cell00.entities[0].guid).toBe('g-1');

    const cell10 = result.cells.get('1|0')!;
    expect(cell10.entities).toHaveLength(1);
    expect(cell10.entities[0].guid).toBe('g-2');
  });

  it('keeps child entities in the same chunk as their parent regardless of child offset', () => {
    const entities: EntityRecord[] = [
      {
        guid: 'g-parent',
        name: 'ParentEntity',
        blueprint: { kind: 'parent', params: {} },
        transform: { position: [10, 0, 10], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] }, // in 0|0
      },
      {
        guid: 'g-child',
        name: 'ChildFarAway',
        parentGuid: 'g-parent',
        blueprint: { kind: 'child', params: {} },
        transform: { position: [CHUNK_SIZE * 5, 0, CHUNK_SIZE * 5], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] }, // far coordinate
      },
    ];

    const result = WorldPartitioner.partition(entities, CHUNK_SIZE);

    // Both parent and child should be bundled into cell 0|0
    expect(result.cells.size).toBe(1);
    const cell = result.cells.get('0|0')!;
    expect(cell.entities).toHaveLength(2);
    expect(cell.entities.map((e) => e.guid)).toContain('g-parent');
    expect(cell.entities.map((e) => e.guid)).toContain('g-child');
  });
});

describe('StreamingBundler Unit Tests', () => {
  it('bundles partitioned cells with grid-local coordinates', () => {
    const entities: EntityRecord[] = [
      {
        guid: 'g-east-1',
        name: 'EastProp',
        blueprint: { kind: 'tree', params: {} },
        transform: { position: [CHUNK_SIZE + 20, 5, CHUNK_SIZE + 30], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
    ];

    const partition = WorldPartitioner.partition(entities, CHUNK_SIZE);
    const worldBundle = StreamingBundler.bundleWorld(partition);

    expect(worldBundle.totalChunks).toBe(1);
    expect(worldBundle.chunks['1|1']).toBeDefined();

    const chunk11 = worldBundle.chunks['1|1'];
    expect(chunk11.cx).toBe(1);
    expect(chunk11.cz).toBe(1);
    expect(chunk11.entities).toHaveLength(1);

    // Local coordinates should be relative to anchor (CHUNK_SIZE, 0, CHUNK_SIZE)
    const localEntity = chunk11.entities[0];
    expect(localEntity.localPos[0]).toBeCloseTo(20);
    expect(localEntity.localPos[1]).toBeCloseTo(5);
    expect(localEntity.localPos[2]).toBeCloseTo(30);
    expect(chunk11.hash).toBeDefined();
  });
});
