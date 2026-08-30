import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createMockEngine, createMockAsm } from './helpers/gameplayEngine';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { GameplayFeatureRegistry } from '../src/features/gameplay/GameplayFeatureRegistry';
import { CombatSystem } from '../src/ecs/CombatSystem';
import { TimeDilationManager } from '../src/playback/TimeDilationManager';
import { migrateProjectDocument } from '../src/project/ProjectDocument';
import { applyGameplayHit } from '../src/features/gameplay/GameplayHit';
import { PlayerController } from '../src/engine/PlayerController';
import { CommandRegistry } from '../src/commands/CommandRegistry';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';

function setup() {
  const engine = createMockEngine();
  engine.timeDilation = new TimeDilationManager();
  engine.worldOrigin = { toWorldSpace: (p: THREE.Vector3) => p.clone(), toWorldSpaceInto: (out: THREE.Vector3, p: THREE.Vector3) => out.copy(p) };
  engine.combat = new CombatSystem({
    sceneManager: engine.sceneManager, physicsWorld: engine.physicsWorld,
    worldOrigin: engine.worldOrigin, getEngine: () => engine,
  });
  engine.combat.addHealth(1, 100, 'player');
  const manager = new GameplayFeatureManager(engine);
  engine.gameplayFeatures = manager;
  const add = (id: number, pos = new THREE.Vector3(0, 0, 1), faction = 'enemy') => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.position.copy(pos);
    const rb = { mesh, rapierBody: { id }, setNextKinematicTranslation: (p: THREE.Vector3) => mesh.position.copy(p),
      setNextKinematicRotation: (q: THREE.Quaternion) => mesh.quaternion.copy(q) };
    engine._entities.set(id, rb);
    engine._tags.set(id, new Set([faction]));
    engine.combat.addHealth(id, 100, faction);
    return rb;
  };
  return { engine, manager, add };
}

describe('all 32 modular features: configuration and lifecycle', () => {
  it.each(GameplayFeatureRegistry.list().map(d => [d.id]))('%s stays disabled after JSON restore and re-enables cleanly', id => {
    const { engine, manager } = setup();
    manager.disableFeature(id);
    const snapshot = JSON.parse(JSON.stringify(manager.toJSON()));
    manager.enableFeature(id);
    manager.fromJSON(snapshot);
    expect(manager.isFeatureEnabled(id)).toBe(false);
    expect(manager.getSystem(id).getConfig().enabled).toBe(false);
    manager.update(0.016);
    manager.enableFeature(id);
    expect(manager.isFeatureEnabled(id)).toBe(true);
    expect(() => manager.update(0.016)).not.toThrow();
    manager.disableAllFeatures();
  });

  it('activeFeatures overrides conflicting enabled flags and ignores unknown IDs', () => {
    const { manager } = setup();
    manager.fromJSON({ activeFeatures: ['target_lock', 'not_a_feature'], ranged_shooter: { enabled: true } });
    expect(manager.isFeatureEnabled('ranged_shooter')).toBe(false);
    expect(manager.ranged.fire()).toBe(false);
    expect(manager.toJSON().activeFeatures).toEqual(['target_lock']);
    manager.fromJSON({ target_lock: { enabled: false } });
    expect(manager.isFeatureEnabled('target_lock')).toBe(false);
  });

  it('snapshots are detached and legacy scene migration preserves feature settings', () => {
    const { manager } = setup();
    const snapshot: any = manager.toJSON();
    snapshot.combo_system.lightCombo[0].animation = 'changed';
    expect(manager.combo.getConfig().lightCombo[0].animation).not.toBe('changed');
    const doc = migrateProjectDocument({ entities: [], runtime: { gameplayFeatures: snapshot } });
    expect(doc.runtime?.gameplayFeatures).toEqual(snapshot);
  });

  it('direct subsystem configuration is reflected by the manager', () => {
    const { manager } = setup();
    manager.combo.setConfig({ enabled: false });
    expect(manager.isFeatureEnabled('combo_system')).toBe(false);
  });
});

