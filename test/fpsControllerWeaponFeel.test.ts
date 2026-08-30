import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CameraArbitrator } from '../src/engine/CameraArbitrator';
import { PlayerController } from '../src/engine/PlayerController';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';

function createMockEngine(): any {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  camera.position.set(0, 1.7, 0);

  const bodies = new Map<number, any>();
  const entityIds = new Set<number>();
  const events = {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  };

  const scene = new THREE.Scene();

  const engine: any = {
    viewport: { camera, scene },
    physicsWorld: {
      raycast: vi.fn(() => null),
      raycastExcludeBody: vi.fn(() => null),
      step: vi.fn(),
      createCharacterController: vi.fn(() => ({
        enableAutostep: vi.fn(),
        enableSnapToGround: vi.fn(),
        setMaxSlopeClimbAngle: vi.fn(),
        setMinSlopeSlideAngle: vi.fn(),
        setApplyImpulsesToDynamicBodies: vi.fn(),
        setSlideEnabled: vi.fn(),
        computedMovement: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
        computeColliderMovement: vi.fn(),
      })),
    },
    sceneManager: {
      getRigidBody: (id: number) => bodies.get(id) ?? null,
      allEntityIds: () => Array.from(entityIds),
      events,
    },
    audio: { play: vi.fn() },
    effects: { shake: vi.fn() },
    input: {
      mode: 'play',
      isPointerLocked: true,
      getMouseDelta: () => ({ x: 0, y: 0 }),
      getActionAxis2D: () => ({ x: 0, y: 0 }),
      isMouseButtonDown: () => false,
      isKeyDown: () => false,
      isActionActive: () => false,
      isActionPressed: () => false,
      requestPointerLock: vi.fn(),
    },
    combat: {
      getHealth: () => ({ hp: 100, maxHp: 100 }),
      applyDamage: vi.fn(),
    },
    burstVfx: vi.fn(),
    findAnimationStateMachine: () => null,
    consumePendingPlayerTransform: vi.fn(),
    manifest: { load: vi.fn(() => Promise.resolve(new THREE.Group())) },
    assetCache: { release: vi.fn() },
  };

  const player = new PlayerController(engine);
  engine.player = player;

  // Add dummy player entity
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  playerMesh.position.set(0, 0, 0);
  const playerRb = {
    mesh: playerMesh,
    rapierBody: { translation: () => ({ x: 0, y: 0, z: 0 }) },
    setNextKinematicTranslation: vi.fn((pos) => playerMesh.position.copy(pos)),
    setNextKinematicRotation: vi.fn((rot) => playerMesh.quaternion.copy(rot)),
    setKinematicOverride: vi.fn(),
    resetInterpolationBuffers: vi.fn(),
  };
  bodies.set(1, playerRb);
  entityIds.add(1);
  player.possess(1);

  return { engine, player, bodies };
}

describe('CameraArbitrator & FPS Controller Weapon Feel', () => {
  it('arbitrates camera ownership modes and priorities correctly', () => {
    const arbitrator = new CameraArbitrator('third_person');
    expect(arbitrator.getActiveMode()).toBe('third_person');
    expect(arbitrator.isFirstPerson()).toBe(false);

    arbitrator.setBaseMode('first_person');
    expect(arbitrator.getActiveMode()).toBe('first_person');
    expect(arbitrator.isFirstPerson()).toBe(true);

    // Request cinematic override
    arbitrator.requestOverride({
      id: 'cutscene_1',
      mode: 'cinematic',
      priority: 10,
    });
    expect(arbitrator.getActiveMode()).toBe('cinematic');
    expect(arbitrator.isCinematic()).toBe(true);

    // Request lower priority dialogue override
    arbitrator.requestOverride({
      id: 'dialogue_1',
      mode: 'dialogue',
      priority: 5,
    });
    // Cinematic still wins
    expect(arbitrator.getActiveMode()).toBe('cinematic');

    // Release cinematic -> dialogue takes over
    arbitrator.releaseOverride('cutscene_1');
    expect(arbitrator.getActiveMode()).toBe('dialogue');

    // Release dialogue -> returns cleanly to base mode (first_person)
    arbitrator.releaseOverride('dialogue_1');
    expect(arbitrator.getActiveMode()).toBe('first_person');
  });

  it('updates first person camera position at eye height and recovers view kick recoil via spring physics', () => {
    const { engine, player } = createMockEngine();
    player.setCameraMode('first_person');
    expect(player.isFirstPerson()).toBe(true);

    // Apply recoil kick
    player.applyRecoil(0.05, 0.02);

    // Step update
    player.update(0.016);
    expect(player.getViewKickPitch()).toBeGreaterThan(0);

    // Step multiple frames: spring should pull kick back towards zero
    for (let i = 0; i < 40; i++) {
      player.update(0.016);
    }
    expect(Math.abs(player.getViewKickPitch())).toBeLessThan(0.01);
    expect(Math.abs(player.getViewKickYaw())).toBeLessThan(0.01);

    // Camera position should be at eye height (y ~ 1.68)
    const cam = engine.viewport.camera;
    expect(cam.position.y).toBeCloseTo(1.68, 1);
  });

  it('updates ADS transitions and recoil triggers in RangedShooterSystem', () => {
    const { engine, player } = createMockEngine();
    const gfm = new GameplayFeatureManager(engine);
    engine.gameplayFeatures = gfm;
    gfm.applyPreset('fps_starter');

    const ranged = gfm.ranged;
    expect(ranged.weapon?.id).toBe('fps_ak47');

    // Aim down sights
    ranged.setAiming(true);
    expect(ranged.aiming).toBe(true);

    ranged.update(0.1);
    expect(ranged.adsProgress).toBeGreaterThan(0.5);

    // Firing triggers recoil and shake
    const fired = ranged.trigger(true);
    expect(fired).toBe(true);
    expect(engine.effects.shake).toHaveBeenCalled();

    // Mouse look sway
    engine.input.getMouseDelta = () => ({ x: 20, y: -10 });
    ranged.update(0.016);
    expect(ranged.swayOffset.x).toBeLessThan(0); // Sways in opposite direction of mouse movement

    // Reloading
    const reloaded = ranged.reload();
    expect(reloaded).toBe(true);
    expect(ranged.reloading).toBe(true);
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('player_reloading', expect.any(Object));
  });
});
