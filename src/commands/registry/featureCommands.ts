import type { CommandDefinition, CommandParamSchema } from '../types';
import { GameplayFeatureRegistry } from '../../features/gameplay/GameplayFeatureRegistry';

const feature: CommandParamSchema = { type: 'string', enum: GameplayFeatureRegistry.list().map(d => d.id) };
function command(type: string, summary: string, properties: Record<string, CommandParamSchema> = {}, read = false, requiredProperties = Object.keys(properties)): CommandDefinition {
  return {
    type, summary, category: 'gameplay', sideEffect: read ? 'read' : 'runtime',
    atomicSupport: 'none', atomicBoundary: 'Gameplay runtime state is not part of entity rollback.',
    capability: read ? 'system.read' : 'gameplay.mutate', versionIntroduced: '3.1.0',
    parameters: { type: 'object', properties, requiredProperties, additionalProperties: true },
  };
}

const cityParameters: Record<string, CommandParamSchema> = {
  worldSize: { type: 'number', minimum: 0.000001 },
  seed: { type: 'number' },
  roadAlgorithm: { type: 'string', enum: ['Grid', 'Organic', 'Radial'] },
  roadDensity: { type: 'number', minimum: 0, maximum: 1 },
  enableSidewalks: { type: 'boolean' },
  enableLaneMarkings: { type: 'boolean' },
  enableBuildings: { type: 'boolean' },
  enableStreetProps: { type: 'boolean' },
  enableVegetation: { type: 'boolean' },
  enableBridges: { type: 'boolean' },
};

export const featureCommandDefinitions: readonly CommandDefinition[] = [
  command('game_pause', 'Pause simulation and open the pause menu in play mode.'),
  command('game_resume', 'Resume paused gameplay.'),
  command('game_settings_set', 'Apply and optionally persist player graphics, audio and control preferences.', { settings: { type: 'object' } }),
  command('objective_add', 'Add an objective to the HUD and pause menu.', { id: { type: 'string' }, title: { type: 'string' }, target: { type: 'number', minimum: 0.000001 } }),
  command('objective_advance', 'Advance an objective; completion emits an event and notification.', { id: { type: 'string' }, amount: { type: 'number', minimum: 0.000001 } }),
  command('game_notify', 'Show a dismissible game notification.', { message: { type: 'string' } }),
  command('session_start', 'Start a round with fresh score and timer; does not reset the scene.'),
  command('session_add_score', 'Adjust the running round score.', { amount: { type: 'number' } }),
  command('session_finish', 'Finish the running round with a win or loss.', { result: { type: 'string', enum: ['won', 'lost'] } }),
  command('game_essentials_status', 'Read pause, session, objective and settings state.', {}, true),
  command('feature_list', 'List all modular gameplay systems and their enabled state.', {}, true),
  command('feature_enable', 'Enable a modular gameplay system.', { feature }),
  command('feature_disable', 'Disable a modular gameplay system and cancel its active actions.', { feature }),
  command('feature_configure', 'Configure a modular gameplay system.', { feature, config: { type: 'object' } }),
  command('feature_enable_all', 'Enable all modular gameplay systems.'),
  command('feature_apply_preset', 'Apply a gameplay tuning preset.', { preset: { type: 'string', enum: ['souls', 'action', 'shooter', 'anime', 'defaults', 'essentials', 'city_builder', 'gta_open_world', 'fps_starter'] } }),
  command('arena_start', 'Start the configured arena waves.'),
  command('target_lock_toggle', 'Toggle the player target lock.'),
  command('ability_cast', 'Cast an ability from a configured slot.', { slot: { type: 'integer', minimum: 1, maximum: 4 } }),
  command('arena_launch_demo', 'Enable gameplay systems, start the arena and enter play mode.'),
  command('destruction_slice_mesh', 'Procedurally slices an entity mesh along a 3D plane into two physical pieces.', { entityId: { type: 'integer' } }),
  command('destruction_create_crater', 'Deforms ground meshes to create a localized impact crater with raised rim.', { center: { type: 'object' } }),
  command('combat_trigger_impact_frame', 'Triggers a high-contrast inverted silhouette impact flash on lethal/critical hits.', { style: { type: 'string', enum: ['invert', 'black_white', 'crimson', 'gold', 'neon_cyan'] } }),
  command('combat_trigger_hit_stop', 'Triggers anime hit-stop time dilation for punch impact weight.', { duration: { type: 'number' } }),
  command('combat_trigger_camera_punch', 'Triggers camera FOV zoom punch with spring recovery.', { fovPunch: { type: 'number' } }),
  command('combat_create_anime_outline', 'Creates an inverted-hull cel-shaded ink outline on a character mesh.', { entityId: { type: 'integer' } }),
  command('city_generate_world', 'Procedurally generates an entire 3D city with roads, districts, buildings, bridges, and street props.', cityParameters, false, []),
  command('city_build_roads', 'Starts a new procedural road network with asphalt, sidewalks, curbs, and lane markings.', {
    ...cityParameters, algorithm: cityParameters.roadAlgorithm, density: cityParameters.roadDensity,
  }, false, []),
  command('city_zone_districts', 'Subdivides existing roads into parcel lots; preserves roads and clears outdated parcel content.', { worldSize: cityParameters.worldSize }, false, []),
  command('city_spawn_buildings', 'Populates existing zoned parcels with buildings, preserving roads and parcels.', { seed: cityParameters.seed }, false, []),
  command('city_load_blueprint', 'Loads a pre-designed city layout blueprint (e.g. GTA V Los Santos).', { blueprintName: { type: 'string' } }, false, []),
  command('city_clear', 'Clears all procedural city geometries and entities from the scene.'),
];
