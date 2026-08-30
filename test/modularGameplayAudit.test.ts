import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createMockEngine } from './helpers/gameplayEngine';
import { PersistentGameState } from '../src/ecs/PersistentGameState';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { GameplayFeatureRegistry } from '../src/features/gameplay/GameplayFeatureRegistry';
import { GAMEPLAY_PRESETS } from '../src/features/gameplay/GameplayPresets';
import { featureCommandDefinitions } from '../src/commands/registry/featureCommands';
import { validateFeatureConfig } from '../src/features/gameplay/FeatureValidation';
import { gameplayWallet } from '../src/features/gameplay/GameplayWallet';
import { register } from '../src/ai/commands/FeatureCommands';
import { SaveSystem } from '../src/persistence/SaveSystem';

function setup() {
  const engine = createMockEngine();
  engine.sceneManager.gameState = new PersistentGameState('modular-audit');
  engine.sceneManager.gameState.clear();
  const manager = new GameplayFeatureManager(engine);
  const wallet = gameplayWallet(engine);
  return { engine, manager, wallet };
}

describe('modular gameplay audit invariants', () => {
  it('starts optional systems inactive, with one activation source and no phantom updates', () => {
    const { manager } = setup();
    for (const id of ['zombie_horde_ai', 'wanted_crime', 'police_response'] as const) expect(manager.isFeatureEnabled(id)).toBe(false);
    manager.disableAllFeatures();
    for (const { id } of GameplayFeatureRegistry.list()) {
      expect(manager.getSystem(id).getConfig().enabled).toBe(false);
      expect(manager.isFeatureEnabled(id)).toBe(false);
    }
    const update = vi.spyOn(manager.zombieHorde, 'update');
    manager.update(1);
    expect(update).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('exposes every preset through the command schema', () => {
    const command = featureCommandDefinitions.find(d => d.type === 'feature_apply_preset')!;
    expect(command.parameters.properties.preset.enum).toEqual([...GAMEPLAY_PRESETS]);
  });

  it.each(GAMEPLAY_PRESETS)('replaces previous tuning deterministically: %s', preset => {
    const { manager } = setup();
    vi.spyOn(manager.city, 'loadBlueprint').mockImplementation(() => undefined as any);
    vi.spyOn(manager.city, 'generateWorld').mockImplementation(() => undefined as any);
    manager.applyPreset(preset);
    const clean = manager.toJSON();
    manager.applyPreset('gta_open_world');
    manager.applyPreset('anime');
    manager.applyPreset(preset);
    expect(manager.toJSON()).toEqual(clean);
    manager.dispose();
  });

  it('resolves declared dependencies and supports explicit composition', () => {
    const { manager } = setup();
    manager.applyPreset('essentials');
    manager.addPreset('souls');
    expect(manager.isFeatureEnabled('pause_menu')).toBe(true);
    manager.enableFeature('mystery_box_gambling');
    expect(manager.isFeatureEnabled('weapon_wheel_loadout')).toBe(true);
    expect(manager.isFeatureEnabled('ranged_shooter')).toBe(true);
    manager.dispose();
  });

  it.each(GameplayFeatureRegistry.list().map(d => [d.id, d] as const))('%s enforces its metadata and accepts its own defaults', (_id, descriptor) => {
    expect(() => validateFeatureConfig(descriptor, descriptor.defaultConfig)).not.toThrow();
    expect(() => validateFeatureConfig(descriptor, { unknown: true })).toThrow();
    for (const p of descriptor.properties) {
      if (p.type === 'number') {
        for (const value of [NaN, Infinity, '3']) expect(() => validateFeatureConfig(descriptor, { [p.key]: value })).toThrow();
        if (p.min !== undefined) expect(() => validateFeatureConfig(descriptor, { [p.key]: p.min - 1 })).toThrow();
        if (p.max !== undefined) expect(() => validateFeatureConfig(descriptor, { [p.key]: p.max + 1 })).toThrow();
      }
      if (p.options) expect(() => validateFeatureConfig(descriptor, { [p.key]: 'invalid-enum-value' })).toThrow();
    }
  });

  it('refuses unsafe configuration without partial mutation or false success', () => {
    const { engine, manager } = setup();
    const commands = new Map();
    let result: any;
    register(commands, { gameplayFeatures: manager, input: engine.input, setQueryResult: (r: any) => result = r } as any);
    commands.get('feature_enable')({ feature: 'not_a_feature' });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_FEATURE' });
    commands.get('feature_configure')({ feature: 'zombie_horde_ai', config: { surroundSlotsCount: 0 } });
    expect(result.ok).toBe(false);
    expect(manager.zombieHorde.getConfig().surroundSlotsCount).toBe(8);
    expect(() => manager.zombieHorde.setConfig({ surroundSlotsCount: 0 })).toThrow();
    manager.disableFeature('arena_flow');
    commands.get('arena_start')({});
    expect(result).toEqual({ ok: false, arenaStarted: false });
    manager.dispose();
  });

  it('shares real points across rewards and every purchase, without infinite-credit fallback', () => {
    const { manager, wallet } = setup();
    manager.applyPreset('zombie_survival');
    expect(wallet.getBalance()).toBe(0);
    expect(manager.mysteryBox.spinBox()).toBe(false);
    expect(manager.perkVending.buyPerk('juggernog')).toBe(false);
    expect(manager.packAPunch.upgradeWeapon('fps_ak47')).toBe(false);
    expect(manager.powerGrid.buyDoor('door_hallway_east')).toBe(false);
    wallet.set(10000);
    expect(manager.mysteryBox.spinBox()).toBe(true);
    expect(wallet.getBalance()).toBe(9050);
    manager.barricades.damageBarricade('window_north', 2);
    manager.barricades.repairBarricade('window_north', 2);
    expect(wallet.getBalance()).toBe(9070);
    expect(manager.perkVending.buyPerk('juggernog')).toBe(true);
    expect(wallet.getBalance()).toBe(6570);
    expect(wallet.trySpend(NaN)).toBe(false);
    expect(wallet.trySpend(-1)).toBe(false);
    manager.dispose();
  });

  it('preserves barricades through disable/enable and blocks disabled power actions', () => {
    const { manager, wallet } = setup();
    manager.enableFeature('barricade_boarding');
    manager.barricades.damageBarricade('window_north', 2);
    manager.disableFeature('barricade_boarding');
    expect(manager.barricades.repairBarricade('window_north')).toBe(0);
    manager.enableFeature('barricade_boarding');
    expect(manager.barricades.getBarricade('window_north')?.currentPlanks).toBe(4);
    wallet.set(10000);
    expect(manager.powerGrid.turnPowerOn()).toBe(false);
    expect(manager.powerGrid.buyDoor('door_hallway_east')).toBe(false);
    expect(manager.powerGrid.activateTrap('trap_electric_hall')).toBe(false);
    expect(wallet.getBalance()).toBe(10000);
    manager.dispose();
  });

  it('removes perks from their original targets, including actual KCC run speed', () => {
    const { engine, manager, wallet } = setup();
    const params = { maxRunSpeed: 10 };
    engine.player.getLocomotor = () => ({ params });
    wallet.set(10000);
    manager.enableFeature('perk_vending_machines');
    expect(manager.perkVending.buyPerk('stamin_up')).toBe(true);
    expect(params.maxRunSpeed).toBe(13.5);
    params.maxRunSpeed += 2; // unrelated equipment modifier must survive
    manager.disableFeature('perk_vending_machines');
    expect(params.maxRunSpeed).toBe(12);
    manager.enableFeature('perk_vending_machines');
    const baseHealth = engine.combat.getHealth(1).maxHp;
    engine.player.getPossessedId = () => null;
    expect(manager.perkVending.buyPerk('juggernog')).toBe(false);
    expect(engine.combat.getHealth(1).maxHp).toBe(baseHealth);
    manager.dispose();
  });

  it('never targets entity 1 from an editor camera or a decoy', () => {
    const { engine, manager } = setup();
    manager.enableFeature('zombie_horde_ai');
    const zombie = manager.zombieHorde.spawnZombie('shambler', new THREE.Vector3())!;
    engine.player.getPossessedId = () => null;
    expect((manager.zombieHorde as any).findBestVictim(zombie)).toBeNull();
    const damage = vi.spyOn(engine.combat, 'applyDamage');
    (manager.zombieHorde as any).projectiles.push({ position: engine.viewport.camera.position.clone(), velocity: new THREE.Vector3(), radius: 10, lifeTime: 5, damage: 99 });
    manager.update(0.1);
    expect(damage).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('emits audible shooter fire and updates presentation exactly once', () => {
    const { manager } = setup();
    manager.enableFeature('zombie_horde_ai');
    const heard = vi.spyOn(manager.zombieHorde, 'notifyNoise');
    expect(manager.ranged.fire()).toBe(true);
    expect(heard).toHaveBeenCalledWith(expect.any(THREE.Vector3), 35);
    const present = vi.spyOn(manager.ranged, 'updatePresentation');
    manager.update(0.01);
    manager.updateRealtime(0.01);
    expect(present).toHaveBeenCalledTimes(1);
    manager.disableFeature('ranged_shooter');
    present.mockClear();
    manager.updateRealtime(0.01);
    expect(present).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('records one crime only after a successful linked-driver claim', () => {
    const { engine, manager } = setup();
    manager.enableFeature('vehicle_theft');
    const eject = vi.spyOn(manager.civilian, 'ejectDriver').mockImplementation(() => {});
    vi.spyOn(manager.civilian, 'getCivilians').mockReturnValue([{ id: 'driver', mode: 'driving' }, { id: 'unrelated', mode: 'driving' }] as any);
    const nearest = vi.spyOn(manager.traffic, 'findNearestHijackable').mockReturnValue(null);
    expect(manager.vehicleTheft.attemptHijack().success).toBe(false);
    expect(eject).not.toHaveBeenCalled();
    nearest.mockReturnValue({ carId: 'car', driverId: 'driver', position: new THREE.Vector3() } as any);
    const claim = vi.spyOn(manager.traffic, 'claimCarForPlayer').mockReturnValue(false);
    expect(manager.vehicleTheft.attemptHijack().success).toBe(false);
    expect(eject).not.toHaveBeenCalled();
    claim.mockReturnValue(true);
    const crime = vi.spyOn(manager.wanted, 'reportCrime');
    expect(manager.vehicleTheft.attemptHijack().success).toBe(true);
    expect(eject).toHaveBeenCalledWith('driver', expect.any(THREE.Vector3));
    expect(crime).toHaveBeenCalledTimes(1);
    engine.sceneManager.events.emit('civilian_ejected', { position: new THREE.Vector3() });
    expect(crime).toHaveBeenCalledTimes(1);
    manager.dispose();
  });

  it('round-trips modular runtime through the main save pipeline and rejects malformed config before mutation', async () => {
    const { engine, manager, wallet } = setup();
    manager.applyPreset('zombie_survival');
    wallet.set(50000);
    for (let i = 0; i < 3; i++) { manager.packAPunch.upgradeWeapon('fps_ak47'); manager.packAPunch.update(100); }
    manager.powerGrid.turnPowerOn();
    manager.powerGrid.buyDoor('door_hallway_east');
    const before = manager.toJSON();
    const slots = new Map<string, string>();
    const saves = new SaveSystem({
      gameplayDef: () => null, gameplaySerialize: () => null, gameplayLoad() {}, gameplayRestore() {},
      inventorySerialize: () => '{}', inventoryRestore() {},
      featuresSerialize: () => manager.toJSON(), featuresValidate: d => manager.validateSnapshot(d), featuresRestore: d => manager.fromJSON(d),
      stateGetAll: () => engine.sceneManager.gameState.getAll(), stateSet: (k, v) => engine.sceneManager.gameState.setItem(k, v), stateClear: () => engine.sceneManager.gameState.clear(),
      getPlayerTransform: () => null, setPlayerTransform() {},
      store: (k, v) => { slots.set(k, v); }, read: k => slots.get(k) ?? null, listSlots: () => [...slots.keys()], removeSlot: k => { slots.delete(k); },
    });
    await saves.save('test');
    manager.packAPunch.upgradeWeapon('stale-weapon');
    manager.applyPreset('souls');
    expect(saves.load('test')).not.toBeNull();
    expect(manager.packAPunch.getUpgradeState('fps_ak47')?.maxReserveMultiplier).toBe(2.5);
    expect(manager.packAPunch.getUpgradeState('stale-weapon')).toBeUndefined();
    expect(manager.toJSON()).toEqual(before);
    const malformed: any = structuredClone(before);
    malformed.zombie_horde_ai.surroundSlotsCount = 0;
    expect(() => manager.fromJSON(malformed)).toThrow();
    expect(manager.toJSON()).toEqual(before);
    manager.dispose();
  });

  it('freezes zombie recovery and police vehicle exits while paused', () => {
    const { manager } = setup();
    manager.enableFeature('zombie_horde_ai');
    manager.enableFeature('police_response');
    const zombie = manager.zombieHorde.spawnZombie('shambler', new THREE.Vector3(0, 0, 2))!;
    zombie.state = 'attacking'; zombie.stateTimer = 0.4;
    manager.police.update(0.01, 2, false);
    const units = (manager.police as any).units;
    units[0].position.set(2, 0, 0); units[0].mode = 'pursuit_drive';
    manager.police.update(0.01, 2, false);
    expect(units[0].mode).toBe('exiting_vehicle');
    manager.pause.pause();
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(5000);
      manager.update(5);
      expect(zombie.state).toBe('attacking');
      expect(zombie.stateTimer).toBe(0.4);
      expect(units[0].mode).toBe('exiting_vehicle');
    } finally { vi.useRealTimers(); }
    manager.pause.resume();
    manager.zombieHorde.update(0.5);
    manager.police.update(0.7, 2, false);
    expect(zombie.state).toBe('chasing');
    expect(units[0].mode).toBe('pursuit_foot');
    manager.dispose();
  });

  it('recycles nearby corpses and recovers ejected civilians using simulation time', () => {
    const { manager } = setup();
    manager.enableFeature('civilian_population');
    manager.civilian.update(0.1);
    const civilians = manager.civilian.getCivilians();
    const corpse = civilians[0], driver = civilians[1];
    corpse.position.set(0, 0, 0); driver.position.set(1, 0, 0);
    manager.civilian.applyDamage(corpse.id, 10000);
    manager.civilian.ejectDriver(driver.id, new THREE.Vector3(1, 0, 0));
    manager.civilian.update(0.5);
    expect(corpse.mode).toBe('dead'); expect(driver.mode).toBe('ejected');
    manager.civilian.update(1);
    expect(driver.mode).toBe('fleeing');
    manager.civilian.update(15);
    expect(corpse.mode).not.toBe('dead');
    expect(corpse.health).toBeGreaterThan(0);
    manager.dispose();
  });

  it('replaces live zombie and wonder-weapon state without losing vector methods', () => {
    const { manager } = setup();
    manager.applyPreset('zombie_ultimate_experience');
    manager.zombieHorde.spawnZombie('shambler', new THREE.Vector3(0, 0, 20));
    manager.wonderWeapons.throwMonkeyBomb(new THREE.Vector3(3, 0, 3));
    manager.wonderWeapons.throwGerschDevice(new THREE.Vector3(-3, 0, -3));
    const sale = manager.zombiePowerups.spawnDrop(new THREE.Vector3(), 'fire_sale');
    manager.zombiePowerups.collectDrop(sale.id);
    manager.zombieBosses.spawnBoss('panzer_soldat', new THREE.Vector3(30, 0, 0));
    const snapshot = manager.toJSON();
    manager.update(0.2);
    manager.fromJSON(snapshot);
    expect(manager.toJSON()).toEqual(snapshot);
    expect(() => manager.update(0.1)).not.toThrow();
    const invalid: any = structuredClone(snapshot);
    invalid.runtime.zombie_horde_ai.zombies[0].position = { x: 1 };
    const before = manager.toJSON();
    expect(() => manager.fromJSON(invalid)).toThrow();
    expect(manager.toJSON()).toEqual(before);
    manager.dispose();
  });

  it('releases procedurally-owned meshes when rebuilding pools', () => {
    const { manager } = setup();
    const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const disposeMaterial = vi.spyOn(THREE.Material.prototype, 'dispose');
    manager.enableFeature('barricade_boarding');
    manager.barricades.clearAll();
    expect(disposeGeometry).toHaveBeenCalled();
    expect(disposeMaterial).toHaveBeenCalled();
    manager.dispose();
    disposeGeometry.mockRestore(); disposeMaterial.mockRestore();
  });
});
