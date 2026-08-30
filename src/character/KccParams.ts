export interface KccParams {
  maxWalkSpeed: number;
  maxRunSpeed: number;
  acceleration: number;
  airAcceleration: number;
  deceleration: number;
  airDeceleration: number;
  gravity: number;
  jumpHeight: number;
  apexThreshold: number;
  apexHangScale: number;
  jumpCutScale: number;
  terminalVelocity: number;
  coyoteTime: number;
  jumpBufferWindow: number;
  maxSlopeClimb: number;
  minSlopeSlide: number;
  slideAccel: number;
  stepUpHeight: number;
  stepDownDistance: number;
  crouchHeightRatio: number;
  dashSpeed: number;
  dashDuration: number;
  dashCooldown: number;
}

export const DEFAULT_KCC_PARAMS: KccParams = {
  maxWalkSpeed: 4.0,
  maxRunSpeed: 8.0,
  acceleration: 30.0,
  airAcceleration: 10.0,
  deceleration: 25.0,
  airDeceleration: 4.0,
  gravity: 24.0,
  jumpHeight: 1.8,
  apexThreshold: 1.5,
  apexHangScale: 0.55,
  jumpCutScale: 1.8,
  terminalVelocity: 35.0,
  coyoteTime: 0.12,
  jumpBufferWindow: 0.15,
  maxSlopeClimb: 50.0,
  minSlopeSlide: 35.0,
  slideAccel: 15.0,
  stepUpHeight: 0.35,
  stepDownDistance: 0.3,
  crouchHeightRatio: 0.5,
  dashSpeed: 22.0,
  dashDuration: 0.18,
  dashCooldown: 0.8,
};
