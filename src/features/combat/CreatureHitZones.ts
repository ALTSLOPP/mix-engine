import * as THREE from 'three';

export type CreatureHitZone =
  | 'head'
  | 'chest'
  | 'core'
  | 'left_arm'
  | 'right_arm'
  | 'left_leg'
  | 'right_leg'
  | 'ground';

export interface CreatureHitZoneOffsets {
  head: THREE.Vector3;
  chest: THREE.Vector3;
  core: THREE.Vector3;
  left_arm: THREE.Vector3;
  right_arm: THREE.Vector3;
  left_leg: THREE.Vector3;
  right_leg: THREE.Vector3;
  ground: THREE.Vector3;
}

/**
 * Calculates adaptive hit zone world positions for any creature body size or proportions.
 */
export function getAdaptiveHitZonePosition(
  basePosition: THREE.Vector3,
  height: number,
  zone: CreatureHitZone,
  width = height * 0.4
): THREE.Vector3 {
  const h = Math.max(0.1, height);
  const w = Math.max(0.05, width);

  switch (zone) {
    case 'head':
      return basePosition.clone().add(new THREE.Vector3(0, h * 0.88, 0));
    case 'chest':
      return basePosition.clone().add(new THREE.Vector3(0, h * 0.65, 0));
    case 'core':
      return basePosition.clone().add(new THREE.Vector3(0, h * 0.5, 0));
    case 'left_arm':
      return basePosition.clone().add(new THREE.Vector3(-w * 0.45, h * 0.6, 0));
    case 'right_arm':
      return basePosition.clone().add(new THREE.Vector3(w * 0.45, h * 0.6, 0));
    case 'left_leg':
      return basePosition.clone().add(new THREE.Vector3(-w * 0.25, h * 0.25, 0));
    case 'right_leg':
      return basePosition.clone().add(new THREE.Vector3(w * 0.25, h * 0.25, 0));
    case 'ground':
    default:
      return basePosition.clone();
  }
}

/**
 * Returns all hit zone world positions for a given creature.
 */
export function getCreatureHitZonePositions(
  basePosition: THREE.Vector3,
  height: number,
  width = height * 0.4
): Record<CreatureHitZone, THREE.Vector3> {
  return {
    head: getAdaptiveHitZonePosition(basePosition, height, 'head', width),
    chest: getAdaptiveHitZonePosition(basePosition, height, 'chest', width),
    core: getAdaptiveHitZonePosition(basePosition, height, 'core', width),
    left_arm: getAdaptiveHitZonePosition(basePosition, height, 'left_arm', width),
    right_arm: getAdaptiveHitZonePosition(basePosition, height, 'right_arm', width),
    left_leg: getAdaptiveHitZonePosition(basePosition, height, 'left_leg', width),
    right_leg: getAdaptiveHitZonePosition(basePosition, height, 'right_leg', width),
    ground: getAdaptiveHitZonePosition(basePosition, height, 'ground', width),
  };
}
