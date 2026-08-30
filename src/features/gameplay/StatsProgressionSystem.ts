import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { CharacterAttributes, EquipmentItem, StatsProgressionConfig } from './types';

export class StatsProgressionSystem {
  private config: StatsProgressionConfig;
  private attributes: CharacterAttributes;
  private readonly equippedItems = new Map<'weapon' | 'armor' | 'accessory', EquipmentItem>();

  constructor(private readonly engine: Engine, initialConfig: StatsProgressionConfig) {
    this.config = { ...initialConfig };
    this.attributes = { ...this.config.baseAttributes };
    this.initDefaultEquipment();
  }

  setConfig(config: Partial<StatsProgressionConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.equipment) {
      this.equippedItems.clear();
      for (const item of config.equipment) this.equippedItems.set(item.slot, item);
    }
    this.recalculateAttributes();
  }

  getConfig(): Readonly<StatsProgressionConfig> {
    return this.config;
  }

  getAttributes(): Readonly<CharacterAttributes> {
    return this.attributes;
  }

  private initDefaultEquipment(): void {
    for (const item of this.config.equipment) {
      this.equippedItems.set(item.slot, item);
    }
    this.recalculateAttributes();
  }

  // ── EXP & Leveling ────────────────────────────────────────────────────────

  addExp(amount: number): boolean {
    if (!this.config.enabled || !Number.isFinite(amount) || amount <= 0) return false;
    if (this.attributes.level >= this.config.levelCap) return false;

    this.attributes.currentExp += amount;
    let leveledUp = false;

    while (
      this.attributes.currentExp >= this.attributes.expToNextLevel &&
      this.attributes.level < this.config.levelCap
    ) {
      this.attributes.currentExp -= this.attributes.expToNextLevel;
      this.attributes.level++;
      this.attributes.expToNextLevel = Math.floor(100 * Math.pow(1.25, this.attributes.level - 1));
      leveledUp = true;
    }

    if (leveledUp) {
      this.recalculateAttributes();
      this.triggerLevelUpFanfare();
    }

    this.engine.sceneManager.events.emit('stats_exp_gained', {
      amount,
      currentExp: this.attributes.currentExp,
      level: this.attributes.level,
      leveledUp,
    });

    return leveledUp;
  }

  private triggerLevelUpFanfare(): void {
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId !== null) {
      const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
      if (playerRb) {
        // Level up gold beam VFX & flash
        this.engine.burstVfx('confetti', playerRb.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 24);
        this.engine.effects.flash({ color: '#ffd479', intensity: 0.7, duration: 0.4, mode: 'pulse' });
        this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 1.0, loop: false });
      }
    }
  }

  // ── Equipment ────────────────────────────────────────────────────────────

  equipItem(item: EquipmentItem): void {
    this.equippedItems.set(item.slot, item);
    this.recalculateAttributes();
  }

  unequipItem(slot: 'weapon' | 'armor' | 'accessory'): void {
    this.equippedItems.delete(slot);
    this.recalculateAttributes();
  }

  getEquippedItem(slot: 'weapon' | 'armor' | 'accessory'): EquipmentItem | undefined {
    return this.equippedItems.get(slot);
  }

  // ── Attribute Recalculation ───────────────────────────────────────────────

  private recalculateAttributes(): void {
    const lvl = this.attributes.level;
    const base = this.config.baseAttributes;
    const growth = this.config.statGrowthPerLevel;

    // 1. Level-based scaling
    let maxHp = base.maxHp + (lvl - 1) * (growth.maxHp ?? 15);
    let maxMp = base.maxMp + (lvl - 1) * (growth.maxMp ?? 10);
    let maxStamina = base.maxStamina + (lvl - 1) * (growth.maxStamina ?? 5);
    let attackPower = base.attackPower + (lvl - 1) * (growth.attackPower ?? 4);
    let defense = base.defense + (lvl - 1) * (growth.defense ?? 2);
    let critRate = base.critRate + (lvl - 1) * (growth.critRate ?? 0.01);
    const critDamage = base.critDamage;
    const moveSpeed = base.moveSpeed;

    // 2. Add equipment bonuses
    for (const item of this.equippedItems.values()) {
      if (item.attackBonus) attackPower += item.attackBonus;
      if (item.defenseBonus) defense += item.defenseBonus;
      if (item.hpBonus) maxHp += item.hpBonus;
      if (item.critRateBonus) critRate += item.critRateBonus;
    }

    this.attributes.maxHp = maxHp;
    this.attributes.maxMp = maxMp;
    this.attributes.maxStamina = maxStamina;
    this.attributes.attackPower = attackPower;
    this.attributes.defense = defense;
    this.attributes.critRate = critRate;
    this.attributes.critDamage = critDamage;
    this.attributes.moveSpeed = moveSpeed;

    // Sync to combat / player
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId !== null) {
      const health = this.engine.combat.getHealth(playerEntityId);
      if (health) {
        if (this.config.enabled) { health.maxHp = maxHp; health.hp = Math.min(health.hp, maxHp); }
      }
    }
  }
}
