import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { BattleCameraShotKind, BattleCameraTarget } from './BattleCameraShotPlanner';
import { planBattleCameraFraming } from './BattleCameraShotPlanner';

export class BattleCameraDirector {
  private activeShot: BattleCameraShotKind = 'establish';
  private shotTimer = 0;
  private shotDuration = 3.5;
  private isCinematicActive = false;
  private orbitAngle = 0;
  private baseFov = 60;
  private firstFrame = true;

  private allyTarget: BattleCameraTarget = {
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, 1),
    height: 1.8,
    sizeClass: 'humanoid_medium',
  };

  private opponentTarget: BattleCameraTarget = {
    position: new THREE.Vector3(0, 0, 10),
    forward: new THREE.Vector3(0, 0, -1),
    height: 2.2,
    sizeClass: 'large_quadruped',
  };

  private framingPlan = planBattleCameraFraming(this.allyTarget, this.opponentTarget, 'establish');

  constructor(private readonly engine: Engine) {}

  startCutsceneShot(shot: BattleCameraShotKind, durationSeconds = 3.5): void {
    this.startCutscene(shot, this.allyTarget, this.opponentTarget, durationSeconds);
  }

  startCutscene(
    shot: BattleCameraShotKind,
    ally: BattleCameraTarget,
    opponent: BattleCameraTarget,
    durationSeconds = 3.5
  ): void {
    this.activeShot = shot;
    this.allyTarget = {
      position: ally.position.clone(),
      forward: ally.forward.clone().normalize(),
      height: ally.height,
      sizeClass: ally.sizeClass,
    };
    this.opponentTarget = {
      position: opponent.position.clone(),
      forward: opponent.forward.clone().normalize(),
      height: opponent.height,
      sizeClass: opponent.sizeClass,
    };
    this.shotDuration = durationSeconds;
    this.shotTimer = 0;
    this.orbitAngle = 0;
    this.firstFrame = true;

    this.framingPlan = planBattleCameraFraming(this.allyTarget, this.opponentTarget, shot);
    this.isCinematicActive = true;

    // Request camera override in arbitrator
    const camera = this.engine.viewport.camera;
    this.baseFov = camera.fov;

    this.engine.player?.cameraArbitrator?.requestOverride({
      id: 'battle_camera_director',
      mode: 'cinematic',
      priority: 15,
      onUpdate: (dt: number, cam: THREE.Camera) => {
        this.updateCamera(dt, cam as THREE.PerspectiveCamera);
        return true;
      },
    });
  }

  endCutscene(): void {
    if (!this.isCinematicActive) return;
    this.isCinematicActive = false;
    this.engine.player?.cameraArbitrator?.releaseOverride('battle_camera_director');
    const camera = this.engine.viewport.camera;
    camera.fov = this.baseFov;
    camera.updateProjectionMatrix();
  }

  getShot(): BattleCameraShotKind {
    return this.activeShot;
  }

  isActive(): boolean {
    return this.isCinematicActive;
  }

  update(dt: number): void {
    if (!this.isCinematicActive) return;

    this.shotTimer += dt;
    this.orbitAngle += dt * 0.5;

    if (this.shotTimer >= this.shotDuration) {
      this.endCutscene();
    }
  }

  private updateCamera(dt: number, camera: THREE.PerspectiveCamera): void {
    const allyPos = this.allyTarget.position;
    const oppPos = this.opponentTarget.position;
    const midPoint = allyPos.clone().lerp(oppPos, 0.5);
    const combatDistance = Math.max(1.0, allyPos.distanceTo(oppPos));
    const scale = this.framingPlan.framingScale;

    camera.fov = this.baseFov + this.framingPlan.fovBoost;
    camera.updateProjectionMatrix();

    const applyPos = (targetPos: THREE.Vector3) => {
      if (this.firstFrame) {
        camera.position.copy(targetPos);
      } else {
        camera.position.lerp(targetPos, Math.min(12 * dt, 1));
      }
    };

    switch (this.activeShot) {
      case 'establish': {
        // Wide 3/4 angle overview
        const toSide = new THREE.Vector3().crossVectors(
          oppPos.clone().sub(allyPos).normalize(),
          new THREE.Vector3(0, 1, 0)
        );
        const camPos = midPoint.clone()
          .addScaledVector(toSide, combatDistance * 1.1 * scale)
          .add(new THREE.Vector3(0, Math.max(3.0, combatDistance * 0.4), 0));
        applyPos(camPos);
        camera.lookAt(midPoint.clone().add(new THREE.Vector3(0, this.framingPlan.focusHeight, 0)));
        break;
      }

      case 'ally_shoulder': {
        // Over ally's right shoulder looking at opponent
        const behindAlly = this.allyTarget.forward.clone().negate();
        const rightOffset = new THREE.Vector3().crossVectors(this.allyTarget.forward, new THREE.Vector3(0, 1, 0));
        const camPos = allyPos.clone()
          .addScaledVector(behindAlly, 1.8 * scale)
          .addScaledVector(rightOffset, 0.8)
          .add(new THREE.Vector3(0, this.allyTarget.height * 0.9, 0));
        applyPos(camPos);
        camera.lookAt(oppPos.clone().add(new THREE.Vector3(0, this.opponentTarget.height * 0.7, 0)));
        break;
      }

      case 'opponent_shoulder': {
        // Over opponent's shoulder looking at ally
        const behindOpp = this.opponentTarget.forward.clone().negate();
        const rightOffset = new THREE.Vector3().crossVectors(this.opponentTarget.forward, new THREE.Vector3(0, 1, 0));
        const camPos = oppPos.clone()
          .addScaledVector(behindOpp, 1.8 * scale)
          .addScaledVector(rightOffset, 0.8)
          .add(new THREE.Vector3(0, this.opponentTarget.height * 0.9, 0));
        applyPos(camPos);
        camera.lookAt(allyPos.clone().add(new THREE.Vector3(0, this.allyTarget.height * 0.7, 0)));
        break;
      }

      case 'side_action': {
        // Low dynamic side profile
        const toSide = new THREE.Vector3().crossVectors(
          oppPos.clone().sub(allyPos).normalize(),
          new THREE.Vector3(0, 1, 0)
        );
        const camPos = midPoint.clone()
          .addScaledVector(toSide, combatDistance * 0.8 * scale)
          .add(new THREE.Vector3(0, 1.2, 0));
        applyPos(camPos);
        camera.lookAt(midPoint.clone().add(new THREE.Vector3(0, this.framingPlan.focusHeight, 0)));
        break;
      }

      case 'tactical_high': {
        // Elevated isometric angle
        const camPos = midPoint.clone().add(new THREE.Vector3(0, combatDistance * 1.2 * scale, combatDistance * 0.8));
        applyPos(camPos);
        camera.lookAt(midPoint.clone().add(new THREE.Vector3(0, 0.5, 0)));
        break;
      }

      case 'critical_orbit': {
        // Circular rotating orbit around focal impact point
        const radius = combatDistance * 0.9 * scale;
        const x = midPoint.x + Math.cos(this.orbitAngle) * radius;
        const z = midPoint.z + Math.sin(this.orbitAngle) * radius;
        const camPos = new THREE.Vector3(x, midPoint.y + 2.0 * scale, z);
        applyPos(camPos);
        camera.lookAt(midPoint.clone().add(new THREE.Vector3(0, this.framingPlan.focusHeight, 0)));
        break;
      }

      case 'victory_hero': {
        // Low angle hero shot on ally
        const front = this.allyTarget.forward.clone().multiplyScalar(2.2);
        const camPos = new THREE.Vector3(allyPos.x + front.x, allyPos.y + 0.5, allyPos.z + front.z);
        applyPos(camPos);
        camera.lookAt(allyPos.clone().add(new THREE.Vector3(0, this.allyTarget.height * 0.75, 0)));
        break;
      }

      case 'faint_reaction': {
        // Close-up on opponent
        const camPos = new THREE.Vector3(oppPos.x, oppPos.y + 0.8, oppPos.z + 2.0);
        applyPos(camPos);
        camera.lookAt(oppPos.clone().add(new THREE.Vector3(0, 0.4, 0)));
        break;
      }
    }

    this.firstFrame = false;
  }

  dispose(): void {
    this.endCutscene();
  }
}
