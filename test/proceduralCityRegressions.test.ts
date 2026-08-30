import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  BridgeAndTerraceGenerator, ProceduralBuildingGenerator,
  ProceduralCityDirector, StreetPropPlacer, UrbanVegetationPlacer,
} from '../src/features/city';
import type { CityBlueprint, Lot, RoadSegment } from '../src/features/city/types';
import { mergeCityGeometries } from '../src/features/city/mergeCityGeometries';
import { register } from '../src/ai/commands/FeatureCommands';
import type { CmdCtx, CommandMap } from '../src/ai/commands/BridgeContext';
import { CommandRegistry } from '../src/commands/CommandRegistry';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { createMockEngine } from './helpers/gameplayEngine';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { WorldOrigin } from '../src/streaming/WorldOrigin';

const cleanup: Array<() => void> = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); });

function director() {
  const city = new ProceduralCityDirector();
  cleanup.push(() => city.dispose());
  return city;
}
function commands(city: ProceduralCityDirector) {
  const map: CommandMap = new Map();
  register(map, { gameplayFeatures: { city }, setQueryResult: vi.fn() } as unknown as CmdCtx);
  return (type: string, args = {}) => map.get(type)!({ type, ...args } as any);
}
function mesh(root: THREE.Object3D, name: string): THREE.Mesh {
  return root.getObjectByName(name) as THREE.Mesh;
}
function disposeGroup(group: THREE.Group) {
  cleanup.push(() => group.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) material.dispose();
  }));
}
const lot: Lot = {
  id: 'lot', blockId: 'block', frontagePoint: { x: 0, z: 0 }, center: { x: 0, z: 0 },
  width: 20, depth: 20, rotation: 0, district: 'industrial', setback: 3, elevation: 0,
};
const road: RoadSegment = {
  id: 'road', p1: { x: -50, z: 0 }, p2: { x: 50, z: 0 }, width: 12,
  type: 'avenue', speedLimit: 60, elevation1: 10, elevation2: 10, hasBridge: true,
};

describe('PCG triangle topology', () => {
  it('expands indexed triangles exactly and disposes consumed geometry', () => {
    const box = new THREE.BoxGeometry(2, 3, 4);
    const expected = box.toNonIndexed();
    const boxDisposed = vi.fn();
    box.addEventListener('dispose', boxDisposed);
    const result = mergeCityGeometries([box]);
    expect(Array.from(result.attributes.position.array)).toEqual(Array.from(expected.attributes.position.array));
    expect(Array.from(result.attributes.normal.array)).toEqual(Array.from(expected.attributes.normal.array));
    expect(result.attributes.position.count).toBe(36);
    expect(boxDisposed).toHaveBeenCalledOnce();
    result.dispose(); expected.dispose();
  });

  it('handles mixed indexed primitives and non-indexed foliage', () => {
    const parts = [new THREE.CylinderGeometry(1, 1, 2, 6), new THREE.DodecahedronGeometry(2, 1)];
    const count = parts.reduce((sum, g) => sum + (g.index?.count ?? g.attributes.position.count), 0);
    const result = mergeCityGeometries(parts);
    expect(result.attributes.position.count).toBe(count);
    expect(count % 3).toBe(0);
    result.dispose();
  });

  it('keeps all twelve triangles for each building body and foundation', () => {
    const { meshGroup } = new ProceduralBuildingGenerator().generateBuildings([{ ...lot }]);
    disposeGroup(meshGroup);
    expect(mesh(meshGroup, 'Buildings_Mesh').geometry.attributes.position.count).toBe(36);
    expect(mesh(meshGroup, 'BuildingFoundations_Mesh').geometry.attributes.position.count).toBe(36);
  });

  it('preserves deck, railing and cylindrical support triangles', () => {
    const { meshGroup, spans } = new BridgeAndTerraceGenerator().generateBridges([road]);
    disposeGroup(meshGroup);
    const cylinder = new THREE.CylinderGeometry(1.2, 1.4, 10, 8);
    expect(mesh(meshGroup, 'BridgeDecks_Mesh').geometry.attributes.position.count).toBe(36);
    expect(mesh(meshGroup, 'BridgeRailings_Mesh').geometry.attributes.position.count).toBe(72);
    expect(mesh(meshGroup, 'BridgePillars_Mesh').geometry.attributes.position.count).toBe(spans[0].pillarCount * cylinder.index!.count);
    cylinder.dispose();
  });

  it('preserves streetlight and tree trunk triangles', () => {
    const props = new StreetPropPlacer().generateProps([road], [], [], 42);
    const vegetation = new UrbanVegetationPlacer().generateVegetation([road], [], 42);
    disposeGroup(props.meshGroup); disposeGroup(vegetation.meshGroup);
    const cylinder = new THREE.CylinderGeometry(1, 1, 2, 6);
    const lights = props.instances.filter(p => p.type === 'streetlight').length;
    const trees = vegetation.instances.filter(p => p.type === 'street_tree' || p.type === 'canopy_tree').length;
    expect(lights).toBeGreaterThan(0); expect(trees).toBeGreaterThan(0);
    expect(mesh(props.meshGroup, 'Props_streetlight_Mesh').geometry.attributes.position.count).toBe(lights * cylinder.index!.count);
    expect(mesh(vegetation.meshGroup, 'TreeTrunks_Mesh').geometry.attributes.position.count).toBe(trees * cylinder.index!.count);
    cylinder.dispose();
  });
});

