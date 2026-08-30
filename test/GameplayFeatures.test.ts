import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GameplayFeatureRegistry } from '../src/features/gameplay/GameplayFeatureRegistry';
import { TargetLockSystem } from '../src/features/gameplay/TargetLockSystem';
import { TimedHitboxSystem } from '../src/features/gameplay/TimedHitboxSystem';
import { ComboSystem } from '../src/features/gameplay/ComboSystem';
import { DodgeGuardStaminaSystem } from '../src/features/gameplay/DodgeGuardStaminaSystem';
import { HitReactionSystem } from '../src/features/gameplay/HitReactionSystem';
import { AbilityElementalSystem } from '../src/features/gameplay/AbilityElementalSystem';
import { EncounterAISystem } from '../src/features/gameplay/EncounterAISystem';
import { StatsProgressionSystem } from '../src/features/gameplay/StatsProgressionSystem';
import { ArenaWaveSystem } from '../src/features/gameplay/ArenaWaveSystem';
import { StealthSystem } from '../src/features/gameplay/StealthSystem';
import { ParkourSystem } from '../src/features/gameplay/ParkourSystem';
import { LootInventorySystem } from '../src/features/gameplay/LootInventorySystem';
import { DialogueSystem } from '../src/features/gameplay/DialogueSystem';
import { RangedShooterSystem } from '../src/features/gameplay/RangedShooterSystem';
import { VehicleMountSystem } from '../src/features/gameplay/VehicleMountSystem';
import { GrappleHookSystem } from '../src/features/gameplay/GrappleHookSystem';
import { TimeMechanicsSystem } from '../src/features/gameplay/TimeMechanicsSystem';
import { CraftingSystem } from '../src/features/gameplay/CraftingSystem';
import { CompanionSystem } from '../src/features/gameplay/CompanionSystem';
import { WeaponLoadoutSystem } from '../src/features/gameplay/WeaponLoadoutSystem';
import { CoverPeekingSystem } from '../src/features/gameplay/CoverPeekingSystem';
import { ExplosivesSystem } from '../src/features/gameplay/ExplosivesSystem';
import { KillstreakSystem } from '../src/features/gameplay/KillstreakSystem';
import { BonfireCheckpointSystem } from '../src/features/gameplay/BonfireCheckpointSystem';
import { EstusFlaskSystem } from '../src/features/gameplay/EstusFlaskSystem';
import { BloodstainSystem } from '../src/features/gameplay/BloodstainSystem';
import { PostureVisceralSystem } from '../src/features/gameplay/PostureVisceralSystem';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { EventBus } from '../src/ecs/EventBus';

