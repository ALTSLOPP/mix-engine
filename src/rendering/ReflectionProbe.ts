import * as THREE from 'three';

export interface ReflectionProbeConfig {
  resolution?: number; // default 256
  boxSize?: [number, number, number]; // box projection bounds in meters
  intensity?: number;
}

export class ReflectionProbe {
  readonly position = new THREE.Vector3();
  readonly boxMin = new THREE.Vector3();
  readonly boxMax = new THREE.Vector3();
  readonly boxSize = new THREE.Vector3();
  readonly renderTarget: THREE.WebGLCubeRenderTarget;
  readonly cubeCamera: THREE.CubeCamera;
  intensity: number;
  dirty = true;

  constructor(
    position: THREE.Vector3,
    config: ReflectionProbeConfig = {},
  ) {
    this.position.copy(position);
    const res = config.resolution ?? 256;
    const size = config.boxSize ?? [10, 10, 10];
    this.intensity = config.intensity ?? 1.0;

    this.boxSize.set(size[0], size[1], size[2]);
    this.updateBounds();

    this.renderTarget = new THREE.WebGLCubeRenderTarget(res, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    });

    this.cubeCamera = new THREE.CubeCamera(0.1, 100.0, this.renderTarget);
    this.cubeCamera.position.copy(this.position);
  }

  updateBounds(): void {
    const halfX = this.boxSize.x * 0.5;
    const halfY = this.boxSize.y * 0.5;
    const halfZ = this.boxSize.z * 0.5;

    this.boxMin.set(this.position.x - halfX, this.position.y - halfY, this.position.z - halfZ);
    this.boxMax.set(this.position.x + halfX, this.position.y + halfY, this.position.z + halfZ);
  }

  setPosition(pos: THREE.Vector3): void {
    this.position.copy(pos);
    this.cubeCamera.position.copy(pos);
    this.updateBounds();
    this.dirty = true;
  }

  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    this.cubeCamera.update(renderer, scene);
    this.dirty = false;
  }

  dispose(): void {
    this.renderTarget.dispose();
  }
}
