import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SuperheroFlightMotor } from '../src/character/SuperheroFlightMotor';

describe('SuperheroFlightMotor Integration', () => {
  it('toggles flight mode and transitions to takeoff state', () => {
    const motor = new SuperheroFlightMotor();
    expect(motor.isFlightActive).toBe(false);
    expect(motor.state).toBe('inactive');

    motor.toggleFlight();
    expect(motor.isFlightActive).toBe(true);
    expect(motor.state).toBe('takeoff');
    expect(motor.getSemanticClipName()).toBe('A_Flight_Hover_Start_A');
  });

  it('computes 3D hover and cruise velocities from user intent', () => {
    const motor = new SuperheroFlightMotor();
    motor.setFlying(true);

    // After takeoff timer expires
    motor.update(0.4, { moveX: 0, moveZ: 0, ascend: false, descend: false, boost: false });
    expect(motor.state).toBe('hover');
    expect(motor.getSemanticClipName()).toBe('A_Flight_Idle_A');

    // Move forward with boost
    const vel = motor.update(0.1, { moveX: 0, moveZ: 1, ascend: false, descend: false, boost: true });
    expect(vel.z).toBeLessThan(0); // Forward in Three.js coordinates is -Z
    expect(motor.getTelemetry().speed).toBeGreaterThan(1.0);
  });

  it('performs 4-way aerial dodges with high burst velocity', () => {
    const motor = new SuperheroFlightMotor();
    motor.setFlying(true);
    motor.update(0.4, { moveX: 0, moveZ: 0, ascend: false, descend: false, boost: false });

    // Request Left Dodge
    const success = motor.requestDodge('left');
    expect(success).toBe(true);
    expect(motor.state).toBe('dodge');
    expect(motor.getSemanticClipName()).toBe('A_Flight_Dodge_A_L');

    const dodgeVel = motor.update(0.05, { moveX: 0, moveZ: 0, ascend: false, descend: false, boost: false });
    expect(dodgeVel.x).toBeLessThan(-20.0); // High speed to the left
  });

  it('detects high-speed ground impacts and triggers superhero landing lock', () => {
    const motor = new SuperheroFlightMotor();
    motor.setFlying(true);

    // Fast downward vertical velocity
    const result = motor.handleGroundImpact(-18.0);
    expect(result.isSuperheroLanding).toBe(true);
    expect(motor.isFlightActive).toBe(false);
    expect(motor.state).toBe('landing');
    expect(motor.getSemanticClipName()).toBe('A_SuperheroLanding_A');
    expect(motor.getTelemetry().isLandingLocked).toBe(true);
  });
});
