import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';

/**
 * VehiclePhysics.ts — modular raycast-vehicle physics on top of Rapier.
 *
 * The classic arcade vehicle model (used by Unity's WheelCollider, GTA's cars, and most
 * open-world driving games): the chassis is a single dynamic rigid body, and each wheel
 * is a RAYCAST from the chassis down to the ground — not a separate physics body. The
 * suspension is a spring-damper along the ray; the contact point's friction applies
 * longitudinal (traction/brake) and lateral (cornering) forces to the chassis.
 *
 * Why raycast wheels instead of real wheel colliders? Real wheel colliders (HingeJoint +
 * cylinder) are jittery at the contact patch and need careful tuning; raycast wheels are
 * stable, cheap, and give the arcade "feel" an open-world game wants. This is the model
 * every GTA / Saints Row / Spider-Man game uses.
 *
 * Each wheel:
 *   1. Cast a ray from the chassis-relative attach point downwards (engine space).
 *   2. If the ray hits ground within `suspensionRestLength + radius`:
 *      - Compute the spring force (Hooke's law + damping) along the contact normal.
 *      - Apply it to the chassis at the attach point (suspension holds the car up).
 *      - Compute the wheel's contact velocity (chassis vel + ω × r at the contact).
 *      - Split it into longitudinal (forward) + lateral (sideways) components.
 *      - Apply a friction impulse that cancels the lateral velocity (cornering grip),
 *        scaled by a combined-friction coefficient (traction circle approximation).
 *      - Apply the engine / brake force as a longitudinal impulse at the contact.
 *   3. Update the wheel's visual transform (spin angle from longitudinal speed, steer
 *      angle from input, suspension compression from the ray hit distance).
 *
 * The controller is `VehicleController` — a per-entity component the AIBridge
 * `add_vehicle` command attaches. Input is set via `set_vehicle_input` (throttle, brake,
 * steer, handbrake) and the engine loop ticks every vehicle each fixed step.
 *
 * All math is in ENGINE space (Rapier lives there); the chassis rigid body is the
 * entity's RigidBodyComponent. The wheel visual meshes are nested under the chassis
 * Object3D (they're non-physics attachments — the Scene-Graph Contract permits this for
 * visual-only children).
 */

export interface WheelSpec {
  /** Chassis-relative attach point (metres from the chassis origin). */
  attach: THREE.Vector3;
  /** Suspension rest length (metres) — ray length when fully extended. */
  suspensionRestLength: number;
  /** Spring stiffness (N/m). */
  springStiffness: number;
  /** Damping coefficient (N·s/m). */
  springDamping: number;
  /** Wheel radius (metres). */
  radius: number;
  /** Max suspension travel (metres) beyond rest length before bottoming out. */
  maxTravel: number;
  /** Lateral friction coefficient (cornering grip). ~1.0–2.5 for street tyres. */
  lateralFriction: number;
  /** Longitudinal friction coefficient (accel/brake grip). ~1.0–2.0. */
  longitudinalFriction: number;
  /** Is this wheel driven by the engine? (front/rear/all/4WD config.) */
  driven: boolean;
  /** Is this wheel steered? (front wheels typically true.) */
  steered: boolean;
  /** Optional visual mesh; if absent, a debug cylinder is created. */
  visualMesh?: THREE.Object3D;
}

export interface VehicleSpec {
  /** Engine force per wheel at full throttle (N). */
  engineForce: number;
  /** Brake force per wheel at full brake (N). */
  brakeForce: number;
  /** Max steering angle (radians) at low speed. */
  maxSteerAngle: number;
  /** Speed at which steering begins to reduce (m/s) — high-speed understeer. */
  steerSpeedReduction: number;
  /** Handbrake lateral grip multiplier (0 = full slide, 1 = normal grip). */
  handbrakeGrip: number;
  /** Downforce coefficient (N per (m/s)²). Keeps the car planted at speed. */
  downforce: number;
  /** Roll-center height (metres) — anti-roll bar pivot. */
  rollCenterHeight: number;
  /** Anti-roll bar stiffness (N·m/rad). Transfers load between L/R wheels in a pair. */
  antiRollStiffness: number;
}

