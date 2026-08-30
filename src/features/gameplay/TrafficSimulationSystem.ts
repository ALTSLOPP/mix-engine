import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { RoadRouteDef, TrafficCarState, TrafficSimulationConfig } from './types';
import { ContentModelInstance } from '../../content/ContentModelInstance';

export class TrafficSimulationSystem {
  private config: TrafficSimulationConfig;
  private readonly cars: TrafficCarState[] = [];
  private readonly carMeshes = new Map<string, THREE.Object3D>();
  private readonly contentModels = new Map<string, ContentModelInstance>();
  private routes: RoadRouteDef[] = [];
  private readonly rootGroup = new THREE.Group();
  private isInitialized = false;

  constructor(private readonly engine: Engine, initialConfig: TrafficSimulationConfig) {
    this.config = { ...initialConfig };
    this.rootGroup.name = 'TrafficSimulationRoot';
    this.generateDefaultRoutes();
  }

  generateDefaultRoutes(laneOffset = 4.0, roadCenters = [-120, -60, 0, 60, 120], length = 300): void {
    this.routes = [];
    let id = 1;

    // Horizontal (X-axis) routes
    for (const center of roadCenters) {
      // Eastbound
      this.routes.push({
        id: `route_h_east_${id++}`,
        axis: 'x',
        direction: 1,
        roadCenter: center,
        laneOffset: laneOffset,
        length,
      });
      // Westbound
      this.routes.push({
        id: `route_h_west_${id++}`,
        axis: 'x',
        direction: -1,
        roadCenter: center,
        laneOffset: -laneOffset,
        length,
      });
    }

    // Vertical (Z-axis) routes
    for (const center of roadCenters) {
      // Southbound
      this.routes.push({
        id: `route_v_south_${id++}`,
        axis: 'z',
        direction: 1,
        roadCenter: center,
        laneOffset: laneOffset,
        length,
      });
      // Northbound
      this.routes.push({
        id: `route_v_north_${id++}`,
        axis: 'z',
        direction: -1,
        roadCenter: center,
        laneOffset: -laneOffset,
        length,
      });
    }
  }

  setRoutes(routes: RoadRouteDef[]): void {
    this.routes = [...routes];
  }

  getRoutes(): readonly RoadRouteDef[] {
    return this.routes;
  }

