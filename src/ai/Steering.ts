import * as THREE from 'three';

/**
 * Steering.ts — Reynolds-style steering behaviors for kinematic agents.
 *
 * Every behavior is a PURE function: it takes the agent's kinematic state (position,
 * velocity, orientation) + behavior params, and writes a linear + angular acceleration
 * into the supplied `out` struct. There is NO hidden per-agent state here — the
 * NavAgentSystem owns the agent's persistent state (wander offset, path progress, …)
 * and passes it in. This keeps the behaviors composable, testable, and trivially
 * scriptable from an LLM.
 *
 * Behaviors implemented (the classic set + the open-world extras):
 *   Seek, Flee, Arrive (decelerate-on-arrival), Pursue / Evade (lead the target),
 *   Wander (sphere-projected jitter), FollowPath (predict-point + slow-on-arrival),
 *   ObstacleAvoidance (whisker raycasts via a callback so it stays decoupled from
 *   the physics world), Separation, Alignment, Cohesion, Queue (lane queuing for
 *   crowds), Flock (the combo), LookWhereYouAreGoing, Face, Align (angular).
 *
 * The math follows Reynolds' 1999 paper + the Buckland "AI for Games" formulations;
 * I kept the constants tunable per-agent through `SteeringParams` so an LLM can dial
 * in a personality ("fast/aggressive", "slow/cautious") with a single command.
 */

export interface KinematicState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Yaw (radians) — rotation around the world up axis. */
  orientation: number;
  /** Current angular velocity (rad/s). */
  rotation: number;
}

export interface SteeringOutput {
  /** Linear acceleration (m/s²). */
  linear: THREE.Vector3;
  /** Angular acceleration (rad/s²). */
  angular: number;
}

export interface SteeringParams {
  /** Max linear speed (m/s). */
  maxSpeed: number;
  /** Max linear acceleration (m/s²). */
  maxAcceleration: number;
  /** Max angular speed (rad/s). */
  maxAngularSpeed: number;
  /** Max angular acceleration (rad/s²). */
  maxAngularAcceleration: number;
  /** Radius at which Arrive begins decelerating. */
  arriveRadius: number;
  /** Inner radius at which Arrive stops entirely. */
  arriveTolerance: number;
  /** Time over which to achieve target speed (controls acceleration aggressiveness). */
  timeToTarget: number;
  /** Wander circle radius (m). */
  wanderRadius: number;
  /** Wander circle distance ahead of the agent (m). */
  wanderDistance: number;
  /** Max wander jitter per tick (rad). */
  wanderJitter: number;
  /** Obstacle-avoidance whisker length (m). */
  avoidWhiskerLength: number;
  /** Avoidance steering strength when a whisker hits. */
  avoidStrength: number;
}

export const DEFAULT_STEERING: SteeringParams = {
  maxSpeed: 4.0,
  maxAcceleration: 12.0,
  maxAngularSpeed: 6.0,
  maxAngularAcceleration: 12.0,
  arriveRadius: 2.5,
  arriveTolerance: 0.15,
  timeToTarget: 0.2,
  wanderRadius: 1.2,
  wanderDistance: 2.0,
  wanderJitter: 0.8,
  avoidWhiskerLength: 3.0,
  avoidStrength: 18.0,
};

/** Create a blank steering output (zero acceleration). */
export function newSteering(out?: SteeringOutput): SteeringOutput {
  if (out) { out.linear.set(0, 0, 0); out.angular = 0; return out; }
  return { linear: new THREE.Vector3(), angular: 0 };
}

const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();

/** Clamp a linear acceleration to `params.maxAcceleration` (Y is preserved for gravity). */
function clampLinear(linear: THREE.Vector3, params: SteeringParams): void {
  const horiz = Math.sqrt(linear.x * linear.x + linear.z * linear.z);
  if (horiz > params.maxAcceleration && horiz > 1e-6) {
    const scale = params.maxAcceleration / horiz;
    linear.x *= scale;
    linear.z *= scale;
  }
}

/** Clamp an angular acceleration to `params.maxAngularAcceleration`. */
function clampAngular(a: number, params: SteeringParams): number {
  return Math.max(-params.maxAngularAcceleration, Math.min(params.maxAngularAcceleration, a));
}

