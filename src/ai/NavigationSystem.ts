import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import { NavMesh, type NavGrid, type NavMeshBuildOptions, type NavMeshStats, type NavRect } from './NavMesh';
import { NavMeshVoxelizer, type VoxelizeOptions, type VoxelizeStats } from './NavMeshVoxelizer';
import { Pathfinder, type FindPathResult } from './Pathfinder';
import {
  NavAgentHandle, PATH_MODE_SPEED,
  type SemanticNavHost, type NavDestination, type NavigateToOptions, type NavArrival,
} from './NavAgentHandle';
import { CHUNK_SIZE } from '../streaming/chunkMath';
import {
  DEFAULT_STEERING, type SteeringParams, type KinematicState, type SteeringOutput,
  seek, flee, arrive, pursue, evade, wander, followPath, avoid, flock, queue,
  blend, newSteering, type AvoidCast,
} from './Steering';
import { BehaviorTree, treeFromJson, type BTJson, type Blackboard, type Status, MapBlackboard } from './BehaviorTree';

/**
 * NavigationSystem.ts — the top-level navigation + AI facade owned by the Engine.
 *
 * It owns ONE NavMesh + Pathfinder (rebuildable on demand) and a set of NavAgent
 * components attached to entities. Each frame it:
 *   1. Updates each agent's kinematic state from its rigid body (engine-space mesh
 *      position → world-space via WorldOrigin).
 *   2. Runs the agent's active behavior (seek / flee / pursue / wander / patrol /
 *      follow_entity / behavior_tree), which composes steering outputs and (for
 *      pursue / follow) recomputes the A* path to the target when it moves.
 *   3. Integrates the resulting acceleration → velocity → position, clamps to the
 *      navmesh (so the agent can't walk through a wall), and drives the rigid body
 *      (kinematic via setNextKinematicTranslation, dynamic via setLinvel).
 *   4. Snaps the agent's Y to the navmesh floor when the body is kinematic (ground-
 *      follow); for dynamic bodies, gravity handles Y and we only steer XZ.
 *
 * The system is the single integration point for the AIBridge navigation commands
 * (`navmesh_build`, `find_path`, `add_nav_agent`, `set_nav_target`, …) and the HELM
 * `find_path` op — so an LLM can drive the whole stack from a single command without
 * touching the internals.
 *
 * Neighbour queries (flock / queue) are O(n²) over the agent set — fine for the
 * typical open-world crowd (n ≤ a few hundred). A spatial hash would be needed for
 * thousands of agents; the API is shaped so we can drop one in without changing the
 * public surface.
 */

export type NavAgentMode =
  | 'idle'
  | 'seek'           // go to a world position (decelerate on arrival)
  | 'flee'           // run away from a world position
  | 'pursue'         // chase a moving entity (lead its velocity)
  | 'evade'          // flee from a moving entity
  | 'wander'         // constrained random walk
  | 'patrol'         // walk a list of waypoints, looping
  | 'follow_entity'  // pathfind to an entity and arrive near it
  | 'flock'          // crowd: separation + alignment + cohesion (+ optional seek target)
  | 'behavior_tree'; // a custom BT owns the per-frame decisions

export interface NavAgentOptions {
  mode?: NavAgentMode;
  /** Initial target world position (for seek / flee). */
  target?: THREE.Vector3;
  /** Initial target entity id (for pursue / evade / follow_entity). */
  targetEntityId?: EntityId;
  /** Patrol waypoints (world space). */
  patrol?: THREE.Vector3[];
  /** Patrol loop flag. */
  patrolLoop?: boolean;
  /** Behavior tree spec (set_behavior_tree alternative at creation). */
  behaviorTree?: BTJson;
  /** Enable behavior tree tracing for IDE introspection. */
  enableTrace?: boolean;
  /** Steering params override (partial — merged onto DEFAULT_STEERING). */
  steering?: Partial<SteeringParams>;
  /** Auto-face movement direction (default true). */
  faceMovement?: boolean;
  /** Snap a kinematic agent's Y to the navmesh floor (default true). */
  groundSnap?: boolean;
  /** Recompute path when target moves more than this many metres (default 1.5). */
  repathThreshold?: number;
  /** Min seconds between path rebuilds (default 0.4). */
  repathInterval?: number;
  /** Arrival radius for follow_entity (default agentRadius * 2). */
  followArriveRadius?: number;
  /** Flock weights (flock mode). */
  flockWeights?: { sep: number; ali: number; coh: number };
  /** Flock neighbour radius (metres). Default 8. */
  flockRadius?: number;
  /** Queue lane width (metres). Default 1.2. */
  queueLaneWidth?: number;
  /** Tag for grouping (used by HELM queries). */
  tag?: string;
}

interface NavAgent {
  entityId: EntityId;
  mode: NavAgentMode;
  /** Target world position (seek / flee / patrol anchor). */
  targetWorld: THREE.Vector3;
  /** Target entity (pursue / evade / follow_entity). */
  targetEntityId: EntityId | null;
  /** Patrol waypoints + cursor (patrol mode). */
  patrol: THREE.Vector3[];
  patrolLoop: boolean;
  patrolCursor: number;
  /** Computed A* path + cursor + bookkeeping. */
  path: THREE.Vector3[];
  pathCursor: number;
  lastRepathAt: number;
  lastTargetPos: THREE.Vector3;
  /** Steering config + per-agent wander state. */
  params: SteeringParams;
  wanderOffset: THREE.Vector3;
  /** Behavior tree (behavior_tree mode). */
  bt: BehaviorTree | null;
  /** Kinematic state — refreshed from the rigid body each frame. */
  kinematic: KinematicState;
  /** Cached body type — kinematicPositionBased drives setNextKinematicTranslation;
   *  dynamic drives setLinvel. */
  isDynamic: boolean;
  faceMovement: boolean;
  groundSnap: boolean;
  repathThreshold: number;
  repathInterval: number;
  followArriveRadius: number;
  flockWeights: { sep: number; ali: number; coh: number };
  flockRadius: number;
  queueLaneWidth: number;
  tag: string;
  /** Last computed linear acceleration (for debugging). */
  lastLinear: THREE.Vector3;
}

