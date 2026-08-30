import * as THREE from 'three';
import type { Engine } from './Engine';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { AnimationStateMachine } from '../animation/AnimationStateMachine';
import { CharacterLocomotor } from '../character/CharacterLocomotor';
import { CameraArbitrator, type CameraMode } from './CameraArbitrator';

export class PlayerController {
  private possessedId: number | null = null;
  private locomotor: CharacterLocomotor | null = null;
  private cameraYaw = 0;
  private cameraPitch = 0.2; // slight downward angle
  cameraDistance = 5;
  private currentSpeed = 0;
  private targetSpeed = 0;

  readonly cameraArbitrator = new CameraArbitrator('third_person');

  /** Recoil view kick spring physics. */
  private viewKickPitch = 0;
  private viewKickYaw = 0;
  private viewKickVelPitch = 0;
  private viewKickVelYaw = 0;
  viewKickSpring = 160;
  viewKickDamp = 22;

  /** Movement bobbing & sway. */
  private bobTime = 0;
  private readonly bobOffset = new THREE.Vector3();
  private isMoving = false;

  /** Eye height for first person mode. */
  eyeHeight = 1.68;

  /** Mouse look sensitivity (radians per pixel). */
  mouseSensitivity = 0.0025;
  /** Full-stick camera turn speed in radians per second. */
  gamepadLookSpeed = 2.5;
  /** Invert vertical look. */
  invertY = false;
  /** Walk/run speed multiplier. */
  speedMultiplier = 1.0;

  // Track active state transitions to prevent animation conflicts
  private isPerformingAction = false;
  private actionTimeout: number | null = null;

  constructor(private readonly engine: Engine) {
    // Seed initial camera angles from current camera direction
    const dir = new THREE.Vector3();
    this.engine.viewport.camera.getWorldDirection(dir);
    this.cameraYaw = Math.atan2(-dir.x, -dir.z);
    this.cameraPitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }

  possess(entityId: number | null): void {
    this.locomotor?.dispose();
    this.locomotor = null;
    if (this.possessedId !== null) {
      const prevRb = this.engine.sceneManager.getRigidBody(this.possessedId);
      if (prevRb) {
        prevRb.transformAuthority = 'physics';
        prevRb.setKinematicOverride(false);
      }
    }

    this.possessedId = entityId;

    if (entityId !== null) {
      const rb = this.engine.sceneManager.getRigidBody(entityId);
      if (rb) {
        // Character is kinematic under player control, but still collides
        rb.transformAuthority = 'physics'; // physics loop handles root motion
        rb.setKinematicOverride(true);
        rb.resetInterpolationBuffers();
        this.locomotor = new CharacterLocomotor(this.engine.physicsWorld, rb);
      } else {
        this.locomotor = null;
      }
      this.engine.consumePendingPlayerTransform(entityId);
    } else {
      this.locomotor = null;
    }
    this.isPerformingAction = false;
    if (this.actionTimeout) {
      clearTimeout(this.actionTimeout);
      this.actionTimeout = null;
    }
  }

  getPossessedId(): number | null {
    return this.possessedId;
  }

  getLocomotor(): CharacterLocomotor | null {
    return this.locomotor;
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraArbitrator.setBaseMode(mode);
  }

  getCameraMode(): CameraMode {
    return this.cameraArbitrator.getActiveMode();
  }

  isFirstPerson(): boolean {
    return this.cameraArbitrator.isFirstPerson();
  }

  applyRecoil(kickPitch: number, kickYaw: number): void {
    this.viewKickVelPitch += kickPitch;
    this.viewKickVelYaw += kickYaw;
  }

  getViewKickPitch(): number {
    return this.viewKickPitch;
  }

  getViewKickYaw(): number {
    return this.viewKickYaw;
  }

  getBobOffset(): THREE.Vector3 {
    return this.bobOffset;
  }

  fixedStep(fixedDt: number): void {
    const features = this.engine.gameplayFeatures;
    if (features && (features.defense.isDodging || features.parkour.isPerformingAction || features.grapple.active || features.vehicle.isMounted)) return;
    if (this.locomotor) {
      this.locomotor.fixedStep(fixedDt);
    }
  }

