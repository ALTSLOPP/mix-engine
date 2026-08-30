import * as THREE from 'three';
import { applyGameplayHit } from './GameplayHit';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { TimedHitboxConfig } from './types';

export interface ActiveHitboxVolume {
  attackerId: EntityId;
  attackInstanceId: string;
  sourceBoneName?: string;
  worldCenter: THREE.Vector3;
  radius: number;
  damage: number;
  poiseDamage: number;
  knockbackForce: number;
  knockbackDir?: THREE.Vector3;
  timeRemaining: number;
  alreadyHitEntityIds: Set<EntityId>;
}

export class TimedHitboxSystem {
  private readonly unsubscribe: Array<() => void> = [];

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  private config: TimedHitboxConfig;
  private readonly activeHitboxes: ActiveHitboxVolume[] = [];
  private readonly _hitboxCenter = new THREE.Vector3();
  private readonly _targetCenter = new THREE.Vector3();
  private readonly _diff = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: TimedHitboxConfig) {
    this.config = { ...initialConfig };
    this.bindAnimNotifies();
  }

  setConfig(config: Partial<TimedHitboxConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.activeHitboxes.length = 0; }
  }

  getConfig(): Readonly<TimedHitboxConfig> {
    return this.config;
  }

  private bindAnimNotifies(): void {
    // Listen to animation notify events fired from AnimNotifyManager / Engine
    this.unsubscribe.push(this.engine.sceneManager.events.on('hitbox_open', (payload: any) => {
      if (!this.config.enabled || !payload) return;
      this.openHitbox({
        attackerId: payload.entityId,
        attackInstanceId: `attack_${payload.entityId}_${Date.now()}`,
        sourceBoneName: payload.bone ?? 'mixamorig:RightHand',
        radius: payload.radius ?? 0.85,
        damage: payload.damage ?? this.config.defaultDamage,
        poiseDamage: payload.poiseDamage ?? 25,
        knockbackForce: payload.knockback ?? 5,
        duration: payload.duration ?? 0.35,
      });
    }));

    this.unsubscribe.push(this.engine.sceneManager.events.on('hitbox_close', (payload: any) => {
      if (payload?.entityId == null) return;
      this.closeHitboxesForEntity(payload.entityId);
    }));
  }

  openHitbox(params: {
    attackerId: EntityId;
    attackInstanceId?: string;
    sourceBoneName?: string;
    radius?: number;
    damage?: number;
    poiseDamage?: number;
    knockbackForce?: number;
    duration?: number;
  }): void {
    if (!this.config.enabled) return;

    const attackerRb = this.engine.sceneManager.getRigidBody(params.attackerId);
    if (!attackerRb) return;

    const bonePos = this.resolveBonePosition(attackerRb.mesh, params.sourceBoneName);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(attackerRb.mesh.quaternion);

    this.activeHitboxes.push({
      attackerId: params.attackerId,
      attackInstanceId: params.attackInstanceId ?? `inst_${Date.now()}_${Math.random()}`,
      sourceBoneName: params.sourceBoneName,
      worldCenter: bonePos ?? attackerRb.mesh.position.clone().addScaledVector(forward, 1.0).add(new THREE.Vector3(0, 1, 0)),
      radius: params.radius ?? 0.85,
      damage: params.damage ?? this.config.defaultDamage,
      poiseDamage: params.poiseDamage ?? 25,
      knockbackForce: params.knockbackForce ?? 5,
      knockbackDir: forward,
      timeRemaining: params.duration ?? 0.35,
      alreadyHitEntityIds: new Set<EntityId>(),
    });
  }

  closeHitboxesForEntity(attackerId: EntityId): void {
    for (let i = this.activeHitboxes.length - 1; i >= 0; i--) {
      if (this.activeHitboxes[i].attackerId === attackerId) {
        this.activeHitboxes.splice(i, 1);
      }
    }
  }

  update(dt: number): void {
    if (!this.config.enabled || this.activeHitboxes.length === 0) return;

    for (let i = this.activeHitboxes.length - 1; i >= 0; i--) {
      const hb = this.activeHitboxes[i];
      hb.timeRemaining -= dt;

      // Update world position tracking the bone/socket if attached
      const attackerRb = this.engine.sceneManager.getRigidBody(hb.attackerId);
      if (!attackerRb) { this.activeHitboxes.splice(i, 1); continue; }
      if (attackerRb) {
        const bonePos = this.resolveBonePosition(attackerRb.mesh, hb.sourceBoneName);
        if (bonePos) {
          hb.worldCenter.copy(bonePos);
        } else {
          const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(attackerRb.mesh.quaternion);
          hb.worldCenter.copy(attackerRb.mesh.position).addScaledVector(forward, 1).add(new THREE.Vector3(0, 1, 0));
        }
      }

      // Check overlap against candidate hurtbox entities
      this.evaluateCollisions(hb);

      // Debug draw
      if (this.config.debugDraw) {
        this.engine.debugDraw.drawSphere(hb.worldCenter, hb.radius, this.config.hitboxColor, dt * 1.5);
      }

      if (hb.timeRemaining <= 0) {
        this.activeHitboxes.splice(i, 1);
      }
    }
  }

  private evaluateCollisions(hb: ActiveHitboxVolume): void {
    const allEntities = this.engine.sceneManager.allEntityIds();

    for (const targetId of allEntities) {
      if (targetId === hb.attackerId) continue;
      if (!this.config.multiHitAllowed && hb.alreadyHitEntityIds.has(targetId)) continue;

      const targetRb = this.engine.sceneManager.getRigidBody(targetId);
      if (!targetRb || !targetRb.mesh.visible) continue;

      const targetHealth = this.engine.combat.getHealth(targetId);
      if (!targetHealth || targetHealth.hp <= 0) continue;

      // Target hurtbox center (chest/torso)
      this._targetCenter.copy(targetRb.mesh.position).add(new THREE.Vector3(0, 1.0, 0));
      const targetRadius = 0.65; // Standard character hurtbox capsule radius

      const dist = hb.worldCenter.distanceTo(this._targetCenter);
      if (dist <= hb.radius + targetRadius) {
        // Hit confirmed!
        hb.alreadyHitEntityIds.add(targetId);
        this.dispatchHit(hb, targetId, this._targetCenter);
      }
    }
  }

  private dispatchHit(hb: ActiveHitboxVolume, targetId: EntityId, hitPos: THREE.Vector3): void {
    const hitVector = this._diff.subVectors(hitPos, hb.worldCenter).normalize();
    if (hitVector.lengthSq() < 0.01) {
      hitVector.set(0, 0, 1);
    }

    // Emit damage / hit event through event bus & combat system
    applyGameplayHit(this.engine, {
      attackerId: hb.attackerId,
      targetId,
      damage: hb.damage,
      poiseDamage: hb.poiseDamage,
      knockbackForce: hb.knockbackForce,
      knockbackDir: hb.knockbackDir ?? hitVector,
      hitPosition: hitPos.clone(),
      hitboxId: hb.attackInstanceId,
    });

    // Spawn hit impact sparks VFX and audio
    this.engine.effects.hit({
      position: hitPos,
      intensity: Math.min(1.0, hb.damage / 30),
      color: '#ffdd44',
      vfx: 'sparks',
    });
    this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 0.9, loop: false });
  }

  private resolveBonePosition(mesh: THREE.Object3D, boneName?: string): THREE.Vector3 | null {
    if (!boneName) return null;
    let foundPos: THREE.Vector3 | null = null;

    mesh.traverse((child) => {
      if (foundPos) return;
      if (child.name.toLowerCase().includes(boneName.toLowerCase()) || child.name === boneName) {
        foundPos = new THREE.Vector3();
        child.getWorldPosition(foundPos);
      }
    });

    return foundPos;
  }
}
