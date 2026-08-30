import type { KccParams } from './KccParams';

export type LocomotionState = 'idle' | 'walk' | 'run' | 'air' | 'slide' | 'dash' | 'crouch';

/**
 * Vertical kinematics and jumping / dashing / coyote state machine for KCC.
 * Integrated with explicit fixed-dt substeps.
 */
export class KccDynamics {
  verticalVelocity = 0;
  grounded = false;
  airborneTime = 0;
  jumpBufferTimer = 0;
  jumpHeld = false;

  // Dashing
  isDashing = false;
  dashTimer = 0;
  dashCooldownTimer = 0;
  dashDir = { x: 0, z: 0 };

  // Crouching
  isCrouching = false;

  // Slope sliding state
  isSliding = false;

  update(fixedDt: number, params: KccParams, wasGrounded: boolean): void {
    this.grounded = wasGrounded;

    if (this.grounded) {
      this.airborneTime = 0;
      if (this.verticalVelocity < 0) {
        this.verticalVelocity = 0;
      }
    } else {
      this.airborneTime += fixedDt;
    }

    // Cooldown updates
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= fixedDt;
    }
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer -= fixedDt;
    }

    // Dash duration update
    if (this.isDashing) {
      this.dashTimer -= fixedDt;
      if (this.dashTimer <= 0) {
        this.isDashing = false;
      }
    }

    // Check buffered jump on landing
    if (this.grounded && this.jumpBufferTimer > 0) {
      this.performJump(params);
      this.jumpBufferTimer = 0;
    }

    // Integrate vertical gravity
    if (!this.grounded && !this.isDashing) {
      let gravityScale = 1.0;
      if (Math.abs(this.verticalVelocity) < params.apexThreshold && this.jumpHeld) {
        gravityScale = params.apexHangScale;
      } else if (this.verticalVelocity > 0 && !this.jumpHeld) {
        gravityScale = params.jumpCutScale;
      }

      this.verticalVelocity -= params.gravity * gravityScale * fixedDt;
      if (this.verticalVelocity < -params.terminalVelocity) {
        this.verticalVelocity = -params.terminalVelocity;
      }
    }
  }

  /**
   * Request a jump action (uses coyote time and jump buffering).
   */
  requestJump(params: KccParams, forced = false): boolean {
    if (forced) {
      this.performJump(params);
      return true;
    }

    // Can jump if grounded or within coyote time
    if (this.grounded || this.airborneTime <= params.coyoteTime) {
      this.performJump(params);
      return true;
    }

    // Otherwise buffer the jump for landing
    this.jumpBufferTimer = params.jumpBufferWindow;
    return false;
  }

  private performJump(params: KccParams): void {
    this.verticalVelocity = Math.sqrt(2 * params.gravity * params.jumpHeight);
    this.grounded = false;
    this.airborneTime = params.coyoteTime + 0.01; // consume coyote time
  }

  requestDash(dir: { x: number; z: number }, params: KccParams): boolean {
    if (this.dashCooldownTimer > 0 || this.isDashing) return false;

    const len = Math.hypot(dir.x, dir.z);
    if (len < 1e-4) return false;

    this.isDashing = true;
    this.dashTimer = params.dashDuration;
    this.dashCooldownTimer = params.dashCooldown;
    this.dashDir.x = dir.x / len;
    this.dashDir.z = dir.z / len;
    return true;
  }

  setJumpHeld(held: boolean): void {
    this.jumpHeld = held;
  }

  setCrouch(crouch: boolean): void {
    this.isCrouching = crouch;
  }

  getState(horizontalSpeed: number): LocomotionState {
    if (this.isDashing) return 'dash';
    if (!this.grounded) return 'air';
    if (this.isSliding) return 'slide';
    if (this.isCrouching) return 'crouch';
    if (horizontalSpeed > 4.5) return 'run';
    if (horizontalSpeed > 0.1) return 'walk';
    return 'idle';
  }
}
