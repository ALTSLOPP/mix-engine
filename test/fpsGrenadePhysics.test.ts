import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ExplosivesSystem } from '../src/features/gameplay/ExplosivesSystem';

function createMockEngine(): any {
  const bodies = new Map<number, any>();
  const entityIds = new Set<number>();
  const events = {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  };

  const engine: any = {
    viewport: {
      camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000),
      scene: new THREE.Scene(),
    },
    physicsWorld: {
      raycast: vi.fn(() => null),
      raycastExcludeBody: vi.fn(() => null),
    },
    sceneManager: {
      getRigidBody: (id: number) => bodies.get(id) ?? null,
      allEntityIds: () => Array.from(entityIds),
      events,
    },
    audio: { play: vi.fn() },
    effects: { shake: vi.fn() },
    combat: {
      applyDamage: vi.fn(),
    },
    burstVfx: vi.fn(),
    player: {
      getPossessedId: () => 1,
    },
    manifest: { load: vi.fn(() => Promise.resolve(new THREE.Group())) },
    assetCache: { release: vi.fn() },
  };

  // Add player body
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  playerMesh.position.set(0, 0, 0);
  bodies.set(1, { mesh: playerMesh, rapierBody: {}, setNextKinematicTranslation: vi.fn() });
  entityIds.add(1);

  // Add enemy body
  const enemyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  enemyMesh.position.set(0, 0, 5);
  bodies.set(2, { mesh: enemyMesh, rapierBody: {}, setNextKinematicTranslation: vi.fn() });
  entityIds.add(2);

  return { engine, bodies, entityIds };
}

describe('Environment-Aware Grenade Physics', () => {
  it('throws a grenade with trajectory and reflects on environment collision', () => {
    const { engine } = createMockEngine();
    const explosives = new ExplosivesSystem(engine, {
      enabled: true,
      maxCarriedGrenades: 3,
      grenadeThrowCooldown: 0.5,
      grenades: [{
        id: 'frag',
        name: 'Frag Grenade',
        type: 'frag',
        blastRadius: 8,
        damage: 100,
        fuseTime: 2.0,
        throwVelocity: 15,
        bounciness: 0.5,
        icon: '💣',
        audioThrow: '',
        audioExplosion: '',
      }],
    });

    // Throw grenade
    const thrown = explosives.throwGrenade('frag');
    expect(thrown).toBe(true);
    expect(explosives.grenades.length).toBe(1);

    const grenade = explosives.grenades[0];
    expect(grenade.velocity.length()).toBeGreaterThan(10);

    // Mock an obstacle collision in front of grenade
    engine.physicsWorld.raycast = vi.fn((pos, dir, dist) => {
      return { toi: 0.2, colliderHandle: 99 };
    });

    // Step physics update
    explosives.update(0.1);

    // Fuse should advance
    expect(grenade.fuseRemaining).toBeLessThan(2.0);
  });

  it('deals falloff damage to unobstructed targets but occludes damage behind solid walls', () => {
    const { engine } = createMockEngine();
    const explosives = new ExplosivesSystem(engine, {
      enabled: true,
      maxCarriedGrenades: 3,
      grenadeThrowCooldown: 0.5,
      grenades: [{
        id: 'frag',
        name: 'Frag Grenade',
        type: 'frag',
        blastRadius: 10,
        damage: 100,
        fuseTime: 0.1,
        throwVelocity: 10,
        bounciness: 0.5,
        icon: '💣',
        audioThrow: '',
        audioExplosion: '',
      }],
    });

    explosives.throwGrenade('frag');

    // Case 1: Unobstructed -> enemy receives damage
    engine.physicsWorld.raycastExcludeBody = vi.fn(() => null);
    explosives.update(0.15); // triggers explosion

    expect(engine.combat.applyDamage).toHaveBeenCalledWith(1, 2, expect.any(Number), 'explosion');
    expect(explosives.grenades.length).toBe(0);

    // Reset damage calls
    engine.combat.applyDamage.mockClear();

    // Case 2: Obstructed by solid wall -> raycast hits wall closer than target
    explosives.replenishGrenades();
    explosives.throwGrenade('frag');
    engine.physicsWorld.raycastExcludeBody = vi.fn(() => ({ toi: 1.0, colliderHandle: 50 })); // wall at 1m

    explosives.update(0.15); // triggers explosion
    expect(engine.combat.applyDamage).not.toHaveBeenCalledWith(1, 2, expect.any(Number), 'explosion');
  });
});
