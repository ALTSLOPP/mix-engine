import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { ActiveGrenade, ExplosivesConfig, GrenadeDef } from './types';
import { ContentModelInstance } from '../../content/ContentModelInstance';

export class ExplosivesSystem {
  private config: ExplosivesConfig;
  private readonly activeGrenades: ActiveGrenade[] = [];
  private throwCooldownTimer = 0;
  private carriedGrenades = 3;
  private nextGrenadeId = 1;
  private readonly models = new Map<string, ContentModelInstance>();

  private readonly _tempDir = new THREE.Vector3();
  private readonly _hitNormal = new THREE.Vector3(0, 1, 0);

  constructor(private readonly engine: Engine, initialConfig: ExplosivesConfig) {
    this.config = { ...initialConfig };
    this.carriedGrenades = this.config.maxCarriedGrenades;
  }

  setConfig(config: Partial<ExplosivesConfig>): void {
    this.config = { ...this.config, ...config };
    this.carriedGrenades = Math.min(this.carriedGrenades, this.config.maxCarriedGrenades);
    if (!this.config.enabled) {
      this.dispose();
      this.throwCooldownTimer = 0;
    }
  }

  getConfig(): Readonly<ExplosivesConfig> {
    return this.config;
  }

  get remainingGrenades(): number {
    return this.carriedGrenades;
  }

  get grenades(): readonly ActiveGrenade[] {
    return this.activeGrenades;
  }

  throwGrenade(grenadeId?: string): boolean {
    if (!this.config.enabled || this.carriedGrenades <= 0 || this.throwCooldownTimer > 0) {
      return false;
    }

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    const def = (grenadeId ? this.config.grenades.find((g) => g.id === grenadeId) : this.config.grenades[0]) ?? this.config.grenades[0];
    if (!def) return false;

    const camera = this.engine.viewport.camera;
    const throwDir = new THREE.Vector3();
    camera.getWorldDirection(throwDir);
    // Add slight upward pitch for lobbing
    throwDir.y += 0.25;
    throwDir.normalize();

    const spawnPos = playerRb.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(throwDir, 0.8);
    const velocity = throwDir.clone().multiplyScalar(def.throwVelocity);

    const grenade: ActiveGrenade = {
      attackerId: playerEntityId,
      id: `grenade_${this.nextGrenadeId++}`,
      position: spawnPos,
      velocity,
      fuseRemaining: def.fuseTime,
      def,
    };

    this.activeGrenades.push(grenade);
    if (def.modelAssetId && this.engine.manifest && this.engine.assetCache && this.engine.viewport?.scene) {
      const model = new ContentModelInstance(this.engine.manifest, this.engine.assetCache, def.modelAssetId, def.modelSize ?? 0.12);
      model.root.position.copy(spawnPos);
      this.engine.viewport.scene.add(model.root);
      this.models.set(grenade.id, model);
    }
    this.carriedGrenades--;
    this.throwCooldownTimer = this.config.grenadeThrowCooldown;

    const throwSound = def.audioThrow ?? '/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav';
    if (throwSound) this.engine.audio.play(throwSound, { volume: 0.8, loop: false });
    this.engine.sceneManager.events.emit('grenade_thrown', { grenade });
    return true;
  }

  replenishGrenades(count?: number): void {
    this.carriedGrenades = Math.min(this.config.maxCarriedGrenades, this.carriedGrenades + (count ?? this.config.maxCarriedGrenades));
  }