export interface NavAgentInfo {
  entityId: EntityId;
  mode: NavAgentMode;
  tag: string;
  /** WORLD-space current position. */
  position: { x: number; y: number; z: number };
  /** WORLD-space velocity (m/s, XZ). */
  speed: number;
  hasPath: boolean;
  pathLength: number;
  pathCursor: number;
  targetEntityId?: EntityId;
  hasBehaviorTree: boolean;
  /** Flock neighbour count (flock mode). */
  neighbourCount?: number;
}

export interface NavigationSystemDeps {
  sceneManager: SceneManager;
  physicsWorld: PhysicsWorld;
  worldOrigin: WorldOrigin;
  /** The THREE scene — for debug visualization. */
  scene: THREE.Scene;
  /** Resolve a semantic reference ('@player', 'building_42', a tag) to an EntityId.
   *  Wired from the AIBridge so navigateTo() can name entities the IDE knows about. */
  resolveEntityRef?: (ref: string) => EntityId | undefined;
  /** Optional: drive a locomotion animation when an agent's gait changes (walk/run/sprint
   *  → an AnimationStateMachine state). Wired from the Engine; no-op if absent. */
  playLocomotion?: (entityId: EntityId, state: 'idle' | 'walk' | 'run') => void;
}

/** A semantic place an agent can `navigateTo` by name. */
export interface NavLandmark {
  name: string;
  /** WORLD-space position. */
  position: THREE.Vector3;
  /** Arrival radius hint (metres). */
  radius: number;
}

/** Options controlling the dynamic (chunk-aware) navmesh auto-rebuild. */
export interface DynamicNavMeshOptions {
  enabled: boolean;
  /** Max dirty regions re-rasterized per frame (keeps the patch budget bounded). */
  maxRegionsPerFrame?: number;
  /** Coalesce the dirty queue into one bounding rect once it exceeds this many entries. */
  maxQueued?: number;
}

/** One pending semantic navigation awaiting arrival (resolved in update()). */
interface PendingGoto {
  entityId: EntityId;
  target: THREE.Vector3;
  destinationName?: string;
  arriveRadius: number;
  pathLength: number;
  startTime: number;
  deadline: number;
  startPos: THREE.Vector3;
  resolve: (a: NavArrival) => void;
}

export class NavigationSystem implements SemanticNavHost {
  private navmesh: NavGrid | null = null;
  private pathfinder: Pathfinder | null = null;
  private navMeshStats: NavMeshStats | null = null;
  private multiLayerStats: VoxelizeStats | null = null;
  private readonly agents = new Map<EntityId, NavAgent>();
  private readonly agentList: NavAgent[] = []; // hot list (parallel iteration)

  /** Named semantic destinations (the AI navigates to these by string). */
  private readonly landmarks = new Map<string, NavLandmark>();
  /** Active semantic navigations awaiting arrival. */
  private readonly pendingGotos: PendingGoto[] = [];
  /** Lazily-created per-entity handles (engine.nav.agent(id)). */
  private readonly handles = new Map<EntityId, NavAgentHandle>();

  // ── Dynamic / chunk-aware navmesh auto-rebuild ──
  private dynamicOpts: Required<DynamicNavMeshOptions> = { enabled: false, maxRegionsPerFrame: 2, maxQueued: 64 };
  private readonly dirtyRegions: NavRect[] = [];

