import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { EscortFollowerState, EscortMissionConfig, EscortMode } from './types';

export const DEFAULT_ESCORT_CONFIG: EscortMissionConfig = {
  enabled: true,
  interactRange: 6.0,
  followWalkSpeed: 3.5,
  followRunSpeed: 6.5,
  catchupSpeed: 9.0,
  teleportDistance: 45.0,
  deliveryRadius: 8.0,
  maxFollowers: 3,
};

export class EscortMissionSystem {
  private config: EscortMissionConfig;
  private readonly followers: EscortFollowerState[] = [];
  private readonly followerMeshes = new Map<string, THREE.Object3D>();
  private readonly rootGroup = new THREE.Group();
  private nextFollowerId = 1;
  private readonly unsubs: (() => void)[] = [];

  constructor(private readonly engine: Engine, initialConfig: EscortMissionConfig = DEFAULT_ESCORT_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.name = 'EscortMissionRoot';
    this.bindEvents();
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    const u1 = events.on('vehicle_mounted', () => {
      this.notifyPlayerBoardedVehicle();
    });

    const u2 = events.on('vehicle_dismounted', () => {
      this.notifyPlayerExitedVehicle();
    });

    if (u1) this.unsubs.push(u1);
    if (u2) this.unsubs.push(u2);
  }

  setConfig(config: Partial<EscortMissionConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.clear();
    }
  }

  getConfig(): Readonly<EscortMissionConfig> {
    return this.config;
  }

  getFollowers(): readonly EscortFollowerState[] {
    return this.followers;
  }

  recruitFollower(entityId: EntityId, name = 'Companion'): string | null {
    if (!this.config.enabled || this.followers.length >= this.config.maxFollowers) {
      return null;
    }

    const id = `escort_${this.nextFollowerId++}`;
    const slotIndex = this.followers.length;

    const follower: EscortFollowerState = {
      id,
      entityId,
      name,
      mode: 'following',
      position: new THREE.Vector3(),
      yaw: 0,
      isRecruited: true,
      slotIndex,
    };

    const rb = this.engine.sceneManager.getRigidBody(entityId);
    if (rb) {
      follower.position.copy(rb.mesh.position);
    }

    this.followers.push(follower);
    this.engine.sceneManager?.events?.emit('escort_recruited', { followerId: id, entityId, name });
    return id;
  }

  dismissFollower(followerId: string): boolean {
    const idx = this.followers.findIndex((f) => f.id === followerId);
    if (idx === -1) return false;

    const follower = this.followers[idx];
    follower.isRecruited = false;
    follower.mode = 'idle';
    this.followers.splice(idx, 1);

    // Re-index remaining followers' slots
    this.followers.forEach((f, i) => { f.slotIndex = i; });

    this.engine.sceneManager?.events?.emit('escort_dismissed', { followerId, entityId: follower.entityId });
    return true;
  }

  notifyPlayerBoardedVehicle(): void {
    for (const f of this.followers) {
      f.mode = 'in_vehicle';
    }
    this.engine.sceneManager?.events?.emit('escorts_boarded_vehicle', {});
  }

  notifyPlayerExitedVehicle(): void {
    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    const playerPos = playerRb ? playerRb.mesh.position : new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < this.followers.length; i++) {
      const f = this.followers[i];
      f.mode = 'following';
      // Step them out beside player
      f.position.set(
        playerPos.x + (i % 2 === 0 ? 2.0 : -2.0) * (Math.floor(i / 2) + 1),
        playerPos.y,
        playerPos.z - 2.0
      );
      const rb = this.engine.sceneManager.getRigidBody(f.entityId);
      if (rb) {
        rb.setNextKinematicTranslation?.(f.position);
      }
    }
    this.engine.sceneManager?.events?.emit('escorts_exited_vehicle', {});
  }

  update(dt: number): void {
    if (!this.config.enabled || this.followers.length === 0) return;

    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    if (!playerRb) return;

    const playerPos = playerRb.mesh.position;
    const playerRot = playerRb.mesh.quaternion;

    for (const f of this.followers) {
      if (f.mode === 'in_vehicle') {
        f.position.copy(playerPos);
        const rb = this.engine.sceneManager.getRigidBody(f.entityId);
        if (rb) rb.setNextKinematicTranslation?.(f.position);
        continue;
      }

      if (f.mode !== 'following') continue;

      // Slot target behind player
      const row = Math.floor(f.slotIndex / 2) + 1;
      const col = f.slotIndex % 2 === 0 ? 1.8 : -1.8;
      const slotOffset = new THREE.Vector3(col, 0, -2.2 * row);
      if (playerRot) slotOffset.applyQuaternion(playerRot);

      const targetPos = playerPos.clone().add(slotOffset);
      const distToTarget = f.position.distanceTo(targetPos);

      // Extreme distance catchup recovery
      if (distToTarget > this.config.teleportDistance) {
        f.position.copy(targetPos);
        const rb = this.engine.sceneManager.getRigidBody(f.entityId);
        if (rb) rb.setNextKinematicTranslation?.(f.position);
        continue;
      }

      if (distToTarget > 0.8) {
        const speed = distToTarget > 12.0
          ? this.config.catchupSpeed
          : (distToTarget > 4.5 ? this.config.followRunSpeed : this.config.followWalkSpeed);

        const moveDir = targetPos.clone().sub(f.position).normalize();
        f.position.addScaledVector(moveDir, speed * dt);
        f.yaw = Math.atan2(moveDir.x, moveDir.z);

        const rb = this.engine.sceneManager.getRigidBody(f.entityId);
        if (rb) {
          rb.setNextKinematicTranslation?.(f.position);
          if (rb.mesh) rb.mesh.rotation.y = f.yaw;
        }
      }
    }
  }

  hasDeliveredActiveEscortToObjective(objectivePos: THREE.Vector3, deliveryRadius = this.config.deliveryRadius): boolean {
    if (this.followers.length === 0) return false;

    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    if (!playerRb) return false;

    // Check player proximity
    if (playerRb.mesh.position.distanceTo(objectivePos) > deliveryRadius) {
      return false;
    }

    // Check all active followers
    const allInRadius = this.followers.every(
      (f) => f.position.distanceTo(objectivePos) <= deliveryRadius * 1.5
    );

    return allInRadius;
  }

  clear(): void {
    this.followers.length = 0;
    this.followerMeshes.clear();
    this.rootGroup.clear();
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }
}
