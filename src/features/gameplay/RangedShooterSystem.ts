import * as THREE from 'three';
import { gameplayRaycast } from './GameplayRaycast';
import type { Engine } from '../../engine/Engine';
import type { RangedShooterConfig, RangedWeaponDef } from './types';
import type { AnimationStateMachine } from '../../animation/AnimationStateMachine';
import { ContentModelInstance } from '../../content/ContentModelInstance';

export class RangedShooterSystem {
  private config: RangedShooterConfig;
  private currentWeapon: RangedWeaponDef | null = null;
  private currentAmmo = 30;
  private readonly magazines = new Map<string, number>();
  private maxAmmo = 30;
  private isAiming = false;
  private adsLerp = 0;
  private baseFov: number | null = null;
  private isReloading = false;
  private reloadTimer = 0;
  private fireTimer = 0;
  private currentSpread = 0.02;
  private triggerHeld = false;
  private viewModel: ContentModelInstance | null = null;
  private readonly viewRotation = new THREE.Quaternion();
  private readonly cameraRotation = new THREE.Quaternion();
  private readonly cameraPosition = new THREE.Vector3();

  // Weapon switch animation
  private isSwitching = false;
  private switchProgress = 0;
  private pendingWeapon: RangedWeaponDef | null = null;

  // Wall pushback
  private wallPush = 0;

  // Weapon Sway & Gun Kick
  private swayX = 0;
  private swayY = 0;
  private gunKickZ = 0;
  private gunKickPitch = 0;
  private sprintProgress = 0;

