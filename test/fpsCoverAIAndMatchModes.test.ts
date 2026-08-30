import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CoverPeekingSystem } from '../src/features/gameplay/CoverPeekingSystem';
import { StockCombatAIController, STOCK_COMBAT_ARCHETYPES } from '../src/features/gameplay/StockCombatAI';
import { ArenaMatchController } from '../src/features/gameplay/ArenaMatchModes';
import { ShooterArenaRecipe } from '../src/features/city/ShooterArenaRecipe';

function createMockEngine(): any {
  const bodies = new Map<number, any>();
  const entityIds = new Set<number>();
  const events = {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  };

  const coverSystem = new CoverPeekingSystem({} as any, {
    enabled: true,
    snapDistance: 1.5,
    lowCoverHeight: 1.0,
    highCoverHeight: 2.0,
    peekLeanDistance: 0.6,
  });

  const engine: any = {
    viewport: { camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000), scene: new THREE.Scene() },
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
    combat: {
      getHealth: () => ({ hp: 100, maxHp: 100 }),
      applyDamage: vi.fn(),
    },
    burstVfx: vi.fn(),
    player: {
      getPossessedId: () => 1,
    },
    findAnimationStateMachine: () => null,
    gameplayFeatures: {
      cover: coverSystem,
      encounterAI: {
        releaseAttackToken: vi.fn(),
        requestAttackToken: vi.fn(() => true),
      },
      hitboxes: {
        closeHitboxesForEntity: vi.fn(),
      },
    },
  };

  // Add player body
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  playerMesh.position.set(0, 0, 0);
  bodies.set(1, { mesh: playerMesh, rapierBody: {}, setNextKinematicTranslation: vi.fn(), setNextKinematicRotation: vi.fn() });
  entityIds.add(1);

  // Add enemy shooter body
  const enemyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  enemyMesh.position.set(10, 0, 10);
  bodies.set(2, { mesh: enemyMesh, rapierBody: {}, setNextKinematicTranslation: vi.fn(), setNextKinematicRotation: vi.fn() });
  entityIds.add(2);

  return { engine, coverSystem, bodies, entityIds };
}

describe('Cover-Aware Ranged Enemy AI & Match Modes', () => {
  it('registers, reserves, scores, and releases cover nodes correctly', () => {
    const { coverSystem } = createMockEngine();

    // Register two cover nodes
    coverSystem.registerCoverNode({
      id: 'cover_front',
      position: new THREE.Vector3(5, 0, 5),
      normal: new THREE.Vector3(-1, 0, -1).normalize(),
      type: 'high',
      reservedBy: null,
    });

    coverSystem.registerCoverNode({
      id: 'cover_back',
      position: new THREE.Vector3(15, 0, 15),
      normal: new THREE.Vector3(1, 0, 1).normalize(),
      type: 'low',
      reservedBy: null,
    });

    expect(coverSystem.getCoverNodes().length).toBe(2);

    // AI at (10, 0, 10), Player threat at (0, 0, 0)
    // cover_front is between AI and player with normal facing threat -> best cover
    const best = coverSystem.findBestCover(new THREE.Vector3(10, 0, 10), new THREE.Vector3(0, 0, 0));
    expect(best?.id).toBe('cover_front');

    // Reserve cover
    const reserved = coverSystem.reserveCover('cover_front', 2);
    expect(reserved).toBe(true);

    // Cannot be reserved by another entity
    const secondReserve = coverSystem.reserveCover('cover_front', 3);
    expect(secondReserve).toBe(false);

    // Release cover
    coverSystem.releaseCover(2);
    expect(coverSystem.getCoverNodes().find(n => n.id === 'cover_front')?.reservedBy).toBeNull();
  });

  it('runs shooter AI state transitions from approach to cover seeking and peek fire', () => {
    const { engine, coverSystem } = createMockEngine();

    coverSystem.registerCoverNode({
      id: 'cover_node_1',
      position: new THREE.Vector3(8, 0, 8),
      normal: new THREE.Vector3(-1, 0, -1).normalize(),
      type: 'low',
      reservedBy: null,
    });

    const ai = new StockCombatAIController(engine, 2, STOCK_COMBAT_ARCHETYPES.shooter);

    // Step update: AI approaches and transitions to cover_seek
    ai.update(0.1);
    expect(ai.getState()).toBe('cover_seek');

    // Step AI to reach cover position
    engine.sceneManager.getRigidBody(2).mesh.position.set(8.2, 0, 8.2);
    ai.update(0.1);
    expect(ai.getState()).toBe('in_cover');

    // Dispose releases cover
    ai.dispose();
    expect(ai.getState()).toBe('dead');
    expect(coverSystem.getCoverNodes().find(n => n.id === 'cover_node_1')?.reservedBy).toBeNull();
  });

  it('handles FFA, TDM, and CTF match state transitions, flag captures, and score limits', () => {
    const { engine } = createMockEngine();
    const match = new ArenaMatchController(engine, 'ctf');

    match.registerPlayer(1, 'Player1', 'heaters');
    match.registerPlayer(2, 'Player2', 'rollers');

    match.startMatch();
    expect(match.getState()).toBe('in_progress');

    const flagRoller = match.getFlagState('rollers');
    expect(flagRoller?.status).toBe('base');

    // Player 1 picks up Rollers flag
    const pickedUp = match.pickupFlag('rollers', 1);
    expect(pickedUp).toBe(true);
    expect(flagRoller?.status).toBe('carried');
    expect(flagRoller?.carrierId).toBe(1);

    // Player 1 carries flag to Heaters home base and captures
    const captured = match.captureFlag('rollers', 1);
    expect(captured).toBe(true);
    expect(match.getTeamScores().heaters).toBe(1);
    expect(flagRoller?.status).toBe('base'); // returned to base

    // Switch to FFA mode and test kill limit
    match.setMode('ffa', { killLimit: 2 });
    match.startMatch();

    match.recordKill(1, 2);
    expect(match.getScores().find(s => s.entityId === 1)?.kills).toBe(1);
    expect(match.getState()).toBe('in_progress');

    match.recordKill(1, 2);
    // Reached kill limit of 2 -> match ended
    expect(match.getState()).toBe('ended');
  });

  it('builds ShooterArenaRecipe and tears down cleanly', () => {
    const { engine } = createMockEngine();
    const recipe = new ShooterArenaRecipe(engine);
    recipe.buildArena();

    expect(recipe.getRoot().children.length).toBeGreaterThan(10);
    expect(engine.viewport.scene.children).toContain(recipe.getRoot());

    recipe.clear();
    expect(recipe.getRoot().children.length).toBe(0);
  });
});
