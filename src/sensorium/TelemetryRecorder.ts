import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { EntityId } from '../ecs/SceneManager';
import type { FeelIntent } from './types';

/**
 * SENSORIUM — TelemetryRecorder.
 *
 * Subscribes to the engine and writes a per-frame snapshot of the test-relevant state
 * into an in-memory buffer. The SensoriumRunner serialises the buffer at the end of a
 * run and POSTs it alongside the video, and the FeelAnalyzer reads it to compute the
 * FeelProfile (the "felt experience"). The video is the source of truth for visuals;
 * telemetry is the source of truth for kinesthetics.
 *
 * Recording is captured from the engine's UPDATE hook (frame-coherent with physics),
 * not a parallel rAF loop. Each snapshot carries a real wall-clock `t` and the derived
 * `speed`/`headingDeg` so the analyzer doesn't have to re-derive coordinate frames.
 */
export interface TelemetrySnapshot {
  t: number;
  fps: number;
  dt: number;
  cameraPos: [number, number, number];
  cameraYaw: number;
  cameraPitch: number;
  possessedId: number | null;
  possessedPos?: [number, number, number];
  possessedVel?: [number, number, number];
  possessedRot?: [number, number, number, number];
  /** |linvel| in m/s — translation-invariant, so floating-origin shifts don't taint it. */
  speed: number;
  /** Facing yaw in degrees, derived from the possessed body's quaternion. */
  headingDeg: number;
  collisionsThisFrame: number;
  consoleErrorsThisFrame: number;
}

export interface TelemetryEvent {
  kind: 'collision' | 'log' | 'state' | 'input' | 'vfx' | 'sound' | 'marker' | 'custom';
  t: number;
  text?: string;
  a?: number;
  b?: number;
  /** Kinesthetic intent for input/marker events (drives the FeelAnalyzer windows). */
  intent?: FeelIntent;
  extra?: Record<string, unknown>;
}

const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _yAxisRef = new THREE.Vector3(0, 0, -1);
const _world = new THREE.Vector3();

export class TelemetryRecorder {
  private _snapshots: TelemetrySnapshot[] = [];
  private _events: TelemetryEvent[] = [];
  private startedAt = 0;
  private endedAt = 0;
  private collisionUnsubscribe: (() => void) | null = null;
  private hookUnsubscribe: (() => void) | null = null;
  private origLog = console.log;
  private origWarn = console.warn;
  private origError = console.error;
  private consoleWrapped = false;
  private collisionsThisFrame = 0;
  private errorsThisFrame = 0;
  // Previous WORLD-space position of the possessed body, for deriving speed.
  private readonly prevWorld = new THREE.Vector3();
  private prevWorldT = -1;
  private prevPid: EntityId | null = null;

  constructor(private readonly engine: Engine) {}

  /** Public, read-only views (the runner + analyzer read these live during a run). */
  get snapshots(): readonly TelemetrySnapshot[] { return this._snapshots; }
  get events(): readonly TelemetryEvent[] { return this._events; }

  /** Begin recording. Subscribes to the engine's collision + update hooks. */
  start(): void {
    this._snapshots = [];
    this._events = [];
    this.startedAt = performance.now();
    this.collisionsThisFrame = 0;
    this.errorsThisFrame = 0;
    this.prevWorldT = -1;
    this.prevPid = null;

    this.collisionUnsubscribe = this.engine.onCollision((e) => {
      this._events.push({ kind: 'collision', t: this.now(), a: e.colliderA, b: e.colliderB });
      this.collisionsThisFrame++;
    });

    // Wrap console so warnings/errors are captured into the events stream. Guard against
    // double-wrapping (a previous run that failed to stop cleanly).
    if (!this.consoleWrapped) {
      this.origLog = console.log;
      this.origWarn = console.warn;
      this.origError = console.error;
      console.warn = (...args: unknown[]) => {
        this.origWarn(...args);
        this._events.push({ kind: 'log', t: this.now(), text: args.map(stringify).join(' '), extra: { level: 'warn' } });
      };
      console.error = (...args: unknown[]) => {
        this.origError(...args);
        this._events.push({ kind: 'log', t: this.now(), text: args.map(stringify).join(' '), extra: { level: 'error' } });
        this.errorsThisFrame++;
      };
      this.consoleWrapped = true;
    }

    this.hookUnsubscribe = this.engine.addUpdateHook(() => {
      this.captureFrame();
      this.collisionsThisFrame = 0;
      this.errorsThisFrame = 0;
    });
  }

