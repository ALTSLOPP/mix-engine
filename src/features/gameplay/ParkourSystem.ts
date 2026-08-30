import * as THREE from 'three';
import { gameplayRaycast } from './GameplayRaycast';
import type { Engine } from '../../engine/Engine';
import type { ParkourConfig } from './types';
import type { AnimationStateMachine } from '../../animation/AnimationStateMachine';

export class ParkourSystem {
  private config: ParkourConfig;
  private isVaulting = false;
  private isClimbing = false;
  private parkourTimer = 0;
  private readonly _tempRayOrigin = new THREE.Vector3();
  private readonly _tempRayDir = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: ParkourConfig) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<ParkourConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.isVaulting = false; this.isClimbing = false; this.parkourTimer = 0; }
  }

  getConfig(): Readonly<ParkourConfig> {
    return this.config;
  }

  get isPerformingAction(): boolean {
    return this.isVaulting || this.isClimbing;
  }

  tryParkourAction(asm?: AnimationStateMachine | null): boolean {
    if (!this.config.enabled || this.isPerformingAction) return false;

    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId === null) return false;

    const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
    if (!playerRb) return false;

    const playerPos = playerRb.mesh.position;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerRb.mesh.quaternion);

    // 1. Raycast forward at waist height (0.8m) to detect obstacle
    this._tempRayOrigin.copy(playerPos).add(new THREE.Vector3(0, 0.8, 0));
    this._tempRayDir.copy(forward).normalize();

    const hit = gameplayRaycast(this.engine, this._tempRayOrigin, this._tempRayDir, 1.5);
    if (!hit) return false;

    // 2. Raycast downward from above obstacle to find ledge top
    const ledgeCheckPos = this._tempRayOrigin.clone().addScaledVector(this._tempRayDir, 1.0).add(new THREE.Vector3(0, 1.5, 0));
    const downHit = gameplayRaycast(this.engine, ledgeCheckPos, new THREE.Vector3(0, -1, 0), 2.5);

    if (downHit) {
      const obstacleHeight = downHit.point.y - playerPos.y;

      if (obstacleHeight >= this.config.vaultMinHeight && obstacleHeight <= this.config.vaultMaxHeight) {
        // Vault Action
        this.isVaulting = true;
        this.parkourTimer = 0.55;

        // Teleport/launch player over obstacle
        const targetPos = playerPos.clone().addScaledVector(forward, 2.0);
        targetPos.y = downHit.point.y + 0.1;
        playerRb.setNextKinematicTranslation(targetPos);

        if (asm) asm.transition(this.config.mantleAnimation, 0.1);
        this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.5, loop: false });
        return true;
      } else if (obstacleHeight > this.config.vaultMaxHeight && obstacleHeight <= this.config.climbMaxHeight) {
        // High Climb / Mantle Action
        this.isClimbing = true;
        this.parkourTimer = 0.85;

        const targetPos = playerPos.clone().addScaledVector(forward, 1.2);
        targetPos.y = downHit.point.y + 0.5;
        playerRb.setNextKinematicTranslation(targetPos);

        if (asm) asm.transition(this.config.mantleAnimation, 0.1);
        this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 0.6, loop: false });
        return true;
      }
    }

    return false;
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (this.parkourTimer > 0) {
      this.parkourTimer -= dt;
      if (this.parkourTimer <= 0) {
        this.isVaulting = false;
        this.isClimbing = false;
      }
    }
  }
}
