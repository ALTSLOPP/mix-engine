import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ActiveRagdoll } from '../src/physics/ActiveRagdoll';

describe('ActiveRagdoll Controller', () => {
  it('controls muscle strength and handles limp knockdown states', () => {
    const mockRagdoll: any = {
      rootEntity: 1,
      parts: [
        { name: 'head', entityId: 10, boneName: 'Head', size: [0.1, 0.1, 0.1] },
        { name: 'chest', entityId: 11, boneName: 'Spine1', size: [0.2, 0.2, 0.2] },
      ],
      jointIds: ['j1'],
      active: true,
    };

    const mockSceneManager: any = {
      getComponent: () => ({
        rapierBody: {
          applyImpulse: () => {},
          linvel: () => ({ x: 0, y: 0, z: 0 }),
          rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
          angvel: () => ({ x: 0, y: 0, z: 0 }),
          applyTorqueImpulse: () => {},
        },
      }),
    };

    const activeRagdoll = new ActiveRagdoll(mockRagdoll, mockSceneManager, {
      muscleStiffness: 200,
      muscleDamping: 20,
    });

    expect(activeRagdoll.strength).toBe(1.0);

    activeRagdoll.setStrength(0.5);
    expect(activeRagdoll.strength).toBe(0.5);

    activeRagdoll.knockdown(3.0);
    expect(activeRagdoll.strength).toBe(0.0);

    const impulseApplied = activeRagdoll.applyHitImpulse('head', new THREE.Vector3(0, 10, -5));
    expect(impulseApplied).toBe(true);
    expect(activeRagdoll.isResting()).toBe(true);
  });
});