describe('real combat integration', () => {
  it('timed hitboxes apply HP damage once and remain functional without hit reactions', () => {
    const { engine, manager, add } = setup();
    add(2);
    manager.disableFeature('hit_reactions');
    manager.hitboxes.openHitbox({ attackerId: 1, damage: 25 });
    manager.hitboxes.update(0.016);
    manager.hitboxes.update(0.016);
    expect(engine.combat.getHealth(2).hp).toBe(75);
    expect(manager.combo.getState().comboCount).toBe(1);
    expect(manager.posture.getPosture(2)?.currentPosture).toBe(25);
  });

  it('blocks friendly fire and does not count invulnerable hits as combos or reactions', () => {
    const { engine, manager, add } = setup();
    add(2, new THREE.Vector3(0, 0, 1), 'player');
    manager.hitboxes.openHitbox({ attackerId: 1 });
    manager.hitboxes.update(0.016);
    expect(engine.combat.getHealth(2).hp).toBe(100);
    expect(manager.combo.getState().comboCount).toBe(0);
    engine.combat.addHealth(2, 100, 'enemy');
    manager.defense.executeDodge(createMockAsm(), { x: 0, y: -1 }, 0);
    expect(applyGameplayHit(engine, { attackerId: 2, targetId: 1, damage: 50, poiseDamage: 100, knockbackForce: 12 })).toBe(false);
    expect(manager.hitReactions.getOrCreateState(1).reactionType).toBe('none');
  });

  it('hitboxes follow moving attackers and cannot hit after their owner is destroyed', () => {
    const { engine, manager, add } = setup();
    add(2, new THREE.Vector3(10, 0, 1));
    manager.hitboxes.openHitbox({ attackerId: 1, damage: 20 });
    engine._entities.get(1).mesh.position.x = 10;
    manager.hitboxes.update(0.01);
    expect(engine.combat.getHealth(2).hp).toBe(80);
    manager.hitboxes.openHitbox({ attackerId: 1, damage: 20 });
    engine._entities.delete(1);
    manager.hitboxes.update(0.01);
    expect(engine.combat.getHealth(2).hp).toBe(80);
  });

  it('enemy deaths grant loot, souls and killstreaks; arbitrary despawns do not', () => {
    const { engine, manager, add } = setup();
    add(2);
    manager.loot.setConfig({ dropRate: 1 });
    engine.combat.applyDamage(1, 2, 200);
    expect(manager.bloodstain.souls).toBe(50);
    expect(manager.killstreaks.currentStreak).toBe(1);
    expect(manager.loot.groundLootItems).toHaveLength(1);
    engine.sceneManager.events.emit('entity_destroyed', { entityId: 2 });
    expect(manager.killstreaks.currentStreak).toBe(1);
    engine.combat.applyDamage(1, 2, 200);
    expect(manager.bloodstain.souls).toBe(50);
  });

  it('player death drops souls and resets the streak before body removal', () => {
    const { engine, manager } = setup();
    manager.bloodstain.addSouls(300);
    manager.killstreaks.registerKill();
    engine.combat.applyDamage(null, 1, 999);
    expect(manager.bloodstain.souls).toBe(0);
    expect(manager.bloodstain.bloodstain?.soulsAmount).toBe(300);
    expect(manager.killstreaks.currentStreak).toBe(0);
    expect(manager.loot.groundLootItems).toHaveLength(0);
  });

  it('abilities damage enemies and status ticks catch up and route lethal damage through combat', () => {
    const { engine, manager, add } = setup();
    const ability = manager.abilities.getAbilityBySlot(1)!;
    add(2, new THREE.Vector3(0, 0, ability.range * 0.5));
    expect(manager.abilities.castAbility(1)).toBe(true);
    expect(engine.combat.getHealth(2)?.hp ?? 0).toBeLessThan(100);
    add(3);
    manager.abilities.setConfig({ statusEffects: [{ ...manager.abilities.getConfig().statusEffects[0], id: 'test_dot', duration: 3, tickInterval: 1, tickDamage: 40 }] });
    const died = vi.fn();
    engine.sceneManager.events.on('combat_death', died);
    manager.abilities.applyStatusEffect(3, 'test_dot');
    manager.abilities.update(10);
    expect(engine.combat.getHealth(3)).toBeNull();
    expect(died).toHaveBeenCalledTimes(1);
  });

  it('parry uses attacker direction and supplies posture damage attribution', () => {
    const { engine, manager, add } = setup();
    add(2, new THREE.Vector3(0, 0, 5));
    manager.defense.startBlock(createMockAsm());
    engine.combat.applyDamage(2, 1, 50, 'melee', new THREE.Vector3(0, 1, 0));
    expect(engine.combat.getHealth(1).hp).toBe(100);
    expect(manager.posture.getPosture(2)?.currentPosture).toBe(manager.posture.getConfig().parryPostureDamage);
  });

  it('insufficient guard stamina breaks guard instead of giving unlimited mitigation', () => {
    const { manager, add } = setup();
    add(2, new THREE.Vector3(0, 0, 5));
    manager.defense.setConfig({ maxStamina: 5, parryWindowDuration: 0 });
    manager.defense.startBlock(createMockAsm());
    manager.defense.update(0.01);
    const hit = manager.defense.evaluateIncomingHit(2, new THREE.Vector3(), 100);
    expect(hit.mitigatedDamage).toBe(100);
    expect(manager.defense.getState().isGuardBroken).toBe(true);
  });
});

