import * as THREE from 'three';
import { mergeCityGeometries } from './mergeCityGeometries';
import { RoadSegment, BridgeSpan, Lot } from './types';

export class BridgeAndTerraceGenerator {
  generateBridges(
    roads: RoadSegment[],
    sampler: (x: number, z: number) => number = () => 0
  ): { spans: BridgeSpan[]; meshGroup: THREE.Group } {
    const spans: BridgeSpan[] = [];
    const meshGroup = new THREE.Group();
    meshGroup.name = 'ProceduralBridgesAndTerraces';

    const bridgeGeometries: THREE.BufferGeometry[] = [];
    const pillarGeometries: THREE.BufferGeometry[] = [];
    const railingGeometries: THREE.BufferGeometry[] = [];

    let spanId = 1;

    for (const r of roads) {
      if (!r.hasBridge) continue;

      const dx = r.p2.x - r.p1.x;
      const dz = r.p2.z - r.p1.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 1.0) continue;

      const nx = -dz / len;
      const nz = dx / len;
      const angle = Math.atan2(dz, dx);

      const y1 = r.elevation1 ?? 6;
      const y2 = r.elevation2 ?? 6;
      const midY = (y1 + y2) * 0.5;
      const midX = (r.p1.x + r.p2.x) * 0.5;
      const midZ = (r.p1.z + r.p2.z) * 0.5;

      const deckThickness = 1.2;
      const pillarSpacing = 16.0;
      const pillarCount = Math.max(1, Math.floor(len / pillarSpacing));

      const span: BridgeSpan = {
        id: `bridge_${spanId++}`,
        roadId: r.id,
        start: { x: r.p1.x, y: y1, z: r.p1.z },
        end: { x: r.p2.x, y: y2, z: r.p2.z },
        length: len,
        pillarCount: 0,
        clearanceHeight: midY,
      };
      spans.push(span);

      // 1. Concrete Bridge Deck
      const deckGeo = new THREE.BoxGeometry(r.width + 0.8, deckThickness, len);
      deckGeo.rotateY(-angle + Math.PI * 0.5);
      deckGeo.translate(midX, midY - deckThickness * 0.5, midZ);
      bridgeGeometries.push(deckGeo);

      // 2. Bridge Guardrails (Left and Right)
      const railH = 1.1;
      const railW = 0.25;
      for (const side of [-1, 1]) {
        const offX = nx * side * (r.width * 0.5 + 0.3);
        const offZ = nz * side * (r.width * 0.5 + 0.3);

        const railGeo = new THREE.BoxGeometry(railW, railH, len);
        railGeo.rotateY(-angle + Math.PI * 0.5);
        railGeo.translate(midX + offX, midY + railH * 0.5, midZ + offZ);
        railingGeometries.push(railGeo);
      }

      // 3. Vertical Support Pillars
      for (let p = 1; p <= pillarCount; p++) {
        const t = p / (pillarCount + 1);
        const px = r.p1.x + dx * t;
        const pz = r.p1.z + dz * t;
        const py = y1 + (y2 - y1) * t;
        const groundY = sampler(px, pz);
        // Supports end at the underside of the deck. A forced minimum height
        // can push pillars through the road when terrain is close to deck level.
        const pillarHeight = py - deckThickness - groundY;
        if (pillarHeight <= 0) continue;

        const pillarGeo = new THREE.CylinderGeometry(1.2, 1.4, pillarHeight, 8);
        pillarGeo.translate(px, groundY + pillarHeight * 0.5, pz);
        pillarGeometries.push(pillarGeo);
        span.pillarCount++;
      }
    }

    if (bridgeGeometries.length > 0) {
      const deckMat = new THREE.MeshStandardMaterial({ color: 0x505256, roughness: 0.8 });
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3e4044, roughness: 0.9 });
      const railMat = new THREE.MeshStandardMaterial({ color: 0x828488, roughness: 0.4, metalness: 0.6 });

      const deckMesh = new THREE.Mesh(this.mergeGeometries(bridgeGeometries), deckMat);
      deckMesh.name = 'BridgeDecks_Mesh';
      deckMesh.userData = { isWalkable: true, isDrivable: true, entityType: 'bridge_deck' };
      meshGroup.add(deckMesh);

      if (pillarGeometries.length > 0) {
        const pillarMesh = new THREE.Mesh(this.mergeGeometries(pillarGeometries), pillarMat);
        pillarMesh.name = 'BridgePillars_Mesh';
        pillarMesh.userData = { isObstacle: true, entityType: 'bridge_pillar' };
        meshGroup.add(pillarMesh);
      } else {
        pillarMat.dispose();
      }

      const railMesh = new THREE.Mesh(this.mergeGeometries(railingGeometries), railMat);
      railMesh.name = 'BridgeRailings_Mesh';
      railMesh.userData = { isObstacle: true, entityType: 'bridge_railing' };
      meshGroup.add(railMesh);
    }

    return { spans, meshGroup };
  }

  private mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return mergeCityGeometries(geos);
  }
}
