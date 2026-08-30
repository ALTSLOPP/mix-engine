import * as THREE from 'three';
import { Component } from '../Component';
import { expose } from '../../inspector/SchemaDecorators';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

/**
 * Camera component allowing an entity to act as a scene viewpoint.
 */
export class CameraComponent extends Component {
  static override readonly type = 'camera';

  @expose({ type: 'number', min: 10, max: 150, doc: 'Field of view in degrees (perspective only)', default: 60 })
  fov = 60;

  @expose({ type: 'number', min: 0.01, max: 10, doc: 'Near clipping plane distance', default: 0.1 })
  near = 0.1;

  @expose({ type: 'number', min: 10, max: 10000, doc: 'Far clipping plane distance', default: 1000 })
  far = 1000;

  @expose({ type: 'bool', doc: 'Whether this is the primary active camera', default: false })
  isMain = false;

  @expose({ type: 'bool', doc: 'Use orthographic projection instead of perspective', default: false })
  orthographic = false;

  @expose({ type: 'number', min: 1, max: 100, doc: 'Orthographic vertical view half-size', default: 10 })
  orthoSize = 10;

  private cameraObject: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;

  override onAwake(): void {
    this.rebuildCamera();
  }

  override onDestroy(): void {
    if (this.cameraObject && this.cameraObject.parent) {
      this.cameraObject.parent.remove(this.cameraObject);
    }
    this.cameraObject = null;
  }

  override onUpdate(_dt: number): void {
    if (!this.cameraObject) {
      this.rebuildCamera();
      return;
    }

    // Toggling `orthographic` has to swap the camera object; without this the
    // inspector checkbox silently did nothing until a scene reload.
    if ((this.cameraObject instanceof THREE.OrthographicCamera) !== this.orthographic) {
      this.rebuildCamera();
      return;
    }

    if (this.cameraObject instanceof THREE.PerspectiveCamera) {
      if (this.cameraObject.fov !== this.fov || this.cameraObject.near !== this.near || this.cameraObject.far !== this.far) {
        this.cameraObject.fov = this.fov;
        this.cameraObject.near = this.near;
        this.cameraObject.far = this.far;
        this.cameraObject.updateProjectionMatrix();
      }
    } else if (this.cameraObject instanceof THREE.OrthographicCamera) {
      const aspect = (window.innerWidth || 1920) / (window.innerHeight || 1080);
      const top = this.orthoSize;
      const bottom = -this.orthoSize;
      const left = -this.orthoSize * aspect;
      const right = this.orthoSize * aspect;

      // `right` is compared too: without it a window resize changed the aspect but
      // never reached the camera, so ortho views stayed stretched.
      if (
        this.cameraObject.top !== top ||
        this.cameraObject.right !== right ||
        this.cameraObject.near !== this.near ||
        this.cameraObject.far !== this.far
      ) {
        this.cameraObject.top = top;
        this.cameraObject.bottom = bottom;
        this.cameraObject.left = left;
        this.cameraObject.right = right;
        this.cameraObject.near = this.near;
        this.cameraObject.far = this.far;
        this.cameraObject.updateProjectionMatrix();
      }
    }
  }

  getCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera | null {
    return this.cameraObject;
  }

  private rebuildCamera(): void {
    const rb = this.ctx.sceneManager.getComponent<RigidBodyComponent>(this.entity, 'rigidBody');
    if (!rb || !rb.mesh) return;

    if (this.cameraObject && this.cameraObject.parent) {
      this.cameraObject.parent.remove(this.cameraObject);
    }

    const aspect = (window.innerWidth || 1920) / (window.innerHeight || 1080);
    if (this.orthographic) {
      const top = this.orthoSize;
      const bottom = -this.orthoSize;
      const left = -this.orthoSize * aspect;
      const right = this.orthoSize * aspect;
      this.cameraObject = new THREE.OrthographicCamera(left, right, top, bottom, this.near, this.far);
    } else {
      this.cameraObject = new THREE.PerspectiveCamera(this.fov, aspect, this.near, this.far);
    }

    rb.mesh.add(this.cameraObject);
  }
}
