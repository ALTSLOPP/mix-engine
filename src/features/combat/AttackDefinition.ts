import * as THREE from 'three';
import { getAdaptiveHitZonePosition, type CreatureHitZone } from './CreatureHitZones';

export type AttackPresentationShape = 'instant' | 'projectile' | 'beam' | 'area' | 'buff_aura';
export type AttackScaleMode = 'fixed' | 'attacker_height' | 'target_height' | 'average_height';
export type AttackTargetingMode = 'adaptive_hit_zone' | 'authored_anchor';
export type AttackTrajectoryMode = 'adaptive' | 'direct' | 'arcing';

/**
 * Calculated attack aim solution containing source, target, and Bézier control curve points.
 */
export class AttackAimSolution {
  constructor(
    public readonly source: THREE.Vector3,
    public readonly target: THREE.Vector3,
    public readonly control: THREE.Vector3,
    public readonly hitZone: CreatureHitZone,
    public readonly targetRadius: number
  ) {}

  /**
   * Quadratic Bézier evaluation: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
   */
  evaluate(normalizedTime: number): THREE.Vector3 {
    const t = THREE.MathUtils.clamp(normalizedTime, 0, 1);
    const inverse = 1 - t;
    const p0 = this.source.clone().multiplyScalar(inverse * inverse);
    const p1 = this.control.clone().multiplyScalar(2 * inverse * t);
    const p2 = this.target.clone().multiplyScalar(t * t);
    return p0.add(p1).add(p2);
  }

  /**
   * Evaluates tangent / forward direction vector at normalized time t.
   */
  evaluateTangent(normalizedTime: number): THREE.Vector3 {
    const t = THREE.MathUtils.clamp(normalizedTime, 0, 1);
    // Derivative B'(t) = 2(1-t)(P1 - P0) + 2t(P2 - P1)
    const p01 = this.control.clone().sub(this.source).multiplyScalar(2 * (1 - t));
    const p12 = this.target.clone().sub(this.control).multiplyScalar(2 * t);
    const sum = p01.add(p12);
    if (sum.lengthSq() < 1e-6) {
      return new THREE.Vector3(0, 0, 1);
    }
    return sum.normalize();
  }
}

export interface AttackDefinitionConfig {
  id: string;
  name: string;
  shape: AttackPresentationShape;
  scaleMode: AttackScaleMode;
  targetingMode: AttackTargetingMode;
  trajectoryMode: AttackTrajectoryMode;
  targetHitZone: CreatureHitZone;
  arcHeightMultiplier?: number;
  projectileSpeed?: number;
  duration?: number;
  primaryColor?: string;
  accentColor?: string;
}

/**
 * Builds an AttackAimSolution for an attack between an attacker and a target.
 */
export function resolveAttackAimSolution(
  attackerPos: THREE.Vector3,
  attackerHeight: number,
  targetPos: THREE.Vector3,
  targetHeight: number,
  hitZone: CreatureHitZone = 'core',
  trajectoryMode: AttackTrajectoryMode = 'adaptive',
  arcHeightMultiplier = 1.0
): AttackAimSolution {
  // Source is chest/cast level of attacker
  const source = attackerPos.clone().add(new THREE.Vector3(0, attackerHeight * 0.6, 0));

  // Target position from adaptive hit zone
  const target = getAdaptiveHitZonePosition(targetPos, targetHeight, hitZone);

  // Compute control point for Bézier curve
  const midPoint = source.clone().lerp(target, 0.5);
  const distance = source.distanceTo(target);

  let arcHeight = 0;
  if (trajectoryMode === 'arcing') {
    arcHeight = Math.max(1.5, distance * 0.35 * arcHeightMultiplier);
  } else if (trajectoryMode === 'adaptive') {
    // Slight upward crest for visual readability
    arcHeight = Math.max(0.6, distance * 0.12 * arcHeightMultiplier);
  }

  const control = midPoint.add(new THREE.Vector3(0, arcHeight, 0));
  const targetRadius = Math.max(0.3, targetHeight * 0.25);

  return new AttackAimSolution(source, target, control, hitZone, targetRadius);
}
