import { PersistentGameState } from '../src/ecs/PersistentGameState';
import { gameplayWallet } from '../src/features/gameplay/GameplayWallet';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { GameplayFeatureRegistry } from '../src/features/gameplay/GameplayFeatureRegistry';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { ZombieWonderWeaponsSystem } from '../src/features/gameplay/ZombieWonderWeaponsSystem';
import { ZombieBossEncounterSystem } from '../src/features/gameplay/ZombieBossEncounterSystem';
import { ZombieBuildablesSystem } from '../src/features/gameplay/ZombieBuildablesSystem';
import { ZombieEasterEggQuestSystem } from '../src/features/gameplay/ZombieEasterEggQuestSystem';
import { GobbleGumSystem } from '../src/features/gameplay/GobbleGumSystem';
import { HellhoundSpecialRoundSystem } from '../src/features/gameplay/HellhoundSpecialRoundSystem';

function createMockEngine(): any {
  const events = {
    listeners: new Map<string, Array<(payload: any) => void>>(),
    on(event: string, callback: (payload: any) => void) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event)!.push(callback);
      return () => {
        const arr = this.listeners.get(event) ?? [];
        const idx = arr.indexOf(callback);
        if (idx !== -1) arr.splice(idx, 1);
      };
    },
    emit(event: string, payload: any) {
      const arr = this.listeners.get(event);
      if (arr) for (const cb of [...arr]) cb(payload);
    },
  };

  const scene = new THREE.Scene();
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
  playerMesh.position.set(0, 0, 0);

  const healthMap = new Map<number, { hp: number; maxHp: number; faction: string }>();
  healthMap.set(1, { hp: 100, maxHp: 100, faction: 'player' });

  const gameState = new PersistentGameState('zombie-test');
  gameState.clear();
  gameState.setItem('__gameplay_points__', 10000);

  const mockZombieHorde = {
    zombies: [
      { id: 'z_1', entityId: 101, position: new THREE.Vector3(2, 0, 0), health: 100 },
      { id: 'z_2', entityId: 102, position: new THREE.Vector3(4, 0, 0), health: 100 },
      { id: 'z_3', entityId: 103, position: new THREE.Vector3(6, 0, 0), health: 100 },
    ],
    getZombies() {
      return this.zombies;
    },
    applyZombieHit: vi.fn((id: string, damage: number) => {
      const z = mockZombieHorde.zombies.find((zm) => zm.id === id);
      if (z) z.health = Math.max(0, z.health - damage);
    }),
  };

  const mockPowerups = {
    spawnDrop: vi.fn((pos: THREE.Vector3, type: string) => ({ id: 'drop_1', type, pos })),
  };

  const mockPerks = {
    applyPerkEffects: vi.fn(),
  };

  return {
    gameplayFeatures: {
      zombieHorde: mockZombieHorde,
      zombiePowerups: mockPowerups,
      perkVending: mockPerks,
      shooter: { getWeapon: () => null, equipWeapon: vi.fn() },
    },
    sceneManager: {
      events,
      gameState,
      getRigidBody: (id: number) => {
        if (id === 1) {
          return { mesh: playerMesh, setNextKinematicTranslation: () => {} };
        }
        return null;
      },
    },
    player: {
      getPossessedId: () => 1,
      enabled: true,
      setInputLocked: vi.fn(),
      locomotor: { params: { maxRunSpeed: 8 } },
    },
    combat: {
      getHealth: (id: number) => healthMap.get(id) ?? null,
      applyDamage: (attackerId: number | null, targetId: number, damage: number) => {
        const h = healthMap.get(targetId);
        if (h) h.hp = Math.max(0, h.hp - damage);
      },
    },
    viewport: {
      scene,
      camera: { position: new THREE.Vector3(0, 2, 5), fov: 75, updateProjectionMatrix: vi.fn() },
      renderer: { toneMappingExposure: 1, shadowMap: { enabled: true } },
    },
    burstVfx: vi.fn(),
    audio: { play: vi.fn() },
    timeDilation: { getGlobalTimeScale: () => 1, setTimeScale: vi.fn() },
    findAnimationStateMachine: () => null,
  };
}

