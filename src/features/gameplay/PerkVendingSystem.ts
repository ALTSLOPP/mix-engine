import { disposeOwnedObject } from './DisposeOwnedObject';
import { addOwnedModifier } from './OwnedModifiers';
import { gameplayWallet } from './GameplayWallet';
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { PerkMachineDef, PerkType, PerkVendingConfig, PerkVendingState } from './types';

export const DEFAULT_PERK_MACHINES: PerkMachineDef[] = [
  {
    perkType: 'juggernog',
    cost: 2500,
    name: 'Juggernog (Iron Flesh)',
    icon: '🍷',
    position: { x: -6, y: 0, z: -8 },
    description: 'Increases maximum health from 100 to 250 HP.',
  },
  {
    perkType: 'speed_cola',
    cost: 3000,
    name: 'Speed Cola (Fast Hands)',
    icon: '⚡',
    position: { x: 8, y: 0, z: -8 },
    description: 'Doubles weapon reload speed and barricade repair speed.',
  },
  {
    perkType: 'quick_revive',
    cost: 1500,
    name: 'Quick Revive (Second Chance)',
    icon: '❤️',
    position: { x: -8, y: 0, z: 6 },
    description: 'Grants automatic self-revive on fatal damage.',
  },
  {
    perkType: 'double_tap',
    cost: 2000,
    name: 'Double Tap (Rapid Fire)',
    icon: '🔥',
    position: { x: 6, y: 0, z: 8 },
    description: 'Increases rate of fire by 33% and boosts bullet damage.',
  },
  {
    perkType: 'stamin_up',
    cost: 2000,
    name: 'Stamin-Up (Marathon)',
    icon: '🏃',
    position: { x: -14, y: 0, z: 0 },
    description: 'Increases movement speed by 35% with unlimited sprint stamina.',
  },
  {
    perkType: 'deadshot',
    cost: 1500,
    name: 'Deadshot (Head Popper)',
    icon: '🎯',
    position: { x: 14, y: 0, z: 0 },
    description: 'Boosts critical headshot damage multiplier by +50%.',
  },
  {
    perkType: 'mule_kick',
    cost: 4000,
    name: 'Mule Kick (Weapon Carrier)',
    icon: '🎒',
    position: { x: 0, y: 0, z: 12 },
    description: 'Unlocks a third weapon slot in the loadout wheel.',
  },
];

export const DEFAULT_PERK_VENDING_CONFIG: PerkVendingConfig = {
  enabled: true,
  maxPerksPerPlayer: 4,
  drinkDurationSec: 1.5,
  machines: DEFAULT_PERK_MACHINES,
};

export class PerkVendingSystem {
  private config: PerkVendingConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly machineMeshes = new Map<PerkType, THREE.Group>();
  private readonly unsubs: Array<() => void> = [];

  private readonly removeModifiers: Array<() => void> = [];
  private isDrinking = false;
  private drinkTimer = 0;

  private readonly state: PerkVendingState = {
    activePerks: [],
    isDrinking: false,
  };

  constructor(private readonly engine: Engine, initialConfig: PerkVendingConfig = DEFAULT_PERK_VENDING_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.visible = this.config.enabled;
    this.rootGroup.name = 'PerkVendingRoot';
    this.setupVisuals();
    this.bindEvents();
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    // Remove perks on player death/downed state
    const u1 = events.on('player_death', () => {
      this.loseAllPerks();
    });

    if (u1) this.unsubs.push(u1);
    this.unsubs.push(events.on('combat_death', (event: any) => {
      if (event?.entityId === this.engine.player?.getPossessedId?.() || event?.targetId === this.engine.player?.getPossessedId?.()) this.loseAllPerks();
    }));
  }

  private setupVisuals(): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    const perkColors: Record<PerkType, number> = {
      juggernog: 0xcc0000,
      speed_cola: 0x00cc44,
      quick_revive: 0x0088ff,
      double_tap: 0xffaa00,
      stamin_up: 0xffdd00,
      deadshot: 0x222222,
      mule_kick: 0x8800cc,
    };

    for (const machine of this.config.machines) {
      const group = new THREE.Group();
      group.name = `PerkMachine_${machine.perkType}`;
      group.position.set(machine.position.x, machine.position.y, machine.position.z);

      // Vending Machine Body
      const bodyGeo = new THREE.BoxGeometry(1.2, 2.4, 1.0);
      const bodyMat = new THREE.MeshBasicMaterial({ color: perkColors[machine.perkType] ?? 0x555555 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 1.2;
      group.add(body);

      // Glowing Emblem
      const emblemGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16);
      const emblemMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const emblem = new THREE.Mesh(emblemGeo, emblemMat);
      emblem.rotation.x = Math.PI * 0.5;
      emblem.position.set(0, 1.8, 0.52);
      group.add(emblem);

      this.rootGroup.add(group);
      this.machineMeshes.set(machine.perkType, group);
    }
  }

