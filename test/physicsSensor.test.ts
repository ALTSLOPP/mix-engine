import { describe, it, expect } from 'vitest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';

/**
 * Regression for the dead sensor-event path: Rapier ≥0.12 removed
 * EventQueue.drainIntersectionEvents, so sensor intersections only surface through
 * drainCollisionEvents. The engine relies on PhysicsWorld.isSensorCollider() to split
 * those back out and route them to script.onSensor. This proves both halves work against
 * the actually-shipped Rapier build.
 */
describe('PhysicsWorld sensor events (Rapier 0.14)', () => {
  it('reports sensor intersections via drainCollisionEvents and flags them with isSensorCollider', async () => {
    const pw = await PhysicsWorld.create();
    const R = pw.RAPIER;

    // A fixed SENSOR box at the origin (events enabled, isSensor=true).
    const boxBody = pw.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
    const sensorCol = pw.createBoxCollider(boxBody, 1, 1, 1, /*events*/ true, /*isSensor*/ true);

    // A dynamic sphere spawned overlapping it — should generate an intersection START.
    const ballBody = pw.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0, 0));
    pw.createSphereCollider(ballBody, 0.5, /*events*/ true, /*isSensor*/ false);

    let total = 0;
    let sensorInvolving = 0;
    for (let i = 0; i < 3; i++) {
      pw.step(1 / 60);
      pw.drainCollisionEvents((e) => {
        total++;
        if (pw.isSensorCollider(e.colliderA) || pw.isSensorCollider(e.colliderB)) sensorInvolving++;
      });
    }

    expect(pw.isSensorCollider(sensorCol.handle)).toBe(true);
    expect(total).toBeGreaterThan(0);
    expect(sensorInvolving).toBeGreaterThan(0);

    pw.dispose();
  });

  it('returns false for a non-sensor collider and for an unknown handle', async () => {
    const pw = await PhysicsWorld.create();
    const R = pw.RAPIER;
    const body = pw.createRigidBody(R.RigidBodyDesc.fixed());
    const solid = pw.createBoxCollider(body, 1, 1, 1, true, false);
    expect(pw.isSensorCollider(solid.handle)).toBe(false);
    expect(pw.isSensorCollider(999999)).toBe(false);
    pw.dispose();
  });
});
