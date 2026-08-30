/** The command schema and runtime share this catalog. */
export const GAMEPLAY_PRESETS = [
  'souls', 'action', 'shooter', 'anime', 'defaults', 'essentials',
  'city_builder', 'gta_open_world', 'gta_full_open_world', 'fps_starter',
  'zombie_survival', 'fps_zombies', 'zombie_nazi_survival',
  'zombie_outbreak_rpg', 'zombie_arcade_frenzy', 'zombie_ultimate_experience',
] as const;
export type GameplayPreset = typeof GAMEPLAY_PRESETS[number];