/** Seek: steer towards a target at max acceleration. */
export function seek(agent: KinematicState, target: THREE.Vector3, params: SteeringParams, out: SteeringOutput): SteeringOutput {
  _tmp.copy(target).sub(agent.position);
  _tmp.y = 0; // stay in the XZ plane
  const dist = _tmp.length();
  if (dist < 1e-4) { out.linear.set(0, 0, 0); out.angular = 0; return out; }
  _tmp.multiplyScalar(1 / dist); // unit direction
  out.linear.copy(_tmp).multiplyScalar(params.maxAcceleration);
  out.angular = 0;
  return out;
}

/** Flee: steer away from a target at max acceleration. */
export function flee(agent: KinematicState, threat: THREE.Vector3, params: SteeringParams, out: SteeringOutput): SteeringOutput {
  _tmp.copy(agent.position).sub(threat);
  _tmp.y = 0;
  const dist = _tmp.length();
  if (dist < 1e-4) { out.linear.set(0, 0, 0); out.angular = 0; return out; }
  _tmp.multiplyScalar(1 / dist);
  out.linear.copy(_tmp).multiplyScalar(params.maxAcceleration);
  out.angular = 0;
  return out;
}

/** Arrive: seek + decelerate near the target so the agent stops cleanly. */
export function arrive(agent: KinematicState, target: THREE.Vector3, params: SteeringParams, out: SteeringOutput): SteeringOutput {
  _tmp.copy(target).sub(agent.position);
  _tmp.y = 0;
  const dist = _tmp.length();
  if (dist < params.arriveTolerance) { out.linear.set(0, 0, 0); out.angular = 0; return out; }
  let targetSpeed = params.maxSpeed;
  if (dist < params.arriveRadius) targetSpeed = params.maxSpeed * (dist / params.arriveRadius);
  _tmp.multiplyScalar(1 / Math.max(dist, 1e-6)).multiplyScalar(targetSpeed);
  // Acceleration = (targetVelocity - currentVelocity) / timeToTarget.
  _tmp2.set(agent.velocity.x, 0, agent.velocity.z);
  out.linear.copy(_tmp).sub(_tmp2).multiplyScalar(1 / params.timeToTarget);
  clampLinear(out.linear, params);
  out.angular = 0;
  return out;
}

/** Pursue: seek a predicted future position of a moving target. */
export function pursue(
  agent: KinematicState, targetPos: THREE.Vector3, targetVel: THREE.Vector3,
  params: SteeringParams, maxPredictTime: number, out: SteeringOutput,
): SteeringOutput {
  _tmp.copy(targetPos).sub(agent.position);
  _tmp.y = 0;
  const dist = _tmp.length();
  const speed = Math.sqrt(agent.velocity.x ** 2 + agent.velocity.z ** 2);
  // Prediction time: smaller of (maxPredictTime) or (distance / agentSpeed), but at
  // least a small epsilon so a stationary agent still predicts a little.
  const predict = speed > 1e-3 ? Math.min(maxPredictTime, dist / speed) : maxPredictTime * 0.5;
  _tmp2.copy(targetPos).addScaledVector(targetVel, predict);
  return seek(agent, _tmp2, params, out);
}

/** Evade: flee from a predicted future position of a moving threat. */
export function evade(
  agent: KinematicState, threatPos: THREE.Vector3, threatVel: THREE.Vector3,
  params: SteeringParams, maxPredictTime: number, out: SteeringOutput,
): SteeringOutput {
  _tmp.copy(threatPos).sub(agent.position);
  _tmp.y = 0;
  const dist = _tmp.length();
  const speed = Math.sqrt(agent.velocity.x ** 2 + agent.velocity.z ** 2);
  const predict = speed > 1e-3 ? Math.min(maxPredictTime, dist / speed) : maxPredictTime * 0.5;
  _tmp2.copy(threatPos).addScaledVector(threatVel, predict);
  return flee(agent, _tmp2, params, out);
}

/**
 * Wander: a constrained random steer. Maintains a per-agent `wanderOffset` (the
 * projected point on the wander circle in front of the agent); each tick we jitter it
 * by ±wanderJitter, project it back onto the circle, and steer towards it. The caller
 * owns the wander offset (passed by reference and mutated in place).
 */
