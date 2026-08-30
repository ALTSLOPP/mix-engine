import * as THREE from 'three';
import { mergeCityGeometries } from './mergeCityGeometries';
import { RoadSegment, Lot, VegetationInstance } from './types';

function createMulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class UrbanVegetationPlacer {
  private rand: () => number;

  constructor(seed: number = 42) {
    this.rand = createMulberry32(seed);
  }

  generateVegetation(
    roads: RoadSegment[],
    lots: Lot[],
    seed: number = 42
  ): { instances: VegetationInstance[]; meshGroup: THREE.Group } {
    this.rand = createMulberry32(seed);
    const instances: VegetationInstance[] = [];
    const meshGroup = new THREE.Group();
    meshGroup.name = 'UrbanVegetation';

    let vegId = 1;
    const trunkGeometries: THREE.BufferGeometry[] = [];
    const foliageGeometries: THREE.BufferGeometry[] = [];

    // 1. Street Trees along Sidewalks
    for (const r of roads) {
      if (r.type === 'alley' || r.type === 'highway') continue;

      const dx = r.p2.x - r.p1.x;
      const dz = r.p2.z - r.p1.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 16) continue;

      const nx = -dz / len;
      const nz = dx / len;
      const curbOffset = r.width * 0.5 + 2.0;

      const treeSpacing = 20.0;
      const count = Math.floor(len / treeSpacing);

      for (let i = 1; i <= count; i++) {
        const t = (i * treeSpacing) / len;
        const side = i % 2 === 0 ? -1 : 1;

        const px = r.p1.x + dx * t + nx * side * curbOffset;
        const pz = r.p1.z + dz * t + nz * side * curbOffset;
        const py = (r.elevation1 ?? 0) + ((r.elevation2 ?? 0) - (r.elevation1 ?? 0)) * t;

        const scale = 0.85 + this.rand() * 0.3;
        const vInst: VegetationInstance = {
          id: `veg_${vegId++}`,
          type: 'street_tree',
          position: { x: px, y: py, z: pz },
          scale,
          rotation: this.rand() * Math.PI * 2,
        };
        instances.push(vInst);

        // Trunk
        const trunkH = 3.5 * scale;
        const trunkGeo = new THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, trunkH, 6);
        trunkGeo.translate(px, py + trunkH * 0.5, pz);
        trunkGeometries.push(trunkGeo);

        // Canopy
        const canopyR = 1.8 * scale;
        const folGeo = new THREE.DodecahedronGeometry(canopyR, 1);
        folGeo.translate(px, py + trunkH + canopyR * 0.7, pz);
        foliageGeometries.push(folGeo);
      }
    }

    // 2. Parks & Residential Yards
    for (const lot of lots) {
      if (lot.district === 'park') {
        const treeCount = Math.floor(3 + this.rand() * 5);
        for (let k = 0; k < treeCount; k++) {
          const offX = (this.rand() - 0.5) * (lot.width * 0.7);
          const offZ = (this.rand() - 0.5) * (lot.depth * 0.7);
          const px = lot.center.x + offX;
          const pz = lot.center.z + offZ;
          const scale = 1.0 + this.rand() * 0.5;

          const pInst: VegetationInstance = {
            id: `veg_${vegId++}`,
            type: 'canopy_tree',
            position: { x: px, y: lot.elevation, z: pz },
            scale,
            rotation: this.rand() * Math.PI * 2,
          };
          instances.push(pInst);

          const trunkH = 4.5 * scale;
          const trunkGeo = new THREE.CylinderGeometry(0.25 * scale, 0.35 * scale, trunkH, 6);
          trunkGeo.translate(px, lot.elevation + trunkH * 0.5, pz);
          trunkGeometries.push(trunkGeo);

          const canopyR = 2.4 * scale;
          const folGeo = new THREE.DodecahedronGeometry(canopyR, 1);
          folGeo.translate(px, lot.elevation + trunkH + canopyR * 0.7, pz);
          foliageGeometries.push(folGeo);
        }
      } else if (lot.district === 'residential' && this.rand() < 0.6) {
        // Residential front-yard bush
        const px = lot.frontagePoint.x;
        const pz = lot.frontagePoint.z;
        const scale = 0.6 + this.rand() * 0.3;

        const bInst: VegetationInstance = {
          id: `veg_${vegId++}`,
          type: 'bush',
          position: { x: px, y: lot.elevation, z: pz },
          scale,
          rotation: this.rand() * Math.PI * 2,
        };
        instances.push(bInst);

        const bushGeo = new THREE.DodecahedronGeometry(1.0 * scale, 1);
        bushGeo.translate(px, lot.elevation + 0.5 * scale, pz);
        foliageGeometries.push(bushGeo);
      }
    }

    if (trunkGeometries.length > 0) {
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.9 });
      const trunkMesh = new THREE.Mesh(this.mergeGeometries(trunkGeometries), trunkMat);
      trunkMesh.name = 'TreeTrunks_Mesh';
      trunkMesh.userData = { isObstacle: true, entityType: 'tree_trunk' };
      meshGroup.add(trunkMesh);
    }

    if (foliageGeometries.length > 0) {
      const folMat = new THREE.MeshStandardMaterial({ color: 0x2e6f3b, roughness: 0.8 });
      const folMesh = new THREE.Mesh(this.mergeGeometries(foliageGeometries), folMat);
      folMesh.name = 'TreeCanopy_Mesh';
      folMesh.userData = { entityType: 'tree_canopy' };
      meshGroup.add(folMesh);
    }

    return { instances, meshGroup };
  }

  private mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return mergeCityGeometries(geos);
  }
}