export const DEFAULT_VEHICLE: VehicleSpec = {
  engineForce: 2500,
  brakeForce: 4000,
  maxSteerAngle: 0.55,
  steerSpeedReduction: 30,
  handbrakeGrip: 0.3,
  downforce: 8,
  rollCenterHeight: 0.4,
  antiRollStiffness: 4000,
};

export interface VehicleInput {
  throttle: number;   // -1..1 (negative = reverse)
  brake: number;      // 0..1
  steer: number;      // -1..1 (negative = left)
  handbrake: number;  // 0..1
}

interface WheelState {
  spec: WheelSpec;
  /** Current steer angle (radians) — smoothed towards the input. */
  steerAngle: number;
  /** Current spin angle (radians) — integrated from longitudinal speed. */
  spinAngle: number;
  /** Current suspension compression (metres, 0 = rest). */
  compression: number;
  /** Last-frame contact flag (for the visual + anti-roll). */
  inContact: boolean;
  /** Last-frame ray hit distance (metres). */
  hitDistance: number;
  /** Last-frame contact normal (world space). */
  contactNormal: THREE.Vector3;
  /** Last-frame contact point (world space). */
  contactPoint: THREE.Vector3;
  /** Visual mesh (a debug cylinder if none was supplied). */
  visual: THREE.Object3D;
  /** Whether the visual was auto-created (so we dispose it on teardown). */
  visualOwned: boolean;
  /** Chassis-relative forward vector at the wheel (recomputed when steering changes). */
  forwardLocal: THREE.Vector3;
  /** Chassis-relative right vector. */
  rightLocal: THREE.Vector3;
}

export class VehicleController {
  /** Per-wheel state, in spec order. */
  private readonly wheels: WheelState[] = [];
  private readonly spec: VehicleSpec;
  private readonly physicsWorld: PhysicsWorld;
  private readonly sceneManager: SceneManager;
  private readonly worldOrigin: WorldOrigin;
  private readonly body: RigidBodyComponent;
  readonly entityId: EntityId;

  input: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

  /** Speed in m/s (magnitude of horizontal velocity). Read by the feel analyzer / HUD. */
  speed = 0;
  /** Engine RPM proxy 0..1 (used for audio). */
  rpm = 0;

  private readonly _down = new THREE.Vector3(0, -1, 0);
  /** Per-step fixed timestep, set by preStep(fixedDt). All impulse magnitudes + spin
   *  rates scale by this so the model is correct at any Time.ts timestep. */
  private _fixedDt = 1 / 60;
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _worldAttach = new THREE.Vector3();
  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _velAtContact = new THREE.Vector3();
  private readonly _angVel = new THREE.Vector3();
  private readonly _contactToCenter = new THREE.Vector3();
  private readonly _force = new THREE.Vector3();
  private readonly _fwd2 = new THREE.Vector3(0, 0, 1);
  private readonly _right2 = new THREE.Vector3(1, 0, 0);
  private readonly _quat = new THREE.Quaternion();
  private readonly _euler = new THREE.Euler();

  /** Anti-roll pairs: [wheelIndexA, wheelIndexB]. Auto-built from spec order: pairs
   *  are (0,1) and (2,3) for a 4-wheel car (front-L/R, rear-L/R). */
  private readonly antiRollPairs: Array<[number, number]> = [];