export function wander(
  agent: KinematicState, wanderOffset: THREE.Vector3, params: SteeringParams,
  out: SteeringOutput,
): SteeringOutput {
  // Jitter the offset (per-agent state).
  wanderOffset.x += (Math.random() * 2 - 1) * params.wanderJitter;
  wanderOffset.z += (Math.random() * 2 - 1) * params.wanderJitter;
  // Re-project onto the wander circle of radius wanderRadius.
  const len = Math.sqrt(wanderOffset.x * wanderOffset.x + wanderOffset.z * wanderOffset.z);
  if (len > 1e-6) {
    wanderOffset.x = (wanderOffset.x / len) * params.wanderRadius;
    wanderOffset.z = (wanderOffset.z / len) * params.wanderRadius;
  } else {
    wanderOffset.x = params.wanderRadius;
    wanderOffset.z = 0;
  }
  // Target = agent position + forward*wanderDistance + wanderOffset.
  const fx = Math.sin(agent.orientation), fz = Math.cos(agent.orientation);
  _tmp.set(
    agent.position.x + fx * params.wanderDistance + wanderOffset.x,
    agent.position.y,
    agent.position.z + fz * params.wanderDistance + wanderOffset.z,
  );
  return seek(agent, _tmp, params, out);
}

/**
 * FollowPath: predict a future agent position, project it onto the path, advance the
 * path parameter if we've passed the current waypoint, and seek the next waypoint.
 * Slows on arrival at the final waypoint. `pathState.path` is the waypoint list;
 * `pathState.cursor` is the index of the current target waypoint (mutated in place).
 */
export function followPath(
  agent: KinematicState, pathState: { path: THREE.Vector3[]; cursor: number; loop: boolean },
  params: SteeringParams, out: SteeringOutput,
): SteeringOutput {
  const path = pathState.path;
  if (path.length === 0) { out.linear.set(0, 0, 0); out.angular = 0; return out; }
  let cursor = pathState.cursor;
  if (cursor >= path.length) cursor = path.length - 1;
  const target = path[cursor];
  _tmp.copy(target).sub(agent.position);
  _tmp.y = 0;
  const dist = _tmp.length();
  // Advance when within arriveRadius (or always, if looping).
  if (dist < params.arriveRadius) {
    cursor++;
    if (cursor >= path.length) {
      if (pathState.loop) cursor = 0;
      else cursor = path.length - 1; // clamp at the end
    }
    pathState.cursor = cursor;
  }
  // If we're at the last waypoint of a non-looping path, arrive (decelerate to stop).
  if (!pathState.loop && cursor >= path.length - 1) {
    return arrive(agent, path[path.length - 1], params, out);
  }
  return seek(agent, path[cursor], params, out);
}

/**
 * Obstacle avoidance: cast up to three whiskers (centre + left + right) ahead of the
 * agent; if a whisker hits, steer away from the hit point. The cast is delegated to a
 * callback so this module stays decoupled from the physics world.
 *
 * `cast(origin, dir, maxDist)` returns the hit distance (or `null`). The agent's
 * orientation is used to derive the forward + lateral whisker directions.
 */
export type AvoidCast = (origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) => number | null;

export function avoid(
  agent: KinematicState, params: SteeringParams, cast: AvoidCast, out: SteeringOutput,
): SteeringOutput {
  const fx = Math.sin(agent.orientation), fz = Math.cos(agent.orientation);
  const len = params.avoidWhiskerLength;
  // Centre whisker.
  _tmp.set(fx, 0, fz);
  const centreHit = cast(agent.position, _tmp, len);
  if (centreHit === null) { out.linear.set(0, 0, 0); out.angular = 0; return out; }
  // Side whiskers at ±35° — pick the one that's clear and steer that way.
  const a = Math.atan2(fx, fz);
  const leftA = a + 0.6;
  const rightA = a - 0.6;
  const lfx = Math.sin(leftA), lfz = Math.cos(leftA);
  const rfx = Math.sin(rightA), rfz = Math.cos(rightA);
  _tmp.set(lfx, 0, lfz);
  const leftHit = cast(agent.position, _tmp, len);
  _tmp.set(rfx, 0, rfz);
  const rightHit = cast(agent.position, _tmp, len);
  // Steer towards the open side (or away from the hit if both blocked).
  let steerX: number, steerZ: number;
  if (leftHit === null && rightHit !== null) {
    steerX = lfx; steerZ = lfz;
  } else if (rightHit === null && leftHit !== null) {
    steerX = rfx; steerZ = rfz;
  } else {
    // Both clear (shouldn't happen — centre hit implies at least one side is close) or
    // both blocked — steer hard to the right as a default escape.
    steerX = rfx; steerZ = rfz;
  }
  out.linear.set(steerX * params.avoidStrength, 0, steerZ * params.avoidStrength);
  out.angular = 0;
  return out;
}

