import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import type { AssetCache } from '../animation/AssetCache';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import {
  CHUNK_SIZE,
  GLOBAL_CHUNK,
  chunkGridOrigin,
  type ChunkId,
} from '../streaming/chunkMath';
import { ScriptComponent } from './ScriptComponent';
import type { ReloadResult } from './ScriptComponent';
import { Component } from './Component';
import { LifecycleScheduler } from './LifecycleScheduler';
import { PersistentGameState } from './PersistentGameState';
import { EventBus } from './EventBus';
import type { DebugDraw } from '../rendering/DebugDraw';
import type { HUD } from '../ui/HUD';

export type EntityId = number;
export type ChildPolicy = 'cascade' | 'reparentToRoot';

/** A serializable recipe for an entity, resolved to a RigidBodyComponent by a builder. */
export interface EntityBlueprint {
  kind: string;
  params: Record<string, unknown>;
  tags?: string[];
}

/** Shared services a builder uses to construct a physics entity at an engine-space position. */
export interface BuildContext {
  physicsWorld: PhysicsWorld;
  assetCache: AssetCache;
  worldOrigin: WorldOrigin;
  addAnimationStateMachine?: (asm: any) => void;
  removeAnimationStateMachine?: (asm: any) => void;
  /** Resolve the AnimationStateMachine owning a rigid body (used by AIBridge.play_animation). */
  findAnimationStateMachine?: (rb: unknown) => any;
  /** Retrieve an instantiated material from the central library */
  getMaterial?: (id: string) => THREE.Material | null;
  /** Animation Pack registry (Retarget Pro). Used by the character builder to hydrate animPacks. */
  animPacks?: import('../animation/AnimationPackRegistry').AnimationPackRegistry;
  /** Asset registry, for builders that need an asset's declared type/tags (size
   *  normalisation reads sizeClass and targetSize off the entry). */
  manifest?: import('../animation/AssetManifest').AssetManifest;
}

export type EntityBuilder = (
  enginePos: THREE.Vector3,
  params: Record<string, unknown>,
  ctx: BuildContext,
) => RigidBodyComponent;

export interface SpawnOptions {
  chunkId?: ChunkId;
  rootMotion?: boolean;
  /** Logical (ECS) parent — independent of Object3D nesting. */
  parent?: EntityId;
  onSpawned?: (id: EntityId) => void;
  quat?: THREE.Quaternion;
  /** Explicit persistent GUID (e.g. from compiled ProjectDocument). */
  guid?: string;
}

interface SpawnRecord extends Required<Pick<SpawnOptions, 'chunkId' | 'rootMotion'>> {
  worldPos: THREE.Vector3;
  blueprint: EntityBlueprint;
  parent?: EntityId;
  onSpawned?: (id: EntityId) => void;
  quat?: THREE.Quaternion;
  guid?: string;
}

export type DeferredOp =
  | { kind: 'spawn'; record: SpawnRecord }
  | { kind: 'destroy'; id: EntityId; childPolicy: ChildPolicy }
  | { kind: 'reparent'; id: EntityId; parent: EntityId | null }
  | { kind: 'jointAttach' | 'jointDetach' | 'ragdollCreate' | 'structuralMutation'; fn: () => void };

export interface CrossChunkRef {
  chunkId: ChunkId;
  entityId: EntityId;
}

/** Serialized form written to / read from chunk binaries (grid-local). */
interface SerializedEntity {
  kind: string;
  params: Record<string, unknown>;
  localPos: [number, number, number];
  quat: [number, number, number, number];
  rootMotion: boolean;
  originalId?: EntityId;
  parentId?: EntityId;
}

/**
 * SceneManager.ts — Map-based ECS with O(1) hot lists, deferred structural mutation,
 * dirty-chunk tracking, a child-destruction policy, and grid-static chunk I/O.
 */
export class SceneManager {
  // --- Core storage --------------------------------------------------------
  private readonly entities = new Set<EntityId>();
  private readonly components = new Map<string, Map<EntityId, unknown>>();
  private readonly entityToChunk = new Map<EntityId, ChunkId>();
  /** Chunk-local stable key for streamed entities (the `originalId` written into the
   *  chunk binary). It survives unload/reload, so it is the identity the
   *  ChunkDeltaRegistry keys player modifications by. Runtime-spawned entities
   *  have no key. */
  private readonly chunkKeyOf = new Map<EntityId, number>();
  readonly dirtyChunks = new Set<ChunkId>();
  readonly globalEntities = new Set<EntityId>();

