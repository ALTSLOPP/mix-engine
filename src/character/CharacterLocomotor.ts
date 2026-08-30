import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { type KccParams, DEFAULT_KCC_PARAMS } from './KccParams';
import { KccDynamics, type LocomotionState } from './KccDynamics';
import { PlatformRider } from './PlatformRider';
import { KccTelemetry, type KccTelemetrySnapshot } from './KccTelemetry';

import { SuperheroFlightMotor, type FlightDodgeDir } from './SuperheroFlightMotor';

export interface LocomotorIntent {
  moveX: number; // -1..1
  moveZ: number; // -1..1
  run: boolean;
  jump: boolean;
  jumpHeld: boolean;
  crouch: boolean;
  dash: boolean;
  // Superhero Flight Intent
  flightToggle?: boolean;
  flightAscend?: boolean;
  flightDescend?: boolean;
  flightDodge?: FlightDodgeDir | null;
  flightSlam?: boolean;
  cameraOrientation?: THREE.Quaternion;
}

/**
 * Production Kinematic Character Controller (KCC).
 * Ticked deterministically at fixed-rate substeps in Engine loop Step 6.
 */
export class CharacterLocomotor {
  readonly params: KccParams;
  readonly dynamics = new KccDynamics();
  readonly platformRider = new PlatformRider();
  readonly telemetry = new KccTelemetry();
  readonly flight = new SuperheroFlightMotor();

  private controller: RAPIER.KinematicCharacterController;
  private disposed = false;
  private currentHorizontalVel = new THREE.Vector2();

  // Intent buffer set by PlayerController / AI
  intent: LocomotorIntent = {
    moveX: 0,
    moveZ: 0,
    run: false,
    jump: false,
    jumpHeld: false,
    crouch: false,
    dash: false,
  };

  private readonly _desiredMove = new THREE.Vector3();
  private readonly _tmpPos = new THREE.Vector3();
  private readonly _gravityVec = new THREE.Vector3(0, -1, 0);

  constructor(
    private readonly physicsWorld: PhysicsWorld,
    private readonly rb: RigidBodyComponent,
    params: Partial<KccParams> = {},
  ) {
    this.params = { ...DEFAULT_KCC_PARAMS, ...params };
    this.controller = physicsWorld.createCharacterController(0.02);
    this.configureController();
  }

  private configureController(): void {
    const deg2rad = Math.PI / 180;
    this.controller.enableAutostep(this.params.stepUpHeight, 0.15, false);
    this.controller.enableSnapToGround(this.params.stepDownDistance);
    this.controller.setMaxSlopeClimbAngle(this.params.maxSlopeClimb * deg2rad);
    this.controller.setMinSlopeSlideAngle(this.params.minSlopeSlide * deg2rad);
    this.controller.setApplyImpulsesToDynamicBodies(true);
  }

  setParams(patch: Partial<KccParams>): void {
    Object.assign(this.params, patch);
    this.configureController();
  }

