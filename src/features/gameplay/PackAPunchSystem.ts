import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import { applyGameplayHit } from './GameplayHit';
import type { AATType, PackAPunchConfig, PackAPunchState, WeaponUpgradeState } from './types';

export const DEFAULT_PACK_A_PUNCH_CONFIG: PackAPunchConfig = {
  enabled: true,
  upgradeCostTier1: 5000,
  upgradeCostTier2: 15000,
  upgradeCostTier3: 30000,
  aatCost: 2000,
  upgradeTimeSec: 2.5,
};

export class PackAPunchSystem {
  private config: PackAPunchConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly machineMesh = new THREE.Group();
  private readonly upgradedWeapons = new Map<string, WeaponUpgradeState>();
  private readonly unsubs: Array<() => void> = [];

  private isUpgrading = false;
  private upgradeTimer = 0;

  private readonly state: PackAPunchState = {
    isUpgrading: false,
    upgradingWeaponId: null,
    timeRemaining: 0,
  };

  constructor(private readonly engine: Engine, initialConfig: PackAPunchConfig = DEFAULT_PACK_A_PUNCH_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.name = 'PackAPunchRoot';
    this.setupVisuals();
  }

  private setupVisuals(): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    this.machineMesh.name = 'PackAPunchMachine';
    this.machineMesh.position.set(0, 0, -20);

    // Ornate brass machine body
    const bodyGeo = new THREE.BoxGeometry(2.4, 2.8, 1.8);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x8b4513 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.4;
    this.machineMesh.add(body);

