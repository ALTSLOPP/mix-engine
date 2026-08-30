import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { KccDynamics } from '../src/character/KccDynamics';
import { DEFAULT_KCC_PARAMS } from '../src/character/KccParams';
import { CharacterLocomotor } from '../src/character/CharacterLocomotor';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { RigidBodyComponent } from '../src/physics/RigidBodyComponent';

describe('KCC Kinematics & Locomotor (S1)', () => {
  it('handles variable jump, coyote time, and landing jump buffering in KccDynamics', () => {
    const dynamics = new KccDynamics();
    const params = { ...DEFAULT_KCC_PARAMS };
    const fixedDt = 1 / 60;

    // Grounded initially
    dynamics.update(fixedDt, params, true);
    expect(dynamics.grounded).toBe(true);

    // 1. Jump from ground
    const jumped = dynamics.requestJump(params);
    expect(jumped).toBe(true);
    expect(dynamics.verticalVelocity).toBeGreaterThan(5.0);

    // 2. Apex hang when holding jump
    dynamics.setJumpHeld(true);
    dynamics.verticalVelocity = 0.5; // near apex
    dynamics.update(fixedDt, params, false);
    // Gravity should be scaled by apexHangScale (0.55)
    expect(dynamics.verticalVelocity).toBeCloseTo(0.5 - params.gravity * params.apexHangScale * fixedDt, 3);

    // 3. Jump cut when releasing jump early
    dynamics.setJumpHeld(false);
    dynamics.verticalVelocity = 4.0;
    dynamics.update(fixedDt, params, false);
    // Gravity should be scaled by jumpCutScale (1.8)
    expect(dynamics.verticalVelocity).toBeCloseTo(4.0 - params.gravity * params.jumpCutScale * fixedDt, 3);

    // 4. Coyote time: walk off edge and jump within 0.05s (< 0.12s coyote window)
    const coyoteDyn = new KccDynamics();
    coyoteDyn.update(fixedDt, params, true); // grounded
    coyoteDyn.update(fixedDt, params, false); // airborne for 1 frame (16.6ms)
    expect(coyoteDyn.airborneTime).toBeCloseTo(fixedDt, 4);
    const coyoteJump = coyoteDyn.requestJump(params);
    expect(coyoteJump).toBe(true);

    // 5. Jump buffering: request jump 0.05s before landing
    const bufferDyn = new KccDynamics();
    bufferDyn.airborneTime = 1.0; // in air for a long time
    const buffered = bufferDyn.requestJump(params);
    expect(buffered).toBe(false);
    expect(bufferDyn.jumpBufferTimer).toBeGreaterThan(0);

    // Land on ground -> buffered jump fires automatically
    bufferDyn.update(fixedDt, params, true);
    expect(bufferDyn.verticalVelocity).toBeGreaterThan(5.0);
  });

  it('triggers dash and respects cooldown', () => {
    const dynamics = new KccDynamics();
    const params = { ...DEFAULT_KCC_PARAMS };
    const fixedDt = 1 / 60;

    const dashed = dynamics.requestDash({ x: 1, z: 0 }, params);
    expect(dashed).toBe(true);
    expect(dynamics.isDashing).toBe(true);
    expect(dynamics.dashDir).toEqual({ x: 1, z: 0 });

    // Cannot dash again while dashing
    const secondDash = dynamics.requestDash({ x: 1, z: 0 }, params);
    expect(secondDash).toBe(false);

    // Advance past dash duration (0.18s = ~11 frames)
    for (let i = 0; i < 15; i++) {
      dynamics.update(fixedDt, params, true);
    }
    expect(dynamics.isDashing).toBe(false);

    // Still in cooldown (0.8s)
    expect(dynamics.requestDash({ x: 1, z: 0 }, params)).toBe(false);

    // Advance past cooldown
    for (let i = 0; i < 60; i++) {
      dynamics.update(fixedDt, params, true);
    }
    expect(dynamics.requestDash({ x: 0, z: 1 }, params)).toBe(true);
  });

  it('executes fixedStep in CharacterLocomotor and records telemetry', async () => {
    const physicsWorld = await PhysicsWorld.create();

    // Create character capsule body
    const desc = physicsWorld.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 2, 0);
    const body = physicsWorld.createRigidBody(desc);
    physicsWorld.createCapsuleCollider(body, 0.6, 0.3, false, false, 'Player');

    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6));
    mesh.position.set(0, 2, 0);
    const rb = new RigidBodyComponent(physicsWorld, body, mesh, { source: 'owned' });

    const locomotor = new CharacterLocomotor(physicsWorld, rb);

    locomotor.intent.moveX = 1;
    locomotor.intent.moveZ = 0;
    locomotor.intent.run = true;

    const fixedDt = 1 / 60;
    for (let i = 0; i < 30; i++) {
      locomotor.fixedStep(fixedDt);
    }

    const telemetry = locomotor.getTelemetry();
    expect(telemetry).toBeDefined();
    expect(telemetry.currentSpeed).toBeGreaterThan(0);
    expect(locomotor.getState()).toBe('air'); // Was spawned at Y=2 with gravity
  });
});
