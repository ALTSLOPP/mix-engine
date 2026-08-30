import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import { applyGameplayHit } from './GameplayHit';
import type { ZombieBossArchetype, ZombieBossConfig, ZombieBossState, ZombieBossStateMap } from './types';

export const DEFAULT_ZOMBIE_BOSS_CONFIG: ZombieBossConfig = {
  enabled: true,
  panzerHp: 1800,
  bloaterHp: 900,
  witchHp: 1200,
  nemesisHp: 2500,
  bossSpawnWaveInterval: 8,
};

export class ZombieBossEncounterSystem {
  private config: ZombieBossConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly bossMeshes = new Map<string, THREE.Group>();
  private readonly unsubs: Array<() => void> = [];
  private nextBossId = 1;

  private readonly state: ZombieBossStateMap = {
    activeBosses: [],
  };

  constructor(private readonly engine: Engine, initialConfig: ZombieBossConfig = DEFAULT_ZOMBIE_BOSS_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.name = 'ZombieBossEncounterRoot';
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

    // Startle witch if gunfire occurs nearby
    const u1 = events.on('ranged_weapon_fired', (payload: any) => {
      if (!payload?.origin) return;
      for (const boss of this.state.activeBosses) {
        if (boss.archetype === 'crying_witch' && !boss.isEnraged) {
          if (boss.position.distanceTo(payload.origin) <= 18.0) {
            boss.isEnraged = true;
            this.engine.burstVfx?.('glow', boss.position.clone(), 10);
            this.engine.sceneManager?.events?.emit('witch_startled', { id: boss.id });
          }
        }
      }
    });

    if (u1) this.unsubs.push(u1);
  }

