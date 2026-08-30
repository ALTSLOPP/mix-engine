import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';

/**
 * CombatSystem.ts — an ECS combat pipeline: health, damage, hitboxes, projectiles.
 *
 * The engine's ScriptComponent already handles ad-hoc damage (the StockEnemyAI's
 * sensor-based hit), but an open-world game needs a structured layer:
 *
 *   - **HealthComponent** — per-entity HP, max HP, damage modifiers, death callback.
 *   - **HitboxComponent** — a sensor collider tagged with a body-part name + damage
 *     multiplier (headshot = 2×, limb = 0.5×, etc.).
 *   - **WeaponSpec** — a fire mode (hitscan raycast or projectile), damage, fire rate,
 *     spread, range, projectile speed, VFX preset on hit.
 *   - **Projectile** — a lightweight kinematic body that travels forward, checks for
 *     hits each step, and despawns on impact or after a max lifetime.
 *   - **DamageEvent** — the structured record (attacker, target, amount, hitbox, type)
 *     surfaced to scripts + the HUD.
 *
 * The system is the single integration point for the AIBridge `combat_*` commands and
 * the HELM `combat_status` op. It ticks every frame: advances projectiles, processes
 * the damage queue, and removes dead entities (via SceneManager.requestDestroy).
 *
 * All coordinates are WORLD space at the API boundary; the system converts to engine
 * space internally (same contract as AIBridge).
 */

export interface HealthComponent {
  entityId: EntityId;
  hp: number;
  maxHp: number;
  /** Damage multiplier (1 = normal, 0.5 = resistant, 2 = vulnerable). */
  damageMultiplier: number;
  /** Faction tag (so projectiles can ignore same-faction hits). */
  faction: string;
  /** Called when HP reaches 0 (the system also calls requestDestroy). */
  onDeath?: (e: EntityId) => void;
  /** Called when damaged (for hit-flash VFX, aggro, etc.). */
  onDamage?: (e: DamageEvent) => void;
}

export interface HitboxComponent {
  entityId: EntityId;
  /** Sensor collider handle (from PhysicsWorld.createBoxCollider with isSensor=true). */
  colliderHandle: number;
  /** Body-part name (head, torso, limb, etc.). */
  part: string;
  /** Damage multiplier for this hitbox (head = 2, torso = 1, limb = 0.5). */
  multiplier: number;
}

export type DamageType = 'bullet' | 'melee' | 'explosion' | 'fall' | 'fire' | 'energy';

export interface DamageEvent {
  attacker: EntityId | null;
  target: EntityId;
  amount: number;
  hitbox: string;
  type: DamageType;
  /** World-space hit position (for VFX). */
  position: THREE.Vector3;
  timestamp: number;
}

export interface WeaponSpec {
  /** Optional catalogue id (set when equipped from a WeaponProfile). */
  id?: string;
  name?: string;
  /** 'hitscan' = instant raycast; 'projectile' = spawn a traveling body. */
  mode: 'hitscan' | 'projectile';
  damage: number;
  /** Rounds per second. */
  fireRate: number;
  /** Spread cone half-angle (radians). */
  spread: number;
  /** Max range (metres). */
  range: number;
  /** Hitscan rays per shot (shotgun = 6). Default 1. */
  pelletCount?: number;
  /** Projectile speed (m/s) — projectile mode only. */
  projectileSpeed?: number;
  /** Projectile lifetime (seconds) — projectile mode only. */
  projectileLifetime?: number;
  /** VFX preset on hit. */
  hitVfx?: string;
  /** Damage type. */
  damageType: DamageType;
}

interface Projectile {
  pos: THREE.Vector3;       // engine space
  vel: THREE.Vector3;       // engine space
  damage: number;
  attacker: EntityId | null;
  faction: string;
  lifetime: number;
  elapsed: number;
  hitVfx?: string;
  damageType: DamageType;
  active: boolean;
}

export interface CombatSystemDeps {
  sceneManager: SceneManager;
  getEngine?: () => import('../engine/Engine').Engine;
  physicsWorld: PhysicsWorld;
  worldOrigin: WorldOrigin;
  /** Spawn a VFX burst at a world position (engine.effects.burstVfx). */
  burstVfx?: (preset: string, worldPos: THREE.Vector3, count: number) => void;
}