describe('resources and active actions', () => {
  it('disabling modules cancels dialogue, parkour, dodge, cover, grapple, wheel and flask actions', () => {
    const { engine, manager } = setup();
    const node = Object.keys(manager.dialogue.getConfig().nodes)[0];
    manager.dialogue.startDialogue(node);
    manager.parkour.tryParkourAction();
    manager.defense.executeDodge(createMockAsm(), { x: 0, y: -1 }, 0);
    manager.cover.tryEnterCover();
    manager.grapple.fireGrapple();
    manager.loadout.openWheel();
    manager.flasks.drinkFlask('crimson');
    manager.disableAllFeatures();
    expect([manager.dialogue.isActive, manager.parkour.isPerformingAction, manager.defense.isDodging,
      manager.defense.isInvulnerable, manager.cover.inCover, manager.grapple.active,
      manager.loadout.isOpen, manager.flasks.isDrinking]).toEqual(Array(8).fill(false));
    expect(engine.timeDilation.getGlobalTimeScale()).toBe(1);
  });

  it('failed inventory removals and unavailable crafting output never consume ingredients', () => {
    const { manager } = setup();
    const ingredient = { ...manager.loot.getConfig().possibleDrops[0], id: 'ore' };
    manager.loot.addItem(ingredient);
    expect(manager.loot.removeItem('ore', 2)).toBe(false);
    expect(manager.loot.items).toHaveLength(1);
    manager.crafting.setConfig({ recipes: [{ ...manager.crafting.recipes[0], id: 'test', resultItemId: 'missing', ingredients: [{ itemId: 'ore', count: 1 }] }] });
    expect(manager.crafting.craft('test')).toBe(false);
    expect(manager.loot.items).toHaveLength(1);
    manager.crafting.setConfig({ recipes: [{ ...manager.crafting.recipes[0], resultItemId: ingredient.id, ingredients: [{ itemId: 'ore', count: 1 }, { itemId: 'ore', count: 1 }] }] });
    manager.loot.setConfig({ possibleDrops: [ingredient] });
    expect(manager.crafting.canCraft('test')).toBe(false);
  });

  it('successful crafting produces the configured item', () => {
    const { manager } = setup();
    const recipe = manager.crafting.recipes[0];
    for (const ing of recipe.ingredients) for (let i = 0; i < ing.count; i++) manager.loot.addItem({ ...manager.loot.getConfig().possibleDrops[0], id: ing.itemId });
    expect(manager.crafting.craft(recipe.id)).toBe(true);
    expect(manager.loot.groundLootItems[0].item.id).toBe(recipe.resultItemId);
  });

  it('prevents currency exploits and invalid dialogue indices', () => {
    const { manager } = setup();
    manager.bloodstain.addSouls(20);
    expect(manager.bloodstain.spendSouls(-100)).toBe(false);
    expect(manager.bloodstain.souls).toBe(20);
    manager.dialogue.startDialogue(Object.keys(manager.dialogue.getConfig().nodes)[0]);
    expect(manager.dialogue.selectChoice(NaN)).toBe(false);
    expect(manager.dialogue.selectChoice(0.5)).toBe(false);
  });

  it('equipment edits replace bonuses and clamp health after maximum HP decreases', () => {
    const { engine, manager } = setup();
    manager.stats.equipItem({ id: 'armor', name: 'armor', slot: 'armor', hpBonus: 500 });
    engine.combat.getHealth(1).hp = engine.combat.getHealth(1).maxHp;
    manager.stats.setConfig({ equipment: [] });
    expect(manager.stats.getEquippedItem('armor')).toBeUndefined();
    expect(engine.combat.getHealth(1).hp).toBe(engine.combat.getHealth(1).maxHp);
  });

  it('default bonfire positions survive real JSON and support fast travel', () => {
    const { engine, manager } = setup();
    manager.fromJSON(JSON.parse(JSON.stringify(manager.toJSON())));
    const bonfire = manager.bonfire.bonfires[0];
    expect(manager.bonfire.fastTravel(bonfire.id)).toBe(true);
    expect(engine._entities.get(1).mesh.position.z).toBe(bonfire.position.z + 1);
    manager.disableFeature('bonfire_checkpoint');
    expect(manager.bonfire.fastTravel(bonfire.id)).toBe(false);
  });

  it('no-player actions do not consume flask charges, stamina, or ammunition', () => {
    const { engine, manager } = setup();
    engine.player.getPossessedId = () => null;
    const charges = manager.flasks.crimsonRemaining;
    const stamina = manager.defense.currentStamina;
    const ammo = manager.ranged.ammo;
    expect(manager.flasks.drinkFlask('crimson')).toBe(false);
    expect(manager.defense.executeDodge(createMockAsm(), { x: 0, y: 0 }, 0)).toBe(false);
    expect(manager.ranged.fire()).toBe(false);
    expect(manager.flasks.crimsonRemaining).toBe(charges);
    expect(manager.defense.currentStamina).toBe(stamina);
    expect(manager.ranged.ammo).toBe(ammo);
  });

  it('expired buffered combos are not executed and empty combo chains do not crash', () => {
    const { manager } = setup();
    const asm = createMockAsm();
    manager.combo.setConfig({ inputBufferDuration: 0.1 });
    manager.combo.executeLightAttack(asm);
    manager.combo.bufferAction('heavy');
    manager.combo.update(0.5, asm);
    expect(manager.combo.getState().currentChain).toBe('light');
    manager.combo.interruptAttack();
    manager.combo.setConfig({ lightCombo: [] });
    expect(manager.combo.executeLightAttack(asm)).toBe(false);
  });

  it('ranged damage resolves the collider owner, not a nearby bystander', () => {
    const { engine, manager, add } = setup();
    add(2, new THREE.Vector3(0, 0, 5));
    const actual = add(3, new THREE.Vector3(0, 0, 5.2));
    engine.physicsWorld.raycast = () => ({ colliderHandle: 42, point: new THREE.Vector3(0, 1, 5) });
    engine.physicsWorld.rapierBodyFromColliderHandle = () => actual.rapierBody;
    manager.ranged.fire();
    expect(engine.combat.getHealth(2).hp).toBe(100);
    expect(engine.combat.getHealth(3).hp).toBeLessThan(100);
  });

  it('aiming preserves a custom camera FOV when disabled', () => {
    const { engine, manager } = setup();
    engine.viewport.camera.fov = 85;
    manager.ranged.setAiming(true);
    manager.disableFeature('ranged_shooter');
    expect(engine.viewport.camera.fov).toBe(85);
    expect(manager.ranged.aiming).toBe(false);
  });

  it('selecting the initial loadout slot equips it, and switching does not refill magazines', () => {
    const { manager } = setup();
    manager.loadout.selectSlot(1);
    expect(manager.ranged.weapon?.id).toBe(manager.loadout.activeWeapon?.id);
    manager.ranged.fire();
    const ammo = manager.ranged.ammo;
    manager.loadout.selectSlot(2);
    manager.loadout.selectSlot(1);
    expect(manager.ranged.ammo).toBe(ammo);
  });
});

