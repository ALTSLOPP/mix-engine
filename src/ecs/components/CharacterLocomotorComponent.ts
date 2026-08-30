import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import { CharacterLocomotor } from '../../character/CharacterLocomotor';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

/**
 * CharacterLocomotor component exposing kinematic character physics parameters.
 */
export class CharacterLocomotorComponent extends Component {
  static override readonly type = 'characterLocomotor';

  @expose({ type: 'number', min: 0.5, max: 20, doc: 'Maximum walking speed (m/s)', default: 4.0 })
  walkSpeed = 4.0;

  @expose({ type: 'number', min: 1.0, max: 30, doc: 'Maximum running speed (m/s)', default: 8.0 })
  runSpeed = 8.0;

  @expose({ type: 'number', min: 0.1, max: 10, doc: 'Jump height (metres)', default: 1.5 })
  jumpHeight = 1.5;

  @expose({ type: 'number', min: 0, max: 0.5, step: 0.01, doc: 'Coyote time forgiveness window (seconds)', default: 0.12 })
  coyoteTime = 0.12;

  @expose({ type: 'number', min: 10, max: 80, doc: 'Maximum climbable slope angle (degrees)', default: 50.0 })
  maxSlopeClimb = 50.0;

  @expose({ type: 'number', min: 0.05, max: 1.0, doc: 'Maximum step-up obstacle height (metres)', default: 0.35 })
  stepUpHeight = 0.35;

  @expose({ type: 'number', min: 0.05, max: 1.0, doc: 'Maximum snap-to-ground step-down distance (metres)', default: 0.3 })
  stepDownDistance = 0.3;

  /** Per-entity controller. AI/gameplay may write `controller.intent` directly. */
  controller: CharacterLocomotor | null = null;

  override onAwake(): void {
    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (rb) this.controller = new CharacterLocomotor(this.ctx.physicsWorld, rb);
    this.syncParams();
  }

  override onUpdate(_dt: number): void {
    this.syncParams();
  }

  override onFixedUpdate(dt: number): void {
    this.controller?.fixedStep(dt);
  }

  override onDestroy(): void {
    this.controller?.dispose();
    this.controller = null;
  }

  private syncParams(): void {
    this.controller?.setParams({
      maxWalkSpeed: this.walkSpeed,
      maxRunSpeed: this.runSpeed,
      jumpHeight: this.jumpHeight,
      coyoteTime: this.coyoteTime,
      maxSlopeClimb: this.maxSlopeClimb,
      stepUpHeight: this.stepUpHeight,
      stepDownDistance: this.stepDownDistance,
    });
  }
}
