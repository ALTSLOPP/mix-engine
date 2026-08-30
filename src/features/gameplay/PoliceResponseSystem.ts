import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { PoliceResponseConfig, PoliceUnitMode, PoliceUnitRole, PoliceUnitState } from './types';

export const DEFAULT_POLICE_CONFIG: PoliceResponseConfig = {
  enabled: true,
  maxUnits: 8,
  basePatrolUnits: 2,
  unitsPerWantedLevel: 1,
  officerSpeed: 4.8,
  cruiserSpeed: 18.0,
  arrestDistance: 2.5,
  shootDistance: 22.0,
  shootInterval: 0.8,
  officerModelAssetId: 'police_officer',
  cruiserModelAssetId: 'police_cruiser',
};

export class PoliceResponseSystem {
  private config: PoliceResponseConfig;
  private readonly units: PoliceUnitState[] = [];
  private readonly unitMeshes = new Map<string, THREE.Object3D>();
  private readonly rootGroup = new THREE.Group();
  private isInitialized = false;
  private arrestProgress = 0;
  private nextUnitId = 1;

  constructor(private readonly engine: Engine, initialConfig: PoliceResponseConfig = DEFAULT_POLICE_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.name = 'PoliceResponseRoot';
  }

  setConfig(config: Partial<PoliceResponseConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.clear();
    }
  }

  getConfig(): Readonly<PoliceResponseConfig> {
    return this.config;
  }

  getUnits(): readonly PoliceUnitState[] {
    return this.units;
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

    for (let i = 0; i < this.config.maxUnits; i++) {
      const unitId = `police_unit_${this.nextUnitId++}`;
      const isCruiser = i % 2 === 0;

      const unit: PoliceUnitState = {
        id: unitId,
        role: 'patrol',
        mode: isCruiser ? 'patrol' : 'pursuit_foot',
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(),
        yaw: 0,
        health: 100,
        targetPosition: null,
        shootCooldown: 0,
        officerEntityId: null,
        cruiserEntityId: null,
      };

      const geo = isCruiser
        ? new THREE.BoxGeometry(2.1, 1.2, 4.6)
        : new THREE.CapsuleGeometry(0.35, 1.2, 4, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: isCruiser ? 0x1e293b : 0x0f172a,
        roughness: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = unitId;
      mesh.position.set(0, -999, 0);
      mesh.visible = false;
      this.rootGroup.add(mesh);
      this.unitMeshes.set(unitId, mesh);

      this.units.push(unit);
    }
    this.isInitialized = true;
  }

  private spawnUnit(unit: PoliceUnitState, playerPos: THREE.Vector3, isResponse: boolean): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = isResponse
      ? THREE.MathUtils.randFloat(35, 70)
      : THREE.MathUtils.randFloat(60, 110);

    unit.position.set(
      playerPos.x + Math.cos(angle) * dist,
      0.8,
      playerPos.z + Math.sin(angle) * dist
    );
    unit.yaw = angle + Math.PI; // Face towards player area
    unit.health = 100;
    unit.role = isResponse ? 'response' : 'patrol';
    unit.mode = isResponse ? 'pursuit_drive' : 'patrol';
    unit.targetPosition = playerPos.clone();

    const mesh = this.unitMeshes.get(unit.id);
    if (mesh) {
      mesh.position.copy(unit.position);
      mesh.rotation.y = unit.yaw;
      mesh.visible = true;
    }
  }

  update(dt: number, wantedLevel = 0, playerInVehicle = false): void {
    if (!this.config.enabled) return;

    if (!this.isInitialized || this.units.length !== this.config.maxUnits) {
      this.initPool();
    }

    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    const playerPos = playerRb ? playerRb.mesh.position : new THREE.Vector3(0, 0, 0);

    // Calculate active target unit capacity based on wanted level
    const targetActiveCount = wantedLevel === 0
      ? this.config.basePatrolUnits
      : Math.min(
          this.config.maxUnits,
          this.config.basePatrolUnits + wantedLevel * this.config.unitsPerWantedLevel
        );

    let activeCount = 0;
    let anyUnitChasing = false;
    let nearestOfficerDist = Infinity;

    for (let i = 0; i < this.units.length; i++) {
      const unit = this.units[i];

      if (i >= targetActiveCount) {
        // Deactivate excess units
        unit.position.set(0, -999, 0);
        const mesh = this.unitMeshes.get(unit.id);
        if (mesh) mesh.visible = false;
        continue;
      }

      activeCount++;
      const distToPlayer = unit.position.distanceTo(playerPos);

      // Despawn if out of range or uninitialized
      if (unit.position.y < -100 || distToPlayer > 180) {
        this.spawnUnit(unit, playerPos, wantedLevel > 0);
        continue;
      }

      if (wantedLevel > 0) {
        anyUnitChasing = true;
        if (distToPlayer < nearestOfficerDist) {
          nearestOfficerDist = distToPlayer;
        }

        // Mode Switching: if player is on foot and unit is close (<18m), officer exits vehicle to pursue on foot
        if (!playerInVehicle && unit.mode === 'pursuit_drive' && distToPlayer <= 18.0) {
          unit.mode = 'exiting_vehicle';
          setTimeout(() => {
            if (unit.mode === 'exiting_vehicle') unit.mode = 'pursuit_foot';
          }, 600);
        } else if (playerInVehicle && unit.mode === 'pursuit_foot' && distToPlayer > 30.0) {
          unit.mode = 'pursuit_drive';
        }

        // Behavior Execution
        const toPlayer = playerPos.clone().sub(unit.position);
        toPlayer.y = 0;
        const moveDir = toPlayer.clone().normalize();
        unit.yaw = Math.atan2(moveDir.x, moveDir.z);

        if (unit.mode === 'pursuit_drive') {
          const speed = this.config.cruiserSpeed;
          unit.position.addScaledVector(moveDir, speed * dt);
        } else if (unit.mode === 'pursuit_foot') {
          const speed = this.config.officerSpeed;
          if (distToPlayer > this.config.arrestDistance) {
            unit.position.addScaledVector(moveDir, speed * dt);
          }

          // Combat shooting when at 3+ stars
          if (wantedLevel >= 3 && distToPlayer <= this.config.shootDistance) {
            unit.shootCooldown -= dt;
            if (unit.shootCooldown <= 0) {
              unit.shootCooldown = this.config.shootInterval;
              this.engine.burstVfx?.('muzzle_flash', unit.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 5);
              if (playerEntityId !== null) {
                this.engine.combat?.applyDamage?.(null, playerEntityId, 8);
              }
              this.engine.audio?.play?.('/assets/fps-starter/audio/pistol-single.wav', { volume: 0.6, loop: false });
            }
          }
        }
      } else {
        // Peaceful patrol
        const forward = new THREE.Vector3(Math.sin(unit.yaw), 0, Math.cos(unit.yaw));
        unit.position.addScaledVector(forward, this.config.cruiserSpeed * 0.4 * dt);
        if (Math.random() < 0.015) unit.yaw += THREE.MathUtils.randFloat(-0.4, 0.4);
      }

      // Sync visual mesh
      const mesh = this.unitMeshes.get(unit.id);
      if (mesh) {
        mesh.position.copy(unit.position);
        mesh.rotation.y = unit.yaw;
        mesh.visible = true;
      }
    }

    // Arrest / Bust check
    if (wantedLevel > 0 && !playerInVehicle && nearestOfficerDist <= this.config.arrestDistance) {
      this.arrestProgress += dt;
      if (this.arrestProgress >= 2.0) {
        this.arrestProgress = 0;
        this.engine.sceneManager?.events?.emit('player_busted', {
          wantedLevel,
          position: playerPos.clone(),
        });
      }
    } else {
      this.arrestProgress = Math.max(0, this.arrestProgress - dt * 2.0);
    }

    // Update pursuit status in Wanted system
    const wantedSystem = this.engine.gameplayFeatures?.wanted;
    if (wantedSystem) {
      wantedSystem.setPursuitActive(anyUnitChasing && nearestOfficerDist < 80.0);
    }
  }

  clear(): void {
    this.rootGroup.clear();
    this.unitMeshes.clear();
    this.units.length = 0;
    this.isInitialized = false;
    this.arrestProgress = 0;
  }

  dispose(): void {
    this.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }
}
