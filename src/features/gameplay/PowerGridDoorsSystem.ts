import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { BuyableDoorDef, PowerGridConfig, PowerGridState, TrapDef } from './types';

export const DEFAULT_BUYABLE_DOORS: BuyableDoorDef[] = [
  { id: 'door_hallway_east', name: 'East Hallway Gate', cost: 750, position: { x: 12, y: 0, z: 0 }, isOpened: false },
  { id: 'door_courtyard_west', name: 'Courtyard Debris', cost: 1000, position: { x: -12, y: 0, z: 0 }, isOpened: false },
  { id: 'door_power_room', name: 'Power Station Door', cost: 1250, position: { x: 0, y: 0, z: -15 }, isOpened: false },
];

export const DEFAULT_TRAPS: TrapDef[] = [
  {
    id: 'trap_electric_hall',
    name: 'Electric Hallway Gate',
    type: 'electric_gate',
    cost: 1000,
    durationSec: 25.0,
    cooldownSec: 60.0,
    position: { x: 12, y: 0, z: 5 },
    damagePerSec: 500,
  },
  {
    id: 'trap_flame_courtyard',
    name: 'Courtyard Flame Jet',
    type: 'flame_jet',
    cost: 1000,
    durationSec: 20.0,
    cooldownSec: 45.0,
    position: { x: -12, y: 0, z: 5 },
    damagePerSec: 400,
  },
];

export const DEFAULT_POWER_GRID_CONFIG: PowerGridConfig = {
  enabled: true,
  requiresPowerForPerks: true,
  requiresPowerForTraps: true,
  doors: DEFAULT_BUYABLE_DOORS,
  traps: DEFAULT_TRAPS,
};

export class PowerGridDoorsSystem {
  private config: PowerGridConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly doorMeshes = new Map<string, THREE.Mesh>();
  private readonly unsubs: Array<() => void> = [];

  private readonly state: PowerGridState = {
    isPowerOn: false,
    openedDoorIds: [],
    activeTraps: {},
  };

  constructor(private readonly engine: Engine, initialConfig: PowerGridConfig = DEFAULT_POWER_GRID_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.name = 'PowerGridDoorsRoot';
    this.setupVisuals();
  }

  private setupVisuals(): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    // Door obstacle meshes
    for (const door of this.config.doors) {
      const geo = new THREE.BoxGeometry(1.0, 3.0, 3.0);
      const mat = new THREE.MeshBasicMaterial({ color: 0x554433 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `DoorMesh_${door.id}`;
      mesh.position.set(door.position.x, door.position.y + 1.5, door.position.z);
      this.rootGroup.add(mesh);
      this.doorMeshes.set(door.id, mesh);
    }
  }

  setConfig(config: Partial<PowerGridConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<PowerGridConfig> {
    return this.config;
  }

  getState(): Readonly<PowerGridState> {
    return this.state;
  }

  isPowerOn(atPosition?: THREE.Vector3): boolean {
    if (this.state.isPowerOn) return true;
    if (atPosition) {
      const buildables = (this.engine.gameplayFeatures as any)?.zombieBuildables;
      const deployed = buildables?.getState?.()?.deployedBuildables ?? [];
      const hasTurbineNearby = deployed.some(
        (d: any) => d.type === 'turbine_generator' && d.position.distanceTo(atPosition) <= 12.0
      );
      if (hasTurbineNearby) return true;
    }
    return false;
  }

  turnPowerOn(): void {
    if (this.state.isPowerOn) return;

    this.state.isPowerOn = true;
    this.engine.audio?.play?.('/assets/audio/power_switch_on.wav', { volume: 1.0 });
    this.engine.sceneManager?.events?.emit('power_turned_on', {});
  }

  isDoorOpened(doorId: string): boolean {
    return this.state.openedDoorIds.includes(doorId);
  }

  buyDoor(doorId: string): boolean {
    if (this.isDoorOpened(doorId)) return false;

    const door = this.config.doors.find((d) => d.id === doorId);
    if (!door) return false;

    let cost = door.cost;
    if ((this.engine.gameplayFeatures as any)?.gobbleGums?.isGumActive?.('shopping_free')) {
      cost = 0;
    }

    const currentScore = (this.engine.sceneManager?.gameState as any)?.score ?? 999999;
    if (currentScore < cost) {
      this.engine.sceneManager?.events?.emit('door_insufficient_points', { cost, currentScore });
      return false;
    }

    if (cost > 0) {
      (this.engine.sceneManager?.gameState as any)?.addScore?.(-cost);
    }

    this.state.openedDoorIds.push(doorId);
    const mesh = this.doorMeshes.get(doorId);
    if (mesh) {
      mesh.visible = false;
    }

    this.engine.audio?.play?.('/assets/audio/door_open.wav', { volume: 0.8 });
    this.engine.sceneManager?.events?.emit('door_opened', {
      doorId,
      name: door.name,
      cost,
    });

    return true;
  }

  activateTrap(trapId: string): boolean {
    const trap = this.config.traps.find((t) => t.id === trapId);
    if (!trap) return false;

    const trapPos = new THREE.Vector3(trap.position.x, trap.position.y, trap.position.z);
    if (this.config.requiresPowerForTraps && !this.isPowerOn(trapPos)) {
      this.engine.sceneManager?.events?.emit('trap_needs_power', { trapId });
      return false;
    }

    const trapState = this.state.activeTraps[trapId];
    if (trapState && (trapState.timeRemaining > 0 || trapState.cooldownRemaining > 0)) {
      return false;
    }

    const currentScore = (this.engine.sceneManager?.gameState as any)?.score ?? 999999;
    if (currentScore < trap.cost) {
      return false;
    }

    (this.engine.sceneManager?.gameState as any)?.addScore?.(-trap.cost);

    this.state.activeTraps[trapId] = {
      timeRemaining: trap.durationSec,
      cooldownRemaining: trap.durationSec + trap.cooldownSec,
    };

    if (trap.type === 'electric_gate') {
      this.engine.burstVfx?.('electric', trapPos, 20);
    } else {
      this.engine.burstVfx?.('fire', trapPos, 20);
    }

    this.engine.sceneManager?.events?.emit('trap_activated', {
      trapId,
      type: trap.type,
      durationSec: trap.durationSec,
    });

    return true;
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    for (const [trapId, t] of Object.entries(this.state.activeTraps)) {
      if (t.timeRemaining > 0) {
        t.timeRemaining -= dt;
        if (t.timeRemaining <= 0) {
          t.timeRemaining = 0;
          this.engine.sceneManager?.events?.emit('trap_deactivated', { trapId });
        }
      }
      if (t.cooldownRemaining > 0) {
        t.cooldownRemaining -= dt;
        if (t.cooldownRemaining <= 0) {
          t.cooldownRemaining = 0;
          this.engine.sceneManager?.events?.emit('trap_ready', { trapId });
        }
      }
    }
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.engine.viewport?.scene?.remove(this.rootGroup);
    this.rootGroup.clear();
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      isPowerOn: this.state.isPowerOn,
      openedDoorIds: [...this.state.openedDoorIds],
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    if (typeof data.enabled === 'boolean') this.config.enabled = data.enabled;
    if (typeof data.isPowerOn === 'boolean') this.state.isPowerOn = data.isPowerOn;
    if (Array.isArray(data.openedDoorIds)) {
      this.state.openedDoorIds = [...data.openedDoorIds];
      for (const id of this.state.openedDoorIds) {
        const mesh = this.doorMeshes.get(id);
        if (mesh) mesh.visible = false;
      }
    }
  }
}
