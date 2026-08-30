import * as THREE from 'three';
import { mergeCityGeometries } from './mergeCityGeometries';
import { Lot, BuildingInstance, DistrictType } from './types';

function createMulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ProceduralBuildingGenerator {
  private rand: () => number;

  constructor(seed: number = 42) {
    this.rand = createMulberry32(seed);
  }

  generateBuildings(
    lots: Lot[],
    seed: number = 42
  ): { instances: BuildingInstance[]; meshGroup: THREE.Group } {
    this.rand = createMulberry32(seed);
    const instances: BuildingInstance[] = [];
    const meshGroup = new THREE.Group();
    meshGroup.name = 'ProceduralBuildings';

    const downtownColors = [0x3a4b5c, 0x2b3846, 0x4a5d6e, 0x1f2933, 0x566b7a];
    const residentialColors = [0xd6c4b2, 0xe8dfd5, 0xc2a688, 0x9e8065, 0xb8aba0];
    const industrialColors = [0x54585a, 0x6c7174, 0x404345, 0x82878a];
    const civicColors = [0xdfded9, 0xeeece6, 0xc8c6be];

    const buildingGeometries: THREE.BufferGeometry[] = [];
    const foundationGeometries: THREE.BufferGeometry[] = [];
    const roofDetailGeometries: THREE.BufferGeometry[] = [];

    for (const lot of lots) {
      if (lot.district === 'park') continue; // Parks don't spawn standard buildings

      const bWidth = Math.max(8, lot.width * (0.8 + this.rand() * 0.15));
      const bDepth = Math.max(8, lot.depth * (0.75 + this.rand() * 0.15));

      let floors = 2;
      let height = 8;
      let roofType: BuildingInstance['roofType'] = 'flat';
      let palette = residentialColors;

      if (lot.district === 'downtown') {
        floors = Math.floor(10 + this.rand() * 25);
        height = floors * 3.5;
        roofType = this.rand() < 0.3 ? 'helipad' : 'hvac_parapet';
        palette = downtownColors;
      } else if (lot.district === 'civic') {
        floors = Math.floor(4 + this.rand() * 6);
        height = floors * 4.0;
        roofType = 'hvac_parapet';
        palette = civicColors;
      } else if (lot.district === 'industrial') {
        floors = Math.floor(1 + this.rand() * 3);
        height = floors * 4.5;
        roofType = 'flat';
        palette = industrialColors;
      } else {
        floors = Math.floor(1 + this.rand() * 3);
        height = floors * 3.2;
        roofType = this.rand() < 0.5 ? 'sloped' : 'flat';
        palette = residentialColors;
      }

      const color = palette[Math.floor(this.rand() * palette.length)];
      const foundationHeight = Math.max(0.5, Math.abs(lot.elevation * 0.2) + 0.5);

      const bInst: BuildingInstance = {
        id: `bldg_${lot.id}`,
        lotId: lot.id,
        position: { x: lot.center.x, y: lot.elevation, z: lot.center.z },
        width: bWidth,
        depth: bDepth,
        height,
        floors,
        rotation: lot.rotation,
        district: lot.district,
        facadeColor: color,
        roofType,
        hasFoundationRetainingWall: true,
        foundationHeight,
      };

      instances.push(bInst);
      lot.buildingId = bInst.id;

      // 1. Foundation Slab (Prevents hovering on uneven terrain)
      // rotateY BEFORE translate — rotation must happen around local origin
      const foundGeo = new THREE.BoxGeometry(bWidth + 0.6, foundationHeight, bDepth + 0.6);
      foundGeo.rotateY(lot.rotation);
      foundGeo.translate(lot.center.x, lot.elevation - foundationHeight * 0.5, lot.center.z);
      foundationGeometries.push(foundGeo);

      // 2. Main Building Body
      const bodyGeo = new THREE.BoxGeometry(bWidth, height, bDepth);
      bodyGeo.rotateY(lot.rotation);
      bodyGeo.translate(lot.center.x, lot.elevation + height * 0.5, lot.center.z);
      buildingGeometries.push(bodyGeo);

      // 3. Rooftop Utilities (HVAC box or Helipad)
      if (roofType === 'hvac_parapet' || roofType === 'helipad') {
        const hvacW = bWidth * 0.35;
        const hvacD = bDepth * 0.35;
        const hvacH = 2.0;
        const hvacGeo = new THREE.BoxGeometry(hvacW, hvacH, hvacD);
        hvacGeo.rotateY(lot.rotation);
        hvacGeo.translate(lot.center.x, lot.elevation + height + hvacH * 0.5, lot.center.z);
        roofDetailGeometries.push(hvacGeo);
      }
    }

    // Merge Geometries for optimal single-drawcall rendering
    if (foundationGeometries.length > 0) {
      const mergedFound = this.mergeGeometries(foundationGeometries);
      const foundMat = new THREE.MeshStandardMaterial({ color: 0x48484a, roughness: 0.9 });
      const foundMesh = new THREE.Mesh(mergedFound, foundMat);
      foundMesh.name = 'BuildingFoundations_Mesh';
      foundMesh.userData = { isObstacle: true, isWalkable: true, entityType: 'building_foundation' };
      meshGroup.add(foundMesh);
    }

    if (buildingGeometries.length > 0) {
      const mergedBody = this.mergeGeometries(buildingGeometries);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x5a6572,
        roughness: 0.65,
        metalness: 0.2,
      });
      const bodyMesh = new THREE.Mesh(mergedBody, bodyMat);
      bodyMesh.name = 'Buildings_Mesh';
      bodyMesh.userData = { isObstacle: true, entityType: 'building' };
      meshGroup.add(bodyMesh);
    }

    if (roofDetailGeometries.length > 0) {
      const mergedRoof = this.mergeGeometries(roofDetailGeometries);
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x333336, roughness: 0.8 });
      const roofMesh = new THREE.Mesh(mergedRoof, roofMat);
      roofMesh.name = 'BuildingRoofs_Mesh';
      roofMesh.userData = { isObstacle: true, isWalkable: true, entityType: 'building_roof' };
      meshGroup.add(roofMesh);
    }

    return { instances, meshGroup };
  }

  private mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return mergeCityGeometries(geos);
  }
}
