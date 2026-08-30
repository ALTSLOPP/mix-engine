import { disposeOwnedObject } from './DisposeOwnedObject';
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import { applyGameplayHit } from './GameplayHit';
import type { BuildableItemType, DeployedBuildable, ScavengedPart, ZombieBuildablesConfig, ZombieBuildablesState } from './types';

export const DEFAULT_ZOMBIE_PARTS: ScavengedPart[] = [
  { id: 'part_shield_dolly', name: 'Riot Dolly', requiredFor: 'riot_shield', collected: false, spawnPosition: { x: 5, y: 0, z: 5 } },
  { id: 'part_shield_clamp', name: 'Steel Clamp', requiredFor: 'riot_shield', collected: false, spawnPosition: { x: -8, y: 0, z: -4 } },
  { id: 'part_shield_visor', name: 'Ballistic Visor', requiredFor: 'riot_shield', collected: false, spawnPosition: { x: 12, y: 0, z: -10 } },
  { id: 'part_turbine_fan', name: 'Mannequin Fan', requiredFor: 'turbine_generator', collected: false, spawnPosition: { x: 0, y: 0, z: 2 } },
  { id: 'part_turbine_fin', name: 'Rudder Fin', requiredFor: 'turbine_generator', collected: false, spawnPosition: { x: -3, y: 0, z: 3 } },
];

export const DEFAULT_ZOMBIE_BUILDABLES_CONFIG: ZombieBuildablesConfig = {
  enabled: true,
  shieldMaxDurability: 500,
  turbineDurationSec: 120.0,
  sentryDamage: 45,
  parts: DEFAULT_ZOMBIE_PARTS,
};

export class ZombieBuildablesSystem {
  private config: ZombieBuildablesConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly buildableMeshes = new Map<string, THREE.Group>();
  private readonly unsubs: Array<() => void> = [];
  private nextDeployedId = 1;

  private readonly state: ZombieBuildablesState = {
    assembledItems: [],
    deployedBuildables: [],
    activeShieldDurability: 0,
  };

  constructor(private readonly engine: Engine, initialConfig: ZombieBuildablesConfig = DEFAULT_ZOMBIE_BUILDABLES_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.visible = this.config.enabled;
    this.rootGroup.name = 'ZombieBuildablesRoot';
    this.setupVisuals();
  }

