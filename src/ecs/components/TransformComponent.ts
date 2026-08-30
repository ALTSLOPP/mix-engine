import * as THREE from 'three';
import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

/** Serializable local transform with explicit dirty/version tracking. */
export class TransformComponent extends Component {
  static override readonly type = 'transform';

  @expose({ type: 'vector3', doc: 'Logical local position', default: [0, 0, 0] })
  localPosition: [number, number, number] = [0, 0, 0];

  @expose({ type: 'vector3', doc: 'Logical local Euler rotation in degrees', default: [0, 0, 0] })
  localRotation: [number, number, number] = [0, 0, 0];

  @expose({ type: 'vector3', doc: 'Local visual scale', default: [1, 1, 1] })
  localScale: [number, number, number] = [1, 1, 1];

  @expose({ type: 'bool', doc: 'Initialize fields from the existing entity pose', default: true })
  syncOnAwake = true;

  localDirty = true;
  worldDirty = true;
  version = 0;
  private signature = '';
  private readonly quaternion = new THREE.Quaternion();

  override onAwake(): void {
    if (this.syncOnAwake) this.readFromEntity();
    this.markDirty();
  }

  override onUpdate(): void {
    const next = `${this.localPosition.join(',')}|${this.localRotation.join(',')}|${this.localScale.join(',')}`;
    if (next !== this.signature) this.markDirty();
    if (this.localDirty) this.applyLocal();
  }

  markDirty(): void {
    this.localDirty = true;
    this.worldDirty = true;
    this.version++;
  }

  readFromEntity(): void {
    const local = this.ctx.sceneManager.getLocalTransform(this.entity);
    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (!local || !rb) return;
    const euler = new THREE.Euler().setFromQuaternion(local.quaternion, 'YXZ');
    this.localPosition = local.position.toArray() as [number, number, number];
    this.localRotation = [THREE.MathUtils.radToDeg(euler.x), THREE.MathUtils.radToDeg(euler.y), THREE.MathUtils.radToDeg(euler.z)];
    this.localScale = rb.mesh.scale.toArray() as [number, number, number];
    this.signature = `${this.localPosition.join(',')}|${this.localRotation.join(',')}|${this.localScale.join(',')}`;
  }

  private applyLocal(): void {
    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (!rb) return;
    const position = new THREE.Vector3(...this.localPosition);
    this.quaternion.setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(this.localRotation[0]),
      THREE.MathUtils.degToRad(this.localRotation[1]),
      THREE.MathUtils.degToRad(this.localRotation[2]),
      'YXZ',
    ));
    this.ctx.sceneManager.setLocalTransform(this.entity, position, this.quaternion);
    rb.mesh.scale.set(...this.localScale);
    rb.rescaleCollider();
    this.signature = `${this.localPosition.join(',')}|${this.localRotation.join(',')}|${this.localScale.join(',')}`;
    this.localDirty = false;
    this.worldDirty = false;
  }
}
