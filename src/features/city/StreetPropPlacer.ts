import * as THREE from 'three';
import { mergeCityGeometries } from './mergeCityGeometries';
import { RoadSegment, Intersection, PropInstance, Lot } from './types';

function createMulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StreetPropPlacer {
  private rand: () => number;

  constructor(seed: number = 42) {
    this.rand = createMulberry32(seed);
  }

  generateProps(
    roads: RoadSegment[],
    intersections: Intersection[],
    lots: Lot[],
    seed: number = 42
  ): { instances: PropInstance[]; meshGroup: THREE.Group } {
    this.rand = createMulberry32(seed);
    const instances: PropInstance[] = [];
    const meshGroup = new THREE.Group();
    meshGroup.name = 'StreetProps';

    let propId = 1;
    const propGeometries: { [key: string]: THREE.BufferGeometry[] } = {
      streetlight: [],
      traffic_light: [],
      fire_hydrant: [],
      bus_shelter: [],
      bench: [],
      trash_can: [],
      dumpster: [],
    };

    // 1. Streetlights & Hydrants along Road Curbs
    for (const r of roads) {
      if (r.type === 'alley') continue;

      const dx = r.p2.x - r.p1.x;
      const dz = r.p2.z - r.p1.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 15) continue;

      const nx = -dz / len;
      const nz = dx / len;
      const angle = Math.atan2(dz, dx);
      const curbOffset = r.width * 0.5 + 1.2;

      const lightSpacing = 24.0;
      const count = Math.floor(len / lightSpacing);

      for (let i = 1; i <= count; i++) {
        const t = (i * lightSpacing) / len;
        const side = i % 2 === 0 ? 1 : -1;

        const px = r.p1.x + dx * t + nx * side * curbOffset;
        const pz = r.p1.z + dz * t + nz * side * curbOffset;
        const py = (r.elevation1 ?? 0) + ((r.elevation2 ?? 0) - (r.elevation1 ?? 0)) * t;

        const pInst: PropInstance = {
          id: `prop_${propId++}`,
          type: 'streetlight',
          position: { x: px, y: py, z: pz },
          rotation: angle + (side === 1 ? -Math.PI * 0.5 : Math.PI * 0.5),
        };
        instances.push(pInst);

        // Streetlight Mesh (Pole + arm lamp)
        const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.0, 6);
        poleGeo.translate(px, py + 3.0, pz);
        propGeometries.streetlight.push(poleGeo);

        // Occasional Fire Hydrant (every ~3 streetlights)
        if (i === 1 && this.rand() < 0.4) {
          const hInst: PropInstance = {
            id: `prop_${propId++}`,
            type: 'fire_hydrant',
            position: { x: px + nx * side * 0.5, y: py, z: pz },
            rotation: angle,
          };
          instances.push(hInst);

          const hydGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.85, 6);
          hydGeo.translate(hInst.position.x, py + 0.42, hInst.position.z);
          propGeometries.fire_hydrant.push(hydGeo);
        }
      }
    }

    // 2. Traffic Lights at Intersections
    for (const int of intersections) {
      if (!int.hasTrafficLights) continue;

      const cornerOffset = 6.0;
      for (const corner of [-1, 1]) {
        const tx = int.position.x + corner * cornerOffset;
        const tz = int.position.z + corner * cornerOffset;

        const tInst: PropInstance = {
          id: `prop_${propId++}`,
          type: 'traffic_light',
          position: { x: tx, y: 0, z: tz },
          rotation: 0,
        };
        instances.push(tInst);

        const sigGeo = new THREE.BoxGeometry(0.5, 5.5, 0.5);
        sigGeo.translate(tx, 2.75, tz);
        propGeometries.traffic_light.push(sigGeo);
      }
    }

    // 3. Benches & Trash Cans along Civic/Downtown/Park lots
    for (const lot of lots) {
      if (lot.district === 'park' || lot.district === 'civic') {
        const bInst: PropInstance = {
          id: `prop_${propId++}`,
          type: 'bench',
          position: { x: lot.frontagePoint.x, y: lot.elevation, z: lot.frontagePoint.z },
          rotation: lot.rotation,
        };
        instances.push(bInst);

        const benchGeo = new THREE.BoxGeometry(1.8, 0.5, 0.6);
        benchGeo.rotateY(lot.rotation);
        benchGeo.translate(lot.frontagePoint.x, lot.elevation + 0.25, lot.frontagePoint.z);
        propGeometries.bench.push(benchGeo);
      } else if (lot.district === 'industrial') {
        const dInst: PropInstance = {
          id: `prop_${propId++}`,
          type: 'dumpster',
          position: { x: lot.center.x, y: lot.elevation, z: lot.center.z },
          rotation: lot.rotation,
        };
        instances.push(dInst);

        const dumpGeo = new THREE.BoxGeometry(2.4, 1.4, 1.5);
        dumpGeo.rotateY(lot.rotation);
        dumpGeo.translate(lot.center.x, lot.elevation + 0.7, lot.center.z);
        propGeometries.dumpster.push(dumpGeo);
      }
    }

    // Assemble meshes with materials
    const materials: { [key: string]: THREE.Material } = {
      streetlight: new THREE.MeshStandardMaterial({ color: 0x303236, metalness: 0.8, roughness: 0.3 }),
      traffic_light: new THREE.MeshStandardMaterial({ color: 0x1f2022, metalness: 0.5 }),
      fire_hydrant: new THREE.MeshStandardMaterial({ color: 0xc42828, roughness: 0.5 }),
      bench: new THREE.MeshStandardMaterial({ color: 0x6e4a2e, roughness: 0.8 }),
      dumpster: new THREE.MeshStandardMaterial({ color: 0x2d5236, roughness: 0.7 }),
    };

    for (const key of Object.keys(propGeometries)) {
      const geos = propGeometries[key];
      if (geos.length > 0) {
        const merged = this.mergeGeometries(geos);
        const mat = materials[key] || new THREE.MeshStandardMaterial({ color: 0x555555 });
        const propMesh = new THREE.Mesh(merged, mat);
        propMesh.name = `Props_${key}_Mesh`;
        propMesh.userData = { isObstacle: true, entityType: 'street_prop', propType: key };
        meshGroup.add(propMesh);
      }
    }

    return { instances, meshGroup };
  }

  private mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return mergeCityGeometries(geos);
  }
}
