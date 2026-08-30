import { disposeOwnedObject } from './DisposeOwnedObject';
import { gameplayWallet } from './GameplayWallet';
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { MysteryBoxConfig, MysteryBoxLocation, MysteryBoxState, MysteryBoxWeaponDef } from './types';

export const DEFAULT_MYSTERY_BOX_WEAPONS: MysteryBoxWeaponDef[] = [
  { weaponId: 'fps_ak47', name: 'AK-47', weight: 20 },
  { weaponId: 'fps_shotgun', name: 'Pump Shotgun', weight: 25 },
  { weaponId: 'fps_pistol', name: 'Combat Pistol', weight: 30 },
  { weaponId: 'fps_sniper', name: 'Sniper Rifle', weight: 15 },
  { weaponId: 'fps_raygun', name: 'Wonder Ray Gun', weight: 5, isWonderWeapon: true },
  { weaponId: 'fps_thundergun', name: 'Thunder Cannon', weight: 3, isWonderWeapon: true },
];

export const DEFAULT_MYSTERY_BOX_LOCATIONS: MysteryBoxLocation[] = [
  { id: 'box_loc_spawn', position: { x: 5, y: 0, z: -5 }, yaw: 0 },
  { id: 'box_loc_courtyard', position: { x: -15, y: 0, z: 20 }, yaw: Math.PI * 0.5 },
  { id: 'box_loc_rooftop', position: { x: 25, y: 8, z: -10 }, yaw: Math.PI },
];

export const DEFAULT_MYSTERY_BOX_CONFIG: MysteryBoxConfig = {
  enabled: true,
  spinCost: 950,
  spinDurationSec: 3.5,
  grabTimeoutSec: 10.0,
  teddyBearRollChance: 0.12,
  weapons: DEFAULT_MYSTERY_BOX_WEAPONS,
  locations: DEFAULT_MYSTERY_BOX_LOCATIONS,
};

export class MysteryBoxSystem {
  private config: MysteryBoxConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly boxMesh = new THREE.Group();
  private readonly lightBeamMesh = new THREE.Mesh();
  private readonly unsubs: Array<() => void> = [];

  private isFireSaleActive = false;
  private spinTimer = 0;
  private isTeddyBear = false;

  private readonly state: MysteryBoxState = {
    activeLocationId: 'box_loc_spawn',
    isSpinning: false,
    currentRolledWeapon: null,
    grabTimeRemaining: 0,
    totalSpinsInCurrentLocation: 0,
  };

  constructor(private readonly engine: Engine, initialConfig: MysteryBoxConfig = DEFAULT_MYSTERY_BOX_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.visible = this.config.enabled;
    this.rootGroup.name = 'MysteryBoxRoot';
    this.setupVisuals();
    this.bindEvents();
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    const u1 = events.on('fire_sale_started', () => {
      this.isFireSaleActive = true;
    });

    const u2 = events.on('fire_sale_ended', () => {
      this.isFireSaleActive = false;
    });

    if (u1) this.unsubs.push(u1);
    if (u2) this.unsubs.push(u2);
  }

  private setupVisuals(): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    this.boxMesh.name = 'MysteryBoxModel';

    // Wooden chest with brass corners
    const chestGeo = new THREE.BoxGeometry(2.0, 0.8, 1.0);
    const chestMat = new THREE.MeshBasicMaterial({ color: 0x4a2e12 });
    const chest = new THREE.Mesh(chestGeo, chestMat);
    chest.position.y = 0.4;
    this.boxMesh.add(chest);

    // Glowing question marks on lid
    const lidGeo = new THREE.BoxGeometry(2.05, 0.15, 1.05);
    const lidMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.name = 'BoxLid';
    lid.position.y = 0.85;
    this.boxMesh.add(lid);

    // Mystery box sky light beam
    const beamGeo = new THREE.CylinderGeometry(0.5, 2.5, 60, 16);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 30;
    this.boxMesh.add(beam);