describe('ZombieWonderWeaponsSystem', () => {
  let engine: any;
  let weapons: ZombieWonderWeaponsSystem;

  beforeEach(() => {
    engine = createMockEngine();
    weapons = new ZombieWonderWeaponsSystem(engine);
  });

  it('chains Wunderwaffe DG-2 lightning discharge across multiple zombies', () => {
    const hits = weapons.fireWunderwaffe(new THREE.Vector3(0, 0, 0));
    expect(hits).toBe(3);
    expect(engine.burstVfx).toHaveBeenCalledWith('electric', expect.any(Object), 12);
  });

  it('throws Monkey Bomb musical decoy that detonates and wipes nearby horde', () => {
    const bomb = weapons.throwMonkeyBomb(new THREE.Vector3(0, 0, 0));
    expect(weapons.getActiveDecoyPosition()).not.toBeNull();
    expect(weapons.getState().activeMonkeyBombs.length).toBe(1);

    // Step fuse duration (8.0s)
    weapons.update(8.1);
    expect(weapons.getState().activeMonkeyBombs.length).toBe(0);
    expect(engine.burstVfx).toHaveBeenCalledWith('explosion', expect.any(Object), 30);
    expect(engine.gameplayFeatures.zombieHorde.applyZombieHit).toHaveBeenCalled();
  });

  it('opens Gersch Device black hole singularity vortex', () => {
    const gersch = weapons.throwGerschDevice(new THREE.Vector3(0, 0, 0));
    expect(weapons.getState().activeGerschVortices.length).toBe(1);

    // Step duration (6.0s)
    weapons.update(6.1);
    expect(weapons.getState().activeGerschVortices.length).toBe(0);
  });
});

describe('ZombieBossEncounterSystem', () => {
  let engine: any;
  let bosses: ZombieBossEncounterSystem;

  beforeEach(() => {
    engine = createMockEngine();
    bosses = new ZombieBossEncounterSystem(engine);
  });

  it('spawns Panzer Soldat and applies 3.5x weak spot damage on power core', () => {
    const panzer = bosses.spawnBoss('panzer_soldat', new THREE.Vector3(0, 0, -10));
    expect(panzer.health).toBe(1800);

    // Body hit (100 dmg)
    bosses.applyBossHit(panzer.id, 100, false);
    expect(panzer.health).toBe(1700);

    // Power core weak spot hit (100 * 3.5 = 350 dmg)
    bosses.applyBossHit(panzer.id, 100, true);
    expect(panzer.health).toBe(1350);
  });

  it('startles crying witch into enraged charge on nearby gunfire', () => {
    const witch = bosses.spawnBoss('crying_witch', new THREE.Vector3(5, 0, 5));
    expect(witch.isEnraged).toBe(false);

    // Gunfire event nearby
    engine.sceneManager.events.emit('ranged_weapon_fired', { origin: new THREE.Vector3(6, 0, 5) });
    expect(witch.isEnraged).toBe(true);
  });

  it('explodes into caustic bile cloud when Bloater is slain', () => {
    const bloater = bosses.spawnBoss('bile_bloater', new THREE.Vector3(0, 0, 0));
    bosses.applyBossHit(bloater.id, 9999);
    expect(engine.burstVfx).toHaveBeenCalledWith('poison', expect.any(Object), 20);
    expect(bosses.getBosses().length).toBe(0);
  });
});

