import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { TargetLockConfig, TargetLockState } from './types';

export class TargetLockSystem {
  private config: TargetLockConfig;
  private readonly state: TargetLockState = {
    lockedTargetId: null,
    candidateIds: [],
    lockWorldPos: new THREE.Vector3(),
    screenPos: { x: 0, y: 0, visible: false },
  };

  private outOfViewTimer = 0;
  private readonly _tmpVec = new THREE.Vector3();
  private readonly _camDir = new THREE.Vector3();
  private readonly _targetDir = new THREE.Vector3();
  private readonly _playerPos = new THREE.Vector3();
  private readonly _targetPos = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: TargetLockConfig) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<TargetLockConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled && this.state.lockedTargetId !== null) {
      this.unlock();
    }
  }

  getConfig(): Readonly<TargetLockConfig> {
    return this.config;
  }

  getState(): Readonly<TargetLockState> {
    return this.state;
  }

  get isLocked(): boolean {
    return this.config.enabled && this.state.lockedTargetId !== null;
  }

  get lockedTargetId(): EntityId | null {
    return this.state.lockedTargetId;
  }

  toggleLock(): void {
    if (this.isLocked) {
      this.unlock();
    } else {
      this.lockNearest();
    }
  }

  lockNearest(): boolean {
    if (!this.config.enabled) return false;
    const candidates = this.findCandidates();
    if (candidates.length === 0) return false;

    // Pick top scored candidate
    this.state.lockedTargetId = candidates[0].id;
    this.outOfViewTimer = 0;
    this.syncMultiTargetCamera();
    return true;
  }

  unlock(): void {
    this.state.lockedTargetId = null;
    this.state.screenPos.visible = false;
    this.outOfViewTimer = 0;
    this.syncMultiTargetCamera();
  }

  cycleTarget(direction: 'next' | 'prev' = 'next'): boolean {
    if (!this.config.enabled) return false;
    const candidates = this.findCandidates();
    if (candidates.length === 0) {
      this.unlock();
      return false;
    }

    if (this.state.lockedTargetId === null) {
      this.state.lockedTargetId = candidates[0].id;
      this.syncMultiTargetCamera();
      return true;
    }

    const currentIdx = candidates.findIndex((c) => c.id === this.state.lockedTargetId);
    let nextIdx = 0;
    if (currentIdx !== -1) {
      if (direction === 'next') {
        nextIdx = (currentIdx + 1) % candidates.length;
      } else {
        nextIdx = (currentIdx - 1 + candidates.length) % candidates.length;
      }
    }

    this.state.lockedTargetId = candidates[nextIdx].id;
    this.outOfViewTimer = 0;
    this.syncMultiTargetCamera();
    return true;
  }

  update(dt: number): void {
    if (!this.config.enabled) {
      if (this.state.lockedTargetId !== null) this.unlock();
      return;
    }

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) {
      if (this.state.lockedTargetId !== null) this.unlock();
      return;
    }

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) {
      this.unlock();
      return;
    }

    this._playerPos.copy(playerRb.mesh.position);

    if (this.state.lockedTargetId !== null) {
      const targetRb = this.engine.sceneManager.getRigidBody(this.state.lockedTargetId);
      const targetHealth = this.engine.combat.getHealth(this.state.lockedTargetId);

      // Check if target died or was destroyed
      if (!targetRb || (targetHealth && targetHealth.hp <= 0)) {
        if (this.config.autoSwitchOnDeath) {
          if (!this.cycleTarget('next')) {
            this.unlock();
          }
        } else {
          this.unlock();
        }
        return;
      }

      this._targetPos.copy(targetRb.mesh.position);
      // Target chest / center height offset
      this._targetPos.y += 1.1;
      this.state.lockWorldPos.copy(this._targetPos);

      // Distance check
      const dist = this._playerPos.distanceTo(this._targetPos);
      if (dist > this.config.breakDistance) {
        this.unlock();
        return;
      }

      // Project target to screen coordinates for HUD reticle
      this.updateScreenProjection();

      // Keep target in line-of-sight / break timer if blocked for too long
      const isVisibleInCam = this.isTargetInView(this._targetPos);
      if (!isVisibleInCam) {
        this.outOfViewTimer += dt;
        if (this.outOfViewTimer > this.config.breakTimeOutOfView) {
          this.unlock();
          return;
        }
      } else {
        this.outOfViewTimer = Math.max(0, this.outOfViewTimer - dt * 2);
      }
    }
  }

  private findCandidates(): Array<{ id: EntityId; score: number }> {
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return [];

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return [];

    const cam = this.engine.viewport.camera;
    cam.getWorldDirection(this._camDir);
    this._camDir.y = 0;
    this._camDir.normalize();

    this._playerPos.copy(playerRb.mesh.position);
    const candidates: Array<{ id: EntityId; score: number }> = [];

    const allEntities = this.engine.sceneManager.allEntityIds();
    for (const id of allEntities) {
      if (id === playerEntityId) continue;
      const rb = this.engine.sceneManager.getRigidBody(id);
      if (!rb || !rb.mesh.visible) continue;

      // Filter to only combatants / enemies / characters
      const health = this.engine.combat.getHealth(id);
      const isCharacter = rb.mesh.userData.isCharacter || health != null;
      if (!isCharacter) continue;
      if (health && health.hp <= 0) continue;
      const playerHealth = this.engine.combat.getHealth(playerEntityId);
      if (health && playerHealth && health.faction === playerHealth.faction) continue;

      this._targetPos.copy(rb.mesh.position);
      const dist = this._playerPos.distanceTo(this._targetPos);
      if (dist > this.config.maxDistance || dist < 0.5) continue;

      this._targetDir.subVectors(this._targetPos, this._playerPos);
      this._targetDir.y = 0;
      this._targetDir.normalize();

      const dot = this._camDir.dot(this._targetDir);
      const angleDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(dot, -1, 1)));

      if (angleDeg <= this.config.fovAngle * 0.5) {
        // Lower score is better (distance weighted with angular deviation)
        const score = dist + (angleDeg / (this.config.fovAngle * 0.5)) * 12.0;
        candidates.push({ id, score });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    this.state.candidateIds = candidates.map((c) => c.id);
    return candidates;
  }

  private isTargetInView(worldPos: THREE.Vector3): boolean {
    const cam = this.engine.viewport.camera;
    this._tmpVec.copy(worldPos).project(cam);
    return (
      this._tmpVec.z < 1 &&
      this._tmpVec.x >= -1.1 &&
      this._tmpVec.x <= 1.1 &&
      this._tmpVec.y >= -1.1 &&
      this._tmpVec.y <= 1.1
    );
  }

  private updateScreenProjection(): void {
    if (!this.config.showReticle) {
      this.state.screenPos.visible = false;
      return;
    }

    const cam = this.engine.viewport.camera;
    this._tmpVec.copy(this.state.lockWorldPos).project(cam);

    // If behind camera
    if (this._tmpVec.z > 1) {
      this.state.screenPos.visible = false;
      return;
    }

    const width = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const height = typeof window !== 'undefined' ? window.innerHeight : 1080;

    this.state.screenPos.x = (this._tmpVec.x * 0.5 + 0.5) * width;
    this.state.screenPos.y = (-(this._tmpVec.y * 0.5) + 0.5) * height;
    this.state.screenPos.visible = true;
  }

  private syncMultiTargetCamera(): void {
    const playerEntityId = this.engine.player.getPossessedId();
    if (this.state.lockedTargetId !== null && playerEntityId !== null) {
      this.engine.multiTargetCamera.setTargets([playerEntityId, this.state.lockedTargetId]);
    } else {
      this.engine.multiTargetCamera.reset();
    }
  }
}
