import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import {
  RoadSegment,
  Intersection,
  CityBlock,
  Lot,
  BuildingInstance,
  BridgeSpan,
  PropInstance,
  VegetationInstance,
  CityGenerationConfig,
  CityBlueprint,
} from './types';
import { RoadNetworkGenerator } from './RoadNetworkGenerator';
import { RoadMeshBuilder } from './RoadMeshBuilder';
import { DistrictZoneGenerator } from './DistrictZoneGenerator';
import { ProceduralBuildingGenerator } from './ProceduralBuildingGenerator';
import { BridgeAndTerraceGenerator } from './BridgeAndTerraceGenerator';
import { StreetPropPlacer } from './StreetPropPlacer';
import { UrbanVegetationPlacer } from './UrbanVegetationPlacer';
import { CityBlueprintSystem } from './CityBlueprintSystem';

export type CityDirectorConfig = CityGenerationConfig & { enabled: boolean };

export class ProceduralCityDirector {
  private engine?: Engine;
  private rootGroup: THREE.Group;

  private roadGenerator: RoadNetworkGenerator;
  private roadMeshBuilder: RoadMeshBuilder;
  private districtGenerator: DistrictZoneGenerator;
  private buildingGenerator: ProceduralBuildingGenerator;
  private bridgeGenerator: BridgeAndTerraceGenerator;
  private propPlacer: StreetPropPlacer;
  private vegetationPlacer: UrbanVegetationPlacer;

  // Stored state
  private config: CityDirectorConfig;
  private generationConfig: CityGenerationConfig = {};
  private readonly physicsBodies = new Map<THREE.Object3D, RigidBody>();
  private roads: RoadSegment[] = [];
  private intersections: Intersection[] = [];
  private blocks: CityBlock[] = [];
  private lots: Lot[] = [];
  private buildings: BuildingInstance[] = [];
  private bridges: BridgeSpan[] = [];
  private props: PropInstance[] = [];
  private vegetation: VegetationInstance[] = [];

  constructor(engine?: Engine, config: Partial<CityDirectorConfig> = {}) {
    this.engine = engine;
    this.config = { enabled: true, ...config };
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'ProceduralCityWorld';
    this.rootGroup.visible = this.config.enabled;
    if (engine?.worldOrigin?.offset) this.rootGroup.position.copy(engine.worldOrigin.offset).negate();

    this.roadGenerator = new RoadNetworkGenerator();
    this.roadMeshBuilder = new RoadMeshBuilder();
    this.districtGenerator = new DistrictZoneGenerator();
    this.buildingGenerator = new ProceduralBuildingGenerator();
    this.bridgeGenerator = new BridgeAndTerraceGenerator();
    this.propPlacer = new StreetPropPlacer();
    this.vegetationPlacer = new UrbanVegetationPlacer();

    const scene = this.engine?.viewport?.scene ?? (this.engine as any)?.sceneManager?.scene ?? (this.engine as any)?.scene;
    if (scene && typeof scene.add === 'function') {
      scene.add(this.rootGroup);
    }
  }

  getConfig(): Readonly<CityDirectorConfig> {
    return { ...this.config };
  }

  setConfig(patch: Partial<CityDirectorConfig>): void {
    const config = this.mergeConfig(this.config, patch) as CityDirectorConfig;
    this.validateConfig(config);
    this.config = config;
    this.rootGroup.visible = config.enabled;
    for (const body of this.physicsBodies.values()) body.setEnabled(config.enabled);
  }

  getRootGroup(): THREE.Group {
    return this.rootGroup;
  }

  getRoads(): ReadonlyArray<RoadSegment> {
    return this.roads;
  }

  getIntersections(): ReadonlyArray<Intersection> {
    return this.intersections;
  }

  getLots(): ReadonlyArray<Lot> {
    return this.lots;
  }

  getBlocks(): ReadonlyArray<CityBlock> {
    return this.blocks;
  }

  getBuildings(): ReadonlyArray<BuildingInstance> {
    return this.buildings;
  }

  getProps(): ReadonlyArray<PropInstance> {
    return this.props;
  }

  getVegetation(): ReadonlyArray<VegetationInstance> {
    return this.vegetation;
  }

  getBridges(): ReadonlyArray<BridgeSpan> {
    return this.bridges;
  }

  findNearestRoad(x: number, z: number): RoadSegment | null {
    let nearest: RoadSegment | null = null;
    let minSqDist = Infinity;

    for (const r of this.roads) {
      const midX = (r.p1.x + r.p2.x) * 0.5;
      const midZ = (r.p1.z + r.p2.z) * 0.5;
      const dx = midX - x;
      const dz = midZ - z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minSqDist) {
        minSqDist = dSq;
        nearest = r;
      }
    }