  setConfig(config: Partial<PerkVendingConfig>): void {
    this.config = { ...this.config, ...config };
    this.rootGroup.visible = this.config.enabled;
    if (!this.config.enabled) {
      this.loseAllPerks();
      this.rootGroup.visible = false;
    } else {
      this.rootGroup.visible = true;
    }
  }

  getConfig(): Readonly<PerkVendingConfig> {
    return this.config;
  }

  getState(): Readonly<PerkVendingState> {
    return this.state;
  }

  hasPerk(perkType: PerkType): boolean {
    return this.state.activePerks.includes(perkType);
  }

  buyPerk(perkType: PerkType): boolean {
    if (!this.config.enabled || (this.engine.player?.getPossessedId?.() ?? null) === null || this.isDrinking || this.hasPerk(perkType)) {
      return false;
    }

    if (this.state.activePerks.length >= this.config.maxPerksPerPlayer) {
      this.engine.sceneManager?.events?.emit('perk_limit_reached', { max: this.config.maxPerksPerPlayer });
      return false;
    }

    const machine = this.config.machines.find((m) => m.perkType === perkType);
    if (!machine) return false;
    let cost = machine.cost;
    if ((this.engine.gameplayFeatures as any)?.gobbleGums?.isGumActive?.('shopping_free')) {
      cost = 0;
    }
    const currentScore = gameplayWallet(this.engine).getBalance();

    if (currentScore < cost) {
      this.engine.sceneManager?.events?.emit('perk_insufficient_points', { cost, currentScore });
      return false;
    }

    if (cost > 0) {
      if (!gameplayWallet(this.engine).trySpend(cost)) return false;
    }

    this.isDrinking = true;
    this.drinkTimer = this.config.drinkDurationSec;
    this.state.isDrinking = true;

    this.state.activePerks.push(perkType);
    this.applyPerkEffects(perkType);

    this.engine.audio?.play?.(`/assets/audio/perk_${perkType}.wav`, { volume: 0.9 });
    this.engine.burstVfx?.('glow', new THREE.Vector3(machine?.position.x ?? 0, 1.5, machine?.position.z ?? 0), 10);

    this.engine.sceneManager?.events?.emit('perk_acquired', {
      perkType,
      name: machine?.name ?? perkType,
      activePerks: [...this.state.activePerks],
    });

    return true;
  }

  private applyPerkEffects(perkType: PerkType): void {
    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    if (playerEntityId === null) return;
    const health = this.engine.combat?.getHealth?.(playerEntityId);
    if (perkType === 'juggernog' && health) {
      const remove = addOwnedModifier(health, 'maxHp', 150);
      health.hp = health.maxHp;
      this.removeModifiers.push(() => { remove(); health.hp = Math.min(health.hp, health.maxHp); });
    }
    if (perkType === 'stamin_up') {
      const locomotor = this.engine.player?.getLocomotor?.() ?? (this.engine.player as any)?.locomotor;
      if (locomotor?.params) this.removeModifiers.push(addOwnedModifier(locomotor.params, 'maxRunSpeed', locomotor.params.maxRunSpeed * 0.35));
    }
  }

  loseAllPerks(): void {
    for (const remove of this.removeModifiers.splice(0).reverse()) remove();
    this.isDrinking = false;
    this.drinkTimer = 0;
    this.state.isDrinking = false;
    this.state.activePerks = [];
    this.engine.sceneManager?.events?.emit('perks_lost', {});
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (this.isDrinking) {
      this.drinkTimer -= dt;
      if (this.drinkTimer <= 0) {
        this.isDrinking = false;
        this.state.isDrinking = false;
        this.engine.sceneManager?.events?.emit('perk_drink_completed', {});
      }
    }
  }

  dispose(): void {
    this.loseAllPerks();
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.engine.viewport?.scene?.remove(this.rootGroup);
    disposeOwnedObject(this.rootGroup);
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      activePerks: [...this.state.activePerks],
      drinkTimer: this.drinkTimer, isDrinking: this.isDrinking,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    this.loseAllPerks();
    if (typeof data.enabled === 'boolean') this.setConfig({ enabled: data.enabled });
    if (this.config.enabled && Array.isArray(data.activePerks)) {
      this.state.activePerks = [...new Set(data.activePerks.filter((p): p is PerkType => this.config.machines.some(m => m.perkType === p)))];
      this.drinkTimer = Number(data.drinkTimer ?? 0);
      this.isDrinking = this.state.isDrinking = data.isDrinking === true;
      for (const p of this.state.activePerks) {
        this.applyPerkEffects(p);
      }
    }
  }
}
