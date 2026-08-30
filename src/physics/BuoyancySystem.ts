import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import { Hydrodynamics, type HydrodynamicParams } from './Hydrodynamics';

/** Anything that can answer "how high is the water at this world XZ". */
export interface WaterHeightSource {
  hasWater(): boolean;
  sampleHeight(worldX: number, worldZ: number): number;
}

export interface BuoyantBodyOptions {
  /** Displaced volume in m³. Defaults to the mesh's bounding-box volume. */
  volume?: number;
  /** Vertical extent used for the submersion ratio. Defaults to the bounding-box height. */
  height?: number;
  /**
   * Extra sample points, in the body's local space, that the hull is probed at. More
   * points give roll/pitch righting instead of a single force through the centre.
   * Defaults to four points at the bounding-box corners in XZ.
   */
  samplePoints?: THREE.Vector3[];
}

interface BuoyantRecord {
  entityId: EntityId;
  volume: number;
  height: number;
  samplePoints: THREE.Vector3[];
  /** Last computed submersion, 0..1 — read by gameplay ("am I swimming?"). */
  submersion: number;
}

/**
 * BuoyancySystem.ts — the missing link between {@link Hydrodynamics}, the Gerstner
 * {@link WaterHeightSource}, and Rapier.
 *
 * Hydrodynamics computes forces from a water height it is *given*; nothing ever gave it
 * one, and nothing ever pushed the result into a rigid body, so buoyancy was inert. This
 * system samples the live wave surface under each registered body, splits the hull into
 * sample points so it rights itself instead of bobbing as a point mass, and applies the
 * resulting force and angular drag to the Rapier body every fixed step.
 */
export class BuoyancySystem {
  readonly hydro: Hydrodynamics;

  private readonly bodies = new Map<EntityId, BuoyantRecord>();

  private readonly _worldPos = new THREE.Vector3();
  private readonly _samplePos = new THREE.Vector3();
  private readonly _vel = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _box = new THREE.Box3();
  private readonly _size = new THREE.Vector3();

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly worldOrigin: WorldOrigin,
    private readonly water: WaterHeightSource,
    params: HydrodynamicParams = {},
  ) {
    this.hydro = new Hydrodynamics(params);
  }

  get count(): number {
    return this.bodies.size;
  }

  /** Make an entity float. Returns false if it has no rigid body. */
  add(entityId: EntityId, opts: BuoyantBodyOptions = {}): boolean {
    const rb = this.sceneManager.getRigidBody(entityId);
    if (!rb) return false;

    this._box.setFromObject(rb.mesh);
    this._box.getSize(this._size);
    const height = opts.height ?? Math.max(0.05, this._size.y);
    const volume = opts.volume
      ?? Math.max(0.001, this._size.x * this._size.y * this._size.z);

    const hx = Math.max(0.05, this._size.x * 0.5);
    const hz = Math.max(0.05, this._size.z * 0.5);
    const samplePoints = opts.samplePoints ?? [
      new THREE.Vector3(-hx, 0, -hz),
      new THREE.Vector3(hx, 0, -hz),
      new THREE.Vector3(-hx, 0, hz),
      new THREE.Vector3(hx, 0, hz),
    ];

    this.bodies.set(entityId, { entityId, volume, height, samplePoints, submersion: 0 });
    return true;
  }

  remove(entityId: EntityId): boolean {
    return this.bodies.delete(entityId);
  }

  /** 0 = dry, 1 = fully underwater. Null when the entity is not registered. */
  submersionOf(entityId: EntityId): number | null {
    return this.bodies.get(entityId)?.submersion ?? null;
  }

  /** True once the body is more than half under — the usual "switch to swimming" gate. */
  isSwimming(entityId: EntityId, threshold = 0.5): boolean {
    const s = this.bodies.get(entityId)?.submersion;
    return s !== undefined && s >= threshold;
  }

  clear(): void {
    this.bodies.clear();
  }

  /**
   * Fixed-rate tick. Must run BEFORE `physicsWorld.step()` so Rapier integrates the
   * forces this substep.
   */
  fixedStep(dt: number): void {
    if (dt <= 0 || this.bodies.size === 0) return;
    if (!this.water.hasWater()) {
      for (const rec of this.bodies.values()) rec.submersion = 0;
      return;
    }

    for (const rec of this.bodies.values()) {
      const rb = this.sceneManager.getRigidBody(rec.entityId);
      if (!rb) {
        this.bodies.delete(rec.entityId);
        continue;
      }

      let body;
      try {
        body = rb.rapierBody;
      } catch {
        continue; // body already disposed this frame
      }
      if (!body.isDynamic || !body.isDynamic()) continue;

      const linvel = body.linvel();
      this._vel.set(linvel.x, linvel.y, linvel.z);
      this._quat.copy(rb.mesh.quaternion);

      const perPoint = 1 / rec.samplePoints.length;
      let totalSubmersion = 0;

      for (const local of rec.samplePoints) {
        // Sample point → engine space → world space (the wave field is world-anchored).
        this._samplePos.copy(local).applyQuaternion(this._quat).add(rb.mesh.position);
        this.worldOrigin.toWorldSpaceInto(this._worldPos, this._samplePos);

        const waterY = this.water.sampleHeight(this._worldPos.x, this._worldPos.z);
        const result = this.hydro.computeForces(
          this._worldPos,
          rec.height,
          rec.volume * perPoint,
          waterY,
          this._vel,
        );
        totalSubmersion += result.submersionRatio * perPoint;
        if (!result.isSubmerged) continue;

        // Applying at the sample point (not the centre of mass) is what produces the
        // righting torque — a boat pushed under on one side rolls back level.
        body.applyImpulseAtPoint(
          { x: result.force.x * dt, y: result.force.y * dt, z: result.force.z * dt },
          { x: this._samplePos.x, y: this._samplePos.y, z: this._samplePos.z },
          true,
        );
      }

      rec.submersion = THREE.MathUtils.clamp(totalSubmersion, 0, 1);

      if (rec.submersion > 0.01) {
        // Angular drag: water resists spin far more than air does, otherwise a
        // submerged body tumbles forever.
        const angvel = body.angvel();
        const k = this.hydro.angularDrag * rec.submersion * dt;
        body.applyTorqueImpulse(
          { x: -angvel.x * k, y: -angvel.y * k, z: -angvel.z * k },
          true,
        );
      }
    }
  }
}
