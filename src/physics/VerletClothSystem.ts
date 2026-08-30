import * as THREE from 'three';
import { VerletClothRope } from './VerletClothRope';

export interface ClothGridOptions {
  width: number;
  height: number;
  segsX: number;
  segsY: number;
  pinTop?: boolean;
}

export interface ClothInstance {
  id: string;
  simulation: VerletClothRope;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  segsX: number;
  segsY: number;
}

/** Engine-owned cloth registry that advances simulations and uploads particle positions. */
export class VerletClothSystem {
  private readonly instances = new Map<string, ClothInstance>();

  constructor(private readonly scene: THREE.Scene) {}

  createGrid(id: string, options: ClothGridOptions): ClothInstance {
    if (!id) throw new Error('Cloth id must not be empty');
    if (this.instances.has(id)) this.remove(id);

    const segsX = Math.max(1, Math.floor(options.segsX));
    const segsY = Math.max(1, Math.floor(options.segsY));
    const width = Math.max(0.001, options.width);
    const height = Math.max(0.001, options.height);
    const simulation = VerletClothRope.createClothGrid(
      width,
      height,
      segsX,
      segsY,
      options.pinTop ?? true,
    );

    const positions = new Float32Array(simulation.particles.length * 3);
    const indices: number[] = [];
    const row = segsX + 1;
    for (let y = 0; y < segsY; y++) {
      for (let x = 0; x < segsX; x++) {
        const a = y * row + x;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const material = new THREE.MeshStandardMaterial({
      color: 0xd8d8df,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `cloth:${id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const instance: ClothInstance = { id, simulation, mesh, segsX, segsY };
    this.instances.set(id, instance);
    this.scene.add(mesh);
    this.syncGeometry(instance);
    return instance;
  }

  get(id: string): ClothInstance | undefined {
    return this.instances.get(id);
  }

  remove(id: string): boolean {
    const instance = this.instances.get(id);
    if (!instance) return false;
    instance.mesh.removeFromParent();
    instance.mesh.geometry.dispose();
    instance.mesh.material.dispose();
    this.instances.delete(id);
    return true;
  }

  fixedStep(dt: number): void {
    for (const instance of this.instances.values()) {
      instance.simulation.step(dt, 4);
      this.syncGeometry(instance);
    }
  }

  list(): Array<{ id: string; particleCount: number; constraintCount: number }> {
    return Array.from(this.instances.values(), (instance) => ({
      id: instance.id,
      particleCount: instance.simulation.particles.length,
      constraintCount: instance.simulation.constraints.length,
    }));
  }

  dispose(): void {
    for (const id of Array.from(this.instances.keys())) this.remove(id);
  }

  private syncGeometry(instance: ClothInstance): void {
    const attr = instance.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < instance.simulation.particles.length; i++) {
      const p = instance.simulation.particles[i].pos;
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
    instance.mesh.geometry.computeVertexNormals();
    instance.mesh.geometry.computeBoundingSphere();
  }
}