  /** SENSORIUM: expose the current third-person camera yaw so the telemetry recorder
   *  and the runner can correlate what the test "saw" with what the engine rendered. */
  getCameraYaw(): number { return this.cameraYaw; }
  getCameraPitch(): number { return this.cameraPitch; }

  /** SENSORIUM: set the camera angles directly (used by `lookAt` / `setCamera` actions
   *  so scripted tests can frame a shot precisely without mouse-delta accumulation). */
  setCameraAngles(yaw: number, pitch: number): void {
    this.cameraYaw = yaw;
    this.cameraPitch = THREE.MathUtils.clamp(pitch, -0.6, 1.2);
  }

  update(dt: number): void {
    if (this.possessedId === null || this.engine.input.mode !== 'play' || this.engine.gameplayFeatures?.pause?.isPaused) {
      return;
    }

    const rb = this.engine.sceneManager.getRigidBody(this.possessedId);
    if (!rb) return;

    const asm = this.getAnimationStateMachine(rb);
    if (asm) {
      this.updateMovement(dt, rb, asm);
    }
    this.updateCamera(dt, rb);
  }

  private getAnimationStateMachine(rb: RigidBodyComponent): AnimationStateMachine | null {
    // Engine owns the machine registry; ask it which one drives this rigid body.
    return this.engine.findAnimationStateMachine(rb);
  }

  private triggerAction(stateName: string, durationMs: number, asm: AnimationStateMachine): void {
    if (this.isPerformingAction && stateName !== 'die') return;

    this.isPerformingAction = true;
    asm.transition(stateName, 0.15);

    if (this.actionTimeout) clearTimeout(this.actionTimeout);

    if (stateName !== 'die') {
      this.actionTimeout = window.setTimeout(() => {
        this.isPerformingAction = false;
        this.actionTimeout = null;
      }, durationMs);
    }
  }

  private updateMovement(dt: number, rb: RigidBodyComponent, asm: AnimationStateMachine): void {
    const input = this.engine.input;

    // Force mouse lock in Play mode
    if (input.isMouseButtonDown(2) || input.isMouseButtonDown(0)) {
      input.requestPointerLock();
    }

    // Mouse and controller look can coexist. The gamepad path is action-mapped,
    // so IDE-authored remaps affect the real player camera immediately.
    const gamepadLook = input.getActionAxis2D('Look', 'gamepad');
    const hasGamepadLook = Math.hypot(gamepadLook.x, gamepadLook.y) > 0.01;
    if (input.isPointerLocked) {
      const mouseDelta = input.getMouseDelta();
      this.cameraYaw -= mouseDelta.x * this.mouseSensitivity;
      this.cameraPitch -= mouseDelta.y * this.mouseSensitivity * (this.invertY ? -1 : 1);
    }
    if (hasGamepadLook) {
      this.cameraYaw -= gamepadLook.x * this.gamepadLookSpeed * dt;
      this.cameraPitch -= gamepadLook.y * this.gamepadLookSpeed * dt * (this.invertY ? -1 : 1);
    }
    if (input.isPointerLocked || hasGamepadLook) {
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch, -0.6, 1.2);
    } else {
      // Sync angles to the actual camera direction when free-looking / exiting vehicles
      const dir = new THREE.Vector3();
      this.engine.viewport.camera.getWorldDirection(dir);
      this.cameraYaw = Math.atan2(-dir.x, -dir.z);
      this.cameraPitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    }

    // Action Key Bindings & Gameplay Features
    const gfm = this.engine.gameplayFeatures;

    // Reset locomotion every frame so action/dialogue early returns cannot leave old input held.
    if (this.locomotor) {
      this.locomotor.intent.moveX = 0;
      this.locomotor.intent.moveZ = 0;
      this.locomotor.intent.jump = false;
      this.locomotor.intent.jumpHeld = false;
    }
    if (gfm?.isFeatureEnabled('weapon_wheel_loadout') && !gfm.dialogue.isActive) {
      if (input.isKeyDown('Tab')) {
        gfm.loadout.openWheel();
        for (const weapon of gfm.loadout.getConfig().slots) {
          if (input.isKeyDown(`Digit${weapon.slot}`)) gfm.loadout.selectSlot(weapon.slot);
        }
        return;
      }
      gfm.loadout.closeWheel();
    }

