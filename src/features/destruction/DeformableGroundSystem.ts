import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';

export interface CraterParams {
  radius: number;
  depth: number;
  lipHeight?: number;
  maxDepth?: number;
}

export interface DeformableGroundConfig {
  enabled: boolean;
  maxDepth: number;
  defaultRadius: number;
  defaultDepth: number;
  defaultLipHeight: number;
  normalRecalcThreshold: number;
}

export interface CraterRecord {
  id: number;
  position: THREE.Vector3;
  radius: number;
  depth: number;
  timestamp: number;
}

export class DeformableGroundSystem {
  private config: DeformableGroundConfig;
  private readonly registeredMeshes = new Set<THREE.Mesh>();
  private readonly originalVertices = new Map<THREE.Mesh, Float32Array>();
  private readonly craters: CraterRecord[] = [];
  private nextCraterId = 1;

  constructor(
    private readonly engine: Engine,
    config: Partial<DeformableGroundConfig> = {}
  ) {
    this.config = {
      enabled: true,
      maxDepth: 6.0,
      defaultRadius: 3.5,
      defaultDepth: 1.2,
      defaultLipHeight: 0.35,
      normalRecalcThreshold: 0.1,
      ...config,
    };
  }

  getConfig(): Readonly<DeformableGroundConfig> {
    return { ...this.config };
  }

  setConfig(patch: Partial<DeformableGroundConfig>): void {
    Object.assign(this.config, patch);
  }

  /**
   * Registers a ground or terrain mesh to receive real-time vertex depressions.
   */
  registerGroundMesh(mesh: THREE.Mesh): void {
    if (this.registeredMeshes.has(mesh) || !mesh.geometry) return;
    this.registeredMeshes.add(mesh);

    const posAttr = mesh.geometry.getAttribute('position');
    if (posAttr) {
      this.originalVertices.set(mesh, new Float32Array(posAttr.array));
    }
  }

  unregisterGroundMesh(mesh: THREE.Mesh): void {
    this.registeredMeshes.delete(mesh);
    this.originalVertices.delete(mesh);
  }

  /**
   * Indents ground meshes at a world-space impact point with a bowl depression and outer raised rim.
   */
  createCrater(
    impactWorld: THREE.Vector3,
    params: Partial<CraterParams> = {}
  ): CraterRecord | null {
    if (!this.config.enabled) return null;

    const radius = params.radius ?? this.config.defaultRadius;
    const depth = params.depth ?? this.config.defaultDepth;
    const lipHeight = params.lipHeight ?? this.config.defaultLipHeight;
    const maxDepth = params.maxDepth ?? this.config.maxDepth;

    let modifiedAny = false;

    for (const mesh of this.registeredMeshes) {
      if (!mesh.geometry) continue;

      const posAttr = mesh.geometry.getAttribute('position');
      const normAttr = mesh.geometry.getAttribute('normal');
      if (!posAttr) continue;

      mesh.updateMatrixWorld(true);
      const invMat = mesh.matrixWorld.clone().invert();
      const localCenter = impactWorld.clone().applyMatrix4(invMat);

      const positions = posAttr.array as Float32Array;
      const normals = normAttr ? (normAttr.array as Float32Array) : null;
      const count = posAttr.count;

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const vx = positions[idx];
        const vy = positions[idx + 1];
        const vz = positions[idx + 2];

        // Skip underside / non-upward-facing vertices
        if (normals) {
          const ny = normals[idx + 1];
          if (ny < 0.25) continue;
        }

        const dx = vx - localCenter.x;
        const dz = vz - localCenter.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          const u = dist / radius;

          // Parabolic depression in the inner bowl (0 <= u < 0.75)
          const bowl = u < 0.75 ? -depth * Math.pow(1.0 - Math.pow(u / 0.75, 2), 2) : 0;

          // Raised rim lip in the outer ring (0.6 <= u <= 1.0)
          let lip = 0;
          if (u >= 0.6 && u <= 1.0) {
            const lipU = (u - 0.6) / 0.4;
            lip = lipHeight * 4.0 * lipU * (1.0 - lipU);
          }

          const deltaY = bowl + lip;
          const origArray = this.originalVertices.get(mesh);
          const origY = origArray ? origArray[idx + 1] : vy;

          // Clamp depth to avoid punching through finite mesh skirts
          const newY = Math.max(origY - maxDepth, vy + deltaY);
          positions[idx + 1] = newY;
          modifiedAny = true;
        }
      }

      if (modifiedAny) {
        posAttr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
      }
    }

    const record: CraterRecord = {
      id: this.nextCraterId++,
      position: impactWorld.clone(),
      radius,
      depth,
      timestamp: Date.now(),
    };
    this.craters.push(record);

    this.engine.sceneManager.events.emit('ground_crater_formed', {
      ...record,
    });

    return record;
  }

  /**
   * Resets all ground mesh vertices back to their pristine un-dented state.
   */
  resetAllGround(): void {
    for (const [mesh, orig] of this.originalVertices) {
      const posAttr = mesh.geometry?.getAttribute('position');
      if (posAttr) {
        (posAttr.array as Float32Array).set(orig);
        posAttr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
      }
    }
    this.craters.length = 0;
  }

  getCraters(): ReadonlyArray<CraterRecord> {
    return this.craters;
  }

  dispose(): void {
    this.resetAllGround();
    this.registeredMeshes.clear();
    this.originalVertices.clear();
  }
}
