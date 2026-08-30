import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { TrafficSimulationSystem } from '../src/features/gameplay/TrafficSimulationSystem';
import { CivilianPopulationSystem } from '../src/features/gameplay/CivilianPopulationSystem';

function createMockEngine(): any {
  const bodies = new Map<number, any>();
  const events = {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  };
  const scene = new THREE.Scene();

  const playerRb = {
    mesh: { position: new THREE.Vector3(0, 0, 0) },
  };
  bodies.set(1, playerRb);

  return {
    viewport: { scene, camera: new THREE.PerspectiveCamera() },
    sceneManager: {
      getRigidBody: (id: number) => bodies.get(id) ?? null,
      events,
    },
    player: {
      getPossessedId: () => 1,
    },
  };
}

describe('GTA Traffic Simulation System', () => {
  it('generates multi-lane routes and spawns cars with distance-based recycling', () => {
    const engine = createMockEngine();
    const traffic = new TrafficSimulationSystem(engine, {
      enabled: true,
      maxCars: 8,
      spawnRangeMin: 20,
      despawnRange: 100,
      minSpeed: 10,
      maxSpeed: 15,
      visibleRange: 80,
      laneOffset: 4.0,
      modelAssetIds: ['car_sedan', 'car_suv'],
    });

    expect(traffic.getRoutes().length).toBeGreaterThan(0);

    // Initial update spawns car pool
    traffic.update(0.1);
    expect(traffic.getCars().length).toBe(8);
    expect(traffic.getRoot().children.length).toBe(8);

    const activeCars = traffic.getCars().filter(c => c.active);
    expect(activeCars.length).toBe(8);

    // Teleport car beyond despawn range
    activeCars[0].position.set(500, 0, 500);
    traffic.update(0.1);
    // Next update recycles it back near player spawn range
    traffic.update(0.1);
    expect(activeCars[0].active).toBe(true);
    expect(activeCars[0].position.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(200);
  });

  it('finds nearest hijackable vehicle and claims it for player', () => {
    const engine = createMockEngine();
    const traffic = new TrafficSimulationSystem(engine, {
      enabled: true,
      maxCars: 4,
      spawnRangeMin: 10,
      despawnRange: 100,
      minSpeed: 10,
      maxSpeed: 15,
      visibleRange: 80,
      laneOffset: 4.0,
      modelAssetIds: ['car_sedan'],
    });

    traffic.update(0.1);

    const nearest = traffic.findNearestHijackable(new THREE.Vector3(0, 0, 0), 200);
    expect(nearest).not.toBeNull();

    if (nearest) {
      const claimed = traffic.claimCarForPlayer(nearest.carId);
      expect(claimed).toBe(true);
      expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('traffic_car_claimed', expect.objectContaining({ carId: nearest.carId }));
    }
  });
});

describe('GTA Civilian Population System', () => {
  it('simulates walking/driving pedestrians and responds to gunfire with panic', () => {
    const engine = createMockEngine();
    const civSystem = new CivilianPopulationSystem(engine, {
      enabled: true,
      maxWalkers: 6,
      maxDrivers: 2,
      spawnRangeMin: 10,
      despawnRange: 120,
      walkerSpeed: 2.0,
      panicSpeed: 5.0,
      health: 100,
      panicRadius: 40,
      modelAssetIds: ['civ_walker'],
    });

    civSystem.update(0.1);
    expect(civSystem.getCivilians().length).toBe(8);

    const firstCiv = civSystem.getCivilians()[0];
    const initialPos = firstCiv.position.clone();

    // Step forward walking
    civSystem.update(0.5);
    expect(firstCiv.position.distanceTo(initialPos)).toBeGreaterThan(0);

    // Trigger gunfire near civilian
    civSystem.reactToGunfire(firstCiv.position, 50);
    expect(firstCiv.mode).toBe('panicking');
    expect(firstCiv.panicTimer).toBeGreaterThan(0);
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('civilian_panicked', expect.any(Object));
  });

  it('handles civilian damage, lethal defeat, and driver vehicle ejection', () => {
    const engine = createMockEngine();
    const civSystem = new CivilianPopulationSystem(engine, {
      enabled: true,
      maxWalkers: 2,
      maxDrivers: 1,
      spawnRangeMin: 5,
      despawnRange: 100,
      walkerSpeed: 2.0,
      panicSpeed: 5.0,
      health: 50,
      panicRadius: 30,
      modelAssetIds: ['civ_walker'],
    });

    civSystem.update(0.1);
    const civ = civSystem.getCivilians()[0];

    // Non-lethal damage causes panic
    civSystem.applyDamage(civ.id, 20);
    expect(civ.health).toBe(30);
    expect(civ.mode).toBe('panicking');

    // Lethal damage kills civilian
    const killed = civSystem.applyDamage(civ.id, 40, 1);
    expect(killed).toBe(true);
    expect(civ.mode).toBe('dead');
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('civilian_killed', expect.objectContaining({ civilianId: civ.id, killerEntityId: 1 }));

    // Eject driver
    const driver = civSystem.getCivilians()[1];
    civSystem.ejectDriver(driver.id, new THREE.Vector3(1, 0, 0));
    expect(driver.mode).toBe('ejected');
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('civilian_ejected', expect.objectContaining({ civilianId: driver.id }));
  });
});
