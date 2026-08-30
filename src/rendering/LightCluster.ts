import * as THREE from 'three';

export interface LightClusterConfig {
  slicesX?: number; // default 16
  slicesY?: number; // default 9
  slicesZ?: number; // default 24
  maxLightsPerCluster?: number; // default 32
  near?: number;
  far?: number;
}

export interface ClusterPointLight {
  id: number;
  position: THREE.Vector3; // view space
  radius: number;
  color: THREE.Color;
  intensity: number;
}

export class LightCluster {
  readonly slicesX: number;
  readonly slicesY: number;
  readonly slicesZ: number;
  readonly maxLightsPerCluster: number;
  readonly totalClusters: number;

  // Grid buffer: for each cluster, list of light IDs
  readonly clusterLightIndices: Uint16Array;
  readonly clusterLightCounts: Uint16Array;

  private readonly _viewPos = new THREE.Vector3();

  constructor(config: LightClusterConfig = {}) {
    this.slicesX = config.slicesX ?? 16;
    this.slicesY = config.slicesY ?? 9;
    this.slicesZ = config.slicesZ ?? 24;
    this.maxLightsPerCluster = config.maxLightsPerCluster ?? 32;
    this.totalClusters = this.slicesX * this.slicesY * this.slicesZ;

    this.clusterLightIndices = new Uint16Array(this.totalClusters * this.maxLightsPerCluster);
    this.clusterLightCounts = new Uint16Array(this.totalClusters);
  }

  getClusterIndex(x: number, y: number, z: number): number {
    return x + y * this.slicesX + z * this.slicesX * this.slicesY;
  }

  build(
    lights: Array<{ position: THREE.Vector3; radius: number }>,
    camera: THREE.PerspectiveCamera,
  ): void {
    this.clusterLightCounts.fill(0);

    const viewMatrix = camera.matrixWorldInverse;
    const near = Math.max(camera.near, 0.01);
    const far = Math.max(camera.far, near + 1.0);
    const logFarNear = Math.max(Math.log(far / near), 1e-4);

    for (let lIdx = 0; lIdx < lights.length; lIdx++) {
      const light = lights[lIdx];
      this._viewPos.copy(light.position).applyMatrix4(viewMatrix);

      const zDepth = -this._viewPos.z;
      if (zDepth + light.radius < near || zDepth - light.radius > far) {
        continue;
      }

      // Logarithmic depth slicing
      const minZ = Math.max(zDepth - light.radius, near);
      const maxZ = Math.min(zDepth + light.radius, far);

      const sliceZMin = THREE.MathUtils.clamp(
        Math.floor((Math.log(minZ / near) / logFarNear) * this.slicesZ),
        0,
        this.slicesZ - 1,
      );
      const sliceZMax = THREE.MathUtils.clamp(
        Math.floor((Math.log(maxZ / near) / logFarNear) * this.slicesZ),
        0,
        this.slicesZ - 1,
      );

      // Frustum extents at view distance
      const halfFovRad = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const tanHalfFov = Math.tan(halfFovRad);

      for (let z = sliceZMin; z <= sliceZMax; z++) {
        // Approximate tile boundaries
        const midZ = near * Math.exp(((z + 0.5) / this.slicesZ) * logFarNear);
        const halfHeight = midZ * tanHalfFov;
        const halfWidth = halfHeight * camera.aspect;

        const minX = Math.floor(((this._viewPos.x - light.radius + halfWidth) / (2 * halfWidth)) * this.slicesX);
        const maxX = Math.floor(((this._viewPos.x + light.radius + halfWidth) / (2 * halfWidth)) * this.slicesX);
        const minY = Math.floor(((this._viewPos.y - light.radius + halfHeight) / (2 * halfHeight)) * this.slicesY);
        const maxY = Math.floor(((this._viewPos.y + light.radius + halfHeight) / (2 * halfHeight)) * this.slicesY);

        const clMinX = THREE.MathUtils.clamp(minX, 0, this.slicesX - 1);
        const clMaxX = THREE.MathUtils.clamp(maxX, 0, this.slicesX - 1);
        const clMinY = THREE.MathUtils.clamp(minY, 0, this.slicesY - 1);
        const clMaxY = THREE.MathUtils.clamp(maxY, 0, this.slicesY - 1);

        for (let y = clMinY; y <= clMaxY; y++) {
          for (let x = clMinX; x <= clMaxX; x++) {
            const clusterIdx = this.getClusterIndex(x, y, z);
            const count = this.clusterLightCounts[clusterIdx];
            if (count < this.maxLightsPerCluster) {
              this.clusterLightIndices[clusterIdx * this.maxLightsPerCluster + count] = lIdx;
              this.clusterLightCounts[clusterIdx] = count + 1;
            }
          }
        }
      }
    }
  }
}
