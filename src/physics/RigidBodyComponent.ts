import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { PhysicsWorld, KinematicShiftable } from './PhysicsWorld';

export type TransformAuthority = 'gizmo' | 'physics' | 'animation';

/** Ownership of GPU resources. Asset clones BORROW from the cache; owned entities own. */
export type OwnershipTag = { source: 'owned' } | { source: 'asset'; assetId: string };

/** Decoupled refcount release (AssetCache implements this) — avoids an import cycle. */
export interface AssetReleaser {
  release(assetId: string): void;
}

/**
 * RigidBodyComponent.ts — the Physics ↔ Mesh bridge.
 *
 * Owns a ROOT-LEVEL Object3D (Scene-Graph Contract: physics meshes are never nested),
 * a double-buffered transform for render interpolation, a SELF-TRACKED pending kinematic
 * target (so the engine never reads it back from Rapier), and a frame-accumulated /
 * substep-drained root-motion bucket that stays frame-rate independent.
 */
export class RigidBodyComponent implements KinematicShiftable {
  transformAuthority: TransformAuthority = 'physics';
  onDispose?: () => void;

  private body: RAPIER.RigidBody | null;
  readonly mesh: THREE.Object3D;
  private readonly tag: OwnershipTag;
  private readonly assetReleaser?: AssetReleaser;
  // Per-instance scratch keeps nested/re-entrant component calls from clobbering
  // another body's in-progress root-motion calculation.
  private readonly _tempVec3 = new THREE.Vector3();
  private readonly _target = new THREE.Vector3();
  private readonly _readQuat = new THREE.Quaternion();
  private readonly _targetQuat = new THREE.Quaternion();
  private readonly _tempQuat = new THREE.Quaternion();
  private readonly _identityQ = new THREE.Quaternion();

  // Double buffer — BOTH initialised to the spawn transform so the first interpolate is a no-op.
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly currQuat = new THREE.Quaternion();

  // Self-tracked kinematic target — set on every setNextKinematicTranslation call.
  private pendingKinematicTarget: THREE.Vector3 | null = null;

  // Root motion: accumulate per frame, drain one fixed slice per substep.
  private readonly pendingRootMotion = new THREE.Vector3();
  private readonly pendingRootRotation = new THREE.Quaternion();
  private pendingTime = 0;


  // Remembered body type so a gizmo kinematic-override can be restored exactly.
  private overriddenFromType: RAPIER.RigidBodyType | null = null;

  /**
   * Tracked additional mass so the inspector/deserializer can restore it exactly.
   * Rapier's `body.mass()` returns TOTAL mass (collider-derived + additional); reading
   * back the additional component is not always available, so we mirror it here.
   */
  additionalMass = 0;

  /**
   * Optional collider-rebuild hook. Set by builders whose collider scales with the mesh
   * (box/sphere/extrusion). Called by the inspector after a scale edit so the physics
   * hull stays in sync with the visual mesh. Rapier colliders are size-immutable, so the
   * only way to resize is to remove + recreate.
   */
  colliderRebuilder: (() => void) | null = null;

  constructor(
    private readonly physicsWorld: PhysicsWorld,
    body: RAPIER.RigidBody,
    mesh: THREE.Object3D,
    tag: OwnershipTag,
    assetReleaser?: AssetReleaser,
  ) {
    this.body = body;
    this.mesh = mesh;
    this.tag = tag;
    this.assetReleaser = assetReleaser;

    this.prevPos.copy(mesh.position);
    this.currPos.copy(mesh.position);
    this.prevQuat.copy(mesh.quaternion);
    this.currQuat.copy(mesh.quaternion);
  }

  private requireBody(): RAPIER.RigidBody {
    if (!this.body) throw new Error('RigidBodyComponent used after dispose()');
    return this.body;
  }

  get rapierBody(): RAPIER.RigidBody {
    return this.requireBody();
  }