  setConfig(config: Partial<ZombieBossConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<ZombieBossConfig> {
    return this.config;
  }

  getState(): Readonly<ZombieBossStateMap> {
    return this.state;
  }

  getBosses(): readonly ZombieBossState[] {
    return this.state.activeBosses;
  }

  spawnBoss(archetype: ZombieBossArchetype, position: THREE.Vector3 = new THREE.Vector3(0, 0, -15)): ZombieBossState {
    const id = `boss_${archetype}_${this.nextBossId++}`;
    const entityId = (10000 + this.nextBossId) as EntityId;

    let hp = this.config.panzerHp;
    if (archetype === 'bile_bloater') hp = this.config.bloaterHp;
    if (archetype === 'crying_witch') hp = this.config.witchHp;
    if (archetype === 'nemesis_stalker') hp = this.config.nemesisHp;

    const boss: ZombieBossState = {
      id,
      entityId,
      archetype,
      health: hp,
      maxHealth: hp,
      isEnraged: false,
      position: position.clone(),
      yaw: 0,
      attackCooldown: 2.0,
      specialTimer: 0,
    };

    this.state.activeBosses.push(boss);
    this.createBossMesh(boss);

    this.engine.burstVfx?.('dust', position.clone(), 15);
    this.engine.audio?.play?.('/assets/audio/boss_spawn_roar.wav', { volume: 1.0 });
    this.engine.sceneManager?.events?.emit('boss_spawned', { id, archetype, health: hp });

    return boss;
  }

  private createBossMesh(boss: ZombieBossState): void {
    const group = new THREE.Group();
    group.name = `BossMesh_${boss.id}`;
    group.position.copy(boss.position);

    let bodyColor = 0x556677;
    if (boss.archetype === 'bile_bloater') bodyColor = 0x2e8b57;
    if (boss.archetype === 'crying_witch') bodyColor = 0xdcdcdc;
    if (boss.archetype === 'nemesis_stalker') bodyColor = 0x111111;

    // Heavy Mech / Brute Body
    const geo = new THREE.BoxGeometry(2.2, 3.4, 1.8);
    const mat = new THREE.MeshBasicMaterial({ color: bodyColor });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1.7;
    group.add(mesh);

    // Glowing Power Core (Weak Spot)
    if (boss.archetype === 'panzer_soldat') {
      const coreGeo = new THREE.SphereGeometry(0.35, 12, 12);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.name = 'PowerCoreWeakSpot';
      core.position.set(0, 2.2, 0.95);
      group.add(core);
    }

    this.rootGroup.add(group);
    this.bossMeshes.set(boss.id, group);
  }

  applyBossHit(id: string, damage: number, hitWeakSpot = false): boolean {
    const boss = this.state.activeBosses.find((b) => b.id === id);
    if (!boss || boss.health <= 0) return false;

    let finalDamage = damage;
    if (hitWeakSpot && boss.archetype === 'panzer_soldat') {
      finalDamage *= 3.5;
      this.engine.burstVfx?.('sparks', boss.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 10);
    }

    boss.health -= finalDamage;

    // Startle witch on hit
    if (boss.archetype === 'crying_witch' && !boss.isEnraged) {
      boss.isEnraged = true;
      this.engine.sceneManager?.events?.emit('witch_startled', { id: boss.id });
    }

    this.engine.sceneManager?.events?.emit('boss_damaged', {
      id: boss.id,
      damage: finalDamage,
      healthRemaining: Math.max(0, boss.health),
      hitWeakSpot,
    });

    if (boss.health <= 0) {
      this.onBossKilled(boss);
    }

    return true;
  }

  private onBossKilled(boss: ZombieBossState): void {
    const mesh = this.bossMeshes.get(boss.id);
    if (mesh) {
      this.rootGroup.remove(mesh);
      this.bossMeshes.delete(boss.id);
    }

    // Bloater bile explosion
    if (boss.archetype === 'bile_bloater') {
      this.engine.burstVfx?.('poison', boss.position.clone(), 20);
      this.engine.sceneManager?.events?.emit('bile_cloud_exploded', { position: boss.position.clone() });
    }

    const idx = this.state.activeBosses.indexOf(boss);
    if (idx !== -1) this.state.activeBosses.splice(idx, 1);

    (this.engine.sceneManager?.gameState as any)?.addScore?.(1000);
    this.engine.sceneManager?.events?.emit('boss_defeated', { id: boss.id, archetype: boss.archetype });
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    let targetPos = (this.engine.gameplayFeatures as any)?.wonderWeapons?.getActiveDecoyPosition?.();
    const isInPlainSight = (this.engine.gameplayFeatures as any)?.gobbleGums?.isGumActive?.('in_plain_sight');

    if (!targetPos && !isInPlainSight) {
      targetPos = this.engine.viewport?.camera?.position;
    }

    const playerEntityId = this.engine.player?.getPossessedId?.() ?? 1;

    for (const boss of this.state.activeBosses) {
      boss.attackCooldown -= dt;

      if (targetPos) {
        const toTarget = new THREE.Vector3().subVectors(targetPos, boss.position);
        toTarget.y = 0;
        const dist = toTarget.length();

        if (dist > 1.5) {
          const moveSpeed = boss.isEnraged ? 8.5 : boss.archetype === 'panzer_soldat' ? 3.0 : 4.0;
          boss.position.addScaledVector(toTarget.normalize(), moveSpeed * dt);
          boss.yaw = Math.atan2(toTarget.x, toTarget.z);
        }

        // Flamethrower / Melee attack
        if (dist <= 4.0 && boss.attackCooldown <= 0) {
          boss.attackCooldown = 2.5;

          if (boss.archetype === 'panzer_soldat') {
            this.engine.burstVfx?.('fire', boss.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 15);
            applyGameplayHit(this.engine, {
              attackerId: boss.entityId,
              targetId: playerEntityId as number,
              damage: 35,
              poiseDamage: 40,
              knockbackForce: 4.0,
              hitPosition: targetPos.clone(),
            });
          } else {
            applyGameplayHit(this.engine, {
              attackerId: boss.entityId,
              targetId: playerEntityId as number,
              damage: 45,
              poiseDamage: 60,
              knockbackForce: 8.0,
              hitPosition: targetPos.clone(),
            });
          }
        }
      }

      // Sync mesh
      const mesh = this.bossMeshes.get(boss.id);
      if (mesh) {
        mesh.position.copy(boss.position);
        mesh.rotation.y = boss.yaw;
      }
    }
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.state.activeBosses.length = 0;
    for (const m of this.bossMeshes.values()) this.rootGroup.remove(m);
    this.bossMeshes.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    if (typeof data.enabled === 'boolean') this.config.enabled = data.enabled;
  }
}
