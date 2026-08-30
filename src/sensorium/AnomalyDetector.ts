import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { CollisionEvent } from '../physics/PhysicsWorld';
import type { PlaybackAnomaly } from './types';

/**
 * SENSORIUM — AnomalyDetector.
 *
 * Watches the possessed body each frame and flags the things a human would call out
 * as "that's a bug": getting stuck against geometry, falling through the floor,
 * frame hitches, high-impulse collisions, oscillation, and "I pressed forward and
 * nothing happened". Heuristics are deliberately conservative and every anomaly
 * carries a severity so the runner can gate `success` on the high-confidence ones
 * and let the vision model adjudicate the rest.
 *
 * Two correctness fixes over the original PLAYBACK detector:
 *  • Collisions are attributed to the possessed body for real, by mapping each
 *    contact's collider handle back to its rigid body (the old code flagged *every*
 *    fast collision because it never resolved ownership).
 *  • Teleport-jump detection ignores floating-origin shifts (a legitimate engine
 *    operation that moved every body by the same offset), which the old code
 *    mis-reported as a physics anomaly.
 */
export class AnomalyDetector {
  private anomalies: PlaybackAnomaly[] = [];
  private readonly lastWorld = new THREE.Vector3();
  private readonly _world = new THREE.Vector3();
  private lastWorldT = -1;
  private velHistory: { t: number; v: number }[] = [];
  private speedSignHistory: { t: number; sign: number }[] = [];
  private maxSpeed = 0;
  private lastSpeed = 0;
  private movementInputsIssued = 0;

  constructor(private readonly engine: Engine) {}

  reset(): void {
    this.anomalies = [];
    this.lastWorldT = -1;
    this.velHistory = [];
    this.speedSignHistory = [];
    this.maxSpeed = 0;
    this.lastSpeed = 0;
    this.movementInputsIssued = 0;
  }

  /** Tell the detector a movement input was issued (for the never-moved check). */
  noteMovementInput(): void { this.movementInputsIssued++; }

  /** Per-frame scan of the possessed body. `heldKeys` = number of keys currently held. */
  onFrame(elapsed: number, heldKeys: number): void {
    const pid = this.engine.player.getPossessedId();
    if (pid === null) { this.lastWorldT = -1; return; }
    const rb = this.engine.sceneManager.getRigidBody(pid);
    if (!rb) { this.lastWorldT = -1; return; }

    const pos = rb.mesh.position;
    // Velocity from WORLD-space position delta (linvel() is 0 for the kinematic
    // body the player possesses). World space is continuous across origin shifts.
    this.engine.worldOrigin.toWorldSpaceInto(this._world, pos);
    let vx = 0, vy = 0, vz = 0, speed = 0;
    let dpos = 0;
    if (this.lastWorldT >= 0) {
      const dtf = elapsed - this.lastWorldT;
      dpos = this._world.distanceTo(this.lastWorld);
      if (dtf > 1e-4) { vx = (this._world.x - this.lastWorld.x) / dtf; vy = (this._world.y - this.lastWorld.y) / dtf; vz = (this._world.z - this.lastWorld.z) / dtf; speed = Math.hypot(vx, vy, vz); }
    }
    const haveDelta = this.lastWorldT >= 0;
    this.lastWorld.copy(this._world);
    this.lastWorldT = elapsed;
    this.maxSpeed = Math.max(this.maxSpeed, speed);
    this.lastSpeed = speed;

    // Stuck: input held but mean speed near zero for > 1.5 s.
    if (heldKeys > 0) {
      this.velHistory.push({ t: elapsed, v: speed });
      this.velHistory = this.velHistory.filter((x) => elapsed - x.t < 1.5);
      if (this.velHistory.length > 12 && elapsed - this.velHistory[0].t >= 1.4) {
        const avg = this.velHistory.reduce((s, x) => s + x.v, 0) / this.velHistory.length;
        if (avg < 0.15) {
          this.push('stuck', elapsed, `input held but avg speed ${avg.toFixed(2)} m/s for >1.5s`, 'high');
          this.velHistory = [];
        }
      }
    } else {
      this.velHistory = [];
    }

    // Oscillation: horizontal travel direction flips rapidly while moving (controller fighting itself).
    const horiz = Math.hypot(vx, vz);
    if (horiz > 0.5) {
      const sign = Math.sign(Math.abs(vx) >= Math.abs(vz) ? vx : vz);
      this.speedSignHistory.push({ t: elapsed, sign });
      this.speedSignHistory = this.speedSignHistory.filter((x) => elapsed - x.t < 1.0);
      let flips = 0;
      for (let i = 1; i < this.speedSignHistory.length; i++) {
        if (this.speedSignHistory[i].sign !== this.speedSignHistory[i - 1].sign) flips++;
      }
      if (flips >= 8) {
        this.push('oscillation', elapsed, `velocity direction flipped ${flips}× in 1s`, 'medium');
        this.speedSignHistory = [];
      }
    }

    // Fall through floor.
    if (pos.y < -50) this.push('fall_through', elapsed, `y = ${pos.y.toFixed(1)}`, 'high');

    // Long stutter (single frame).
    if (this.engine.time.dt > 0.1) {
      this.push('low_fps', elapsed, `frame ${(this.engine.time.dt * 1000).toFixed(0)} ms`, 'medium', this.engine.time.dt);
    }

    // Teleport jump — a discontinuity in WORLD space (origin shifts don't show here
    // because world space already folds the offset back in).
    if (haveDelta && dpos > 40) {
      this.push('teleport_jump', elapsed, `Δpos = ${dpos.toFixed(1)} m in one frame`, 'medium');
    }
  }