export class CombatSystem {
  private readonly health = new Map<EntityId, HealthComponent>();
  private readonly hitboxes = new Map<EntityId, HitboxComponent[]>();
  private readonly projectiles: Projectile[] = [];
  private readonly damageQueue: DamageEvent[] = [];
  private readonly deps: CombatSystemDeps;
  /** Fire-rate cooldowns: entityId → last fire time (seconds). */
  private readonly lastFireTime = new Map<EntityId, number>();

  /** Active weapons: entityId → WeaponSpec (the currently equipped weapon). */
  private readonly weapons = new Map<EntityId, WeaponSpec>();

  private readonly _engOrigin = new THREE.Vector3();
  private readonly _engDir = new THREE.Vector3();
  private readonly _worldPos = new THREE.Vector3();
  private readonly _v = new THREE.Vector3();

  constructor(deps: CombatSystemDeps) {
    this.deps = deps;
  }

  // ── Health ─────────────────────────────────────────────────────────────

  addHealth(entityId: EntityId, hp: number, faction = 'neutral', damageMultiplier = 1): HealthComponent {
    const comp: HealthComponent = { entityId, hp, maxHp: hp, damageMultiplier, faction };
    this.health.set(entityId, comp);
    return comp;
  }

  getHealth(entityId: EntityId): HealthComponent | null {
    return this.health.get(entityId) ?? null;
  }

  removeHealth(entityId: EntityId): void {
    this.health.delete(entityId);
    this.hitboxes.delete(entityId);
  }

  // ── Hitboxes ───────────────────────────────────────────────────────────

  addHitbox(entityId: EntityId, colliderHandle: number, part: string, multiplier = 1): void {
    const list = this.hitboxes.get(entityId) ?? [];
    list.push({ entityId, colliderHandle, part, multiplier });
    this.hitboxes.set(entityId, list);
  }

  /** Resolve which hitbox a collider handle belongs to (for sensor events). */
  resolveHitbox(entityId: EntityId, colliderHandle: number): HitboxComponent | null {
    const list = this.hitboxes.get(entityId);
    if (!list) return null;
    return list.find((h) => h.colliderHandle === colliderHandle) ?? null;
  }

  // ── Weapons ────────────────────────────────────────────────────────────

  equipWeapon(entityId: EntityId, weapon: WeaponSpec): void {
    this.weapons.set(entityId, weapon);
  }

  /** Fire the equipped weapon from `originWorld` towards `dirWorld` (world space).
   *  Returns true if the shot was fired (false = on cooldown or no weapon). */
  fire(entityId: EntityId, originWorld: THREE.Vector3, dirWorld: THREE.Vector3): boolean {
    const weapon = this.weapons.get(entityId);
    if (!weapon) return false;
    const now = performance.now() / 1000;
    const lastFire = this.lastFireTime.get(entityId) ?? 0;
    const cooldown = 1 / weapon.fireRate;
    if (now - lastFire < cooldown) return false;
    this.lastFireTime.set(entityId, now);
    // Drive the combat animation trigger for the attacker (lightAttack/heavyAttack).
    this.fireAnimTrigger(entityId, weapon.mode === 'hitscan' ? 'lightAttack' : 'heavyAttack');

    // Apply spread.
    const dir = dirWorld.clone().normalize();
    if (weapon.spread > 0) {
      dir.x += (Math.random() - 0.5) * weapon.spread;
      dir.y += (Math.random() - 0.5) * weapon.spread;
      dir.z += (Math.random() - 0.5) * weapon.spread;
      dir.normalize();
    }

    if (weapon.mode === 'hitscan') {
      this.fireHitscan(entityId, weapon, originWorld, dir);
    } else {
      this.fireProjectile(entityId, weapon, originWorld, dir);
    }
    return true;
  }