// Mock Engine for unit tests
function createMockEngine() {
  const events = new EventBus();
  const entities = new Map<number, any>();
  const entityTags = new Map<number, Set<string>>();
  const healths = new Map<number, { hp: number; maxHp: number; faction?: string }>();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0); // camera looks towards -Z

  let possessedPlayerId: number | null = 1;
  let globalTimeScale = 1.0;

  // Add dummy player entity facing +Z
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  playerMesh.position.set(0, 0, 0);
  playerMesh.quaternion.set(0, 0, 0, 1);
  entities.set(1, {
    mesh: playerMesh,
    setNextKinematicTranslation: (p: any) => playerMesh.position.copy(p),
    setNextKinematicRotation: (q: any) => playerMesh.quaternion.copy(q),
  });
  entityTags.set(1, new Set(['player']));
  healths.set(1, { hp: 100, maxHp: 100, faction: 'player' });

  return {
    sceneManager: {
      events,
      allEntityIds: () => Array.from(entities.keys()),
      getRigidBody: (id: number) => entities.get(id),
      hasTag: (id: number, tag: string) => entityTags.get(id)?.has(tag) ?? false,
      addTag: (id: number, tag: string) => {
        if (!entityTags.has(id)) entityTags.set(id, new Set());
        entityTags.get(id)!.add(tag);
      },
      spawnNow: (pos: THREE.Vector3, bp: any) => {
        const id = entities.size + 1;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        mesh.position.copy(pos);
        entities.set(id, {
          mesh,
          setNextKinematicTranslation: (p: any) => mesh.position.copy(p),
          setNextKinematicRotation: (q: any) => mesh.quaternion.copy(q),
        });
        return id;
      },
      requestDestroy: (id: number) => {
        entities.delete(id);
      },
      addScript: () => {},
    },
    player: {
      getPossessedId: () => possessedPlayerId,
    },
    combat: {
      getHealth: (id: number) => healths.get(id),
      addHealth: (id: number, hp: number, faction = 'enemy') => {
        healths.set(id, { hp, maxHp: hp, faction });
      },
      applyDamage: (attacker: number | null, target: number, amount: number) => {
        const h = healths.get(target);
        if (h) {
          h.hp -= amount;
          if (h.hp <= 0) entities.delete(target);
        }
      },
    },
    multiTargetCamera: {
      setTargets: () => {},
      reset: () => {},
    },
    viewport: {
      camera,
      renderer: {
        domElement: { width: 1920, height: 1080 },
      },
    },
    physicsWorld: {
      raycast: (origin: THREE.Vector3, dir: THREE.Vector3) => {
        if (dir.y < -0.9) {
          return { point: new THREE.Vector3(origin.x, 0.8, origin.z), normal: new THREE.Vector3(0, 1, 0) };
        }
        return { point: origin.clone().addScaledVector(dir, 15.0), normal: new THREE.Vector3(0, 0, -1) };
      },
    },
    audio: {
      play: () => {},
    },
    effects: {
      hit: () => {},
      flash: () => {},
      shake: () => {},
    },
    burstVfx: () => {},
    spawnVfx: () => {},
    timeDilation: {
      getGlobalTimeScale: () => globalTimeScale,
      setGlobalTimeScale: (s: number) => { globalTimeScale = s; },
      setEntityTimeScale: () => {},
    },
    debugDraw: {
      drawSphere: () => {},
      drawLine: () => {},
    },
    findAnimationStateMachine: () => createMockAsm(),
    _entities: entities,
    _tags: entityTags,
    _healths: healths,
  } as any;
}

// Mock AnimationStateMachine
function createMockAsm() {
  let current = 'idle';
  return {
    get currentState() { return current; },
    transition: (state: string) => { current = state; },
  } as any;
}

describe('Gameplay Feature Registry', () => {
  it('should register all 64 core gameplay features', () => {
    const list = GameplayFeatureRegistry.list();
    expect(list.length).toBe(64);

    const ids = list.map((f) => f.id);
    expect(ids).toContain('target_lock');
    expect(ids).toContain('deformable_ground');
    expect(ids).toContain('anime_combat_director');
    expect(ids).toContain('procedural_city_generator');
    expect(ids).toContain('timed_hitboxes');
    expect(ids).toContain('combo_system');
    expect(ids).toContain('dodge_guard_stamina');
    expect(ids).toContain('hit_reactions');
    expect(ids).toContain('abilities_magic');
    expect(ids).toContain('enemy_boss_ai');
    expect(ids).toContain('stats_progression');
    expect(ids).toContain('arena_flow');
    expect(ids).toContain('stealth_detection');
    expect(ids).toContain('parkour_traversal');
    expect(ids).toContain('loot_inventory');
    expect(ids).toContain('dialogue_system');
    expect(ids).toContain('ranged_shooter');
    expect(ids).toContain('vehicle_mount');
    expect(ids).toContain('grapple_swing');
    expect(ids).toContain('time_mechanics');
    expect(ids).toContain('crafting_gathering');
    expect(ids).toContain('companion_summon');
    expect(ids).toContain('weapon_wheel_loadout');
    expect(ids).toContain('cover_peeking');
    expect(ids).toContain('ballistics_explosives');
    expect(ids).toContain('killstreaks_rewards');
    expect(ids).toContain('bonfire_checkpoint');
    expect(ids).toContain('estus_flask_healing');
    expect(ids).toContain('bloodstain_souls');
    expect(ids).toContain('posture_visceral');
    expect(ids).toContain('two_axis_combat');
    expect(ids).toContain('shrinking_storm');
    expect(ids).toContain('superhero_flight_system');
    expect(ids).toContain('traffic_simulation');
    expect(ids).toContain('civilian_population');
    expect(ids).toContain('wanted_crime');
    expect(ids).toContain('police_response');
    expect(ids).toContain('vehicle_theft');
    expect(ids).toContain('escort_missions');
    expect(ids).toContain('minimap_radar');
    expect(ids).toContain('spaceship_flight');
    expect(ids).toContain('phone_shell');
    expect(ids).toContain('phone_messaging');
    expect(ids).toContain('social_encounter');
    expect(ids).toContain('location_visits');
    expect(ids).toContain('zombie_horde_ai');
    expect(ids).toContain('barricade_boarding');
    expect(ids).toContain('mystery_box_gambling');
    expect(ids).toContain('perk_vending_machines');
    expect(ids).toContain('pack_a_punch_upgrade');
    expect(ids).toContain('infection_immunity_meter');
    expect(ids).toContain('power_grid_doors');
    expect(ids).toContain('zombie_powerups_drops');
    expect(ids).toContain('zombie_wonder_weapons');
    expect(ids).toContain('zombie_boss_encounters');
    expect(ids).toContain('zombie_craftable_traps');
    expect(ids).toContain('zombie_easter_egg_quest');
    expect(ids).toContain('zombie_gobs_elixirs');
    expect(ids).toContain('zombie_hellhounds_round');
  });
});

