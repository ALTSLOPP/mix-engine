import { disposeOwnedObject } from './DisposeOwnedObject';
import { gameplayWallet } from './GameplayWallet';
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { ActivePowerupDrop, PowerupType, ZombiePowerupsConfig, ZombiePowerupsState } from './types';

export const DEFAULT_ZOMBIE_POWERUPS_CONFIG: ZombiePowerupsConfig = {
  enabled: true,
  dropChanceOnKill: 0.06,
  powerupDurationSec: 30.0,
  floatDurationSec: 25.0,
  nukePointsAward: 400,
  carpenterPointsAward: 200,
};

export class ZombiePowerupDropsSystem {
  private config: ZombiePowerupsConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly dropMeshes = new Map<string, THREE.Group>();
  private readonly unsubs: Array<() => void> = [];
  private nextDropId = 1;

  private readonly state: ZombiePowerupsState = {
    activeEffects: {
      insta_kill: 0,
      nuke: 0,
      max_ammo: 0,
      carpenter: 0,
      double_points: 0,
      fire_sale: 0,
    },
    activeDrops: [],
  };

  constructor(private readonly engine: Engine, initialConfig: ZombiePowerupsConfig = DEFAULT_ZOMBIE_POWERUPS_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.visible = this.config.enabled;
    this.rootGroup.name = 'ZombiePowerupDropsRoot';
    this.setupVisuals();
    this.bindEvents();
  }

  private setupVisuals(): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    const u1 = events.on('zombie_killed', (payload: any) => {
      if (!this.config.enabled) return;
      if (Math.random() < this.config.dropChanceOnKill && payload?.position) {
        this.spawnDrop(payload.position);
      }
    });

