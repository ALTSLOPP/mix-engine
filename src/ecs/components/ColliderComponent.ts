import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

export type ColliderShapeType = 'box' | 'sphere' | 'capsule' | 'cylinder';

/**
 * Collider component configuring physics collision geometry and trigger properties.
 */
export class ColliderComponent extends Component {
  static override readonly type = 'collider';

  @expose({
    type: 'enum',
    options: ['box', 'sphere', 'capsule', 'cylinder'],
    doc: 'Geometry shape of the collider',
    default: 'box',
  })
  shape: ColliderShapeType = 'box';

  @expose({ type: 'vector3', doc: 'Box dimensions [x, y, z] in metres', default: [1, 1, 1] })
  size: [number, number, number] = [1, 1, 1];

  @expose({ type: 'number', min: 0.01, max: 50, doc: 'Radius for sphere, capsule, or cylinder', default: 0.5 })
  radius = 0.5;

  @expose({ type: 'number', min: 0.01, max: 50, doc: 'Half height for capsule or cylinder', default: 0.5 })
  halfHeight = 0.5;

  @expose({ type: 'bool', doc: 'Pass-through trigger sensor (no solid collision)', default: false })
  isTrigger = false;

  @expose({ type: 'number', min: 0, max: 2, step: 0.05, doc: 'Surface friction coefficient', default: 0.5 })
  friction = 0.5;

  @expose({ type: 'number', min: 0, max: 1, step: 0.05, doc: 'Restitution / bounciness coefficient', default: 0.0 })
  restitution = 0.0;

  @expose({ type: 'string', doc: 'Collision layer identifier', default: 'Default' })
  layer = 'Default';

  private appliedSignature = '';

  override onAwake(): void {
    this.syncPhysicsCollider();
  }

  /** Re-push inspector edits to Rapier. These fields were previously read once at
   *  onAwake, so changing friction/restitution/isTrigger at runtime did nothing. */
  override onUpdate(_dt: number): void {
    const sig = `${this.shape}|${this.size.join(',')}|${this.radius}|${this.halfHeight}|${this.layer}|${this.isTrigger}|${this.friction}|${this.restitution}`;
    if (sig === this.appliedSignature) return;
    this.appliedSignature = sig;
    this.syncPhysicsCollider();
  }

  private syncPhysicsCollider(): void {
    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (!rb) return;

    try {
      const body = rb.rapierBody;
      if (!body) return;

      // Geometry and collision groups are immutable descriptor state in Rapier, so a
      // component edit must rebuild the attached collider rather than merely changing
      // friction on whichever collider happened to be at index zero.
      while (body.numColliders() > 0) {
        this.ctx.physicsWorld.removeCollider(body.collider(0));
      }

      const pw = this.ctx.physicsWorld;
      const radius = Math.max(0.01, this.radius);
      const halfHeight = Math.max(0.01, this.halfHeight);
      let collider;
      switch (this.shape) {
        case 'sphere':
          collider = pw.createSphereCollider(body, radius, true, this.isTrigger, this.layer);
          break;
        case 'capsule':
          collider = pw.createCapsuleCollider(body, halfHeight, radius, true, this.isTrigger, this.layer);
          break;
        case 'cylinder':
          collider = pw.createCylinderCollider(body, halfHeight, radius, true, this.isTrigger, this.layer);
          break;
        case 'box':
        default:
          collider = pw.createBoxCollider(
            body,
            Math.max(0.005, this.size[0] * 0.5),
            Math.max(0.005, this.size[1] * 0.5),
            Math.max(0.005, this.size[2] * 0.5),
            true,
            this.isTrigger,
            this.layer,
          );
          break;
      }
      collider.setFriction(this.friction);
      collider.setRestitution(this.restitution);
      this.appliedSignature = `${this.shape}|${this.size.join(',')}|${this.radius}|${this.halfHeight}|${this.layer}|${this.isTrigger}|${this.friction}|${this.restitution}`;
    } catch {
      // Body not yet created or disposed
    }
  }
}