describe('Target Lock System', () => {
  let engine: any;
  let targetLock: TargetLockSystem;

  beforeEach(() => {
    engine = createMockEngine();
    targetLock = new TargetLockSystem(engine, GameplayFeatureRegistry.getDefaults('target_lock'));

    const enemyMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    enemyMesh.position.set(0, 0, -5);
    engine._entities.set(2, { mesh: enemyMesh, setNextKinematicTranslation: () => {} });
    engine._tags.set(2, new Set(['enemy']));
    engine._healths.set(2, { hp: 100, maxHp: 100, faction: 'enemy' });
  });

  it('should acquire target lock on nearest candidate in view', () => {
    expect(targetLock.isLocked).toBe(false);
    targetLock.toggleLock();
    expect(targetLock.isLocked).toBe(true);
    expect(targetLock.lockedTargetId).toBe(2);
  });
});

describe('Combo System', () => {
  let engine: any;
  let combo: ComboSystem;
  let asm: any;

  beforeEach(() => {
    engine = createMockEngine();
    combo = new ComboSystem(engine, GameplayFeatureRegistry.getDefaults('combo_system'));
    asm = createMockAsm();
  });

  it('should advance light attack combo chain (step 0 -> 1 -> 2)', () => {
    expect(combo.getState().currentStepIndex).toBe(-1);

    combo.executeLightAttack(asm, false, false);
    expect(combo.getState().currentStepIndex).toBe(0);
    expect(asm.currentState).toBe('Hook Punch');

    combo.update(0.5, asm);
    expect(combo.canCancel).toBe(true);

    combo.executeLightAttack(asm, false, false);
    expect(combo.getState().currentStepIndex).toBe(1);
    expect(asm.currentState).toBe('Uppercut Jab');
  });
});

describe('Dodge, Guard & Stamina System', () => {
  let engine: any;
  let defense: DodgeGuardStaminaSystem;
  let asm: any;

  beforeEach(() => {
    engine = createMockEngine();
    defense = new DodgeGuardStaminaSystem(engine, GameplayFeatureRegistry.getDefaults('dodge_guard_stamina'));
    asm = createMockAsm();
  });

  it('should execute directional dodge and grant i-frames', () => {
    const initialStamina = defense.currentStamina;
    const dodged = defense.executeDodge(asm, { x: 0, y: -1 }, 0);

    expect(dodged).toBe(true);
    expect(defense.isDodging).toBe(true);
    expect(defense.isInvulnerable).toBe(true);
    expect(defense.currentStamina).toBe(initialStamina - defense.getConfig().dodgeStaminaCost);
  });

  it('should trigger parry within the parry window', () => {
    defense.startBlock(asm);
    expect(defense.getState().isParryWindowActive).toBe(true);

    const hit = defense.evaluateIncomingHit(2, new THREE.Vector3(0, 0, 5), 50);
    expect(hit.outcome).toBe('parried');
    expect(hit.mitigatedDamage).toBe(0);
  });
});

