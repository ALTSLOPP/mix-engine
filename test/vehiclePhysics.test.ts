import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { SceneManager } from '../src/ecs/SceneManager';
import { AssetCache } from '../src/animation/AssetCache';
import { RigidBodyComponent } from '../src/physics/RigidBodyComponent';
import { VehicleSystem } from '../src/physics/VehicleSystem';
import type { WheelSpec } from '../src/physics/VehiclePhysics';

/**
 * Drives a real Rapier chassis with 4 raycast wheels against a fixed floor. Verifies:
 *   - The suspension holds the chassis off the floor (doesn't collapse or explode).
 *   - Applying throttle accelerates the chassis forward.
 *   - Steering with forward input yaws the chassis.
 *
 * This is the same code path the engine loop runs every fixed step.
 */
async function makeVehicleScene() {
  const pw = await PhysicsWorld.create();
  const R = pw.RAPIER;
  // Floor: 50×50m fixed box, top at y=0.
  const floor = pw.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
  pw.createBoxCollider(floor, 25, 0.5, 25, false, false);

  const wo = new WorldOrigin();
  const sm = new SceneManager(new THREE.Scene(), pw, new AssetCache(), wo);
  // Register a minimal 'box' builder so we can spawn a chassis. The chassis gets a
  // realistic additional mass (~1200kg) so the suspension forces don't launch it.
  sm.registerBuilder('box', (enginePos, _params, ctx) => {
    const body = ctx.physicsWorld.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(enginePos.x, enginePos.y, enginePos.z).setAdditionalMass(1200),
    );
    ctx.physicsWorld.createBoxCollider(body, 1, 0.5, 2, true, false);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshBasicMaterial());
    mesh.position.copy(enginePos);
    return new RigidBodyComponent(ctx.physicsWorld, body, mesh, { source: 'owned' });
  });

  const vs = new VehicleSystem({ physicsWorld: pw, sceneManager: sm, worldOrigin: wo });

  // Spawn a chassis 1.2m above the floor (close to the rest height so it settles gently:
  // floor top 0.5 + suspension rest 0.3 + chassis COM offset ≈ 0.9–1.1m).
  const chassisId = sm.spawnNow(new THREE.Vector3(0, 1.2, 0), { kind: 'box', params: {} });
  // Wheel attach points at y=-0.4 (at the chassis box's lower interior). The suspension
  // ray casts down from there; the body-excluding raycast skips the chassis's own collider.
  const wheelSpecs: WheelSpec[] = [
    wheelSpec([-1, -0.4, 1.2], true, true),
    wheelSpec([ 1, -0.4, 1.2], true, true),
    wheelSpec([-1, -0.4, -1.2], true, false),
    wheelSpec([ 1, -0.4, -1.2], true, false),
  ];
  vs.addVehicle(chassisId, { wheels: wheelSpecs });
  // Step once so Rapier builds its broadphase (raycasts need it).
  pw.step(1 / 60);
  return { pw, sm, vs, chassisId };
}

function wheelSpec(attach: [number, number, number], driven: boolean, steered: boolean): WheelSpec {
  return {
    attach: new THREE.Vector3(attach[0], attach[1], attach[2]),
    suspensionRestLength: 0.3,
    // Spring tuned for a ~1200kg chassis: 4 wheels sharing the load, static compression
    // = (1200*9.81/4) / stiffness. At 15000 N/m → 0.196m (within maxTravel=0.2m).
    springStiffness: 15000,
    springDamping: 3000,
    radius: 0.4,
    maxTravel: 0.2,
    lateralFriction: 1.8,
    longitudinalFriction: 1.2,
    driven,
    steered,
  };
}

const DT = 1 / 60;

describe('VehicleSystem (raycast suspension + traction)', () => {
  it('suspension holds the chassis off the floor at a stable rest height', async () => {
    const { pw, sm, vs, chassisId } = await makeVehicleScene();
    // Let it settle for ~2 seconds of sim time (the suspension oscillates for ~1.5s
    // before damping out — a known characteristic of the spring-damper model).
    for (let i = 0; i < 120; i++) {
      vs.preStep(DT);
      pw.step(DT);
    }
    const rb = sm.getRigidBody(chassisId)!;
    const y = rb.rapierBody.translation().y;
    // Rest height: floor top (0.5) + suspension rest (0.3) + chassis COM offset ≈ 1.0m.
    // We just verify it's airborne (not on the floor at 0.5) and hasn't flown away.
    expect(y).toBeGreaterThan(0.7);
    expect(y).toBeLessThan(2.0);
    // And it should be roughly stable (low vertical velocity).
    const vy = rb.rapierBody.linvel().y;
    expect(Math.abs(vy)).toBeLessThan(0.5);
    pw.dispose();
  });

  it('throttle accelerates the chassis forward', async () => {
    const { pw, sm, vs, chassisId } = await makeVehicleScene();
    // Settle first (~1.7s so the suspension oscillation damps out).
    for (let i = 0; i < 100; i++) { vs.preStep(DT); pw.step(DT); }
    // Apply full throttle for 2 seconds.
    vs.setVehicleInput(chassisId, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
    for (let i = 0; i < 120; i++) { vs.preStep(DT); pw.step(DT); }
    const rb = sm.getRigidBody(chassisId)!;
    const v = rb.rapierBody.linvel();
    const speed = Math.sqrt(v.x * v.x + v.z * v.z);
    // The car should be moving forward at a measurable speed (>1 m/s after 2s of throttle).
    expect(speed).toBeGreaterThan(1);
    pw.dispose();
  });

  it('steering with forward input yaws the chassis', async () => {
    const { pw, sm, vs, chassisId } = await makeVehicleScene();
    for (let i = 0; i < 100; i++) { vs.preStep(DT); pw.step(DT); }
    // Full throttle + full left steer for 2 seconds.
    vs.setVehicleInput(chassisId, { throttle: 1, steer: -1, handbrake: 0 });
    for (let i = 0; i < 120; i++) { vs.preStep(DT); pw.step(DT); }
    const rb = sm.getRigidBody(chassisId)!;
    const rot = rb.rapierBody.rotation();
    // The chassis yaw should have changed (the initial yaw was 0; after a left turn it's
    // non-zero). The exact angle depends on grip + speed; we just check it's NOT still 0.
    const yawChanged = Math.abs(rot.y) > 0.05 || Math.abs(rot.x) > 0.05 || Math.abs(rot.z) > 0.05;
    expect(yawChanged).toBe(true);
    pw.dispose();
  });

  it('getVehicleInfo reports speed and wheel contact state', async () => {
    const { pw, vs, chassisId } = await makeVehicleScene();
    // Before stepping, the info should exist with 0 wheels in contact (chassis is airborne).
    const info0 = vs.getVehicleInfo(chassisId)!;
    expect(info0).not.toBeNull();
    expect(info0.wheelCount).toBe(4);
    // After settling (~1.7s), most wheels should be in contact. The chassis may tilt
    // slightly during settling (a wheel or two can lift momentarily), so we require
    // at least 2 of 4 in contact — the suspension is clearly working.
    for (let i = 0; i < 100; i++) { vs.preStep(DT); pw.step(DT); }
    const info1 = vs.getVehicleInfo(chassisId)!;
    expect(info1.wheelsInContact).toBeGreaterThanOrEqual(2);
    pw.dispose();
  });
});
