import * as THREE from 'three';

export type FlightDodgeDir = 'left' | 'right' | 'up' | 'down';
export type FlightState = 'inactive' | 'takeoff' | 'hover' | 'fast_move' | 'dodge' | 'landing';

export interface SuperheroFlightParams {
  enabled?: boolean;
  hoverSpeed: number;
  fastSpeed: number;
  boostSpeed: number;
  verticalSpeed: number;
  dodgeSpeed: number;
  dodgeDuration: number;
  acceleration: number;
  deceleration: number;
  turnSpeed: number;
  maxPitch: number;
  maxRoll: number;
  landingThresholdSpeed: number;
  landingFreezeDuration: number;
}

export const DEFAULT_FLIGHT_PARAMS: SuperheroFlightParams = {
  enabled: true,
  hoverSpeed: 8.0,
  fastSpeed: 22.0,
  boostSpeed: 38.0,
  verticalSpeed: 12.0,
  dodgeSpeed: 32.0,
  dodgeDuration: 0.32,
  acceleration: 28.0,
  deceleration: 32.0,
  turnSpeed: 10.0,
  maxPitch: Math.PI / 4, // 45 deg
  maxRoll: Math.PI / 3, // 60 deg
  landingThresholdSpeed: 14.0,
  landingFreezeDuration: 0.65,
};

export interface FlightIntent {
  moveX: number; // -1..1 (lateral)
  moveZ: number; // -1..1 (forward/backward)
  ascend: boolean; // vertical up (Space)
  descend: boolean; // vertical down (C / Ctrl)
  boost: boolean; // Shift
  dodgeDir?: FlightDodgeDir | null;
  landingSlam?: boolean;
}

export interface FlightTelemetry {
  isFlying: boolean;
  state: FlightState;
  velocity: THREE.Vector3;
  speed: number;
  pitch: number;
  roll: number;
  yaw: number;
  activeClip: string;
  isLandingLocked: boolean;
}

/**
 * Superhero 6-DOF Flight Motor for MIX Engine.
 * Implements full 3D flight locomotion, high-speed cruise banking,
 * 4-way aerial dodges, and superhero landings using Omen flight animations.
 */
export class SuperheroFlightMotor {
  readonly params: SuperheroFlightParams;
  state: FlightState = 'inactive';

  private isFlying = false;
  private currentVelocity = new THREE.Vector3();
  private targetVelocity = new THREE.Vector3();
  private pitch = 0;
  private roll = 0;
  private yaw = 0;

  // Dodge state
  private dodgeTimer = 0;
  private dodgeVector = new THREE.Vector3();
  private dodgeDir: FlightDodgeDir | null = null;

  // Landing lock timer (superhero landing pose freeze)
  private landingLockTimer = 0;
  private takeoffTimer = 0;

  constructor(params: Partial<SuperheroFlightParams> = {}) {
    this.params = { ...DEFAULT_FLIGHT_PARAMS, ...params };
  }

  getConfig(): Readonly<SuperheroFlightParams> {
    return {
      enabled: this.params.enabled ?? true,
      hoverSpeed: this.params.hoverSpeed,
      fastSpeed: this.params.fastSpeed,
      boostSpeed: this.params.boostSpeed,
      verticalSpeed: this.params.verticalSpeed,
      dodgeSpeed: this.params.dodgeSpeed,
      dodgeDuration: this.params.dodgeDuration,
      acceleration: this.params.acceleration,
      deceleration: this.params.deceleration,
      turnSpeed: this.params.turnSpeed,
      maxPitch: this.params.maxPitch,
      maxRoll: this.params.maxRoll,
      landingThresholdSpeed: this.params.landingThresholdSpeed,
      landingFreezeDuration: this.params.landingFreezeDuration,
    };
  }

  setConfig(patch: Partial<SuperheroFlightParams>): void {
    Object.assign(this.params, patch);
  }

  get isFlightActive(): boolean {
    return this.isFlying;
  }

