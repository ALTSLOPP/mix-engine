import type * as THREE from 'three';
import type { Engine } from '../../engine/Engine';

/** Player queries must not hit the player's own capsule. All coordinates are engine space. */
export function gameplayRaycast(engine: Engine, origin: THREE.Vector3, direction: THREE.Vector3, range: number) {
  const playerId = engine.player?.getPossessedId?.() ?? null;
  const body = playerId !== null ? engine.sceneManager.getRigidBody(playerId)?.rapierBody : null;
  if (body && engine.physicsWorld.raycastExcludeBody) {
    return engine.physicsWorld.raycastExcludeBody(origin, direction, range, body);
  }
  return engine.physicsWorld.raycast(origin, direction, range);
}