  fixedStep(fixedDt: number): void {
    if (this.disposed) return;
    const body = this.rb.rapierBody;
    if (!body || body.numColliders() === 0) return;
    const collider = body.collider(0);
    const wasGrounded = this.controller.computedGrounded();
    const prevVy = this.dynamics.verticalVelocity;

    // Flight Mode Toggle & Processing
    if (this.intent.flightToggle) {
      this.flight.toggleFlight();
      this.intent.flightToggle = false;
    }

    if (this.flight.isFlightActive) {
      const flightVel = this.flight.update(fixedDt, {
        moveX: this.intent.moveX,
        moveZ: this.intent.moveZ,
        ascend: !!this.intent.flightAscend,
        descend: !!this.intent.flightDescend,
        boost: this.intent.run,
        dodgeDir: this.intent.flightDodge,
        landingSlam: this.intent.flightSlam,
      }, this.intent.cameraOrientation);

      this.intent.flightDodge = null;

      this._desiredMove.set(
        flightVel.x * fixedDt,
        flightVel.y * fixedDt,
        flightVel.z * fixedDt,
      );

      this.controller.computeColliderMovement(collider, this._desiredMove);
      const computedMove = this.controller.computedMovement();
      const pos = body.translation();
      this._tmpPos.set(pos.x + computedMove.x, pos.y + computedMove.y, pos.z + computedMove.z);
      body.setNextKinematicTranslation(this._tmpPos);

      const isNowGrounded = this.controller.computedGrounded();
      if (isNowGrounded && flightVel.y <= -2.0) {
        this.flight.handleGroundImpact(flightVel.y);
      }
      return;
    }

    // 1. Update dynamic state machine & jump holding
    this.dynamics.setJumpHeld(this.intent.jumpHeld);
    this.dynamics.setCrouch(this.intent.crouch);

    if (this.intent.jump) {
      this.dynamics.requestJump(this.params);
      this.intent.jump = false;
    }

    if (this.intent.dash) {
      this.dynamics.requestDash({ x: this.intent.moveX, z: this.intent.moveZ }, this.params);
      this.intent.dash = false;
    }

    this.dynamics.update(fixedDt, this.params, wasGrounded);

    // 2. Horizontal intent & acceleration
    const targetSpeed = this.dynamics.isDashing
      ? this.params.dashSpeed
      : this.intent.run
      ? this.params.maxRunSpeed
      : this.params.maxWalkSpeed;

    const inputLen = Math.hypot(this.intent.moveX, this.intent.moveZ);
    let targetVx = 0;
    let targetVz = 0;

    if (this.dynamics.isDashing) {
      targetVx = this.dynamics.dashDir.x * targetSpeed;
      targetVz = this.dynamics.dashDir.z * targetSpeed;
    } else if (inputLen > 1e-3) {
      const scale = Math.min(inputLen, 1.0) * targetSpeed;
      targetVx = (this.intent.moveX / inputLen) * scale;
      targetVz = (this.intent.moveZ / inputLen) * scale;
    }

    const accel = wasGrounded
      ? (inputLen > 1e-3 ? this.params.acceleration : this.params.deceleration)
      : (inputLen > 1e-3 ? this.params.airAcceleration : this.params.airDeceleration);

    const maxDelta = accel * fixedDt;
    const diffX = targetVx - this.currentHorizontalVel.x;
    const diffZ = targetVz - this.currentHorizontalVel.y;
    const diffLen = Math.hypot(diffX, diffZ);

    if (diffLen <= maxDelta || diffLen < 1e-4) {
      this.currentHorizontalVel.set(targetVx, targetVz);
    } else {
      this.currentHorizontalVel.x += (diffX / diffLen) * maxDelta;
      this.currentHorizontalVel.y += (diffZ / diffLen) * maxDelta;
    }

    // 3. Construct desired movement vector
    this._desiredMove.set(
      this.currentHorizontalVel.x * fixedDt,
      this.dynamics.verticalVelocity * fixedDt,
      this.currentHorizontalVel.y * fixedDt,
    );

    // 4. Slope sliding check
    let isSliding = false;
    if (wasGrounded) {
      const normal = (this.controller as any).computedGroundNormal?.() ?? { x: 0, y: 1, z: 0 };
      const normY = normal.y;
      const deg2rad = Math.PI / 180;
      const minSlideCos = Math.cos(this.params.minSlopeSlide * deg2rad);

      if (normY < minSlideCos && normY > 0.01) {
        isSliding = true;
        this.dynamics.isSliding = true;
        // Project gravity onto the slope plane
        const slopeNormal = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
        const slideDir = this._gravityVec.clone().projectOnPlane(slopeNormal).normalize();
        this._desiredMove.addScaledVector(slideDir, this.params.slideAccel * fixedDt * fixedDt);
        this.controller.disableSnapToGround();
      } else {
        this.dynamics.isSliding = false;
        this.controller.enableSnapToGround(this.params.stepDownDistance);
      }
    }

    // 5. Moving platform rider integration
    const groundCollider = wasGrounded ? (this.controller as any).computedGroundCollider?.()?.handle ?? null : null;
    this.platformRider.update(this.physicsWorld, groundCollider, fixedDt);
    if (wasGrounded && this.platformRider.platformVelocity.lengthSq() > 1e-4) {
      this._desiredMove.x += this.platformRider.platformVelocity.x * fixedDt;
      this._desiredMove.z += this.platformRider.platformVelocity.z * fixedDt;
    }

    // 6. Compute movement with layer mask
    const filterMask = this.physicsWorld.collisionMatrix.layerMask('Player');
    this.controller.computeColliderMovement(
      collider,
      { x: this._desiredMove.x, y: this._desiredMove.y, z: this._desiredMove.z },
      filterMask,
    );

    // 7. Apply computed movement
    const moved = this.controller.computedMovement();
    const currentTranslation = body.translation();
    this._tmpPos.set(
      currentTranslation.x + moved.x,
      currentTranslation.y + moved.y,
      currentTranslation.z + moved.z,
    );

    this.rb.setNextKinematicTranslation(this._tmpPos);

    // 8. Record telemetry
    const currVy = this.dynamics.verticalVelocity;
    const wallHit = this.controller.numComputedCollisions() > 0 && !wasGrounded;
    this.telemetry.recordStep(
      this._tmpPos,
      this.controller.computedGrounded(),
      isSliding,
      wallHit,
      prevVy,
      currVy,
      fixedDt,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.physicsWorld.removeCharacterController(this.controller);
  }

  getState(): LocomotionState {
    const horizontalSpeed = Math.hypot(this.currentHorizontalVel.x, this.currentHorizontalVel.y);
    return this.dynamics.getState(horizontalSpeed);
  }

  getTelemetry(): KccTelemetrySnapshot {
    const speed = Math.hypot(this.currentHorizontalVel.x, this.currentHorizontalVel.y);
    return this.telemetry.getSnapshot(this.dynamics.airborneTime, speed);
  }

  teleport(worldPos: THREE.Vector3): void {
    this.rb.teleport(worldPos);
    this.currentHorizontalVel.set(0, 0);
    this.dynamics.verticalVelocity = 0;
    this.dynamics.grounded = false;
    this.platformRider.reset();
    this.telemetry.reset();
  }
}
