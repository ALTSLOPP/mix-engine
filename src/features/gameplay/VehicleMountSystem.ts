import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { VehicleMountConfig } from './types';

export class VehicleMountSystem {
  private config: VehicleMountConfig;
  private mountedVehicleId: EntityId | null = null;
  private currentSpeed = 0;
  private boostRemaining = 4.0;
  private isBoosting = false;
  private currentSteerAngle = 0;

  private readonly _forward = new THREE.Vector3();
  private readonly _tempPos = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: VehicleMountConfig) {
    this.config = { ...initialConfig };
    this.boostRemaining = this.config.boostDuration;
  }

  setConfig(config: Partial<VehicleMountConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.mountedVehicleId = null; this.currentSpeed = 0; this.isBoosting = false; }
  }

  getConfig(): Readonly<VehicleMountConfig> {
    return this.config;
  }

  get isMounted(): boolean {
    return this.mountedVehicleId !== null;
  }

  get speed(): number {
    return this.currentSpeed;
  }

  get boost(): number {
    return this.boostRemaining;
  }

  get boosting(): boolean {
    return this.isBoosting;
  }

  toggleMount(): boolean {
    if (!this.config.enabled) return false;

    if (this.mountedVehicleId !== null) {
      // Dismount safely to the side
      const playerEntityId = this.engine.player.getPossessedId();
      if (playerEntityId !== null) {
        const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
        if (playerRb) {
          const sideOffset = new THREE.Vector3(1.5, 0, 0).applyQuaternion(playerRb.mesh.quaternion);
          playerRb.setNextKinematicTranslation(playerRb.mesh.position.clone().add(sideOffset));
        }
      }
      this.mountedVehicleId = null;
      this.currentSpeed = 0;
      this.isBoosting = false;
      this.engine.sceneManager.events.emit('vehicle_dismounted', {});
      return false;
    }

    // Check proximity to vehicle entity
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    const allEntities = this.engine.sceneManager.allEntityIds();
    for (const id of allEntities) {
      if (id === playerEntityId) continue;
      const isVehicle = this.engine.sceneManager.hasTag(id, 'vehicle');
      if (!isVehicle) continue;

      const vehicleRb = this.engine.sceneManager.getRigidBody(id);
      if (!vehicleRb) continue;

      const dist = playerRb.mesh.position.distanceTo(vehicleRb.mesh.position);
      if (dist <= this.config.mountRadius) {
        this.mountedVehicleId = id;
        this.currentSpeed = 0;
        this.engine.sceneManager.events.emit('vehicle_mounted', { vehicleId: id });
        return true;
      }
    }
    return false;
  }

  update(dt: number, throttle: number, steer: number, handbrake: boolean, boost: boolean): void {
    if (!this.config.enabled || this.mountedVehicleId === null) return;

    const vehicleRb = this.engine.sceneManager.getRigidBody(this.mountedVehicleId);
    if (!vehicleRb) {
      this.mountedVehicleId = null;
      return;
    }

    // Boost Handling
    this.isBoosting = boost && this.boostRemaining > 0;
    if (this.isBoosting) {
      this.boostRemaining = Math.max(0, this.boostRemaining - dt);
    } else {
      this.boostRemaining = Math.min(this.config.boostDuration, this.boostRemaining + dt * 0.5);
    }

    const topSpeed = this.isBoosting ? this.config.maxSpeed * this.config.boostMultiplier : this.config.maxSpeed;
    const accel = this.isBoosting ? this.config.acceleration * 1.5 : this.config.acceleration;

    // Acceleration & Braking
    if (throttle !== 0) {
      this.currentSpeed = THREE.MathUtils.clamp(
        this.currentSpeed + throttle * accel * dt,
        -topSpeed * 0.4,
        topSpeed,
      );
    } else {
      // Natural Friction
      this.currentSpeed = this.currentSpeed * Math.exp(-(handbrake ? 8.0 : 2.5) * dt);
    }

    // Steering
    if (Math.abs(this.currentSpeed) > 0.5) {
      this.currentSteerAngle = -steer * this.config.turnSpeed * dt * Math.sign(this.currentSpeed);
      vehicleRb.mesh.rotateY(this.currentSteerAngle);
      vehicleRb.setNextKinematicRotation(vehicleRb.mesh.quaternion);
    }

    // Position Update
    this._forward.set(0, 0, 1).applyQuaternion(vehicleRb.mesh.quaternion);
    this._tempPos.copy(vehicleRb.mesh.position).addScaledVector(this._forward, this.currentSpeed * dt);
    vehicleRb.setNextKinematicTranslation(this._tempPos);

    // Sync Possessed Player Position to Vehicle
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId !== null) {
      const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
      if (playerRb) {
        playerRb.setNextKinematicTranslation(this._tempPos);
        playerRb.setNextKinematicRotation(vehicleRb.mesh.quaternion);
      }
    }
  }
}
