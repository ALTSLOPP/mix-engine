import { disposeOwnedObject } from './DisposeOwnedObject';
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { CivilianBehaviorMode, CivilianPopulationConfig, CivilianState } from './types';

export class CivilianPopulationSystem {
  private config: CivilianPopulationConfig;
  private readonly civilians: CivilianState[] = [];
  private readonly civilianMeshes = new Map<string, THREE.Object3D>();
  private readonly rootGroup = new THREE.Group();
  private isInitialized = false;
  private nextCivId = 1;
  private readonly recoveryTimers = new Map<string, number>();
  private readonly unsubs: (() => void)[] = [];

  constructor(private readonly engine: Engine, initialConfig: CivilianPopulationConfig) {
    this.config = { ...initialConfig };
    this.rootGroup.visible = this.config.enabled;
    this.rootGroup.name = 'CivilianPopulationRoot';
    this.bindEvents();
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    const u1 = events.on('grenade_exploded', (e: any) => {
      if (e?.position) {
        this.reactToGunfire(e.position, this.config.panicRadius * 1.5);
      }
    });

    const u2 = events.on('crosshair_hit', (e: any) => {
      if (e?.targetId) {
        const rb = this.engine.sceneManager.getRigidBody(e.targetId);
        if (rb) this.reactToGunfire(rb.mesh.position, this.config.panicRadius);
      }
    });

    if (u1) this.unsubs.push(u1);
    if (u2) this.unsubs.push(u2);
  }

  setConfig(config: Partial<CivilianPopulationConfig>): void {
    this.config = { ...this.config, ...config };
    this.rootGroup.visible = this.config.enabled;
    if (!this.config.enabled) {
      this.clear();
    }
  }

  getConfig(): Readonly<CivilianPopulationConfig> {
    return this.config;
  }

  getCivilians(): readonly CivilianState[] {
    return this.civilians;
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

    const total = this.config.maxWalkers + this.config.maxDrivers;
    for (let i = 0; i < total; i++) {
      const isDriver = i >= this.config.maxWalkers;
      const civId = `civ_${this.nextCivId++}`;
      const modelAssetId = this.config.modelAssetIds[i % Math.max(1, this.config.modelAssetIds.length)] ?? 'civ_walker';

      const civ: CivilianState = {
        id: civId,
        entityId: null,
        mode: isDriver ? 'driving' : 'walking',
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(),
        yaw: 0,
        health: this.config.health,
        panicTimer: 0,
        panicOrigin: null,
        modelAssetId,
      };

      const geo = isDriver
        ? new THREE.BoxGeometry(1.8, 1.2, 4.0)
        : new THREE.CapsuleGeometry(0.35, 1.1, 4, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: isDriver ? 0x475569 : 0x38bdf8,
        roughness: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = civId;
      mesh.position.set(0, -999, 0);
      mesh.visible = false;
      this.rootGroup.add(mesh);
      this.civilianMeshes.set(civId, mesh);

      this.civilians.push(civ);
    }
    this.isInitialized = true;
  }

  private spawnCivilian(civ: CivilianState, playerPos: THREE.Vector3): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = THREE.MathUtils.randFloat(this.config.spawnRangeMin, this.config.despawnRange * 0.7);

    civ.position.set(
      playerPos.x + Math.cos(angle) * dist,
      0.9,
      playerPos.z + Math.sin(angle) * dist
    );
    civ.yaw = Math.random() * Math.PI * 2;
    civ.health = this.config.health;
    this.recoveryTimers.delete(civ.id);
    civ.panicTimer = 0;
    civ.panicOrigin = null;

    if (civ.mode === 'dead' || civ.mode === 'ejected') {
      civ.mode = Math.random() > 0.3 ? 'walking' : 'idle';
    }

    const mesh = this.civilianMeshes.get(civ.id);
    if (mesh) {
      mesh.position.copy(civ.position);
      mesh.rotation.set(0, civ.yaw, 0);
      mesh.visible = true;
    }
  }

  reactToGunfire(origin: THREE.Vector3, radius = this.config.panicRadius): void {
    if (!this.config.enabled) return;

    for (const civ of this.civilians) {
      if (civ.mode === 'dead') continue;
      const d = civ.position.distanceTo(origin);
      if (d <= radius) {
        civ.mode = 'panicking';
        civ.panicTimer = THREE.MathUtils.randFloat(4.0, 8.0);
        civ.panicOrigin = origin.clone();

        // Flee vector directly away from sound origin
        const fleeDir = civ.position.clone().sub(origin);
        fleeDir.y = 0;
        if (fleeDir.lengthSq() > 1e-4) {
          fleeDir.normalize();
          civ.yaw = Math.atan2(fleeDir.x, fleeDir.z);
        }

        this.engine.sceneManager?.events?.emit('civilian_panicked', {
          civilianId: civ.id,
          position: civ.position.clone(),
        });
      }
    }
  }