  constructor(
    entityId: EntityId,
    body: RigidBodyComponent,
    wheelSpecs: WheelSpec[],
    spec: Partial<VehicleSpec> = {},
    deps: { physicsWorld: PhysicsWorld; sceneManager: SceneManager; worldOrigin: WorldOrigin },
  ) {
    this.entityId = entityId;
    this.body = body;
    this.spec = { ...DEFAULT_VEHICLE, ...spec };
    this.physicsWorld = deps.physicsWorld;
    this.sceneManager = deps.sceneManager;
    this.worldOrigin = deps.worldOrigin;

    for (const ws of wheelSpecs) {
      const visual = ws.visualMesh ?? makeDebugWheel(ws.radius);
      this.wheels.push({
        spec: ws,
        steerAngle: 0,
        spinAngle: 0,
        compression: 0,
        inContact: false,
        hitDistance: 0,
        contactNormal: new THREE.Vector3(0, 1, 0),
        contactPoint: new THREE.Vector3(),
        visual,
        visualOwned: !ws.visualMesh,
        forwardLocal: new THREE.Vector3(0, 0, 1),
        rightLocal: new THREE.Vector3(1, 0, 0),
      });
      // Nest the visual under the chassis mesh so it follows the body.
      body.mesh.add(visual);
    }
    // Anti-roll pairs: (0,1), (2,3), …
    for (let i = 0; i + 1 < this.wheels.length; i += 2) {
      this.antiRollPairs.push([i, i + 1]);
    }
  }

  /** Set the controller input (throttle / brake / steer / handbrake). */
  setInput(input: Partial<VehicleInput>): void {
    if (input.throttle !== undefined) this.input.throttle = clamp(input.throttle, -1, 1);
    if (input.brake !== undefined) this.input.brake = clamp(input.brake, 0, 1);
    if (input.steer !== undefined) this.input.steer = clamp(input.steer, -1, 1);
    if (input.handbrake !== undefined) this.input.handbrake = clamp(input.handbrake, 0, 1);
  }

  /** Read-only access to the wheel states (for VehicleSystem.getVehicleInfo). */
  get wheelStates(): ReadonlyArray<{
    inContact: boolean;
    compression: number;
    steerAngle: number;
    spinAngle: number;
  }> {
    return this.wheels;
  }

  /** Per-fixed-step update. Called by the engine's physics loop BEFORE world.step().
   *  `fixedDt` is the physics timestep (default 1/60s if not passed); all impulse
   *  magnitudes + spin rates are scaled by it so the model is correct at any
   *  timestep Time.ts chooses. */
  preStep(fixedDt: number = 1 / 60): void {
    const rapierBody = this.body.rapierBody;
    this._fixedDt = fixedDt;
    const chassisPos = rapierBody.translation();
    const chassisRot = rapierBody.rotation();
    this._quat.set(chassisRot.x, chassisRot.y, chassisRot.z, chassisRot.w);
    // Chassis forward / right (world space) — the chassis model's forward is +Z.
    this._fwd2.set(0, 0, 1).applyQuaternion(this._quat);
    this._right2.set(1, 0, 0).applyQuaternion(this._quat);
    const linvel = rapierBody.linvel();
    const angvel = rapierBody.angvel();
    this._angVel.set(angvel.x, angvel.y, angvel.z);
    const speed = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);
    this.speed = speed;

    // Smooth steering towards the input, reduced at high speed (understeer).
    const steerReduction = Math.max(0.4, 1 - speed / this.spec.steerSpeedReduction);
    const targetSteer = this.input.steer * this.spec.maxSteerAngle * steerReduction;
      // Rate-limit the steer (so a snap input doesn't jerk the wheel). The rate scales
      // with the actual fixed timestep so a 1/120 sim doesn't steer half as fast as 1/60.
      const maxSteerRate = 4.0; // rad/s
      for (const w of this.wheels) {
        if (!w.spec.steered) continue;
        const diff = targetSteer - w.steerAngle;
        const maxStep = maxSteerRate * this._fixedDt;
        w.steerAngle += Math.max(-maxStep, Math.min(maxStep, diff));
      }

    // Per-wheel suspension + friction.
    let driveForce = this.input.throttle * this.spec.engineForce;
    let brakeForce = this.input.brake * this.spec.brakeForce;
    // Reverse: when throttle is negative and moving forward, the brake engages first
    // (so a single trigger handles both brake + reverse, GTA-style).
    if (this.input.throttle < 0 && speed > 1) { driveForce = 0; brakeForce = Math.max(brakeForce, -this.input.throttle * this.spec.brakeForce); }