  // Hot lists with O(1) swap-pop (parallel entity arrays keep indices fixable on removal).
  readonly rigidBodyList: RigidBodyComponent[] = [];
  private readonly rigidBodyEntities: EntityId[] = [];
  private readonly rbIndex = new Map<EntityId, number>();

  readonly rootMotionList: RigidBodyComponent[] = [];
  private readonly rootMotionEntities: EntityId[] = [];
  private readonly rmIndex = new Map<EntityId, number>();

  readonly scriptList: ScriptComponent[] = [];
  private readonly scriptEntities: EntityId[] = [];
  private readonly scriptIndex = new Map<EntityId, number>();

  /** Entity owning the script at a hot-list index. */
  scriptEntityAt(index: number): EntityId | undefined { return this.scriptEntities[index]; }

  // Logical hierarchy (ECS), distinct from Object3D nesting.
  private readonly parentOf = new Map<EntityId, EntityId>();
  private readonly childrenOf = new Map<EntityId, Set<EntityId>>();
  private readonly childOffsets = new Map<EntityId, { localPos: THREE.Vector3; localQuat: THREE.Quaternion }>();

  private readonly blueprintOf = new Map<EntityId, EntityBlueprint>();
  private readonly tagsOf = new Map<EntityId, Set<string>>();
  private readonly builders = new Map<string, EntityBuilder>();
  /** root Object3D → component, for picking a body from a raycast hit. */
  private readonly meshToRb = new Map<THREE.Object3D, RigidBodyComponent>();
  /** Rapier body wrapper → entity, for O(1) collision-event routing. */
  private readonly bodyToEntity = new WeakMap<object, EntityId>();
  /** Persistent key-value store for gameplay state (scores, inventory, flags).
   *  Set by the Engine after construction. Scripts access it via ScriptAPI.gameState. */
  gameState = new PersistentGameState();
  /** Modular gameplay services, attached by Engine and exposed to trusted scripts. */
  gameplayFeatures?: import('../features/gameplay/GameplayFeatureManager').GameplayFeatureManager;
  /** AI-Native 3D debug draw. Set by the Engine after construction. Scripts access
   *  it via ScriptAPI.debug. */
  debugDraw?: DebugDraw;
  /** Global pub/sub event bus. Scripts access it via ScriptAPI.events. */
  events = new EventBus();
  /** Declarative HUD overlay. Set by the Engine after construction. */
  hud?: HUD;

  /** Modular component lifecycle scheduler (hot lists for fixed/late updates). */
  readonly lifecycle = new LifecycleScheduler();

  /** Callback fired immediately before an entity is destroyed (slot-based; latest
   *  subscriber wins). Used by the LODSystem to clean up its per-entity records so
   *  chunk unloads / destroys don't leak. */
  onEntityDestroyed?: (entityId: EntityId) => void;

  private deferredOps: DeferredOp[] = [];
  private nextId: EntityId = 1;
  private _structuralRevision = 0;
  private readonly destroying = new Set<EntityId>();
  /** Stable GUID per entity — survives save/load, net replication, and editor undo.
   *  Random guids are only generated at first spawn; restores reuse the doc's guid. */
  private readonly guidOf = new Map<EntityId, string>();

  queueDeferredOp(op: DeferredOp): void {
    this.deferredOps.push(op);
  }

  private readonly _eng = new THREE.Vector3();
  private readonly _grid = new THREE.Vector3();
  private readonly _world = new THREE.Vector3();
  private readonly ctx: BuildContext;

  constructor(
    private readonly scene: THREE.Scene,
    physicsWorld: PhysicsWorld,
    assetCache: AssetCache,
    private readonly worldOrigin: WorldOrigin,
  ) {
    this.ctx = { physicsWorld, assetCache, worldOrigin };
  }

  /**
   * Fill in BuildContext members that only exist later in Engine construction
   * (the SceneManager is built before the asset manifest).
   */
  provideBuildContext(extras: Partial<BuildContext>): void {
    Object.assign(this.ctx, extras);
  }

  // --- Builders ------------------------------------------------------------
  registerBuilder(kind: string, builder: EntityBuilder): void {
    this.builders.set(kind, builder);
  }

  private build(blueprint: EntityBlueprint, enginePos: THREE.Vector3): RigidBodyComponent {
    const builder = this.builders.get(blueprint.kind);
    if (!builder) throw new Error(`SceneManager: no builder for kind '${blueprint.kind}'`);
    return builder(enginePos, blueprint.params, this.ctx);
  }