describe('PCG configuration and command lifecycle', () => {
  it('honors panel settings and per-call overrides without resetting stored settings', () => {
    const manager = new GameplayFeatureManager(createMockEngine());
    cleanup.push(() => manager.dispose());
    manager.configureFeature('procedural_city_generator', {
      worldSize: 300, roadAlgorithm: 'Radial', roadDensity: 0.6, enableBuildings: false,
    });
    const city = manager.city;
    expect(city.generateWorld().buildingCount).toBe(0);
    expect(mesh(city.getRootGroup(), 'TreeCanopy_Mesh').castShadow).toBe(true);
    expect(city.getRoads()[0].id).toMatch(/^spoke_/);
    expect(Math.max(...city.getRoads().map(r => Math.hypot(r.p2.x, r.p2.z)))).toBeCloseTo(126);
    expect(city.generateWorld({ enableBuildings: true }).buildingCount).toBeGreaterThan(0);
    expect(city.getConfig().enableBuildings).toBe(false);
    expect(city.generateWorld().buildingCount).toBe(0);
  });

  it('preserves radial road objects and meshes across zoning and building commands', () => {
    const city = director(); const run = commands(city);
    run('city_build_roads', { algorithm: 'Radial', density: 0.6, worldSize: 300, seed: 72 });
    const roads = city.getRoads();
    const roadGroup = city.getRootGroup().getObjectByName('ProceduralRoadNetwork');
    expect(roads[0].id).toMatch(/^spoke_/);
    expect(city.getLots()).toHaveLength(0);
    run('city_zone_districts');
    const lots = city.getLots();
    expect(lots.length).toBeGreaterThan(0);
    run('city_spawn_buildings', { seed: 81 });
    expect(city.getBuildings().length).toBeGreaterThan(0);
    expect(city.getRoads()).toBe(roads);
    expect(city.getLots()).toBe(lots);
    expect(city.getRootGroup().getObjectByName('ProceduralRoadNetwork')).toBe(roadGroup);
    run('city_spawn_buildings', { seed: 82 });
    expect(city.getRootGroup().children.filter(g => g.name === 'ProceduralBuildings')).toHaveLength(1);
    expect(city.getRoads()).toBe(roads);
  });

  it('supports canonical road options and does not invent roads when zoning an empty city', () => {
    const city = director(); const run = commands(city);
    run('city_zone_districts'); run('city_spawn_buildings');
    expect(city.getRoads()).toHaveLength(0);
    run('city_build_roads', { roadAlgorithm: 'Organic', roadDensity: 0.4, worldSize: 250 });
    expect(city.getRoads()[0].id).toMatch(/^organic_/);
  });

  it('keeps blueprint parcels and roads when populating buildings', () => {
    const city = director(); const run = commands(city);
    run('city_load_blueprint', { blueprintName: 'GTA_Los_Santos' });
    const roads = city.getRoads(); const lots = city.getLots();
    run('city_spawn_buildings', { seed: 2 });
    expect(city.getRoads()).toBe(roads); expect(city.getLots()).toBe(lots);
    expect(city.getBuildings()[0].lotId).toMatch(/^bp_lot_/);
  });

  it('leaves the map intact on invalid blueprint names, malformed grids or invalid config', () => {
    const city = director(); city.generateWorld({ worldSize: 200 });
    const roads = city.getRoads(); const groups = [...city.getRootGroup().children];
    expect(() => city.loadBlueprint('missing')).toThrow(/Unknown blueprint/);
    expect(() => city.loadBlueprint({ name: 'bad', gridSize: 3, cellSize: 16, grid: [[]] })).toThrow(/Invalid city blueprint/);
    expect(() => city.generateWorld({ worldSize: Infinity })).toThrow();
    expect(city.getRoads()).toBe(roads); expect(city.getRootGroup().children).toEqual(groups);
  });

  it('validates city presets and optional city command parameters', () => {
    const registry = CommandRegistry.default;
    for (const preset of ['city_builder', 'gta_open_world']) {
      expect(registry.validateCommand({ type: 'feature_apply_preset', preset }).valid).toBe(true);
    }
    for (const type of ['city_generate_world', 'city_build_roads', 'city_zone_districts', 'city_spawn_buildings', 'city_load_blueprint']) {
      expect(registry.validateCommand({ type }).valid).toBe(true);
    }
    expect(registry.validateCommand({ type: 'city_generate_world', roadDensity: 2 }).valid).toBe(false);
    expect(registry.validateCommand({ type: 'city_generate_world', enableBuildings: 'no' }).valid).toBe(false);
  });
});