describe('time and traversal', () => {
  it.each(['time_first', 'wheel_first'])('overlapping slow motion restores the base scale (%s)', order => {
    const { engine, manager } = setup();
    engine.timeDilation.setGlobalTimeScale(0.8);
    if (order === 'time_first') { manager.time.activateBulletTime(); manager.loadout.openWheel(); }
    else { manager.loadout.openWheel(); manager.time.activateBulletTime(); }
    manager.time.deactivateBulletTime();
    expect(engine.timeDilation.getGlobalTimeScale()).toBe(manager.loadout.getConfig().timeScale);
    manager.loadout.closeWheel();
    expect(engine.timeDilation.getGlobalTimeScale()).toBe(0.8);
  });

  it.each([30, 120])('rewind retains configured seconds at %i FPS', fps => {
    const { engine, manager } = setup();
    manager.time.setConfig({ rewindDuration: 3 });
    for (let i = 0; i < fps * 4; i++) {
      engine._entities.get(1).mesh.position.x = i / fps;
      manager.time.update(1 / fps);
    }
    expect(manager.time.rewindTime()).toBe(true);
    expect(engine._entities.get(1).mesh.position.x).toBeCloseTo(1, 1);
  });

  it('rewind does not use another possessed character history', () => {
    const { engine, manager, add } = setup();
    for (let i = 0; i < 20; i++) manager.time.update(0.1);
    add(2);
    engine.player.getPossessedId = () => 2;
    expect(manager.time.rewindTime()).toBe(false);
  });

  it('vehicle friction never reverses velocity on a long frame and disabling dismounts', () => {
    const { engine, manager, add } = setup();
    add(2);
    engine._tags.set(2, new Set(['vehicle']));
    manager.vehicle.toggleMount();
    manager.vehicle.update(0.1, 1, 0, false, false);
    manager.vehicle.update(1, 0, 0, true, false);
    expect(manager.vehicle.speed).toBeGreaterThanOrEqual(0);
    manager.disableFeature('vehicle_mount');
    expect(manager.vehicle.isMounted).toBe(false);
  });

  it('grapple movement cannot overshoot its anchor on a long frame', () => {
    const { engine, manager } = setup();
    manager.grapple.fireGrapple();
    const anchor = manager.grapple.anchor.clone();
    manager.grapple.update(10);
    expect(engine._entities.get(1).mesh.position.distanceTo(anchor)).toBeLessThan(0.001);
  });

  it('disabling companions dismisses their spawned body', () => {
    const { engine, manager } = setup();
    manager.companion.summonCompanion();
    expect(engine._entities.size).toBe(2);
    manager.disableFeature('companion_summon');
    expect(manager.companion.isSummoned).toBe(false);
    expect(engine._entities.size).toBe(1);
  });
});

