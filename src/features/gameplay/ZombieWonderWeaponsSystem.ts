import { disposeOwnedObject } from './DisposeOwnedObject';
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import { applyGameplayHit } from './GameplayHit';
import type { ActiveGerschDevice, ActiveMonkeyBomb, WonderWeaponsConfig, WonderWeaponsState } from './types';

export const DEFAULT_WONDER_WEAPONS_CONFIG: WonderWeaponsConfig = {
  enabled: true,
  wunderwaffeChainCount: 12,
  wunderwaffeDamage: 9999,
  monkeyBombFuseSec: 8.0,
  monkeyBombRadius: 12.0,
  gerschDurationSec: 6.0,
  gerschRadius: 10.0,
};

export class ZombieWonderWeaponsSystem {
  private config: WonderWeaponsConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly bombMeshes = new Map<string, THREE.Group>();
  private readonly vfxMeshes = new Map<string, THREE.Mesh>();
  private readonly unsubs: Array<() => void> = [];
  private nextBombId = 1;
  private nextGerschId = 1;

  private readonly state: WonderWeaponsState = {
    activeMonkeyBombs: [],
    activeGerschVortices: [],
  };

  constructor(private readonly engine: Engine, initialConfig: WonderWeaponsConfig = DEFAULT_WONDER_WEAPONS_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.visible = this.config.enabled;
    this.rootGroup.name = 'ZombieWonderWeaponsRoot';
    this.setupVisuals();
  }