    // 0. Active Dialogue Choice Selection (Blocks normal combat inputs during conversation)
    if (gfm && gfm.dialogue.isActive) {
      if (input.isKeyDown('Digit1') && !rb.mesh.userData._d1) {
        rb.mesh.userData._d1 = true;
        gfm.dialogue.selectChoice(0);
      } else if (!input.isKeyDown('Digit1')) {
        rb.mesh.userData._d1 = false;
      }
      if (input.isKeyDown('Digit2') && !rb.mesh.userData._d2) {
        rb.mesh.userData._d2 = true;
        gfm.dialogue.selectChoice(1);
      } else if (!input.isKeyDown('Digit2')) {
        rb.mesh.userData._d2 = false;
      }
      if (input.isKeyDown('Digit3') && !rb.mesh.userData._d3) {
        rb.mesh.userData._d3 = true;
        gfm.dialogue.selectChoice(2);
      } else if (!input.isKeyDown('Digit3')) {
        rb.mesh.userData._d3 = false;
      }
      if (input.isKeyDown('Escape')) {
        gfm.dialogue.endDialogue();
      }
      return;
    }

    // 1. Stealth Crouch Stance & Backstab Assassination
    if (gfm && gfm.isFeatureEnabled('stealth_detection')) {
      if (input.isKeyDown('ControlLeft') || (input.isKeyDown('KeyC') && !gfm.isFeatureEnabled('cover_peeking'))) {
        if (!rb.mesh.userData._crouchPressed) {
          rb.mesh.userData._crouchPressed = true;
          gfm.stealth.toggleCrouch(asm);
        }
      } else {
        rb.mesh.userData._crouchPressed = false;
      }

      if (gfm.stealth.backstabTarget !== null && input.isKeyDown('KeyE') && !rb.mesh.userData._backstabPressed) {
        rb.mesh.userData._backstabPressed = true;
        if (gfm.stealth.executeBackstab(asm)) {
          return;
        }
      } else if (!input.isKeyDown('KeyE')) {
        rb.mesh.userData._backstabPressed = false;
      }
    }

    // 2. Parkour Vault & Ledge Mantle
    if (gfm && gfm.isFeatureEnabled('parkour_traversal')) {
      if (input.isKeyDown('Space') && !gfm.vehicle.isMounted && !gfm.defense.isDodging && !gfm.parkour.isPerformingAction) {
        if (gfm.parkour.tryParkourAction(asm)) {
          return;
        }
      }
    }

    // 3. Target Lock Toggle & Cycling
    if (gfm && gfm.isFeatureEnabled('target_lock')) {
      if (input.isKeyDown('KeyL') || input.isMouseButtonDown(1)) {
        if (!rb.mesh.userData._lockPressed) {
          rb.mesh.userData._lockPressed = true;
          gfm.targetLock.toggleLock();
        }
      } else {
        rb.mesh.userData._lockPressed = false;
      }

      if (gfm.targetLock.isLocked && !gfm.cover.inCover) {
        if (input.isKeyDown('KeyQ') && !rb.mesh.userData._cycleQPressed) {
          rb.mesh.userData._cycleQPressed = true;
          gfm.targetLock.cycleTarget('prev');
        } else if (!input.isKeyDown('KeyQ')) {
          rb.mesh.userData._cycleQPressed = false;
        }

        if (input.isKeyDown('KeyE') && !rb.mesh.userData._cycleEPressed) {
          rb.mesh.userData._cycleEPressed = true;
          gfm.targetLock.cycleTarget('next');
        } else if (!input.isKeyDown('KeyE')) {
          rb.mesh.userData._cycleEPressed = false;
        }
      }
    }

    // 4. Abilities (Keys 1, 2, 3, 4)
    if (gfm && gfm.isFeatureEnabled('abilities_magic')) {
      if (input.isKeyDown('Digit1') || input.isKeyDown('Numpad1')) gfm.abilities.castAbility(1, asm);
      else if (input.isKeyDown('Digit2') || input.isKeyDown('Numpad2')) gfm.abilities.castAbility(2, asm);
      else if (input.isKeyDown('Digit3') || input.isKeyDown('Numpad3')) gfm.abilities.castAbility(3, asm);
      else if (input.isKeyDown('Digit4') || input.isKeyDown('Numpad4')) gfm.abilities.castAbility(4, asm);
    }

