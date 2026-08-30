import * as THREE from 'three';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import { Path } from './Path';

/**
 * CinematicCamera.ts — a scripted camera sequence player.
 *
 * This is the engine's "cutscene director", designed to be driven entirely from the
 * IDE through the `cinematic` AI command. An author (or an AI in an IDE) writes a list
 * of shots in world space; the engine plays them back with smooth easing, look-at
 * tracking (entity or fixed point), FOV ramps, and dolly paths along a Catmull-Rom
 * spline. While a sequence is active it takes over the main camera and suppresses the
 * editor flycam + player camera, so an AI can author a full cinematic and the viewport
 * becomes a virtual film set.
 *
 * Coordinates are WORLD space (same contract as the rest of the AI bridge); each frame
 * we convert the computed world-space pose to engine space via worldOrigin so floating-
 * origin shifts during a take are transparent.
 */

export type EaseName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';

export interface CameraShot {
  /** Optional label for the take (surfaced in the HUD). */
  name?: string;
  /** Duration of the shot in seconds. */
  duration: number;
  /**
   * Shot kind:
   *  - 'cut'      : snap instantly to the pose (duration still elapses before the next shot)
   *  - 'dolly'    : travel along `path` from t=0→1
   *  - 'orbit'    : orbit `orbitTarget` at `orbitRadius`, sweeping `orbitAngleStart`→`orbitAngleEnd`
   *  - 'static'   : hold a fixed position + look target (use for establishing shots)
   *  - 'crane'    : dolly along `path` while ramping height via `craneHeightDelta`
   */
  kind: 'cut' | 'dolly' | 'orbit' | 'static' | 'crane';
  /** Position (world) for cut/static; ignored for dolly/orbit/crane (derived). */
  position?: [number, number, number];
  /** Path control points (world) for dolly/crane. */
  path?: [number, number, number][];
  /** Loop the dolly path (closed Catmull-Rom). */
  closed?: boolean;
  /** Orbit centre (world). */
  orbitTarget?: [number, number, number];
  /** Entity to track as orbit centre (overrides orbitTarget if the entity is alive). */
  orbitTargetEntity?: EntityId;
  orbitRadius?: number;
  orbitHeight?: number;
  orbitAngleStart?: number;
  orbitAngleEnd?: number;
  /** Entity to look at (overrides lookAt if alive). */
  lookAtEntity?: EntityId;
  /** Fixed look-at point (world). */
  lookAt?: [number, number, number];
  /** Camera height offset added to a dolly path's sampled Y (for crane moves). */
  craneHeightDelta?: number;
  /** Field of view at the start of the shot (degrees). */
  fovStart?: number;
  /** Field of view at the end of the shot (degrees) — ramps across the shot. */
  fovEnd?: number;
  /** Easing curve for the shot's parameter (dolly t, orbit angle, fov). */
  ease?: EaseName;
  /** Optional roll in radians applied to the camera (Dutch angle). */
  roll?: number;
}

export interface CinematicSequence {
  /** Optional sequence title shown in the HUD. */
  title?: string;
  shots: CameraShot[];
  /** Loop the whole sequence. */
  loop?: boolean;
}

type ShotRuntime = {
  shot: CameraShot;
  path?: Path;
  elapsed: number;
  done: boolean;
};

const EASE: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  hold: () => 0,
};

export interface CinematicCallbacks {
  onSequenceEnd?: () => void;
  onShotChange?: (index: number, shot: CameraShot) => void;
}

export class CinematicCamera {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly worldOrigin: WorldOrigin;
  private readonly sceneManager: SceneManager;
  private readonly _pos = new THREE.Vector3();
  private readonly _look = new THREE.Vector3();
  private readonly _eng = new THREE.Vector3();
  private readonly _tangent = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _q = new THREE.Quaternion();
  private readonly _m = new THREE.Matrix4();

  private sequence: CinematicSequence | null = null;
  private runtime: ShotRuntime[] = [];
  private index = 0;
  active = false;
  callbacks: CinematicCallbacks = {};

  /** Saved camera state to restore when a sequence ends. */
  private savedFov = 58;
  private savedPosition = new THREE.Vector3();
  private savedQuaternion = new THREE.Quaternion();

  constructor(camera: THREE.PerspectiveCamera, worldOrigin: WorldOrigin, sceneManager: SceneManager) {
    this.camera = camera;
    this.worldOrigin = worldOrigin;
    this.sceneManager = sceneManager;
  }