  // --- Dirty tracking ------------------------------------------------------
  markDirty(chunkId: ChunkId): void {
    if (chunkId !== GLOBAL_CHUNK) this.dirtyChunks.add(chunkId);
  }

  clearDirty(): void {
    this.dirtyChunks.clear();
  }

  /** Stable chunk-local key for a streamed entity, or null for runtime-spawned ones. */
  chunkEntityKey(id: EntityId): string | null {
    const key = this.chunkKeyOf.get(id);
    return key === undefined ? null : String(key);
  }

  /** Chunk an entity currently belongs to (GLOBAL_CHUNK for non-streamed entities). */
  chunkOf(id: EntityId): ChunkId | undefined {
    return this.entityToChunk.get(id);
  }

  // --- Spawn (immediate + deferred) ---------------------------------------
  /** Immediate, synchronous instantiation. Safe ONLY outside physics/async callbacks. */
  spawnNow(worldPos: THREE.Vector3, blueprint: EntityBlueprint, opts: SpawnOptions = {}): EntityId {
    this.assertGuidAvailable(opts.guid);
    return this.instantiate(this.toRecord(worldPos, blueprint, opts));
  }

  /** Deferred spawn — safe from physics callbacks and async load resolutions (loop step 8). */
  requestSpawn(worldPos: THREE.Vector3, blueprint: EntityBlueprint, opts: SpawnOptions = {}): void {
    this.assertGuidAvailable(opts.guid);
    this.deferredOps.push({ kind: 'spawn', record: this.toRecord(worldPos, blueprint, opts) });
  }

  private assertGuidAvailable(guid?: string): void {
    if (!guid) return;
    if (this.getEntityByGuid(guid) !== undefined || this.deferredOps.some(
      (op) => op.kind === 'spawn' && op.record.guid === guid,
    )) {
      throw new Error(`SceneManager: duplicate entity GUID '${guid}'.`);
    }
  }

  requestDestroy(id: EntityId, childPolicy: ChildPolicy = 'cascade'): void {
    this.deferredOps.push({ kind: 'destroy', id, childPolicy });
  }

  private toRecord(worldPos: THREE.Vector3, blueprint: EntityBlueprint, opts: SpawnOptions): SpawnRecord {
    return {
      worldPos: worldPos.clone(),
      blueprint,
      chunkId: opts.chunkId ?? GLOBAL_CHUNK,
      rootMotion: opts.rootMotion ?? false,
      parent: opts.parent,
      onSpawned: opts.onSpawned,
      quat: opts.quat?.clone(),
      guid: opts.guid,
    };
  }