  private explode(grenade: ActiveGrenade): void {
    const pos = grenade.position;
    const def = grenade.def;

    // Visual & Audio Effects
    this.engine.burstVfx(def.type === 'incendiary' ? 'fire' : (def.type === 'smoke' ? 'smoke' : 'explosion'), pos, 30);
    this.engine.effects.shake({ trauma: 0.45, duration: 0.35 });
    const explosionSound = def.audioExplosion ?? '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav';
    if (explosionSound) this.engine.audio.play(explosionSound, { volume: 1.0, loop: false });

    // Apply Radial Damage & Knockback to Entities with Occlusion Checking
    const allEntities = this.engine.sceneManager.allEntityIds();
    for (const id of allEntities) {
      const rb = this.engine.sceneManager.getRigidBody(id);
      if (!rb) continue;

      const targetPos = rb.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
      const dist = pos.distanceTo(targetPos);
      if (def.blastRadius > 0 && dist <= def.blastRadius) {
        // Line-of-sight check to ensure explosion cannot penetrate solid walls
        const toTarget = targetPos.clone().sub(pos);
        const dir = toTarget.clone().normalize();

        const hit = this.engine.physicsWorld?.raycastExcludeBody
          ? this.engine.physicsWorld.raycastExcludeBody(pos, dir, dist, rb.rapierBody)
          : (this.engine.physicsWorld?.raycast ? this.engine.physicsWorld.raycast(pos, dir, dist) : null);

        // If an obstacle closer than the target is hit, damage is occluded
        if (hit && hit.toi < dist - 0.2) {
          continue; // Occluded by cover / wall
        }

        // Falloff damage calculation (100% at epicenter -> 25% at edge)
        const falloff = 1.0 - (dist / def.blastRadius) * 0.75;
        const damage = Math.round(def.damage * falloff);

        this.engine.combat.applyDamage(grenade.attackerId ?? null, id, damage, 'explosion');

        // Physics Shockwave Knockback
        this._tempDir.subVectors(rb.mesh.position, pos).normalize();
        this._tempDir.y += 0.4;
        this._tempDir.normalize();

        const knockbackImpulse = (1.0 - dist / def.blastRadius) * 15.0;
        rb.setNextKinematicTranslation?.(rb.mesh.position.clone().addScaledVector(this._tempDir, knockbackImpulse * 0.05));
      }
    }

    this.engine.sceneManager.events.emit('grenade_exploded', {
      position: pos,
      blastRadius: def.blastRadius,
      damage: def.damage,
      type: def.type,
    });
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (this.throwCooldownTimer > 0) {
      this.throwCooldownTimer = Math.max(0, this.throwCooldownTimer - dt);
    }

    // Step active grenades physics with environment collision checks
    const gravity = new THREE.Vector3(0, -9.81, 0);

    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      let remaining = Math.min(dt, Math.max(0, g.fuseRemaining));
      g.fuseRemaining -= dt;

      while (remaining > 1e-9) {
        const step = Math.min(remaining, 1 / 60);
        g.velocity.addScaledVector(gravity, step);

        const moveDist = g.velocity.length() * step;
        if (moveDist > 1e-4 && this.engine.physicsWorld?.raycast) {
          const moveDir = g.velocity.clone().normalize();
          const hit = this.engine.physicsWorld.raycast(g.position, moveDir, moveDist + 0.05);

          if (hit && hit.toi <= moveDist + 0.05) {
            // Collision contact: reflect velocity along normal with bounciness and friction
            g.position.addScaledVector(moveDir, Math.max(0, hit.toi - 0.02));

            // Assume floor or wall collision normal
            const normal = (moveDir.y < -0.5) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(-moveDir.x, 0, -moveDir.z).normalize();
            const dot = g.velocity.dot(normal);
            if (dot < 0) {
              g.velocity.addScaledVector(normal, -(1 + g.def.bounciness) * dot);
              g.velocity.x *= 0.75;
              g.velocity.z *= 0.75;
            }
          } else {
            g.position.addScaledVector(g.velocity, step);
          }
        } else {
          g.position.addScaledVector(g.velocity, step);
        }

        // Safety clamp for zero plane
        if (g.position.y <= 0.1) {
          g.position.y = 0.1;
          g.velocity.y = Math.abs(g.velocity.y) * g.def.bounciness;
          g.velocity.x *= 0.7;
          g.velocity.z *= 0.7;
        }

        remaining -= step;
      }

      if (g.fuseRemaining <= 0) {
        this.explode(g);
        this.models.get(g.id)?.dispose();
        this.models.delete(g.id);
        this.activeGrenades.splice(i, 1);
      } else {
        this.models.get(g.id)?.root.position.copy(g.position);
      }
    }
  }

  dispose(): void {
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
    this.activeGrenades.length = 0;
  }
}