    return nearest;
  }

  clear(): void {
    for (const group of [...this.rootGroup.children]) this.removeGroup(group);
    this.generationConfig = {};

    this.roads = [];
    this.intersections = [];
    this.blocks = [];
    this.lots = [];
    this.buildings = [];
    this.bridges = [];
    this.props = [];
    this.vegetation = [];
  }

  dispose(): void {
    this.clear();
    this.rootGroup.removeFromParent();
  }

  generateWorld(config: CityGenerationConfig = {}): {
    roadCount: number;
    intersectionCount: number;
    lotCount: number;
    buildingCount: number;
    propCount: number;
    vegetationCount: number;
    bridgeCount: number;
  } {
    config = this.mergeConfig(this.config, config);
    this.validateConfig(config);
    this.clear();
    this.generationConfig = config;

    const seed = config.seed ?? 42;
    const enableSidewalks = config.enableSidewalks ?? true;
    const enableMarkings = config.enableLaneMarkings ?? true;
    const enableBuildings = config.enableBuildings ?? true;
    const enableProps = config.enableStreetProps ?? true;
    const enableVegetation = config.enableVegetation ?? true;
    const enableBridges = config.enableBridges ?? true;

    // 1. Roads & Intersections
    const { roads, intersections } = this.roadGenerator.generate(config);
    this.roads = roads;
    this.intersections = intersections;

    const roadMeshGroup = this.roadMeshBuilder.buildRoadMesh(roads, intersections, {
      enableSidewalks,
      enableLaneMarkings: enableMarkings,
    });
    roadMeshGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.receiveShadow = true;
    });
    this.addGroup(roadMeshGroup);

    // 2. Bridges
    if (enableBridges) {
      const { spans, meshGroup } = this.bridgeGenerator.generateBridges(roads, config.terrainSampler);
      this.bridges = spans;
      meshGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; }
      });
      this.addGroup(meshGroup);
    }

    // 3. Districts & Lots
    const { blocks, lots } = this.districtGenerator.generateDistrictsAndLots(roads, config);
    this.blocks = blocks;
    this.lots = lots;

    // 4. Buildings
    if (enableBuildings && lots.length > 0) {
      const { instances, meshGroup } = this.buildingGenerator.generateBuildings(lots, seed);
      this.buildings = instances;
      meshGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; }
      });
      this.addGroup(meshGroup);
    }

    // 5. Street Props
    if (enableProps && roads.length > 0) {
      const { instances, meshGroup } = this.propPlacer.generateProps(roads, intersections, lots, seed);
      this.props = instances;
      meshGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; }
      });
      this.addGroup(meshGroup);
    }

    // 6. Urban Vegetation
    if (enableVegetation && roads.length > 0) {
      const { instances, meshGroup } = this.vegetationPlacer.generateVegetation(roads, lots, seed);
      this.vegetation = instances;
      meshGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; }
      });
      this.addGroup(meshGroup);
    }

    return this.summary();
  }

  /** Start a new road layout; later stages operate on this exact network. */
  buildRoads(config: CityGenerationConfig = {}) {
    const resolved = this.mergeConfig(this.config, config);
    this.generateWorld({ ...resolved, enableBuildings: false, enableStreetProps: false, enableVegetation: false });
    this.generationConfig = resolved;
    this.blocks = [];
    this.lots = [];
    return this.summary();
  }

  /** Rezone existing roads without regenerating their geometry or colliders. */
  zoneDistricts(config: CityGenerationConfig = {}) {
    const resolved = this.mergeConfig(this.generationConfig, config);
    this.validateConfig(resolved);
    const { blocks, lots } = this.districtGenerator.generateDistrictsAndLots(this.roads, resolved);
    // Parcel-dependent output is stale after rezoning; roads and bridges stay intact.
    for (const group of [...this.rootGroup.children]) {
      if (group.name !== 'ProceduralRoadNetwork' && group.name !== 'ProceduralBridgesAndTerraces') this.removeGroup(group);
    }
    this.blocks = blocks;
    this.lots = lots;
    this.buildings = [];
    this.props = [];
    this.vegetation = [];
    this.generationConfig = resolved;
    return this.summary();
  }

  /** Populate only the current parcels, including parcels loaded from a blueprint. */
  spawnBuildings(seed = this.generationConfig.seed ?? 42) {
    this.validateConfig({ seed });
    const { instances, meshGroup } = this.buildingGenerator.generateBuildings(this.lots, seed);
    const previous = this.rootGroup.getObjectByName('ProceduralBuildings');
    if (previous) this.removeGroup(previous);
    this.buildings = instances;
    this.addGroup(meshGroup);
    return this.summary();
  }

  loadBlueprint(blueprintOrName: string | CityBlueprint): {
    roadCount: number;
    lotCount: number;
    buildingCount: number;
  } {
    let bp: CityBlueprint;
    if (typeof blueprintOrName === 'string') {
      if (blueprintOrName === 'GTA_Los_Santos' || blueprintOrName === 'gta_los_santos') {
        bp = CityBlueprintSystem.createGTALosSantosBlueprint();
      } else {
        throw new Error(
          `[ProceduralCityDirector] Unknown blueprint "${blueprintOrName}". ` +
          `Available blueprints: "GTA_Los_Santos". Pass a CityBlueprint object for custom layouts.`
        );
      }
    } else {
      bp = blueprintOrName;
    }

    const { roads, lots } = CityBlueprintSystem.parseBlueprint(bp);
    // Resolve and validate before replacing any existing map or physics bodies.
    this.clear();
    this.generationConfig = { ...this.config, worldSize: bp.gridSize * bp.cellSize, seed: 1337 };
    this.roads = roads;
    this.lots = lots;

    const roadMeshGroup = this.roadMeshBuilder.buildRoadMesh(roads, [], {
      enableSidewalks: true,
      enableLaneMarkings: true,
    });
    this.addGroup(roadMeshGroup);

    const { instances, meshGroup } = this.buildingGenerator.generateBuildings(lots, 1337);
    this.buildings = instances;
    this.addGroup(meshGroup);

    return {
      roadCount: this.roads.length,
      lotCount: this.lots.length,
      buildingCount: this.buildings.length,
    };
  }

  private summary() {
    return {
      roadCount: this.roads.length, intersectionCount: this.intersections.length,
      lotCount: this.lots.length, buildingCount: this.buildings.length,
      propCount: this.props.length, vegetationCount: this.vegetation.length,
      bridgeCount: this.bridges.length,
    };
  }

  private mergeConfig(base: CityGenerationConfig, patch: CityGenerationConfig): CityGenerationConfig {
    return { ...base, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) };
  }

  private validateConfig(config: CityGenerationConfig): void {
    if (config.worldSize !== undefined && (!Number.isFinite(config.worldSize) || config.worldSize <= 0)) {
      throw new Error('City worldSize must be a positive finite number.');
    }
    if (config.seed !== undefined && !Number.isFinite(config.seed)) throw new Error('City seed must be finite.');
    if (config.roadDensity !== undefined && (!Number.isFinite(config.roadDensity) || config.roadDensity < 0 || config.roadDensity > 1)) {
      throw new Error('City roadDensity must be between 0 and 1.');
    }
    if (config.roadAlgorithm !== undefined && !['Grid', 'Organic', 'Radial'].includes(config.roadAlgorithm)) {
      throw new Error('Unknown city road algorithm.');
    }
  }

  /** Keep static collision geometry in city-local space, with a body at the root.
   * ChunkManager shifts both scene roots and PhysicsWorld-owned bodies on rebasing.
   */
  private addGroup(group: THREE.Group): void {
    this.rootGroup.add(group);
    this.rootGroup.updateWorldMatrix(true, true);
    const physics = this.engine?.physicsWorld;
    const inverseRoot = this.rootGroup.matrixWorld.clone().invert();
    let body: RigidBody | undefined;
    try {
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.userData.isObstacle) obj.castShadow = true;
        obj.receiveShadow = true;
        // A standalone/headless director can generate meshes without a physics host.
        if (!physics?.createTrimeshCollider || !physics.createRigidBody) return;
        if (!obj.userData.isWalkable && !obj.userData.isObstacle && !obj.userData.isDrivable) return;
        const geometry = obj.geometry;
        const position = geometry.getAttribute('position');
        if (!position?.count) return;
        if (!body) {
          const p = this.rootGroup.position;
          body = physics.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z));
          this.physicsBodies.set(group, body);
          body.setEnabled(this.config.enabled);
        }
        const transform = new THREE.Matrix4().multiplyMatrices(inverseRoot, obj.matrixWorld);
        const vertices = new Float32Array(position.count * 3);
        const vertex = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(transform).toArray(vertices, i * 3);
        }
        const indices = geometry.index
          ? Uint32Array.from(geometry.index.array)
          : Uint32Array.from({ length: position.count }, (_, i) => i);
        physics.createTrimeshCollider(body, vertices, indices, false, 'StaticTerrain');
      });
    } catch (error) {
      this.removeGroup(group);
      throw error;
    }
  }

  private removeGroup(group: THREE.Object3D): void {
    const body = this.physicsBodies.get(group);
    if (body) {
      this.engine!.physicsWorld.removeBody(body);
      this.physicsBodies.delete(group);
    }
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) material.dispose();
    });
    group.removeFromParent();
  }
}
