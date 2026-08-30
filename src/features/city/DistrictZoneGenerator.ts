import {
  RoadSegment,
  Lot,
  CityBlock,
  DistrictType,
  Point2D,
  CityGenerationConfig,
} from './types';

function createMulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DistrictZoneGenerator {
  private rand: () => number;

  constructor(seed: number = 42) {
    this.rand = createMulberry32(seed);
  }

  generateDistrictsAndLots(
    roads: RoadSegment[],
    config: CityGenerationConfig
  ): { blocks: CityBlock[]; lots: Lot[] } {
    const seed = config.seed ?? 42;
    this.rand = createMulberry32(seed);

    const worldSize = config.worldSize ?? 500;
    const sampler = config.terrainSampler ?? (() => 0);
    const waterSampler = config.waterSampler ?? (() => false);

    const lots: Lot[] = [];
    const blocks: CityBlock[] = [];
    let lotId = 1;
    let blockId = 1;

    for (const r of roads) {
      if (r.hasBridge) continue; // No building lots directly on bridge spans

      const dx = r.p2.x - r.p1.x;
      const dz = r.p2.z - r.p1.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 12) continue;

      const nx = -dz / len;
      const nz = dx / len;
      const roadAngle = Math.atan2(dz, dx);

      // Determine district type based on radial distance from center
      const midX = (r.p1.x + r.p2.x) * 0.5;
      const midZ = (r.p1.z + r.p2.z) * 0.5;
      const distFromCenter = Math.sqrt(midX * midX + midZ * midZ);
      const normDist = distFromCenter / (worldSize * 0.5);

      let district: DistrictType = 'residential';
      if (normDist < 0.25) district = 'downtown';
      else if (normDist < 0.45) district = this.rand() < 0.6 ? 'downtown' : 'civic';
      else if (normDist < 0.75) district = this.rand() < 0.7 ? 'residential' : 'park';
      else district = this.rand() < 0.5 ? 'industrial' : 'residential';

      const currentBlockId = `block_${blockId++}`;
      const blockLotIds: string[] = [];

      // Subdivide both sides of the road into parcel lots
      for (const side of [-1, 1]) {
        let lotWidth = 14;
        let lotDepth = 18;
        let setback = 3;

        if (district === 'downtown') {
          lotWidth = 20 + this.rand() * 12;
          lotDepth = 22 + this.rand() * 10;
          setback = 2.0;
        } else if (district === 'residential') {
          lotWidth = 14 + this.rand() * 8;
          lotDepth = 18 + this.rand() * 6;
          setback = 5.0;
        } else if (district === 'industrial') {
          lotWidth = 28 + this.rand() * 16;
          lotDepth = 30 + this.rand() * 14;
          setback = 4.0;
        }

        const margin = r.width * 0.5 + 2.0; // Sidewalk gap
        let traversed = 6.0; // Corner setback from intersection

        while (traversed + lotWidth < len - 6.0) {
          const tCenter = (traversed + lotWidth * 0.5) / len;
          const frontX = r.p1.x + dx * tCenter + nx * side * margin;
          const frontZ = r.p1.z + dz * tCenter + nz * side * margin;

          const centerX = frontX + nx * side * (lotDepth * 0.5);
          const centerZ = frontZ + nz * side * (lotDepth * 0.5);

          // Skip if lot is in water
          if (!waterSampler(centerX, centerZ)) {
            const elev = sampler(centerX, centerZ);
            const lot: Lot = {
              id: `lot_${lotId++}`,
              blockId: currentBlockId,
              frontagePoint: { x: frontX, z: frontZ },
              center: { x: centerX, z: centerZ },
              width: lotWidth - 1.5, // 1.5m parcel boundary spacing
              depth: lotDepth - 1.5,
              rotation: roadAngle + (side === 1 ? Math.PI : 0),
              district,
              setback,
              elevation: elev,
            };

            lots.push(lot);
            blockLotIds.push(lot.id);
          }

          traversed += lotWidth + 1.0;
        }
      }

      if (blockLotIds.length > 0) {
        blocks.push({
          id: currentBlockId,
          polygon: [r.p1, r.p2],
          district,
          lotIds: blockLotIds,
        });
      }
    }

    return { blocks, lots };
  }
}
