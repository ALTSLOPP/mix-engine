import { disposeOwnedObject } from './DisposeOwnedObject';
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import { applyGameplayHit } from './GameplayHit';
import type { HellhoundsConfig, HellhoundsRoundState, HellhoundState } from './types';

export const DEFAULT_HELLHOUNDS_CONFIG: HellhoundsConfig = {
  enabled: true,
  roundInterval: 5,
  dogsPerPlayer: 8,
  dogHp: 75,
  dogSpeed: 8.5,
  guaranteeMaxAmmo: true,
};

export class HellhoundSpecialRoundSystem {
  private config: HellhoundsConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly houndMeshes = new Map<string, THREE.Group>();
  private readonly activeHounds: HellhoundState[] = [];
  private readonly unsubs: Array<() => void> = [];
  private nextHoundId = 1;

  private readonly state: HellhoundsRoundState = {
    isHellhoundRound: false,
    houndsRemaining: 0,
    houndsAlive: 0,
  };

  constructor(private readonly engine: Engine, initialConfig: HellhoundsConfig = DEFAULT_HELLHOUNDS_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.visible = this.config.enabled;
    this.rootGroup.name = 'HellhoundsRoot';
    this.setupVisuals();
  }

  private setupVisuals(): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }
  }

  setConfig(config: Partial<HellhoundsConfig>): void {
    this.config = { ...this.config, ...config };
    this.rootGroup.visible = this.config.enabled;
  }

  getConfig(): Readonly<HellhoundsConfig> {
    return this.config;
  }

  getState(): Readonly<HellhoundsRoundState> {
    return this.state;
  }

  getHounds(): readonly HellhoundState[] {
    return this.activeHounds;
  }

  startHellhoundRound(dogCount = this.config.dogsPerPlayer): void {
    if (!this.config.enabled) return;
    this.state.isHellhoundRound = true;
    this.state.houndsRemaining = dogCount;
    this.state.houndsAlive = 0;

    this.engine.audio?.play?.('/assets/audio/hellhounds_incoming.wav', { volume: 1.0 });
    this.engine.sceneManager?.events?.emit('hellhound_round_started', { dogCount });

    // Spawn first wave of hounds
    for (let i = 0; i < Math.min(4, dogCount); i++) {
      const angle = (i / 4) * Math.PI * 2;
      const spawnPos = new THREE.Vector3(Math.cos(angle) * 20, 0, Math.sin(angle) * 20);
      this.spawnHound(spawnPos);
    }
  }

  spawnHound(position: THREE.Vector3): HellhoundState {
    if (!this.config.enabled) throw new Error('Hellhound rounds are disabled');
    const id = `hound_${this.nextHoundId++}`;
    const entityId = (20000 + this.nextHoundId) as EntityId;

    const hound: HellhoundState = {
      id,
      entityId,
      position: position.clone(),
      velocity: new THREE.Vector3(),
      health: this.config.dogHp,
      isLeaping: false,
    };

    this.activeHounds.push(hound);
    this.state.houndsAlive++;
    this.state.houndsRemaining = Math.max(0, this.state.houndsRemaining - 1);

    this.createHoundMesh(hound);
    this.engine.burstVfx?.('fire', position.clone(), 12);
    this.engine.sceneManager?.events?.emit('hellhound_spawned', { id, position: position.clone() });

    return hound;
  }

  private createHoundMesh(hound: HellhoundState): void {
    const group = new THREE.Group();
    group.name = `HoundMesh_${hound.id}`;
    group.position.copy(hound.position);

    // Fiery hound body
    const bodyGeo = new THREE.BoxGeometry(0.8, 0.7, 1.4);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xcc2200 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    group.add(body);

    // Glowing eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2, 0.6, -0.7);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.2, 0.6, -0.7);
    group.add(leftEye, rightEye);

    this.rootGroup.add(group);
    this.houndMeshes.set(hound.id, group);
  }

  applyHoundHit(id: string, damage: number): boolean {
    const hound = this.activeHounds.find((h) => h.id === id);
    if (!hound || hound.health <= 0) return false;

    hound.health -= damage;
    this.engine.burstVfx?.('fire', hound.position.clone(), 6);

    if (hound.health <= 0) {
      this.onHoundKilled(hound);
    }

    return true;
  }

  private onHoundKilled(hound: HellhoundState): void {
    this.engine.burstVfx?.('explosion', hound.position.clone(), 15);
    this.engine.audio?.play?.('/assets/audio/hellhound_explode.wav', { volume: 0.8 });

    const mesh = this.houndMeshes.get(hound.id);
    if (mesh) {
      disposeOwnedObject(mesh);
      this.rootGroup.remove(mesh);
      this.houndMeshes.delete(hound.id);
    }

    const idx = this.activeHounds.indexOf(hound);
    if (idx !== -1) this.activeHounds.splice(idx, 1);
    this.state.houndsAlive = Math.max(0, this.state.houndsAlive - 1);

    (this.engine.sceneManager?.gameState as any)?.addScore?.(100);
    this.engine.sceneManager?.events?.emit('hellhound_killed', { id: hound.id });

    // Spawn more if remaining
    if (this.state.houndsRemaining > 0) {
      const angle = Math.random() * Math.PI * 2;
      const spawnPos = new THREE.Vector3(Math.cos(angle) * 22, 0, Math.sin(angle) * 22);
      this.spawnHound(spawnPos);
    } else if (this.state.houndsAlive === 0) {
      this.onRoundCompleted();
    }
  }

  private onRoundCompleted(): void {
    this.state.isHellhoundRound = false;

    // Guaranteed Max Ammo drop
    if (this.config.guaranteeMaxAmmo) {
      const powerups = (this.engine.gameplayFeatures as any)?.zombiePowerups;
      if (powerups) {
        powerups.spawnDrop?.(new THREE.Vector3(0, 0, 0), 'max_ammo');
      }
    }

    this.engine.sceneManager?.events?.emit('hellhound_round_completed', {});
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    let targetPos = (this.engine.gameplayFeatures as any)?.wonderWeapons?.getActiveDecoyPosition?.();
    const isInPlainSight = (this.engine.gameplayFeatures as any)?.gobbleGums?.isGumActive?.('in_plain_sight');

    const attackingDecoy = !!targetPos;
    if (!targetPos && !isInPlainSight) {
      targetPos = playerRb?.mesh.position;
    }


    for (const hound of this.activeHounds) {
      if (targetPos) {
        const toTarget = new THREE.Vector3().subVectors(targetPos, hound.position);
        toTarget.y = 0;
        const dist = toTarget.length();

        if (dist > 1.2) {
          hound.position.addScaledVector(toTarget.normalize(), this.config.dogSpeed * dt);
        } else if (!attackingDecoy && playerRb && playerEntityId !== null) {
          // Bite attack
          applyGameplayHit(this.engine, {
            attackerId: hound.entityId,
            targetId: playerEntityId as number,
            damage: 25,
            poiseDamage: 20,
            knockbackForce: 3.0,
            hitPosition: targetPos.clone(),
          });
        }
      }

      // Sync mesh
      const mesh = this.houndMeshes.get(hound.id);
      if (mesh) {
        mesh.position.copy(hound.position);
      }
    }
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.activeHounds.length = 0;
    for (const m of this.houndMeshes.values()) { disposeOwnedObject(m); this.rootGroup.remove(m); }
    this.houndMeshes.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      state: { ...this.state }, activeHounds: this.activeHounds, nextHoundId: this.nextHoundId,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    for (const mesh of this.houndMeshes.values()) { disposeOwnedObject(mesh); this.rootGroup.remove(mesh); }
    this.houndMeshes.clear();
    this.activeHounds.length = 0;
    Object.assign(this.state, { isHellhoundRound: false, houndsRemaining: 0, houndsAlive: 0 }, data.state ?? {});
    this.nextHoundId = Number(data.nextHoundId ?? 1);
    for (const item of Array.isArray(data.activeHounds) ? data.activeHounds : []) {
      const hound = { ...item, position: new THREE.Vector3(item.position.x, item.position.y, item.position.z),
        velocity: new THREE.Vector3(item.velocity.x, item.velocity.y, item.velocity.z) };
      this.activeHounds.push(hound);
      this.createHoundMesh(hound);
    }
    if (typeof data.enabled === 'boolean') this.setConfig({ enabled: data.enabled });
  }
}