  private debugOn = false;
  private readonly debugGroup = new THREE.Group();
  private readonly debugLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 }),
  );

  private readonly _eng = new THREE.Vector3();
  private readonly _world = new THREE.Vector3();
  private readonly _worldNext = new THREE.Vector3();
  private readonly _engNext = new THREE.Vector3();
  private readonly _v = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _steer = newSteering();
  private readonly _scratchSteer = newSteering();
  private readonly _avoidCast: AvoidCast;

  constructor(private readonly deps: NavigationSystemDeps) {
    this.debugGroup.name = 'NavDebug';
    this.debugGroup.userData.excludeFromOriginShift = true;
    this.debugGroup.visible = false;
    this.debugGroup.add(this.debugLines);
    this.deps.scene.add(this.debugGroup);

    // The avoidance whisker cast goes through the physics world (engine space).
    this._avoidCast = (origin, dir, maxDist) => {
      // Convert world-space origin to engine space for the raycast.
      this.deps.worldOrigin.toEngineSpaceInto(this._eng, origin);
      const hit = this.deps.physicsWorld.raycast(this._eng, dir, maxDist, true);
      return hit ? hit.toi : null;
    };
  }

  // ── NavMesh build ──────────────────────────────────────────────────────────

  get hasNavMesh(): boolean { return this.navmesh?.isBuilt ?? false; }
  get navMeshBuilding(): boolean { return this.navmesh instanceof NavMesh ? this.navmesh.isBuilding : false; }
  get lastBuildStats(): NavMeshStats | null { return this.navMeshStats; }
  get lastMultiLayerBuildStats(): VoxelizeStats | null { return this.multiLayerStats; }
  get agentCount(): number { return this.agents.size; }

  /** (Re)build the navmesh over a world-space region. Async + budgeted per tick.
   *  Resolves with build stats. The previous navmesh (if any) is cleared first. */
  async buildNavMesh(opts: NavMeshBuildOptions): Promise<NavMeshStats> {
    const nav = new NavMesh(opts);
    this.navmesh = nav;
    this.pathfinder = new Pathfinder(nav);
    this.navMeshStats = await nav.build(this.deps.physicsWorld, this.deps.worldOrigin, opts);
    return this.navMeshStats;
  }

  /** Build and install a true multi-span grid from render geometry. This makes the
   *  voxel pipeline the live grid used by A*, agents, floor queries, and EQS. */
  buildMultiLayerNavMesh(opts: VoxelizeOptions, roots: THREE.Object3D[] = [this.deps.scene]): VoxelizeStats {
    const result = NavMeshVoxelizer.build(roots, opts);
    this.navmesh = result.navmesh;
    this.pathfinder = new Pathfinder(result.navmesh);
    this.multiLayerStats = result.stats;
    this.navMeshStats = null;
    this.dirtyRegions.length = 0;
    return result.stats;
  }

  /** Read-only active grid for spatial queries such as EQS. */
  get activeGrid(): NavGrid | null { return this.navmesh; }

  /** Pathfinder query — finds a path between two world-space points. Returns the
   *  result struct (waypoints are world space). Used by the `find_path` command + HELM op. */
  findPath(from: THREE.Vector3, to: THREE.Vector3, opts?: { smooth?: boolean; goalTolerance?: number }): FindPathResult {
    if (!this.pathfinder) return { waypoints: [], expansions: 0, length: 0, found: false, reason: 'unreachable' };
    return this.pathfinder.find({ from, to, smooth: opts?.smooth ?? true, goalTolerance: opts?.goalTolerance });
  }

  /** Walkable height at a world position (or null). LLM-facing query. */
  floorHeightAt(worldX: number, worldZ: number): number | null {
    return this.navmesh ? this.navmesh.heightAt(worldX, worldZ) : null;
  }

  // ── Dynamic / chunk-aware rebuild ────────────────────────────────────────────

  /** Enable/configure the dynamic navmesh: dirty regions (from streamed chunks or
   *  extruded buildings) are re-rasterized incrementally in update(), a few per frame. */
  setDynamic(opts: DynamicNavMeshOptions): void {
    this.dynamicOpts = {
      enabled: opts.enabled,
      maxRegionsPerFrame: opts.maxRegionsPerFrame ?? this.dynamicOpts.maxRegionsPerFrame,
      maxQueued: opts.maxQueued ?? this.dynamicOpts.maxQueued,
    };
  }

  get isDynamic(): boolean { return this.dynamicOpts.enabled; }
  get dirtyRegionCount(): number { return this.dirtyRegions.length; }

  /** Mark a world-space rectangle dirty so it gets re-rasterized. Clipped to the navmesh;
   *  coalesced into a single bounding rect once the queue grows past `maxQueued`. */
  markRegionDirty(rect: NavRect): void {
    if (!(this.navmesh instanceof NavMesh)) return;
    const b = this.navmesh.bounds;
    // Ignore rects that don't touch the navmesh at all.
    if (rect.maxX < b.minX || rect.minX > b.maxX || rect.maxZ < b.minZ || rect.minZ > b.maxZ) return;
    this.dirtyRegions.push({
      minX: Math.max(rect.minX, b.minX), minZ: Math.max(rect.minZ, b.minZ),
      maxX: Math.min(rect.maxX, b.maxX), maxZ: Math.min(rect.maxZ, b.maxZ),
    });
    if (this.dirtyRegions.length > this.dynamicOpts.maxQueued) this.coalesceDirty();
  }

  /** Mark the square footprint of a streamed chunk dirty (chunk-aware integration). */
  markChunkDirty(cx: number, cz: number): void {
    this.markRegionDirty({
      minX: cx * CHUNK_SIZE, minZ: cz * CHUNK_SIZE,
      maxX: (cx + 1) * CHUNK_SIZE, maxZ: (cz + 1) * CHUNK_SIZE,
    });
  }

  /** Mark an entity's world-space XZ footprint dirty — call after spawning/extruding a
   *  building or moving an obstacle so the navmesh routes around its new collider. */
  notifyEntityChanged(entityId: EntityId, padding = 0.5): void {
    const rb = this.deps.sceneManager.getRigidBody(entityId);
    if (!rb) return;
    const box = new THREE.Box3().setFromObject(rb.mesh);
    if (box.isEmpty()) return;
    // Box is engine-space; convert XZ corners to world space.
    this.deps.worldOrigin.toWorldSpaceInto(this._v, box.min);
    this.deps.worldOrigin.toWorldSpaceInto(this._v2, box.max);
    this.markRegionDirty({
      minX: Math.min(this._v.x, this._v2.x) - padding,
      minZ: Math.min(this._v.z, this._v2.z) - padding,
      maxX: Math.max(this._v.x, this._v2.x) + padding,
      maxZ: Math.max(this._v.z, this._v2.z) + padding,
    });
  }

  private coalesceDirty(): void {
    if (this.dirtyRegions.length === 0) return;
    let { minX, minZ, maxX, maxZ } = this.dirtyRegions[0];
    for (const r of this.dirtyRegions) {
      minX = Math.min(minX, r.minX); minZ = Math.min(minZ, r.minZ);
      maxX = Math.max(maxX, r.maxX); maxZ = Math.max(maxZ, r.maxZ);
    }
    this.dirtyRegions.length = 0;
    this.dirtyRegions.push({ minX, minZ, maxX, maxZ });
  }

  /** Process up to `maxRegionsPerFrame` dirty regions (called from update()). */
  private processDirtyRegions(): void {
    if (!this.dynamicOpts.enabled || !(this.navmesh instanceof NavMesh) || !this.navmesh.isBuilt || this.navmesh.isBuilding) return;
    let n = Math.min(this.dynamicOpts.maxRegionsPerFrame, this.dirtyRegions.length);
    while (n-- > 0) {
      const rect = this.dirtyRegions.shift()!;
      this.navmesh.rebuildRegion(this.deps.physicsWorld, this.deps.worldOrigin, rect);
    }
  }

  // ── Semantic destinations + navigateTo (the AI-native API) ───────────────────

  /** Register / move a named landmark (a semantic destination). */
  registerLandmark(name: string, worldPos: THREE.Vector3, radius = 1.5): void {
    this.landmarks.set(name, { name, position: worldPos.clone(), radius });
  }

  removeLandmark(name: string): boolean { return this.landmarks.delete(name); }
  listLandmarks(): NavLandmark[] { return [...this.landmarks.values()]; }

  /** Resolve a destination reference to a WORLD-space point + a human name.
   *  Order: explicit landmark → named/tagged entity (via the injected resolver) →
   *  a raw entity id → null. Vectors/tuples pass straight through. */
  resolveDestination(dest: NavDestination): { position: THREE.Vector3; name?: string; radius?: number } | null {
    if (dest instanceof THREE.Vector3) return { position: dest.clone() };
    if (Array.isArray(dest)) return { position: new THREE.Vector3(dest[0], dest[1], dest[2]) };

    const ref = String(dest);
    // 1. Named landmark.
    const lm = this.landmarks.get(ref) ?? this.landmarks.get(ref.replace(/^@/, ''));
    if (lm) return { position: lm.position.clone(), name: lm.name, radius: lm.radius };

    // 2. Named/tagged entity via the injected resolver (tries '@ref' and 'ref').
    let id = this.deps.resolveEntityRef?.(ref);
    if (id === undefined && !ref.startsWith('@')) id = this.deps.resolveEntityRef?.('@' + ref);
    // 3. A raw numeric entity id.
    if (id === undefined && /^\d+$/.test(ref)) id = Number(ref);
    if (id !== undefined) {
      const p = this.entityWorldPos(id);
      if (p) return { position: p, name: ref };
    }
    return null;
  }

  /** Resolve a destination, point an agent at it (auto-creating the agent if needed),
   *  and return a promise that settles on arrival / unreachable / timeout / abort. */
  navigateTo(entityId: EntityId, dest: NavDestination, opts: NavigateToOptions = {}): Promise<NavArrival> {
    const resolved = this.resolveDestination(dest);
    const now = performance.now() / 1000;
    if (!resolved) {
      return Promise.resolve<NavArrival>({
        status: 'unreachable', entityId, destination: null,
        destinationName: typeof dest === 'string' ? dest : undefined,
        pathLength: 0, elapsedSec: 0,
      });
    }

    // Auto-create a kinematic NavAgent if the entity isn't one yet.
    let agent = this.agents.get(entityId);
    if (!agent) {
      agent = this.addAgent(entityId, { mode: 'idle' }) ?? undefined;
      if (!agent) {
        return Promise.resolve<NavArrival>({
          status: 'unreachable', entityId, destination: vecOut(resolved.position),
          destinationName: resolved.name, pathLength: 0, elapsedSec: 0,
        });
      }
    }

    // Apply the gait (max-speed + optional locomotion animation).
    const mode = opts.pathMode ?? 'walk';
    this.setAgentSteering(entityId, { maxSpeed: PATH_MODE_SPEED[mode] });
    this.deps.playLocomotion?.(entityId, mode === 'walk' ? 'walk' : 'run');

    // Probe a path up front so we can fail fast on requirePath.
    const from = agent.kinematic.position;
    const probe = this.pathfinder
      ? this.pathfinder.find({ from, to: resolved.position, smooth: true })
      : null;
    if (opts.requirePath && (!probe || !probe.found)) {
      this.deps.playLocomotion?.(entityId, 'idle');
      return Promise.resolve<NavArrival>({
        status: 'unreachable', entityId, destination: vecOut(resolved.position),
        destinationName: resolved.name, pathLength: 0, elapsedSec: 0,
      });
    }

    // Drive the agent: seek the resolved point (NavigationSystem repaths as needed).
    this.setAgentTarget(entityId, 'seek', { world: resolved.position });

    const arriveRadius = opts.arriveRadius ?? resolved.radius ?? agent.params.arriveRadius;
    // Supersede any earlier goto for this entity.
    this.settlePending(entityId, 'superseded');

    return new Promise<NavArrival>((resolve) => {
      this.pendingGotos.push({
        entityId, target: resolved.position.clone(), destinationName: resolved.name,
        arriveRadius, pathLength: probe?.length ?? 0,
        startTime: now, deadline: now + (opts.timeoutSec ?? 60),
        startPos: from.clone(), resolve,
      });
    });
  }

  /** Stop an agent (idle); any in-flight navigateTo resolves 'aborted'. SemanticNavHost. */
  stopAgent(entityId: EntityId): void {
    const a = this.agents.get(entityId);
    if (a) { a.mode = 'idle'; a.path = []; a.pathCursor = 0; }
    this.deps.playLocomotion?.(entityId, 'idle');
    this.settlePending(entityId, 'aborted');
  }

  /** Get (or lazily create) the semantic handle for an entity:
   *  `engine.nav.agent(id).navigateTo("building_42", { pathMode: "walk" })`. */
  agent(entityId: EntityId): NavAgentHandle {
    let h = this.handles.get(entityId);
    if (!h) { h = new NavAgentHandle(this, entityId); this.handles.set(entityId, h); }
    return h;
  }

  /** Settle every pending goto for an entity with a terminal status (or all if id omitted). */
  private settlePending(entityId: EntityId | null, status: NavArrival['status']): void {
    const now = performance.now() / 1000;
    for (let i = this.pendingGotos.length - 1; i >= 0; i--) {
      const g = this.pendingGotos[i];
      if (entityId !== null && g.entityId !== entityId) continue;
      this.pendingGotos.splice(i, 1);
      g.resolve({
        status, entityId: g.entityId, destination: vecOut(g.target),
        destinationName: g.destinationName, pathLength: g.pathLength,
        elapsedSec: +(now - g.startTime).toFixed(2),
      });
    }
  }

  /** Check each pending goto for arrival / timeout / lost-agent (called from update()). */
  private updatePendingGotos(): void {
    if (this.pendingGotos.length === 0) return;
    const now = performance.now() / 1000;
    for (let i = this.pendingGotos.length - 1; i >= 0; i--) {
      const g = this.pendingGotos[i];
      const a = this.agents.get(g.entityId);
      let status: NavArrival['status'] | null = null;
      if (!a) {
        status = 'aborted';
      } else {
        const dx = a.kinematic.position.x - g.target.x;
        const dz = a.kinematic.position.z - g.target.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= g.arriveRadius) status = 'arrived';
        else if (now > g.deadline) status = 'timeout';
      }
      if (status) {
        this.pendingGotos.splice(i, 1);
        if (status === 'arrived' || status === 'timeout') {
          if (a) { a.mode = 'idle'; a.path = []; a.pathCursor = 0; }
          this.deps.playLocomotion?.(g.entityId, 'idle');
        }
        g.resolve({
          status, entityId: g.entityId, destination: vecOut(g.target),
          destinationName: g.destinationName, pathLength: g.pathLength,
          elapsedSec: +(now - g.startTime).toFixed(2),
        });
      }
    }
  }

  /** WORLD-space position of an entity's rigid body, or null. */
  private entityWorldPos(entityId: EntityId): THREE.Vector3 | null {
    const rb = this.deps.sceneManager.getRigidBody(entityId);
    if (!rb) return null;
    return this.deps.worldOrigin.toWorldSpace(this._v2.copy(rb.mesh.position)).clone();
  }

  // ── Agent management ───────────────────────────────────────────────────────

  addAgent(entityId: EntityId, opts: NavAgentOptions = {}): NavAgent | null {
    if (!this.deps.sceneManager.getRigidBody(entityId)) {
      console.warn(`[NavigationSystem] addAgent: entity ${entityId} has no rigid body`);
      return null;
    }
    if (this.agents.has(entityId)) {
      console.warn(`[NavigationSystem] addAgent: entity ${entityId} already an agent — updating options`);
      this.configureAgent(this.agents.get(entityId)!, opts);
      return this.agents.get(entityId)!;
    }
    const params: SteeringParams = { ...DEFAULT_STEERING, ...opts.steering };
    const rb = this.deps.sceneManager.getRigidBody(entityId)!;
    const isDynamic = rb.rapierBody.bodyType() === 0 /* RAPIER.RigidBodyType.Dynamic */;
    this.deps.worldOrigin.toWorldSpaceInto(this._world, rb.mesh.position);
    const agent: NavAgent = {
      entityId,
      mode: opts.mode ?? 'idle',
      targetWorld: opts.target?.clone() ?? this._world.clone(),
      targetEntityId: opts.targetEntityId ?? null,
      patrol: opts.patrol?.map((p) => p.clone()) ?? [],
      patrolLoop: opts.patrolLoop ?? true,
      patrolCursor: 0,
      path: [],
      pathCursor: 0,
      lastRepathAt: 0,
      lastTargetPos: new THREE.Vector3(),
      params,
      wanderOffset: new THREE.Vector3(params.wanderRadius, 0, 0),
      bt: opts.behaviorTree ? (() => {
        const t = treeFromJson(opts.behaviorTree);
        t.enableTrace = opts.enableTrace ?? false;
        return t;
      })() : null,
      kinematic: {
        position: this._world.clone(),
        velocity: new THREE.Vector3(),
        orientation: rb.mesh.rotation.y,
        rotation: 0,
      },
      isDynamic,
      faceMovement: opts.faceMovement ?? true,
      groundSnap: opts.groundSnap ?? !isDynamic,
      repathThreshold: opts.repathThreshold ?? 1.5,
      repathInterval: opts.repathInterval ?? 0.4,
      followArriveRadius: opts.followArriveRadius ?? params.arriveRadius,
      flockWeights: opts.flockWeights ?? { sep: 1.5, ali: 1.0, coh: 1.0 },
      flockRadius: opts.flockRadius ?? 8,
      queueLaneWidth: opts.queueLaneWidth ?? 1.2,
      tag: opts.tag ?? 'nav',
      lastLinear: new THREE.Vector3(),
    };
    this.agents.set(entityId, agent);
    this.agentList.push(agent);
    return agent;
  }

  private configureAgent(agent: NavAgent, opts: NavAgentOptions): void {
    if (opts.mode) agent.mode = opts.mode;
    if (opts.target) agent.targetWorld.copy(opts.target);
    if (opts.targetEntityId !== undefined) agent.targetEntityId = opts.targetEntityId;
    if (opts.patrol) agent.patrol = opts.patrol.map((p) => p.clone());
    if (opts.patrolLoop !== undefined) agent.patrolLoop = opts.patrolLoop;
    if (opts.steering) agent.params = { ...agent.params, ...opts.steering };
    if (opts.behaviorTree) agent.bt = treeFromJson(opts.behaviorTree);
    if (opts.faceMovement !== undefined) agent.faceMovement = opts.faceMovement;
    if (opts.groundSnap !== undefined) agent.groundSnap = opts.groundSnap;
    if (opts.tag !== undefined) agent.tag = opts.tag;
  }

  removeAgent(entityId: EntityId): void {
    const a = this.agents.get(entityId);
    if (!a) return;
    this.agents.delete(entityId);
    const idx = this.agentList.indexOf(a);
    if (idx >= 0) this.agentList.splice(idx, 1);
    this.handles.delete(entityId);
    // Any in-flight semantic navigation for this entity can no longer complete.
    this.settlePending(entityId, 'aborted');
  }

  setAgentTarget(entityId: EntityId, mode: NavAgentMode, opts: { world?: THREE.Vector3; entityId?: EntityId; patrol?: THREE.Vector3[] } = {}): boolean {
    const a = this.agents.get(entityId);
    if (!a) return false;
    a.mode = mode;
    if (opts.world) a.targetWorld.copy(opts.world);
    if (opts.entityId !== undefined) a.targetEntityId = opts.entityId;
    if (opts.patrol) { a.patrol = opts.patrol.map((p) => p.clone()); a.patrolCursor = 0; }
    // Force a repath on the next update so the new target is picked up immediately.
    a.path = [];
    a.pathCursor = 0;
    a.lastRepathAt = 0;
    return true;
  }

  setAgentBehaviorTree(entityId: EntityId, json: BTJson, enableTrace?: boolean): boolean {
    const a = this.agents.get(entityId);
    if (!a) return false;
    a.bt = treeFromJson(json, a.bt?.blackboard ?? new MapBlackboard());
    if (enableTrace !== undefined) a.bt.enableTrace = enableTrace;
    a.mode = 'behavior_tree';
    return true;
  }

  setAgentSteering(entityId: EntityId, params: Partial<SteeringParams>): boolean {
    const a = this.agents.get(entityId);
    if (!a) return false;
    a.params = { ...a.params, ...params };
    return true;
  }

  setAgentBlackboard(entityId: EntityId, key: string, value: unknown): boolean {
    const a = this.agents.get(entityId);
    if (!a || !a.bt) return false;
    a.bt.blackboard.set(key, value);
    return true;
  }

  /** Reset an agent's velocity + path (e.g. when teleporting it). */
  resetAgent(entityId: EntityId): boolean {
    const a = this.agents.get(entityId);
    if (!a) return false;
    a.kinematic.velocity.set(0, 0, 0);
    a.path = [];
    a.pathCursor = 0;
    a.bt?.reset();
    return true;
  }

  getAgentInfo(entityId: EntityId): NavAgentInfo | null {
    const a = this.agents.get(entityId);
    if (!a) return null;
    const v = a.kinematic.velocity;
    const info: NavAgentInfo = {
      entityId: a.entityId,
      mode: a.mode,
      tag: a.tag,
      position: { x: r3(a.kinematic.position.x), y: r3(a.kinematic.position.y), z: r3(a.kinematic.position.z) },
      speed: r3(Math.sqrt(v.x * v.x + v.z * v.z)),
      hasPath: a.path.length > 0,
      pathLength: a.path.length,
      pathCursor: a.pathCursor,
      targetEntityId: a.targetEntityId ?? undefined,
      hasBehaviorTree: a.bt !== null,
    };
    if (a.mode === 'flock') {
      info.neighbourCount = this.getNeighbours(a, a.flockRadius).length;
    }
    return info;
  }

  listAgents(): NavAgentInfo[] {
    return this.agentList.map((a) => this.getAgentInfo(a.entityId)!);
  }

  getAgentBlackboard(entityId: EntityId): Blackboard | null {
    return this.agents.get(entityId)?.bt?.blackboard ?? null;
  }

  // ── Debug visualization ────────────────────────────────────────────────────

  setDebug(on: boolean): void {
    this.debugOn = on;
    this.debugGroup.visible = on;
    if (!on) this.debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  }

  /** Toggle the debug overlay. Returns the new state (HELM-friendly). */
  toggleDebug(): boolean { this.setDebug(!this.debugOn); return this.debugOn; }

  /** Find all other agents within `radius` metres of `agent` (O(n) — fine for typical
   *  crowds; a spatial hash would be needed for thousands). Used by the flock mode. */
  private getNeighbours(agent: NavAgent, radius: number): NavAgent[] {
    const r2 = radius * radius;
    const out: NavAgent[] = [];
    for (const other of this.agentList) {
      if (other === agent) continue;
      const dx = other.kinematic.position.x - agent.kinematic.position.x;
      const dz = other.kinematic.position.z - agent.kinematic.position.z;
      if (dx * dx + dz * dz <= r2) out.push(other);
    }
    return out;
  }

  // ── Per-frame update (called by the engine loop after aiBridge.update) ─────

  update(dt: number): void {
    if (dt <= 0) return;

    // 0. Dynamic / chunk-aware navmesh: patch any dirty regions (streamed chunks,
    //    extruded buildings). Runs even with no agents so the mesh stays current.
    this.processDirtyRegions();

    if (this.agentList.length === 0) {
      // No agents to steer, but a pending goto may still need to settle (e.g. its agent
      // was removed). Drain it so awaiters don't hang.
      this.updatePendingGotos();
      return;
    }

    // 1. Refresh kinematic state for every agent (engine-space mesh → world space).
    for (const a of this.agentList) {
      const rb = this.deps.sceneManager.getRigidBody(a.entityId);
      if (!rb) { this.removeAgent(a.entityId); continue; }
      this.deps.worldOrigin.toWorldSpaceInto(a.kinematic.position, rb.mesh.position);
      a.kinematic.orientation = rb.mesh.rotation.y;
      // Velocity: read from the body (engine-space linvel for dynamic; for kinematic we
      // approximate from the position delta — see below).
      if (a.isDynamic) {
        const lv = rb.rapierBody.linvel();
        // linvel is engine-space but velocity is a direction (origin-shift invariant).
        a.kinematic.velocity.set(lv.x, lv.y, lv.z);
      }
      // kinematic velocity is tracked by the integration step (we set it below).
    }

    // 2. Run each agent's behavior → produce a steering output.
    for (const a of this.agentList) {
      this.tickAgent(a, dt);
    }

    // 3. Integrate + drive the rigid bodies.
    for (const a of this.agentList) {
      this.integrateAgent(a, dt);
    }

    // 4. Settle semantic navigations (navigateTo) that have arrived / timed out.
    this.updatePendingGotos();

    if (this.debugOn) this.updateDebugViz();
  }

  private tickAgent(a: NavAgent, dt: number): void {
    const out = this._steer;
    out.linear.set(0, 0, 0);
    out.angular = 0;

    switch (a.mode) {
      case 'idle': {
        // Brake to a stop.
        a.kinematic.velocity.multiplyScalar(Math.max(0, 1 - 8 * dt));
        a.path = []; a.pathCursor = 0;
        return;
      }

      case 'seek': {
        this.ensurePath(a, a.targetWorld);
        if (a.path.length > 0) {
          const ps = { path: a.path, cursor: a.pathCursor, loop: false };
          followPath(a.kinematic, ps, a.params, out);
          a.pathCursor = clampCursor(ps.cursor, a.path);
        } else {
          arrive(a.kinematic, a.targetWorld, a.params, out);
        }
        break;
      }

      case 'flee': {
        flee(a.kinematic, a.targetWorld, a.params, out);
        // Flee doesn't use a path; clear it.
        a.path = []; a.pathCursor = 0;
        break;
      }

      case 'pursue':
      case 'evade': {
        const target = this.resolveEntityPosition(a.targetEntityId);
        if (!target) { a.mode = 'idle'; return; }
        const targetVel = this.resolveEntityVelocity(a.targetEntityId);
        if (a.mode === 'pursue') {
          // Pathfind to the target's current position, then use pursue steering for the
          // final approach (so the agent leads the target rather than trailing it).
          this.ensurePath(a, target);
          if (a.path.length > 0 && a.pathCursor < a.path.length - 1) {
            const ps = { path: a.path, cursor: a.pathCursor, loop: false };
            followPath(a.kinematic, ps, a.params, out);
            a.pathCursor = clampCursor(ps.cursor, a.path);
          } else {
            pursue(a.kinematic, target, targetVel, a.params, 1.0, out);
          }
        } else {
          evade(a.kinematic, target, targetVel, a.params, 1.0, out);
        }
        break;
      }

      case 'follow_entity': {
        const target = this.resolveEntityPosition(a.targetEntityId);
        if (!target) { a.mode = 'idle'; return; }
        this.ensurePath(a, target);
        // If we're close enough, arrive at the target's position (no more pathing).
        const dist = Math.sqrt(
          (a.kinematic.position.x - target.x) ** 2 + (a.kinematic.position.z - target.z) ** 2,
        );
        if (dist < a.followArriveRadius) {
          arrive(a.kinematic, target, a.params, out);
        } else if (a.path.length > 0) {
          const ps = { path: a.path, cursor: a.pathCursor, loop: false };
          followPath(a.kinematic, ps, a.params, out);
          a.pathCursor = clampCursor(ps.cursor, a.path);
        }
        break;
      }

      case 'patrol': {
        if (a.patrol.length === 0) { a.mode = 'idle'; return; }
        // Walk the patrol waypoints directly (no A* — patrol points are expected to be
        // walkable and close together; if the agent gets stuck, switch to seek + repath).
        if (a.patrolCursor >= a.patrol.length) a.patrolCursor = 0;
        this._v.copy(a.patrol[a.patrolCursor]);
        const distP = Math.sqrt(
          (a.kinematic.position.x - this._v.x) ** 2 + (a.kinematic.position.z - this._v.z) ** 2,
        );
        if (distP < a.params.arriveRadius) {
          a.patrolCursor++;
          if (a.patrolCursor >= a.patrol.length) {
            if (a.patrolLoop) a.patrolCursor = 0;
            else { a.patrolCursor = a.patrol.length - 1; a.mode = 'idle'; return; }
          }
        }
        // Pathfind to the next patrol point if it's far / path is stale.
        this.ensurePath(a, a.patrol[a.patrolCursor]);
        if (a.path.length > 0) {
          const ps = { path: a.path, cursor: a.pathCursor, loop: false };
          followPath(a.kinematic, ps, a.params, out);
          a.pathCursor = clampCursor(ps.cursor, a.path);
        } else {
          arrive(a.kinematic, a.patrol[a.patrolCursor], a.params, out);
        }
        break;
      }

      case 'wander': {
        wander(a.kinematic, a.wanderOffset, a.params, out);
        a.path = []; a.pathCursor = 0;
        break;
      }

      case 'flock': {
        // Crowd simulation: separation + alignment + cohesion over nearby agents,
        // optionally blended with a seek towards a target (so a crowd can flow towards
        // a point while staying loose), plus queue braking to prevent overlap.
        const neighbours = this.getNeighbours(a, a.flockRadius);
        const flockOut = this._scratchSteer;
        flock(a.kinematic, neighbours.map((n) => n.kinematic), a.params, a.flockWeights, flockOut);
        out.linear.copy(flockOut.linear);
        out.angular = flockOut.angular;
        // Optional seek target (blended in) — set via setAgentTarget(.., 'flock', {world}).
        if (a.targetWorld && a.targetWorld.lengthSq() > 1e-6) {
          const seekOut = this._scratchSteer;
          seek(a.kinematic, a.targetWorld, a.params, seekOut);
          blend([out, seekOut], [1.0, 0.8], a.params, out);
        }
        // Queue: brake if a neighbour is directly ahead.
        const queueOut = this._scratchSteer;
        queue(a.kinematic, neighbours.map((n) => n.kinematic), a.params, 2.5, a.queueLaneWidth, queueOut);
        if (queueOut.linear.lengthSq() > 1e-6) {
          blend([out, queueOut], [1.0, 1.2], a.params, out);
        }
        break;
      }

      case 'behavior_tree': {
        if (a.bt) {
          const status = a.bt.tick(dt, { agent: a, nav: this });
          // The BT's action nodes may set the agent's desired velocity directly via the
          // api.nav / api.agent handle; we treat the BT's status as informational.
          void status;
        }
        return; // BT actions own the body drive; skip the standard integration below.
      }
    }

    // Obstacle avoidance whiskers (applied to all non-idle, non-BT modes — those return
    // early above). The mode type is narrowed by the switch's early returns, so we
    // check the output is non-trivial instead of re-testing the mode.
    if (out.linear.lengthSq() > 1e-6) {
      const avoidOut = this._scratchSteer;
      avoid(a.kinematic, a.params, this._avoidCast, avoidOut);
      if (avoidOut.linear.lengthSq() > 1e-6) {
        blend([out, avoidOut], [1.0, 1.5], a.params, out);
      }
    }

    a.lastLinear.copy(out.linear);
  }

  /** Recompute the A* path to `target` if it has moved beyond `repathThreshold` and
   *  enough time has passed since the last rebuild. */
  private ensurePath(a: NavAgent, target: THREE.Vector3): void {
    if (!this.pathfinder) return;
    const now = performance.now() / 1000;
    const moved = Math.sqrt(
      (a.lastTargetPos.x - target.x) ** 2 + (a.lastTargetPos.z - target.z) ** 2,
    );
    const stale = now - a.lastRepathAt > a.repathInterval;
    if (a.path.length === 0 || (stale && moved > a.repathThreshold)) {
      const result = this.pathfinder.find({
        from: a.kinematic.position,
        to: target,
        smooth: true,
      });
      if (result.found) {
        a.path = result.waypoints;
        a.pathCursor = 0;
        a.lastTargetPos.copy(target);
        a.lastRepathAt = now;
      } else if (a.path.length === 0) {
        // No path AND no existing one — fall back to direct seek (the steering will
        // try to walk there, and avoidance will handle small obstacles).
        a.lastTargetPos.copy(target);
        a.lastRepathAt = now;
      }
    }
  }

  private integrateAgent(a: NavAgent, dt: number): void {
    const p = a.params;
    // For BT agents, the BT owns the body drive — skip the standard integration.
    if (a.mode === 'behavior_tree') return;

    // Integrate: velocity += linear * dt; clamp to maxSpeed; position += velocity * dt.
    a.kinematic.velocity.x += a.lastLinear.x * dt;
    a.kinematic.velocity.z += a.lastLinear.z * dt;
    const horizSpeed = Math.sqrt(a.kinematic.velocity.x ** 2 + a.kinematic.velocity.z ** 2);
    if (horizSpeed > p.maxSpeed) {
      const scale = p.maxSpeed / horizSpeed;
      a.kinematic.velocity.x *= scale;
      a.kinematic.velocity.z *= scale;
    }
    // Damping when no acceleration is applied (idle / arrival).
    if (a.lastLinear.lengthSq() < 1e-6) {
      const damp = Math.max(0, 1 - 6 * dt);
      a.kinematic.velocity.x *= damp;
      a.kinematic.velocity.z *= damp;
    }

    // Compute next WORLD-space position (XZ from velocity; Y from navmesh if groundSnap).
    this._worldNext.copy(a.kinematic.position);
    this._worldNext.x += a.kinematic.velocity.x * dt;
    this._worldNext.z += a.kinematic.velocity.z * dt;

    // Clamp to walkable cells: if the next XZ isn't walkable, try to slide along the
    // nearest walkable edge (sample the navmesh at the next position; if blocked, keep
    // the current X or Z separately to allow wall sliding).
    let clamped = false;
    if (this.navmesh?.isBuilt) {
      const nextWalkable = this.navmesh.isWalkableAt(this._worldNext.x, this._worldNext.z);
      if (!nextWalkable) {
        clamped = true;
        // Try X-only and Z-only moves; keep whichever is walkable (wall sliding).
        const xOk = this.navmesh.isWalkableAt(this._worldNext.x, a.kinematic.position.z);
        const zOk = this.navmesh.isWalkableAt(a.kinematic.position.x, this._worldNext.z);
        if (xOk) {
          this._worldNext.z = a.kinematic.position.z;
          a.kinematic.velocity.z = 0; // Prevent sticky velocity wind-up against walls
        } else if (zOk) {
          this._worldNext.x = a.kinematic.position.x;
          a.kinematic.velocity.x = 0; // Prevent sticky velocity wind-up against walls
        } else {
          this._worldNext.x = a.kinematic.position.x;
          this._worldNext.z = a.kinematic.position.z;
          a.kinematic.velocity.set(0, 0, 0); // Zero out velocity completely if trapped
        }
      }
      // Ground snap: set Y to the navmesh floor at the (possibly clamped) next XZ.
      if (a.groundSnap) {
        const h = this.navmesh.heightAt(this._worldNext.x, this._worldNext.z);
        if (h !== null) this._worldNext.y = h;
      }
    }

    // Apply to the rigid body (engine space).
    this.deps.worldOrigin.toEngineSpaceInto(this._engNext, this._worldNext);
    const rb = this.deps.sceneManager.getRigidBody(a.entityId);
    if (!rb) return;
    if (a.isDynamic) {
      // Dynamic body: if we hit a boundary, physically teleport the body to the clamped 
      // position to prevent boundary traversal, then steer via horizontal velocity.
      if (clamped) {
        rb.teleport(this._engNext.clone(), rb.mesh.quaternion);
      }
      rb.rapierBody.setLinvel(
        { x: a.kinematic.velocity.x, y: rb.rapierBody.linvel().y, z: a.kinematic.velocity.z },
        true,
      );
    } else {
      // Kinematic: drive the next translation directly (the loop interpolates + handles
      // origin shifts via the self-tracked pending target).
      rb.setNextKinematicTranslation(this._engNext);
    }

    // Update the cached kinematic position so the next frame's steering sees it.
    a.kinematic.position.copy(this._worldNext);

    // Face the movement direction (or the steering's angular output).
    if (a.faceMovement && horizSpeed > 0.1) {
      // The engine's character models face -Z at rotation 0 (third-person camera sits at
      // +Z and looks toward -Z, seeing the character's back). setFromAxisAngle(Y, orient)
      // maps -Z to (-sin, -cos), so to point -Z along velocity we need orient = atan2(-vx,-vz).
      // The old atan2(vx, vz) oriented +Z toward velocity and made agents face backward.
      const targetYaw = Math.atan2(-a.kinematic.velocity.x, -a.kinematic.velocity.z);
      // Smoothly turn towards the target yaw (slerp-like for yaw only).
      let diff = targetYaw - a.kinematic.orientation;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff <= -Math.PI) diff += 2 * Math.PI;
      const turn = Math.max(-p.maxAngularSpeed * dt, Math.min(p.maxAngularSpeed * dt, diff));
      a.kinematic.orientation += turn;
      this._quat.setFromAxisAngle(this._up, a.kinematic.orientation);
      if (a.isDynamic) {
        rb.rapierBody.setRotation(this._quat, true);
      } else {
        rb.setNextKinematicRotation(this._quat);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private resolveEntityPosition(entityId: EntityId | null): THREE.Vector3 | null {
    if (entityId === null) return null;
    const rb = this.deps.sceneManager.getRigidBody(entityId);
    if (!rb) return null;
    return this.deps.worldOrigin.toWorldSpace(this._v2.copy(rb.mesh.position));
  }

  private resolveEntityVelocity(entityId: EntityId | null): THREE.Vector3 {
    if (entityId === null) return ZERO;
    // If the target is itself a NavAgent, use its tracked kinematic velocity (works
    // for kinematic bodies whose Rapier linvel is always zero).
    const other = this.agents.get(entityId);
    if (other) return this._v.copy(other.kinematic.velocity);
    const rb = this.deps.sceneManager.getRigidBody(entityId);
    if (!rb) return ZERO;
    const lv = rb.rapierBody.linvel();
    return this._v.set(lv.x, lv.y, lv.z);
  }

  private updateDebugViz(): void {
    // Render each agent's path as a line strip (engine space).
    const positions: number[] = [];
    for (const a of this.agentList) {
      if (a.path.length < 2) continue;
      for (let i = 0; i < a.path.length - 1; i++) {
        this.deps.worldOrigin.toEngineSpaceInto(this._eng, a.path[i]);
        positions.push(this._eng.x, this._eng.y + 0.1, this._eng.z);
        this.deps.worldOrigin.toEngineSpaceInto(this._eng, a.path[i + 1]);
        positions.push(this._eng.x, this._eng.y + 0.1, this._eng.z);
      }
    }
    const geo = this.debugLines.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.attributes.position.needsUpdate = true;
  }

  dispose(): void {
    this.settlePending(null, 'aborted');
    this.debugGroup.removeFromParent();
    this.debugLines.geometry.dispose();
    (this.debugLines.material as THREE.Material).dispose();
    this.agents.clear();
    this.agentList.length = 0;
    this.handles.clear();
    this.landmarks.clear();
    this.dirtyRegions.length = 0;
  }
}

function clampCursor(cursor: number, path: THREE.Vector3[]): number {
  return Math.max(0, Math.min(cursor, path.length - 1));
}

const ZERO = new THREE.Vector3(0, 0, 0);

function r3(v: number): number { return Math.round(v * 1000) / 1000; }

/** Round a Vector3 into a plain {x,y,z} for command/HELM results. */
function vecOut(v: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: r3(v.x), y: r3(v.y), z: r3(v.z) };
}