    for (let i = 0; i < this.wheels.length; i++) {
      this.updateWheel(i, this._quat, this._fwd2, this._right2, { x: chassisPos.x, y: chassisPos.y, z: chassisPos.z }, this._angVel, { x: linvel.x, y: linvel.y, z: linvel.z }, driveForce, brakeForce);
    }

    // Anti-roll bars: transfer force between paired wheels based on compression delta.
    for (const [a, b] of this.antiRollPairs) {
      const wa = this.wheels[a], wb = this.wheels[b];
      if (!wa.inContact && !wb.inContact) continue;
      const diff = (wa.compression ?? 0) - (wb.compression ?? 0);
      const force = diff * this.spec.antiRollStiffness;
      // Resist body roll: push the MORE-compressed wheel's side of the body UP and the
      // LESS-compressed side DOWN (a counter-torque). The previous signs were inverted,
      // which amplified roll in corners. The `* this._fixedDt` converts the force (N)
      // into a per-step impulse (N·s) so the anti-roll moment scales with the timestep.
      if (wa.inContact) rapierBody.applyImpulseAtPoint({ x: 0, y: force * this._fixedDt, z: 0 }, { x: wa.contactPoint.x, y: wa.contactPoint.y, z: wa.contactPoint.z }, true);
      if (wb.inContact) rapierBody.applyImpulseAtPoint({ x: 0, y: -force * this._fixedDt, z: 0 }, { x: wb.contactPoint.x, y: wb.contactPoint.y, z: wb.contactPoint.z }, true);
    }

    // Downforce: push the car down proportional to speed² (keeps it planted at high speed).
    const downforce = this.spec.downforce * speed * speed * 0.01;
    // Per-step impulse = force × fixedDt.
    rapierBody.applyImpulse({ x: 0, y: -downforce * this._fixedDt, z: 0 }, true);