async function physicalCity(offset = new THREE.Vector3()) {
  const physicsWorld = await PhysicsWorld.create();
  cleanup.push(() => physicsWorld.dispose());
  const worldOrigin = new WorldOrigin(); worldOrigin.accumulate(offset);
  const scene = new THREE.Scene();
  const city = new ProceduralCityDirector({ viewport: { scene }, physicsWorld, worldOrigin } as any);
  cleanup.push(() => city.dispose());
  return { city, physicsWorld, worldOrigin, scene };
}
const simpleBlueprint = (): CityBlueprint => ({
  name: 'physics', gridSize: 3, cellSize: 20,
  grid: [
    [{ type: 'empty' }, { type: 'building', district: 'industrial' }, { type: 'empty' }],
    [{ type: 'road' }, { type: 'road' }, { type: 'road' }],
    [{ type: 'empty' }, { type: 'empty' }, { type: 'empty' }],
  ],
});

describe('PCG real Rapier integration', () => {
  it('creates solid roads/buildings and removes only city-owned bodies on clear', async () => {
    const { city, physicsWorld: pw, scene } = await physicalCity();
    city.loadBlueprint(simpleBlueprint());
    expect(city.getRootGroup().parent).toBe(scene);
    pw.step(1 / 60);
    expect(pw.raycast(new THREE.Vector3(10, 5, 0), new THREE.Vector3(0, -1, 0))?.point.y).toBeCloseTo(0.02);
    const building = city.getBuildings()[0];
    expect(pw.raycast(new THREE.Vector3(0, 100, -20), new THREE.Vector3(0, -1, 0))?.point.y).toBeCloseTo(building.height);
    expect(pw.raycast(new THREE.Vector3(-20, 2, -20), new THREE.Vector3(1, 0, 0))?.point.x).toBeCloseTo(-building.width / 2);
    const ball = pw.createRigidBody(pw.RAPIER.RigidBodyDesc.dynamic().setTranslation(10, 3, 0));
    pw.createSphereCollider(ball, 0.5, false, false, 'Player');
    for (let i = 0; i < 120; i++) pw.step(1 / 60);
    expect(ball.translation().y).toBeCloseTo(0.52, 1);
    const cityBodyCount = pw.rawWorld.bodies.len() - 1;
    city.loadBlueprint(simpleBlueprint());
    expect(pw.rawWorld.bodies.len()).toBe(cityBodyCount + 1);
    city.clear();
    expect(pw.rawWorld.bodies.len()).toBe(1);
    expect(pw.rawWorld.colliders.len()).toBe(1);
  });

  it('preserves colliders on bad blueprint loads, and toggles collision with the feature', async () => {
    const { city, physicsWorld: pw } = await physicalCity();
    city.loadBlueprint(simpleBlueprint());
    const count = pw.rawWorld.colliders.len();
    expect(() => city.loadBlueprint('missing')).toThrow();
    expect(pw.rawWorld.colliders.len()).toBe(count);
    city.setConfig({ enabled: false }); pw.step(1 / 60);
    expect(city.getRootGroup().visible).toBe(false);
    expect(pw.raycast(new THREE.Vector3(10, 5, 0), new THREE.Vector3(0, -1, 0))).toBeNull();
    city.setConfig({ enabled: true }); pw.step(1 / 60);
    expect(pw.raycast(new THREE.Vector3(10, 5, 0), new THREE.Vector3(0, -1, 0))).not.toBeNull();
    city.dispose();
    expect(pw.rawWorld.bodies.len()).toBe(0);
    expect(city.getRootGroup().parent).toBeNull();
  });

  it('keeps graphics and collisions aligned before and after floating-origin shifts', async () => {
    const { city, physicsWorld: pw, worldOrigin } = await physicalCity(new THREE.Vector3(1000, 10, -2000));
    city.loadBlueprint(simpleBlueprint());
    const assertRoadHit = () => {
      pw.step(1 / 60);
      const start = worldOrigin.toEngineSpace(new THREE.Vector3(10, 5, 0));
      expect(pw.raycast(start, new THREE.Vector3(0, -1, 0))?.point.y).toBeCloseTo(0.02 - worldOrigin.offset.y);
      expect(city.getRootGroup().position.toArray()).toEqual(worldOrigin.offset.clone().negate().toArray());
    };
    assertRoadHit();
    const shift = new THREE.Vector3(1500, 0, -1500);
    // Same scene-root + physics sequence used by ChunkManager.checkFloatingOrigin.
    city.getRootGroup().position.sub(shift);
    pw.applyFloatingOriginOffset(shift, []); worldOrigin.accumulate(shift);
    assertRoadHit();
    city.spawnBuildings(18); assertRoadHit();
    city.loadBlueprint(simpleBlueprint()); assertRoadHit();
  });

  it('supports elevated generated roads and keeps road colliders through staged builds', async () => {
    const { city, physicsWorld: pw } = await physicalCity();
    city.buildRoads({ worldSize: 200, terrainSampler: () => 10, waterSampler: () => true });
    const bodies = pw.rawWorld.bodies.len();
    const r = city.getRoads()[0];
    expect(city.getBridges().length).toBeGreaterThan(0);
    pw.step(1 / 60);
    expect(pw.raycast(new THREE.Vector3((r.p1.x + r.p2.x) / 2, 20, (r.p1.z + r.p2.z) / 2), new THREE.Vector3(0, -1, 0))?.point.y).toBeCloseTo(10.02);
    city.zoneDistricts(); city.spawnBuildings();
    expect(pw.rawWorld.bodies.len()).toBe(bodies);
    city.clear(); expect(pw.rawWorld.bodies.len()).toBe(0);
  });
});