  /** Contact event — attributed to the possessed body for real. */
  onCollision(e: CollisionEvent, elapsed: number): void {
    if (!e.started) return;
    const pid = this.engine.player.getPossessedId();
    if (pid === null) return;
    const prb = this.engine.sceneManager.getRigidBody(pid);
    if (!prb) return;
    const ph = prb.rapierBody.handle;
    const bodyA = this.engine.physicsWorld.rapierBodyFromColliderHandle(e.colliderA);
    const bodyB = this.engine.physicsWorld.rapierBodyFromColliderHandle(e.colliderB);
    if (bodyA?.handle !== ph && bodyB?.handle !== ph) return; // not the possessed body
    const speed = this.lastSpeed; // world-derived speed from the latest frame
    if (speed > 8) {
      this.push('physics_impulse', elapsed, `possessed body hit something at ${speed.toFixed(1)} m/s`,
        speed > 25 ? 'high' : 'low');
    }
  }

  /** End-of-run checks + dedup. `fps` lets us record one summary stutter anomaly. */
  finalize(longStutterMs: number): PlaybackAnomaly[] {
    if (this.movementInputsIssued >= 2 && this.maxSpeed < 0.3) {
      this.push('never_moved', 0,
        `${this.movementInputsIssued} movement inputs issued but the body never exceeded 0.3 m/s`, 'high');
    }
    if (longStutterMs > 500) {
      this.push('low_fps', 0, `longest stutter ${longStutterMs.toFixed(0)} ms`, 'medium', longStutterMs / 1000);
    }
    return this.dedupe();
  }

  /** Count of high-severity anomalies — the runner uses this to gate `success`. */
  static highCount(anoms: PlaybackAnomaly[]): number {
    return anoms.filter((a) => a.severity === 'high').length;
  }

  private push(kind: PlaybackAnomaly['kind'], t: number, detail: string, severity: PlaybackAnomaly['severity'], duration?: number): void {
    this.anomalies.push({ kind, t, detail, severity, duration });
  }

  private dedupe(): PlaybackAnomaly[] {
    const seen = new Set<string>();
    const out: PlaybackAnomaly[] = [];
    const order = { high: 0, medium: 1, low: 2 } as const;
    for (const a of [...this.anomalies].sort((x, y) => order[x.severity] - order[y.severity])) {
      const key = `${a.kind}:${a.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return out;
  }
}