    // 5. Vehicle Driving / Mount Override
    if (gfm && gfm.isFeatureEnabled('vehicle_mount')) {
      if (input.isKeyDown('KeyF') && !rb.mesh.userData._mountPressed) {
        rb.mesh.userData._mountPressed = true;
        gfm.vehicle.toggleMount();
      } else if (!input.isKeyDown('KeyF')) {
        rb.mesh.userData._mountPressed = false;
      }

      if (gfm.vehicle.isMounted) {
        let throttle = 0;
        let steer = 0;
        if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) throttle += 1;
        if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) throttle -= 1;
        if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) steer -= 1;
        if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) steer += 1;
        const handbrake = input.isKeyDown('Space');
        const nitro = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');

        gfm.vehicle.update(dt, throttle, steer, handbrake, nitro);
        asm.transition('idle', 0.2);
        return; // Skip normal player walking while driving
      }
    }

    // 6. Ranged Shooter Aim & Gunplay
    if (gfm && gfm.isFeatureEnabled('ranged_shooter')) {
      const isAiming = input.isMouseButtonDown(2);
      gfm.ranged.setAiming(isAiming);

      gfm.ranged.trigger((isAiming || gfm.ranged.getConfig().showViewModel === true) &&
        (input.isMouseButtonDown(0) || input.isActionPressed('Attack')), asm);

      if (input.isKeyDown('KeyR') && !rb.mesh.userData._reloadPressed) {
        rb.mesh.userData._reloadPressed = true;
        gfm.ranged.reload();
      } else if (!input.isKeyDown('KeyR')) {
        rb.mesh.userData._reloadPressed = false;
      }
    }

    // 7. Grapple Hook
    if (gfm && gfm.isFeatureEnabled('grapple_swing')) {
      if (input.isKeyDown('KeyJ') && !rb.mesh.userData._grapplePressed) {
        rb.mesh.userData._grapplePressed = true;
        gfm.grapple.fireGrapple();
      } else if (!input.isKeyDown('KeyJ')) {
        rb.mesh.userData._grapplePressed = false;
      }
    }

    // 8. Time Dilation & Temporal Rewind
    if (gfm && gfm.isFeatureEnabled('time_mechanics')) {
      if (input.isKeyDown('KeyV') && !rb.mesh.userData._timeVPressed) {
        rb.mesh.userData._timeVPressed = true;
        gfm.time.activateBulletTime();
      } else if (!input.isKeyDown('KeyV')) {
        rb.mesh.userData._timeVPressed = false;
      }

      if (input.isKeyDown('KeyT') && !rb.mesh.userData._timeTPressed) {
        rb.mesh.userData._timeTPressed = true;
        gfm.time.rewindTime();
      } else if (!input.isKeyDown('KeyT')) {
        rb.mesh.userData._timeTPressed = false;
      }
    }

    // 9. Companion Pet Summon / Dismiss
    if (gfm && gfm.isFeatureEnabled('companion_summon')) {
      if (input.isKeyDown('KeyH') && !rb.mesh.userData._companionHPressed) {
        rb.mesh.userData._companionHPressed = true;
        gfm.companion.summonCompanion();
      } else if (!input.isKeyDown('KeyH')) {
        rb.mesh.userData._companionHPressed = false;
      }
    }

    // 10. Weapon Wheel (Hold Tab) & Quick Slots
    if (gfm && gfm.isFeatureEnabled('weapon_wheel_loadout')) {
      if (input.isKeyDown('Tab')) {
        gfm.loadout.openWheel();
      } else if (gfm.loadout.isOpen) {
        gfm.loadout.closeWheel();
      }
    }

    // 11. Tactical Cover & Peeking (KeyC toggle, Q/E lean)
    if (gfm && gfm.isFeatureEnabled('cover_peeking')) {
      if (input.isKeyDown('KeyC') && !rb.mesh.userData._coverCPressed) {
        rb.mesh.userData._coverCPressed = true;
        gfm.cover.toggleCover();
      } else if (!input.isKeyDown('KeyC')) {
        rb.mesh.userData._coverCPressed = false;
      }

      if (gfm.cover.inCover) {
        if (input.isKeyDown('KeyQ')) gfm.cover.setLean('left');
        else if (input.isKeyDown('KeyE')) gfm.cover.setLean('right');
        else gfm.cover.setLean('none');
      }
    }

    // 12. Grenades & Explosives (KeyG)
    if (gfm && gfm.isFeatureEnabled('ballistics_explosives')) {
      if (input.isKeyDown('KeyG') && !rb.mesh.userData._grenadeGPressed) {
        rb.mesh.userData._grenadeGPressed = true;
        gfm.explosives.throwGrenade();
      } else if (!input.isKeyDown('KeyG')) {
        rb.mesh.userData._grenadeGPressed = false;
      }
    }

    // 13. Bonfire Checkpoint Interaction & Rest (KeyE near bonfire)
    if (gfm && gfm.isFeatureEnabled('bonfire_checkpoint')) {
      if (input.isKeyDown('KeyE') && !gfm.targetLock.isLocked && !gfm.cover.inCover && !rb.mesh.userData._bonfireEPressed) {
        rb.mesh.userData._bonfireEPressed = true;
        gfm.bonfire.restAtBonfire();
      } else if (!input.isKeyDown('KeyE')) {
        rb.mesh.userData._bonfireEPressed = false;
      }
    }

    // 14. Estus Flask Healing (B; R remains reload)
    if (gfm && gfm.isFeatureEnabled('estus_flask_healing')) {
      if (input.isKeyDown('KeyB') && !rb.mesh.userData._flaskRPressed) {
        rb.mesh.userData._flaskRPressed = true;
        gfm.flasks.drinkFlask('crimson');
      } else if (!input.isKeyDown('KeyB')) {
        rb.mesh.userData._flaskRPressed = false;
      }
    }

    // 15. Visceral Deathblow Critical (Attack on posture-broken target)
    if (gfm && gfm.isFeatureEnabled('posture_visceral')) {
      if ((input.isActionPressed('Attack') || input.isMouseButtonDown(0)) && gfm.posture.getExecutableTarget() !== null) {
        if (gfm.posture.executeVisceral(asm)) {
          return;
        }
      }
    }

    // 10. Block / Guard Stance (KeyF or Hold Right Mouse when not aiming)
    const isBlocking = (input.isKeyDown('KeyF') || input.isMouseButtonDown(2)) && !(gfm && gfm.isFeatureEnabled('ranged_shooter') && (gfm.ranged.aiming || gfm.ranged.getConfig().showViewModel));
    if (gfm && gfm.isFeatureEnabled('dodge_guard_stamina')) {
      if (isBlocking && !gfm.defense.isDodging && !gfm.combo.isAttacking) {
        gfm.defense.startBlock(asm);
        return;
      } else if (!isBlocking && gfm.defense.isBlocking) {
        gfm.defense.stopBlock(asm);
      }
    }

    // Locomotion Inputs Direction Calculation
    const actionMove = input.getActionAxis2D('Move');
    let moveX = actionMove.x;
    let moveZ = actionMove.y;

    if (moveX === 0 && moveZ === 0) {
      if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) moveZ -= 1;
      if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) moveZ += 1;
      if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) moveX -= 1;
      if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) moveX += 1;
    }

    const hasInput = moveX !== 0 || moveZ !== 0;
    const isRunning = input.isActionActive('Sprint') || input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
    this.isMoving = hasInput;

    // 11. Dodge Roll (Space / Shift / Dodge Action)
    if (gfm && gfm.isFeatureEnabled('dodge_guard_stamina')) {
      if (input.isActionPressed('Backflip') || (input.isKeyDown('Space') && input.isKeyDown('KeyC'))) {
        if (gfm.defense.executeDodge(asm, { x: moveX, y: moveZ }, this.cameraYaw)) {
          return;
        }
      }
    }

    // 12. Melee Attacks & Combos (when not aiming ranged gun)
    if ((input.isActionPressed('Attack') || input.isMouseButtonDown(0)) && !(gfm && gfm.isFeatureEnabled('ranged_shooter') && (gfm.ranged.aiming || gfm.ranged.getConfig().showViewModel))) {
      if (gfm && gfm.isFeatureEnabled('combo_system')) {
        if (!rb.mesh.userData._attackPressed) {
          rb.mesh.userData._attackPressed = true;
          const isDodging = gfm.defense.isDodging;
          if (gfm.combo.isAttacking && !gfm.combo.canCancel) {
            // Buffer the light attack
            gfm.combo.bufferAction('light');
          } else {
            gfm.combo.executeLightAttack(asm, isRunning, isDodging);
          }
          return;
        }
      } else {
        const hasKatana = !!rb.mesh.userData.hasKatana;
        const attackAnim = hasKatana ? 'great_sword_slash' : (Math.random() > 0.5 ? 'punch' : 'kick');
        const attackDuration = hasKatana ? 1200 : 1000;
        this.triggerAction(attackAnim, attackDuration, asm);
        return;
      }
    } else {
      rb.mesh.userData._attackPressed = false;
    }

    if (this.isPerformingAction || (gfm && (gfm.combo.isAttacking && !gfm.combo.canCancel || gfm.defense.isDodging || gfm.parkour.isPerformingAction || gfm.grapple.active || gfm.flasks.isDrinking))) {
      // Don't process locomotion inputs during active uninterruptible actions
      return;
    }

    if (!this.locomotor && input.isActionPressed('Jump')) {
      this.triggerAction('jump', 1200, asm);
      return;
    }

    // Calculate movement vector relative to camera yaw
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
    const moveDir = new THREE.Vector3()
      .addScaledVector(forward, -moveZ)
      .addScaledVector(right, moveX);

    if (this.cameraArbitrator.isFirstPerson()) {
      // In first-person mode, character always rotates directly to face crosshair / camera yaw
      rb.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
      rb.setNextKinematicRotation(rb.mesh.quaternion);
    } else if (hasInput && moveDir.lengthSq() > 1e-4) {
      moveDir.normalize();
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), moveDir, new THREE.Vector3(0, 1, 0))
      );
      rb.mesh.quaternion.slerp(targetQuat, Math.min(10 * dt, 1));
      rb.mesh.quaternion.normalize();
      rb.setNextKinematicRotation(rb.mesh.quaternion);
    }

    if (this.locomotor) {
      this.locomotor.intent.moveX = hasInput ? moveDir.x : 0;
      this.locomotor.intent.moveZ = hasInput ? moveDir.z : 0;
      this.locomotor.intent.run = isRunning;
      this.locomotor.intent.jump = input.isActionPressed('Jump');
      this.locomotor.intent.jumpHeld = input.isActionActive('Jump');
      this.locomotor.intent.crouch = input.isActionActive('Crouch');

      const state = this.locomotor.getState();
      const animTarget = state === 'air' ? 'jump' : state === 'run' ? 'run' : state === 'walk' ? 'walk' : 'idle';
      asm.transition(animTarget, 0.2);
      return;
    }

    let targetAnim = 'idle';
    let speed = 0;

    if (hasInput) {
      targetAnim = isRunning ? 'run' : 'walk';
      speed = (isRunning ? 6.0 : 2.5) * this.speedMultiplier;
    }

    asm.transition(targetAnim, 0.2);

    const hasRootMotion = asm.getRootMotionDelta().lengthSq() > 0.0001;

    let nextPos = rb.mesh.position.clone();
    if (!hasRootMotion && hasInput) {
      nextPos.addScaledVector(moveDir, speed * dt);
    }

    // Snapping Y to the ground to keep feet flush with slopes, bridges, and level terrain
    if (!this.isPerformingAction) {
      const rayOrigin = new THREE.Vector3(nextPos.x, nextPos.y + 1.0, nextPos.z);
      const hit = this.engine.physicsWorld.raycastExcludeBody(
        rayOrigin,
        new THREE.Vector3(0, -1, 0),
        5.0,
        rb.rapierBody
      );
      if (hit) {
        const groundY = rayOrigin.y - hit.toi;
        nextPos.y = groundY + 0.9;
        
        if (hasRootMotion) {
          rb.setNextKinematicTranslation(nextPos);
        }
      }
    }

    if (!hasRootMotion && hasInput) {
      rb.setNextKinematicTranslation(nextPos);
    }
  }

  private updateCamera(dt: number, rb: RigidBodyComponent): void {
    const cam = this.engine.viewport.camera;
    const playerPos = rb.mesh.position;

    // View-kick spring physics (recovery towards zero)
    const kickForceP = -this.viewKickSpring * this.viewKickPitch - this.viewKickDamp * this.viewKickVelPitch;
    const kickForceY = -this.viewKickSpring * this.viewKickYaw - this.viewKickDamp * this.viewKickVelYaw;
    this.viewKickVelPitch += kickForceP * dt;
    this.viewKickVelYaw += kickForceY * dt;
    this.viewKickPitch += this.viewKickVelPitch * dt;
    this.viewKickYaw += this.viewKickVelYaw * dt;

    // Arbitrate active mode
    const activeMode = this.cameraArbitrator.getActiveMode();

    if (activeMode !== 'first_person' && activeMode !== 'third_person') {
      this.cameraArbitrator.update(dt, cam);
      return;
    }

    if (activeMode === 'first_person') {
      // First-person eye positioning + bobbing
      const input = this.engine.input;
      const isRunning = input.isActionActive('Sprint') || input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');

      if (this.isMoving) {
        this.bobTime += dt * (isRunning ? 12 : 7);
        const bobY = Math.sin(this.bobTime * 2) * (isRunning ? 0.035 : 0.018);
        const bobX = Math.cos(this.bobTime) * (isRunning ? 0.02 : 0.01);
        this.bobOffset.set(bobX, bobY, 0);
      } else {
        this.bobOffset.lerp(new THREE.Vector3(), Math.min(10 * dt, 1));
      }

      const eyePos = new THREE.Vector3(playerPos.x, playerPos.y + this.eyeHeight, playerPos.z);
      const rotatedBob = this.bobOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
      cam.position.copy(eyePos).add(rotatedBob);

      const effectivePitch = THREE.MathUtils.clamp(this.cameraPitch + this.viewKickPitch, -1.4, 1.4);
      const effectiveYaw = this.cameraYaw + this.viewKickYaw;
      cam.rotation.set(effectivePitch, effectiveYaw, 0, 'YXZ');
      return;
    }

    // Third-person mode
    // Follow point (character center)
    const target = new THREE.Vector3(playerPos.x, playerPos.y + 0.9, playerPos.z);

    // Calculate camera target position using spherical coordinates
    const offset = new THREE.Vector3(
      Math.sin(this.cameraYaw + this.viewKickYaw) * Math.cos(this.cameraPitch + this.viewKickPitch),
      Math.sin(this.cameraPitch + this.viewKickPitch),
      Math.cos(this.cameraYaw + this.viewKickYaw) * Math.cos(this.cameraPitch + this.viewKickPitch)
    ).multiplyScalar(this.cameraDistance);

    const desiredCamPos = target.clone().add(offset);

    // Smoothly interpolate desired camera position before collision checks.
    const currentDesired = cam.position.clone().lerp(desiredCamPos, Math.min(15 * dt, 1));

    // Cast a ray from the player focus point (target) to currentDesired.
    const toDesired = currentDesired.clone().sub(target);
    const dist = toDesired.length();

    if (dist > 0.01) {
      const dir = toDesired.clone().normalize();
      // Exclude player's own rigid body so the camera doesn't collide with the player.
      const hit = this.engine.physicsWorld.raycastExcludeBody(
        target,
        dir,
        dist,
        rb.rapierBody
      );

      if (hit) {
        // Keep a 0.3 meter margin from the wall/floor hit point.
        // Don't let the camera get closer than 0.5 meters to prevent clipping into the player.
        const safeDist = Math.max(0.5, hit.toi - 0.3);
        cam.position.copy(target).addScaledVector(dir, safeDist);
      } else {
        cam.position.copy(currentDesired);
      }
    } else {
      cam.position.copy(target);
    }

    // Point camera to look at follow target
    const lookTarget = target.clone().addScaledVector(
      new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw)),
      0.5
    ); // look slightly ahead
    cam.lookAt(lookTarget);
  }
}