  private genGuid(): string {
    try { const c: any = (globalThis as any).crypto; if (c?.randomUUID) return c.randomUUID(); } catch {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0; const v = ch === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
    });
  }

  /** Stable GUID for an entity, or undefined if not yet assigned. */
  getGuid(id: EntityId): string | undefined { return this.guidOf.get(id); }
  /** Reverse lookup: entity id with given GUID (or undefined). */
  getEntityByGuid(guid: string): EntityId | undefined {
    for (const [id, g] of this.guidOf) {
      if (g === guid) return id;
    }
    return undefined;
  }
  /** The GUID of the entity's logical parent, or undefined. */
  getParentGuid(id: EntityId): string | undefined {
    const parentId = this.parentOf.get(id);
    return parentId !== undefined ? this.guidOf.get(parentId) : undefined;
  }
  /** Override GUID (used when restoring a saved document's GUID). */
  setGuid(id: EntityId, guid: string): void {
    if (!this.entities.has(id)) return;
    const existing = this.getEntityByGuid(guid);
    if (existing !== undefined && existing !== id) {
      throw new Error(`SceneManager: duplicate entity GUID '${guid}'.`);
    }
    this.guidOf.set(id, guid);
  }
  /** Ensure entity has a GUID, generating one if missing. */
  ensureGuid(id: EntityId): string {
    let g = this.guidOf.get(id);
    if (!g) { g = this.genGuid(); this.guidOf.set(id, g); }
    return g;
  }

  private instantiate(rec: SpawnRecord): EntityId {
    // Convert at instantiation so a mid-load origin shift cannot misplace the entity.
    this.worldOrigin.toEngineSpaceInto(this._eng, rec.worldPos);
    const rb = this.build(rec.blueprint, this._eng.clone());

    if (rec.quat) {
      rb.mesh.quaternion.copy(rec.quat);
      rb.resetInterpolationBuffers();
    }

    const id = this.nextId++;
    // Assign stable GUID (or preserve caller-specified GUID)
    this.guidOf.set(id, rec.guid || this.genGuid());
    this.entities.add(id);
    this._structuralRevision++;
    this.blueprintOf.set(id, rec.blueprint);
    this.addComponent(id, 'rigidBody', rb);
    this.meshToRb.set(rb.mesh, rb);
    this.bodyToEntity.set(rb.rapierBody, id);

    if (rec.blueprint.tags) {
      for (const tag of rec.blueprint.tags) {
        this.addTag(id, tag);
      }
    }

    // Hot lists.
    this.rbIndex.set(id, this.rigidBodyList.length);
    this.rigidBodyList.push(rb);
    this.rigidBodyEntities.push(id);
    if (rec.rootMotion) {
      this.rmIndex.set(id, this.rootMotionList.length);
      this.rootMotionList.push(rb);
      this.rootMotionEntities.push(id);
    }

    // Chunk membership.
    this.entityToChunk.set(id, rec.chunkId);
    if (rec.chunkId === GLOBAL_CHUNK) this.globalEntities.add(id);
    else this.markDirty(rec.chunkId);

    // Logical hierarchy.
    if (rec.parent !== undefined && this.entities.has(rec.parent)) {
      this.parentOf.set(id, rec.parent);
      this.childrenList(rec.parent).add(id);

      const parentRb = this.getRigidBody(rec.parent);
      if (parentRb) {
        const localPos = parentRb.mesh.worldToLocal(rb.mesh.position.clone());
        const localQuat = parentRb.mesh.quaternion.clone().invert().multiply(rb.mesh.quaternion);
        this.childOffsets.set(id, { localPos, localQuat });
      }
    }

    // Scene-Graph Contract: physics roots are ALWAYS direct children of the Scene.
    // Tag so the floating-origin static pass skips them (they shift via shiftOrigin).
    rb.mesh.userData.physicsRoot = true;
    this.scene.add(rb.mesh);

    rec.onSpawned?.(id);
    return id;
  }

  // --- Destroy -------------------------------------------------------------
  destroyNow(id: EntityId, childPolicy: ChildPolicy = 'cascade'): void {
    this.destroyEntity(id, childPolicy);
  }

  private destroyEntity(id: EntityId, childPolicy: ChildPolicy): void {
    if (!this.entities.has(id) || this.destroying.has(id)) return;
    this.destroying.add(id);

    // 1–2. Resolve children, apply policy.
    const children = this.childrenOf.get(id);
    if (children) {
      for (const child of [...children]) {
        if (childPolicy === 'cascade') {
          this.destroyEntity(child, 'cascade');
        } else {
          this.promoteToGlobal(child);
        }
        this.parentOf.delete(child);
      }
      children.clear();
    }
    this.childrenOf.delete(id);

    // Descendants are gone before parent observers run, while this entity and its mesh
    // are still readable by cleanup subscribers.
    this.onEntityDestroyed?.(id);

    const parent = this.parentOf.get(id);
    if (parent !== undefined) {
      this.childrenOf.get(parent)?.delete(id);
      this.parentOf.delete(id);
    }
    this.childOffsets.delete(id);

    // 3. Unregister modular components
    const comps = this.lifecycle.getComponentsForEntity(id);
    for (const comp of comps) {
      this.lifecycle.unregister(comp);
    }

    // 4. Dispose rigid body, swap-pop lists, scrub maps.
    const rb = this.getComponent<RigidBodyComponent>(id, 'rigidBody');
    if (rb) {
      this.meshToRb.delete(rb.mesh);
      this.bodyToEntity.delete(rb.rapierBody);
    }
    rb?.dispose();

    this.swapPopRigidBody(id);
    this.swapPopRootMotion(id);
    this.swapPopScript(id);
    this.guidOf.delete(id);

    const chunk = this.entityToChunk.get(id);
    if (chunk !== undefined) this.markDirty(chunk);

    this.events.emit('entity_destroyed', { entityId: id });
    this.entities.delete(id);
    this._structuralRevision++;
    this.entityToChunk.delete(id);
    this.chunkKeyOf.delete(id);
    this.tagsOf.delete(id);
    this.globalEntities.delete(id);
    this.blueprintOf.delete(id);
    for (const store of this.components.values()) store.delete(id);
    this.destroying.delete(id);
  }

  parentEntity(id: EntityId, parentId: EntityId | null, immediate = false): void {
    if (immediate) {
      this.applyParentEntity(id, parentId);
      return;
    }
    this.deferredOps.push({ kind: 'reparent', id, parent: parentId });
  }

  applyParentEntity(id: EntityId, parentId: EntityId | null): void {
    const oldParent = this.parentOf.get(id);
    if (oldParent !== undefined) {
      this.childrenOf.get(oldParent)?.delete(id);
      this.parentOf.delete(id);
    }
    this.childOffsets.delete(id);

    if (parentId === null) {
      this.promoteToGlobal(id);
      return;
    }

    if (this.entities.has(parentId) && id !== parentId) {
      this.parentOf.set(id, parentId);
      this.childrenList(parentId).add(id);

      const childRb = this.getRigidBody(id);
      const parentRb = this.getRigidBody(parentId);
      if (childRb && parentRb) {
        const localPos = parentRb.mesh.worldToLocal(childRb.mesh.position.clone());
        const localQuat = parentRb.mesh.quaternion.clone().invert().multiply(childRb.mesh.quaternion);
        this.childOffsets.set(id, { localPos, localQuat });
      }

      const parentChunk = this.entityToChunk.get(parentId);
      if (parentChunk !== undefined) {
        const prevChunk = this.entityToChunk.get(id);
        if (prevChunk !== undefined && prevChunk !== parentChunk) {
          this.markDirty(prevChunk);
          this.markDirty(parentChunk);
        }
        this.entityToChunk.set(id, parentChunk);
        if (parentChunk === GLOBAL_CHUNK) {
          this.globalEntities.add(id);
        } else {
          this.globalEntities.delete(id);
        }
      }
    }
  }

  updateParentChildTransforms(): void {
    for (const [id, offset] of this.childOffsets) {
      const parentId = this.parentOf.get(id);
      if (parentId === undefined) continue;
      const parentRb = this.getRigidBody(parentId);
      const childRb = this.getRigidBody(id);
      if (parentRb && childRb) {
        const targetPos = offset.localPos.clone().applyMatrix4(parentRb.mesh.matrixWorld);
        const targetQuat = parentRb.mesh.quaternion.clone().multiply(offset.localQuat);
        childRb.teleport(targetPos, targetQuat);
      }
    }
  }

  /** reparentToRoot: child survives at its world pose and is promoted to global (no re-spawn dup). */
  private promoteToGlobal(child: EntityId): void {
    const rb = this.getComponent<RigidBodyComponent>(child, 'rigidBody');
    // Physics roots are already Scene children; attach preserves world transform for any nested case.
    if (rb) this.scene.attach(rb.mesh);
    const prevChunk = this.entityToChunk.get(child);
    if (prevChunk !== undefined && prevChunk !== GLOBAL_CHUNK) this.markDirty(prevChunk);
    this.entityToChunk.set(child, GLOBAL_CHUNK);
    this.globalEntities.add(child);
  }

  private swapPopRigidBody(id: EntityId): void {
    const idx = this.rbIndex.get(id);
    if (idx === undefined) return;
    const last = this.rigidBodyList.length - 1;
    if (idx !== last) {
      const movedEntity = this.rigidBodyEntities[last];
      this.rigidBodyList[idx] = this.rigidBodyList[last];
      this.rigidBodyEntities[idx] = movedEntity;
      this.rbIndex.set(movedEntity, idx);
    }
    this.rigidBodyList.pop();
    this.rigidBodyEntities.pop();
    this.rbIndex.delete(id);
  }

  private swapPopRootMotion(id: EntityId): void {
    const idx = this.rmIndex.get(id);
    if (idx === undefined) return;
    const last = this.rootMotionList.length - 1;
    if (idx !== last) {
      const movedEntity = this.rootMotionEntities[last];
      this.rootMotionList[idx] = this.rootMotionList[last];
      this.rootMotionEntities[idx] = movedEntity;
      this.rmIndex.set(movedEntity, idx);
    }
    this.rootMotionList.pop();
    this.rootMotionEntities.pop();
    this.rmIndex.delete(id);
  }

  // --- Scripts ------------------------------------------------------------
  addScript(id: EntityId, sourceCode: string): ReloadResult {
    if (!this.entities.has(id)) return { ok: false, error: `entity ${id} not found` };
    let script = this.getComponent<ScriptComponent>(id, 'script');
    if (script) {
      // Existing script → live state-preserved HOT-SWAP (keeps position/velocity/self).
      return script.setSource(sourceCode);
    }
    script = new ScriptComponent(id, this, sourceCode);
    this.addComponent(id, 'script', script);
    this.scriptIndex.set(id, this.scriptList.length);
    this.scriptList.push(script);
    this.scriptEntities.push(id);
    return script.compileError ? { ok: false, error: script.compileError } : { ok: true };
  }

  removeScript(id: EntityId): void {
    if (!this.components.get('script')?.has(id)) return;
    this.components.get('script')!.delete(id);
    this.swapPopScript(id);
  }

  private swapPopScript(id: EntityId): void {
    const idx = this.scriptIndex.get(id);
    if (idx === undefined) return;
    this.scriptList[idx].dispose();
    const last = this.scriptList.length - 1;
    if (idx !== last) {
      const movedEntity = this.scriptEntities[last];
      this.scriptList[idx] = this.scriptList[last];
      this.scriptEntities[idx] = movedEntity;
      this.scriptIndex.set(movedEntity, idx);
    }
    this.scriptList.pop();
    this.scriptEntities.pop();
    this.scriptIndex.delete(id);
  }

  // --- Deferred flush (loop step 8) ---------------------------------------
  flushDeferredOperations(): void {
    // Loop-drain into local batches so cascades enqueued mid-flush are covered, and the
    // live queue is never iterated while being mutated.
    while (this.deferredOps.length > 0) {
      const batch = this.deferredOps;
      this.deferredOps = [];
      for (const op of batch) {
        if (op.kind === 'spawn') {
          this.instantiate(op.record);
        } else if (op.kind === 'destroy') {
          this.destroyEntity(op.id, op.childPolicy);
        } else if (op.kind === 'reparent') {
          this.applyParentEntity(op.id, op.parent);
        } else if (
          op.kind === 'jointAttach' ||
          op.kind === 'jointDetach' ||
          op.kind === 'ragdollCreate' ||
          op.kind === 'structuralMutation'
        ) {
          op.fn();
        }
      }
    }
    this.lifecycle.flushAwake();
    this.lifecycle.flushStart();
  }

  /** Fan out a kept-time ratio to every root-motion entity when Time drops physics debt. */
  scalePendingRootMotion(keepRatio: number): void {
    for (const rb of this.rootMotionList) rb.scalePending(keepRatio);
  }

  // --- Modular Component System (S4) ---------------------------------------
  attachComponent<T extends Component>(id: EntityId, component: T): T {
    if (!this.entities.has(id)) {
      throw new Error(`Cannot attach component to non-existent entity ${id}`);
    }
    const type = (component.constructor as any).type;
    if (!type) {
      throw new Error(`Component class ${(component as any).constructor?.name} has no static 'type' defined`);
    }
    this.addComponent(id, type, component);
    this.lifecycle.register(component);
    return component;
  }

  detachComponent(id: EntityId, type: string): void {
    const comp = this.getComponent<Component>(id, type);
    if (comp && comp instanceof Component) {
      this.lifecycle.unregister(comp);
    }
    this.components.get(type)?.delete(id);
  }

  getModularComponent<T extends Component>(id: EntityId, type: string): T | undefined {
    const comp = this.getComponent<unknown>(id, type);
    return comp instanceof Component ? (comp as T) : undefined;
  }

  getAllComponents(id: EntityId): Component[] {
    return this.lifecycle.getComponentsForEntity(id);
  }

  // --- Semantic Tags -------------------------------------------------------
  addTag(id: EntityId, tag: string): void {
    if (!this.entities.has(id)) return;
    let set = this.tagsOf.get(id);
    if (!set) {
      set = new Set();
      this.tagsOf.set(id, set);
    }
    set.add(tag);
  }

  hasEntity(id: EntityId): boolean {
    return this.entities.has(id);
  }

  removeTag(id: EntityId, tag: string): void {
    this.tagsOf.get(id)?.delete(tag);
  }

  hasTag(id: EntityId, tag: string): boolean {
    return this.tagsOf.get(id)?.has(tag) ?? false;
  }

  getEntitiesWithTag(tag: string): EntityId[] {
    const out: EntityId[] = [];
    for (const [id, tags] of this.tagsOf) {
      if (tags.has(tag)) out.push(id);
    }
    return out;
  }

  getTags(id: EntityId): string[] {
    return Array.from(this.tagsOf.get(id) ?? []);
  }

  // --- Generic component store --------------------------------------------
  addComponent(id: EntityId, type: string, comp: unknown): void {
    let store = this.components.get(type);
    if (!store) {
      store = new Map();
      this.components.set(type, store);
    }
    store.set(id, comp);
  }

  getComponent<T>(id: EntityId, type: string): T | undefined {
    return this.components.get(type)?.get(id) as T | undefined;
  }

  private childrenList(parent: EntityId): Set<EntityId> {
    let set = this.childrenOf.get(parent);
    if (!set) {
      set = new Set();
      this.childrenOf.set(parent, set);
    }
    return set;
  }

  getRigidBody(id: EntityId): RigidBodyComponent | null {
    return this.getComponent<RigidBodyComponent>(id, 'rigidBody') ?? null;
  }

  getEntityForRigidBody(rb: RigidBodyComponent): EntityId | undefined {
    const idx = this.rigidBodyList.indexOf(rb);
    return idx !== -1 ? this.rigidBodyEntities[idx] : undefined;
  }

  /** Walk up from a raycast hit to the owning physics-root component, if any. */
  pickRigidBody(object: THREE.Object3D | null): RigidBodyComponent | null {
    let o: THREE.Object3D | null = object;
    while (o) {
      const rb = this.meshToRb.get(o);
      if (rb) return rb;
      o = o.parent;
    }
    return null;
  }

  // --- Cross-chunk references (null-safe) ---------------------------------
  resolve(ref: CrossChunkRef): RigidBodyComponent | null {
    if (this.entityToChunk.get(ref.entityId) !== ref.chunkId) return null;
    return this.getComponent<RigidBodyComponent>(ref.entityId, 'rigidBody') ?? null;
  }

  // --- Chunk I/O (grid-static, origin-independent) ------------------------
  exportChunkToBinary(id: ChunkId): Uint8Array {
    // GLOBAL excluded — globals are saved separately with the world snapshot.
    return this.serializeEntities((chunk) => chunk === id, chunkGridOrigin(id, this._grid));
  }

  /** Globals are anchored at the absolute world origin (no chunk grid offset). */
  exportGlobalsToBinary(): Uint8Array {
    return this.serializeEntities((chunk) => chunk === GLOBAL_CHUNK, this._grid.set(0, 0, 0));
  }

  private serializeEntities(match: (chunk: ChunkId) => boolean, anchor: THREE.Vector3): Uint8Array {
    const out: SerializedEntity[] = [];
    for (const [entity, chunk] of this.entityToChunk) {
      if (!match(chunk)) continue;
      const rb = this.getComponent<RigidBodyComponent>(entity, 'rigidBody');
      const blueprint = this.blueprintOf.get(entity);
      if (!rb || !blueprint) continue;
      // worldPos = enginePos + offset; localPos = worldPos - anchor.
      this.worldOrigin.toWorldSpaceInto(this._world, rb.mesh.position).sub(anchor);
      const q = rb.mesh.quaternion;
      out.push({
        kind: blueprint.kind,
        params: blueprint.params,
        localPos: [this._world.x, this._world.y, this._world.z],
        quat: [q.x, q.y, q.z, q.w],
        rootMotion: this.rmIndex.has(entity),
        originalId: entity,
        parentId: this.parentOf.get(entity),
      });
    }
    return new TextEncoder().encode(JSON.stringify(out));
  }

  loadChunkFromBinary(
    id: ChunkId,
    bytes: Uint8Array,
    idMap?: Map<EntityId, EntityId>,
    relations?: { childOldId: EntityId; parentOldId: EntityId }[]
  ): void {
    chunkGridOrigin(id, this._grid);
    const list = JSON.parse(new TextDecoder().decode(bytes)) as SerializedEntity[];
    for (const e of list) {
      // worldPos = chunkGridOrigin + localPos; spawnNow converts world→engine internally.
      this._world.set(
        this._grid.x + e.localPos[0],
        this._grid.y + e.localPos[1],
        this._grid.z + e.localPos[2],
      );
      const id2 = this.spawnNow(this._world, { kind: e.kind, params: e.params }, {
        chunkId: id,
        rootMotion: e.rootMotion,
      });
      const rb = this.getComponent<RigidBodyComponent>(id2, 'rigidBody');
      if (rb) {
        rb.mesh.quaternion.set(e.quat[0], e.quat[1], e.quat[2], e.quat[3]);
        rb.resetInterpolationBuffers();
      }

      if (e.originalId !== undefined) {
        this.chunkKeyOf.set(id2, e.originalId);
        if (idMap) idMap.set(e.originalId, id2);
      }
      if (e.parentId !== undefined && relations && e.originalId !== undefined) {
        relations.push({ childOldId: e.originalId, parentOldId: e.parentId });
      }
    }
  }

  /** All currently-tracked chunk ids that hold at least one entity. */
  occupiedChunks(): Set<ChunkId> {
    const set = new Set<ChunkId>();
    for (const chunk of this.entityToChunk.values()) {
      if (chunk !== GLOBAL_CHUNK) set.add(chunk);
    }
    return set;
  }

  /** All live entities currently assigned to a chunk. */
  entitiesInChunk(id: ChunkId): EntityId[] {
    const out: EntityId[] = [];
    for (const [entity, chunk] of this.entityToChunk) {
      if (chunk === id) out.push(entity);
    }
    return out;
  }

  destroyChunkEntities(id: ChunkId): void {
    for (const [entity, chunk] of this.entityToChunk) {
      if (chunk === id) this.requestDestroy(entity, 'cascade');
    }
  }

  get entityCount(): number {
    return this.entities.size;
  }

  /** HELM: true while structural spawns/destroys are queued but not yet flushed. The
   *  agent control plane waits on this to know an async edit has fully landed. */
  hasPendingDeferredOps(): boolean {
    return this.deferredOps.length > 0;
  }

  // --- Introspection accessors (HELM agent control plane) -----------------
  /** Snapshot of every live entity id (order not guaranteed). */
  allEntityIds(): EntityId[] {
    return [...this.entities];
  }

  /** The serializable blueprint an entity was built from, if still alive. */
  getBlueprint(id: EntityId): EntityBlueprint | undefined {
    return this.blueprintOf.get(id);
  }

  /** The logical (ECS) parent of an entity, or undefined if it has none. */
  getParent(id: EntityId): EntityId | undefined {
    return this.parentOf.get(id);
  }

  /** Read a logical child's authored local pose. Returned values are clones. */
  getLocalTransform(id: EntityId): { position: THREE.Vector3; quaternion: THREE.Quaternion } | null {
    const offset = this.childOffsets.get(id);
    if (offset) return { position: offset.localPos.clone(), quaternion: offset.localQuat.clone() };
    const rb = this.getRigidBody(id);
    return rb ? { position: rb.mesh.position.clone(), quaternion: rb.mesh.quaternion.clone() } : null;
  }

  /** Set local pose without conflating it with the body's current world/engine pose. */
  setLocalTransform(id: EntityId, position: THREE.Vector3, quaternion: THREE.Quaternion): boolean {
    const rb = this.getRigidBody(id);
    if (!rb) return false;
    const parentId = this.parentOf.get(id);
    if (parentId === undefined) {
      rb.teleport(position, quaternion);
      return true;
    }
    const parent = this.getRigidBody(parentId);
    if (!parent) return false;
    this.childOffsets.set(id, { localPos: position.clone(), localQuat: quaternion.clone() });
    parent.mesh.updateMatrixWorld(true);
    const worldPos = position.clone().applyMatrix4(parent.mesh.matrixWorld);
    const worldQuat = parent.mesh.quaternion.clone().multiply(quaternion);
    rb.teleport(worldPos, worldQuat);
    return true;
  }

  /** True if the entity participates in the root-motion list (driven by an animation). */
  isRootMotion(id: EntityId): boolean {
    return this.rmIndex.has(id);
  }

  /** Reverse lookup: which entity owns this rigid body component (or null). */
  entityOf(rb: RigidBodyComponent): EntityId | null {
    const idx = this.rigidBodyList.indexOf(rb);
    return idx === -1 ? null : this.rigidBodyEntities[idx];
  }

  /** O(1) reverse lookup used by collision and sensor event routing. */
  entityOfRapierBody(body: object): EntityId | null {
    return this.bodyToEntity.get(body) ?? null;
  }

  /** Changes whenever a live entity is added or removed. */
  get structuralRevision(): number { return this._structuralRevision; }

  /** Entity id at a given index in `rigidBodyList` (the parallel hot list). O(1) — use
   *  this when iterating `rigidBodyList` with an index instead of an O(n) entityOf(). */
  entityAtIndex(index: number): EntityId | undefined {
    return this.rigidBodyEntities[index];
  }

  static readonly CHUNK_SIZE = CHUNK_SIZE;

  /**
   * Tear down every entity (disposes owned GPU resources + releases shared-asset
   * refcounts). Called by Engine.dispose so HMR/reload doesn't leak geometries/materials.
   */
  dispose(): void {
    // Snapshot the ids; destroyEntity mutates the sets we'd otherwise iterate.
    const ids = [...this.entities];
    for (const id of ids) this.destroyEntity(id, 'cascade');
    this.deferredOps.length = 0;
  }
}
