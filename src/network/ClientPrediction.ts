import * as THREE from 'three';
import { PredictionBuffer, type PredictionRecord } from './PredictionBuffer';

export interface PlayerInputCmd {
  forward: number;  // -1 (backward) to +1 (forward)
  right: number;    // -1 (left) to +1 (right)
  jump?: boolean;
  sprint?: boolean;
  yaw: number;      // camera yaw in radians
}

export interface PlayerPredictedState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  onGround: boolean;
}

export interface ServerAuthoritativeState {
  tick: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  onGround: boolean;
}

export type KinematicSimulator = (
  currentState: PlayerPredictedState,
  input: PlayerInputCmd,
  dt: number,
) => PlayerPredictedState;

/**
 * ClientPrediction.ts — Tick-based client-side prediction, authoritative server reconciliation,
 * and visual error decay smoothing.
 */
export class ClientPrediction {
  private currentTick = 0;
  private state: PlayerPredictedState;
  private readonly buffer: PredictionBuffer<PlayerInputCmd, PlayerPredictedState>;
  private readonly simulator: KinematicSimulator;

  /** Visual error offset vector applied to smooth out server snap corrections over time. */
  private readonly visualError = new THREE.Vector3(0, 0, 0);
  private readonly errorDecayRate = 0.85; // Error multiplier per frame (~100ms decay)

  constructor(
    initialState?: PlayerPredictedState,
    customSimulator?: KinematicSimulator,
    maxBufferSize = 128,
  ) {
    this.state = initialState
      ? {
          position: initialState.position.clone(),
          velocity: initialState.velocity.clone(),
          onGround: initialState.onGround,
        }
      : {
          position: new THREE.Vector3(0, 0, 0),
          velocity: new THREE.Vector3(0, 0, 0),
          onGround: true,
        };

    this.buffer = new PredictionBuffer<PlayerInputCmd, PlayerPredictedState>(maxBufferSize);
    this.simulator = customSimulator ?? this.defaultSimulator;
  }

  get currentState(): PlayerPredictedState {
    return this.state;
  }

  get clientTick(): number {
    return this.currentTick;
  }

  /**
   * Run local prediction for the current frame input, advancing client tick.
   */
  predict(input: PlayerInputCmd, dt = 0.016): PlayerPredictedState {
    this.currentTick++;
    this.state = this.simulator(this.state, input, dt);

    this.buffer.add({
      tick: this.currentTick,
      input,
      state: {
        position: this.state.position.clone(),
        velocity: this.state.velocity.clone(),
        onGround: this.state.onGround,
      },
      dt,
    });

    return this.state;
  }

  /**
   * Validate predicted history against authoritative server snapshot.
   * If discrepancy exceeds drift tolerance, roll back and resimulate all unacknowledged ticks.
   */
  reconcile(serverAck: ServerAuthoritativeState, driftTolerance = 0.05): boolean {
    const historicalRecord = this.buffer.get(serverAck.tick);
    if (!historicalRecord) {
      // Server tick is too old or not found
      return false;
    }

    const driftDistance = historicalRecord.state.position.distanceTo(serverAck.position);
    this.buffer.discardOlderThan(serverAck.tick);

    if (driftDistance <= driftTolerance) {
      // In sync within tolerance — no rollback needed
      return false;
    }

    // --- RECONCILIATION ROLLBACK ---
    // 1. Calculate visual error between client predicted position and authoritative server position
    this.visualError.subVectors(historicalRecord.state.position, serverAck.position);

    // 2. Snap to authoritative server state
    let resimState: PlayerPredictedState = {
      position: serverAck.position.clone(),
      velocity: serverAck.velocity.clone(),
      onGround: serverAck.onGround,
    };

    // 3. Fast-forward replay of all subsequent unacknowledged inputs
    const unacknowledgedRecords = this.buffer.getAllFrom(serverAck.tick + 1);
    for (const record of unacknowledgedRecords) {
      resimState = this.simulator(resimState, record.input, record.dt);
      record.state = {
        position: resimState.position.clone(),
        velocity: resimState.velocity.clone(),
        onGround: resimState.onGround,
      };
    }

    // 4. Update current active state to re-simulated state
    this.state = resimState;
    return true;
  }

  /**
   * Get smoothed visual rendering position with exponential error decay.
   */
  getRenderPosition(dt?: number): THREE.Vector3 {
    // Decaying by a fixed factor per *call* meant the smoothing ran at whatever rate
    // callers happened to poll at, and any second caller in the same frame decayed it
    // twice. Pass dt for a frame-rate independent decay; omit it for a pure read.
    if (dt !== undefined && dt > 0) {
      this.visualError.multiplyScalar(Math.pow(this.errorDecayRate, dt / (1 / 60)));
      if (this.visualError.lengthSq() < 1e-6) {
        this.visualError.set(0, 0, 0);
      }
    }

    return this.state.position.clone().add(this.visualError);
  }

  /**
   * Default kinematic character locomotion step simulator.
   */
  private defaultSimulator(
    currentState: PlayerPredictedState,
    input: PlayerInputCmd,
    dt: number,
  ): PlayerPredictedState {
    const moveSpeed = input.sprint ? 8.0 : 4.5;
    const accel = 30.0;
    const gravity = -19.6;

    // Movement vector in camera-relative space
    const moveDir = new THREE.Vector3(input.right, 0, -input.forward);
    if (moveDir.lengthSq() > 1e-4) {
      moveDir.normalize();
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), input.yaw);
    }

    const targetVelX = moveDir.x * moveSpeed;
    const targetVelZ = moveDir.z * moveSpeed;

    const newVel = currentState.velocity.clone();
    newVel.x = THREE.MathUtils.damp(newVel.x, targetVelX, accel, dt);
    newVel.z = THREE.MathUtils.damp(newVel.z, targetVelZ, accel, dt);

    // Jump / Gravity
    if (currentState.onGround) {
      if (input.jump) {
        newVel.y = 7.0; // Jump impulse
        currentState.onGround = false;
      } else {
        newVel.y = 0;
      }
    } else {
      newVel.y += gravity * dt;
    }

    const newPos = currentState.position.clone().addScaledVector(newVel, dt);

    // Simple floor clamp at y = 0
    let onGround = currentState.onGround;
    if (newPos.y <= 0) {
      newPos.y = 0;
      newVel.y = 0;
      onGround = true;
    }

    return {
      position: newPos,
      velocity: newVel,
      onGround,
    };
  }
}