  applyDamage(civId: string, damage: number, attackerId: EntityId | null = null): boolean {
    if (!this.config.enabled || !Number.isFinite(damage) || damage < 0) return false;
    const civ = this.civilians.find((c) => c.id === civId);
    if (!civ || civ.mode === 'dead') return false;

    civ.health = Math.max(0, civ.health - damage);

    if (civ.health <= 0) {
      civ.mode = 'dead';
      this.recoveryTimers.set(civ.id, 15);
      const mesh = this.civilianMeshes.get(civ.id);
      if (mesh) {
        mesh.rotation.x = Math.PI * 0.5; // Fall over
      }
      this.engine.sceneManager?.events?.emit('civilian_killed', {
        civilianId: civ.id,
        position: civ.position.clone(),
        killerEntityId: attackerId,
      });
      return true;
    } else {
      civ.mode = 'panicking';
      civ.panicTimer = 6.0;
      return false;
    }
  }

  ejectDriver(civId: string, ejectionDirection: THREE.Vector3): void {
    if (!this.config.enabled) return;
    const civ = this.civilians.find((c) => c.id === civId);
    if (!civ || civ.mode === 'dead') return;

    civ.mode = 'ejected';
    civ.vehicleId = null;
    this.recoveryTimers.set(civ.id, 1);
    civ.position.addScaledVector(ejectionDirection.normalize(), 2.0);
    civ.position.y = 0.5;
    civ.health = Math.max(10, civ.health - 20);

    const mesh = this.civilianMeshes.get(civ.id);
    if (mesh) {
      mesh.position.copy(civ.position);
    }

    this.engine.sceneManager?.events?.emit('civilian_ejected', {
      civilianId: civ.id,
      position: civ.position.clone(),
    });
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    const targetCount = this.config.maxWalkers + this.config.maxDrivers;
    if (!this.isInitialized || this.civilians.length !== targetCount) {
      this.initPool();
    }

    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    const playerPos = playerRb ? playerRb.mesh.position : new THREE.Vector3(0, 0, 0);

    const despawnSq = this.config.despawnRange * this.config.despawnRange;

    for (const civ of this.civilians) {
      const distSq = civ.position.distanceToSquared(playerPos);

      // Despawn & recycle if too far or dead/ejected and far
      if (distSq > despawnSq || (civ.position.y < -100)) {
        this.spawnCivilian(civ, playerPos);
        continue;
      }

      if (civ.mode === 'dead' || civ.mode === 'ejected') {
        const remaining = (this.recoveryTimers.get(civ.id) ?? (civ.mode === 'dead' ? 15 : 1)) - dt;
        this.recoveryTimers.set(civ.id, remaining);
        if (remaining > 0) continue;
        this.recoveryTimers.delete(civ.id);
        if (civ.mode === 'dead') { this.spawnCivilian(civ, playerPos); continue; }
        civ.mode = 'fleeing';
        civ.panicTimer = 6;
      }

      if (civ.mode === 'panicking' || civ.mode === 'fleeing') {
        civ.panicTimer -= dt;
        if (civ.panicTimer <= 0) {
          civ.mode = 'walking';
          civ.panicOrigin = null;
        } else {
          // Move quickly along yaw away from panic origin
          const forward = new THREE.Vector3(Math.sin(civ.yaw), 0, Math.cos(civ.yaw));
          civ.position.addScaledVector(forward, this.config.panicSpeed * dt);
        }
      } else if (civ.mode === 'walking') {
        // Normal pace walking
        const forward = new THREE.Vector3(Math.sin(civ.yaw), 0, Math.cos(civ.yaw));
        civ.position.addScaledVector(forward, this.config.walkerSpeed * dt);

        // Random heading wander
        if (Math.random() < 0.02) {
          civ.yaw += THREE.MathUtils.randFloat(-0.5, 0.5);
        }
      } else if (civ.mode === 'driving') {
        const cars = this.engine.gameplayFeatures?.traffic.getCars() ?? [];
        let car = cars.find(c => c.id === civ.vehicleId && c.active);
        if (!car) car = cars.find(c => c.active && !c.driverId);
        if (car) {
          car.driverId = civ.id;
          civ.vehicleId = car.id;
          civ.position.copy(car.position);
          civ.yaw = car.yaw;
          const mesh = this.civilianMeshes.get(civ.id);
          if (mesh) mesh.visible = false;
          continue;
        }
        // Driving straight along yaw
        const forward = new THREE.Vector3(Math.sin(civ.yaw), 0, Math.cos(civ.yaw));
        civ.position.addScaledVector(forward, this.config.walkerSpeed * 3.5 * dt);
      }

      // Sync mesh
      const mesh = this.civilianMeshes.get(civ.id);
      if (mesh) {
        mesh.position.copy(civ.position);
        mesh.rotation.y = civ.yaw;
        mesh.visible = true;
      }
    }
  }

  clear(): void {
    this.recoveryTimers.clear();
    for (const car of this.engine.gameplayFeatures?.traffic.getCars() ?? []) car.driverId = null;
    disposeOwnedObject(this.rootGroup);
    this.civilianMeshes.clear();
    this.civilians.length = 0;
    this.isInitialized = false;
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }
}
