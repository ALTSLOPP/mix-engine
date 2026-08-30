import * as THREE from 'three';
import { gameplayRaycast } from './GameplayRaycast';
import type { Engine } from '../../engine/Engine';
import type { GrappleHookConfig } from './types';
import type { EntityId } from '../../ecs/SceneManager';

export class GrappleHookSystem {
  private config: GrappleHookConfig;
  private isGrappling = false;
  private anchorPoint = new THREE.Vector3();
  private hookedEnemyId: EntityId | null = null;

  private readonly _tempDir = new THREE.Vector3();
  private readonly _cameraDir = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: GrappleHookConfig) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<GrappleHookConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.releaseGrapple(); }
  }

  getConfig(): Readonly<GrappleHookConfig> {
    return this.config;
  }

  get active(): boolean {
    return this.isGrappling;
  }

  get anchor(): THREE.Vector3 {
    return this.anchorPoint;
  }

  fireGrapple(): boolean {
    if (!this.config.enabled || this.isGrappling) return false;

    const camera = this.engine.viewport.camera;
    camera.getWorldDirection(this._cameraDir);

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    const rayOrigin = playerRb.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const hit = gameplayRaycast(this.engine, rayOrigin, this._cameraDir, this.config.maxRange);

    if (hit) {
      this.isGrappling = true;
      this.anchorPoint.copy(hit.point);
      this.hookedEnemyId = null;

      // Check if hooked an enemy
      const hitBody = this.engine.physicsWorld.rapierBodyFromColliderHandle?.(hit.colliderHandle);
      const allEntities = this.engine.sceneManager.allEntityIds();
      for (const id of allEntities) {
        if (id === playerEntityId) continue;
        const rb = this.engine.sceneManager.getRigidBody(id);
        if (rb && hitBody && rb.rapierBody === hitBody && this.engine.sceneManager.hasTag(id, 'enemy')) {
          this.hookedEnemyId = id;
          break;
        }
      }

      this.engine.burstVfx('sparks', hit.point, 15);
      this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.8, loop: false });
      return true;
    }

    return false;
  }

  releaseGrapple(): void {
    if (!this.isGrappling) return;
    this.isGrappling = false;
    this.hookedEnemyId = null;
  }

  update(dt: number): void {
    if (!this.config.enabled || !this.isGrappling) return;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) {
      this.releaseGrapple();
      return;
    }

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) {
      this.releaseGrapple();
      return;
    }

    // Pull enemy towards player if hooked
    if (this.hookedEnemyId !== null && this.config.pullEnemies) {
      const enemyRb = this.engine.sceneManager.getRigidBody(this.hookedEnemyId);
      if (enemyRb) {
        this._tempDir.subVectors(playerRb.mesh.position, enemyRb.mesh.position);
        if (this._tempDir.length() > 2.0) {
          this._tempDir.normalize();
          enemyRb.setNextKinematicTranslation(
            enemyRb.mesh.position.clone().addScaledVector(this._tempDir, Math.min(this.config.pullSpeed * dt, Math.max(0, enemyRb.mesh.position.distanceTo(playerRb.mesh.position) - 2))),
          );
        } else {
          this.releaseGrapple();
        }
        return;
      }
    }

    // Pull Player towards anchor point
    this._tempDir.subVectors(this.anchorPoint, playerRb.mesh.position);
    const dist = this._tempDir.length();

    if (dist > 1.5) {
      this._tempDir.normalize();
      const pullVelocity = this._tempDir.clone().multiplyScalar(Math.min(this.config.pullSpeed * dt, dist));
      playerRb.setNextKinematicTranslation(playerRb.mesh.position.clone().add(pullVelocity));
    } else {
      // Reached anchor -> auto-release with small vertical boost
      playerRb.setNextKinematicTranslation(playerRb.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
      this.releaseGrapple();
    }
  }
}
