import * as THREE from 'three';

/**
 * RaycastIndex.ts — a mesh-level raycast acceleration structure.
 *
 * Ported from the GTA prototype's `weaponSystemHelpers.ts` (`RaycastIndex`). The engine's
 * `query_raycast` AICommand already rides Rapier's accelerated physics broad-phase, but
 * several MIX paths raycast against *visual* Three.js meshes with the brute-force
 * `THREE.Raycaster.intersectObjects(allMeshes, true)` — notably:
 *
 *   - HELM `op:raycast` ("what entity is under the crosshair") — HelmBridge.opRaycast
 *   - editor click-picking — Engine pick / dragAndDrop
 *
 * `intersectObjects` walks EVERY triangle of EVERY mesh every call. In an open-world scene
 * (hundreds–thousands of meshes) that is the dominant cost of a pick. This index does a
 * cheap two-phase broad-phase first, then only runs the precise triangle test on the few
 * survivors, sorted near→far with an early-out:
 *
 *   1. **Ray–sphere** reject against each mesh's cached world bounding sphere.
 *   2. **Ray–AABB** (slab method) reject against the cached world bounding box, producing
 *      a conservative `tmin` entry distance.
 *   3. Precise `raycaster.intersectObject` on the AABB survivors, visited in ascending
 *      `tmin` order; stop as soon as a real hit is closer than the next candidate's entry.
 *
 * World bounds are cached per mesh (keyed by uuid) and only recomputed when the mesh's
 * `matrixWorld` actually changed — so a static city pays the transform cost once.
 *
 * Usage (throttled rebuild, mirroring the prototype's 5s refresh):
 *   index.rebuild(scene);            // or index.clear() + index.add(mesh) per mesh
 *   const hit = index.raycastFirst(raycaster);
 */
export class RaycastIndex {
  private readonly targets: THREE.Object3D[] = [];
  private readonly hits: THREE.Intersection<THREE.Object3D>[] = [];

  // Per-mesh caches (keyed by uuid) so we never re-transform a static mesh's bounds.
  private readonly localBoxes = new Map<string, THREE.Box3>();
  private readonly localSpheres = new Map<string, THREE.Sphere>();
  private readonly cachedWorldBoxes = new Map<string, THREE.Box3>();
  private readonly cachedWorldSpheres = new Map<string, THREE.Sphere>();
  private readonly cachedMatrices = new Map<string, Float32Array>();

  /** Meshes to skip during a raycast (e.g. the mesh whose own vertices are being shaded,
   *  to avoid self-occlusion). Keyed by `Object3D.uuid`. Non-fine-grained but cheap. */
  excludeUuids: Set<string> = new Set();

  /** Number of registered targets (debug / tests). */
  get size(): number { return this.targets.length; }

  clear(): void {
    this.targets.length = 0;
    this.localBoxes.clear();
    this.localSpheres.clear();
    this.cachedWorldBoxes.clear();
    this.cachedWorldSpheres.clear();
    this.cachedMatrices.clear();
  }

  add(target: THREE.Object3D): void {
    this.targets.push(target);
  }

