import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  RoadNetworkGenerator,
  RoadMeshBuilder,
  DistrictZoneGenerator,
  ProceduralBuildingGenerator,
  BridgeAndTerraceGenerator,
  StreetPropPlacer,
  UrbanVegetationPlacer,
  CityBlueprintSystem,
  ProceduralCityDirector,
} from '../src/features/city';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { createMockEngine } from './helpers/gameplayEngine';
import { ScriptComponent } from '../src/ecs/ScriptComponent';
import { PersistentGameState } from '../src/ecs/PersistentGameState';
import { EventBus } from '../src/ecs/EventBus';
import type { SceneManager, EntityId } from '../src/ecs/SceneManager';
import { CommandRegistry } from '../src/commands/CommandRegistry';

describe('Procedural City & Map Building System (ALIVE Port)', () => {
  it('generates multi-algorithm road networks (Grid, Organic, Radial) with slope & bridge detection', () => {
    const roadGen = new RoadNetworkGenerator(101);

    // 1. Grid Road Network
    const gridRes = roadGen.generate({
      worldSize: 400,
      roadAlgorithm: 'Grid',
      roadDensity: 0.7,
      terrainSampler: (x, z) => (x > 100 ? 12 : 0),
      waterSampler: (x, z) => x < -120,
    });
    expect(gridRes.roads.length).toBeGreaterThan(10);
    expect(gridRes.intersections.length).toBeGreaterThan(5);
    expect(gridRes.roads.some((r) => r.hasBridge)).toBe(true);

    // 2. Organic Road Network
    const organicRes = roadGen.generate({
      worldSize: 400,
      roadAlgorithm: 'Organic',
      roadDensity: 0.6,
    });
    expect(organicRes.roads.length).toBeGreaterThan(5);

    // 3. Radial Road Network
    const radialRes = roadGen.generate({
      worldSize: 400,
      roadAlgorithm: 'Radial',
      roadDensity: 0.5,
    });
    expect(radialRes.roads.length).toBeGreaterThan(15);
  });

  it('builds Three.js road meshes with asphalt, sidewalks, curbs, lane markings and crosswalks', () => {
    const roadGen = new RoadNetworkGenerator(42);
    const { roads, intersections } = roadGen.generate({ worldSize: 300, roadAlgorithm: 'Grid' });

    const builder = new RoadMeshBuilder();
    const group = builder.buildRoadMesh(roads, intersections, {
      enableSidewalks: true,
      enableLaneMarkings: true,
    });

    expect(group.children.length).toBeGreaterThanOrEqual(2);
    const meshes = group.children.filter((c) => c instanceof THREE.Mesh) as THREE.Mesh[];
    expect(meshes.length).toBeGreaterThanOrEqual(2);

    for (const m of meshes) {
      expect(m.geometry.attributes.position.count).toBeGreaterThan(0);
    }
  });

  it('subdivides city blocks into district-aware parcel lots with setbacks', () => {
    const roadGen = new RoadNetworkGenerator(42);
    const { roads } = roadGen.generate({ worldSize: 400, roadAlgorithm: 'Grid' });

    const zoneGen = new DistrictZoneGenerator(42);
    const { blocks, lots } = zoneGen.generateDistrictsAndLots(roads, { worldSize: 400 });

    expect(blocks.length).toBeGreaterThan(0);
    expect(lots.length).toBeGreaterThan(20);

    const districts = new Set(lots.map((l) => l.district));
    expect(districts.has('downtown') || districts.has('residential')).toBe(true);
  });

  it('synthesizes modular 3D buildings with foundation retaining slabs on slopes', () => {
    const roadGen = new RoadNetworkGenerator(42);
    const { roads } = roadGen.generate({ worldSize: 300 });
    const zoneGen = new DistrictZoneGenerator(42);
    const { lots } = zoneGen.generateDistrictsAndLots(roads, { worldSize: 300 });

    const bldgGen = new ProceduralBuildingGenerator(42);
    const { instances, meshGroup } = bldgGen.generateBuildings(lots, 42);

    expect(instances.length).toBeGreaterThan(10);
    expect(meshGroup.children.length).toBeGreaterThan(0);

    // Verify foundation retaining slabs are generated
    expect(instances.every((b) => b.hasFoundationRetainingWall)).toBe(true);
  });

  it('generates dynamic bridges over chasms/water and hillside terraces', () => {
    const roads = [
      {
        id: 'bridge_road_1',
        p1: { x: -50, z: 0 },
        p2: { x: 50, z: 0 },
        width: 12,
        type: 'avenue' as const,
        speedLimit: 60,
        elevation1: 10,
        elevation2: 10,
        hasBridge: true,
      },
    ];

    const bridgeGen = new BridgeAndTerraceGenerator();
    const { spans, meshGroup } = bridgeGen.generateBridges(roads, () => 0);

    expect(spans.length).toBe(1);
    expect(spans[0].pillarCount).toBeGreaterThanOrEqual(1);
    expect(meshGroup.children.length).toBe(3); // Deck + Pillars + Railings
  });

  it('scatters street props (streetlights, traffic lights, hydrants, benches, dumpsters) and foliage', () => {
    const roadGen = new RoadNetworkGenerator(42);
    const { roads, intersections } = roadGen.generate({ worldSize: 300 });
    const zoneGen = new DistrictZoneGenerator(42);
    const { lots } = zoneGen.generateDistrictsAndLots(roads, { worldSize: 300 });

    const propPlacer = new StreetPropPlacer(42);
    const { instances: props, meshGroup: propGroup } = propPlacer.generateProps(roads, intersections, lots, 42);
    expect(props.length).toBeGreaterThan(5);
    expect(propGroup.children.length).toBeGreaterThan(0);

    const vegPlacer = new UrbanVegetationPlacer(42);
    const { instances: veg, meshGroup: vegGroup } = vegPlacer.generateVegetation(roads, lots, 42);
    expect(veg.length).toBeGreaterThan(5);
    expect(vegGroup.children.length).toBeGreaterThan(0);
  });

  it('parses GTA V style Los Santos blueprint layout', () => {
    const bp = CityBlueprintSystem.createGTALosSantosBlueprint();
    expect(bp.name).toBe('GTA_Los_Santos');

    const { roads, lots } = CityBlueprintSystem.parseBlueprint(bp);
    expect(roads.length).toBeGreaterThan(20);
    expect(lots.length).toBeGreaterThan(50);
  });

  it('orchestrates end-to-end procedural city world generation in ProceduralCityDirector', () => {
    const engine = createMockEngine();
    const director = new ProceduralCityDirector(engine);

    const summary = director.generateWorld({
      worldSize: 400,
      roadAlgorithm: 'Grid',
      roadDensity: 0.65,
    });

    expect(summary.roadCount).toBeGreaterThan(10);
    expect(summary.lotCount).toBeGreaterThan(20);
    expect(summary.buildingCount).toBeGreaterThan(15);
    expect(summary.propCount).toBeGreaterThan(10);
    expect(summary.vegetationCount).toBeGreaterThan(10);
    expect(director.getRootGroup().children.length).toBeGreaterThanOrEqual(4);
    expect(director.getBlocks().length).toBeGreaterThan(0);

    // Verify nearest road search
    const nearest = director.findNearestRoad(0, 0);
    expect(nearest).toBeDefined();
    expect(nearest?.id).toBeDefined();

    // Verify mesh physics/walkable tags
    let hasWalkable = false;
    let hasObstacle = false;
    director.getRootGroup().traverse((obj) => {
      if (obj.userData?.isWalkable) hasWalkable = true;
      if (obj.userData?.isObstacle) hasObstacle = true;
    });
    expect(hasWalkable).toBe(true);
    expect(hasObstacle).toBe(true);

    director.clear();
    expect(director.getRoads().length).toBe(0);
    expect(director.getRootGroup().children.length).toBe(0);

    director.dispose();
  });

  it('applies gta_open_world and city_builder presets in GameplayFeatureManager', () => {
    const engine = createMockEngine();
    const gfm = new GameplayFeatureManager(engine);

    gfm.applyPreset('gta_open_world');
    expect(gfm.isFeatureEnabled('procedural_city_generator')).toBe(true);
    expect(gfm.isFeatureEnabled('vehicle_mount')).toBe(true);
    expect(gfm.isFeatureEnabled('ranged_shooter')).toBe(true);
    expect(gfm.city.getRoads().length).toBeGreaterThan(0);

    gfm.applyPreset('city_builder');
    expect(gfm.city.getBuildings().length).toBeGreaterThan(0);
  });

  it('exposes api.city helpers to entity scripts and CommandRegistry validation', () => {
    const engine = createMockEngine();
    const gfm = new GameplayFeatureManager(engine);
    engine.gameplayFeatures = gfm;

    const sm = {
      gameState: new PersistentGameState(),
      events: new EventBus(),
      gameplayFeatures: gfm,
      debugDraw: undefined,
      hud: undefined,
      getRigidBody: () => undefined,
      rigidBodyList: [],
    } as unknown as SceneManager;

    const script = `
      const res = api.city.generate({ worldSize: 300 });
      api.state.setItem('cityGenerated', !!res && res.buildingCount > 0);
    `;

    const sc = new ScriptComponent(1 as EntityId, sm, script);
    sc.update(0.016);

    expect(sm.gameState.getItem('cityGenerated')).toBe(true);

    const registry = CommandRegistry.default;
    expect(registry.validateCommand({ type: 'city_generate_world', worldSize: 500 }).valid).toBe(true);
    expect(registry.validateCommand({ type: 'city_load_blueprint', blueprintName: 'GTA_Los_Santos' }).valid).toBe(true);
    expect(registry.validateCommand({ type: 'city_clear' }).valid).toBe(true);
  });
});