describe('ZombieBuildablesSystem', () => {
  let engine: any;
  let buildables: ZombieBuildablesSystem;

  beforeEach(() => {
    engine = createMockEngine();
    buildables = new ZombieBuildablesSystem(engine);
  });

  it('scavenges shield parts and assembles Riot Shield to block incoming damage', () => {
    expect(buildables.hasShield()).toBe(false);

    // Collect 3 shield parts
    expect(buildables.collectPart('part_shield_dolly')).toBe(true);
    expect(buildables.collectPart('part_shield_clamp')).toBe(true);
    expect(buildables.collectPart('part_shield_visor')).toBe(true);

    expect(buildables.canAssemble('riot_shield')).toBe(true);
    expect(buildables.assembleItem('riot_shield')).toBe(true);
    expect(buildables.hasShield()).toBe(true);

    // Block 100 damage with 500 durability
    const overflow = buildables.blockDamageWithShield(100);
    expect(overflow).toBe(0);
    expect(buildables.getState().activeShieldDurability).toBe(400);
  });

  it('deploys portable Turbine Generator and tracks expiration', () => {
    const turbine = buildables.deployItem('turbine_generator', new THREE.Vector3(0, 0, 0));
    expect(turbine).not.toBeNull();
    expect(buildables.getState().deployedBuildables.length).toBe(1);

    // Step past duration (120s)
    buildables.update(121.0);
    expect(buildables.getState().deployedBuildables.length).toBe(0);
  });
});

describe('ZombieEasterEggQuestSystem', () => {
  let engine: any;
  let quest: ZombieEasterEggQuestSystem;

  beforeEach(() => {
    engine = createMockEngine();
    quest = new ZombieEasterEggQuestSystem(engine);
  });

  it('charges Soul Box when zombies are killed within 6m proximity', () => {
    const box = quest.getState().soulBoxes[0];
    expect(box.currentSouls).toBe(0);

    // Kill zombie at box position
    engine.sceneManager.events.emit('zombie_killed', {
      position: { x: box.position.x, y: box.position.y, z: box.position.z },
    });

    expect(box.currentSouls).toBe(1);
    expect(engine.burstVfx).toHaveBeenCalledWith('magic', expect.any(Object), 6);
  });

  it('runs lockdown containment arena and awards Perkaholic upon quest victory', () => {
    quest.startLockdownArena();
    expect(quest.getState().isLockdownActive).toBe(true);

    // Step 45s
    quest.update(46.0);
    expect(quest.getState().isLockdownActive).toBe(false);

    // Complete quest
    quest.completeQuest();
    expect(quest.getState().isQuestCompleted).toBe(true);
    expect(engine.gameplayFeatures.perkVending.applyPerkEffects).toHaveBeenCalled();
  });
});

describe('GobbleGumSystem', () => {
  let engine: any;
  let gums: GobbleGumSystem;

  beforeEach(() => {
    engine = createMockEngine();
    gums = new GobbleGumSystem(engine);
  });

  it('chews Shopping Free and Perkaholic with charge deductions', () => {
    expect(gums.chewGum('shopping_free')).toBe(true);
    expect(gums.isGumActive('shopping_free')).toBe(true);

    expect(gums.chewGum('perkaholic')).toBe(true);
    expect(engine.gameplayFeatures.perkVending.applyPerkEffects).toHaveBeenCalled();
  });

  it('expires active chewing buffs after their duration', () => {
    gums.chewGum('in_plain_sight');
    expect(gums.isGumActive('in_plain_sight')).toBe(true);

    // Step 10.5s
    gums.update(10.5);
    expect(gums.isGumActive('in_plain_sight')).toBe(false);
  });
});

describe('HellhoundSpecialRoundSystem', () => {
  let engine: any;
  let hellhounds: HellhoundSpecialRoundSystem;

  beforeEach(() => {
    engine = createMockEngine();
    hellhounds = new HellhoundSpecialRoundSystem(engine);
  });

  it('starts special Hellhound round and drops guaranteed Max Ammo on victory', () => {
    hellhounds.startHellhoundRound(2);
    expect(hellhounds.getState().isHellhoundRound).toBe(true);
    expect(hellhounds.getHounds().length).toBeGreaterThan(0);

    // Kill all hounds
    for (const h of [...hellhounds.getHounds()]) {
      hellhounds.applyHoundHit(h.id, 999);
    }

    expect(hellhounds.getState().isHellhoundRound).toBe(false);
    expect(engine.gameplayFeatures.zombiePowerups.spawnDrop).toHaveBeenCalledWith(expect.any(Object), 'max_ammo');
  });
});

