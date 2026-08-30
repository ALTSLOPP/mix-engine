import * as THREE from 'three';
import type { InputManager } from '../engine/InputManager';

const RMB = 2;
const LOOK_SENSITIVITY = 0.0025; // rad per pixel
const MIN_SPEED = 2;
const MAX_SPEED = 2000;

/**
 * EditorCamera.ts — 6DOF flycam (Unreal/Unity convention).
 *
 * Hold RMB → pointer lock → WASD fly + mouse look; Q/E down/up; wheel adjusts speed.
 * Movement is scaled by Time.dt. Reads ONLY the InputManager. `enabled` is set false
 * during a gizmo drag, and pointer-lock requests are suppressed while the gizmo drags
 * (enforced by the InputManager guard).
 */
export class EditorCamera {
  enabled = true;
  private yaw: number;
  private pitch: number;
  private speed = 18;

  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly move = new THREE.Vector3();
  private readonly UP = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
  ) {
    // Seed yaw/pitch from the camera's initial orientation.
    this.euler.setFromQuaternion(camera.quaternion);
    this.yaw = this.euler.y;
    this.pitch = this.euler.x;
  }

  /** Live engine-space position (no alloc). */
  enginePosition(): THREE.Vector3 {
    return this.camera.position;
  }

  /**
   * Re-derive the flycam's yaw/pitch from the camera's CURRENT orientation. Call this after
   * any code repositions the camera directly (lookAt / frame / focus / reset) so the next
   * RMB-look continues smoothly instead of snapping back to stale angles.
   */
  syncToCamera(): void {
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = this.euler.y;
    this.pitch = this.euler.x;
  }

  update(dt: number): void {
    if (!this.enabled) return;

    const looking = this.input.isMouseButtonDown(RMB);
    if (looking) {
      this.input.requestPointerLock(); // guarded — refused while the gizmo drags.
      const d = this.input.getMouseDelta();
      if (d.x !== 0 || d.y !== 0) {
        this.yaw -= d.x * LOOK_SENSITIVITY;
        this.pitch -= d.y * LOOK_SENSITIVITY;
        const limit = THREE.MathUtils.degToRad(89);
        this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit);
      }
      this.applyRotation();

      const wheel = this.input.getWheelDelta();
      if (wheel !== 0) {
        this.speed = THREE.MathUtils.clamp(
          this.speed * (wheel < 0 ? 1.1 : 1 / 1.1),
          MIN_SPEED,
          MAX_SPEED,
        );
      }

      this.applyMovement(dt);
    } else if (this.input.isPointerLocked) {
      this.input.exitPointerLock();
    }
  }

  private applyRotation(): void {
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);
  }

  private applyMovement(dt: number): void {
    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);

    this.move.set(0, 0, 0);
    if (this.input.isKeyDown('KeyW')) this.move.add(this.forward);
    if (this.input.isKeyDown('KeyS')) this.move.sub(this.forward);
    if (this.input.isKeyDown('KeyD')) this.move.add(this.right);
    if (this.input.isKeyDown('KeyA')) this.move.sub(this.right);
    if (this.input.isKeyDown('KeyE')) this.move.add(this.UP);
    if (this.input.isKeyDown('KeyQ')) this.move.sub(this.UP);

    if (this.move.lengthSq() > 0) {
      this.move.normalize().multiplyScalar(this.speed * dt);
      this.camera.position.add(this.move);
    }
  }
}
