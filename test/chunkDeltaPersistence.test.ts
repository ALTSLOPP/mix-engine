import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ChunkDeltaRegistry } from '../src/streaming/ChunkDeltaRegistry';

describe('ChunkDeltaRegistry Open-World Modification Persistence', () => {
  it('records destroyed entities and prevents them from respawning on reload', () => {
    const registry = new ChunkDeltaRegistry();

    expect(registry.isDestroyed('c_0_0', 'barrel_42')).toBe(false);

    registry.markDestroyed('c_0_0', 'barrel_42');
    expect(registry.isDestroyed('c_0_0', 'barrel_42')).toBe(true);

    let despawnedId: number | null = null;
    const mockSceneManager: any = {
      destroyNow: (id: number) => {
        despawnedId = id;
      },
      getComponent: () => null,
    };

    const destroyed = registry.applyDeltaToEntity('c_0_0', 'barrel_42', 101, mockSceneManager);
    expect(destroyed).toBe(true);
    expect(despawnedId).toBe(101);
  });

  it('records transform modifications and custom gameplay states across serialization', () => {
    const registry = new ChunkDeltaRegistry();

    const newPos = new THREE.Vector3(12.5, 4.0, -8.2);
    const newRot = new THREE.Quaternion(0, 0.707, 0, 0.707);

    registry.recordTransform('c_1_2', 'boulder_1', newPos, newRot);
    registry.setCustomState('c_1_2', 'chest_opened', true);

    const json = registry.serialize();

    const restoredRegistry = new ChunkDeltaRegistry();
    restoredRegistry.deserialize(json);

    const delta = restoredRegistry.getDeltas('c_1_2');
    expect(delta).toBeDefined();
    expect(delta?.transforms['boulder_1'].position).toEqual([12.5, 4.0, -8.2]);
    expect(restoredRegistry.getCustomState('c_1_2', 'chest_opened')).toBe(true);
  });
});
