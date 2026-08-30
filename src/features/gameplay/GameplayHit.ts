import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';

/** Resolve health/defense first; cosmetic reactions must never substitute for damage. */
export function applyGameplayHit(engine: Engine, hit: {
  attackerId: number | null;
  targetId: number;
  damage: number;
  poiseDamage: number;
  knockbackForce: number;
  knockbackDir?: THREE.Vector3;
  hitPosition?: THREE.Vector3;
  hitboxId?: string;
}): boolean {
  const health = engine.combat.getHealth(hit.targetId);
  const attacker = hit.attackerId !== null ? engine.combat.getHealth(hit.attackerId) : null;
  if (!health || health.hp <= 0 || !Number.isFinite(hit.damage) || hit.damage <= 0) return false;
  if (attacker && attacker.faction === health.faction) return false;
  const before = health.hp;
  engine.combat.applyDamage(hit.attackerId, hit.targetId, hit.damage, 'melee', hit.hitPosition);
  const damage = Math.max(0, before - health.hp);
  if (damage <= 0) return false;
  engine.sceneManager.events.emit('gameplay_hit', { ...hit, damage });
  return true;
}
