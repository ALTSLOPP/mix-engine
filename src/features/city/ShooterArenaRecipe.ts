import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import { createDefaultArenaMetadata, type GameplayMapMetadata } from '../gameplay/GameplayMapMetadata';

export class ShooterArenaRecipe {
  private readonly rootGroup = new THREE.Group();

  constructor(private readonly engine: Engine) {
    this.rootGroup.name = 'ShooterArenaWorld';
  }

  buildArena(metadata: GameplayMapMetadata = createDefaultArenaMetadata()): void {
    this.clear();

    const scene = this.engine.viewport?.scene;
    if (scene) scene.add(this.rootGroup);

    const coverSystem = this.engine.gameplayFeatures?.cover;

    // 1. Arena Floor
    const floorGeo = new THREE.PlaneGeometry(70, 70);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.8 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.rootGroup.add(floorMesh);

    // 2. Perimeter Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.6 });
    const wallDefs = [
      { name: 'Wall_North', pos: [0, 2.5, -35], size: [70, 5, 1] },
      { name: 'Wall_South', pos: [0, 2.5, 35], size: [70, 5, 1] },
      { name: 'Wall_West', pos: [-35, 2.5, 0], size: [1, 5, 70] },
      { name: 'Wall_East', pos: [35, 2.5, 0], size: [1, 5, 70] },
    ];

    for (const w of wallDefs) {
      const geo = new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.name = w.name;
      mesh.position.set(w.pos[0], w.pos[1], w.pos[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.rootGroup.add(mesh);
    }

    // 3. Cover Obstacles
    const coverBoxMat = new THREE.MeshStandardMaterial({ color: 0x4a5260, roughness: 0.5 });
    for (const cp of metadata.coverPoints) {
      const height = cp.type === 'high' ? 2.2 : 1.1;
      const width = cp.width ?? 3.0;
      const geo = new THREE.BoxGeometry(width, height, 0.8);
      const mesh = new THREE.Mesh(geo, coverBoxMat);
      mesh.name = `Cover_${cp.id}`;
      mesh.position.set(cp.position.x, height * 0.5, cp.position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.rootGroup.add(mesh);

      // Register into Cover System
      if (coverSystem) {
        coverSystem.registerCoverNode({
          id: cp.id,
          position: cp.position.clone(),
          normal: cp.normal.clone(),
          type: cp.type,
          reservedBy: null,
        });
      }
    }

    // 4. Flag Bases
    const heaterFlagMat = new THREE.MeshStandardMaterial({ color: 0xf04e39, emissive: 0x330a00 });
    const rollerFlagMat = new THREE.MeshStandardMaterial({ color: 0x2f6dff, emissive: 0x001033 });

    for (const fb of metadata.flagBases) {
      const geo = new THREE.CylinderGeometry(1.5, 1.8, 0.3, 16);
      const mat = fb.team === 'heaters' ? heaterFlagMat : rollerFlagMat;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `FlagBase_${fb.team}`;
      mesh.position.set(fb.position.x, 0.15, fb.position.z);
      mesh.receiveShadow = true;
      this.rootGroup.add(mesh);
    }
  }

  clear(): void {
    this.rootGroup.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
    this.engine.gameplayFeatures?.cover?.clearCoverNodes();
  }

  getRoot(): THREE.Group {
    return this.rootGroup;
  }
}