  private readonly _cameraDir = new THREE.Vector3();
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _muzzlePos = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: RangedShooterConfig) {
    this.config = { ...initialConfig };
    this.equipDefaultWeapon();
  }

  private equipDefaultWeapon(): void {
    if (this.config.weapons.length > 0) {
      const found = this.config.weapons.find((w) => w.id === this.config.defaultWeapon) ?? this.config.weapons[0];
      this.equipWeapon(found);
    }
  }

  equipWeapon(weapon: RangedWeaponDef): void {
    if (this.currentWeapon && this.currentWeapon.id !== weapon.id) {
      this.magazines.set(this.currentWeapon.id, this.currentAmmo);
    }
    this.currentWeapon = weapon;
    this.maxAmmo = weapon.magazineSize;
    this.currentAmmo = Math.min(weapon.magazineSize, this.magazines.get(weapon.id) ?? weapon.magazineSize);
    this.isReloading = false;
    this.reloadTimer = 0;
    this.currentSpread = weapon.spread;
    this.isSwitching = true;
    this.switchProgress = 0;
    this.refreshViewModel();
  }

  setConfig(config: Partial<RangedShooterConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.setAiming(false);
      this.isReloading = false;
      this.reloadTimer = 0;
      this.triggerHeld = false;
    }
    if (!this.currentWeapon || config.weapons || config.defaultWeapon !== undefined) {
      this.currentWeapon = null;
      this.equipDefaultWeapon();
      if (!this.currentWeapon) this.refreshViewModel();
    } else {
      this.refreshViewModel();
    }
  }

  getConfig(): Readonly<RangedShooterConfig> {
    return this.config;
  }

  get aiming(): boolean {
    return this.isAiming;
  }

  get ammo(): number {
    return this.currentAmmo;
  }

  get capacity(): number {
    return this.maxAmmo;
  }

  get weapon(): RangedWeaponDef | null {
    return this.currentWeapon;
  }

  get reloading(): boolean {
    return this.isReloading;
  }

  get adsProgress(): number {
    return this.adsLerp;
  }

  get swayOffset(): { x: number; y: number } {
    return { x: this.swayX, y: this.swayY };
  }

  setAiming(aiming: boolean): void {
    const camera = this.engine.viewport.camera;
    if (!this.config.enabled) {
      if (this.isAiming) {
        this.isAiming = false;
        camera.fov = this.baseFov ?? camera.fov;
        this.baseFov = null;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (aiming && !this.isAiming && this.baseFov === null) {
      this.baseFov = camera.fov;
    }
    this.isAiming = aiming;

    const isSniper = this.currentWeapon?.type === 'sniper';
    const targetFov = this.isAiming
      ? (isSniper ? 20 : this.config.aimZoomFov)
      : (this.baseFov ?? 60);

    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.25);
    if (!this.isAiming && Math.abs(camera.fov - (this.baseFov ?? 60)) < 0.5) {
      camera.fov = this.baseFov ?? camera.fov;
      this.baseFov = null;
    }
    camera.updateProjectionMatrix();

    if (isSniper) {
      this.engine.sceneManager?.events?.emit('sniper_scope_toggled', {
        active: this.isAiming,
        zoom: 4,
      });
    }
  }

  reload(): boolean {
    if (!this.config.enabled || !this.currentWeapon || this.isReloading || this.currentAmmo >= this.maxAmmo) {
      return false;
    }
    this.isReloading = true;
    this.reloadTimer = this.currentWeapon.reloadDuration;
    if (this.currentWeapon.audioReload) {
      this.engine.audio?.play?.(this.currentWeapon.audioReload, { volume: 0.7, loop: false });
    }
    this.engine.sceneManager?.events?.emit('player_reloading', {
      weaponId: this.currentWeapon.id,
      duration: this.currentWeapon.reloadDuration,
    });
    return true;
  }

  fire(asm?: AnimationStateMachine | null): boolean {
    if (!this.config.enabled || !this.currentWeapon || this.isReloading || this.fireTimer > 0) {
      return false;
    }

    if (this.currentAmmo <= 0) {
      this.reload();
      return false;
    }

    const shooterId = this.engine.player?.getPossessedId?.() ?? null;
    if (shooterId === null || !this.engine.sceneManager.getRigidBody(shooterId)) return false;
    this.currentAmmo--;
    this.fireTimer = 1.0 / this.currentWeapon.fireRate;
    this.currentSpread = Math.min(0.08, this.currentSpread + 0.015);

    // Apply procedural view kick & weapon kick
    const isSniper = this.currentWeapon.type === 'sniper';
    const isPistol = this.currentWeapon.type === 'pistol';
    const kickPitch = isSniper ? 0.06 : (isPistol ? 0.03 : 0.018);
    const kickYaw = (Math.random() - 0.5) * (isSniper ? 0.02 : 0.008);
    this.engine.player?.applyRecoil?.(kickPitch, kickYaw);
    this.gunKickZ = isSniper ? 0.12 : 0.06;
    this.gunKickPitch = isSniper ? 0.08 : 0.04;

    // Audio & Camera Recoil Shake
    if (this.engine.audio?.play) {
      this.engine.audio.play(this.currentWeapon.audioFire || '/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 0.85, loop: false });
    }
    this.engine.effects?.shake?.({ trauma: isSniper ? 0.25 : 0.12, duration: 0.15 });

    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    const playerPos = playerRb ? playerRb.mesh.position : new THREE.Vector3();

    // Muzzle Position & Flash
    const camera = this.engine.viewport.camera;
    camera.getWorldDirection(this._cameraDir);
    this._rayOrigin.copy(camera.position);

    this._muzzlePos.copy(camera.position).addScaledVector(this._cameraDir, 0.4);
    this.engine.burstVfx?.((this.currentWeapon.muzzleVfx as any) || 'muzzle_flash', this._muzzlePos, 8);

    // Apply spread
    const spreadX = (Math.random() - 0.5) * this.currentSpread;
    const spreadY = (Math.random() - 0.5) * this.currentSpread;
    this._cameraDir.x += spreadX;
    this._cameraDir.y += spreadY;
    this._cameraDir.normalize();

    // Muzzle line-of-sight check to prevent shooting through solid walls behind/beside muzzle
    if (playerRb?.rapierBody && this.engine.physicsWorld?.raycastExcludeBody) {
      const muzzleCheck = this.engine.physicsWorld.raycastExcludeBody(
        this._rayOrigin,
        this._cameraDir,
        0.5,
        playerRb.rapierBody
      );
      if (muzzleCheck && muzzleCheck.toi < 0.3) {
        this.engine.burstVfx?.('sparks', this._rayOrigin.clone().addScaledVector(this._cameraDir, muzzleCheck.toi), 8);
        return true;
      }
    }

    const hit = gameplayRaycast(this.engine, this._rayOrigin, this._cameraDir, this.currentWeapon.range);
    if (hit) {
      this.engine.burstVfx?.((this.currentWeapon.impactVfx as any) || 'sparks', hit.point, 12);

      // Check if target entity hit
      const hitBody = this.engine.physicsWorld?.rapierBodyFromColliderHandle?.(hit.colliderHandle);
      const allEntities = this.engine.sceneManager.allEntityIds();
      for (const id of allEntities) {
        if (id === playerEntityId) continue;
        const rb = this.engine.sceneManager.getRigidBody(id);
        if (!rb) continue;

        if (hitBody && rb.rapierBody === hitBody) {
          // Check Headshot (hit upper section)
          const isHeadshot = hit.point.y - rb.mesh.position.y > 1.2;
          const damage = isHeadshot
            ? this.currentWeapon.damage * this.config.headshotMultiplier
            : this.currentWeapon.damage;

          this.engine.combat?.applyDamage?.(playerEntityId, id, damage);
          this.engine.sceneManager?.events?.emit('crosshair_hit', {
            targetId: id,
            damage,
            isHeadshot,
          });

          if (isHeadshot) {
            this.engine.burstVfx?.('fire', hit.point, 15);
            this.engine.audio?.play?.('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 1.0, loop: false });
          }
          break;
        }
      }
    }

    if (asm && !this.config.showViewModel) {
      asm.transition('Punch To Elbow Combo', 0.05);
    }
    return true;
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (this.fireTimer > 0) {
      this.fireTimer = Math.max(0, this.fireTimer - dt);
    }

    const baseSpread = this.currentWeapon?.spread ?? 0.02;
    if (this.currentSpread > baseSpread) {
      this.currentSpread = Math.max(baseSpread, this.currentSpread - dt * 0.05);
    }

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        if (this.currentWeapon) {
          this.currentAmmo = this.currentWeapon.magazineSize;
        }
      }
    }

    // ADS transition lerp
    const targetAds = this.isAiming ? 1.0 : 0.0;
    this.adsLerp = THREE.MathUtils.lerp(this.adsLerp, targetAds, Math.min(18 * dt, 1));

    // Recovery from gun kick
    this.gunKickZ = THREE.MathUtils.lerp(this.gunKickZ, 0, Math.min(12 * dt, 1));
    this.gunKickPitch = THREE.MathUtils.lerp(this.gunKickPitch, 0, Math.min(12 * dt, 1));

    // Weapon switch progression
    if (this.isSwitching) {
      this.switchProgress += dt * 4.0;
      if (this.switchProgress >= 1.0) {
        this.isSwitching = false;
        this.switchProgress = 1.0;
      }
    }

    // Mouse look weapon sway
    const input = this.engine.input;
    if (input?.isPointerLocked && input.getMouseDelta) {
      const mouseDelta = input.getMouseDelta();
      const targetSwayX = THREE.MathUtils.clamp(-mouseDelta.x * 0.0006, -0.03, 0.03);
      const targetSwayY = THREE.MathUtils.clamp(mouseDelta.y * 0.0006, -0.03, 0.03);
      this.swayX = THREE.MathUtils.lerp(this.swayX, targetSwayX, Math.min(14 * dt, 1));
      this.swayY = THREE.MathUtils.lerp(this.swayY, targetSwayY, Math.min(14 * dt, 1));
    }
    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, Math.min(8 * dt, 1));
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, Math.min(8 * dt, 1));

    // Sprint posture interpolation
    const isSprint = input?.isActionActive?.('Sprint') || input?.isKeyDown?.('ShiftLeft') || input?.isKeyDown?.('ShiftRight');
    const targetSprint = (isSprint && !this.isAiming) ? 1.0 : 0.0;
    this.sprintProgress = THREE.MathUtils.lerp(this.sprintProgress, targetSprint, Math.min(10 * dt, 1));

    // Gun Wall Pushback detection
    const camera = this.engine.viewport.camera;
    camera.getWorldDirection(this._cameraDir);
    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;

    if (playerRb?.rapierBody && this.engine.physicsWorld?.raycastExcludeBody) {
      const wallHit = this.engine.physicsWorld.raycastExcludeBody(
        camera.position,
        this._cameraDir,
        0.65,
        playerRb.rapierBody
      );
      const targetPush = (wallHit && wallHit.toi < 0.65) ? (0.65 - wallHit.toi) : 0;
      this.wallPush = THREE.MathUtils.lerp(this.wallPush, targetPush, Math.min(16 * dt, 1));
    }

    this.updatePresentation();
  }

  /** Semi-auto requires a new press; legacy weapons retain their held-fire behavior. */
  trigger(held: boolean, asm?: AnimationStateMachine | null): boolean {
    const pressed = held && !this.triggerHeld;
    this.triggerHeld = held;
    return held && (this.currentWeapon?.automatic !== false || pressed) ? this.fire(asm) : false;
  }

  private refreshViewModel(): void {
    this.viewModel?.dispose();
    this.viewModel = null;
    const weapon = this.currentWeapon;
    if (!this.config.enabled || !this.config.showViewModel || !weapon?.modelAssetId ||
        !this.engine.manifest?.load || !this.engine.assetCache || !this.engine.viewport?.scene) return;
    this.viewModel = new ContentModelInstance(this.engine.manifest, this.engine.assetCache, weapon.modelAssetId, weapon.modelSize ?? 0.65, true);
    this.viewRotation.setFromEuler(new THREE.Euler(...(weapon.viewModelRotation ?? [0, Math.PI, 0])));
    this.engine.viewport.scene.add(this.viewModel.root);
    this.updatePresentation();
  }

  updatePresentation(): void {
    if (!this.viewModel) return;
    const root = this.viewModel.root;
    root.visible = this.config.enabled && this.engine.input?.mode === 'play' && (this.engine.player?.getPossessedId?.() ?? null) !== null;
    const camera = this.engine.viewport.camera;
    camera.getWorldQuaternion(this.cameraRotation);
    camera.getWorldPosition(this.cameraPosition);

    // ADS and Hipfire positions
    const hipX = 0.22 + this.swayX - this.sprintProgress * 0.08;
    const hipY = -0.25 + this.swayY - this.sprintProgress * 0.12;
    const hipZ = -0.65 + this.sprintProgress * 0.05;

    const adsX = 0.0;
    const adsY = -0.18;
    const adsZ = -0.45;

    const posX = THREE.MathUtils.lerp(hipX, adsX, this.adsLerp);
    const posY = THREE.MathUtils.lerp(hipY, adsY, this.adsLerp) - this.wallPush * 0.3 - (this.isSwitching ? (1 - this.switchProgress) * 0.3 : 0);
    const posZ = THREE.MathUtils.lerp(hipZ, adsZ, this.adsLerp) + this.gunKickZ + this.wallPush * 0.4;

    root.position.set(posX, posY, posZ)
      .applyQuaternion(this.cameraRotation).add(this.cameraPosition);

    const kickEuler = new THREE.Euler(
      this.gunKickPitch + this.wallPush * 0.3 - this.sprintProgress * 0.35,
      this.sprintProgress * 0.25,
      this.sprintProgress * 0.35
    );
    root.quaternion.copy(this.cameraRotation).multiply(this.viewRotation).multiply(new THREE.Quaternion().setFromEuler(kickEuler));
  }

  dispose(): void {
    this.viewModel?.dispose();
    this.viewModel = null;
  }
}