    // Cogs and Tesla Coils
    const coilGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.0, 8);
    const coilMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const leftCoil = new THREE.Mesh(coilGeo, coilMat);
    leftCoil.position.set(-0.9, 2.9, 0);
    const rightCoil = new THREE.Mesh(coilGeo, coilMat);
    rightCoil.position.set(0.9, 2.9, 0);
    this.machineMesh.add(leftCoil, rightCoil);

    this.rootGroup.add(this.machineMesh);
  }

  setConfig(config: Partial<PackAPunchConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.rootGroup.visible = false;
    } else {
      this.rootGroup.visible = true;
    }
  }

  getConfig(): Readonly<PackAPunchConfig> {
    return this.config;
  }

  getState(): Readonly<PackAPunchState> {
    return this.state;
  }

  getUpgradeState(weaponId: string): WeaponUpgradeState | undefined {
    return this.upgradedWeapons.get(weaponId);
  }

  getCostForNextTier(weaponId: string): number {
    const current = this.upgradedWeapons.get(weaponId);
    const nextTier = (current?.tier ?? 0) + 1;
    if ((this.engine.gameplayFeatures as any)?.gobbleGums?.isGumActive?.('shopping_free')) return 0;
    if (nextTier === 1) return this.config.upgradeCostTier1;
    if (nextTier === 2) return this.config.upgradeCostTier2;
    if (nextTier === 3) return this.config.upgradeCostTier3;
    return 0; // Max tier
  }

  upgradeWeapon(weaponId: string): boolean {
    if (!this.config.enabled || this.isUpgrading) return false;

    const current = this.upgradedWeapons.get(weaponId);
    const currentTier = current?.tier ?? 0;
    if (currentTier >= 3) return false;

    const cost = this.getCostForNextTier(weaponId);
    const currentScore = (this.engine.sceneManager?.gameState as any)?.score ?? 999999;
    if (currentScore < cost) {
      this.engine.sceneManager?.events?.emit('pap_insufficient_points', { cost, currentScore });
      return false;
    }

    (this.engine.sceneManager?.gameState as any)?.addScore?.(-cost);

    this.isUpgrading = true;
    this.upgradeTimer = this.config.upgradeTimeSec;
    this.state.isUpgrading = true;
    this.state.upgradingWeaponId = weaponId;
    this.state.timeRemaining = this.config.upgradeTimeSec;

    const nextTier = currentTier + 1;
    const damageMult = nextTier === 1 ? 2.0 : nextTier === 2 ? 3.5 : 5.0;
    const reserveMult = nextTier === 1 ? 1.5 : nextTier === 2 ? 2.0 : 2.5;

    const state: WeaponUpgradeState = {
      weaponId,
      tier: nextTier,
      damageMultiplier: damageMult,
      aat: current?.aat ?? 'none',
      maxReserveMultiplier: reserveMult,
    };
    this.upgradedWeapons.set(weaponId, state);

    this.engine.burstVfx?.('sparks', this.machineMesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 15);
    this.engine.sceneManager?.events?.emit('pap_upgrade_started', { weaponId, tier: nextTier, cost });

    return true;
  }

  applyAAT(weaponId: string, aat: AATType): boolean {
    if (!this.config.enabled) return false;

    const cost = this.config.aatCost;
    const currentScore = (this.engine.sceneManager?.gameState as any)?.score ?? 999999;
    if (currentScore < cost) return false;

    (this.engine.sceneManager?.gameState as any)?.addScore?.(-cost);

    let state = this.upgradedWeapons.get(weaponId);
    if (!state) {
      state = {
        weaponId,
        tier: 1,
        damageMultiplier: 2.0,
        aat,
        maxReserveMultiplier: 1.5,
      };
      this.upgradedWeapons.set(weaponId, state);
    } else {
      state.aat = aat;
    }

    this.engine.burstVfx?.('magic', this.machineMesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 12);
    this.engine.sceneManager?.events?.emit('pap_aat_attached', { weaponId, aat });
    return true;
  }

  triggerAATEffect(aat: AATType, targetEntityId: EntityId, hitPosition: THREE.Vector3): void {
    if (aat === 'none') return;

    if (aat === 'blast_furnace') {
      this.engine.burstVfx?.('fire', hitPosition.clone(), 15);
      applyGameplayHit(this.engine, {
        attackerId: null,
        targetId: targetEntityId as number,
        damage: 150,
        poiseDamage: 100,
        knockbackForce: 8.0,
        hitPosition,
      });
      this.engine.sceneManager?.events?.emit('aat_triggered', { aat: 'blast_furnace', targetEntityId });
    } else if (aat === 'dead_wire') {
      this.engine.burstVfx?.('electric', hitPosition.clone(), 12);
      applyGameplayHit(this.engine, {
        attackerId: null,
        targetId: targetEntityId as number,
        damage: 180,
        poiseDamage: 120,
        knockbackForce: 4.0,
        hitPosition,
      });
      this.engine.sceneManager?.events?.emit('aat_triggered', { aat: 'dead_wire', targetEntityId });
    } else if (aat === 'cryo_freeze') {
      this.engine.burstVfx?.('snow', hitPosition.clone(), 10);
      applyGameplayHit(this.engine, {
        attackerId: null,
        targetId: targetEntityId as number,
        damage: 100,
        poiseDamage: 150,
        knockbackForce: 0,
        hitPosition,
      });
      this.engine.sceneManager?.events?.emit('aat_triggered', { aat: 'cryo_freeze', targetEntityId });
    } else if (aat === 'brain_rot') {
      this.engine.burstVfx?.('poison', hitPosition.clone(), 10);
      this.engine.sceneManager?.events?.emit('aat_triggered', { aat: 'brain_rot', targetEntityId });
    }
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (this.isUpgrading) {
      this.upgradeTimer -= dt;
      this.state.timeRemaining = Math.max(0, this.upgradeTimer);

      if (this.upgradeTimer <= 0) {
        this.isUpgrading = false;
        this.state.isUpgrading = false;
        const weaponId = this.state.upgradingWeaponId!;
        this.state.upgradingWeaponId = null;

        const upgraded = this.upgradedWeapons.get(weaponId);
        this.engine.sceneManager?.events?.emit('pap_upgrade_completed', {
          weaponId,
          tier: upgraded?.tier ?? 1,
        });
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
      upgradedWeapons: Array.from(this.upgradedWeapons.entries()).map(([k, v]) => ({
        weaponId: k,
        tier: v.tier,
        aat: v.aat,
      })),
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    if (typeof data.enabled === 'boolean') this.config.enabled = data.enabled;
    if (Array.isArray(data.upgradedWeapons)) {
      for (const item of data.upgradedWeapons) {
        const damageMult = item.tier === 1 ? 2.0 : item.tier === 2 ? 3.5 : 5.0;
        this.upgradedWeapons.set(item.weaponId, {
          weaponId: item.weaponId,
          tier: item.tier,
          damageMultiplier: damageMult,
          aat: item.aat ?? 'none',
          maxReserveMultiplier: item.tier === 1 ? 1.5 : 2.0,
        });
      }
    }
  }
}
