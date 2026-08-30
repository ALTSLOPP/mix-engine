import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { WantedCrimeSystem } from '../src/features/gameplay/WantedCrimeSystem';
import { PoliceResponseSystem } from '../src/features/gameplay/PoliceResponseSystem';

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

  const mock: any = {
    viewport: { scene, camera: new THREE.PerspectiveCamera() },
    sceneManager: {
      getRigidBody: (id: number) => bodies.get(id) ?? null,
      events,
    },
    player: {
      getPossessedId: () => 1,
    },
    combat: {
      applyDamage: vi.fn(),
    },
    burstVfx: vi.fn(),
    audio: { play: vi.fn() },
  };
  return mock;
}

describe('GTA Wanted & Crime System', () => {
  it('registers crimes, escalates wanted level, and tracks heat', () => {
    const engine = createMockEngine();
    const wanted = new WantedCrimeSystem(engine, {
      enabled: true,
      maxWantedLevel: 5,
      cooldownAfterCrimeSec: 5.0,
      decayWindowFootSec: 10.0,
      decayWindowVehicleSec: 20.0,
      crimeThresholds: {
        shooting_in_public: 20,
        vehicle_theft: 40,
        assault: 45,
        hit_and_run: 60,
        resisting_arrest: 80,
        homicide: 100,
      },
    });

    expect(wanted.getWantedLevel()).toBe(0);

    // Commit minor crime (shooting in public) -> 1 star
    wanted.reportCrime('shooting_in_public');
    expect(wanted.getWantedLevel()).toBe(1);
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('crime_committed', expect.any(Object));

    // Commit major crime (homicide) -> heat accumulates, escalates
    wanted.reportCrime('homicide');
    expect(wanted.getWantedLevel()).toBeGreaterThanOrEqual(2);
  });

  it('decays wanted level when safe and cooled down', () => {
    const engine = createMockEngine();
    const wanted = new WantedCrimeSystem(engine, {
      enabled: true,
      maxWantedLevel: 5,
      cooldownAfterCrimeSec: 2.0,
      decayWindowFootSec: 4.0,
      decayWindowVehicleSec: 8.0,
      crimeThresholds: {
        shooting_in_public: 20,
        vehicle_theft: 40,
        assault: 45,
        hit_and_run: 60,
        resisting_arrest: 80,
        homicide: 100,
      },
    });

    wanted.setWantedLevel(2);
    expect(wanted.getWantedLevel()).toBe(2);

    // With active pursuit, decay is blocked
    wanted.setPursuitActive(true);
    wanted.update(5.0, false);
    expect(wanted.getWantedLevel()).toBe(2);

    // Lose pursuit, wait for cooldown (2.0s) + decay window (4.0s)
    wanted.setPursuitActive(false);
    wanted.update(2.5, false); // cools down
    wanted.update(4.2, false); // decay triggers
    expect(wanted.getWantedLevel()).toBe(1);

    // Another decay window clears wanted level
    wanted.update(4.2, false);
    expect(wanted.getWantedLevel()).toBe(0);
  });
});

describe('GTA Police Response System', () => {
  it('scales squad units with wanted level and engages player', () => {
    const engine = createMockEngine();
    const police = new PoliceResponseSystem(engine, {
      enabled: true,
      maxUnits: 6,
      basePatrolUnits: 1,
      unitsPerWantedLevel: 1,
      officerSpeed: 5.0,
      cruiserSpeed: 20.0,
      arrestDistance: 2.0,
      shootDistance: 20.0,
      shootInterval: 0.5,
      officerModelAssetId: 'officer',
      cruiserModelAssetId: 'cruiser',
    });

    // 0 stars -> base patrol unit
    police.update(0.1, 0, false);
    const activePatrol = police.getUnits().filter(u => u.position.y > -100);
    expect(activePatrol.length).toBe(1);

    // 3 stars -> scales up units, officers pursue towards player
    police.update(0.1, 3, false);
    const activePursuit = police.getUnits().filter(u => u.position.y > -100);
    expect(activePursuit.length).toBe(4); // 1 base + 3*1 = 4
  });

  it('triggers bust / arrest when close to player for duration', () => {
    const engine = createMockEngine();
    const police = new PoliceResponseSystem(engine, {
      enabled: true,
      maxUnits: 2,
      basePatrolUnits: 1,
      unitsPerWantedLevel: 1,
      officerSpeed: 5.0,
      cruiserSpeed: 20.0,
      arrestDistance: 5.0,
      shootDistance: 20.0,
      shootInterval: 0.5,
      officerModelAssetId: 'officer',
      cruiserModelAssetId: 'cruiser',
    });

    police.update(0.1, 1, false);

    // Place officer right next to player (dist < 5.0)
    const unit = police.getUnits()[0];
    unit.position.set(1.0, 0.8, 1.0);
    unit.mode = 'pursuit_foot';

    // Update for 2.2 seconds to complete arrest threshold
    police.update(1.0, 1, false);
    police.update(1.2, 1, false);

    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('player_busted', expect.objectContaining({ wantedLevel: 1 }));
  });
});