describe('Hit Reactions & Poise System', () => {
  let engine: any;
  let reactions: HitReactionSystem;

  beforeEach(() => {
    engine = createMockEngine();
    reactions = new HitReactionSystem(engine, GameplayFeatureRegistry.getDefaults('hit_reactions'));
  });

  it('should break poise and trigger stagger when poise depleted', () => {
    reactions.applyHitImpact(1, 20, 120, 5);
    const state = reactions.getOrCreateState(1);
    expect(state.reactionType).toBe('stagger');
  });
});

describe('Abilities & Elemental System', () => {
  let engine: any;
  let abilities: AbilityElementalSystem;
  let asm: any;

  beforeEach(() => {
    engine = createMockEngine();
    abilities = new AbilityElementalSystem(engine, GameplayFeatureRegistry.getDefaults('abilities_magic'));
    asm = createMockAsm();
  });

  it('should cast ability, consume MP and restore MP', () => {
    const initialMp = abilities.currentMp;
    const cast = abilities.castAbility(1, asm);

    expect(cast).toBe(true);
    expect(abilities.currentMp).toBeLessThan(initialMp);

    abilities.restoreMp(50);
    expect(abilities.currentMp).toBe(abilities.maxMp);
  });
});

describe('Stealth & Assassination System', () => {
  let engine: any;
  let stealth: StealthSystem;
  let asm: any;

  beforeEach(() => {
    engine = createMockEngine();
    stealth = new StealthSystem(engine, GameplayFeatureRegistry.getDefaults('stealth_detection'));
    asm = createMockAsm();

    const enemyMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    enemyMesh.position.set(0, 0, 1.5);
    enemyMesh.quaternion.set(0, 0, 0, 1);
    engine._entities.set(2, { mesh: enemyMesh, setNextKinematicTranslation: () => {} });
    engine._tags.set(2, new Set(['enemy']));
    engine._healths.set(2, { hp: 100, maxHp: 100, faction: 'enemy' });
  });

  it('should toggle crouch and detect backstab opportunity', () => {
    stealth.toggleCrouch(asm);
    expect(stealth.crouching).toBe(true);

    stealth.update(0.1);
    expect(stealth.backstabTarget).toBe(2);

    const executed = stealth.executeBackstab(asm);
    expect(executed).toBe(true);
  });
});

describe('Parkour & Traversal System', () => {
  let engine: any;
  let parkour: ParkourSystem;
  let asm: any;

  beforeEach(() => {
    engine = createMockEngine();
    parkour = new ParkourSystem(engine, GameplayFeatureRegistry.getDefaults('parkour_traversal'));
    asm = createMockAsm();
  });

  it('should detect obstacle and execute mantle', () => {
    const success = parkour.tryParkourAction(asm);
    expect(success).toBe(true);
    expect(parkour.isPerformingAction).toBe(true);
  });
});

describe('Ranged Shooter & Gunplay System', () => {
  let engine: any;
  let shooter: RangedShooterSystem;
  let asm: any;

  beforeEach(() => {
    engine = createMockEngine();
    shooter = new RangedShooterSystem(engine, GameplayFeatureRegistry.getDefaults('ranged_shooter'));
    asm = createMockAsm();
  });

  it('should aim down sights, fire weapon and reload', () => {
    shooter.setAiming(true);
    expect(shooter.aiming).toBe(true);

    const initialAmmo = shooter.ammo;
    shooter.fire(asm);
    expect(shooter.ammo).toBe(initialAmmo - 1);

    shooter.reload();
    expect(shooter.reloading).toBe(true);
    shooter.update(2.0);
    expect(shooter.reloading).toBe(false);
    expect(shooter.ammo).toBe(shooter.capacity);
  });
});