describe('arena and encounter lifecycle', () => {
  it('arena AI follows the actual player and attacks through modular hitboxes', () => {
    const { engine, manager, add } = setup();
    manager.disableFeature('time_mechanics');
    const enemy = add(2, new THREE.Vector3(5, 0, 0));
    engine._entities.get(1).mesh.position.set(12, 0, 0);
    manager.encounterAI.registerEnemy(2);
    manager.encounterAI.update(1 / 60);
    expect(enemy.mesh.position.x).toBeGreaterThan(5);
    for (let i = 0; i < 300; i++) {
      manager.encounterAI.update(1 / 60);
      manager.hitboxes.update(1 / 60);
    }
    expect(engine.combat.getHealth(1)?.hp ?? 0).toBeLessThan(100);
  });

  it('disposing all modules removes their event listeners and restores slow motion', () => {
    const { engine, manager, add } = setup();
    add(2);
    manager.encounterAI.registerEnemy(2);
    manager.loadout.openWheel();
    manager.time.activateBulletTime();
    expect(engine.sceneManager.events.listenerCount).toBeGreaterThan(0);
    manager.dispose();
    expect(engine.sceneManager.events.listenerCount).toBe(0);
    expect(engine.timeDilation.getGlobalTimeScale()).toBe(1);
  });
  it('arena uses simulation time and recognizes the engine destruction payload', () => {
    const { engine, manager } = setup();
    const spawn = vi.spyOn(engine.sceneManager, 'spawnNow');
    manager.arena.setConfig({ waves: [{ id: 'test', title: 'Test', enemies: [{ blueprint: 'enemy', count: 1, delaySec: 0 }], rewardExp: 0, intermissionSec: 0 } as any] });
    manager.arena.startArena();
    manager.arena.update(3);
    manager.arena.update(0.01);
    expect(spawn).toHaveBeenCalledWith(expect.any(THREE.Vector3), { kind: 'character', params: { assetId: 'enemy' } }, { rootMotion: true });
    expect(manager.arena.getState().enemiesRemaining).toBe(1);
    const enemyId = [...engine._entities.keys()].find(id => id !== 1)!;
    engine.sceneManager.events.emit('entity_destroyed', { entityId: enemyId });
    expect(manager.arena.getState().state).toBe('victory');
  });

  it('defeat and disable cancel delayed spawns; empty waves complete', () => {
    const { engine, manager } = setup();
    manager.arena.startArena();
    manager.arena.update(3);
    engine.sceneManager.events.emit('player_death', { target: 1 });
    manager.arena.update(100);
    expect(engine._entities.size).toBe(1);
    manager.disableFeature('arena_flow');
    expect(manager.arena.getState().state).toBe('idle');
    manager.enableFeature('arena_flow');
    manager.arena.setConfig({ waves: [{ id: 'empty', title: 'Empty', enemies: [], rewardExp: 0, intermissionSec: 0 } as any] });
    manager.arena.startArena(); manager.arena.update(3); manager.arena.update(0.01);
    expect(manager.arena.getState().state).toBe('victory');
  });

  it('destroyed enemies release scarce attack tokens', () => {
    const { engine, manager, add } = setup();
    add(2); add(3);
    manager.encounterAI.setConfig({ maxSimultaneousAttackTokens: 1 });
    expect(manager.encounterAI.requestAttackToken(2)).toBe(true);
    expect(manager.encounterAI.requestAttackToken(3)).toBe(false);
    engine._entities.delete(2);
    manager.encounterAI.update(0.01);
    expect(manager.encounterAI.requestAttackToken(3)).toBe(true);
  });
});