  /**
   * Convenience: clear + repopulate from a root (e.g. the viewport scene or a list of
   * entity meshes). Skips non-mesh, invisible, and explicitly-excluded
   * (`userData.ignoreRaycastIndex`) objects. Returns `this` for chaining.
   */
  rebuildFrom(roots: Iterable<THREE.Object3D>): this {
    this.clear();
    for (const root of roots) {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible) return;
        if (mesh.userData?.ignoreRaycastIndex) return;
        this.add(mesh);
      });
    }
    return this;
  }

  private updateWorldBounds(mesh: THREE.Mesh): void {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();

    const uuid = mesh.uuid;
    let localBox = this.localBoxes.get(uuid);
    if (!localBox) { localBox = mesh.geometry.boundingBox!; this.localBoxes.set(uuid, localBox); }
    let localSphere = this.localSpheres.get(uuid);
    if (!localSphere) { localSphere = mesh.geometry.boundingSphere!; this.localSpheres.set(uuid, localSphere); }

    let worldBox = this.cachedWorldBoxes.get(uuid);
    let worldSphere = this.cachedWorldSpheres.get(uuid);
    let lastMatrix = this.cachedMatrices.get(uuid);

    if (!worldBox || !worldSphere || !lastMatrix) {
      worldBox = new THREE.Box3();
      worldSphere = new THREE.Sphere();
      lastMatrix = new Float32Array(16);
      this.cachedWorldBoxes.set(uuid, worldBox);
      this.cachedWorldSpheres.set(uuid, worldSphere);
      this.cachedMatrices.set(uuid, lastMatrix);
    }

    // Only re-transform when the world matrix actually changed.
    const elements = mesh.matrixWorld.elements;
    let changed = false;
    for (let j = 0; j < 16; j++) {
      if (elements[j] !== lastMatrix[j]) { changed = true; break; }
    }
    if (changed) {
      lastMatrix.set(elements);
      worldBox.copy(localBox).applyMatrix4(mesh.matrixWorld);
      worldSphere.copy(localSphere).applyMatrix4(mesh.matrixWorld);
    }
  }

  /** First (closest) precise intersection along the raycaster's ray, or null. */
  raycastFirst(raycaster: THREE.Raycaster): THREE.Intersection<THREE.Object3D> | null {
    const ray = raycaster.ray;
    const maxDistance = raycaster.far;

    const candidates: { target: THREE.Mesh; tmin: number }[] = [];

    for (let i = 0; i < this.targets.length; i++) {
      const mesh = this.targets[i] as THREE.Mesh;
      if (!mesh.isMesh) continue;
      if (this.excludeUuids.has(mesh.uuid)) continue;

      this.updateWorldBounds(mesh);
      const worldSphere = this.cachedWorldSpheres.get(mesh.uuid)!;
      const worldBox = this.cachedWorldBoxes.get(mesh.uuid)!;

      // 1. Ray–sphere reject.
      const wc = worldSphere.center;
      const wr = worldSphere.radius;
      const ocX = wc.x - ray.origin.x;
      const ocY = wc.y - ray.origin.y;
      const ocZ = wc.z - ray.origin.z;
      const tca = ocX * ray.direction.x + ocY * ray.direction.y + ocZ * ray.direction.z;
      let sphereIntersects = false;
      if (tca < 0) {
        const d2 = ocX * ocX + ocY * ocY + ocZ * ocZ;
        sphereIntersects = d2 <= wr * wr;
      } else {
        const d2 = (ocX * ocX + ocY * ocY + ocZ * ocZ) - tca * tca;
        const r2 = wr * wr;
        if (d2 <= r2) {
          const thc = Math.sqrt(r2 - d2);
          sphereIntersects = (tca - thc) <= maxDistance || (tca + thc) <= maxDistance;
        }
      }
      if (!sphereIntersects) continue;

      // 2. Ray–AABB (slab) reject, computing the entry distance tmin.
      let tmin = 0;
      let tmax = maxDistance;
      let aabbIntersects = true;

      // X
      if (Math.abs(ray.direction.x) < 1e-6) {
        if (ray.origin.x < worldBox.min.x || ray.origin.x > worldBox.max.x) aabbIntersects = false;
      } else {
        const invD = 1 / ray.direction.x;
        let t1 = (worldBox.min.x - ray.origin.x) * invD;
        let t2 = (worldBox.max.x - ray.origin.x) * invD;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) aabbIntersects = false;
      }
      // Y
      if (aabbIntersects) {
        if (Math.abs(ray.direction.y) < 1e-6) {
          if (ray.origin.y < worldBox.min.y || ray.origin.y > worldBox.max.y) aabbIntersects = false;
        } else {
          const invD = 1 / ray.direction.y;
          let t1 = (worldBox.min.y - ray.origin.y) * invD;
          let t2 = (worldBox.max.y - ray.origin.y) * invD;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) aabbIntersects = false;
        }
      }
      // Z
      if (aabbIntersects) {
        if (Math.abs(ray.direction.z) < 1e-6) {
          if (ray.origin.z < worldBox.min.z || ray.origin.z > worldBox.max.z) aabbIntersects = false;
        } else {
          const invD = 1 / ray.direction.z;
          let t1 = (worldBox.min.z - ray.origin.z) * invD;
          let t2 = (worldBox.max.z - ray.origin.z) * invD;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) aabbIntersects = false;
        }
      }

      if (aabbIntersects) candidates.push({ target: mesh, tmin });
    }

    // 3. Precise pass, near→far, with early-out.
    candidates.sort((a, b) => a.tmin - b.tmin);
    let bestHit: THREE.Intersection<THREE.Object3D> | null = null;
    let closestDistance = maxDistance;
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (cand.tmin >= closestDistance) break; // nothing further can beat the current best
      this.hits.length = 0;
      raycaster.intersectObject(cand.target, false, this.hits);
      const hit = this.hits[0] ?? null;
      if (hit && hit.distance < closestDistance) {
        bestHit = hit;
        closestDistance = hit.distance;
      }
    }
    this.hits.length = 0;
    return bestHit;
  }
}

/**
 * ThrottledRaycastIndex — wraps RaycastIndex with the prototype's "rebuild at most every
 * N ms, or when the target set changed size" policy, so callers can index a churning scene
 * without rebuilding on every pick. Pass a `signature` (e.g. mesh count) that changes when
 * the target set changes.
 */
export class ThrottledRaycastIndex {
  private readonly index = new RaycastIndex();
  private lastBuild = 0;
  private lastSignature = -1;

  constructor(private readonly throttleMs = 5000) {}

  /** Rebuild from `roots` if the throttle elapsed or `signature` changed. */
  maybeRebuild(roots: Iterable<THREE.Object3D>, signature: number, now = performance.now()): void {
    if (signature !== this.lastSignature || now - this.lastBuild >= this.throttleMs || this.index.size === 0) {
      this.index.rebuildFrom(roots);
      this.lastBuild = now;
      this.lastSignature = signature;
    }
  }

  raycastFirst(raycaster: THREE.Raycaster): THREE.Intersection<THREE.Object3D> | null {
    return this.index.raycastFirst(raycaster);
  }

  /** Force the next maybeRebuild() to rebuild (e.g. after a known scene edit). */
  invalidate(): void { this.lastSignature = -1; }
}
