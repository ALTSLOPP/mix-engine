import type { WeaponSpec } from './CombatSystem';

/**
 * WeaponProfiles.ts — a data-driven weapon table.
 *
 * Ported from the GTA prototype's `weaponProfiles.ts` (`WEAPON_DEFS`). The engine's
 * CombatSystem already understands a `WeaponSpec` (mode/damage/fireRate/spread/range/…); this
 * promotes the *catalogue* of weapons to data so an IDE/agent can equip a weapon by name
 * (`combat_equip_weapon { entityId, weapon: "shotgun" }`) instead of re-typing every stat.
 *
 * Only the combat-relevant fields are mapped onto the engine's WeaponSpec. The prototype's
 * presentation-only fields (hold-model paths, icons, tracer colours, aim-assist tuning) are
 * intentionally dropped — they belong to a game's `main.js`, not the engine's combat core.
 */

export type WeaponProfileId = 'fists' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'bazooka';

/** A named weapon profile: a WeaponSpec plus an id/label for catalogue lookup. */
export type WeaponProfile = WeaponSpec & { id: WeaponProfileId; name: string };

export const WEAPON_PROFILES: Record<WeaponProfileId, WeaponProfile> = {
  fists: {
    id: 'fists', name: 'Fists',
    mode: 'hitscan', damage: 12, fireRate: 3, spread: 0, range: 3,
    damageType: 'melee', hitVfx: 'sparks',
  },
  pistol: {
    id: 'pistol', name: 'Pistol',
    mode: 'hitscan', damage: 22, fireRate: 4, spread: 0.01, range: 110,
    damageType: 'bullet', hitVfx: 'sparks',
  },
  smg: {
    id: 'smg', name: 'Micro SMG',
    mode: 'hitscan', damage: 13, fireRate: 11.5, spread: 0.046, range: 82,
    damageType: 'bullet', hitVfx: 'sparks',
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun',
    // 6 pellets × 10 dmg each (damage is per-pellet; CombatSystem fires `pelletCount` rays).
    mode: 'hitscan', damage: 10, fireRate: 1.05, spread: 0.1, range: 42,
    pelletCount: 6, damageType: 'bullet', hitVfx: 'sparks',
  },
  rifle: {
    id: 'rifle', name: 'Assault Rifle',
    mode: 'hitscan', damage: 28, fireRate: 10.5, spread: 0.013, range: 145,
    damageType: 'bullet', hitVfx: 'sparks',
  },
  bazooka: {
    id: 'bazooka', name: 'Bazooka',
    mode: 'projectile', damage: 112, fireRate: 0.45, spread: 0.006, range: 180,
    projectileSpeed: 58, projectileLifetime: 4, damageType: 'explosion', hitVfx: 'explosion',
  },
};

/** Default fire order (HUD / weapon-wheel authoring). */
export const DEFAULT_WEAPON_ORDER: WeaponProfileId[] = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'bazooka'];

/** Resolve a weapon profile by id, or undefined if unknown. */
export function getWeaponProfile(id: string): WeaponProfile | undefined {
  return (WEAPON_PROFILES as Record<string, WeaponProfile>)[id];
}

/** True if `id` names a known profile. */
export function isWeaponProfileId(id: string): id is WeaponProfileId {
  return Object.prototype.hasOwnProperty.call(WEAPON_PROFILES, id);
}