  /** Stop recording, restore console wrappers, return the assembled log. */
  stop(): {
    durationMs: number;
    snapshots: readonly TelemetrySnapshot[];
    events: readonly TelemetryEvent[];
    serializeJsonl: () => string;
  } {
    this.endedAt = performance.now();
    this.hookUnsubscribe?.();
    this.hookUnsubscribe = null;
    this.collisionUnsubscribe?.();
    this.collisionUnsubscribe = null;
    if (this.consoleWrapped) {
      console.warn = this.origWarn;
      console.error = this.origError;
      this.consoleWrapped = false;
    }
    return {
      durationMs: this.endedAt - this.startedAt,
      snapshots: this._snapshots,
      events: this._events,
      serializeJsonl: () => this.serialize(),
    };
  }

  /** Manually record a custom event. `t` is auto-stamped if omitted. */
  recordEvent(ev: Omit<TelemetryEvent, 't'> & { t?: number }): void {
    this._events.push({ ...ev, t: ev.t ?? this.now() });
  }

  recordState(label: string, extra?: Record<string, unknown>): void {
    this._events.push({ kind: 'state', t: this.now(), text: label, extra });
  }

  /** Seconds since this recorder started. */
  now(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  possessedId(): EntityId | null {
    return this.engine.player.getPossessedId();
  }

  private captureFrame(): void {
    const cam = this.engine.viewport.camera;
    const pid = this.possessedId();
    const t = this.now();
    let speed = 0;
    let headingDeg = 0;
    let possessedPos: [number, number, number] | undefined;
    let possessedVel: [number, number, number] | undefined;
    let possessedRot: [number, number, number, number] | undefined;
    if (pid !== null) {
      const rb = this.engine.sceneManager.getRigidBody(pid);
      if (rb) {
        const m = rb.mesh;
        possessedPos = [m.position.x, m.position.y, m.position.z];
        const q = m.quaternion;
        possessedRot = [q.x, q.y, q.z, q.w];
        // Facing yaw from the mesh quaternion (forward = -Z).
        _fwd.copy(_yAxisRef).applyQuaternion(_q.set(q.x, q.y, q.z, q.w));
        headingDeg = THREE.MathUtils.radToDeg(Math.atan2(_fwd.x, _fwd.z));
        // Velocity from WORLD-space position delta. Rapier's linvel() is 0 for the
        // KinematicPositionBased body the PlayerController possesses, so reading it
        // would report a stationary character even while it visibly moves. World
        // space is continuous across floating-origin shifts, so the delta is clean.
        this.engine.worldOrigin.toWorldSpaceInto(_world, m.position);
        if (this.prevPid === pid && this.prevWorldT >= 0) {
          const dtf = t - this.prevWorldT;
          if (dtf > 1e-4) {
            const vx = (_world.x - this.prevWorld.x) / dtf;
            const vy = (_world.y - this.prevWorld.y) / dtf;
            const vz = (_world.z - this.prevWorld.z) / dtf;
            possessedVel = [vx, vy, vz];
            speed = Math.hypot(vx, vy, vz);
          }
        }
        this.prevWorld.copy(_world);
        this.prevWorldT = t;
        this.prevPid = pid;
      }
    } else {
      this.prevPid = null;
    }
    this._snapshots.push({
      t,
      fps: 1 / Math.max(this.engine.time.dt, 1e-4),
      dt: this.engine.time.dt,
      cameraPos: [cam.position.x, cam.position.y, cam.position.z],
      cameraYaw: this.engine.player.getCameraYaw(),
      cameraPitch: this.engine.player.getCameraPitch(),
      possessedId: pid,
      possessedPos,
      possessedVel,
      possessedRot,
      speed,
      headingDeg,
      collisionsThisFrame: this.collisionsThisFrame,
      consoleErrorsThisFrame: this.errorsThisFrame,
    });
  }

  private serialize(): string {
    const lines: string[] = [];
    for (const s of this._snapshots) lines.push(JSON.stringify({ k: 'f', ...s }));
    for (const e of this._events) lines.push(JSON.stringify({ k: 'e', ...e }));
    return lines.join('\n');
  }
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
