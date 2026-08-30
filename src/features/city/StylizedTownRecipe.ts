import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import { ContentModelInstance } from '../../content/ContentModelInstance';

export interface StylizedTownConfig {
  seed: number;
  townName: string;
  size: number; // width/depth in meters (e.g. 100)
  plazaRadius: number;
  houseCount: number;
  treeCount: number;
  rockCount: number;
}

export const DEFAULT_TOWN_CONFIG: StylizedTownConfig = {
  seed: 42,
  townName: 'Aosa Town',
  size: 120,
  plazaRadius: 18,
  houseCount: 6,
  treeCount: 16,
  rockCount: 8,
};

export class StylizedTownRecipe {
  private readonly rootGroup = new THREE.Group();
  private contentModels: ContentModelInstance[] = [];

  constructor(private readonly engine: Engine) {
    this.rootGroup.name = 'StylizedTownWorld';
  }

  generateTown(config: StylizedTownConfig = DEFAULT_TOWN_CONFIG): void {
    this.clear();

    const scene = this.engine.viewport?.scene;
    if (scene) scene.add(this.rootGroup);

    const coverSystem = this.engine.gameplayFeatures?.cover;
    const manifest = this.engine.manifest;
    const cache = this.engine.assetCache;

    // Deterministic PRNG
    let seed = config.seed;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // 1. Terrain / Town Ground Base
    const groundGeo = new THREE.PlaneGeometry(config.size, config.size);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c59, roughness: 0.85 }); // Anime grass green
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.name = 'Town_Ground';
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    this.rootGroup.add(groundMesh);

    // 2. Central Stone Plaza
    const plazaGeo = new THREE.CylinderGeometry(config.plazaRadius, config.plazaRadius, 0.1, 24);
    const plazaMat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.7 });
    const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
    plazaMesh.name = 'Town_Plaza';
    plazaMesh.position.set(0, 0.05, 0);
    plazaMesh.receiveShadow = true;
    this.rootGroup.add(plazaMesh);

    // 3. Roads connecting from center
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x706c64, roughness: 0.8 });
    const roadDefs = [
      { name: 'Road_North', pos: [0, 0.06, -config.size * 0.25], size: [8, 0.1, config.size * 0.5] },
      { name: 'Road_South', pos: [0, 0.06, config.size * 0.25], size: [8, 0.1, config.size * 0.5] },
      { name: 'Road_East', pos: [config.size * 0.25, 0.06, 0], size: [config.size * 0.5, 0.1, 8] },
      { name: 'Road_West', pos: [-config.size * 0.25, 0.06, 0], size: [config.size * 0.5, 0.1, 8] },
    ];

    for (const r of roadDefs) {
      const geo = new THREE.BoxGeometry(r.size[0], r.size[1], r.size[2]);
      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.name = r.name;
      mesh.position.set(r.pos[0], r.pos[1], r.pos[2]);
      mesh.receiveShadow = true;
      this.rootGroup.add(mesh);
    }

    // 4. House Placements
    const houseModels = ['crest_house_route_starter', 'crest_house_sakura_family', 'crest_house_balcony_blue'];
    const housePositions = [
      { pos: [-22, 0, -22], yaw: Math.PI * 0.25 },
      { pos: [22, 0, -22], yaw: -Math.PI * 0.25 },
      { pos: [-24, 0, 24], yaw: Math.PI * 0.75 },
      { pos: [24, 0, 24], yaw: -Math.PI * 0.75 },
      { pos: [-36, 0, 0], yaw: Math.PI * 0.5 },
      { pos: [36, 0, 0], yaw: -Math.PI * 0.5 },
    ];

    for (let i = 0; i < Math.min(config.houseCount, housePositions.length); i++) {
      const hp = housePositions[i];
      const modelId = houseModels[i % houseModels.length];

      // Placeholder bounding volume for collision/mesh
      const geo = new THREE.BoxGeometry(12, 8, 12);
      const mat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `House_${i + 1}`;
      mesh.position.set(hp.pos[0], 4.0, hp.pos[1]);
      mesh.rotation.y = hp.yaw;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.rootGroup.add(mesh);

      // Try checkout from manifest if loaded
      if (manifest && cache && scene) {
        const instance = new ContentModelInstance(manifest, cache, modelId, 16.0);
        instance.root.position.set(hp.pos[0], 0, hp.pos[1]);
        instance.root.rotation.y = hp.yaw;
        this.rootGroup.add(instance.root);
        this.contentModels.push(instance);
      }

      // Add cover point in front of house yard
      if (coverSystem) {
        const coverNormal = new THREE.Vector3(Math.sin(hp.yaw), 0, Math.cos(hp.yaw));
        const coverPos = new THREE.Vector3(hp.pos[0], 0, hp.pos[1]).addScaledVector(coverNormal, 7.0);
        coverSystem.registerCoverNode({
          id: `house_cover_${i}`,
          position: coverPos,
          normal: coverNormal,
          type: 'low',
          reservedBy: null,
        });
      }
    }

    // 5. Nature Trees & Foliage Scatter
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    const treeLeavesMat = new THREE.MeshStandardMaterial({ color: 0x2e8540 });

    for (let i = 0; i < config.treeCount; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = config.plazaRadius + 6 + rand() * (config.size * 0.45 - config.plazaRadius);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Avoid placing right in the middle of roads
      if (Math.abs(x) < 5 || Math.abs(z) < 5) continue;

      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
      const trunkMesh = new THREE.Mesh(trunkGeo, treeTrunkMat);
      trunkMesh.position.set(x, 1.5, z);
      trunkMesh.castShadow = true;

      const leavesGeo = new THREE.ConeGeometry(2.2, 5, 8);
      const leavesMesh = new THREE.Mesh(leavesGeo, treeLeavesMat);
      leavesMesh.position.set(x, 4.5, z);
      leavesMesh.castShadow = true;

      const treeGroup = new THREE.Group();
      treeGroup.name = `Tree_${i + 1}`;
      treeGroup.add(trunkMesh);
      treeGroup.add(leavesMesh);
      this.rootGroup.add(treeGroup);
    }

    // 6. Ghibli Style Rock Clusters
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.8 });
    for (let i = 0; i < config.rockCount; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = config.plazaRadius + 4 + rand() * 25;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const rockScale = 1.2 + rand() * 1.5;
      const rockGeo = new THREE.DodecahedronGeometry(rockScale);
      const rockMesh = new THREE.Mesh(rockGeo, rockMat);
      rockMesh.name = `Rock_${i + 1}`;
      rockMesh.position.set(x, rockScale * 0.7, z);
      rockMesh.rotation.set(rand() * 0.4, rand() * Math.PI, rand() * 0.4);
      rockMesh.castShadow = true;
      rockMesh.receiveShadow = true;
      this.rootGroup.add(rockMesh);

      // Register high cover at rock
      if (coverSystem && rockScale > 1.8) {
        coverSystem.registerCoverNode({
          id: `rock_cover_${i}`,
          position: new THREE.Vector3(x, 0, z),
          normal: new THREE.Vector3(-x, 0, -z).normalize(),
          type: 'high',
          reservedBy: null,
        });
      }
    }
  }

  clear(): void {
    this.rootGroup.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);

    for (const model of this.contentModels) {
      model.dispose();
    }
    this.contentModels.length = 0;
    this.engine.gameplayFeatures?.cover?.clearCoverNodes();
  }

  getRoot(): THREE.Group {
    return this.rootGroup;
  }
}