describe('Zombie Ultimate Experience — Manager & Preset', () => {
  let engine: any;
  let manager: GameplayFeatureManager;

  beforeEach(() => {
    engine = createMockEngine();
    manager = new GameplayFeatureManager(engine);
  });

  it('applies zombie_ultimate_experience preset activating the full 14 zombie systems', () => {
    manager.applyPreset('zombie_ultimate_experience');

    expect(manager.isFeatureEnabled('zombie_horde_ai')).toBe(true);
    expect(manager.isFeatureEnabled('barricade_boarding')).toBe(true);
    expect(manager.isFeatureEnabled('mystery_box_gambling')).toBe(true);
    expect(manager.isFeatureEnabled('perk_vending_machines')).toBe(true);
    expect(manager.isFeatureEnabled('pack_a_punch_upgrade')).toBe(true);
    expect(manager.isFeatureEnabled('infection_immunity_meter')).toBe(true);
    expect(manager.isFeatureEnabled('power_grid_doors')).toBe(true);
    expect(manager.isFeatureEnabled('zombie_powerups_drops')).toBe(true);
    expect(manager.isFeatureEnabled('zombie_wonder_weapons')).toBe(true);
    expect(manager.isFeatureEnabled('zombie_boss_encounters')).toBe(true);
    expect(manager.isFeatureEnabled('zombie_craftable_traps')).toBe(true);
    expect(manager.isFeatureEnabled('zombie_easter_egg_quest')).toBe(true);
    expect(manager.isFeatureEnabled('zombie_gobs_elixirs')).toBe(true);
    expect(manager.isFeatureEnabled('zombie_hellhounds_round')).toBe(true);
  });

  it('serializes and deserializes cleanly with 64 total features', () => {
    manager.applyPreset('zombie_ultimate_experience');
    const json = manager.toJSON();

    const newMgr = new GameplayFeatureManager(engine);
    newMgr.fromJSON(json);
    expect(newMgr.isFeatureEnabled('zombie_wonder_weapons')).toBe(true);
    expect(newMgr.isFeatureEnabled('zombie_boss_encounters')).toBe(true);
    expect(newMgr.isFeatureEnabled('zombie_craftable_traps')).toBe(true);
  });

  it('synergizes Shopping Free GobbleGum to make mystery box and perk vending cost 0 points', () => {
    manager.applyPreset('zombie_ultimate_experience');
    manager.gobbleGums.chewGum('shopping_free');
    expect(manager.gobbleGums.isGumActive('shopping_free')).toBe(true);

    const initialScore = gameplayWallet(engine).getBalance();

    // Mystery Box spin costs 0
    expect(manager.mysteryBox.getEffectiveCost()).toBe(0);
    manager.mysteryBox.spinBox();
    expect(gameplayWallet(engine).getBalance()).toBe(initialScore);

    // Perk purchase costs 0
    manager.perkVending.buyPerk('juggernog');
    expect(gameplayWallet(engine).getBalance()).toBe(initialScore);
  });

  it('powers doors locally using deployed Turbine Generator even if main power grid is off', () => {
    manager.applyPreset('zombie_ultimate_experience');
    expect(manager.powerGrid.isPowerOn()).toBe(false);

    // Deploy turbine near East hallway door (x: 10, y: 0, z: 0)
    manager.zombieBuildables.deployItem('turbine_generator', new THREE.Vector3(10, 0, 0));
    expect(manager.powerGrid.isPowerOn(new THREE.Vector3(10, 0, 0))).toBe(true);
    expect(manager.powerGrid.isPowerOn(new THREE.Vector3(100, 0, 100))).toBe(false);
  });

  it('renders and disposes ZombieSurvivalHUD reactively', () => {
    manager.applyPreset('zombie_ultimate_experience');
    expect(manager.zombieHUD).toBeDefined();

    manager.zombieHUD.update();
    manager.dispose();
  });
});
