import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { ShipCameraMode, SpaceshipFlightConfig, SpaceshipFlightState } from './types';

export const DEFAULT_SPACESHIP_CONFIG: SpaceshipFlightConfig = {
  enabled: true,
  maxSpeed: 80,
  turboSpeed: 180,
  accel: 35,
  brake: 50,
  drag: 10,
  verticalSpeed: 30,
  turnRate: 1.4,
  pitchRate: 1.0,
  rollRate: 1.8,
  bankMax: 0.45,
  barrelRollDuration: 0.72,
};

export class SpaceshipFlightSystem {
  private config: SpaceshipFlightConfig;
  private isFlying = false;
  private currentSpeed = 0;
  private readonly velocity = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private isTurbo = false;
  private isRolling = false;
  private rollProgress = 0;
  private rollDirection: 'left' | 'right' = 'left';
  private cameraMode: ShipCameraMode = 'chase';

  private readonly _forward = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(private readonly engine: Engine, initialConfig: SpaceshipFlightConfig = DEFAULT_SPACESHIP_CONFIG) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<SpaceshipFlightConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<SpaceshipFlightConfig> {
    return this.config;
  }

  startFlight(spawnPos: THREE.Vector3, initialYaw = 0): void {
    this.isFlying = true;
    this.position.copy(spawnPos);
    this._euler.set(0, initialYaw, 0);
    this.rotation.setFromEuler(this._euler);
    this.currentSpeed = 0;
    this.velocity.set(0, 0, 0);
    this.isRolling = false;
    this.rollProgress = 0;

    // Arbitrate camera
    (this.engine as any).cameraArbitrator?.requestMode?.('vehicle_mount', 40);
    this.engine.sceneManager?.events?.emit('spaceship_flight_started', { position: spawnPos.clone() });
  }

  endFlight(): void {
    this.isFlying = false;
    this.currentSpeed = 0;
    this.velocity.set(0, 0, 0);
    this.isRolling = false;
    (this.engine as any).cameraArbitrator?.releaseMode?.('vehicle_mount');
    this.engine.sceneManager?.events?.emit('spaceship_flight_ended', { position: this.position.clone() });
  }

  setCameraMode(mode: ShipCameraMode): void {
    this.cameraMode = mode;
    this.engine.sceneManager?.events?.emit('spaceship_camera_changed', { mode });
  }

  cycleCameraMode(): ShipCameraMode {
    const modes: ShipCameraMode[] = ['chase', 'rear', 'cockpit', 'cinematic'];
    const nextIdx = (modes.indexOf(this.cameraMode) + 1) % modes.length;
    this.setCameraMode(modes[nextIdx]);
    return this.cameraMode;
  }

  triggerBarrelRoll(direction: 'left' | 'right' = 'left'): boolean {
    if (!this.isFlying || this.isRolling) return false;
    this.isRolling = true;
    this.rollProgress = 0;
    this.rollDirection = direction;
    this.engine.burstVfx?.('magic', this.position, 12);
    this.engine.sceneManager?.events?.emit('spaceship_barrel_roll', { direction });
    return true;
  }

  update(
    dt: number,
    throttle: number,
    pitch: number,
    yaw: number,
    verticalLift = 0,
    turbo = false
  ): void {
    if (!this.config.enabled || !this.isFlying) return;

    this.isTurbo = turbo;
    const targetMaxSpeed = turbo ? this.config.turboSpeed : this.config.maxSpeed;

    // Longitudinal acceleration
    if (throttle > 0) {
      this.currentSpeed = Math.min(targetMaxSpeed, this.currentSpeed + this.config.accel * throttle * dt);
    } else if (throttle < 0) {
      this.currentSpeed = Math.max(0, this.currentSpeed - this.config.brake * Math.abs(throttle) * dt);
    } else {
      // Atmospheric drag
      this.currentSpeed = Math.max(0, this.currentSpeed - this.config.drag * dt);
    }

    // Orientation steering
    this._euler.setFromQuaternion(this.rotation);
    this._euler.y -= yaw * this.config.turnRate * dt;
    this._euler.x = Math.max(-1.2, Math.min(1.2, this._euler.x + pitch * this.config.pitchRate * dt));

    // Dynamic banking
    const targetBank = -yaw * this.config.bankMax;
    this._euler.z = THREE.MathUtils.lerp(this._euler.z, targetBank, 5.0 * dt);

    // Barrel roll maneuver
    if (this.isRolling) {
      this.rollProgress += dt / this.config.barrelRollDuration;
      const rollAngle = (this.rollDirection === 'left' ? 1 : -1) * Math.PI * 2 * this.rollProgress;
      this._euler.z += rollAngle;

      if (this.rollProgress >= 1.0) {
        this.isRolling = false;
        this.rollProgress = 0;
      }
    }

    this.rotation.setFromEuler(this._euler);

    // Velocity translation
    this._forward.set(0, 0, -1).applyQuaternion(this.rotation);
    this.velocity.copy(this._forward).multiplyScalar(this.currentSpeed);
    this.velocity.y += verticalLift * this.config.verticalSpeed;

    this.position.addScaledVector(this.velocity, dt);

    // Camera updates based on selected camera mode
    this.updateCamera();
  }

  private updateCamera(): void {
    const cam = this.engine.viewport?.camera;
    if (!cam) return;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.rotation);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rotation);

    switch (this.cameraMode) {
      case 'chase': {
        const offset = forward.clone().multiplyScalar(-9.0).add(up.clone().multiplyScalar(3.2));
        cam.position.copy(this.position).add(offset);
        cam.lookAt(this.position.clone().add(forward.clone().multiplyScalar(15.0)));
        break;
      }
      case 'rear': {
        const offset = forward.clone().multiplyScalar(8.0).add(up.clone().multiplyScalar(2.5));
        cam.position.copy(this.position).add(offset);
        cam.lookAt(this.position);
        break;
      }
      case 'cockpit': {
        const offset = forward.clone().multiplyScalar(0.8).add(up.clone().multiplyScalar(0.4));
        cam.position.copy(this.position).add(offset);
        cam.lookAt(this.position.clone().add(forward.clone().multiplyScalar(50.0)));
        break;
      }
      case 'cinematic': {
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.rotation);
        const offset = side.multiplyScalar(7.0).add(up.multiplyScalar(2.0)).sub(forward.clone().multiplyScalar(4.0));
        cam.position.copy(this.position).add(offset);
        cam.lookAt(this.position);
        break;
      }
    }
  }

  getState(): SpaceshipFlightState {
    return {
      isFlying: this.isFlying,
      speed: this.currentSpeed,
      velocity: this.velocity.clone(),
      position: this.position.clone(),
      rotation: this.rotation.clone(),
      isTurboActive: this.isTurbo,
      isBarrelRolling: this.isRolling,
      barrelRollProgress: this.rollProgress,
      barrelRollDirection: this.rollDirection,
      cameraMode: this.cameraMode,
    };
  }

  clear(): void {
    if (this.isFlying) this.endFlight();
  }

  dispose(): void {
    this.clear();
  }
}