  private fireHitscan(attacker: EntityId, weapon: WeaponSpec, originWorld: THREE.Vector3, dirWorld: THREE.Vector3): void {
    this.deps.worldOrigin.toEngineSpaceInto(this._engOrigin, originWorld);
    this._engDir.copy(dirWorld).normalize();
    const hit = this.deps.physicsWorld.raycast(this._engOrigin, this._engDir, weapon.range, true);
    if (!hit) return;
    // Find the entity that was hit.
    const body = this.deps.physicsWorld.rapierBodyFromColliderHandle(hit.colliderHandle);
    if (!body) return;
    const targetEntity = this.findEntityByBody(body);
    if (targetEntity === null) return;
    // Friendly fire check.
    const attackerHealth = this.health.get(attacker);
    const targetHealth = this.health.get(targetEntity);
    if (attackerHealth && targetHealth && attackerHealth.faction === targetHealth.faction) return;
    // Hitbox multiplier.
    const hitbox = this.resolveHitbox(targetEntity, hit.colliderHandle);
    const multiplier = hitbox?.multiplier ?? 1;
    const damage = weapon.damage * multiplier;
    // Hit position (world space).
    this.deps.worldOrigin.toWorldSpaceInto(this._worldPos, hit.point);
    this.queueDamage({ attacker, target: targetEntity, amount: damage, hitbox: hitbox?.part ?? 'body', type: weapon.damageType, position: this._worldPos.clone(), timestamp: performance.now() });
    // Hit VFX.
    if (weapon.hitVfx) this.deps.burstVfx?.(weapon.hitVfx, this._worldPos, 40);
  }

  private fireProjectile(attacker: EntityId, weapon: WeaponSpec, originWorld: THREE.Vector3, dirWorld: THREE.Vector3): void {
    this.deps.worldOrigin.toEngineSpaceInto(this._engOrigin, originWorld);
    const speed = weapon.projectileSpeed ?? 100;
    const vel = dirWorld.clone().normalize().multiplyScalar(speed);
    // Convert velocity to engine space (it's a direction, so origin-invariant).
    const attackerHealth = this.health.get(attacker);
    this.projectiles.push({
      pos: this._engOrigin.clone(),
      vel: vel, // direction × speed (engine space)
      damage: weapon.damage,
      attacker,
      faction: attackerHealth?.faction ?? 'neutral',
      lifetime: weapon.projectileLifetime ?? 3,
      elapsed: 0,
      hitVfx: weapon.hitVfx,
      damageType: weapon.damageType,
      active: true,
    });
  }

  // ── Damage queue ───────────────────────────────────────────────────────

  /** Queue a damage event (processed next update). */
  queueDamage(event: DamageEvent): void {
    this.damageQueue.push(event);
    this._totalDamageEvents++;
  }