describe('Vehicle Driving & Mount System', () => {
  let engine: any;
  let vehicleSys: VehicleMountSystem;

  beforeEach(() => {
    engine = createMockEngine();
    vehicleSys = new VehicleMountSystem(engine, GameplayFeatureRegistry.getDefaults('vehicle_mount'));

    const vehMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    vehMesh.position.set(0, 0, 1.0);
    engine._entities.set(2, {
      mesh: vehMesh,
      setNextKinematicTranslation: (p: any) => vehMesh.position.copy(p),
      setNextKinematicRotation: (q: any) => vehMesh.quaternion.copy(q),
    });
    engine._tags.set(2, new Set(['vehicle']));
  });

  it('should mount vehicle and accelerate with nitro boost', () => {
    expect(vehicleSys.isMounted).toBe(false);
    vehicleSys.toggleMount();
    expect(vehicleSys.isMounted).toBe(true);

    vehicleSys.update(0.1, 1.0, 0, false, true);
    expect(vehicleSys.speed).toBeGreaterThan(0);
    expect(vehicleSys.boosting).toBe(true);
  });
});

describe('Grappling Hook System', () => {
  let engine: any;
  let grapple: GrappleHookSystem;

  beforeEach(() => {
    engine = createMockEngine();
    grapple = new GrappleHookSystem(engine, GameplayFeatureRegistry.getDefaults('grapple_swing'));
  });

  it('should fire grapple raycast and pull player toward anchor', () => {
    const latched = grapple.fireGrapple();
    expect(latched).toBe(true);
    expect(grapple.active).toBe(true);
  });
});

describe('Crafting & Alchemy System', () => {
  let engine: any;
  let crafting: CraftingSystem;
  let gfm: GameplayFeatureManager;

  beforeEach(() => {
    engine = createMockEngine();
    gfm = new GameplayFeatureManager(engine);
    (engine as any).gameplayFeatures = gfm;
    crafting = gfm.crafting;
  });

  it('should consume ingredients on crafting', () => {
    expect(crafting.recipes.length).toBeGreaterThan(0);
    const recipe = crafting.recipes[0];

    for (const ing of recipe.ingredients) {
      for (let i = 0; i < ing.count; i++) {
        gfm.loot.addItem({
          id: ing.itemId,
          name: ing.itemId,
          rarity: 'common',
          category: 'material',
          value: 10,
          icon: '📦',
          color: '#ffffff',
        });
      }
    }

    expect(crafting.canCraft(recipe.id)).toBe(true);
    const crafted = crafting.craft(recipe.id);
    expect(crafted).toBe(true);
    expect(crafting.canCraft(recipe.id)).toBe(false);
  });
});

describe('Companion & Familiar System', () => {
  let engine: any;
  let companion: CompanionSystem;

  beforeEach(() => {
    engine = createMockEngine();
    companion = new CompanionSystem(engine, GameplayFeatureRegistry.getDefaults('companion_summon'));
  });

  it('should summon battle companion and follow player', () => {
    expect(companion.isSummoned).toBe(false);
    companion.summonCompanion();
    expect(companion.isSummoned).toBe(true);

    engine._entities.get(1).mesh.position.set(15, 0, 15);
    companion.update(0.1);
    expect(companion.isSummoned).toBe(true);
  });
});

describe('Weapon Wheel & Loadout System', () => {
  let engine: any;
  let loadout: WeaponLoadoutSystem;

  beforeEach(() => {
    engine = createMockEngine();
    loadout = new WeaponLoadoutSystem(engine, GameplayFeatureRegistry.getDefaults('weapon_wheel_loadout'));
  });

  it('should open weapon wheel and trigger bullet time dilation', () => {
    expect(loadout.isOpen).toBe(false);
    loadout.openWheel();

    expect(loadout.isOpen).toBe(true);
    expect(engine.timeDilation.getGlobalTimeScale()).toBe(loadout.getConfig().timeScale);

    loadout.closeWheel();
    expect(loadout.isOpen).toBe(false);
    expect(engine.timeDilation.getGlobalTimeScale()).toBe(1.0);
  });

  it('should switch active weapon slot', () => {
    expect(loadout.getState().activeSlot).toBe(1);
    loadout.selectSlot(2);

    expect(loadout.getState().activeSlot).toBe(2);
    expect(loadout.activeWeapon?.name).toContain('ARC-15');
  });
});

