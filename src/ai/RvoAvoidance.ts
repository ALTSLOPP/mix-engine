import * as THREE from 'three';

export interface RvoAgent {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  prefVelocity: THREE.Vector3;
  radius: number;
  maxSpeed: number;
}

export interface RvoNeighbor {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
}

/**
 * RvoAvoidance.ts — Reciprocal Velocity Obstacles (RVO2) solver for multi-agent crowd collision avoidance.
 * Generates smooth, collision-free velocities so agents pass each other without oscillation or jamming.
 */
export class RvoAvoidance {
  private static readonly _relPos = new THREE.Vector3();
  private static readonly _relVel = new THREE.Vector3();
  private static readonly _candVel = new THREE.Vector3();
  private static readonly _bestVel = new THREE.Vector3();

  /**
   * Computes an optimal collision-free velocity for an agent given nearby neighbors.
   */
  static computeVelocity(
    agent: RvoAgent,
    neighbors: RvoNeighbor[],
    timeHorizon = 1.5,
    numSamples = 16,
  ): THREE.Vector3 {
    if (neighbors.length === 0) {
      return agent.prefVelocity.clone();
    }

    this._bestVel.copy(agent.prefVelocity);
    let bestPenalty = this.evaluatePenalty(this._bestVel, agent, neighbors, timeHorizon);

    if (bestPenalty === 0) {
      return this._bestVel.clone();
    }

    // Sample candidate velocities in concentric circles around preferred velocity
    const speed = agent.prefVelocity.length();
    const baseAngle = Math.atan2(agent.prefVelocity.z, agent.prefVelocity.x);

    for (let r = 0.2; r <= 1.0; r += 0.4) {
      const sampleSpeed = Math.min(agent.maxSpeed, speed * r + 0.5);
      const angleStep = (Math.PI * 2) / numSamples;

      for (let i = 0; i < numSamples; i++) {
        const angle = baseAngle + (i - numSamples / 2) * angleStep;
        this._candVel.set(
          Math.cos(angle) * sampleSpeed,
          0,
          Math.sin(angle) * sampleSpeed,
        );

        const penalty = this.evaluatePenalty(this._candVel, agent, neighbors, timeHorizon);
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          this._bestVel.copy(this._candVel);
          if (penalty === 0) break;
        }
      }
      if (bestPenalty === 0) break;
    }

    return this._bestVel.clone();
  }

  private static evaluatePenalty(
    candidateVel: THREE.Vector3,
    agent: RvoAgent,
    neighbors: RvoNeighbor[],
    timeHorizon: number,
  ): number {
    let penalty = 0;

    for (const neighbor of neighbors) {
      this._relPos.subVectors(neighbor.position, agent.position);
      this._relPos.y = 0; // 2D XZ navigation plane
      const dist = this._relPos.length();
      const combinedRadius = agent.radius + neighbor.radius;

      if (dist < combinedRadius) {
        // Direct overlap penalty
        penalty += 10000 * (combinedRadius - dist);
        continue;
      }

      // RVO velocity calculation: v_opt = 2 * v_cand - (v_agent + v_neighbor)
      this._relVel.set(
        2 * candidateVel.x - (agent.velocity.x + neighbor.velocity.x),
        0,
        2 * candidateVel.z - (agent.velocity.z + neighbor.velocity.z),
      );

      // Time to collision with neighbor sphere
      const tc = this.timeToCollision(this._relPos, this._relVel, combinedRadius);
      if (tc > 0 && tc < timeHorizon) {
        // Inverted time-to-collision penalty
        penalty += (timeHorizon - tc) * 100;
      }
    }

    // Add preference deviation penalty
    const dev = candidateVel.distanceTo(agent.prefVelocity);
    penalty += dev * 5.0;

    return penalty;
  }

  private static timeToCollision(relPos: THREE.Vector3, relVel: THREE.Vector3, combinedRadius: number): number {
    const a = relVel.dot(relVel);
    const b = -2 * relPos.dot(relVel);
    const c = relPos.dot(relPos) - combinedRadius * combinedRadius;

    if (c <= 0) return 0;
    if (a <= 1e-6) return Infinity;

    const disc = b * b - 4 * a * c;
    if (disc <= 0) return Infinity;

    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t > 0 ? t : Infinity;
  }
}
