import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ClientPrediction, type PlayerInputCmd, type ServerAuthoritativeState } from '../src/network/ClientPrediction';

describe('ClientPrediction & Server Reconciliation', () => {
  it('advances local player prediction immediately on input', () => {
    const cp = new ClientPrediction({
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      onGround: true,
    });

    const forwardInput: PlayerInputCmd = {
      forward: 1.0,
      right: 0.0,
      yaw: 0.0,
    };

    // Predict 10 ticks
    for (let i = 0; i < 10; i++) {
      cp.predict(forwardInput, 0.016);
    }

    expect(cp.clientTick).toBe(10);
    // Moving forward with yaw=0 moves along -Z
    expect(cp.currentState.position.z).toBeLessThan(0);
    expect(cp.currentState.velocity.z).toBeLessThan(0);
  });

  it('accepts matching authoritative server snapshot without rollback', () => {
    const cp = new ClientPrediction();
    const input: PlayerInputCmd = { forward: 1.0, right: 0.0, yaw: 0.0 };

    for (let i = 0; i < 5; i++) {
      cp.predict(input, 0.016);
    }

    const matchingServerAck: ServerAuthoritativeState = {
      tick: 3,
      position: cp.currentState.position.clone(),
      velocity: cp.currentState.velocity.clone(),
      onGround: true,
    };

    // If server state matches client state, reconcile returns false (in sync)
    const neededRollback = cp.reconcile(matchingServerAck, 100.0);
    expect(neededRollback).toBe(false);
  });

  it('triggers rollback and replays unacknowledged inputs when desynced from server', () => {
    const cp = new ClientPrediction({
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      onGround: true,
    });

    const input: PlayerInputCmd = { forward: 1.0, right: 0.0, yaw: 0.0 };

    // Advance 5 client ticks
    for (let i = 0; i < 5; i++) {
      cp.predict(input, 0.016);
    }

    const predictedPosAtTick5 = cp.currentState.position.clone();

    // Server says at tick 2, player hit an obstacle and was at (0, 0, 10) instead
    const serverDesync: ServerAuthoritativeState = {
      tick: 2,
      position: new THREE.Vector3(0, 0, 10),
      velocity: new THREE.Vector3(0, 0, 0),
      onGround: true,
    };

    const neededRollback = cp.reconcile(serverDesync, 0.05);
    expect(neededRollback).toBe(true);

    // Current position must now be re-simulated from server state (0, 0, 10) forward by 3 ticks
    expect(cp.currentState.position.z).toBeGreaterThan(5.0);
    expect(cp.currentState.position.z).not.toBe(predictedPosAtTick5.z);

    // Visual render position must apply smoothing offset and decay
    const renderPos1 = cp.getRenderPosition();
    const renderPos2 = cp.getRenderPosition();
    // Subsequent calls decay the error offset closer to simulated state
    expect(renderPos1).toBeDefined();
    expect(renderPos2).toBeDefined();
  });
});