describe('prototype input and command integration', () => {
  it('real Rapier rays originating inside the player skip the capsule and reach the obstacle', async () => {
    const physics = await PhysicsWorld.create();
    try {
      const R = physics.RAPIER;
      const player = physics.createRigidBody(R.RigidBodyDesc.fixed());
      physics.createBoxCollider(player, 1, 1, 1, false, false);
      const wall = physics.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 5));
      physics.createBoxCollider(wall, 2, 2, 0.5, false, false);
      physics.step(1 / 60);
      const hit = physics.raycastExcludeBody(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 10, player);
      expect(hit?.toi).toBeCloseTo(4.5);
      expect(hit?.point.z).toBeCloseTo(4.5);
    } finally { physics.dispose(); }
  });
  function controls() {
    const context = setup();
    const keys = new Set<string>();
    context.engine.input = {
      isKeyDown: (key: string) => keys.has(key), isMouseButtonDown: () => false,
      isActionPressed: () => false, isActionActive: () => false,
      getActionAxis2D: () => ({ x: 0, y: 0 }), isPointerLocked: false,
    };
    const controller = new PlayerController(context.engine);
    const locomotor = { intent: { moveX: 1, moveZ: 1, jump: true, jumpHeld: true }, getState: () => 'idle', fixedStep: vi.fn() };
    (controller as any).locomotor = locomotor;
    const tick = () => (controller as any).updateMovement(0.016, context.engine._entities.get(1), createMockAsm());
    return { ...context, keys, controller, locomotor, tick };
  }

  it('reload does not lock targets or drink flasks; grapple and grenades have separate keys', () => {
    const { manager, keys, tick } = controls();
    const reload = vi.spyOn(manager.ranged, 'reload');
    const lock = vi.spyOn(manager.targetLock, 'toggleLock');
    const drink = vi.spyOn(manager.flasks, 'drinkFlask');
    const grapple = vi.spyOn(manager.grapple, 'fireGrapple');
    const grenade = vi.spyOn(manager.explosives, 'throwGrenade');
    keys.add('KeyR'); tick();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(lock).not.toHaveBeenCalled(); expect(drink).not.toHaveBeenCalled();
    keys.clear(); tick(); keys.add('KeyG'); tick();
    expect(grenade).toHaveBeenCalledTimes(1); expect(grapple).not.toHaveBeenCalled();
    keys.clear(); tick(); keys.add('KeyJ'); tick();
    expect(grapple).toHaveBeenCalledTimes(1);
  });

  it('Tab + number selects a weapon without casting abilities or leaving movement held', () => {
    const { manager, keys, locomotor, tick } = controls();
    const cast = vi.spyOn(manager.abilities, 'castAbility');
    keys.add('Tab'); keys.add('Digit2'); tick();
    expect(manager.loadout.getState().activeSlot).toBe(2);
    expect(cast).not.toHaveBeenCalled();
    expect(locomotor.intent.moveX).toBe(0);
    expect(locomotor.intent.jumpHeld).toBe(false);
  });

  it('kinematic locomotion cannot overwrite an active dodge target', () => {
    const { manager, controller, locomotor } = controls();
    manager.defense.executeDodge(createMockAsm(), { x: 0, y: -1 }, 0);
    controller.fixedStep(1 / 60);
    expect(locomotor.fixedStep).not.toHaveBeenCalled();
  });

  it('feature commands are discoverable and reject unknown features and invalid slots', () => {
    const registry = CommandRegistry.default;
    expect(registry.validateCommand({ type: 'feature_enable', feature: 'target_lock' }).valid).toBe(true);
    expect(registry.validateCommand({ type: 'feature_enable', feature: 'typo' }).valid).toBe(false);
    expect(registry.validateCommand({ type: 'ability_cast', slot: 1.5 }).valid).toBe(false);
    expect(registry.validateCommand({ type: 'feature_configure', feature: 'target_lock' }).valid).toBe(false);
  });

  it('anime preset enables and tunes combat after disabling all features', () => {
    const { manager } = setup();
    manager.disableAllFeatures();
    manager.applyPreset('anime');
    expect(manager.isFeatureEnabled('combo_system')).toBe(true);
    expect(manager.defense.maxStamina).toBe(180);
  });

  it('large grenade updates detonate at the fuse position, not far beyond it', () => {
    const { engine, manager } = setup();
    const positions: THREE.Vector3[] = [];
    engine.sceneManager.events.on('grenade_exploded', (e: any) => positions.push(e.position.clone()));
    manager.explosives.setConfig({ grenades: [{ ...manager.explosives.getConfig().grenades[0], fuseTime: 0.1, throwVelocity: 10 }] });
    manager.explosives.throwGrenade();
    const start = manager.explosives.grenades[0].position.clone();
    manager.explosives.update(10);
    expect(positions).toHaveLength(1);
    expect(positions[0].distanceTo(start)).toBeLessThan(2);
  });
});