    // RPM proxy: speed mapped to 0..1 with a soft cap.
    this.rpm = Math.min(1, speed / 50);
  }

  /** Per-fixed-step update for a single wheel. */
  private updateWheel(
    i: number,
    chassisQuat: THREE.Quaternion,
    chassisForward: THREE.Vector3,
    chassisRight: THREE.Vector3,
    chassisPos: RAPIER.Vector,
    angVel: THREE.Vector3,
    linVel: RAPIER.Vector,
    driveForce: number,
    brakeForce: number,
  ): void {
    const w = this.wheels[i];
    const spec = w.spec;
    // World-space attach point = chassisPos + (attach rotated by chassisQuat).
    this._worldAttach.copy(spec.attach).applyQuaternion(chassisQuat);
    this._rayOrigin.set(chassisPos.x + this._worldAttach.x, chassisPos.y + this._worldAttach.y, chassisPos.z + this._worldAttach.z);
    // Cast down. The ray length is suspensionRestLength + radius. Use the body-excluding
    // raycast so the wheel ray doesn't hit the chassis's own collider. solid=true so a
    // ray starting inside the chassis still reports the floor hit (the exclusion loop
    // skips the chassis hit and re-casts from just past it).
    const rayLen = spec.suspensionRestLength + spec.radius;
    const hit = this.physicsWorld.raycastExcludeBody(this._rayOrigin, this._down, rayLen, this.body.rapierBody, true);
    if (!hit) {
      w.inContact = false;
      w.compression = 0;
      this.updateWheelVisual(w, chassisQuat, rayLen);
      return;
    }
    w.inContact = true;
    w.hitDistance = hit.toi;
    w.contactNormal.copy(hit.normal);
    // World-space contact point.
    w.contactPoint.set(
      this._rayOrigin.x + this._down.x * hit.toi,
      this._rayOrigin.y + this._down.y * hit.toi,
      this._rayOrigin.z + this._down.z * hit.toi,
    );
    // Suspension compression: rest length - (hit distance - radius).
    const compression = Math.max(0, spec.suspensionRestLength - (hit.toi - spec.radius));
    w.compression = compression;

    // Spring force (Hooke's law + damping) along the contact normal. Clamped to a
    // sane max so a deep compression (e.g. landing from a jump) doesn't inject a NaN-
    // inducing spike through the impulse solver.
    const springForce = Math.min(compression * spec.springStiffness, spec.springStiffness * spec.maxTravel * 4);
    // Damping: relative velocity along the suspension (chassis moving down = positive).
    const suspensionVel = -(linVel.y); // approx (chassis vertical velocity)
    const dampForce = Math.max(-spec.springDamping * 5, Math.min(spec.springDamping * 5, suspensionVel * spec.springDamping));
    const totalSuspForce = springForce + dampForce;
    // Apply the suspension force along the contact normal at the contact point.
    this._force.copy(w.contactNormal).multiplyScalar(totalSuspForce);
    rapierBodyApplyImpulseAtPoint(this.body.rapierBody, this._force.x, this._force.y, this._force.z, w.contactPoint.x, w.contactPoint.y, w.contactPoint.z, this._fixedDt);

    // Wheel forward/right vectors (world space, including the steer angle).
    this._quat.copy(chassisQuat);
    this._euler.setFromQuaternion(this._quat, 'YXZ');
    // Steer rotates the wheel around the chassis's LOCAL Y axis. The product must be
    // `chassisQuat * steerQuat` (steer applied first in local space, then transformed
    // to world) — `steerQuat * chassisQuat` would rotate around WORLD Y and diverge
    // from driver intent when the chassis is pitched/rolled on slopes or in corners.
    const wheelQuat = new THREE.Quaternion().copy(chassisQuat).multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.steerAngle),
    );
    this._forward.set(0, 0, 1).applyQuaternion(wheelQuat);
    this._right.set(1, 0, 0).applyQuaternion(wheelQuat);
    w.forwardLocal.copy(this._forward);
    w.rightLocal.copy(this._right);

    // Velocity at the contact point: v_contact = v_chassis + ω × r (r = contact - chassisPos).
    this._contactToCenter.set(w.contactPoint.x - chassisPos.x, w.contactPoint.y - chassisPos.y, w.contactPoint.z - chassisPos.z);
    this._velAtContact.set(
      linVel.x + (angVel.y * this._contactToCenter.z - angVel.z * this._contactToCenter.y),
      linVel.y + (angVel.z * this._contactToCenter.x - angVel.x * this._contactToCenter.z),
      linVel.z + (angVel.x * this._contactToCenter.y - angVel.y * this._contactToCenter.x),
    );
    // Longitudinal (forward) + lateral (sideways) components.
    const longVel = this._velAtContact.dot(this._forward);
    const latVel = this._velAtContact.dot(this._right);

    // Combined friction (traction circle): the total grip is bounded, so as longitudinal
    // demand rises, lateral grip falls. Approximation: scale lateral by (1 - |throttle|*0.3).
    const gripScale = this.input.handbrake > 0 ? this.spec.handbrakeGrip : 1;
    const latFric = spec.lateralFriction * gripScale;

    // Lateral friction impulse: cancel the lateral velocity (cornering). Scaled by the
    // suspension force (more weight = more grip) and the lateral friction coefficient.
    // The impulse is bounded so a huge lateral velocity doesn't inject a NaN spike.
    const normalForce = Math.max(0, totalSuspForce);
    const latImpulse = Math.max(-normalForce * latFric * 0.5, Math.min(normalForce * latFric * 0.5, -latVel * latFric * normalForce * 0.02));
    // Apply along the wheel's right axis.
    this._force.copy(this._right).multiplyScalar(latImpulse);
    rapierBodyApplyImpulseAtPoint(this.body.rapierBody, this._force.x, this._force.y, this._force.z, w.contactPoint.x, w.contactPoint.y, w.contactPoint.z, this._fixedDt);

    // Longitudinal: engine force (driven wheels) + rolling resistance + brake.
    // Forces are in Newtons; `rapierBodyApplyImpulseAtPoint` multiplies by dt internally.
    if (spec.driven) {
      this._force.copy(this._forward).multiplyScalar(driveForce);
      rapierBodyApplyImpulseAtPoint(this.body.rapierBody, this._force.x, this._force.y, this._force.z, w.contactPoint.x, w.contactPoint.y, w.contactPoint.z, this._fixedDt);
    }
    // Brake: opposes the longitudinal velocity.
    if (brakeForce > 0 && Math.abs(longVel) > 0.01) {
      const brakeImpulse = -Math.sign(longVel) * brakeForce * spec.longitudinalFriction;
      this._force.copy(this._forward).multiplyScalar(brakeImpulse);
      rapierBodyApplyImpulseAtPoint(this.body.rapierBody, this._force.x, this._force.y, this._force.z, w.contactPoint.x, w.contactPoint.y, w.contactPoint.z, this._fixedDt);
    }
    // Rolling resistance: small force opposing longitudinal motion.
    if (Math.abs(longVel) > 0.05) {
      const rr = -longVel * 20; // ~20N per m/s of drift
      this._force.copy(this._forward).multiplyScalar(rr);
      rapierBodyApplyImpulseAtPoint(this.body.rapierBody, this._force.x, this._force.y, this._force.z, w.contactPoint.x, w.contactPoint.y, w.contactPoint.z, this._fixedDt);
    }

    // Spin the wheel visual (integrate from longitudinal speed).
    const wheelCircumference = 2 * Math.PI * spec.radius;
    w.spinAngle += (longVel / Math.max(wheelCircumference, 1e-6)) * 2 * Math.PI * this._fixedDt;
    this.updateWheelVisual(w, chassisQuat, hit.toi);
  }

  /** Position the wheel visual under the chassis (suspension + spin + steer). */
  private updateWheelVisual(w: WheelState, chassisQuat: THREE.Quaternion, hitDist: number): void {
    // Local position: below the attach point by (hitDist - radius), or rest length if airborne.
    const restDist = w.spec.suspensionRestLength + w.spec.radius;
    const dist = w.inContact ? Math.max(hitDist - w.spec.radius, 0) : restDist;
    w.visual.position.set(w.spec.attach.x, w.spec.attach.y - dist, w.spec.attach.z);
    // Rotation: steer (Y) + spin (X).
    const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.steerAngle);
    const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), w.spinAngle);
    w.visual.quaternion.copy(steerQuat).multiply(spinQuat);
  }

  dispose(): void {
    for (const w of this.wheels) {
      if (w.visualOwned) {
        w.visual.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.geometry?.dispose(); (m.material as THREE.Material)?.dispose(); }
        });
      }
      w.visual.removeFromParent();
    }
    this.wheels.length = 0;
  }
}

/** Apply an impulse at a point on a Rapier body (impulse = force * dt). */
function rapierBodyApplyImpulseAtPoint(
  body: RAPIER.RigidBody,
  ix: number, iy: number, iz: number,
  px: number, py: number, pz: number,
  dt: number,
): void {
  body.applyImpulseAtPoint({ x: ix * dt, y: iy * dt, z: iz * dt }, { x: px, y: py, z: pz }, true);
}

function makeDebugWheel(radius: number): THREE.Object3D {
  // Build the wheel as a GROUP containing the cylinder mesh. The cylinder's natural
  // axis is Y; we pre-rotate the mesh by π/2 around Z so its axis becomes X (the
  // wheel's lateral axle). updateWheelVisual then sets the GROUP's quaternion to the
  // steer+spin combination without disturbing the mesh's axle offset.
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius, radius, radius * 0.4, 16);
  const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.rotation.z = Math.PI / 2; // axle offset: cylinder Y → wheel X
  group.add(mesh);
  return group;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
