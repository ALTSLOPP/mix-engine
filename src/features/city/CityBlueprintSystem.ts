import { CityBlueprint, BlueprintCell, RoadSegment, Lot, DistrictType } from './types';

export class CityBlueprintSystem {
  static createGTALosSantosBlueprint(): CityBlueprint {
    const size = 32;
    const cellSize = 16;
    const grid: BlueprintCell[][] = Array(size)
      .fill(null)
      .map(() =>
        Array(size)
          .fill(null)
          .map(() => ({ type: 'empty' as const, district: 'residential' as DistrictType }))
      );

    const fillRect = (
      x1: number,
      z1: number,
      x2: number,
      z2: number,
      type: BlueprintCell['type'],
      district?: DistrictType,
      height?: number
    ) => {
      for (let z = z1; z < z2 && z < size; z++) {
        for (let x = x1; x < x2 && x < size; x++) {
          if (x >= 0 && z >= 0) {
            grid[z][x] = { type, district, height };
          }
        }
      }
    };

    // 1. South Coast Harbor / Water
    fillRect(0, 26, size, size, 'water', 'waterfront');

    // 2. Downtown Financial District Core (Highrise skyscrapers)
    fillRect(10, 10, 22, 18, 'building', 'downtown', 80);

    // 3. Central Park & Plazas
    fillRect(13, 13, 19, 15, 'park', 'park');

    // 4. North Vinewood Hills / Residential
    fillRect(4, 2, 28, 8, 'building', 'residential', 10);

    // 5. East Industrial Docks / Warehouses
    fillRect(24, 10, 30, 24, 'building', 'industrial', 14);

    // 6. Grid Ring Road Network — only overwrite empty cells, preserve buildings/parks
    for (let i = 2; i < size - 4; i += 4) {
      for (let j = 0; j < size; j++) {
        if (grid[i][j].type === 'empty') grid[i][j] = { type: 'road' };
        if (grid[j][i].type === 'empty') grid[j][i] = { type: 'road' };
      }
    }

    return {
      name: 'GTA_Los_Santos',
      gridSize: size,
      cellSize,
      grid,
    };
  }

  static parseBlueprint(blueprint: CityBlueprint): {
    roads: RoadSegment[];
    lots: Lot[];
  } {
    if (!blueprint || !Number.isInteger(blueprint.gridSize) || blueprint.gridSize <= 0 ||
        !Number.isFinite(blueprint.cellSize) || blueprint.cellSize <= 0 ||
        !Array.isArray(blueprint.grid) || blueprint.grid.length !== blueprint.gridSize ||
        blueprint.grid.some(row => !Array.isArray(row) || row.length !== blueprint.gridSize ||
          Array.from(row).some(cell => !cell || !['empty', 'road', 'building', 'park', 'water', 'tree'].includes(cell.type)))) {
      throw new Error('Invalid city blueprint: expected a square grid of valid cells and a positive cellSize.');
    }
    const roads: RoadSegment[] = [];
    const lots: Lot[] = [];
    const { grid, gridSize, cellSize } = blueprint;
    const half = (gridSize * cellSize) * 0.5;

    let roadId = 1;
    let lotId = 1;

    for (let z = 0; z < gridSize; z++) {
      for (let x = 0; x < gridSize; x++) {
        const cell = grid[z][x];
        const worldX = x * cellSize - half + cellSize * 0.5;
        const worldZ = z * cellSize - half + cellSize * 0.5;

        if (cell.type === 'road') {
          // Check right neighbor
          if (x + 1 < gridSize && grid[z][x + 1].type === 'road') {
            roads.push({
              id: `bp_road_${roadId++}`,
              p1: { x: worldX, z: worldZ },
              p2: { x: worldX + cellSize, z: worldZ },
              type: 'avenue',
              width: 10,
              speedLimit: 60,
            });
          }
          // Check down neighbor
          if (z + 1 < gridSize && grid[z + 1][x].type === 'road') {
            roads.push({
              id: `bp_road_${roadId++}`,
              p1: { x: worldX, z: worldZ },
              p2: { x: worldX, z: worldZ + cellSize },
              type: 'avenue',
              width: 10,
              speedLimit: 60,
            });
          }
        } else if (cell.type === 'building' || cell.type === 'park') {
          lots.push({
            id: `bp_lot_${lotId++}`,
            blockId: `bp_block_${z}_${x}`,
            frontagePoint: { x: worldX, z: worldZ },
            center: { x: worldX, z: worldZ },
            width: cellSize - 2,
            depth: cellSize - 2,
            rotation: 0,
            district: cell.district ?? (cell.type === 'park' ? 'park' : 'residential'),
            setback: 2,
            elevation: 0,
          });
        }
      }
    }

    return { roads, lots };
  }
}
