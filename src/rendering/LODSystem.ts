import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import type { SceneManager, EntityId } from '../ecs/SceneManager';

/**
 * LODSystem.ts — automatic Level-of-Detail for open-world mesh scaling.
 *
 * Three.js ships a `LOD` Object3D that swaps child meshes based on camera distance, but
 * it requires the caller to PRE-GENERATE every LOD level's geometry. For an AI-native
 * engine where an LLM drops in GLBs and expects them to "just work" at any scale, we
 * automate the level generation: when `registerEntity` is called, we walk the entity's
 * mesh, find every Mesh, and use the `SimplifyModifier` (a Three.js addon that does
 * edge-collapse decimation) to generate 2 reduced copies at 50% and 20% triangle count.
 * The three geometries (original + 2 simplified) are packed into a `THREE.LOD` which
 * replaces the original mesh in the scene graph.
 *
 * The system ticks every frame (in the engine loop, before the cull), computing each
 * registered entity's distance to the camera and calling `lod.update(camera)` on each
 * LOD object. Three's `LOD.update` swaps the visible child based on the distance
 * thresholds we set (e.g. <20m → full, <60m → 50%, <200m → 20%, ≥200m → culled).
 *
 * Opt-in per entity: tag an entity's root mesh `userData.lodExclude = true` to skip it
 * (e.g. for characters where silhouette matters, or for already-low-poly props). The
 * `lod_register` AIBridge command registers an entity; `lod_unregister` removes the LOD
 * and restores the original geometry.
 *
 * Memory note: the simplified geometries are OWNED by the LOD system (disposed on
 * unregister / teardown). The original geometry is BORROWED — the LOD's level-0 child
 * shares the original BufferGeometry, so disposing the LOD doesn't free the original.
 */

export interface LODConfig {
  /** Distance thresholds (metres) for each level, ascending. Level 0 is the original.
   *  Default: [0, 20, 60, 200] → <20m full, <60m 50%, <200m 20%, ≥200m hidden. */
  distances?: number[];
  /** Simplification ratios for each generated level (1.0 = original, 0.0 = no tris).
   *  Default: [0.5, 0.2] → level 1 keeps 50% of tris, level 2 keeps 20%. */
  ratios?: number[];
}

interface LODRecord {
  entityId: EntityId;
  /** The LOD objects created (one per Mesh in the entity). */
  lods: THREE.LOD[];
  /** The original meshes the LODs replaced (for unregister / restore). */
  originals: { mesh: THREE.Mesh; parent: THREE.Object3D }[];
  /** Distance thresholds. */
  distances: number[];
}

const DEFAULT_DISTANCES = [0, 20, 60, 200];
const DEFAULT_RATIOS = [0.5, 0.2];

export class LODSystem {
  private readonly records = new Map<EntityId, LODRecord>();
  private readonly camera: THREE.Camera;
  private readonly sceneManager: SceneManager;
  private readonly modifier = new SimplifyModifier();
  private enabled = false;
  /** Per-entity destroy callback — SceneManager calls this via its onDestroy hook so
   *  a destroyed entity automatically cleans up its LOD record (and the simplified
   *  geometries it owns). Without this, the records map would grow indefinitely as
   *  chunks unload / entities are destroyed. */
  private readonly onEntityDestroyed = (entityId: EntityId): void => {
    if (this.records.has(entityId)) this.unregisterEntity(entityId);
  };

  constructor(camera: THREE.Camera, sceneManager: SceneManager) {
    this.camera = camera;
    this.sceneManager = sceneManager;
    sceneManager.onEntityDestroyed = this.onEntityDestroyed;
  }

  get isEnabled(): boolean { return this.enabled; }
  get registeredCount(): number { return this.records.size; }

  /** Enable the system — starts updating LODs every frame. */
  enable(): void { this.enabled = true; }
  /** Disable — restores every registered entity to its original (level 0) mesh. */
  disable(): void {
    this.enabled = false;
    // Three's LOD doesn't expose a "show level 0" method; we set the camera-distance
    // to 0 by calling update with a camera at the LOD's position. Simpler: just
    // make every level's object visible=false except level 0.
    for (const rec of this.records.values()) {
      for (const lod of rec.lods) {
        for (let i = 0; i < lod.levels.length; i++) {
          lod.levels[i].object.visible = (i === 0);
        }
      }
    }
  }

