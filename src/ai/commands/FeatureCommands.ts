import * as THREE from 'three';
import type { CommandMap, CmdCtx } from './BridgeContext';
import { GameplayFeatureRegistry } from '../../features/gameplay/GameplayFeatureRegistry';
import type { CityGenerationConfig } from '../../features/city/types';

export function register(map: CommandMap, ctx: CmdCtx): void {
  const warnMissing = (cmd: string) =>
    ctx.setQueryResult({ ok: false, code: 'MANAGER_UNAVAILABLE', command: cmd });

  const general = (run: (features: NonNullable<CmdCtx['gameplayFeatures']>, cmd: any) => unknown) => {
    return (cmd: any) => {
      if (!ctx.gameplayFeatures) return warnMissing(cmd.type);
      const result = run(ctx.gameplayFeatures, cmd);
      ctx.setQueryResult(result);
      return result;
    };
  };
  map.set('game_pause', general(f => ({ ok: f.pause.pause(), paused: f.pause.isPaused })));
  map.set('game_resume', general(f => ({ ok: f.pause.resume(), paused: f.pause.isPaused })));
  map.set('game_settings_set', general((f, cmd) => { f.settings.setPreferences(cmd.settings); return { settings: { ...f.settings.getConfig() } }; }));
  map.set('objective_add', general((f, cmd) => ({ ok: f.objectives.add({ id: cmd.id, title: cmd.title, target: cmd.target }) })));
  map.set('objective_advance', general((f, cmd) => ({ ok: f.objectives.advance(cmd.id, cmd.amount) })));
  map.set('game_notify', general((f, cmd) => ({ id: f.notifications.show(cmd.message) })));
  map.set('session_start', general(f => ({ ok: f.session.start() })));
  map.set('session_add_score', general((f, cmd) => ({ ok: f.session.addScore(cmd.amount), session: f.session.getState() })));
  map.set('session_finish', general((f, cmd) => ({ ok: f.session.finish(cmd.result) })));
  map.set('game_essentials_status', general(f => ({ paused: f.pause.isPaused, session: f.session.getState(), objectives: f.objectives.items, settings: { ...f.settings.getConfig() } })));

  map.set('feature_list', () => {
    const gfm = ctx.gameplayFeatures;
    const list = GameplayFeatureRegistry.list().map((feat) => ({
      id: feat.id,
      name: feat.name,
      category: feat.category,
      enabled: gfm ? gfm.isFeatureEnabled(feat.id) : false,
      description: feat.description,
    }));
    ctx.setQueryResult(list);
    return list;
  });

  const mutate = (run: (f: NonNullable<CmdCtx['gameplayFeatures']>, cmd: any) => Record<string, unknown>) => general((f, cmd) => {
    if (cmd.feature && !GameplayFeatureRegistry.get(cmd.feature)) return { ok: false, code: 'INVALID_FEATURE', feature: cmd.feature };
    try { return run(f, cmd); }
    catch (error) { return { ok: false, code: 'INVALID_CONFIGURATION', error: String(error) }; }
  });
  map.set('feature_enable', mutate((f, cmd) => ({ ok: f.enableFeature(cmd.feature), feature: cmd.feature, enabled: f.isFeatureEnabled(cmd.feature) })));
  map.set('feature_disable', mutate((f, cmd) => ({ ok: f.disableFeature(cmd.feature), feature: cmd.feature, enabled: f.isFeatureEnabled(cmd.feature) })));
  map.set('feature_configure', mutate((f, cmd) => {
    f.configureFeature(cmd.feature, cmd.config);
    return { ok: true, feature: cmd.feature, config: f.getSystem(cmd.feature).getConfig() };
  }));
  map.set('feature_enable_all', mutate(f => {
    f.enableAllFeatures();
    const allEnabled = GameplayFeatureRegistry.list().every(d => f.isFeatureEnabled(d.id));
    return { ok: allEnabled, allEnabled };
  }));
  map.set('feature_apply_preset', mutate((f, cmd) => ({ ok: true, preset: cmd.preset, enabledFeatures: f.applyPreset(cmd.preset) })));
  map.set('arena_start', general(f => { const ok = f.arena.startArena(); return { ok, arenaStarted: ok }; }));

  map.set('target_lock_toggle', () => {
    if (!ctx.gameplayFeatures) return warnMissing('target_lock_toggle');
    const before = ctx.gameplayFeatures.targetLock.isLocked;
    ctx.gameplayFeatures.targetLock.toggleLock();
    const isLocked = ctx.gameplayFeatures.targetLock.isLocked;
    ctx.setQueryResult({ ok: before !== isLocked, isLocked });
  });


  map.set('ability_cast', (cmd: { type: 'ability_cast'; slot: 1 | 2 | 3 | 4 }) => {
    if (!ctx.gameplayFeatures) return warnMissing('ability_cast');
    const ok = ctx.gameplayFeatures.abilities.castAbility(cmd.slot);
    ctx.setQueryResult({ ok, slot: cmd.slot });
  });

  map.set('arena_launch_demo', () => {
    if (!ctx.gameplayFeatures) return warnMissing('arena_launch_demo');
    ctx.gameplayFeatures.enableAllFeatures();
    const ok = ctx.gameplayFeatures.arena.startArena();
    if (ok) ctx.input.setMode('play');
    ctx.setQueryResult({ ok, demoLaunched: ok });
  });

  map.set('destruction_slice_mesh', (cmd: { type: 'destruction_slice_mesh'; entityId: number; planePoint?: { x: number; y: number; z: number }; planeNormal?: { x: number; y: number; z: number }; separationForce?: number }) => {
    if (!ctx.gameplayFeatures) return warnMissing('destruction_slice_mesh');
    const pt = cmd.planePoint ? new THREE.Vector3(cmd.planePoint.x, cmd.planePoint.y, cmd.planePoint.z) : new THREE.Vector3();
    const norm = cmd.planeNormal ? new THREE.Vector3(cmd.planeNormal.x, cmd.planeNormal.y, cmd.planeNormal.z) : new THREE.Vector3(0, 1, 0);
    const result = ctx.gameplayFeatures.meshSlicing.sliceEntity(cmd.entityId, pt, norm, cmd.separationForce);
    ctx.setQueryResult({ ok: result.cutArea > 0, ...result });
    return result;
  });

  map.set('destruction_create_crater', (cmd: { type: 'destruction_create_crater'; center: { x: number; y: number; z: number }; radius?: number; depth?: number; rimHeight?: number }) => {
    if (!ctx.gameplayFeatures) return warnMissing('destruction_create_crater');
    const center = new THREE.Vector3(cmd.center.x, cmd.center.y, cmd.center.z);
    const result = ctx.gameplayFeatures.deformableGround.createCrater(center, { radius: cmd.radius, depth: cmd.depth, lipHeight: cmd.rimHeight });
    const ok = !!result;
    ctx.setQueryResult({ ok });
    return { ok };
  });

  map.set('combat_trigger_impact_frame', (cmd: { type: 'combat_trigger_impact_frame'; style?: 'invert' | 'black_white' | 'crimson' | 'gold' | 'neon_cyan'; frames?: number }) => {
    if (!ctx.gameplayFeatures) return warnMissing('combat_trigger_impact_frame');
    ctx.gameplayFeatures.combatDirector.triggerImpactFrame(cmd.style, cmd.frames);
    ctx.setQueryResult({ ok: true, style: cmd.style ?? 'invert' });
  });

  map.set('combat_trigger_hit_stop', (cmd: { type: 'combat_trigger_hit_stop'; duration?: number; timeScale?: number }) => {
    if (!ctx.gameplayFeatures) return warnMissing('combat_trigger_hit_stop');
    ctx.gameplayFeatures.combatDirector.triggerHitStop(cmd.duration, cmd.timeScale);
    ctx.setQueryResult({ ok: true, inHitStop: true });
  });

  map.set('combat_trigger_camera_punch', (cmd: { type: 'combat_trigger_camera_punch'; fovPunch?: number; duration?: number }) => {
    if (!ctx.gameplayFeatures) return warnMissing('combat_trigger_camera_punch');
    ctx.gameplayFeatures.combatDirector.triggerCameraPunch(cmd.fovPunch, cmd.duration);
    ctx.setQueryResult({ ok: true });
  });

  map.set('combat_create_anime_outline', (cmd: { type: 'combat_create_anime_outline'; entityId: number; thickness?: number; color?: number }) => {
    if (!ctx.gameplayFeatures) return warnMissing('combat_create_anime_outline');
    const rb = ctx.sceneManager?.getRigidBody(cmd.entityId);
    if (!rb?.mesh) return { ok: false, error: 'Entity not found or has no mesh' };
    const outline = ctx.gameplayFeatures.combatDirector.createInvertedHullOutline(rb.mesh as THREE.Mesh, cmd.thickness, cmd.color);
    ctx.setQueryResult({ ok: !!outline });
    return { ok: !!outline };
  });

  map.set('city_generate_world', (cmd: { type: 'city_generate_world' } & CityGenerationConfig) => {
    if (!ctx.gameplayFeatures) return warnMissing('city_generate_world');
    const result = ctx.gameplayFeatures.city.generateWorld(cmd);
    ctx.setQueryResult({ ok: true, ...result });
    return result;
  });

  map.set('city_build_roads', (cmd: { type: 'city_build_roads'; algorithm?: CityGenerationConfig['roadAlgorithm']; density?: number } & CityGenerationConfig) => {
    if (!ctx.gameplayFeatures) return warnMissing('city_build_roads');
    const result = ctx.gameplayFeatures.city.buildRoads({ ...cmd, roadAlgorithm: cmd.roadAlgorithm ?? cmd.algorithm, roadDensity: cmd.roadDensity ?? cmd.density });
    ctx.setQueryResult({ ok: true, ...result });
    return result;
  });

  map.set('city_zone_districts', (cmd: { type: 'city_zone_districts'; worldSize?: number }) => {
    if (!ctx.gameplayFeatures) return warnMissing('city_zone_districts');
    const result = ctx.gameplayFeatures.city.zoneDistricts({ worldSize: cmd.worldSize });
    ctx.setQueryResult({ ok: true, ...result });
    return result;
  });

  map.set('city_spawn_buildings', (cmd: { type: 'city_spawn_buildings'; seed?: number }) => {
    if (!ctx.gameplayFeatures) return warnMissing('city_spawn_buildings');
    const result = ctx.gameplayFeatures.city.spawnBuildings(cmd.seed);
    ctx.setQueryResult({ ok: true, ...result });
    return result;
  });

  map.set('city_load_blueprint', (cmd: { type: 'city_load_blueprint'; blueprintName?: string }) => {
    if (!ctx.gameplayFeatures) return warnMissing('city_load_blueprint');
    const result = ctx.gameplayFeatures.city.loadBlueprint(cmd.blueprintName ?? 'GTA_Los_Santos');
    ctx.setQueryResult({ ok: true, ...result });
    return result;
  });

  map.set('city_clear', () => {
    if (!ctx.gameplayFeatures) return warnMissing('city_clear');
    ctx.gameplayFeatures.city.clear();
    ctx.setQueryResult({ ok: true, cleared: true });
    return { ok: true };
  });
}
