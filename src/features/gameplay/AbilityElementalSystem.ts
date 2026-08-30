import * as THREE from 'three';
import { applyGameplayHit } from './GameplayHit';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type {
  AbilityDef,
  AbilityElementalConfig,
  AbilityState,
  ActiveStatusEffect,
  ElementType,
  StatusEffectDef,
} from './types';
import type { AnimationStateMachine } from '../../animation/AnimationStateMachine';

export class AbilityElementalSystem {
  private config: AbilityElementalConfig;
  private readonly state: AbilityState = {
    currentMp: 100,
    cooldowns: new Map<string, number>(),
    activeCasts: new Map<string, number>(),
  };

  private readonly activeStatusEffects: ActiveStatusEffect[] = [];

  constructor(private readonly engine: Engine, initialConfig: AbilityElementalConfig) {
    this.config = { ...initialConfig };
    this.state.currentMp = this.config.maxMp;
  }

  setConfig(config: Partial<AbilityElementalConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.activeStatusEffects.length = 0; this.state.activeCasts.clear(); }
    this.state.currentMp = Math.min(this.state.currentMp, this.config.maxMp);
  }

  getConfig(): Readonly<AbilityElementalConfig> {
    return this.config;
  }

  getState(): Readonly<AbilityState> {
    return this.state;
  }

  get currentMp(): number {
    return this.state.currentMp;
  }

  get maxMp(): number {
    return this.config.maxMp;
  }

  restoreMp(amount: number): void {
    this.state.currentMp = Math.min(this.config.maxMp, this.state.currentMp + amount);
    this.engine.sceneManager.events.emit('mp_restored', { amount, currentMp: this.state.currentMp });
  }

  getCooldownRemaining(abilityId: string): number {
    return this.state.cooldowns.get(abilityId) ?? 0;
  }

  getAbilityBySlot(slot: 1 | 2 | 3 | 4): AbilityDef | undefined {
    return this.config.abilities.find((a) => a.slot === slot);
  }

  // ── Cast Ability ──────────────────────────────────────────────────────────

  castAbility(slot: 1 | 2 | 3 | 4, asm?: AnimationStateMachine | null): boolean {
    if (!this.config.enabled) return false;

    const ability = this.getAbilityBySlot(slot);
    if (!ability) return false;

    // Check cooldown
    if ((this.state.cooldowns.get(ability.id) ?? 0) > 0) return false;

    // Check MP
    if (this.state.currentMp < ability.mpCost) return false;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    // Consume MP & Start Cooldown
    this.state.currentMp = Math.max(0, this.state.currentMp - ability.mpCost);
    this.state.cooldowns.set(ability.id, ability.cooldown);

    // Play animation
    if (asm && ability.animation) {
      asm.transition(ability.animation, 0.15);
    }

    // Audio & VFX
    if (ability.audio) {
      this.engine.audio.play(ability.audio, { volume: 0.9, loop: false });
    }

    const playerPos = playerRb.mesh.position.clone();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerRb.mesh.quaternion);

    if (ability.vfx) {
      this.engine.burstVfx((ability.vfx as any) || 'magic', playerPos, 12);
    }

    // Execute Ability Mechanics
    this.executeAbilityEffects(playerEntityId, ability, playerPos, forward);

    // Broadcast ability cast event for HUD
    this.engine.sceneManager.events.emit('ability_cast', {
      slot: ability.slot,
      id: ability.id,
      name: ability.name,
      cooldown: ability.cooldown,
    });

    return true;
  }

  private executeAbilityEffects(
    casterId: EntityId,
    ability: AbilityDef,
    casterPos: THREE.Vector3,
    casterForward: THREE.Vector3,
  ): void {
    if (ability.id === 'divine_shield') {
      // Self Heal & Shield
      const health = this.engine.combat.getHealth(casterId);
      if (health) {
        health.hp = Math.min(health.maxHp, health.hp + 40);
      }
      this.applyStatusEffect(casterId, 'barrier');
      this.engine.effects.flash({ color: '#ffd479', intensity: 0.6, duration: 0.3, mode: 'pulse' });
      return;
    }

    // Area of effect hit check
    const targetCenter = casterPos.clone().addScaledVector(casterForward, ability.range * 0.5);
    const allEntities = this.engine.sceneManager.allEntityIds();

    for (const targetId of allEntities) {
      if (targetId === casterId) continue;
      const targetRb = this.engine.sceneManager.getRigidBody(targetId);
      if (!targetRb || !targetRb.mesh.visible) continue;

      const targetPos = targetRb.mesh.position;
      const dist = targetCenter.distanceTo(targetPos);

      if (dist <= ability.radius + 1.0) {
        // Target in blast radius!
        let damage = ability.baseDamage;

        // Check for elemental reactions (e.g. Vaporize, Melt)
        if (this.config.enableElementalReactions) {
          damage = this.evaluateElementalReactions(targetId, ability.element, damage);
        }

        // Emit hit
        applyGameplayHit(this.engine, {
          attackerId: casterId,
          targetId,
          damage,
          poiseDamage: 60,
          knockbackForce: 12.0,
          knockbackDir: casterForward,
          hitPosition: targetPos.clone().add(new THREE.Vector3(0, 1.0, 0)),
        });

        // Apply status effect if defined
        if (ability.statusEffect) {
          this.applyStatusEffect(targetId, ability.statusEffect, casterId);
        }
      }
    }
  }

  // ── Status Effects ────────────────────────────────────────────────────────

  applyStatusEffect(targetId: EntityId, effectId: string, attackerId: EntityId | null = null): void {
    const def = this.config.statusEffects.find((e) => e.id === effectId);
    if (!def) return;

    // Check if already active
    const existing = this.activeStatusEffects.find(
      (e) => e.targetId === targetId && e.id === effectId,
    );

    if (existing) {
      existing.attackerId = attackerId;
      existing.remainingTime = def.duration;
      existing.stacks = Math.min(5, existing.stacks + 1);
    } else {
      this.activeStatusEffects.push({
        attackerId,
        id: effectId,
        def,
        targetId,
        remainingTime: def.duration,
        lastTickTime: 0,
        stacks: 1,
      });
    }

    this.engine.sceneManager.events.emit('status_applied', {
      targetId,
      effectId,
      name: def.name,
      icon: def.icon,
    });
  }

  private evaluateElementalReactions(
    targetId: EntityId,
    incomingElement: ElementType,
    baseDamage: number,
  ): number {
    const existingEffects = this.activeStatusEffects.filter((e) => e.targetId === targetId);

    for (const eff of existingEffects) {
      // Fire + Ice = Melt (+100% bonus burst)
      if (
        (incomingElement === 'fire' && eff.def.element === 'ice') ||
        (incomingElement === 'ice' && eff.def.element === 'fire')
      ) {
        this.engine.effects.hit({
          position: this.engine.sceneManager.getRigidBody(targetId)?.mesh.position ?? new THREE.Vector3(),
          intensity: 1.0,
          color: '#ffffff',
          vfx: 'magic',
        });
        return baseDamage * 2.0;
      }

      // Lightning + Water/Ice = Superconduct Shockwave
      if (incomingElement === 'lightning' && (eff.def.element === 'ice' || eff.def.element === 'fire')) {
        return baseDamage * 1.5;
      }
    }

    return baseDamage;
  }

  // ── Engine Update Loop ───────────────────────────────────────────────────

  update(dt: number): void {
    if (!this.config.enabled) return;

    // 1. MP Regeneration
    this.state.currentMp = Math.min(
      this.config.maxMp,
      this.state.currentMp + this.config.mpRegenRate * dt,
    );

    // 2. Cooldown Timers
    for (const [id, time] of this.state.cooldowns) {
      const nextTime = Math.max(0, time - dt);
      if (nextTime === 0) {
        this.state.cooldowns.delete(id);
      } else {
        this.state.cooldowns.set(id, nextTime);
      }
    }

    // 3. Status Effects Tick & Expiration
    for (let i = this.activeStatusEffects.length - 1; i >= 0; i--) {
      const eff = this.activeStatusEffects[i];
      const activeDt = Math.min(dt, Math.max(0, eff.remainingTime));
      eff.remainingTime -= dt;
      eff.lastTickTime += activeDt;

      while (eff.def.tickInterval > 0 && eff.lastTickTime + 1e-9 >= eff.def.tickInterval) {
        eff.lastTickTime -= eff.def.tickInterval;

        // Apply tick damage
        if (eff.def.tickDamage > 0) {
          const targetHealth = this.engine.combat.getHealth(eff.targetId);
          if (targetHealth) {
            this.engine.combat.applyDamage(eff.attackerId ?? null, eff.targetId, eff.def.tickDamage * eff.stacks, 'fire');
          }
        }
      }

      if (eff.remainingTime <= 0) {
        this.activeStatusEffects.splice(i, 1);
      }
    }
  }
}
