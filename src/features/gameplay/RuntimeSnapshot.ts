/** Validate untrusted save data before applying any subsystem mutation. */
export function validateRuntimeSnapshot(value: unknown, sample?: any, path = 'runtime', depth = 0): void {
  if (depth > 40) throw new Error(`${path}: snapshot nesting is too deep`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path} must be finite`);
  if (value === undefined || typeof value === 'function') throw new Error(`${path} is not JSON data`);
  if (sample != null && value !== null && (typeof sample !== typeof value || Array.isArray(sample) !== Array.isArray(value))) throw new Error(`${path}: incorrect snapshot type`);
  if (Array.isArray(value)) {
    if (value.length > 100000) throw new Error(`${path}: snapshot array too large`);
    value.forEach((v, i) => validateRuntimeSnapshot(v, sample?.[0], `${path}[${i}]`, depth + 1));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`${path}.${key} is not allowed`);
      validateRuntimeSnapshot(child, sample?.[key], `${path}.${key}`, depth + 1);
    }
  }
}

/** Semantic checks for the mutable progress fields used by the gameplay modules. */
export function validateFeatureRuntime(id: string, data: any): void {
  validateRuntimeSnapshot(data);
  const integer = (value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)) throw new Error(`${id}.${name} must be an integer in [${min}, ${max}]`);
  };
  const vector = (value: any, name: string) => {
    if (!value || !['x', 'y', 'z'].every(k => typeof value[k] === 'number' && Number.isFinite(value[k]))) throw new Error(`${id}.${name} requires finite x, y, z`);
  };
  if (id === 'wanted_crime') {
    integer(data.wantedLevel, 'wantedLevel', 0, 6);
    if (data.heat !== undefined && (typeof data.heat !== 'number' || data.heat < 0)) throw new Error('Wanted heat must be nonnegative');
  }
  if (id === 'zombie_horde_ai') {
    if (data.mode !== undefined && !['waves', 'open_world_wandering', 'dormant_ambush'].includes(data.mode)) throw new Error('Invalid zombie mode');
    integer(data.maxActiveZombies, 'maxActiveZombies', 1, 200);
    integer(data.currentWaveIndex, 'currentWaveIndex'); integer(data.totalKills, 'totalKills');
    for (const key of ['currentWaveIndex', 'totalKills', 'zombiesSpawned', 'zombiesAlive']) integer(data.waveState?.[key], key);
    for (const zombie of data.zombies ?? []) {
      if (!['idle', 'wandering', 'investigating_noise', 'chasing', 'attacking', 'lunging', 'spitting', 'staggered', 'crawling', 'dead'].includes(zombie.state)) throw new Error('Invalid zombie behavior state');
      vector(zombie.position, 'position'); vector(zombie.velocity, 'velocity');
      if (zombie.targetPosition) vector(zombie.targetPosition, 'targetPosition');
      if (zombie.lastNoisePosition) vector(zombie.lastNoisePosition, 'lastNoisePosition');
    }
    for (const projectile of data.projectiles ?? []) { vector(projectile.position, 'position'); vector(projectile.velocity, 'velocity'); }
  }
  if (id === 'pack_a_punch_upgrade') for (const upgrade of data.upgradedWeapons ?? []) {
    if (typeof upgrade.weaponId !== 'string' || ![1, 2, 3].includes(upgrade.tier)) throw new Error('Invalid weapon upgrade snapshot');
    if (upgrade.aat !== undefined && !['none', 'blast_furnace', 'dead_wire', 'cryo_freeze', 'brain_rot'].includes(upgrade.aat)) throw new Error('Invalid alternate ammo type');
  }
  for (const key of ['activeBosses', 'activeHounds', 'activeDrops', 'deployedBuildables', 'activeMonkeyBombs', 'activeGerschVortices']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error(`${id}.${key} must be an array`);
    for (const item of data[key] ?? []) { vector(item.position, `${key}.position`); if (item.velocity) vector(item.velocity, `${key}.velocity`); }
  }
  if (id === 'barricade_boarding') for (const barricade of data.barricades ?? []) {
    integer(barricade.maxPlanks, 'maxPlanks', 1); integer(barricade.currentPlanks, 'currentPlanks', 0, barricade.maxPlanks);
    if (!['wood', 'metal', 'electrified'].includes(barricade.tier)) throw new Error('Invalid barricade tier');
  }
  if (id === 'infection_immunity_meter' && data.infectionPercent !== undefined && (typeof data.infectionPercent !== 'number' || data.infectionPercent < 0 || data.infectionPercent > 100)) throw new Error('Infection must be in [0, 100]');
}
