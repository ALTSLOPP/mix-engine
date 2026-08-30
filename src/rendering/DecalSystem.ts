import * as THREE from 'three';

export interface DecalSpawnOptions {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  size?: number | [number, number]; // width, height (default 0.3)
  color?: number | string;
  texture?: THREE.Texture;
  lifespan?: number; // seconds before removal (default 10.0)
  fadeDuration?: number; // seconds of fadeout (default 2.0)
}

export interface ActiveDecal {
  mesh: THREE.Mesh;
  lifespan: number;
  age: number;
  fadeDuration: number;
  initialOpacity: number;
}

export class DecalSystem {
  private readonly decals: ActiveDecal[] = [];
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawnDecal(options: DecalSpawnOptions): THREE.Mesh {
    const size = options.size ?? 0.3;
    const w = Array.isArray(size) ? size[0] : size;
    const h = Array.isArray(size) ? size[1] : size;

    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color: options.color ?? 0x222222,
      map: options.texture ?? null,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(options.position).addScaledVector(options.normal, 0.005); // slight bias off surface

    // Orient mesh Z-axis along normal
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), options.normal.clone().normalize());
    mesh.quaternion.copy(quat);

    this.scene.add(mesh);

    this.decals.push({
      mesh,
      lifespan: options.lifespan ?? 10.0,
      age: 0,
      fadeDuration: options.fadeDuration ?? 2.0,
      initialOpacity: 0.9,
    });

    return mesh;
  }

  update(dt: number): void {
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.age += dt;

      if (d.age >= d.lifespan) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.decals.splice(i, 1);
        continue;
      }

      // Handle fadeout
      const timeLeft = d.lifespan - d.age;
      if (timeLeft < d.fadeDuration && d.fadeDuration > 0) {
        const alpha = timeLeft / d.fadeDuration;
        (d.mesh.material as THREE.MeshBasicMaterial).opacity = d.initialOpacity * alpha;
      }
    }
  }

  clear(): void {
    for (const d of this.decals) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    this.decals.length = 0;
  }

  get activeCount(): number {
    return this.decals.length;
  }
}