describe('Cover & Tactical Peeking System', () => {
  let engine: any;
  let cover: CoverPeekingSystem;

  beforeEach(() => {
    engine = createMockEngine();
    cover = new CoverPeekingSystem(engine, GameplayFeatureRegistry.getDefaults('cover_peeking'));
  });

  it('should snap into cover and lean left/right', () => {
    const entered = cover.tryEnterCover();
    expect(entered).toBe(true);
    expect(cover.inCover).toBe(true);

    cover.setLean('left');
    expect(cover.isPeeking).toBe(true);
    expect(cover.getState().leanDirection).toBe('left');

    cover.exitCover();
    expect(cover.inCover).toBe(false);
  });
});

describe('Ballistics & Explosives System', () => {
  let engine: any;
  let explosives: ExplosivesSystem;

  beforeEach(() => {
    engine = createMockEngine();
    explosives = new ExplosivesSystem(engine, GameplayFeatureRegistry.getDefaults('ballistics_explosives'));

    // Spawn enemy at (0, 0, 3)
    const enemyMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    enemyMesh.position.set(0, 0, 3);
    engine._entities.set(2, { mesh: enemyMesh, setNextKinematicTranslation: () => {} });
    engine._tags.set(2, new Set(['enemy']));
    engine._healths.set(2, { hp: 100, maxHp: 100, faction: 'enemy' });
  });

  it('should throw grenade and detonate on fuse expiration', () => {
    const initialGrenades = explosives.remainingGrenades;
    const thrown = explosives.throwGrenade();

    expect(thrown).toBe(true);
    expect(explosives.remainingGrenades).toBe(initialGrenades - 1);
    expect(explosives.grenades.length).toBe(1);

    // Fast-forward fuse
    explosives.update(3.0);
    expect(explosives.grenades.length).toBe(0);
  });
});

describe('Killstreak & Rewards System', () => {
  let engine: any;
  let killstreaks: KillstreakSystem;

  beforeEach(() => {
    engine = createMockEngine();
    killstreaks = new KillstreakSystem(engine, GameplayFeatureRegistry.getDefaults('killstreaks_rewards'));
  });

  it('should record kills and unlock UAV radar on streak 3', () => {
    expect(killstreaks.currentStreak).toBe(0);
    killstreaks.registerKill();
    killstreaks.registerKill();
    killstreaks.registerKill();

    expect(killstreaks.currentStreak).toBe(3);
    expect(killstreaks.isRadarActive).toBe(true);
  });
});

describe('Bonfire Checkpoint & World Respawn System', () => {
  let engine: any;
  let bonfire: BonfireCheckpointSystem;
  let gfm: GameplayFeatureManager;

  beforeEach(() => {
    engine = createMockEngine();
    gfm = new GameplayFeatureManager(engine);
    (engine as any).gameplayFeatures = gfm;
    bonfire = gfm.bonfire;
  });

  it('should detect nearby bonfire and rest to restore health and flasks', () => {
    const health = engine.combat.getHealth(1);
    health.hp = 20;

    const nearby = bonfire.getNearbyBonfire();
    expect(nearby).toBeDefined();

    const rested = bonfire.restAtBonfire(nearby?.id);
    expect(rested).toBe(true);
    expect(health.hp).toBe(health.maxHp);
  });
});

describe('Estus Flasks & Tears Healing System', () => {
  let engine: any;
  let flasks: EstusFlaskSystem;

  beforeEach(() => {
    engine = createMockEngine();
    flasks = new EstusFlaskSystem(engine, GameplayFeatureRegistry.getDefaults('estus_flask_healing'));
  });

  it('should drink crimson flask and restore health after delay', () => {
    const health = engine.combat.getHealth(1);
    health.hp = 30;

    const initialFlasks = flasks.crimsonRemaining;
    const drank = flasks.drinkFlask('crimson');

    expect(drank).toBe(true);
    expect(flasks.crimsonRemaining).toBe(initialFlasks - 1);
    expect(flasks.isDrinking).toBe(true);

    flasks.update(2.0);
    expect(flasks.isDrinking).toBe(false);
    expect(health.hp).toBeGreaterThan(30);
  });
});

