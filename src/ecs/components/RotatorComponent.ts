import * as THREE from 'three';
import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

/**
 * Procedural continuous rotation component.
 */
export class RotatorComponent extends Component {
  static override readonly type = 'rotator';

  @expose({ type: 'number', min: -360, max: 360, doc: 'Angular speed in degrees per second', default: 90 })
  speed = 90;

  @expose({ type: 'vector3', doc: 'Rotation axis unit vector', default: [0, 1, 0] })
  axis: [number, number, number] = [0, 1, 0];

  @expose({ type: 'bool', doc: 'Run in fixed update for deterministic physics', default: false })
  useFixedUpdate = false;

  private readonly _axis = new THREE.Vector3();
  private readonly _deltaQuat = new THREE.Quaternion();

  override onUpdate(dt: number): void {
    if (this.useFixedUpdate) return;
    this.applyRotation(dt);
  }

  override onFixedUpdate(fixedDt: number): void {
    if (!this.useFixedUpdate) return;
    this.applyRotation(fixedDt);
  }

  private applyRotation(dt: number): void {
    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (!rb) return;

    this._axis.set(this.axis[0], this.axis[1], this.axis[2]).normalize();
    const rad = THREE.MathUtils.degToRad(this.speed * dt);
    this._deltaQuat.setFromAxisAngle(this._axis, rad);

    const currentQuat = rb.mesh.quaternion;
    currentQuat.multiply(this._deltaQuat);
    rb.teleport(rb.mesh.position, currentQuat);
  }
}