  /** Apply damage immediately (bypasses the queue — used by scripts). */
  applyDamage(attacker: EntityId | null, target: EntityId, amount: number, type: DamageType = 'bullet', position?: THREE.Vector3): void {
    const health = this.health.get(target);
    if (!health || health.hp <= 0 || !Number.isFinite(amount) || amount <= 0) return;

    let finalAmount = amount * health.damageMultiplier;
    const hitPos = position ?? this.getEntityWorldPos(target);

    // Defense & Parry check if target is player
    const engine = this.deps.getEngine?.() ?? (this.deps.sceneManager as any).ctx?.engine ?? (typeof window !== 'undefined' ? (window as any).engine : null);
    if (engine && engine.gameplayFeatures) {
      const gfm = engine.gameplayFeatures;
      const playerId = engine.player.getPossessedId();
      if (target === playerId && gfm.isFeatureEnabled('dodge_guard_stamina')) {
        const evalHit = gfm.defense.evaluateIncomingHit(attacker, hitPos, finalAmount);
        finalAmount = evalHit.mitigatedDamage;
        if (evalHit.outcome === 'parried' || (evalHit.outcome === 'blocked' && finalAmount <= 0)) {
          return; // Hit completely neutralized
        }
      }
    }

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) return;
    health.hp = Math.max(0, health.hp - finalAmount);
    this._totalDamageEvents++;
    const event: DamageEvent = {
      attacker, target, amount: finalAmount, hitbox: 'body', type,
      position: hitPos,
      timestamp: performance.now(),
    };
    health.onDamage?.(event);
    // Animation triggers: hitReaction on damage, die on lethal.
    if (health.hp > 0) this.fireAnimTrigger(target, 'hitReaction');
    if (health.hp <= 0) {
      this.fireAnimTrigger(target, 'die');
      this.deps.sceneManager.events.emit('combat_death', { entityId: target, attackerId: attacker, position: hitPos.clone(), faction: health.faction });
      health.onDeath?.(target);
      const engine = this.deps.getEngine?.() ?? (this.deps.sceneManager as any).ctx?.engine ?? (typeof window !== 'undefined' ? (window as any).engine : null);
      if (engine && target === engine.player.getPossessedId()) {
        this.deps.sceneManager.events.emit('player_death', { target });
      }
      this.deps.sceneManager.requestDestroy(target);
      this.removeHealth(target);
    }
  }

  // ── Per-frame update ───────────────────────────────────────────────────

  update(dt: number): void {
    // 1. Process the damage queue.
    while (this.damageQueue.length > 0) {
      const event = this.damageQueue.shift()!;
      this.applyDamage(event.attacker, event.target, event.amount, event.type, event.position);
    }

    // 2. Advance projectiles.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.active) { this.projectiles.splice(i, 1); continue; }
      p.elapsed += dt;
      if (p.elapsed >= p.lifetime) { p.active = false; continue; }
      // Step the projectile: move + raycast for hits.
      const step = p.vel.clone().multiplyScalar(dt);
      const nextPos = p.pos.clone().add(step);
      const hit = this.deps.physicsWorld.raycast(p.pos, step.clone().normalize(), step.length(), true);
      if (hit) {
        const body = this.deps.physicsWorld.rapierBodyFromColliderHandle(hit.colliderHandle);
        if (body) {
          const targetEntity = this.findEntityByBody(body);
          if (targetEntity !== null) {
            const targetHealth = this.health.get(targetEntity);
            // Ignore same-faction hits.
            if (!targetHealth || targetHealth.faction !== p.faction) {
              this.deps.worldOrigin.toWorldSpaceInto(this._worldPos, hit.point);
              this.applyDamage(p.attacker, targetEntity, p.damage, p.damageType, this._worldPos.clone());
              if (p.hitVfx) this.deps.burstVfx?.(p.hitVfx, this._worldPos, 40);
            }
          }
        }
        p.active = false;
      } else {
        p.pos.copy(nextPos);
      }
    }
    // Clean up inactive projectiles.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].active) this.projectiles.splice(i, 1);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private findEntityByBody(body: unknown): EntityId | null {
    const list = this.deps.sceneManager.rigidBodyList;
    for (let i = 0; i < list.length; i++) {
      if (list[i].rapierBody === body) {
        return this.deps.sceneManager.entityAtIndex(i) ?? null;
      }
    }
    return null;
  }

  private getEntityWorldPos(entityId: EntityId): THREE.Vector3 {
    const rb = this.deps.sceneManager.getRigidBody(entityId);
    if (rb) return this.deps.worldOrigin.toWorldSpace(this._v.copy(rb.mesh.position));
    return new THREE.Vector3();
  }

  // ── Queries (HELM) ─────────────────────────────────────────────────────

  private _totalDamageEvents = 0;

  getCombatInfo(): {
    healthRecords: Array<{ entityId: EntityId; hp: number; maxHp: number; faction: string }>;
    activeProjectiles: number;
    totalDamageEvents: number;
  } {
    return {
      healthRecords: [...this.health.values()].map((h) => ({ entityId: h.entityId, hp: Math.round(h.hp), maxHp: h.maxHp, faction: h.faction })),
      activeProjectiles: this.projectiles.length,
      totalDamageEvents: this._totalDamageEvents,
    };
  }

  // ── Animation bindings (Animation Retarget Pro: wire pack triggers to combat events) ─
  /** animation trigger → callback (usually AnimationStateMachine.playTrigger). */
  private animBindings = new Map<EntityId, (trigger: string) => void>();

  /** Bind a combat event on an entity to an animation trigger (call when damage/hit/fire). */
  bindAnimTrigger(entityId: EntityId, onTrigger: (trigger: string) => void): void {
    this.animBindings.set(entityId, onTrigger);
  }
  unbindAnimTrigger(entityId: EntityId): void { this.animBindings.delete(entityId); }

  private fireAnimTrigger(entityId: EntityId, trigger: string): void {
    const fn = this.animBindings.get(entityId);
    if (fn) try { fn(trigger); } catch { /* ignore */ }
  }

  dispose(): void {
    this.health.clear();
    this.hitboxes.clear();
    this.projectiles.length = 0;
    this.damageQueue.length = 0;
    this.weapons.clear();
    this.lastFireTime.clear();
    this.animBindings.clear();
  }
}