  private setupVisuals(): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }
  }

  setConfig(config: Partial<ZombieBuildablesConfig>): void {
    this.config = { ...this.config, ...config };
    this.rootGroup.visible = this.config.enabled;
  }

  getConfig(): Readonly<ZombieBuildablesConfig> {
    return this.config;
  }

  getState(): Readonly<ZombieBuildablesState> {
    return this.state;
  }

  collectPart(partId: string): boolean {
    if (!this.config.enabled) return false;
    const part = this.config.parts.find((p) => p.id === partId);
    if (!part || part.collected) return false;

    part.collected = true;
    this.engine.burstVfx?.('sparks', new THREE.Vector3(part.spawnPosition.x, part.spawnPosition.y + 0.5, part.spawnPosition.z), 6);
    this.engine.audio?.play?.('/assets/audio/part_pickup.wav', { volume: 0.8 });
    this.engine.sceneManager?.events?.emit('buildable_part_collected', { partId, name: part.name, requiredFor: part.requiredFor });

    return true;
  }

  canAssemble(type: BuildableItemType): boolean {
    if (!this.config.enabled) return false;
    const neededParts = this.config.parts.filter((p) => p.requiredFor === type);
    return neededParts.length > 0 && neededParts.every((p) => p.collected);
  }

  assembleItem(type: BuildableItemType): boolean {
    if (!this.canAssemble(type) || this.state.assembledItems.includes(type)) return false;

    this.state.assembledItems.push(type);
    if (type === 'riot_shield') {
      this.state.activeShieldDurability = this.config.shieldMaxDurability;
    }

    this.engine.burstVfx?.('glow', new THREE.Vector3(0, 1, 0), 12);
    this.engine.audio?.play?.('/assets/audio/craft_complete.wav', { volume: 1.0 });
    this.engine.sceneManager?.events?.emit('buildable_assembled', { type });

    return true;
  }

  hasShield(): boolean {
    return this.config.enabled && this.state.assembledItems.includes('riot_shield') && this.state.activeShieldDurability > 0;
  }

  blockDamageWithShield(incomingDamage: number): number {
    if (!this.hasShield()) return incomingDamage;

    const absorbed = Math.min(this.state.activeShieldDurability, incomingDamage);
    this.state.activeShieldDurability -= absorbed;
    const overflow = incomingDamage - absorbed;

    this.engine.burstVfx?.('sparks', this.engine.viewport?.camera?.position?.clone() ?? new THREE.Vector3(), 8);

    if (this.state.activeShieldDurability <= 0) {
      this.state.activeShieldDurability = 0;
      this.engine.audio?.play?.('/assets/audio/shield_break.wav', { volume: 1.0 });
      this.engine.sceneManager?.events?.emit('shield_broken', {});
    }

    return overflow;
  }

  deployItem(type: BuildableItemType, position: THREE.Vector3): DeployedBuildable | null {
    if (!this.config.enabled) return null;
    if (!this.state.assembledItems.includes(type) && type !== 'turbine_generator') return null;

    const id = `deployed_${type}_${this.nextDeployedId++}`;
    const deployed: DeployedBuildable = {
      id,
      type,
      position: position.clone(),
      health: 200,
      maxHealth: 200,
      timeRemaining: type === 'turbine_generator' ? this.config.turbineDurationSec : undefined,
    };

    this.state.deployedBuildables.push(deployed);
    this.createDeployedMesh(deployed);

    this.engine.sceneManager?.events?.emit('buildable_deployed', { id, type, position: position.clone() });
    return deployed;
  }

  private createDeployedMesh(deployed: DeployedBuildable): void {
    const group = new THREE.Group();
    group.name = `Deployed_${deployed.id}`;
    group.position.copy(deployed.position);

    const geo = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const mat = new THREE.MeshBasicMaterial({ color: deployed.type === 'turbine_generator' ? 0x00aaff : 0x444444 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.6;
    group.add(mesh);

    this.rootGroup.add(group);
    this.buildableMeshes.set(deployed.id, group);
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    for (let i = this.state.deployedBuildables.length - 1; i >= 0; i--) {
      const d = this.state.deployedBuildables[i];
      if (d.timeRemaining !== undefined) {
        d.timeRemaining -= dt;
        if (d.timeRemaining <= 0) {
          const mesh = this.buildableMeshes.get(d.id);
          if (mesh) {
            disposeOwnedObject(mesh);
            this.rootGroup.remove(mesh);
            this.buildableMeshes.delete(d.id);
          }
          this.state.deployedBuildables.splice(i, 1);
          this.engine.sceneManager?.events?.emit('buildable_expired', { id: d.id, type: d.type });
        }
      }
    }
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.state.deployedBuildables.length = 0;
    for (const m of this.buildableMeshes.values()) { disposeOwnedObject(m); this.rootGroup.remove(m); }
    this.buildableMeshes.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      assembledItems: [...this.state.assembledItems],
      activeShieldDurability: this.state.activeShieldDurability,
      deployedBuildables: this.state.deployedBuildables, nextDeployedId: this.nextDeployedId,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    for (const mesh of this.buildableMeshes.values()) { disposeOwnedObject(mesh); this.rootGroup.remove(mesh); }
    this.buildableMeshes.clear();
    this.state.assembledItems = [];
    this.state.activeShieldDurability = 0;
    this.state.deployedBuildables = [];
    this.nextDeployedId = Number(data.nextDeployedId ?? 1);
    for (const item of Array.isArray(data.deployedBuildables) ? data.deployedBuildables : []) {
      const deployed = { ...item, position: new THREE.Vector3(item.position.x, item.position.y, item.position.z) };
      this.state.deployedBuildables.push(deployed);
      this.createDeployedMesh(deployed);
    }
    if (typeof data.enabled === 'boolean') this.setConfig({ enabled: data.enabled });
    if (Array.isArray(data.assembledItems)) this.state.assembledItems = [...data.assembledItems];
    if (typeof data.activeShieldDurability === 'number') this.state.activeShieldDurability = data.activeShieldDurability;
  }
}