/**
 * Separation: steer away from the average direction to nearby neighbours. The
 * neighbour list is the caller's responsibility (a spatial-query result) so this stays
 * O(n) in the neighbour count, never the whole scene.
 */
export function separation(
  agent: KinematicState, neighbours: ReadonlyArray<KinematicState>,
  params: SteeringParams, out: SteeringOutput,
): SteeringOutput {
  out.linear.set(0, 0, 0);
  let count = 0;
  for (const n of neighbours) {
    _tmp.copy(agent.position).sub(n.position);
    _tmp.y = 0;
    const d2 = _tmp.lengthSq();
    if (d2 > 1e-6 && d2 < 25) { // 5m radius, squared
      _tmp.multiplyScalar(1 / d2); // weight by inverse distance² (closer = stronger)
      out.linear.add(_tmp);
      count++;
    }
  }
  if (count > 0) {
    out.linear.multiplyScalar(1 / count);
    const len = Math.sqrt(out.linear.x ** 2 + out.linear.z ** 2);
    if (len > 1e-6) {
      out.linear.multiplyScalar(params.maxAcceleration / len);
    }
  }
  out.angular = 0;
  return out;
}

/** Alignment: steer towards the average heading (velocity direction) of neighbours. */
export function alignment(
  agent: KinematicState, neighbours: ReadonlyArray<KinematicState>,
  params: SteeringParams, out: SteeringOutput,
): SteeringOutput {
  _tmp.set(0, 0, 0);
  let count = 0;
  for (const n of neighbours) {
    if (n.velocity.lengthSq() < 1e-6) continue;
    _tmp.add(n.velocity);
    count++;
  }
  if (count === 0) { out.linear.set(0, 0, 0); out.angular = 0; return out; }
  _tmp.multiplyScalar(1 / count);
  const len = Math.sqrt(_tmp.x ** 2 + _tmp.z ** 2);
  if (len > 1e-6) _tmp.multiplyScalar(params.maxAcceleration / len);
  out.linear.copy(_tmp);
  out.angular = 0;
  return out;
}

/** Cohesion: steer towards the average position of neighbours. */
export function cohesion(
  agent: KinematicState, neighbours: ReadonlyArray<KinematicState>,
  params: SteeringParams, out: SteeringOutput,
): SteeringOutput {
  _tmp.set(0, 0, 0);
  for (const n of neighbours) _tmp.add(n.position);
  if (neighbours.length === 0) { out.linear.set(0, 0, 0); out.angular = 0; return out; }
  _tmp.multiplyScalar(1 / neighbours.length);
  return seek(agent, _tmp, params, out);
}

/** Flock: weighted blend of separation + alignment + cohesion (the classic combo). */
export function flock(
  agent: KinematicState, neighbours: ReadonlyArray<KinematicState>,
  params: SteeringParams, weights: { sep: number; ali: number; coh: number },
  out: SteeringOutput,
): SteeringOutput {
  const sep = separation(agent, neighbours, params, newSteering());
  const ali = alignment(agent, neighbours, params, newSteering());
  const coh = cohesion(agent, neighbours, params, newSteering());
  out.linear.set(0, 0, 0);
  out.linear.addScaledVector(sep.linear, weights.sep);
  out.linear.addScaledVector(ali.linear, weights.ali);
  out.linear.addScaledVector(coh.linear, weights.coh);
  out.angular = 0;
  clampLinear(out.linear, params);
  return out;
}

/**
 * Queue: for crowd lane-queuing — if a neighbour is directly ahead and close, brake
 * (negative forward acceleration proportional to proximity). Keeps agents from
 * overlapping in tight streams.
 */
