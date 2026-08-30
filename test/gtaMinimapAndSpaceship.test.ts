import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { MinimapRadarSystem } from '../src/features/gameplay/MinimapRadarSystem';
import { SpaceshipFlightSystem } from '../src/features/gameplay/SpaceshipFlightSystem';

function createMockEngine(): any {
  const events = {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  };
  const camera = new THREE.PerspectiveCamera();
  const scene = new THREE.Scene();

  const mock: any = {
    viewport: { scene, camera },
    sceneManager: { events },
    cameraArbitrator: {
      requestMode: vi.fn(),
      releaseMode: vi.fn(),
    },
    burstVfx: vi.fn(),
  };
  return mock;
}

describe('GTA Minimap & Radar System', () => {
  it('registers generic markers and computes relative clamped projected blips', () => {
    const engine = createMockEngine();
    const radar = new MinimapRadarSystem(engine, {
      enabled: true,
      radius: 50,
      zoom: 1.0,
      rotateWithPlayer: true,
      showCardinals: true,
      showBorder: true,
      radarColor: '#00f0ff',
    });

    radar.registerMarker({
      id: 'objective_1',
      type: 'objective',
      position: new THREE.Vector3(10, 0, 20),
      label: 'HQ',
      visible: true,
    });

    radar.registerMarker({
      id: 'far_contact',
      type: 'contact',
      position: new THREE.Vector3(500, 0, 500),
      label: 'VIP',
      visible: true,
      clampToEdge: true,
    });

    const playerPos = new THREE.Vector3(0, 0, 0);
    const blips = radar.getProjectedBlips(playerPos, 0);
    expect(blips.length).toBe(2);

    const nearBlip = blips.find((b) => b.id === 'objective_1');
    expect(nearBlip).toBeDefined();
    expect(nearBlip?.isClamped).toBe(false);

    const farBlip = blips.find((b) => b.id === 'far_contact');
    expect(farBlip).toBeDefined();
    expect(farBlip?.isClamped).toBe(true);
    // Clamped distance should equal radar radius (50)
    const clampedDist = Math.sqrt((farBlip?.radarX ?? 0) ** 2 + (farBlip?.radarY ?? 0) ** 2);
    expect(clampedDist).toBeCloseTo(50, 1);
  });
});

describe('GTA Spaceship Flight System', () => {
  it('controls 6-DOF flight dynamics, boost, barrel rolls, and camera modes', () => {
    const engine = createMockEngine();
    const ship = new SpaceshipFlightSystem(engine, {
      enabled: true,
      maxSpeed: 80,
      turboSpeed: 180,
      accel: 50,
      brake: 60,
      drag: 10,
      verticalSpeed: 30,
      turnRate: 1.5,
      pitchRate: 1.2,
      rollRate: 2.0,
      bankMax: 0.5,
      barrelRollDuration: 0.5,
    });

    expect(ship.getState().isFlying).toBe(false);

    // Start flight
    ship.startFlight(new THREE.Vector3(0, 50, 0), 0);
    expect(ship.getState().isFlying).toBe(true);
    expect(engine.cameraArbitrator.requestMode).toHaveBeenCalledWith('vehicle_mount', 40);

    // Accelerate with full throttle & turbo boost
    ship.update(0.2, 1.0, 0, 0, 0, true);
    expect(ship.getState().speed).toBeGreaterThan(0);
    expect(ship.getState().isTurboActive).toBe(true);

    // Trigger barrel roll
    const rolled = ship.triggerBarrelRoll('right');
    expect(rolled).toBe(true);
    expect(ship.getState().isBarrelRolling).toBe(true);
    expect(ship.getState().barrelRollDirection).toBe('right');

    // Cycle camera modes
    const nextMode = ship.cycleCameraMode();
    expect(nextMode).toBe('rear');

    // End flight
    ship.endFlight();
    expect(ship.getState().isFlying).toBe(false);
    expect(engine.cameraArbitrator.releaseMode).toHaveBeenCalledWith('vehicle_mount');
  });
});
