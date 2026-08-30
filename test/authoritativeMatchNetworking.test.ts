import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { AuthoritativeMatchPolicy } from '../src/features/net/AuthoritativeMatchPolicy';
import { AuthoritativeShooterServer } from '../src/features/net/AuthoritativeShooterServer';

describe('Authoritative Multiplayer Match Policy & Anti-Exploit Validation', () => {
  it('validates client fire intents and rejects spoofed entity IDs', () => {
    const policy = new AuthoritativeMatchPolicy();
    policy.registerPeer('peer_123', 1, 'heaters');

    // Valid intent
    const valid = policy.validateFireIntent({
      sequence: 1,
      peerId: 'peer_123',
      shooterEntityId: 1,
      weaponId: 'fps_ak47',
      origin: [0, 1.5, 0],
      direction: [0, 0, 1],
      clientTimestamp: 1000,
    }, 1.0, 0.1);

    expect(valid.valid).toBe(true);

    // Spoofed entity ID (claims to be entity 2)
    const spoofed = policy.validateFireIntent({
      sequence: 2,
      peerId: 'peer_123',
      shooterEntityId: 2,
      weaponId: 'fps_ak47',
      origin: [0, 1.5, 0],
      direction: [0, 0, 1],
      clientTimestamp: 1100,
    }, 1.2, 0.1);

    expect(spoofed.valid).toBe(false);
    expect(spoofed.reason).toBe('spoofed_entity_id');
  });

  it('rejects duplicate or out-of-order sequence replay packets', () => {
    const policy = new AuthoritativeMatchPolicy();
    policy.registerPeer('peer_123', 1, 'heaters');

    policy.validateFireIntent({
      sequence: 5,
      peerId: 'peer_123',
      shooterEntityId: 1,
      weaponId: 'fps_ak47',
      origin: [0, 1.5, 0],
      direction: [0, 0, 1],
      clientTimestamp: 1000,
    }, 1.0, 0.1);

    // Replay sequence 5
    const replayed = policy.validateFireIntent({
      sequence: 5,
      peerId: 'peer_123',
      shooterEntityId: 1,
      weaponId: 'fps_ak47',
      origin: [0, 1.5, 0],
      direction: [0, 0, 1],
      clientTimestamp: 1050,
    }, 1.2, 0.1);

    expect(replayed.valid).toBe(false);
    expect(replayed.reason).toBe('replayed_or_duplicate_sequence');
  });

  it('rate-limits excessive fire rate / spamming', () => {
    const policy = new AuthoritativeMatchPolicy();
    policy.registerPeer('peer_123', 1, 'heaters');

    // First shot at t=1.0s (fire interval 0.1s)
    const shot1 = policy.validateFireIntent({
      sequence: 1,
      peerId: 'peer_123',
      shooterEntityId: 1,
      weaponId: 'fps_ak47',
      origin: [0, 1.5, 0],
      direction: [0, 0, 1],
      clientTimestamp: 1000,
    }, 1.0, 0.1);
    expect(shot1.valid).toBe(true);

    // Second shot at t=1.02s (only 20ms later, should be rejected)
    const shot2 = policy.validateFireIntent({
      sequence: 2,
      peerId: 'peer_123',
      shooterEntityId: 1,
      weaponId: 'fps_ak47',
      origin: [0, 1.5, 0],
      direction: [0, 0, 1],
      clientTimestamp: 1020,
    }, 1.02, 0.1);

    expect(shot2.valid).toBe(false);
    expect(shot2.reason).toBe('fire_rate_exceeded');
  });

  it('rejects origin teleportation away from verified player position', () => {
    const policy = new AuthoritativeMatchPolicy();
    policy.registerPeer('peer_123', 1, 'heaters');
    policy.updatePeerPosition('peer_123', new THREE.Vector3(0, 0, 0));

    // Shot origin placed 50 meters away
    const teleported = policy.validateFireIntent({
      sequence: 1,
      peerId: 'peer_123',
      shooterEntityId: 1,
      weaponId: 'fps_ak47',
      origin: [50, 1.5, 50],
      direction: [0, 0, 1],
      clientTimestamp: 1000,
    }, 1.0, 0.1);

    expect(teleported.valid).toBe(false);
    expect(teleported.reason).toBe('implausible_origin_teleport');
  });

  it('rejects CTF flag interactions when out of physical range', () => {
    const policy = new AuthoritativeMatchPolicy();
    policy.registerPeer('peer_123', 1, 'heaters');
    policy.updatePeerPosition('peer_123', new THREE.Vector3(0, 0, 0));

    // Flag is at (25, 0, 0)
    const flagPos = new THREE.Vector3(25, 0, 0);

    const outOfRange = policy.validateFlagIntent({
      sequence: 1,
      peerId: 'peer_123',
      actorEntityId: 1,
      action: 'pickup',
      flagTeam: 'rollers',
    }, flagPos);

    expect(outOfRange.valid).toBe(false);
    expect(outOfRange.reason).toBe('out_of_interaction_range');

    // Move close to flag
    policy.updatePeerPosition('peer_123', new THREE.Vector3(24.5, 0, 0));
    const inRange = policy.validateFlagIntent({
      sequence: 2,
      peerId: 'peer_123',
      actorEntityId: 1,
      action: 'pickup',
      flagTeam: 'rollers',
    }, flagPos);

    expect(inRange.valid).toBe(true);
  });

  it('runs authoritative server game loop and hit processing', () => {
    const bodies = new Map<number, any>();
    const entityIds = new Set<number>([1, 2]);
    const events = { emit: vi.fn(), on: vi.fn() };

    const body1Rapier = { id: 1 };
    const body2Rapier = { id: 2 };

    const mockEngine: any = {
      physicsWorld: {
        raycast: vi.fn(() => ({
          toi: 5.0,
          point: new THREE.Vector3(0, 1.5, 5),
          colliderHandle: 200,
          normal: new THREE.Vector3(0, 0, -1),
        })),
        rapierBodyFromColliderHandle: () => body2Rapier,
      },
      sceneManager: {
        getRigidBody: (id: number) => bodies.get(id) ?? null,
        allEntityIds: () => Array.from(entityIds),
        events,
      },
      combat: {
        applyDamage: vi.fn(),
        getHealth: () => ({ hp: 50, maxHp: 100 }),
      },
    };

    bodies.set(1, { mesh: { position: new THREE.Vector3(0, 0, 0) }, rapierBody: body1Rapier });
    bodies.set(2, { mesh: { position: new THREE.Vector3(0, 0, 5) }, rapierBody: body2Rapier });

    const server = new AuthoritativeShooterServer(mockEngine);
    server.registerPlayer('peer_1', 1, 'Player 1', 'heaters');
    server.registerPlayer('peer_2', 2, 'Player 2', 'rollers');

    server.match.startMatch();

    const handled = server.handleFireIntent({
      sequence: 1,
      peerId: 'peer_1',
      shooterEntityId: 1,
      weaponId: 'fps_ak47',
      origin: [0, 1.5, 0],
      direction: [0, 0, 1],
      clientTimestamp: 1000,
    });

    expect(handled).toBe(true);
    expect(mockEngine.combat.applyDamage).toHaveBeenCalledWith(1, 2, expect.any(Number));
  });

  it('validates reload sequence and replenishes grenades', () => {
    const policy = new AuthoritativeMatchPolicy();
    policy.registerPeer('peer_123', 1, 'heaters');

    // Expend ammo
    policy.validateFireIntent({
      sequence: 1,
      peerId: 'peer_123',
      shooterEntityId: 1,
      weaponId: 'fps_ak47',
      origin: [0, 1.5, 0],
      direction: [0, 0, 1],
      clientTimestamp: 1000,
    }, 1.0, 0.1);
    expect(policy.getSession('peer_123')?.ammo).toBe(29);

    // Validate reload
    const reloaded = policy.validateReloadIntent('peer_123', 2, 30);
    expect(reloaded.valid).toBe(true);
    expect(policy.getSession('peer_123')?.ammo).toBe(30);

    // Replenish grenades
    policy.replenishGrenades('peer_123', 2);
    expect(policy.getSession('peer_123')?.carriedGrenades).toBe(3);
  });
});
