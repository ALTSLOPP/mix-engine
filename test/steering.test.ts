import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_STEERING, newSteering, seek, flee, arrive, pursue, evade, wander,
  followPath, separation, alignment, cohesion, queue, face, alignTo, blend,
  type KinematicState, type SteeringParams,
} from '../src/ai/Steering';

function agent(x: number, z: number, vx = 0, vz = 0, orient = 0): KinematicState {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(vx, 0, vz),
    orientation: orient,
    rotation: 0,
  };
}

const P = DEFAULT_STEERING;

describe('Steering behaviors (Reynolds-style, pure functions)', () => {
  it('seek produces max-acceleration towards the target', () => {
    const a = agent(0, 0);
    const out = seek(a, new THREE.Vector3(10, 0, 0), P, newSteering());
    expect(out.linear.x).toBeCloseTo(P.maxAcceleration);
    expect(out.linear.z).toBeCloseTo(0);
  });

  it('flee produces acceleration directly away from the threat', () => {
    const a = agent(0, 0);
    const out = flee(a, new THREE.Vector3(10, 0, 0), P, newSteering());
    expect(out.linear.x).toBeCloseTo(-P.maxAcceleration);
    expect(out.linear.z).toBeCloseTo(0);
  });

  it('arrive decelerates near the target and stops within arriveTolerance', () => {
    const a = agent(0, 0);
    // Far away: near-max acceleration.
    let out = arrive(a, new THREE.Vector3(100, 0, 0), P, newSteering());
    expect(out.linear.x).toBeGreaterThan(P.maxAcceleration * 0.8);
    // Inside arriveRadius: scaled-down acceleration.
    out = arrive(a, new THREE.Vector3(1, 0, 0), P, newSteering());
    expect(out.linear.x).toBeLessThan(P.maxAcceleration);
    expect(out.linear.x).toBeGreaterThan(0);
    // Inside arriveTolerance: zero.
    out = arrive(a, new THREE.Vector3(0.05, 0, 0), P, newSteering());
    expect(out.linear.lengthSq()).toBe(0);
  });

  it('pursue leads a moving target (steers ahead of its current position)', () => {
    const a = agent(0, 0);
    const targetPos = new THREE.Vector3(10, 0, 0);
    const targetVel = new THREE.Vector3(0, 0, 5); // moving +Z
    const out = pursue(a, targetPos, targetVel, P, 1.0, newSteering());
    // The predicted position is (10, 0, ~5*predict), so the acceleration should have a
    // +Z component (seeking ahead of the target's current position).
    expect(out.linear.z).toBeGreaterThan(0);
  });

  it('evade flees from a predicted threat position', () => {
    const a = agent(0, 0);
    const threatPos = new THREE.Vector3(10, 0, 0);
    const threatVel = new THREE.Vector3(0, 0, 5);
    const out = evade(a, threatPos, threatVel, P, 1.0, newSteering());
    // The predicted threat is ahead in +Z; evasion should have a -Z component (running
    // away from the predicted point, not just the current one).
    expect(out.linear.z).toBeLessThan(0);
  });

  it('wander keeps the offset on the wander circle and steers forward', () => {
    const a = agent(0, 0, 0, 0, 0); // facing +Z (orientation 0 → forward = (sin0, cos0) = (0,1))
    const wanderOffset = new THREE.Vector3(P.wanderRadius, 0, 0);
    const out = wander(a, wanderOffset, P, newSteering());
    // The output should be a seek towards a point ahead of the agent → +Z component.
    expect(out.linear.z).toBeGreaterThan(0);
    // The offset should have been re-projected onto the circle of radius wanderRadius.
    const len = Math.sqrt(wanderOffset.x ** 2 + wanderOffset.z ** 2);
    expect(len).toBeCloseTo(P.wanderRadius, 1);
  });

  it('followPath advances the cursor when near a waypoint and arrives at the end', () => {
    const a = agent(0, 0);
    const path = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(5, 0, 0), new THREE.Vector3(10, 0, 0)];
    const ps = { path, cursor: 0, loop: false };
    // Near the first waypoint → cursor should advance.
    followPath(a, ps, P, newSteering());
    expect(ps.cursor).toBeGreaterThanOrEqual(1);
    // At the last waypoint of a non-looping path → arrive (zero acceleration when on it).
    a.position.set(10, 0, 0);
    ps.cursor = path.length - 1;
    const out = followPath(a, ps, P, newSteering());
    expect(out.linear.lengthSq()).toBe(0);
  });

  it('separation pushes away from a close neighbour (inverse-distance weighting)', () => {
    const a = agent(0, 0);
    const neighbours = [agent(1, 0)]; // 1m to the +X
    const out = separation(a, neighbours, P, newSteering());
    expect(out.linear.x).toBeLessThan(0); // pushed -X (away from the neighbour)
  });

  it('alignment steers towards the average neighbour heading', () => {
    const a = agent(0, 0);
    const neighbours = [agent(0, 0, 5, 0), agent(0, 0, 3, 0)]; // both moving +X
    const out = alignment(a, neighbours, P, newSteering());
    expect(out.linear.x).toBeGreaterThan(0); // align +X
  });

  it('cohesion steers towards the average neighbour position', () => {
    const a = agent(0, 0);
    const neighbours = [agent(10, 0), agent(10, 10)]; // centroid ~ (10, 5)
    const out = cohesion(a, neighbours, P, newSteering());
    expect(out.linear.x).toBeGreaterThan(0); // towards +X (centroid is +X)
  });

  it('queue brakes when a neighbour is directly ahead', () => {
    const a = agent(0, 0, 0, 0, 0); // facing +Z
    const neighbours = [agent(0, 1.5)]; // 1.5m ahead in +Z
    const out = queue(a, neighbours, P, 2.5, 1.2, newSteering());
    // Brake = negative forward acceleration → -Z (forward is +Z at orientation 0).
    expect(out.linear.z).toBeLessThan(0);
  });

  it('face yaws towards a target (angular acceleration sign matches the bearing)', () => {
    const a = agent(0, 0, 0, 0, 0); // facing +Z
    const out = face(a, new THREE.Vector3(1, 0, 0), P, newSteering()); // target at +X
    // Target bearing = atan2(1,0) = +π/2; current orient = 0; diff = +π/2 → positive angular.
    expect(out.angular).toBeGreaterThan(0);
  });

  it('alignTo wraps the angle to (−π, π] and decelerates near the target', () => {
    const a = agent(0, 0, 0, 0, Math.PI - 0.1); // facing nearly -Z
    // Target orientation = -π + 0.1 (equivalent to +π - 0.1 but wrapped the short way).
    const out = alignTo(a, -Math.PI + 0.1, P, newSteering());
    // The short-way difference is +0.2 (wrapping past +π), so angular should be small +.
    expect(out.angular).toBeGreaterThan(0);
    // The clamp to maxAngularAcceleration may bind exactly at the limit (timeToTarget
    // scaling can push the raw value above the max), so use <=.
    expect(out.angular).toBeLessThanOrEqual(P.maxAngularAcceleration);
  });

  it('blend combines outputs with weights and clamps to maxAcceleration', () => {
    const a = agent(0, 0);
    const s1 = seek(a, new THREE.Vector3(10, 0, 0), P, newSteering()); // +X max
    const s2 = seek(a, new THREE.Vector3(0, 0, 10), P, newSteering()); // +Z max
    const out = blend([s1, s2], [1, 1], P, newSteering());
    // Combined direction is +X+Z (45°), magnitude clamped to maxAcceleration.
    const mag = Math.sqrt(out.linear.x ** 2 + out.linear.z ** 2);
    expect(mag).toBeLessThanOrEqual(P.maxAcceleration + 1e-6);
    expect(out.linear.x).toBeGreaterThan(0);
    expect(out.linear.z).toBeGreaterThan(0);
  });
});