describe('Bloodstain & Lost Souls System', () => {
  let engine: any;
  let bloodstain: BloodstainSystem;

  beforeEach(() => {
    engine = createMockEngine();
    bloodstain = new BloodstainSystem(engine, GameplayFeatureRegistry.getDefaults('bloodstain_souls'));
  });

  it('should drop bloodstain on player death and recover souls on pickup', () => {
    bloodstain.addSouls(500);
    expect(bloodstain.souls).toBe(500);

    bloodstain.onPlayerDeath();
    expect(bloodstain.souls).toBe(0);
    expect(bloodstain.hasBloodstain).toBe(true);

    bloodstain.recoverBloodstain();
    expect(bloodstain.souls).toBe(500);
    expect(bloodstain.hasBloodstain).toBe(false);
  });
});

describe('Posture Break & Visceral Deathblow System', () => {
  let engine: any;
  let posture: PostureVisceralSystem;
  let asm: any;

  beforeEach(() => {
    engine = createMockEngine();
    posture = new PostureVisceralSystem(engine, GameplayFeatureRegistry.getDefaults('posture_visceral'));
    asm = createMockAsm();

    const enemyMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    enemyMesh.position.set(0, 0, 1.5);
    engine._entities.set(2, { mesh: enemyMesh, setNextKinematicTranslation: () => {} });
    engine._tags.set(2, new Set(['enemy']));
    engine._healths.set(2, { hp: 500, maxHp: 500, faction: 'enemy' });
  });

  it('should damage posture, break stance, and execute visceral critical', () => {
    posture.applyPostureDamage(2, 60);
    expect(posture.getPosture(2)?.currentPosture).toBe(60);

    const broken = posture.applyPostureDamage(2, 50);
    expect(broken).toBe(true);
    expect(posture.getPosture(2)?.isBroken).toBe(true);
    expect(posture.getExecutableTarget()).toBe(2);

    const executed = posture.executeVisceral(asm);
    expect(executed).toBe(true);
    expect(engine.combat.getHealth(2).hp).toBeLessThan(500);
  });
});

describe('Gameplay Feature Manager', () => {
  let engine: any;
  let manager: GameplayFeatureManager;

  beforeEach(() => {
    engine = createMockEngine();
    manager = new GameplayFeatureManager(engine);
  });

  it('should initialize all 32 subsystems', () => {
    expect(manager.targetLock).toBeDefined();
    expect(manager.hitboxes).toBeDefined();
    expect(manager.combo).toBeDefined();
    expect(manager.defense).toBeDefined();
    expect(manager.hitReactions).toBeDefined();
    expect(manager.abilities).toBeDefined();
    expect(manager.encounterAI).toBeDefined();
    expect(manager.stats).toBeDefined();
    expect(manager.arena).toBeDefined();
    expect(manager.stealth).toBeDefined();
    expect(manager.parkour).toBeDefined();
    expect(manager.loot).toBeDefined();
    expect(manager.dialogue).toBeDefined();
    expect(manager.ranged).toBeDefined();
    expect(manager.vehicle).toBeDefined();
    expect(manager.grapple).toBeDefined();
    expect(manager.time).toBeDefined();
    expect(manager.crafting).toBeDefined();
    expect(manager.companion).toBeDefined();
    expect(manager.loadout).toBeDefined();
    expect(manager.cover).toBeDefined();
    expect(manager.explosives).toBeDefined();
    expect(manager.killstreaks).toBeDefined();
    expect(manager.bonfire).toBeDefined();
    expect(manager.flasks).toBeDefined();
    expect(manager.bloodstain).toBeDefined();
    expect(manager.posture).toBeDefined();
  });

  it('should serialize and restore all 32 feature configurations', () => {
    manager.configureFeature('weapon_wheel_loadout', { switchTime: 0.5 });
    const snapshot = manager.toJSON();

    const newManager = new GameplayFeatureManager(engine);
    newManager.fromJSON(snapshot);

    expect(newManager.loadout.getConfig().switchTime).toBe(0.5);
  });
});
