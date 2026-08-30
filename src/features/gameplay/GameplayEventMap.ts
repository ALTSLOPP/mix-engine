import type { Vector3 } from 'three';

/** Shared contracts for cross-module events. Custom script events remain open. */
export interface GameplayEventMap {
  ranged_weapon_fired: { shooterId: number; weaponId: string; origin: Vector3; direction: Vector3; noiseRadius: number };
  crosshair_hit: { targetId: number; damage: number; isHeadshot: boolean; hitPosition: Vector3 };
  perk_acquired: { perkType: string; name: string; activePerks: string[] };
  vehicle_theft_committed: { carId: string; position: Vector3; driverId: string | null; wasOccupied: boolean };
  gameplay_points_changed: { balance: number };
}
