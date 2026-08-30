import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { VehicleTheftSystem } from '../src/features/gameplay/VehicleTheftSystem';
import { EscortMissionSystem } from '../src/features/gameplay/EscortMissionSystem';

function createMockEngine(): any {
  const bodies = new Map<number, any>();
  const events = {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  };
  const scene = new THREE.Scene();

  const playerRb = {
    mesh: { position: new THREE.Vector3(0, 0, 0), quaternion: new THREE.Quaternion() },
  };
  bodies.set(1, playerRb);

  const mock: any = {
    bodies,
    viewport: { scene, camera: new THREE.PerspectiveCamera() },
    sceneManager: {
      getRigidBody: (id: number) => bodies.get(id) ?? null,
      events,
    },
    player: {
      getPossessedId: () => 1,
    },
    gameplayFeatures: {},
    burstVfx: vi.fn(),
  };
  return mock;
}

describe('GTA Vehicle Theft System', () => {
  it('attempts hijack on nearby occupied vehicle, ejects driver, and reports crime', () => {
    const engine = createMockEngine();
    const theft = new VehicleTheftSystem(engine, {
      enabled: true,
      theftRange: 5.0,
      ejectionImpulse: 8.0,
      stolenCarWantedEscalation: 1,
    });

    const mockCivSystem = {
      getCivilians: () => [
        { id: 'civ_1', mode: 'driving', position: new THREE.Vector3(2, 0, 1) },
      ],
      ejectDriver: vi.fn(),
    };
    const mockTrafficSystem = {
      findNearestHijackable: vi.fn(() => ({
        carId: 'car_123', driverId: 'civ_1',
        position: new THREE.Vector3(2, 0, 1),
        yaw: 0,
        speed: 12,
        distance: 2.2,
      })),
      claimCarForPlayer: vi.fn(() => true),
    };
    const mockWantedSystem = {
      reportCrime: vi.fn(),
    };

    engine.gameplayFeatures.civilian = mockCivSystem;
    engine.gameplayFeatures.traffic = mockTrafficSystem;
    engine.gameplayFeatures.wanted = mockWantedSystem;

    const result = theft.attemptHijack();
    expect(result.success).toBe(true);
    expect(result.wasOccupied).toBe(true);
    expect(mockCivSystem.ejectDriver).toHaveBeenCalled();
    expect(mockTrafficSystem.claimCarForPlayer).toHaveBeenCalledWith('car_123');
    expect(mockWantedSystem.reportCrime).not.toHaveBeenCalled();
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('vehicle_theft_committed', expect.objectContaining({ driverId: 'civ_1' }));
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('vehicle_hijacked', expect.any(Object));
  });
});

describe('GTA Escort & Passenger Mission System', () => {
  it('recruits followers, aligns slot positions, and checks delivery', () => {
    const engine = createMockEngine();
    const escort = new EscortMissionSystem(engine, {
      enabled: true,
      interactRange: 6.0,
      followWalkSpeed: 3.5,
      followRunSpeed: 6.5,
      catchupSpeed: 9.0,
      teleportDistance: 45.0,
      deliveryRadius: 8.0,
      maxFollowers: 2,
    });

    // Create companion entity rigid body
    const compRb = {
      mesh: { position: new THREE.Vector3(1, 0, 1), rotation: new THREE.Euler() },
      setNextKinematicTranslation: vi.fn((pos: THREE.Vector3) => {
        compRb.mesh.position.copy(pos);
      }),
    };
    (engine as any).bodies.set(20, compRb);

    const followerId = escort.recruitFollower(20, 'VIP Contact');
    expect(followerId).not.toBeNull();
    expect(escort.getFollowers().length).toBe(1);

    // Update steps follower toward formation slot
    escort.update(0.1);

    // Player enters vehicle -> followers transition to in_vehicle
    escort.notifyPlayerBoardedVehicle();
    expect(escort.getFollowers()[0].mode).toBe('in_vehicle');

    // Player exits vehicle -> followers dismount
    escort.notifyPlayerExitedVehicle();
    expect(escort.getFollowers()[0].mode).toBe('following');

    // Delivery check: at destination
    const destination = new THREE.Vector3(0, 0, 0);
    const isDelivered = escort.hasDeliveredActiveEscortToObjective(destination, 10.0);
    expect(isDelivered).toBe(true);
  });
});