  private setupVisuals(): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }
  }

  setConfig(config: Partial<WonderWeaponsConfig>): void {
    this.config = { ...this.config, ...config };
    this.rootGroup.visible = this.config.enabled;
  }

  getConfig(): Readonly<WonderWeaponsConfig> {
    return this.config;
  }

  getState(): Readonly<WonderWeaponsState> {
    return this.state;
  }

  fireWunderwaffe(origin: THREE.Vector3, initialTargetId?: EntityId): number {
    if (!this.config.enabled) return 0;

    const zh = (this.engine.gameplayFeatures as any)?.zombieHorde;
    const zombies = zh ? zh.getZombies() : [];
    if (zombies.length === 0) return 0;

    // Chain lightning through zombies
    const hitZombies: string[] = [];
    let currentPos = origin.clone();
    let currentCount = 0;

    for (let i = 0; i < this.config.wunderwaffeChainCount; i++) {
      let nearestDist = Infinity;
      let nearestZ: any = null;

      for (const z of zombies) {
        if (hitZombies.includes(z.id) || z.health <= 0) continue;
        const d = z.position.distanceTo(currentPos);
        if (d < 15.0 && d < nearestDist) {
          nearestDist = d;
          nearestZ = z;
        }
      }

      if (!nearestZ) break;

      hitZombies.push(nearestZ.id);
      currentPos = nearestZ.position.clone();
      currentCount++;

      applyGameplayHit(this.engine, {
        attackerId: null,
        targetId: nearestZ.entityId as number,
        damage: this.config.wunderwaffeDamage,
        poiseDamage: 500,
        knockbackForce: 10.0,
        hitPosition: nearestZ.position.clone(),
      });

      this.engine.burstVfx?.('electric', nearestZ.position.clone(), 12);
    }

    this.engine.audio?.play?.('/assets/audio/wunderwaffe_discharge.wav', { volume: 1.0 });
    this.engine.sceneManager?.events?.emit('wunderwaffe_fired', { chainedKills: currentCount });
    return currentCount;
  }

  throwMonkeyBomb(origin: THREE.Vector3, velocity: THREE.Vector3 = new THREE.Vector3(0, 4, -8)): ActiveMonkeyBomb {
    if (!this.config.enabled) throw new Error('Wonder weapons are disabled');
    const id = `monkey_${this.nextBombId++}`;
    const bombPos = origin.clone().add(new THREE.Vector3(0, 0.5, 0));

    const bomb: ActiveMonkeyBomb = {
      id,
      position: bombPos,
      timeRemaining: this.config.monkeyBombFuseSec,
      hasDetonated: false,
    };

    this.state.activeMonkeyBombs.push(bomb);
    this.createMonkeyMesh(bomb);

    this.engine.audio?.play?.('/assets/audio/monkey_bomb_jingle.wav', { volume: 0.9 });
    this.engine.sceneManager?.events?.emit('monkey_bomb_thrown', { id, position: bombPos.clone() });

    return bomb;
  }

  private createMonkeyMesh(bomb: ActiveMonkeyBomb): void {
    const group = new THREE.Group();
    group.name = `MonkeyMesh_${bomb.id}`;
    group.position.copy(bomb.position);

    // Toy monkey body
    const bodyGeo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x8b4513 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.25;
    group.add(body);

    // Cymbals
    const cymbalGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12);
    const cymbalMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    const cymbal = new THREE.Mesh(cymbalGeo, cymbalMat);
    cymbal.rotation.x = Math.PI * 0.5;
    cymbal.position.set(0, 0.3, 0.2);
    group.add(cymbal);

    this.rootGroup.add(group);
    this.bombMeshes.set(bomb.id, group);
  }

  throwGerschDevice(origin: THREE.Vector3, forward: THREE.Vector3 = new THREE.Vector3(0, 2, -6)): ActiveGerschDevice {
    if (!this.config.enabled) throw new Error('Wonder weapons are disabled');
    const id = `gersch_${this.nextGerschId++}`;
    const vortexPos = origin.clone().add(forward);

    const gersch: ActiveGerschDevice = {
      id,
      position: vortexPos,
      timeRemaining: this.config.gerschDurationSec,
    };

    this.state.activeGerschVortices.push(gersch);

    this.createGerschMesh(gersch);

    this.engine.burstVfx?.('magic', vortexPos.clone(), 20);
    this.engine.sceneManager?.events?.emit('gersch_device_opened', { id, position: vortexPos.clone() });

    return gersch;
  }

  private createGerschMesh(gersch: ActiveGerschDevice): void {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0x220033, wireframe: true }));
    mesh.position.copy(gersch.position);
    this.rootGroup.add(mesh);
    this.vfxMeshes.set(gersch.id, mesh);
  }

  getActiveDecoyPosition(): THREE.Vector3 | null {
    if (!this.config.enabled) return null;
    if (this.state.activeMonkeyBombs.length > 0) {
      return this.state.activeMonkeyBombs[0].position.clone();
    }
    return null;
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    const zh = (this.engine.gameplayFeatures as any)?.zombieHorde;

    // Update Monkey Bombs
    for (let i = this.state.activeMonkeyBombs.length - 1; i >= 0; i--) {
      const bomb = this.state.activeMonkeyBombs[i];
      bomb.timeRemaining -= dt;

      // Animate cymbals
      const mesh = this.bombMeshes.get(bomb.id);
      if (mesh) {
        mesh.rotation.y += dt * 3.0;
      }

      if (bomb.timeRemaining <= 0 && !bomb.hasDetonated) {
        bomb.hasDetonated = true;
        this.engine.burstVfx?.('explosion', bomb.position.clone(), 30);
        this.engine.audio?.play?.('/assets/audio/monkey_bomb_explode.wav', { volume: 1.0 });

        // Kill all zombies within radius
        if (zh) {
          for (const z of zh.getZombies()) {
            if (z.position.distanceTo(bomb.position) <= this.config.monkeyBombRadius) {
              zh.applyZombieHit(z.id, 9999, false, 'torso');
            }
          }
        }

        this.engine.sceneManager?.events?.emit('monkey_bomb_detonated', { id: bomb.id, position: bomb.position.clone() });

        if (mesh) {
          disposeOwnedObject(mesh);
          this.rootGroup.remove(mesh);
          this.bombMeshes.delete(bomb.id);
        }
        this.state.activeMonkeyBombs.splice(i, 1);
      }
    }

    // Update Gersch Singularity Vortices
    for (let i = this.state.activeGerschVortices.length - 1; i >= 0; i--) {
      const gersch = this.state.activeGerschVortices[i];
      gersch.timeRemaining -= dt;

      const mesh = this.vfxMeshes.get(gersch.id);
      if (mesh) {
        mesh.rotation.x += dt * 4.0;
        mesh.rotation.y += dt * 5.0;
      }

      // Pull in zombies
      if (zh) {
        for (const z of zh.getZombies()) {
          const d = z.position.distanceTo(gersch.position);
          if (d <= this.config.gerschRadius) {
            const pullDir = new THREE.Vector3().subVectors(gersch.position, z.position).normalize();
            z.position.addScaledVector(pullDir, dt * 6.0);
            if (d < 1.5) {
              zh.applyZombieHit(z.id, 9999, false, 'torso');
            }
          }
        }
      }

      if (gersch.timeRemaining <= 0) {
        if (mesh) {
          disposeOwnedObject(mesh);
          this.rootGroup.remove(mesh);
          this.vfxMeshes.delete(gersch.id);
        }
        this.state.activeGerschVortices.splice(i, 1);
        this.engine.sceneManager?.events?.emit('gersch_device_collapsed', { id: gersch.id });
      }
    }
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.state.activeMonkeyBombs.length = 0;
    this.state.activeGerschVortices.length = 0;
    for (const m of this.bombMeshes.values()) { disposeOwnedObject(m); this.rootGroup.remove(m); }
    for (const m of this.vfxMeshes.values()) { disposeOwnedObject(m); this.rootGroup.remove(m); }
    this.bombMeshes.clear();
    this.vfxMeshes.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      activeMonkeyBombs: this.state.activeMonkeyBombs, activeGerschVortices: this.state.activeGerschVortices,
      nextBombId: this.nextBombId, nextGerschId: this.nextGerschId,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    disposeOwnedObject(this.rootGroup);
    this.bombMeshes.clear(); this.vfxMeshes.clear();
    this.state.activeMonkeyBombs = []; this.state.activeGerschVortices = [];
    this.nextBombId = Number(data.nextBombId ?? 1); this.nextGerschId = Number(data.nextGerschId ?? 1);
    for (const item of Array.isArray(data.activeMonkeyBombs) ? data.activeMonkeyBombs : []) {
      const bomb = { ...item, position: new THREE.Vector3(item.position.x, item.position.y, item.position.z) };
      this.state.activeMonkeyBombs.push(bomb); this.createMonkeyMesh(bomb);
    }
    for (const item of Array.isArray(data.activeGerschVortices) ? data.activeGerschVortices : []) {
      const gersch = { ...item, position: new THREE.Vector3(item.position.x, item.position.y, item.position.z) };
      this.state.activeGerschVortices.push(gersch); this.createGerschMesh(gersch);
    }
    if (typeof data.enabled === 'boolean') this.setConfig({ enabled: data.enabled });
  }
}