  setConfig(config: Partial<TrafficSimulationConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.clear();
    }
  }

  getConfig(): Readonly<TrafficSimulationConfig> {
    return this.config;
  }

  getCars(): readonly TrafficCarState[] {
    return this.cars;
  }

  getRoot(): THREE.Group {
    return this.rootGroup;
  }

  private initPool(): void {
    this.clear();
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    for (let i = 0; i < this.config.maxCars; i++) {
      const carId = `traffic_car_${i + 1}`;
      const route = this.routes[i % Math.max(1, this.routes.length)] ?? {
        id: 'default',
        axis: 'x',
        direction: 1,
        roadCenter: 0,
        laneOffset: 4.0,
      };

      const modelAssetId = this.config.modelAssetIds[i % Math.max(1, this.config.modelAssetIds.length)] ?? 'car_sedan';

      const car: TrafficCarState = {
        id: carId,
        active: false,
        route,
        position: new THREE.Vector3(),
        speed: THREE.MathUtils.randFloat(this.config.minSpeed, this.config.maxSpeed),
        yaw: route.axis === 'x' ? (route.direction > 0 ? 0 : Math.PI) : (route.direction > 0 ? Math.PI * 0.5 : -Math.PI * 0.5),
        modelAssetId,
      };

      // Create vehicle placeholder mesh
      const geo = new THREE.BoxGeometry(2.0, 1.2, 4.4);
      const mat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = carId;
      mesh.position.set(0, -999, 0);
      mesh.visible = false;
      this.rootGroup.add(mesh);
      this.carMeshes.set(carId, mesh);

      this.cars.push(car);
    }
    this.isInitialized = true;
  }

  private spawnCarOnRoute(car: TrafficCarState, playerPos: THREE.Vector3 | null): void {
    if (this.routes.length === 0) return;
    const route = this.routes[Math.floor(Math.random() * this.routes.length)];
    car.route = route;
    car.speed = THREE.MathUtils.randFloat(this.config.minSpeed, this.config.maxSpeed);
    const maxOffset = Math.min((route.length ?? 300) * 0.5, this.config.despawnRange * 0.75);
    const centerCoord = playerPos ? (route.axis === 'x' ? playerPos.x : playerPos.z) : 0;

    for (let attempt = 0; attempt < 8; attempt++) {
      const along = centerCoord + THREE.MathUtils.randFloat(-maxOffset, maxOffset);
      if (route.axis === 'x') {
        car.position.set(along, 0.6, route.roadCenter + route.laneOffset);
        car.yaw = route.direction > 0 ? 0 : Math.PI;
      } else {
        car.position.set(route.roadCenter + route.laneOffset, 0.6, along);
        car.yaw = route.direction > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      }

      if (!playerPos || car.position.distanceTo(playerPos) >= this.config.spawnRangeMin) {
        break;
      }
    }

    car.active = true;
    const mesh = this.carMeshes.get(car.id);
    if (mesh) {
      mesh.position.copy(car.position);
      mesh.rotation.y = car.yaw;
      mesh.visible = true;
    }
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (!this.isInitialized || this.cars.length !== this.config.maxCars) {
      this.initPool();
    }

    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    const playerPos = playerRb ? playerRb.mesh.position : new THREE.Vector3(0, 0, 0);

    const despawnSq = this.config.despawnRange * this.config.despawnRange;
    const visibleSq = this.config.visibleRange * this.config.visibleRange;

    for (const car of this.cars) {
      if (!car.active) {
        this.spawnCarOnRoute(car, playerPos);
        continue;
      }

      // Step movement forward along road route
      const step = car.speed * dt;
      if (car.route.axis === 'x') {
        car.position.x += step * car.route.direction;
      } else {
        car.position.z += step * car.route.direction;
      }

      const distSq = car.position.distanceToSquared(playerPos);

      // Despawn & recycle if too far from player
      if (distSq > despawnSq) {
        car.active = false;
        const mesh = this.carMeshes.get(car.id);
        if (mesh) mesh.visible = false;
        continue;
      }

      // Sync mesh
      const mesh = this.carMeshes.get(car.id);
      if (mesh) {
        mesh.position.copy(car.position);
        mesh.rotation.y = car.yaw;
        mesh.visible = distSq <= visibleSq;
      }
    }
  }

  findNearestHijackable(
    position: THREE.Vector3,
    maxDistance = 12.0
  ): { carId: string; position: THREE.Vector3; yaw: number; speed: number; distance: number } | null {
    let best: { carId: string; position: THREE.Vector3; yaw: number; speed: number; distance: number } | null = null;
    let minDistance = maxDistance;

    for (const car of this.cars) {
      if (!car.active) continue;
      const d = car.position.distanceTo(position);
      if (d < minDistance) {
        minDistance = d;
        best = {
          carId: car.id,
          position: car.position.clone(),
          yaw: car.yaw,
          speed: car.speed,
          distance: d,
        };
      }
    }

    return best;
  }

  claimCarForPlayer(carId: string): boolean {
    const car = this.cars.find((c) => c.id === carId);
    if (!car || !car.active) return false;

    car.active = false;
    const mesh = this.carMeshes.get(car.id);
    if (mesh) mesh.visible = false;

    this.engine.sceneManager?.events?.emit('traffic_car_claimed', {
      carId,
      position: car.position.clone(),
      yaw: car.yaw,
    });
    return true;
  }

  clear(): void {
    for (const model of this.contentModels.values()) {
      model.dispose();
    }
    this.contentModels.clear();
    this.rootGroup.clear();
    this.carMeshes.clear();
    this.cars.length = 0;
    this.isInitialized = false;
  }

  dispose(): void {
    this.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }
}