  play(seq: CinematicSequence): void {
    if (!seq.shots.length) return;
    this.sequence = seq;
    this.runtime = seq.shots.map((shot) => ({
      shot,
      path: shot.path && shot.path.length >= 2
        ? new Path(shot.path.map((p) => new THREE.Vector3(p[0], p[1], p[2])), shot.closed ?? false)
        : undefined,
      elapsed: 0,
      done: false,
    }));
    this.index = 0;
    this.active = true;
    this.savedFov = this.camera.fov;
    this.savedPosition.copy(this.camera.position);
    this.savedQuaternion.copy(this.camera.quaternion);
    this.callbacks.onShotChange?.(0, seq.shots[0]);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.sequence = null;
    this.runtime = [];
    // Restore the pre-sequence camera so the editor flycam resumes from a sane pose.
    this.camera.fov = this.savedFov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.savedPosition);
    this.camera.quaternion.copy(this.savedQuaternion);
    this.callbacks.onSequenceEnd?.();
  }

  get currentShot(): CameraShot | null {
    return this.active ? this.sequence?.shots[this.index] ?? null : null;
  }

  get progress(): number {
    if (!this.active || !this.sequence) return 0;
    return this.index / Math.max(1, this.sequence.shots.length);
  }

  /** Loop hook — advances the timeline and writes the camera pose. No-op when inactive. */
  update(dt: number): void {
    if (!this.active || !this.sequence) return;
    const rt = this.runtime[this.index];
    if (!rt) {
      this.handleEnd();
      return;
    }
    rt.elapsed += dt;
    const shot = rt.shot;
    const duration = Math.max(shot.duration, 1e-3);
    const rawT = THREE.MathUtils.clamp(rt.elapsed / duration, 0, 1);
    const easeName = shot.ease ?? 'easeInOut';
    const eased = (EASE[easeName] ?? EASE.easeInOut)(rawT);

    this.applyShot(shot, rt, eased);

    if (rt.elapsed >= duration) {
      rt.done = true;
      this.index++;
      if (this.index >= this.sequence.shots.length) {
        this.handleEnd();
        return;
      }
      this.callbacks.onShotChange?.(this.index, this.sequence.shots[this.index]);
    }
  }

  private handleEnd(): void {
    if (this.sequence?.loop) {
      // Reset every shot's elapsed and replay from the first.
      for (const rt of this.runtime) {
        rt.elapsed = 0;
        rt.done = false;
      }
      this.index = 0;
      this.callbacks.onShotChange?.(0, this.sequence.shots[0]);
      return;
    }
    this.stop();
  }

  private applyShot(shot: CameraShot, rt: ShotRuntime, eased: number): void {
    // Resolve the look-at target first — used by every shot kind.
    this.resolveLookAt(shot, this._look);

    switch (shot.kind) {
      case 'cut':
        this._pos.set(shot.position?.[0] ?? 0, shot.position?.[1] ?? 0, shot.position?.[2] ?? 0);
        break;
      case 'static':
        this._pos.set(shot.position?.[0] ?? 0, shot.position?.[1] ?? 0, shot.position?.[2] ?? 0);
        break;
      case 'dolly': {
        if (!rt.path) {
          this._pos.set(shot.position?.[0] ?? 0, shot.position?.[1] ?? 0, shot.position?.[2] ?? 0);
        } else {
          rt.path.sampleUniform(eased, this._pos);
        }
        break;
      }
      case 'crane': {
        if (!rt.path) {
          this._pos.set(shot.position?.[0] ?? 0, shot.position?.[1] ?? 0, shot.position?.[2] ?? 0);
        } else {
          rt.path.sampleUniform(eased, this._pos);
          this._pos.y += (shot.craneHeightDelta ?? 0) * eased;
        }
        break;
      }
      case 'orbit': {
        const target = this.resolveOrbitTarget(shot, this._look);
        const radius = shot.orbitRadius ?? 6;
        const height = shot.orbitHeight ?? 1.5;
        const a0 = shot.orbitAngleStart ?? 0;
        const a1 = shot.orbitAngleEnd ?? Math.PI * 2;
        const angle = THREE.MathUtils.lerp(a0, a1, eased);
        this._pos.set(
          target.x + Math.cos(angle) * radius,
          target.y + height,
          target.z + Math.sin(angle) * radius,
        );
        // Orbit uses its resolved centre as the look target.
        this._look.copy(target);
        break;
      }
    }

    // Convert world → engine, write the camera, look at the target.
    this.worldOrigin.toEngineSpaceInto(this._eng, this._pos);
    this.camera.position.copy(this._eng);

    // If the shot didn't provide a look target, fall back to the path tangent so a
    // dolly with no lookAt still aims along its direction of travel.
    if (!shot.lookAt && shot.lookAtEntity === undefined && shot.kind !== 'orbit') {
      if (rt.path) {
        rt.path.tangentUniform(eased, this._tangent);
        this._look.copy(this._pos).add(this._tangent);
      } else {
        this._look.copy(this._pos);
      }
    }
    this.worldOrigin.toEngineSpaceInto(this._eng, this._look);
    this.camera.lookAt(this._eng);

    // Optional Dutch-angle roll applied after lookAt.
    if (shot.roll) {
      this._q.setFromAxisAngle(this.camera.getWorldDirection(_rollDir).normalize(), shot.roll);
      this.camera.quaternion.multiply(this._q);
    }

    // FOV ramp across the shot.
    const fovStart = shot.fovStart ?? this.camera.fov;
    const fovEnd = shot.fovEnd ?? fovStart;
    const fov = THREE.MathUtils.lerp(fovStart, fovEnd, eased);
    if (Math.abs(fov - this.camera.fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private resolveLookAt(shot: CameraShot, out: THREE.Vector3): void {
    if (shot.lookAtEntity !== undefined) {
      const rb = this.sceneManager.getRigidBody(shot.lookAtEntity);
      if (rb) {
        this.worldOrigin.toWorldSpaceInto(out, rb.mesh.position);
        return;
      }
    }
    if (shot.lookAt) {
      out.set(shot.lookAt[0], shot.lookAt[1], shot.lookAt[2]);
      return;
    }
    out.set(0, 0, 0);
  }

  private resolveOrbitTarget(shot: CameraShot, out: THREE.Vector3): THREE.Vector3 {
    if (shot.orbitTargetEntity !== undefined) {
      const rb = this.sceneManager.getRigidBody(shot.orbitTargetEntity);
      if (rb) {
        this.worldOrigin.toWorldSpaceInto(out, rb.mesh.position);
        return out;
      }
    }
    if (shot.orbitTarget) {
      out.set(shot.orbitTarget[0], shot.orbitTarget[1], shot.orbitTarget[2]);
      return out;
    }
    return out.set(0, 0, 0);
  }
}

const _rollDir = new THREE.Vector3();
