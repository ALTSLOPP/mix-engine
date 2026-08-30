import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RvoAvoidance, type RvoAgent, type RvoNeighbor } from '../src/ai/RvoAvoidance';

describe('RvoAvoidance Reciprocal Velocity Obstacles', () => {
  it('deviates sideways to avoid head-on collision between opposing agents', () => {
    // Agent moving North (+Z)
    const agent: RvoAgent = {
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 2),
      prefVelocity: new THREE.Vector3(0, 0, 2),
      radius: 0.5,
      maxSpeed: 4.0,
    };

    // Neighbor directly in path moving South (-Z)
    const neighbor: RvoNeighbor = {
      position: new THREE.Vector3(0, 0, 3),
      velocity: new THREE.Vector3(0, 0, -2),
      radius: 0.5,
    };

    const avoidanceVel = RvoAvoidance.computeVelocity(agent, [neighbor], 2.0);

    // Agent must deviate sideways (non-zero X component) to avoid head-on impact
    expect(Math.abs(avoidanceVel.x)).toBeGreaterThan(0.1);
    // Velocity must remain forward (+Z) and within max speed
    expect(avoidanceVel.z).toBeGreaterThan(0);
    expect(avoidanceVel.length()).toBeLessThanOrEqual(agent.maxSpeed);
  });

  it('returns preferred velocity unmodified when no neighbors are near', () => {
    const agent: RvoAgent = {
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(1, 0, 2),
      prefVelocity: new THREE.Vector3(1, 0, 2),
      radius: 0.5,
      maxSpeed: 4.0,
    };

    const result = RvoAvoidance.computeVelocity(agent, []);
    expect(result.x).toBe(1);
    expect(result.z).toBe(2);
  });
});
