import * as THREE from 'three';
import { RoadSegment, Intersection } from './types';

export class RoadMeshBuilder {
  buildRoadMesh(
    roads: RoadSegment[],
    intersections: Intersection[],
    options: {
      enableSidewalks?: boolean;
      enableLaneMarkings?: boolean;
      asphaltColor?: number;
      curbColor?: number;
      markingColor?: number;
    } = {}
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = 'ProceduralRoadNetwork';

    const enableSidewalks = options.enableSidewalks ?? true;
    const enableMarkings = options.enableLaneMarkings ?? true;

    const asphaltMat = new THREE.MeshStandardMaterial({
      color: options.asphaltColor ?? 0x222226,
      roughness: 0.85,
      metalness: 0.1,
    });

    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: options.curbColor ?? 0x88888c,
      roughness: 0.9,
    });

    const markingMat = new THREE.MeshBasicMaterial({
      color: options.markingColor ?? 0xffffff,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0,
    });

    const yellowMarkingMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0,
    });

    // 1. Asphalt Roadbeds
    const roadGeometries: THREE.BufferGeometry[] = [];
    const sidewalkGeometries: THREE.BufferGeometry[] = [];
    const whiteMarkingGeometries: THREE.BufferGeometry[] = [];
    const yellowMarkingGeometries: THREE.BufferGeometry[] = [];

    for (const r of roads) {
      const dx = r.p2.x - r.p1.x;
      const dz = r.p2.z - r.p1.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.1) continue;

      const nx = -dz / len;
      const nz = dx / len;
      const halfW = r.width * 0.5;

      const y1 = r.elevation1 ?? 0;
      const y2 = r.elevation2 ?? 0;

      // Asphalt quad
      const roadGeo = new THREE.BufferGeometry();
      const pos = new Float32Array([
        r.p1.x - nx * halfW, y1 + 0.02, r.p1.z - nz * halfW,
        r.p1.x + nx * halfW, y1 + 0.02, r.p1.z + nz * halfW,
        r.p2.x + nx * halfW, y2 + 0.02, r.p2.z + nz * halfW,

        r.p1.x - nx * halfW, y1 + 0.02, r.p1.z - nz * halfW,
        r.p2.x + nx * halfW, y2 + 0.02, r.p2.z + nz * halfW,
        r.p2.x - nx * halfW, y2 + 0.02, r.p2.z - nz * halfW,
      ]);
      roadGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      roadGeo.computeVertexNormals();
      roadGeometries.push(roadGeo);

      // Sidewalks
      if (enableSidewalks && r.type !== 'alley') {
        const sideW = r.type === 'avenue' || r.type === 'highway' ? 2.5 : 1.8;
        const curbH = 0.15;

        // Left Sidewalk
        const swLeft = new THREE.BufferGeometry();
        const swLeftPos = new Float32Array([
          r.p1.x - nx * (halfW + sideW), y1 + curbH, r.p1.z - nz * (halfW + sideW),
          r.p1.x - nx * halfW, y1 + curbH, r.p1.z - nz * halfW,
          r.p2.x - nx * halfW, y2 + curbH, r.p2.z - nz * halfW,

          r.p1.x - nx * (halfW + sideW), y1 + curbH, r.p1.z - nz * (halfW + sideW),
          r.p2.x - nx * halfW, y2 + curbH, r.p2.z - nz * halfW,
          r.p2.x - nx * (halfW + sideW), y2 + curbH, r.p2.z - nz * (halfW + sideW),
        ]);
        swLeft.setAttribute('position', new THREE.BufferAttribute(swLeftPos, 3));
        swLeft.computeVertexNormals();
        sidewalkGeometries.push(swLeft);

        // Right Sidewalk
        const swRight = new THREE.BufferGeometry();
        const swRightPos = new Float32Array([
          r.p1.x + nx * halfW, y1 + curbH, r.p1.z + nz * halfW,
          r.p1.x + nx * (halfW + sideW), y1 + curbH, r.p1.z + nz * (halfW + sideW),
          r.p2.x + nx * (halfW + sideW), y2 + curbH, r.p2.z + nz * (halfW + sideW),

          r.p1.x + nx * halfW, y1 + curbH, r.p1.z + nz * halfW,
          r.p2.x + nx * (halfW + sideW), y2 + curbH, r.p2.z + nz * (halfW + sideW),
          r.p2.x + nx * halfW, y2 + curbH, r.p2.z + nz * halfW,
        ]);
        swRight.setAttribute('position', new THREE.BufferAttribute(swRightPos, 3));
        swRight.computeVertexNormals();
        sidewalkGeometries.push(swRight);
      }

      // Lane Markings
      if (enableMarkings && r.type !== 'alley') {
        const isDoubleYellow = r.type === 'avenue' || r.type === 'highway';

        // Center line
        if (isDoubleYellow) {
          const yellowW = 0.12;
          const yellowGap = 0.15;
          for (const side of [-1, 1]) {
            const offset = side * (yellowGap * 0.5 + yellowW * 0.5);
            const mGeo = new THREE.BufferGeometry();
            const mPos = new Float32Array([
              r.p1.x + nx * (offset - yellowW * 0.5), y1 + 0.03, r.p1.z + nz * (offset - yellowW * 0.5),
              r.p1.x + nx * (offset + yellowW * 0.5), y1 + 0.03, r.p1.z + nz * (offset + yellowW * 0.5),
              r.p2.x + nx * (offset + yellowW * 0.5), y2 + 0.03, r.p2.z + nz * (offset + yellowW * 0.5),

              r.p1.x + nx * (offset - yellowW * 0.5), y1 + 0.03, r.p1.z + nz * (offset - yellowW * 0.5),
              r.p2.x + nx * (offset + yellowW * 0.5), y2 + 0.03, r.p2.z + nz * (offset + yellowW * 0.5),
              r.p2.x + nx * (offset - yellowW * 0.5), y2 + 0.03, r.p2.z + nz * (offset - yellowW * 0.5),
            ]);
            mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
            mGeo.computeVertexNormals();
            yellowMarkingGeometries.push(mGeo);
          }
        } else {
          // Dashed center line
          const dashLen = 3.0;
          const gapLen = 3.0;
          const totalDash = dashLen + gapLen;
          const count = Math.floor(len / totalDash);
          const dashW = 0.15;

          for (let d = 0; d < count; d++) {
            const t1 = (d * totalDash) / len;
            const t2 = (d * totalDash + dashLen) / len;

            const xStart = r.p1.x + dx * t1;
            const zStart = r.p1.z + dz * t1;
            const yStart = y1 + (y2 - y1) * t1;

            const xEnd = r.p1.x + dx * t2;
            const zEnd = r.p1.z + dz * t2;
            const yEnd = y1 + (y2 - y1) * t2;

            const dGeo = new THREE.BufferGeometry();
            const dPos = new Float32Array([
              xStart - nx * (dashW * 0.5), yStart + 0.03, zStart - nz * (dashW * 0.5),
              xStart + nx * (dashW * 0.5), yStart + 0.03, zStart + nz * (dashW * 0.5),
              xEnd + nx * (dashW * 0.5), yEnd + 0.03, zEnd + nz * (dashW * 0.5),

              xStart - nx * (dashW * 0.5), yStart + 0.03, zStart - nz * (dashW * 0.5),
              xEnd + nx * (dashW * 0.5), yEnd + 0.03, zEnd + nz * (dashW * 0.5),
              xEnd - nx * (dashW * 0.5), yEnd + 0.03, zEnd - nz * (dashW * 0.5),
            ]);
            dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
            dGeo.computeVertexNormals();
            whiteMarkingGeometries.push(dGeo);
          }
        }

        // Outer white edge lines
        const edgeOffset = halfW - 0.25;
        const edgeW = 0.1;
        for (const side of [-1, 1]) {
          const off = side * edgeOffset;
          const eGeo = new THREE.BufferGeometry();
          const ePos = new Float32Array([
            r.p1.x + nx * (off - edgeW * 0.5), y1 + 0.03, r.p1.z + nz * (off - edgeW * 0.5),
            r.p1.x + nx * (off + edgeW * 0.5), y1 + 0.03, r.p1.z + nz * (off + edgeW * 0.5),
            r.p2.x + nx * (off + edgeW * 0.5), y2 + 0.03, r.p2.z + nz * (off + edgeW * 0.5),

            r.p1.x + nx * (off - edgeW * 0.5), y1 + 0.03, r.p1.z + nz * (off - edgeW * 0.5),
            r.p2.x + nx * (off + edgeW * 0.5), y2 + 0.03, r.p2.z + nz * (off + edgeW * 0.5),
            r.p2.x + nx * (off - edgeW * 0.5), y2 + 0.03, r.p2.z + nz * (off - edgeW * 0.5),
          ]);
          eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
          eGeo.computeVertexNormals();
          whiteMarkingGeometries.push(eGeo);
        }
      }
    }

    // Crosswalks at intersections
    if (enableMarkings) {
      for (const int of intersections) {
        if (int.connectedRoadIds.length < 2) continue;
        const crosswalkSize = 2.4;
        const stripeW = 0.4;
        const stripeGap = 0.3;

        for (let s = -crosswalkSize; s <= crosswalkSize; s += (stripeW + stripeGap)) {
          const cGeo = new THREE.BufferGeometry();
          const p = new Float32Array([
            int.position.x + s - stripeW * 0.5, 0.04, int.position.z - crosswalkSize,
            int.position.x + s + stripeW * 0.5, 0.04, int.position.z - crosswalkSize,
            int.position.x + s + stripeW * 0.5, 0.04, int.position.z + crosswalkSize,

            int.position.x + s - stripeW * 0.5, 0.04, int.position.z - crosswalkSize,
            int.position.x + s + stripeW * 0.5, 0.04, int.position.z + crosswalkSize,
            int.position.x + s - stripeW * 0.5, 0.04, int.position.z + crosswalkSize,
          ]);
          cGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
          cGeo.computeVertexNormals();
          whiteMarkingGeometries.push(cGeo);
        }
      }
    }

    // Assemble and merge meshes
    if (roadGeometries.length > 0) {
      const mergedRoad = this.mergeGeometries(roadGeometries);
      const roadMesh = new THREE.Mesh(mergedRoad, asphaltMat);
      roadMesh.name = 'RoadBed_Mesh';
      roadMesh.userData = { isWalkable: true, isDrivable: true, entityType: 'road' };
      group.add(roadMesh);
    }

    if (sidewalkGeometries.length > 0) {
      const mergedSidewalk = this.mergeGeometries(sidewalkGeometries);
      const sidewalkMesh = new THREE.Mesh(mergedSidewalk, sidewalkMat);
      sidewalkMesh.name = 'Sidewalk_Mesh';
      sidewalkMesh.userData = { isWalkable: true, entityType: 'sidewalk' };
      group.add(sidewalkMesh);
    }

    if (whiteMarkingGeometries.length > 0) {
      const mergedWhite = this.mergeGeometries(whiteMarkingGeometries);
      const whiteMesh = new THREE.Mesh(mergedWhite, markingMat);
      whiteMesh.name = 'RoadMarkingsWhite_Mesh';
      group.add(whiteMesh);
    }

    if (yellowMarkingGeometries.length > 0) {
      const mergedYellow = this.mergeGeometries(yellowMarkingGeometries);
      const yellowMesh = new THREE.Mesh(mergedYellow, yellowMarkingMat);
      yellowMesh.name = 'RoadMarkingsYellow_Mesh';
      group.add(yellowMesh);
    }

    return group;
  }

  private mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalVerts = 0;
    for (const g of geos) {
      totalVerts += g.attributes.position.count;
    }

    const pos = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);

    let offset = 0;
    for (const g of geos) {
      const pArr = g.attributes.position.array;
      const nArr = g.attributes.normal?.array;

      pos.set(pArr, offset * 3);
      if (nArr) {
        norm.set(nArr, offset * 3);
      }
      offset += g.attributes.position.count;
      g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    return merged;
  }
}