    if (u1) this.unsubs.push(u1);
  }

  setConfig(config: Partial<ZombiePowerupsConfig>): void {
    this.config = { ...this.config, ...config };
    this.rootGroup.visible = this.config.enabled;
    if (!this.config.enabled) {
      for (const type of Object.keys(this.state.activeEffects) as PowerupType[]) this.state.activeEffects[type] = 0;
      this.engine.sceneManager?.events?.emit('fire_sale_ended', {});
    }
  }

  getConfig(): Readonly<ZombiePowerupsConfig> {
    return this.config;
  }

  getState(): Readonly<ZombiePowerupsState> {
    return this.state;
  }

  isEffectActive(type: PowerupType): boolean {
    return this.config.enabled && (this.state.activeEffects[type] ?? 0) > 0;
  }

  spawnDrop(position: { x: number; y: number; z: number } | THREE.Vector3, specificType?: PowerupType): ActivePowerupDrop {
    if (!this.config.enabled) throw new Error('Zombie power-up drops are disabled');
    const types: PowerupType[] = ['insta_kill', 'nuke', 'max_ammo', 'carpenter', 'double_points', 'fire_sale'];
    const chosenType = specificType ?? types[Math.floor(Math.random() * types.length)];

    const id = `powerup_${this.nextDropId++}`;
    const pos = new THREE.Vector3(position.x, position.y + 0.8, position.z);

    const drop: ActivePowerupDrop = {
      id,
      type: chosenType,
      position: pos,
      timeRemaining: this.config.floatDurationSec,
    };

    this.state.activeDrops.push(drop);
    this.createDropMesh(drop);

    this.engine.burstVfx?.('glow', pos.clone(), 6);
    this.engine.sceneManager?.events?.emit('powerup_spawned', { id, type: chosenType, position: pos.clone() });

    return drop;
  }

  private createDropMesh(drop: ActivePowerupDrop): void {
    const group = new THREE.Group();
    group.name = `Drop_${drop.id}`;
    group.position.copy(drop.position);

    const colorMap: Record<PowerupType, number> = {
      insta_kill: 0xff0000,
      nuke: 0xffff00,
      max_ammo: 0x00ff00,
      carpenter: 0x884400,
      double_points: 0x00ffff,
      fire_sale: 0xff00ff,
    };

    // Floating diamond emblem
    const geo = new THREE.OctahedronGeometry(0.4, 0);
    const mat = new THREE.MeshBasicMaterial({ color: colorMap[drop.type] ?? 0xffffff, wireframe: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'DiamondMesh';
    group.add(mesh);

    this.rootGroup.add(group);
    this.dropMeshes.set(drop.id, group);
  }

  collectDrop(id: string): PowerupType | null {
    if (!this.config.enabled) return null;
    const idx = this.state.activeDrops.findIndex((d) => d.id === id);
    if (idx === -1) return null;

    const drop = this.state.activeDrops[idx];
    this.state.activeDrops.splice(idx, 1);

    const mesh = this.dropMeshes.get(id);
    if (mesh) {
      disposeOwnedObject(mesh);
      this.rootGroup.remove(mesh);
      this.dropMeshes.delete(id);
    }

    this.applyPowerupEffect(drop.type, drop.position);
    return drop.type;
  }

  private applyPowerupEffect(type: PowerupType, dropPos: THREE.Vector3): void {
    this.engine.audio?.play?.(`/assets/audio/powerup_${type}.wav`, { volume: 1.0 });
    this.engine.burstVfx?.('sparks', dropPos.clone(), 12);

    if (type === 'nuke') {
      // Obliterate all zombies on map
      const zh = (this.engine.gameplayFeatures as any)?.zombieHorde;
      if (zh) {
        for (const z of zh.getZombies()) {
          zh.applyZombieHit(z.id, 9999, false, 'torso');
        }
      }
      gameplayWallet(this.engine).add(this.config.nukePointsAward);
      this.engine.burstVfx?.('explosion', dropPos.clone(), 25);
    } else if (type === 'carpenter') {
      // Rebuild all barricades on map
      const barricades = (this.engine.gameplayFeatures as any)?.barricades;
      if (barricades) {
        barricades.repairAllBarricades?.();
      }
      gameplayWallet(this.engine).add(this.config.carpenterPointsAward);
    } else if (type === 'max_ammo') {
      // Refill all player ammo
      const shooter = (this.engine.gameplayFeatures as any)?.shooter;
      if (shooter) {
        shooter.replenishAllAmmo?.();
      }
    } else if (type === 'fire_sale') {
      this.state.activeEffects.fire_sale = this.config.powerupDurationSec;
      this.engine.sceneManager?.events?.emit('fire_sale_started', {});
    } else {
      this.state.activeEffects[type] = this.config.powerupDurationSec;
    }

    this.engine.sceneManager?.events?.emit('powerup_collected', {
      type,
      durationSec: this.config.powerupDurationSec,
    });
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    // Update active effects countdowns
    for (const [key, remaining] of Object.entries(this.state.activeEffects)) {
      const type = key as PowerupType;
      if (remaining > 0) {
        const next = remaining - dt;
        this.state.activeEffects[type] = Math.max(0, next);
        if (next <= 0) {
          this.engine.sceneManager?.events?.emit('powerup_expired', { type });
          if (type === 'fire_sale') {
            this.engine.sceneManager?.events?.emit('fire_sale_ended', {});
          }
        }
      }
    }

    // Update floating drops
    const playerPos = this.engine.viewport?.camera?.position;
    for (let i = this.state.activeDrops.length - 1; i >= 0; i--) {
      const drop = this.state.activeDrops[i];
      drop.timeRemaining -= dt;

      // Animate rotation and bobbing
      const mesh = this.dropMeshes.get(drop.id);
      if (mesh) {
        mesh.rotation.y += dt * 2.0;
        mesh.position.y = drop.position.y + Math.sin(Date.now() * 0.004) * 0.15;
      }

      // Check proximity pickup
      if (playerPos && drop.position.distanceTo(playerPos) <= 2.2) {
        this.collectDrop(drop.id);
        continue;
      }

      if (drop.timeRemaining <= 0) {
        this.state.activeDrops.splice(i, 1);
        if (mesh) {
          disposeOwnedObject(mesh);
          this.rootGroup.remove(mesh);
          this.dropMeshes.delete(drop.id);
        }
        this.engine.sceneManager?.events?.emit('powerup_despawned', { id: drop.id, type: drop.type });
      }
    }
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.state.activeDrops.length = 0;
    for (const mesh of this.dropMeshes.values()) {
      disposeOwnedObject(mesh);
      this.rootGroup.remove(mesh);
    }
    this.dropMeshes.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      activeEffects: { ...this.state.activeEffects },
      activeDrops: this.state.activeDrops, nextDropId: this.nextDropId,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    for (const mesh of this.dropMeshes.values()) { disposeOwnedObject(mesh); this.rootGroup.remove(mesh); }
    this.dropMeshes.clear();
    this.state.activeDrops = [];
    this.nextDropId = Number(data.nextDropId ?? 1);
    for (const item of Array.isArray(data.activeDrops) ? data.activeDrops : []) {
      const drop = { ...item, position: new THREE.Vector3(item.position.x, item.position.y, item.position.z) };
      this.state.activeDrops.push(drop);
      this.createDropMesh(drop);
    }
    if (typeof data.enabled === 'boolean') this.setConfig({ enabled: data.enabled });
    if (data.activeEffects && typeof data.activeEffects === 'object') {
      this.state.activeEffects = { ...(data.activeEffects as any) };
    }
    this.engine.sceneManager?.events?.emit(this.isEffectActive('fire_sale') ? 'fire_sale_started' : 'fire_sale_ended', {});
  }
}
