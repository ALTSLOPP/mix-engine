import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CollisionMatrix } from './CollisionMatrix';

/** A collision event surfaced to the engine — handlers only QUEUE structural ops. */
export interface CollisionEvent {
  colliderA: number;
  colliderB: number;
  started: boolean;
}

export interface RaycastHit {
  /** Engine-space hit point. */
  point: THREE.Vector3;
  /** Surface normal at the hit, in engine/world space (a direction; origin-shift invariant). */
  normal: THREE.Vector3;
  toi: number;
  colliderHandle: number;
}

/**
 * Minimal structural contract a floating-origin shift needs from a body component,
 * declared here so PhysicsWorld does NOT import RigidBodyComponent (no dependency cycle).
 */
export interface KinematicShiftable {
  hasPendingKinematicTarget(): boolean;
  shiftPendingKinematicTarget(offset: THREE.Vector3): void;
}

/**
 * PhysicsWorld.ts — Rapier WASM wrapper, an async-shaped facade for future worker offload.
 *
 * IMPORTANT (plan correction): Rapier's `World.step()` takes NO dt argument — the
 * timestep is `world.timestep`. `step(dt)` therefore sets `world.timestep = dt` (always
 * Time.FIXED_DT from the engine loop) and then steps.
 */
export class PhysicsWorld {
  private readonly world: RAPIER.World;
  private readonly eventQueue: RAPIER.EventQueue;
  /** handle → body, so the floating-origin pass can iterate every body. */
  private readonly bodyMap = new Map<number, RAPIER.RigidBody>();
  private readonly _t = new THREE.Vector3();
  readonly collisionMatrix = new CollisionMatrix();

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  /** Construct only after the one-time WASM init has completed. */
  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  /** Step the simulation by a fixed slice (always Time.FIXED_DT from the loop). */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step(this.eventQueue);
  }

  setGravity(y: number): void {
    this.world.gravity.y = y;
  }

  getGravity(): number {
    return this.world.gravity.y;
  }


  /** Drain queued contact events into a handler that should only QUEUE structural ops. */
  drainCollisionEvents(handler: (e: CollisionEvent) => void): void {
    this.eventQueue.drainCollisionEvents((a, b, started) => {
      handler({ colliderA: a, colliderB: b, started });
    });
  }

  // NOTE: Rapier ≥0.12 (incl. the 0.14 build we ship) removed EventQueue.drainIntersectionEvents.
  // Sensor/intersection pairs now arrive through drainCollisionEvents; the Engine splits them
  // back out via isSensorCollider() (see Engine.handleCollision).

  // --- Body / collider construction ---------------------------------------
  createRigidBody(desc: RAPIER.RigidBodyDesc): RAPIER.RigidBody {
    const body = this.world.createRigidBody(desc);
    this.bodyMap.set(body.handle, body);
    return body;
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.bodyMap.delete(body.handle);
    // removes attached colliders too.
    this.world.removeRigidBody(body);
  }

  /** SENSORIUM: look up a rigid body by its Rapier handle. */
  rapierRigidBodyFromHandle(handle: number): RAPIER.RigidBody | undefined {
    return this.bodyMap.get(handle);
  }

  /** SENSORIUM: look up a rigid body via one of its colliders' handles. Returns the
   *  body whose collider matches (collider→body via Rapier's collider.parent()). */
  rapierBodyFromColliderHandle(colliderHandle: number): RAPIER.RigidBody | null {
    try {
      const c = this.world.getCollider(colliderHandle);
      return c?.parent() ?? null;
    } catch { return null; }
  }

  /** True if the collider with this handle is a sensor (intersection-only, no contact
   *  forces). Used by the Engine to split sensor intersections back out of the unified
   *  collision-event stream Rapier ≥0.12 reports them through. */
  isSensorCollider(colliderHandle: number): boolean {
    try { return this.world.getCollider(colliderHandle)?.isSensor() ?? false; }
    catch { return false; }
  }

  /** Remove a single collider (used when rebuilding a scaled collider). */
  removeCollider(collider: RAPIER.Collider): void {
    this.world.removeCollider(collider, true);
  }

  /** Reference to the Rapier namespace so builders can construct collider descriptors. */
  get RAPIER(): typeof RAPIER {
    return RAPIER;
  }

  /** Direct access to the raw Rapier World instance. */
  get rawWorld(): RAPIER.World {
    return this.world;
  }

  /** Toggle Continuous Collision Detection (CCD) on a rigid body. */
  setCcdEnabled(body: RAPIER.RigidBody, enabled: boolean): void {
    body.enableCcd(enabled);
  }

  /** Create a Rapier Kinematic Character Controller. */
  createCharacterController(offset = 0.02): RAPIER.KinematicCharacterController {
    return this.world.createCharacterController(offset);
  }

  removeCharacterController(controller: RAPIER.KinematicCharacterController): void {
    this.world.removeCharacterController(controller);
  }

  private finishCollider(
    desc: RAPIER.ColliderDesc,
    body: RAPIER.RigidBody,
    events: boolean,
    isSensor = false,
    collisionLayer?: string | number,
  ): RAPIER.Collider {
    if (events) desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    if (isSensor) desc.setSensor(true);
    if (collisionLayer !== undefined) {
      const mask =
        typeof collisionLayer === 'number'
          ? collisionLayer
          : this.collisionMatrix.layerMask(collisionLayer);
      desc.setCollisionGroups(mask);
    }
    return this.world.createCollider(desc, body);
  }

  createBoxCollider(
    body: RAPIER.RigidBody,
    hx: number,
    hy: number,
    hz: number,
    events = false,
    isSensor = false,
    collisionLayer?: string | number,
  ): RAPIER.Collider {
    return this.finishCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body, events, isSensor, collisionLayer);
  }

  /** Box collider offset from the body origin — the building block of a COMPOUND collider
   *  (multiple boxes attached to one body that together hug a complex mesh better than a
   *  single bounding box). Offset is in the body's local frame. */
  createBoxColliderAt(
    body: RAPIER.RigidBody,
    hx: number,
    hy: number,
    hz: number,
    offset: { x: number; y: number; z: number },
    events = false,
    isSensor = false,
    collisionLayer?: string | number,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(offset.x, offset.y, offset.z);
    return this.finishCollider(desc, body, events, isSensor, collisionLayer);
  }

  createSphereCollider(
    body: RAPIER.RigidBody,
    radius: number,
    events = false,
    isSensor = false,
    collisionLayer?: string | number,
  ): RAPIER.Collider {
    return this.finishCollider(RAPIER.ColliderDesc.ball(radius), body, events, isSensor, collisionLayer);
  }

  createCapsuleCollider(
    body: RAPIER.RigidBody,
    halfHeight: number,
    radius: number,
    events = false,
    isSensor = false,
    collisionLayer?: string | number,
  ): RAPIER.Collider {
    return this.finishCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), body, events, isSensor, collisionLayer);
  }

  createCylinderCollider(
    body: RAPIER.RigidBody,
    halfHeight: number,
    radius: number,
    events = false,
    isSensor = false,
    collisionLayer?: string | number,
  ): RAPIER.Collider {
    return this.finishCollider(RAPIER.ColliderDesc.cylinder(halfHeight, radius), body, events, isSensor, collisionLayer);
  }

  createTrimeshCollider(
    body: RAPIER.RigidBody,
    vertices: Float32Array,
    indices: Uint32Array,
    events = false,
    collisionLayer?: string | number,
  ): RAPIER.Collider {
    return this.finishCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), body, events, false, collisionLayer);
  }

  /**
   * Heightfield collider — the right shape for a regular terrain grid. Unlike a trimesh it
   * needs no BVH, so rebuilding it after a sculpt is sub-millisecond (vs. a full trimesh
   * rebuild that hitches the frame). `nrows`/`ncols` are the number of SEGMENTS (cells), so
   * `heights.length` must be `(nrows+1)*(ncols+1)`; `heights` is the COLUMN-MAJOR matrix Rapier
   * expects (see TerrainField.packRapierHeights). `scale` is the FULL local x,z extent (y is a
   * height multiplier — pass 1 since our heights are already in metres). The field is centred
   * at the body origin.
   */
  createHeightfieldCollider(
    body: RAPIER.RigidBody,
    nrows: number,
    ncols: number,
    heights: Float32Array,
    scale: { x: number; y: number; z: number },
    events = false,
    collisionLayer?: string | number,
  ): RAPIER.Collider {
    return this.finishCollider(RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, scale), body, events, false, collisionLayer);
  }

  // --- Queries (ENGINE space) ---------------------------------------------
  raycast(originEngine: THREE.Vector3, dir: THREE.Vector3, maxToi = 1000, solid = true): RaycastHit | null {
    const ray = new RAPIER.Ray(originEngine, dir);
    // castRayAndGetNormal (not castRay) so callers like the decal projector can orient
    // to the real surface, not the reversed ray direction.
    const hit = this.world.castRayAndGetNormal(ray, maxToi, solid);
    if (!hit) return null;
    const toi = hit.timeOfImpact;
    const p = ray.pointAt(toi);
    const n = hit.normal;
    return {
      point: this._t.set(p.x, p.y, p.z).clone(),
      normal: new THREE.Vector3(n.x, n.y, n.z),
      toi,
      colliderHandle: hit.collider.handle,
    };
  }

  /** Exclude all colliders belonging to a body, including rays originating inside it. */
  raycastExcludeBody(
    originEngine: THREE.Vector3,
    dir: THREE.Vector3,
    maxToi: number,
    excludeBody: RAPIER.RigidBody,
    solid = true,
  ): RaycastHit | null {
    const ray = new RAPIER.Ray(originEngine, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxToi, solid, undefined, undefined, undefined, excludeBody);
    if (!hit) return null;
    const point = ray.pointAt(hit.timeOfImpact);
    return {
      point: new THREE.Vector3(point.x, point.y, point.z),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      toi: hit.timeOfImpact,
      colliderHandle: hit.collider.handle,
    };
  }

  // --- Floating origin -----------------------------------------------------
  /**
   * Atomically shift every body (and every self-tracked kinematic target) by `offset`
   * so engine space returns near zero. wake=false keeps sleeping bodies asleep.
   */
  applyFloatingOriginOffset(offset: THREE.Vector3, components: Iterable<KinematicShiftable>): void {
    for (const body of this.bodyMap.values()) {
      const t = body.translation();
      this._t.set(t.x - offset.x, t.y - offset.y, t.z - offset.z);
      body.setTranslation(this._t, false);
    }
    // Kinematic bodies are driven by their pending next-translation; shift + re-apply it
    // so the very next step doesn't snap them back to the unshifted target.
    for (const c of components) {
      if (c.hasPendingKinematicTarget()) c.shiftPendingKinematicTarget(offset);
    }
  }

  /** Direct access reserved for systems that build bodies/colliders (Rapier factories). */
  dispose(): void {
    this.eventQueue.free();
    this.world.free();
    this.bodyMap.clear();
  }
}