  // --- Per-substep / per-frame sync ---------------------------------------
  /** Capture the post-step transform (called once per fixed substep). */
  syncFromPhysics(): void {
    const body = this.requireBody();
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    const t = body.translation();
    this.currPos.set(t.x, t.y, t.z);
    const r = body.rotation();
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  /** Render-time blend prev→curr. Skipped entirely while the gizmo owns this entity.
   *  Also calls updateMatrixWorld so the parent-child transform system (which runs
   *  later in the loop) sees a fresh parent matrix — otherwise the child teleports
   *  to a position computed from the previous frame's parent matrix and lags by one frame. */
  interpolate(alpha: number): void {
    if (this.transformAuthority === 'gizmo') return;
    this.mesh.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    this.mesh.updateMatrixWorld(true);
  }

  /** Collapse the buffer onto the current mesh transform (after teleport / drag-end). */
  resetInterpolationBuffers(): void {
    this.currPos.copy(this.mesh.position);
    this.prevPos.copy(this.mesh.position);
    this.currQuat.copy(this.mesh.quaternion);
    this.prevQuat.copy(this.mesh.quaternion);
  }

  /** Floating-origin shift: buffers AND root-level mesh move together, exactly once. */
  shiftOrigin(offset: THREE.Vector3): void {
    this.prevPos.sub(offset);
    this.currPos.sub(offset);
    this.mesh.position.sub(offset);
  }

  // --- Kinematic targets (self-tracked) -----------------------------------
  setNextKinematicTranslation(target: THREE.Vector3): void {
    const body = this.requireBody();
    if (this.pendingKinematicTarget) this.pendingKinematicTarget.copy(target);
    else this.pendingKinematicTarget = target.clone();
    body.setNextKinematicTranslation(target);
  }

  setNextKinematicRotation(q: THREE.Quaternion): void {
    this.requireBody().setNextKinematicRotation(q);
  }

  /**
   * Set additional mass on the body AND mirror it on the component so it can be
   * read back deterministically (Rapier's `mass()` returns the combined total).
   */
  setAdditionalMass(kg: number): void {
    const body = this.requireBody();
    body.setAdditionalMass(Math.max(0, kg), true);
    this.additionalMass = Math.max(0, kg);
  }

  hasPendingKinematicTarget(): boolean {
    return this.pendingKinematicTarget !== null && this.requireBody().isKinematic();
  }

  /** Shift the SELF-TRACKED target during a floating-origin shift, then re-apply it. */
  shiftPendingKinematicTarget(offset: THREE.Vector3): void {
    if (!this.pendingKinematicTarget) return;
    this.pendingKinematicTarget.sub(offset);
    this.requireBody().setNextKinematicTranslation(this.pendingKinematicTarget);
  }

  /** Gizmo drag: drive the (kinematic) body straight from the mesh transform. */
  syncToPhysics(): void {
    this.setNextKinematicTranslation(this.mesh.position);
    this.setNextKinematicRotation(this.mesh.quaternion);
  }

  /**
   * Rebuild the collider to match the current mesh scale (box/sphere/extrusion only).
   * No-op for asset/character bodies where scaling the physics hull is undesirable.
   */
  rescaleCollider(): void {
    this.colliderRebuilder?.();
  }

  /** Swap to/from KinematicPositionBased for a gizmo drag; zero velocities on restore. */
  setKinematicOverride(on: boolean): void {
    const body = this.requireBody();
    if (on) {
      if (this.overriddenFromType === null) this.overriddenFromType = body.bodyType();
      body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    } else if (this.overriddenFromType !== null) {
      body.setBodyType(this.overriddenFromType, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.overriddenFromType = null;
      this.pendingKinematicTarget = null;
    }
  }

  // --- Authoritative relocation (AI set_transform, etc.) -------------------
  teleport(enginePos: THREE.Vector3, rotation?: THREE.Quaternion): void {
    const body = this.requireBody();
    body.setTranslation(enginePos, true);
    if (rotation) body.setRotation(rotation, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.mesh.position.copy(enginePos);
    if (rotation) this.mesh.quaternion.copy(rotation);
    this.mesh.updateMatrixWorld(true);
    this.resetInterpolationBuffers();

    // No momentum, no stale targets carried across an authoritative move.
    this.pendingKinematicTarget = null;
    this.pendingRootMotion.set(0, 0, 0);
    this.pendingRootRotation.identity();
    this.pendingTime = 0;
  }

  // --- Root motion (frame-rate independent, zero-alloc) -------------------
  accumulateRootMotion(frameDelta: THREE.Vector3, dt: number, frameRotationDelta?: THREE.Quaternion): void {
    this.pendingRootMotion.add(frameDelta);
    if (frameRotationDelta && (frameRotationDelta.x !== 0 || frameRotationDelta.y !== 0 || frameRotationDelta.z !== 0 || frameRotationDelta.w !== 1)) {
      this.pendingRootRotation.multiply(frameRotationDelta);
    }
    this.pendingTime += dt;
  }

  accumulateRootMotionRotation(frameRotDelta: THREE.Quaternion, dt: number): void {
    if (frameRotDelta.x !== 0 || frameRotDelta.y !== 0 || frameRotDelta.z !== 0 || frameRotDelta.w !== 1) {
      this.pendingRootRotation.multiply(frameRotDelta);
    }
    if (this.pendingTime <= 0) {
      this.pendingTime += dt;
    }
  }

  consumeRootMotionForStep(fixedDt: number): void {
    if (this.pendingTime <= 0) return;
    const body = this.requireBody();
    const frac = Math.min(Math.max(fixedDt / this.pendingTime, 0), 1);

    // Drain linear root motion
    if (this.pendingRootMotion.lengthSq() > 0) {
      this._tempVec3.copy(this.pendingRootMotion).multiplyScalar(frac);
      const t = body.translation();
      this._target.set(t.x + this._tempVec3.x, t.y + this._tempVec3.y, t.z + this._tempVec3.z);
      this.setNextKinematicTranslation(this._target);
      this.pendingRootMotion.sub(this._tempVec3);
    }

    // Drain rotational root motion
    if (this.pendingRootRotation.x !== 0 || this.pendingRootRotation.y !== 0 || this.pendingRootRotation.z !== 0 || this.pendingRootRotation.w !== 1) {
      this._identityQ.identity();
      this._tempQuat.copy(this._identityQ).slerp(this.pendingRootRotation, frac);
      const curR = body.rotation();
      this._readQuat.set(curR.x, curR.y, curR.z, curR.w);
      this._targetQuat.copy(this._readQuat).multiply(this._tempQuat);
      this.setNextKinematicRotation(this._targetQuat);

      // Reduce pending rotation by consumed step
      this.pendingRootRotation.copy(this._tempQuat.invert().multiply(this.pendingRootRotation));
    }

    this.pendingTime -= fixedDt;
    if (frac === 1 || this.pendingTime <= 0) {
      this.pendingRootMotion.set(0, 0, 0);
      this.pendingRootRotation.identity();
      this.pendingTime = 0;
    }
  }

  /** Scale motion, rotation, and time so every pending channel represents pendingTime. */
  scalePending(keepRatio: number): void {
    this.pendingRootMotion.multiplyScalar(keepRatio);
    this._identityQ.identity();
    this.pendingRootRotation.copy(this._identityQ.slerp(this.pendingRootRotation, keepRatio));
    this.pendingTime *= keepRatio;
  }

  // --- Teardown ------------------------------------------------------------
  dispose(): void {
    if (this.onDispose) this.onDispose();

    if (this.body) {
      this.physicsWorld.removeBody(this.body);
      this.body = null;
    }

    if (this.tag.source === 'owned') {
      this.disposeOwnedResources();
    } else {
      // Shared GPU resources: refcount release only — never disposed here, never envMap.
      this.assetReleaser?.release(this.tag.assetId);
    }

    this.mesh.removeFromParent();
  }

  private disposeOwnedResources(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.mesh.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
      if (m.geometry) geometries.add(m.geometry);
      const meshMaterials = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of meshMaterials) {
        if (!mat) continue;
        for (const v of Object.values(mat)) {
          if (v && (v as THREE.Texture).isTexture) textures.add(v as THREE.Texture);
        }
        materials.add(mat);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
  }

  // For interpolation buffer reads (used when resetting after a parent reattach, etc.).
  get currentPosition(): THREE.Vector3 {
    return this.currPos.clone();
  }
  get currentRotation(): THREE.Quaternion {
    return this.currQuat.clone();
  }

  enableCcd(enabled: boolean): void {
    if (this.body) {
      this.body.enableCcd(enabled);
    }
  }

  isCcdEnabled(): boolean {
    return this.body?.isCcdEnabled() ?? false;
  }
}
