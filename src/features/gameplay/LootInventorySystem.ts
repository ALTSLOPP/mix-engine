import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { LootInventoryConfig, LootItemDef } from './types';

export interface GroundLoot {
  id: string;
  item: LootItemDef;
  position: THREE.Vector3;
  mesh?: THREE.Object3D;
}

export class LootInventorySystem {
  private readonly unsubscribe: Array<() => void> = [];

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  private config: LootInventoryConfig;
  private readonly inventory: LootItemDef[] = [];
  private readonly groundLoot: GroundLoot[] = [];
  private gold = 0;

  private readonly _playerPos = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: LootInventoryConfig) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  setConfig(config: Partial<LootInventoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<LootInventoryConfig> {
    return this.config;
  }

  get items(): readonly LootItemDef[] {
    return this.inventory;
  }

  get currentGold(): number {
    return this.gold;
  }

  get groundLootItems(): readonly GroundLoot[] {
    return this.groundLoot;
  }

  private bindEvents(): void {
    // Drop loot on enemy death
    this.unsubscribe.push(this.engine.sceneManager.events.on('combat_death', (e: any) => {
      if (!this.config.enabled || e?.entityId == null || !this.engine.sceneManager.hasTag(e.entityId, 'enemy')) return;
      const rb = this.engine.sceneManager.getRigidBody(e.entityId);
      if (rb && Math.random() <= this.config.dropRate) {
        this.spawnRandomDrop(rb.mesh.position.clone());
      }
    }));
  }

  spawnRandomDrop(position: THREE.Vector3): void {
    if (this.config.possibleDrops.length === 0) return;
    const item = this.config.possibleDrops[Math.floor(Math.random() * this.config.possibleDrops.length)];
    this.spawnLoot(item, position);
  }

  spawnLoot(item: LootItemDef, position: THREE.Vector3): void {
    const groundItem: GroundLoot = {
      id: `loot_${Date.now()}_${Math.random()}`,
      item,
      position: position.clone(),
    };

    this.groundLoot.push(groundItem);

    // Spawn 3D sparkle / beacon VFX
    this.engine.burstVfx('glow', position, 12);
    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.4, loop: false });

    this.engine.sceneManager.events.emit('loot_dropped', {
      item,
      position,
    });
  }

  pickupLoot(lootId: string): boolean {
    const idx = this.groundLoot.findIndex((l) => l.id === lootId);
    if (idx === -1) return false;

    const loot = this.groundLoot[idx];
    if (this.inventory.length >= this.config.maxInventorySlots) {
      return false; // Inventory full
    }

    this.inventory.push(loot.item);
    this.groundLoot.splice(idx, 1);

    // Apply stat bonus if equipped/picked up
    if (loot.item.statBonus && this.engine.gameplayFeatures?.stats) {
      this.engine.gameplayFeatures.stats.equipItem({
        id: loot.item.id,
        name: loot.item.name,
        slot: (loot.item.category === 'weapon' || loot.item.category === 'armor') ? loot.item.category : 'accessory',
        hpBonus: loot.item.statBonus.maxHp ?? 0,
        attackBonus: loot.item.statBonus.attack ?? 0,
        defenseBonus: loot.item.statBonus.defense ?? 0,
      });
    }

    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.7, loop: false });
    this.engine.sceneManager.events.emit('loot_collected', { item: loot.item });
    return true;
  }

  addItem(item: LootItemDef): boolean {
    if (this.inventory.length >= this.config.maxInventorySlots) return false;
    this.inventory.push(item);
    return true;
  }

  removeItem(itemId: string, count = 1): boolean {
    if (!Number.isInteger(count) || count <= 0 || this.inventory.filter(item => item.id === itemId).length < count) return false;
    let removed = 0;
    for (let i = this.inventory.length - 1; i >= 0 && removed < count; i--) {
      if (this.inventory[i].id === itemId) {
        this.inventory.splice(i, 1);
        removed++;
      }
    }
    return removed === count;
  }

  update(_dt: number): void {
    if (!this.config.enabled || this.groundLoot.length === 0) return;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return;

    this._playerPos.copy(playerRb.mesh.position);

    // Check proximity pickup
    for (let i = this.groundLoot.length - 1; i >= 0; i--) {
      const loot = this.groundLoot[i];
      const dist = this._playerPos.distanceTo(loot.position);

      if (dist <= this.config.pickupRadius) {
        this.pickupLoot(loot.id);
      }
    }
  }
}
