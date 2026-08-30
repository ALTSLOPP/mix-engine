import {
  RoadSegment,
  Intersection,
  RoadType,
  Point2D,
  CityGenerationConfig,
  RoadAlgorithm,
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

export class RoadNetworkGenerator {
  private seed: number;
  private rand: () => number;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.rand = createMulberry32(seed);
  }

  generate(config: CityGenerationConfig): { roads: RoadSegment[]; intersections: Intersection[] } {
    this.seed = config.seed ?? 42;
    this.rand = createMulberry32(this.seed);

    const worldSize = config.worldSize ?? 500;
    const algorithm = config.roadAlgorithm ?? 'Grid';
    const density = config.roadDensity ?? 0.6;
    const sampler = config.terrainSampler ?? (() => 0);
    const waterSampler = config.waterSampler ?? (() => false);

    let roads: RoadSegment[] = [];

    switch (algorithm) {
      case 'Organic':
        roads = this.generateOrganicRoads(worldSize, density);
        break;
      case 'Radial':
        roads = this.generateRadialRoads(worldSize, density);
        break;
      case 'Grid':
      default:
        roads = this.generateGridRoads(worldSize, density);
        break;
    }

    // Sample terrain elevation & detect bridges over water
    for (const r of roads) {
      const h1 = sampler(r.p1.x, r.p1.z);
      const h2 = sampler(r.p2.x, r.p2.z);
      r.elevation1 = h1;
      r.elevation2 = h2;

      const midX = (r.p1.x + r.p2.x) * 0.5;
      const midZ = (r.p1.z + r.p2.z) * 0.5;
      const isOverWater = waterSampler(midX, midZ) || waterSampler(r.p1.x, r.p1.z) || waterSampler(r.p2.x, r.p2.z);
      if (isOverWater) {
        r.hasBridge = true;
        r.elevation1 = Math.max(h1, 4);
        r.elevation2 = Math.max(h2, 4);
      }
    }

    const intersections = this.extractIntersections(roads);
    return { roads, intersections };
  }

  private generateGridRoads(worldSize: number, density: number): RoadSegment[] {
    const roads: RoadSegment[] = [];
    const half = worldSize * 0.5;
    const spacing = Math.max(25, 75 - density * 40);

    const xLines: number[] = [];
    for (let x = -half + spacing; x <= half - spacing; x += spacing) {
      xLines.push(x + (this.rand() - 0.5) * 4);
    }

    const zLines: number[] = [];
    for (let z = -half + spacing; z <= half - spacing; z += spacing) {
      zLines.push(z + (this.rand() - 0.5) * 4);
    }

    let roadIdx = 1;

    // Avenues and collectors along X
    for (let i = 0; i < zLines.length; i++) {
      const z = zLines[i];
      const isMainAvenue = i % 3 === 0;
      const type: RoadType = isMainAvenue ? 'avenue' : 'collector';
      const width = isMainAvenue ? 12 : 8;
      const speedLimit = isMainAvenue ? 60 : 50;

      for (let j = 0; j < xLines.length - 1; j++) {
        // Occasional cul-de-sac / skip for residential variety
        if (!isMainAvenue && this.rand() < 0.1) continue;

        roads.push({
          id: `road_x_${roadIdx++}`,
          p1: { x: xLines[j], z },
          p2: { x: xLines[j + 1], z },
          type,
          width,
          speedLimit,
        });
      }
    }

    // Streets and avenues along Z
    for (let j = 0; j < xLines.length; j++) {
      const x = xLines[j];
      const isMainAvenue = j % 3 === 0;
      const type: RoadType = isMainAvenue ? 'avenue' : 'local';
      const width = isMainAvenue ? 12 : 6;
      const speedLimit = isMainAvenue ? 60 : 40;

      for (let i = 0; i < zLines.length - 1; i++) {
        if (!isMainAvenue && this.rand() < 0.15) continue;

        roads.push({
          id: `road_z_${roadIdx++}`,
          p1: { x, z: zLines[i] },
          p2: { x, z: zLines[i + 1] },
          type,
          width,
          speedLimit,
        });
      }
    }

    return roads;
  }

  private generateOrganicRoads(worldSize: number, density: number): RoadSegment[] {
    const roads: RoadSegment[] = [];
    const half = worldSize * 0.5;
    let roadIdx = 1;

    // Create 3 main meandering thoroughfares
    const numTrunks = Math.max(2, Math.round(density * 4));
    for (let t = 0; t < numTrunks; t++) {
      let currX = -half + 20;
      let currZ = ((t + 0.5) / numTrunks - 0.5) * worldSize * 0.8;
      let angle = (this.rand() - 0.5) * 0.4;

      while (currX < half - 30) {
        const step = 40 + this.rand() * 25;
        angle += (this.rand() - 0.5) * 0.5;
        angle = Math.max(-0.6, Math.min(0.6, angle));

        const nextX = currX + Math.cos(angle) * step;
        const nextZ = Math.max(-half + 10, Math.min(half - 10,
          currZ + Math.sin(angle) * step));

        // Skip segment if it escapes world bounds
        if (nextX > half - 10 || Math.abs(nextZ) > half - 5) {
          currX = nextX;
          currZ = nextZ;
          continue;
        }

        roads.push({
          id: `organic_trunk_${roadIdx++}`,
          p1: { x: currX, z: currZ },
          p2: { x: nextX, z: nextZ },
          type: 'avenue',
          width: 12,
          speedLimit: 60,
        });

        // Branch off local feeder roads
        if (this.rand() < density * 0.8) {
          const branchSide = this.rand() > 0.5 ? 1 : -1;
          const branchAngle = angle + (Math.PI / 2) * branchSide + (this.rand() - 0.5) * 0.3;
          const branchLen = 30 + this.rand() * 35;
          const bX = currX + Math.cos(branchAngle) * branchLen;
          const bZ = currZ + Math.sin(branchAngle) * branchLen;

          if (Math.abs(bX) < half - 10 && Math.abs(bZ) < half - 10) {
            roads.push({
              id: `organic_branch_${roadIdx++}`,
              p1: { x: currX, z: currZ },
              p2: { x: bX, z: bZ },
              type: 'local',
              width: 6,
              speedLimit: 40,
            });
          }
        }

        currX = nextX;
        currZ = nextZ;
      }
    }

    return roads;
  }

  private generateRadialRoads(worldSize: number, density: number): RoadSegment[] {
    const roads: RoadSegment[] = [];
    const maxRadius = worldSize * 0.42;
    const rings = Math.max(3, Math.round(density * 6));
    const spokes = Math.max(6, Math.round(density * 12));
    let roadIdx = 1;

    // Radiating spokes from city center hub
    for (let s = 0; s < spokes; s++) {
      const angle = (s / spokes) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      for (let r = 0; r < rings; r++) {
        const r1 = (r / rings) * maxRadius;
        const r2 = ((r + 1) / rings) * maxRadius;

        roads.push({
          id: `spoke_${s}_${r}_${roadIdx++}`,
          p1: { x: cosA * r1, z: sinA * r1 },
          p2: { x: cosA * r2, z: sinA * r2 },
          type: r === 0 ? 'avenue' : 'collector',
          width: r === 0 ? 12 : 8,
          speedLimit: 50,
        });
      }
    }

    // Concentric ring avenues
    for (let r = 1; r <= rings; r++) {
      const radius = (r / rings) * maxRadius;
      const segmentsPerRing = spokes * 2;

      for (let i = 0; i < segmentsPerRing; i++) {
        const a1 = (i / segmentsPerRing) * Math.PI * 2;
        const a2 = ((i + 1) / segmentsPerRing) * Math.PI * 2;

        roads.push({
          id: `ring_${r}_${i}_${roadIdx++}`,
          p1: { x: Math.cos(a1) * radius, z: Math.sin(a1) * radius },
          p2: { x: Math.cos(a2) * radius, z: Math.sin(a2) * radius },
          type: r === rings ? 'highway' : 'collector',
          width: r === rings ? 14 : 8,
          speedLimit: r === rings ? 80 : 50,
        });
      }
    }

    return roads;
  }

  private extractIntersections(roads: RoadSegment[]): Intersection[] {
    const map = new Map<string, { pos: Point2D; roadIds: string[] }>();
    const snap = 2.0;

    const getKey = (p: Point2D) => `${Math.round(p.x / snap) * snap},${Math.round(p.z / snap) * snap}`;

    for (const r of roads) {
      const k1 = getKey(r.p1);
      const k2 = getKey(r.p2);

      if (!map.has(k1)) map.set(k1, { pos: r.p1, roadIds: [] });
      map.get(k1)!.roadIds.push(r.id);

      if (!map.has(k2)) map.set(k2, { pos: r.p2, roadIds: [] });
      map.get(k2)!.roadIds.push(r.id);
    }

    const intersections: Intersection[] = [];
    let idx = 1;

    for (const [, item] of map.entries()) {
      const count = item.roadIds.length;
      if (count < 1) continue;

      let type: Intersection['type'];
      if (count === 1) {
        type = 'dead_end';
      } else if (count === 3) {
        type = '3way';
      } else if (count >= 4) {
        type = '4way';
      } else {
        // 2 roads = simple bend/continuation, not a real intersection — skip
        continue;
      }

      intersections.push({
        id: `int_${idx++}`,
        position: item.pos,
        connectedRoadIds: item.roadIds,
        type,
        hasTrafficLights: count >= 3,
      });
    }

    return intersections;
  }
}