  /**
   * Toggle or set flight mode on/off.
   */
  setFlying(active: boolean): void {
    if (this.isFlying === active) return;
    this.isFlying = active;
    if (active) {
      this.state = 'takeoff';
      this.takeoffTimer = 0.3;
      this.currentVelocity.y = Math.max(this.currentVelocity.y, 4.0);
    } else {
      this.state = 'inactive';
      this.dodgeTimer = 0;
    }
  }

  toggleFlight(): boolean {
    this.setFlying(!this.isFlying);
    return this.isFlying;
  }

  /**
   * Trigger a high-speed 4-way aerial dodge maneuver.
   */
  requestDodge(dir: FlightDodgeDir, cameraFacing?: THREE.Quaternion): boolean {
    if (!this.isFlying || this.dodgeTimer > 0) return false;

    this.dodgeDir = dir;
    this.dodgeTimer = this.params.dodgeDuration;
    this.state = 'dodge';

    const localDodge = new THREE.Vector3();
    switch (dir) {
      case 'left': localDodge.set(-1, 0, 0); break;
      case 'right': localDodge.set(1, 0, 0); break;
      case 'up': localDodge.set(0, 1, 0); break;
      case 'down': localDodge.set(0, -1, 0); break;
    }

    if (cameraFacing) {
      localDodge.applyQuaternion(cameraFacing);
    }
    this.dodgeVector.copy(localDodge).normalize().multiplyScalar(this.params.dodgeSpeed);
    this.currentVelocity.copy(this.dodgeVector);
    return true;
  }

  /**
   * Fixed-step update loop for flight physics and state transitions.
   */
  update(dt: number, intent: FlightIntent, cameraOrientation?: THREE.Quaternion): THREE.Vector3 {
    if (!this.isFlying) {
      if (this.landingLockTimer > 0) {
        this.landingLockTimer -= dt;
        if (this.landingLockTimer <= 0) {
          this.state = 'inactive';
        }
      }
      return this.currentVelocity.set(0, 0, 0);
    }

    // 1. Takeoff transition
    if (this.state === 'takeoff') {
      this.takeoffTimer -= dt;
      if (this.takeoffTimer <= 0) {
        this.state = 'hover';
      }
    }

    // 2. Active Dodge resolution
    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      if (this.dodgeTimer <= 0) {
        this.dodgeDir = null;
        this.state = intent.moveX !== 0 || intent.moveZ !== 0 ? 'fast_move' : 'hover';
      } else {
        // Maintain dodge impulse with slight decay
        return this.currentVelocity.copy(this.dodgeVector);
      }
    }

    // Check for dodge request in intent
    if (intent.dodgeDir) {
      this.requestDodge(intent.dodgeDir, cameraOrientation);
    }

    // 3. Compute desired 3D velocity from intent & camera orientation
    const moveInput = new THREE.Vector3(intent.moveX, 0, -intent.moveZ);
    const hasMoveInput = moveInput.lengthSq() > 0.01;
    if (hasMoveInput) {
      moveInput.normalize();
    }

    let targetMaxSpeed = this.params.hoverSpeed;
    if (intent.boost) {
      targetMaxSpeed = this.params.boostSpeed;
    } else if (hasMoveInput) {
      targetMaxSpeed = this.params.fastSpeed;
    }

    // Transform move input by camera orientation
    const worldMove = new THREE.Vector3().copy(moveInput);
    if (cameraOrientation) {
      worldMove.applyQuaternion(cameraOrientation);
    }

    // Vertical intent
    let verticalInput = 0;
    if (intent.ascend) verticalInput += 1;
    if (intent.descend) verticalInput -= 1;
    if (intent.landingSlam) verticalInput -= 3; // Rapid superhero dive slam

    this.targetVelocity.set(
      worldMove.x * targetMaxSpeed,
      (worldMove.y * targetMaxSpeed) + (verticalInput * this.params.verticalSpeed),
      worldMove.z * targetMaxSpeed,
    );