export function queue(
  agent: KinematicState, neighbours: ReadonlyArray<KinematicState>,
  params: SteeringParams, queueAheadDist: number, queueRadius: number,
  out: SteeringOutput,
): SteeringOutput {
  const fx = Math.sin(agent.orientation), fz = Math.cos(agent.orientation);
  let brake = 0;
  for (const n of neighbours) {
    _tmp.copy(n.position).sub(agent.position);
    _tmp.y = 0;
    const d = _tmp.length();
    if (d > queueAheadDist || d < 1e-4) continue;
    // Is the neighbour in front? (dot of relative pos with forward > 0)
    const dot = (_tmp.x / d) * fx + (_tmp.z / d) * fz;
    if (dot <= 0) continue;
    // Is the neighbour within the queue lane width?
    // Lateral offset = relative perpendicular to forward.
    const lat = -fx * (_tmp.z / d) + fz * (_tmp.x / d);
    if (Math.abs(lat) > queueRadius) continue;
    brake = Math.max(brake, (1 - d / queueAheadDist));
  }
  if (brake > 0) {
    out.linear.set(-fx * params.maxAcceleration * brake, 0, -fz * params.maxAcceleration * brake);
  } else {
    out.linear.set(0, 0, 0);
  }
  out.angular = 0;
  return out;
}

/** LookWhereYouAreGoing: yaw to face the velocity direction. */
export function lookWhereGoing(agent: KinematicState, params: SteeringParams, out: SteeringOutput): SteeringOutput {
  if (agent.velocity.lengthSq() < 1e-4) { out.angular = 0; out.linear.set(0, 0, 0); return out; }
  const target = Math.atan2(agent.velocity.x, agent.velocity.z);
  return alignTo(agent, target, params, out);
}

/** Face: yaw to face a target position. */
export function face(agent: KinematicState, target: THREE.Vector3, params: SteeringParams, out: SteeringOutput): SteeringOutput {
  _tmp.copy(target).sub(agent.position);
  _tmp.y = 0;
  if (_tmp.lengthSq() < 1e-6) { out.angular = 0; out.linear.set(0, 0, 0); return out; }
  const targetOrient = Math.atan2(_tmp.x, _tmp.z);
  return alignTo(agent, targetOrient, params, out);
}

/** Align: angular arrive towards a target orientation. */
export function alignTo(agent: KinematicState, targetOrient: number, params: SteeringParams, out: SteeringOutput): SteeringOutput {
  let diff = targetOrient - agent.orientation;
  // Wrap to (-π, π].
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff <= -Math.PI) diff += 2 * Math.PI;
  const diffAbs = Math.abs(diff);
  if (diffAbs < 0.01) { out.angular = 0; out.linear.set(0, 0, 0); return out; }
  let targetRot = params.maxAngularSpeed;
  // Slow near the target (angular arrive).
  const slowRadius = 0.5;
  if (diffAbs < slowRadius) targetRot = params.maxAngularSpeed * (diffAbs / slowRadius);
  targetRot *= Math.sign(diff);
  out.angular = (targetRot - agent.rotation) / params.timeToTarget;
  out.angular = clampAngular(out.angular, params);
  out.linear.set(0, 0, 0);
  return out;
}

/** A weighted blend of multiple steering outputs (common composition strategy). */
export function blend(outputs: ReadonlyArray<SteeringOutput>, weights: ReadonlyArray<number>, params: SteeringParams, out: SteeringOutput): SteeringOutput {
  out.linear.set(0, 0, 0);
  out.angular = 0;
  for (let i = 0; i < outputs.length; i++) {
    out.linear.addScaledVector(outputs[i].linear, weights[i]);
    out.angular += outputs[i].angular * weights[i];
  }
  clampLinear(out.linear, params);
  out.angular = clampAngular(out.angular, params);
  return out;
}

import { RvoAvoidance, type RvoNeighbor } from './RvoAvoidance';

/** RVO: Calculate avoidance acceleration using Reciprocal Velocity Obstacles. */
export function rvoAvoidance(
  agent: KinematicState,
  prefVelocity: THREE.Vector3,
  neighbors: RvoNeighbor[],
  agentRadius: number,
  params: SteeringParams,
  out: SteeringOutput,
  timeHorizon = 1.5,
): SteeringOutput {
  const desiredVel = RvoAvoidance.computeVelocity(
    {
      position: agent.position,
      velocity: agent.velocity,
      prefVelocity,
      radius: agentRadius,
      maxSpeed: params.maxSpeed,
    },
    neighbors,
    timeHorizon,
  );

  out.linear.copy(desiredVel).sub(agent.velocity).divideScalar(params.timeToTarget);
  clampLinear(out.linear, params);
  out.angular = 0;
  return out;
}