    this.rootGroup.add(this.boxMesh);
    this.updateBoxPosition();
  }

  private updateBoxPosition(): void {
    const loc = this.config.locations.find((l) => l.id === this.state.activeLocationId) ?? this.config.locations[0];
    if (loc) {
      this.boxMesh.position.set(loc.position.x, loc.position.y, loc.position.z);
      this.boxMesh.rotation.y = loc.yaw ?? 0;
    }
  }

  setConfig(config: Partial<MysteryBoxConfig>): void {
    this.config = { ...this.config, ...config };
    this.rootGroup.visible = this.config.enabled;
    if (config.locations) {
      this.config.locations = [...config.locations];
      this.updateBoxPosition();
    }
    if (!this.config.enabled) {
      this.boxMesh.visible = false;
    } else {
      this.boxMesh.visible = true;
    }
  }

  getConfig(): Readonly<MysteryBoxConfig> {
    return this.config;
  }

  getState(): Readonly<MysteryBoxState> {
    return this.state;
  }

  getEffectiveCost(): number {
    if ((this.engine.gameplayFeatures as any)?.gobbleGums?.isGumActive?.('shopping_free')) return 0;
    return this.isFireSaleActive ? 10 : this.config.spinCost;
  }

  spinBox(): boolean {
    if (!this.config.enabled || this.state.isSpinning || this.state.grabTimeRemaining > 0) {
      return false;
    }

    const cost = this.getEffectiveCost();
    const currentScore = gameplayWallet(this.engine).getBalance();
    if (currentScore < cost) {
      this.engine.sceneManager?.events?.emit('mystery_box_insufficient_points', { cost, currentScore });
      return false;
    }

    if (!gameplayWallet(this.engine).trySpend(cost)) return false;

    this.state.isSpinning = true;
    this.state.currentRolledWeapon = null;
    this.spinTimer = this.config.spinDurationSec;
    this.state.totalSpinsInCurrentLocation++;

    // Check teddy bear relocation roll
    if (this.state.totalSpinsInCurrentLocation >= 4 && Math.random() < this.config.teddyBearRollChance) {
      this.isTeddyBear = true;
    } else {
      this.isTeddyBear = false;
    }

    this.engine.audio?.play?.('/assets/audio/mystery_box_jingle.wav', { volume: 0.8 });
    this.engine.burstVfx?.('glow', this.boxMesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 8);

    this.engine.sceneManager?.events?.emit('mystery_box_spin_started', {
      cost,
      locationId: this.state.activeLocationId,
    });

    return true;
  }

  grabWeapon(): string | null {
    if (!this.config.enabled || !this.state.currentRolledWeapon || this.state.grabTimeRemaining <= 0) {
      return null;
    }

    const weaponId = this.state.currentRolledWeapon;
    this.state.currentRolledWeapon = null;
    this.state.grabTimeRemaining = 0;

    // Equip / add weapon to player loadout
    const loadout = (this.engine.gameplayFeatures as any)?.loadout;
    if (loadout) {
      loadout.equipWeapon?.(weaponId);
    }

    this.engine.sceneManager?.events?.emit('mystery_box_weapon_grabbed', {
      weaponId,
      locationId: this.state.activeLocationId,
    });

    return weaponId;
  }

  relocateBox(): void {
    if (!this.config.enabled) return;
    const otherLocs = this.config.locations.filter((l) => l.id !== this.state.activeLocationId);
    if (otherLocs.length > 0) {
      const nextLoc = otherLocs[Math.floor(Math.random() * otherLocs.length)];
      this.state.activeLocationId = nextLoc.id;
    }
    this.state.totalSpinsInCurrentLocation = 0;
    this.updateBoxPosition();

    this.engine.burstVfx?.('teleport', this.boxMesh.position.clone(), 12);
    this.engine.sceneManager?.events?.emit('mystery_box_relocated', {
      newLocationId: this.state.activeLocationId,
    });
  }

  private pickRandomWeapon(): string {
    const weapons = this.config.weapons;
    const totalWeight = weapons.reduce((acc, w) => acc + w.weight, 0);
    let rand = Math.random() * totalWeight;

    for (const w of weapons) {
      rand -= w.weight;
      if (rand <= 0) return w.weaponId;
    }
    return weapons[0]?.weaponId ?? 'fps_ak47';
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (this.state.isSpinning) {
      this.spinTimer -= dt;
      if (this.spinTimer <= 0) {
        this.state.isSpinning = false;

        if (this.isTeddyBear) {
          this.engine.sceneManager?.events?.emit('mystery_box_teddy_bear_rolled', {});
          this.relocateBox();
        } else {
          this.state.currentRolledWeapon = this.pickRandomWeapon();
          this.state.grabTimeRemaining = this.config.grabTimeoutSec;
          this.engine.sceneManager?.events?.emit('mystery_box_weapon_ready', {
            weaponId: this.state.currentRolledWeapon,
            grabTimeoutSec: this.config.grabTimeoutSec,
          });
        }
      }
    } else if (this.state.grabTimeRemaining > 0) {
      this.state.grabTimeRemaining -= dt;
      if (this.state.grabTimeRemaining <= 0) {
        this.state.currentRolledWeapon = null;
        this.state.grabTimeRemaining = 0;
        this.engine.sceneManager?.events?.emit('mystery_box_weapon_expired', {});
      }
    }
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.engine.viewport?.scene?.remove(this.rootGroup);
    disposeOwnedObject(this.rootGroup);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.state, spinTimer: this.spinTimer, isTeddyBear: this.isTeddyBear, isFireSaleActive: this.isFireSaleActive,
      enabled: this.config.enabled,
      activeLocationId: this.state.activeLocationId,
      totalSpinsInCurrentLocation: this.state.totalSpinsInCurrentLocation,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    this.state.isSpinning = data.isSpinning === true;
    this.state.currentRolledWeapon = typeof data.currentRolledWeapon === 'string' ? data.currentRolledWeapon : null;
    this.state.grabTimeRemaining = Number(data.grabTimeRemaining ?? 0);
    this.spinTimer = Number(data.spinTimer ?? 0);
    this.isTeddyBear = data.isTeddyBear === true;
    this.isFireSaleActive = data.isFireSaleActive === true;
    if (typeof data.enabled === 'boolean') this.setConfig({ enabled: data.enabled });
    if (typeof data.activeLocationId === 'string') {
      this.state.activeLocationId = data.activeLocationId;
      this.updateBoxPosition();
    }
    if (typeof data.totalSpinsInCurrentLocation === 'number') {
      this.state.totalSpinsInCurrentLocation = data.totalSpinsInCurrentLocation;
    }
  }
}