    // 4. Smooth velocity interpolation (acceleration / deceleration)
    const accelRate = this.targetVelocity.lengthSq() > this.currentVelocity.lengthSq()
      ? this.params.acceleration
      : this.params.deceleration;

    this.currentVelocity.x = THREE.MathUtils.damp(this.currentVelocity.x, this.targetVelocity.x, accelRate, dt);
    this.currentVelocity.y = THREE.MathUtils.damp(this.currentVelocity.y, this.targetVelocity.y, accelRate, dt);
    this.currentVelocity.z = THREE.MathUtils.damp(this.currentVelocity.z, this.targetVelocity.z, accelRate, dt);

    // 5. Update Bank/Pitch/Roll flight angles
    const speed = this.currentVelocity.length();
    if (speed > 1.0) {
      this.state = speed > this.params.hoverSpeed * 1.2 ? 'fast_move' : 'hover';
      // Pitch forward based on forward velocity
      const fwdSpeed = -worldMove.z * speed;
      this.pitch = THREE.MathUtils.damp(this.pitch, (fwdSpeed / this.params.boostSpeed) * this.params.maxPitch, 8, dt);
      // Roll based on lateral turn
      const latSpeed = worldMove.x * speed;
      this.roll = THREE.MathUtils.damp(this.roll, (-latSpeed / this.params.fastSpeed) * this.params.maxRoll, 8, dt);
    } else {
      this.state = 'hover';
      this.pitch = THREE.MathUtils.damp(this.pitch, 0, 8, dt);
      this.roll = THREE.MathUtils.damp(this.roll, 0, 8, dt);
    }

    return this.currentVelocity;
  }

  /**
   * Handle impact with ground while flying.
   * If speed is high or landing slam was active, triggers a Superhero Landing!
   */
  handleGroundImpact(verticalSpeed: number): { isSuperheroLanding: boolean; lockDuration: number } {
    const isHeavy = Math.abs(verticalSpeed) >= this.params.landingThresholdSpeed;
    this.isFlying = false;

    if (isHeavy) {
      this.state = 'landing';
      this.landingLockTimer = this.params.landingFreezeDuration;
      return { isSuperheroLanding: true, lockDuration: this.params.landingFreezeDuration };
    }

    this.state = 'inactive';
    return { isSuperheroLanding: false, lockDuration: 0 };
  }

  /**
   * Select the appropriate Omen flight animation clip based on current flight state & kinematics.
   */
  getSemanticClipName(): string {
    switch (this.state) {
      case 'landing':
        return 'A_SuperheroLanding_A';
      case 'takeoff':
        return 'A_Flight_Hover_Start_A';
      case 'dodge':
        if (this.dodgeDir === 'left') return 'A_Flight_Dodge_A_L';
        if (this.dodgeDir === 'right') return 'A_Flight_Dodge_A_R';
        if (this.dodgeDir === 'down') return 'A_Flight_Dodge_A_D';
        return 'A_Flight_Dodge_A_U';
      case 'fast_move':
        if (Math.abs(this.roll) > 0.2) {
          return this.roll > 0 ? 'A_FM_A_Lean_L' : 'A_FM_A_Lean_R';
        }
        return 'A_Flight_FastMove_A';
      case 'hover':
        if (this.currentVelocity.length() > 0.5) {
          return 'A_Flight_HoverMove_A';
        }
        return 'A_Flight_Idle_A';
      default:
        return 'Idle';
    }
  }

  getTelemetry(): FlightTelemetry {
    return {
      isFlying: this.isFlying,
      state: this.state,
      velocity: this.currentVelocity.clone(),
      speed: this.currentVelocity.length(),
      pitch: this.pitch,
      roll: this.roll,
      yaw: this.yaw,
      activeClip: this.getSemanticClipName(),
      isLandingLocked: this.landingLockTimer > 0,
    };
  }
}
