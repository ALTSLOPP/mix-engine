import * as THREE from 'three';

export interface FogVolume {
  id: string;
  position: THREE.Vector3;
  radius: number;
  density: number;
  color: THREE.Color;
  mesh?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
}

export interface VolumetricFogConfig {
  density?: number; // base density (default 0.015)
  heightFalloff?: number; // decay rate with altitude (default 0.1)
  groundLevel?: number; // Y level where fog is densest (default 0)
  color?: number | string;
  anisotropy?: number; // Henyey-Greenstein g factor [-1..1] (default 0.6 for forward scattering / godrays)
  maxDistance?: number;
}

export class VolumetricFogSystem {
  density: number;
  heightFalloff: number;
  groundLevel: number;
  color: THREE.Color;
  anisotropy: number;
  maxDistance: number;

  private readonly localVolumes = new Map<string, FogVolume>();

  constructor(
    config: VolumetricFogConfig = {},
    private readonly scene?: THREE.Scene,
    private readonly toEngineSpace?: (worldPosition: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3,
  ) {
    this.density = config.density ?? 0.015;
    this.heightFalloff = config.heightFalloff ?? 0.1;
    this.groundLevel = config.groundLevel ?? 0.0;
    this.color = new THREE.Color(config.color ?? 0xc8d6e5);
    this.anisotropy = config.anisotropy ?? 0.6;
    this.maxDistance = config.maxDistance ?? 200.0;
  }

  addFogVolume(volume: FogVolume): void {
    this.removeFogVolume(volume.id);
    if (this.scene) {
      const geometry = new THREE.SphereGeometry(volume.radius, 24, 16);
      const material = new THREE.MeshBasicMaterial({
        color: volume.color,
        transparent: true,
        opacity: THREE.MathUtils.clamp(volume.density * 1.5, 0.04, 0.45),
        depthWrite: false,
        side: THREE.BackSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `fog-volume:${volume.id}`;
      if (this.toEngineSpace) this.toEngineSpace(volume.position, mesh.position);
      else mesh.position.copy(volume.position);
      volume.mesh = mesh;
      this.scene.add(mesh);
    }
    this.localVolumes.set(volume.id, volume);
  }

  removeFogVolume(id: string): boolean {
    const volume = this.localVolumes.get(id);
    if (!volume) return false;
    volume.mesh?.removeFromParent();
    volume.mesh?.geometry.dispose();
    volume.mesh?.material.dispose();
    return this.localVolumes.delete(id);
  }

  sampleDensity(worldPos: THREE.Vector3): number {
    const h = Math.max(worldPos.y - this.groundLevel, 0);
    let d = this.density * Math.exp(-this.heightFalloff * h);

    // Add contributions from local fog volumes
    for (const v of this.localVolumes.values()) {
      const dist = worldPos.distanceTo(v.position);
      if (dist < v.radius) {
        const falloff = 1.0 - dist / v.radius;
        d += v.density * falloff * falloff;
      }
    }

    return d;
  }

  computePhaseFunction(cosTheta: number): number {
    const g = this.anisotropy;
    const denom = 1.0 + g * g - 2.0 * g * cosTheta;
    if (denom <= 0) return 0;
    return (1.0 - g * g) / (4.0 * Math.PI * Math.pow(denom, 1.5));
  }

  allVolumes(): FogVolume[] {
    return Array.from(this.localVolumes.values());
  }

  dispose(): void {
    for (const id of Array.from(this.localVolumes.keys())) this.removeFogVolume(id);
  }
}