  /** Register an entity for LOD. Walks its mesh, generates simplified levels, and
   *  replaces each Mesh with a THREE.LOD. Returns the number of LOD objects created. */
  registerEntity(entityId: EntityId, config: LODConfig = {}): int {
    if (this.records.has(entityId)) {
      console.warn(`[LODSystem] entity ${entityId} already registered`);
      return 0;
    }
    const rb = this.sceneManager.getRigidBody(entityId);
    if (!rb) { console.warn(`[LODSystem] entity ${entityId} has no rigid body`); return 0; }
    if (rb.mesh.userData.lodExclude) return 0;

    const distances = config.distances ?? DEFAULT_DISTANCES;
    const ratios = config.ratios ?? DEFAULT_RATIOS;
    const lods: THREE.LOD[] = [];
    const originals: { mesh: THREE.Mesh; parent: THREE.Object3D }[] = [];

    rb.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.lodExclude) return;
      const geo = mesh.geometry;
      if (!geo || !geo.attributes.position) return;
      const parent = mesh.parent;
      if (!parent) return;

      // Create the LOD object.
      const lod = new THREE.LOD();
      // Level 0: the original mesh (shared geometry — NOT cloned, so disposing the LOD
      // doesn't free the original; the entity owns it).
      lod.addLevel(mesh, distances[0]);
      // Levels 1..N: simplified copies.
      const mat = mesh.material;
      for (let i = 0; i < ratios.length; i++) {
        const ratio = ratios[i];
        const simplified = this.modifier.modify(geo, Math.max(0, Math.floor(geo.index ? geo.index.count * ratio : geo.attributes.position.count * ratio)));
        const lodMesh = new THREE.Mesh(simplified, mat);
        lodMesh.castShadow = mesh.castShadow;
        lodMesh.receiveShadow = mesh.receiveShadow;
        lod.addLevel(lodMesh, distances[i + 1] ?? 999);
      }
      // Add a "beyond max distance" empty level so Three hides the LOD when far away.
      lod.addLevel(new THREE.Object3D(), distances[distances.length - 1] + 1);

      // Replace the mesh in the scene graph.
      parent.add(lod);
      // The LOD inherits the mesh's local transform.
      lod.position.copy(mesh.position);
      lod.rotation.copy(mesh.rotation);
      lod.scale.copy(mesh.scale);
      // Remove the mesh from the parent (it's now a child of the LOD at level 0).
      parent.remove(mesh);
      // Reset the mesh's local transform (the LOD owns the transform now).
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);

      lods.push(lod);
      originals.push({ mesh, parent });
    });

    if (lods.length === 0) return 0;
    this.records.set(entityId, { entityId, lods, originals, distances });
    return lods.length;
  }

  /** Unregister an entity — restores the original meshes and disposes the simplified geometries. */
  unregisterEntity(entityId: EntityId): void {
    const rec = this.records.get(entityId);
    if (!rec) return;
    for (let i = 0; i < rec.lods.length; i++) {
      const lod = rec.lods[i];
      const orig = rec.originals[i];
      // Force a fresh local matrix from the current world transform. Without this,
      // lod.matrix can be stale (Three doesn't auto-update it unless the parent calls
      // updateMatrixWorld + we read matrixWorld instead), and the restored mesh
      // would snap to an old position.
      lod.updateMatrix();
      const lodMatrix = new THREE.Matrix4().copy(lod.matrix);
      orig.parent.add(orig.mesh);
      lodMatrix.decompose(orig.mesh.position, orig.mesh.quaternion, orig.mesh.scale);
      // Remove the LOD from the parent.
      lod.removeFromParent();
      // Dispose the simplified geometries (levels 1..N). Level 0 is the original (shared).
      for (let lv = 1; lv < lod.levels.length; lv++) {
        const obj = lod.levels[lv].object as THREE.Mesh;
        if (obj.isMesh) obj.geometry?.dispose();
      }
    }
    this.records.delete(entityId);
  }

  /** Per-frame update — call from the engine loop before the cull. */
  update(): void {
    if (!this.enabled || this.records.size === 0) return;
    for (const rec of this.records.values()) {
      for (const lod of rec.lods) {
        lod.update(this.camera);
      }
    }
  }

  dispose(): void {
    for (const entityId of [...this.records.keys()]) {
      this.unregisterEntity(entityId);
    }
    // Detach the destroy callback so a later LODSystem with the same SceneManager
    // doesn't inherit a stale handler.
    if (this.sceneManager.onEntityDestroyed === this.onEntityDestroyed) {
      this.sceneManager.onEntityDestroyed = undefined;
    }
  }
}

type int = number;
