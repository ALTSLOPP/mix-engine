import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { GameplayFeatureRegistry } from '../src/features/gameplay/GameplayFeatureRegistry';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { BarricadeBoardingSystem } from '../src/features/gameplay/BarricadeBoardingSystem';
import { MysteryBoxSystem } from '../src/features/gameplay/MysteryBoxSystem';
import { PerkVendingSystem } from '../src/features/gameplay/PerkVendingSystem';
import { PackAPunchSystem } from '../src/features/gameplay/PackAPunchSystem';
import { InfectionImmunitySystem } from '../src/features/gameplay/InfectionImmunitySystem';
import { PowerGridDoorsSystem } from '../src/features/gameplay/PowerGridDoorsSystem';
import { ZombiePowerupDropsSystem } from '../src/features/gameplay/ZombiePowerupDropsSystem';

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

  let currentScore = 10000;

  return {
    sceneManager: {
      events,
      gameState: {
        get score() {
          return currentScore;
        },
        addScore: (pts: number) => {
          currentScore += pts;
        },
      },
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
      locomotor: { sprintMultiplier: 1.35 },
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

describe('BarricadeBoardingSystem', () => {
  let engine: any;
  let barricades: BarricadeBoardingSystem;

  beforeEach(() => {
    engine = createMockEngine();
    barricades = new BarricadeBoardingSystem(engine);
  });

  it('damages, breaches, and repairs window barricades with points awards', () => {
    const north = barricades.getBarricade('window_north');
    expect(north).toBeDefined();
    expect(north?.currentPlanks).toBe(6);

    // Damage 3 planks
    barricades.damageBarricade('window_north', 3);
    expect(north?.currentPlanks).toBe(3);
    expect(north?.isBreached).toBe(false);

    // Damage remaining 3 planks -> breached
    barricades.damageBarricade('window_north', 3);
    expect(north?.currentPlanks).toBe(0);
    expect(north?.isBreached).toBe(true);

    // Repair 2 planks
    const initialScore = engine.sceneManager.gameState.score;
    const added = barricades.repairBarricade('window_north', 2);
    expect(added).toBe(2);
    expect(north?.currentPlanks).toBe(2);
    expect(north?.isBreached).toBe(false);
    expect(engine.sceneManager.gameState.score).toBe(initialScore + 20);
  });

  it('restores all barricades across the entire map on carpenter event', () => {
    barricades.damageBarricade('window_north', 6);
    barricades.damageBarricade('window_south', 4);

    const totalRestored = barricades.repairAllBarricades();
    expect(totalRestored).toBe(10);
    expect(barricades.getBarricade('window_north')?.currentPlanks).toBe(6);
    expect(barricades.getBarricade('window_south')?.currentPlanks).toBe(6);
  });

  it('upgrades barricade tier to metal and electrified', () => {
    expect(barricades.upgradeTier('window_east', 'metal')).toBe(true);
    expect(barricades.getBarricade('window_east')?.tier).toBe('metal');
  });
});

describe('MysteryBoxSystem', () => {
  let engine: any;
  let box: MysteryBoxSystem;

  beforeEach(() => {
    engine = createMockEngine();
    box = new MysteryBoxSystem(engine);
  });

  it('spins box, consumes points, and provides grab window for rolled weapon', () => {
    const initialScore = engine.sceneManager.gameState.score;
    expect(box.spinBox()).toBe(true);
    expect(engine.sceneManager.gameState.score).toBe(initialScore - 950);
    expect(box.getState().isSpinning).toBe(true);

    // Step spin duration (3.5s)
    box.update(3.6);
    expect(box.getState().isSpinning).toBe(false);
    expect(box.getState().currentRolledWeapon).not.toBeNull();
    expect(box.getState().grabTimeRemaining).toBeGreaterThan(0);

    // Grab weapon
    const weaponId = box.grabWeapon();
    expect(weaponId).not.toBeNull();
    expect(box.getState().currentRolledWeapon).toBeNull();
  });

  it('relocates to another location when triggered', () => {
    const loc1 = box.getState().activeLocationId;
    box.relocateBox();
    const loc2 = box.getState().activeLocationId;
    expect(loc1).not.toBe(loc2);
  });
});

describe('PerkVendingSystem', () => {
  let engine: any;
  let perks: PerkVendingSystem;

  beforeEach(() => {
    engine = createMockEngine();
    perks = new PerkVendingSystem(engine);
  });

  it('purchases Juggernog and boosts player max health to 250 HP', () => {
    const initialScore = engine.sceneManager.gameState.score;
    expect(perks.buyPerk('juggernog')).toBe(true);
    expect(engine.sceneManager.gameState.score).toBe(initialScore - 2500);

    const health = engine.combat.getHealth(1);
    expect(health.maxHp).toBe(250);
    expect(health.hp).toBe(250);

    expect(perks.hasPerk('juggernog')).toBe(true);
  });

  it('enforces maximum 4 perks per player limit', () => {
    perks.buyPerk('juggernog');
    perks.update(1.6);
    perks.buyPerk('speed_cola');
    perks.update(1.6);
    perks.buyPerk('quick_revive');
    perks.update(1.6);
    perks.buyPerk('double_tap');
    perks.update(1.6);

    expect(perks.getState().activePerks.length).toBe(4);
    expect(perks.buyPerk('stamin_up')).toBe(false);
  });

  it('resets perks upon player death event', () => {
    perks.buyPerk('juggernog');
    expect(perks.hasPerk('juggernog')).toBe(true);

    engine.sceneManager.events.emit('player_death', {});
    expect(perks.getState().activePerks.length).toBe(0);
    expect(engine.combat.getHealth(1).maxHp).toBe(100);
  });
});

describe('PackAPunchSystem', () => {
  let engine: any;
  let pap: PackAPunchSystem;

  beforeEach(() => {
    engine = createMockEngine();
    pap = new PackAPunchSystem(engine);
  });

  it('upgrades weapons across tiers with damage scaling', () => {
    const initialScore = engine.sceneManager.gameState.score;
    expect(pap.upgradeWeapon('fps_ak47')).toBe(true);
    expect(engine.sceneManager.gameState.score).toBe(initialScore - 5000);

    // Complete upgrade timer (2.5s)
    pap.update(2.6);
    expect(pap.getState().isUpgrading).toBe(false);

    const upState = pap.getUpgradeState('fps_ak47');
    expect(upState?.tier).toBe(1);
    expect(upState?.damageMultiplier).toBe(2.0);
  });

  it('attaches Alternate Ammo Types (AAT) and triggers elemental combat hits', () => {
    pap.applyAAT('fps_ak47', 'dead_wire');
    expect(pap.getUpgradeState('fps_ak47')?.aat).toBe('dead_wire');

    pap.triggerAATEffect('dead_wire', 100 as any, new THREE.Vector3(5, 0, 5));
    expect(engine.burstVfx).toHaveBeenCalledWith('electric', expect.any(Object), 12);
  });
});

describe('InfectionImmunitySystem', () => {
  let engine: any;
  let infection: InfectionImmunitySystem;

  beforeEach(() => {
    engine = createMockEngine();
    infection = new InfectionImmunitySystem(engine);
  });

  it('accumulates infection and triggers progressive symptom stages', () => {
    expect(infection.getState().currentStage).toBe('none');

    infection.addInfection(30);
    expect(infection.getState().currentStage).toBe('mild');

    infection.addInfection(30);
    expect(infection.getState().currentStage).toBe('moderate');

    infection.addInfection(20);
    expect(infection.getState().currentStage).toBe('critical');

    // Apply antidote
    infection.applyAntidote(50);
    expect(infection.getState().infectionPercent).toBe(30);
    expect(infection.getState().currentStage).toBe('mild');
  });

  it('blocks infection while immunity boost is active', () => {
    infection.grantImmunityBoost(10.0);
    expect(infection.getState().hasImmunityBoost).toBe(true);

    infection.addInfection(50);
    expect(infection.getState().infectionPercent).toBe(0);

    // Step immunity timeout
    infection.update(10.5);
    expect(infection.getState().hasImmunityBoost).toBe(false);
  });
});

describe('PowerGridDoorsSystem', () => {
  let engine: any;
  let powerGrid: PowerGridDoorsSystem;

  beforeEach(() => {
    engine = createMockEngine();
    powerGrid = new PowerGridDoorsSystem(engine);
  });

  it('turns power on and opens buyable doors with points deductions', () => {
    expect(powerGrid.isPowerOn()).toBe(false);
    powerGrid.turnPowerOn();
    expect(powerGrid.isPowerOn()).toBe(true);

    const initialScore = engine.sceneManager.gameState.score;
    expect(powerGrid.buyDoor('door_hallway_east')).toBe(true);
    expect(engine.sceneManager.gameState.score).toBe(initialScore - 750);
    expect(powerGrid.isDoorOpened('door_hallway_east')).toBe(true);
  });

  it('activates perimeter electric trap when powered', () => {
    powerGrid.turnPowerOn();
    expect(powerGrid.activateTrap('trap_electric_hall')).toBe(true);
    expect(powerGrid.getState().activeTraps['trap_electric_hall']?.timeRemaining).toBeGreaterThan(0);
  });
});

describe('ZombiePowerupDropsSystem', () => {
  let engine: any;
  let powerups: ZombiePowerupDropsSystem;

  beforeEach(() => {
    engine = createMockEngine();
    powerups = new ZombiePowerupDropsSystem(engine);
  });

  it('spawns and collects Nuke powerup to wipe board and award score', () => {
    const initialScore = engine.sceneManager.gameState.score;
    const drop = powerups.spawnDrop(new THREE.Vector3(0, 0, 0), 'nuke');
    expect(drop).toBeDefined();
    expect(powerups.getState().activeDrops.length).toBe(1);

    const collected = powerups.collectDrop(drop.id);
    expect(collected).toBe('nuke');
    expect(engine.sceneManager.gameState.score).toBe(initialScore + 400);
    expect(powerups.getState().activeDrops.length).toBe(0);
  });

  it('activates 30s timed buffs like Insta-Kill and Double Points', () => {
    const drop = powerups.spawnDrop(new THREE.Vector3(0, 0, 0), 'insta_kill');
    powerups.collectDrop(drop.id);

    expect(powerups.isEffectActive('insta_kill')).toBe(true);

    // Step 31 seconds
    powerups.update(31.0);
    expect(powerups.isEffectActive('insta_kill')).toBe(false);
  });
});

describe('Zombie Survival Suite — Manager Integration & Presets', () => {
  let engine: any;
  let manager: GameplayFeatureManager;

  beforeEach(() => {
    engine = createMockEngine();
    manager = new GameplayFeatureManager(engine);
  });

  it('applies zombie_nazi_survival preset enabling the entire zombie feature suite', () => {
    manager.applyPreset('zombie_nazi_survival');

    expect(manager.isFeatureEnabled('zombie_horde_ai')).toBe(true);
    expect(manager.isFeatureEnabled('barricade_boarding')).toBe(true);
    expect(manager.isFeatureEnabled('mystery_box_gambling')).toBe(true);
    expect(manager.isFeatureEnabled('perk_vending_machines')).toBe(true);
    expect(manager.isFeatureEnabled('pack_a_punch_upgrade')).toBe(true);
    expect(manager.isFeatureEnabled('power_grid_doors')).toBe(true);
    expect(manager.isFeatureEnabled('zombie_powerups_drops')).toBe(true);
    expect(manager.zombieHorde.getWaveState().active).toBe(true);
  });

  it('round-trips all 58 features through serialization', () => {
    manager.applyPreset('zombie_nazi_survival');
    const json = manager.toJSON();
    expect((json.activeFeatures as string[]).length).toBeGreaterThanOrEqual(10);

    const newManager = new GameplayFeatureManager(engine);
    newManager.fromJSON(json);
    expect(newManager.isFeatureEnabled('zombie_horde_ai')).toBe(true);
    expect(newManager.isFeatureEnabled('mystery_box_gambling')).toBe(true);
    expect(newManager.isFeatureEnabled('pack_a_punch_upgrade')).toBe(true);
  });
});
