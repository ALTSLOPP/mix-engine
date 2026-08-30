import * as THREE from 'three';

/**
 * CullingSystem.ts — hierarchical frustum culling + software occlusion culling.
 *
 * Three.js ships per-object frustum culling, but for an open-world urban scene it has
 * two gaps this fills:
 *
 *   1. **Hierarchical frustum culling.** Three tests every Mesh's world-space bounding
 *      sphere against the frustum every frame — O(n) over every mesh in the scene. With
 *      a streamed city (tens of thousands of meshes) that's a measurable per-frame cost.
 *      We build a lightweight bounding-volume hierarchy (a flat BVH over the scene's
 *      physics-root groups + their nested meshes) and cull it top-down: if a parent
 *      node's bounds are entirely outside the frustum, we skip the whole subtree without
 *      touching its children. This turns O(n) per-frame into O(log n + visible).
 *
 *   2. **Occlusion culling.** A building behind a taller building is invisible but
 *      still inside the frustum, so frustum culling alone draws it (wasted GPU). We do
 *      a software depth-buffer occlusion test: each frame we rasterize the scene's
 *      "occluders" (a low-res software depth buffer — no GPU round-trip) and test each
 *      candidate's bounding box against it. A box is occluded if every tested point is
 *      behind the software depth buffer at that screen position. This is the same idea
 *      as Unreal's software occlusion query, deliberately CPU-only so it works on every
 *      platform without WebGL occlusion-query extensions (which are sparsely supported).
 *
 * The system is OPT-IN per object: anything tagged `userData.cullExclude = true` is
 * skipped (lights, the sky, gizmo helpers, the debug navmesh overlay). Occluders are
 * tagged `userData.occluder = true` (typically large buildings / walls); everything
 * else is an occludee. The two tags are independent so a small building can be culled
 * but still occlude things behind it.
 *
 * The cull runs in the engine loop BEFORE the render pass. It toggles `Object3D.visible`
 * (saving + restoring the original so a teardown restores the scene). The result is
 * transparent to the rest of the engine — Three's renderer just sees fewer visible
 * objects and draws them as usual.
 */

export interface CullingSystemOptions {
  /** Software occlusion buffer resolution (square, e.g. 256 → 256×256). Smaller = faster
   *  but coarser (more false-positives where a thin gap occludes too aggressively). 256
   *  is a good default for a city; 128 for a dense interior. */
  occlusionResolution?: number;
  /** Max occluder triangles to rasterize per frame. If the occluder set exceeds this,
   *  the largest occluders are kept (sorted by screen-space area). */
  maxOccluderTriangles?: number;
  /** Enable / disable the occlusion pass (frustum culling always runs). */
  occlusionEnabled?: boolean;
  /** Enable / disable hierarchical frustum culling (off → per-object, like Three's default). */
  hierarchicalFrustum?: boolean;
}

interface BVHNode {
  bounds: THREE.Box3;
  /** Children (internal node) — empty for a leaf. */
  children: BVHNode[];
  /** Leaf payload — the Object3D this node represents (null for internal nodes). */
  object: THREE.Object3D | null;
  /** True if any descendant is an occluder (so we skip empty subtrees during occluder
   *  collection). */
  hasOccluder: boolean;
}

export class CullingSystem {
  private readonly camera: THREE.Camera;
  private readonly scene: THREE.Scene;
  private readonly occlusionResolution: number;
  private readonly maxOccluderTriangles: number;
  private occlusionEnabled: boolean;
  private hierarchicalFrustum: boolean;

  /** The software depth buffer (perspective-z, 0 = near, 1 = far). Allocated once. */
  private depthBuffer: Float32Array;
  /** The BVH root — rebuilt when the scene's top-level object set changes. */
  private bvh: BVHNode | null = null;
  /** Cached top-level object count (to detect rebuild need cheaply). */
  private lastTopLevelCount = -1;
  /** Per-frame stats (read by HELM / the debug overlay). */
  stats = {
    frustumCulled: 0,
    occlusionCulled: 0,
    rendered: 0,
    occluderTriangles: 0,
    bvhNodes: 0,
    buildMs: 0,
    frustumMs: 0,
    occlusionMs: 0,
  };

  /** Saved visibility states so a disable() restores the scene exactly. */
  private readonly visibilityBackup = new Map<THREE.Object3D, boolean>();
  private enabled = false;

  /** Scratch — reused across frames (no per-frame allocation). */
  private readonly _frustum = new THREE.Frustum();
  private readonly _projScreenMatrix = new THREE.Matrix4();
  private readonly _boxPoints: THREE.Vector3[] = [
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  ];
  private readonly _boxNdc = new THREE.Vector3();
  private readonly _tmpV = new THREE.Vector3();
  private readonly _occluderList: { object: THREE.Object3D; screenArea: number }[] = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera, opts: CullingSystemOptions = {}) {
    this.scene = scene;
    this.camera = camera;
    this.occlusionResolution = opts.occlusionResolution ?? 256;
    this.maxOccluderTriangles = opts.maxOccluderTriangles ?? 50000;
    this.occlusionEnabled = opts.occlusionEnabled ?? true;
    this.hierarchicalFrustum = opts.hierarchicalFrustum ?? true;
    this.depthBuffer = new Float32Array(this.occlusionResolution * this.occlusionResolution).fill(1);
  }

  setOcclusionEnabled(on: boolean): void { this.occlusionEnabled = on; }
  setHierarchicalFrustum(on: boolean): void { this.hierarchicalFrustum = on; }

  /** Enable the system: build the BVH and start culling each frame (call from the loop). */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.rebuildBVH();
  }

  /** Disable: restore every object's saved visibility. */
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    for (const [obj, vis] of this.visibilityBackup) obj.visible = vis;
    this.visibilityBackup.clear();
    this.bvh = null;
  }

  get isEnabled(): boolean { return this.enabled; }

  /** Rebuild the BVH from the scene's current top-level objects. Call after a chunk
   *  loads / unloads or whenever the scene's top-level set changes. Cheap enough to
   *  call every frame, but better to call only when the top-level count changes. */
  rebuildBVH(): void {
    const t0 = performance.now();
    const topLevel: THREE.Object3D[] = [];
    for (const child of this.scene.children) {
      if (child.userData.cullExclude) continue;
      topLevel.push(child);
    }
    this.lastTopLevelCount = topLevel.length;
    if (topLevel.length === 0) { this.bvh = null; return; }
    // Build a BVH by recursively splitting the object list along its longest axis.
    // This is a simple top-down median-split BVH — O(n log n) build, good enough for
    // the streamed city (the alternative, a Morton-code bottom-up build, is faster but
    // the difference is below the per-frame noise at our scale).
    const leaves: BVHNode[] = topLevel.map((obj) => {
      const b = new THREE.Box3().setFromObject(obj);
      return { bounds: b, children: [], object: obj, hasOccluder: hasOccluderInTree(obj) };
    });
    this.bvh = buildBVH(leaves);
    let nodes = 0;
    if (this.bvh) countNodes(this.bvh, () => nodes++);
    this.stats.bvhNodes = nodes;
    this.stats.buildMs = +(performance.now() - t0).toFixed(2);
  }

  /** Per-frame cull. Call from the engine loop BEFORE viewport.render(). Saves the
   *  visibility of every object it touches so a disable() restores the scene. */
  cull(): void {
    if (!this.enabled) return;
    // Keep the BVH in sync with the live scene before culling. The BVH is a snapshot of
    // the top-level objects taken at build time; objects added after enable() (spawned
    // entities, particle emitters, trails, decals, streamed-in chunks) are NOT in it.
    // The visibility pass below force-hides every top-level object that isn't in the
    // BVH-derived visible set — so without this resync a freshly spawned object, and ALL
    // runtime VFX, would be set invisible every frame until a manual cull_rebuild. We
    // rebuild whenever the non-excluded top-level count changes, which is exactly what
    // the `lastTopLevelCount` field was added for (it was previously written but never
    // read). NOTE: a same-count swap (one object added + one removed in the same frame)
    // or an existing object MOVING far enough that its cached BVH bounds go stale still
    // needs an explicit cull_rebuild — acceptable for the streamed-static-city target.
    let topCount = 0;
    for (const child of this.scene.children) {
      if (!child.userData.cullExclude) topCount++;
    }
    if (topCount !== this.lastTopLevelCount) this.rebuildBVH();
    if (!this.bvh) return;
    const tFrustum = performance.now();
    // 1. Frustum cull (hierarchical or per-object). Produces the visible set AND hides
    //    every top-level object that's outside the frustum (or whose BVH subtree was
    //    culled). We hide the whole top-level group because Three's renderer won't
    //    recurse into an invisible parent.
    this._projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
    const visibleSet: THREE.Object3D[] = [];
    const allTopLevel: THREE.Object3D[] = [];
    for (const child of this.scene.children) {
      if (child.userData.cullExclude) continue;
      allTopLevel.push(child);
    }
    const culledFromFrustum = this.hierarchicalFrustum
      ? this.hierarchicalFrustumCull(this.bvh!, visibleSet)
      : this.flatFrustumCull(visibleSet);
    // Hide every top-level object not in the visible set; show every one in it.
    const visibleTopLevel = new Set(visibleSet);
    for (const obj of allTopLevel) {
      if (!this.visibilityBackup.has(obj)) this.visibilityBackup.set(obj, obj.visible);
      obj.visible = visibleTopLevel.has(obj);
    }
    this.stats.frustumCulled = culledFromFrustum;
    this.stats.frustumMs = +(performance.now() - tFrustum).toFixed(2);

    // 2. Occlusion cull the visible set against the software depth buffer.
    let occlusionCulled = 0;
    let occluderTriangles = 0;
    const tOcclusion = performance.now();
    if (this.occlusionEnabled && visibleSet.length > 0) {
      // Clear the depth buffer to far (1.0).
      this.depthBuffer.fill(1);
      // Collect + rasterize occluders (only those inside the frustum).
      const occluders = this.collectOccluders(visibleSet);
      for (const occ of occluders) {
        occluderTriangles += rasterizeOccluder(occ, this.camera, this.depthBuffer, this.occlusionResolution);
      }
      this.stats.occluderTriangles = occluderTriangles;
      // Now test each non-occluder visible object against the depth buffer. Hide the
      // occluded ones; keep the rest visible (their visibility was set above).
      for (const obj of visibleSet) {
        if (obj.userData.occluder) continue; // occluders always visible
        if (this.isOccluded(obj)) {
          if (!this.visibilityBackup.has(obj)) this.visibilityBackup.set(obj, true);
          obj.visible = false;
          occlusionCulled++;
        }
      }
    }
    this.stats.occlusionCulled = occlusionCulled;
    this.stats.rendered = visibleSet.length - occlusionCulled;
    this.stats.occlusionMs = +(performance.now() - tOcclusion).toFixed(2);
  }

  // ── Hierarchical frustum cull ──────────────────────────────────────────────

  private hierarchicalFrustumCull(node: BVHNode, visibleSet: THREE.Object3D[]): number {
    let culled = 0;
    cullBVH(node, this._frustum, visibleSet, () => culled++);
    return culled;
  }

  private flatFrustumCull(visibleSet: THREE.Object3D[]): number {
    // Walk every top-level object + its descendants. Equivalent to Three's built-in
    // per-mesh frustum test, but we centralize it so the occlusion pass sees the
    // visible set as a flat list.
    let culled = 0;
    for (const child of this.scene.children) {
      if (child.userData.cullExclude) continue;
      if (!this._frustum.intersectsBox(boxOf(child))) { culled++; child.visible = false; continue; }
      child.visible = true;
      visibleSet.push(child);
    }
    return culled;
  }

  // ── Occlusion ──────────────────────────────────────────────────────────────

  private collectOccluders(visibleSet: THREE.Object3D[]): THREE.Object3D[] {
    this._occluderList.length = 0;
    for (const obj of visibleSet) {
      if (!obj.userData.occluder) continue;
      // Estimate screen-space area (rough): project the bounding sphere, compute the
      // projected radius². Used for the triangle-budget sort below.
      const box = boxOf(obj);
      const center = box.getCenter(this._tmpV);
      const dist = center.distanceTo(this.camera.position);
      const radius = box.getSize(new THREE.Vector3()).length() * 0.5;
      const screenArea = (radius * radius) / Math.max(dist * dist, 1e-6);
      this._occluderList.push({ object: obj, screenArea });
    }
    // Sort largest first; keep up to the triangle budget.
    this._occluderList.sort((a, b) => b.screenArea - a.screenArea);
    return this._occluderList.map((o) => o.object);
  }

  /** Test an object's world-space bounding box against the software depth buffer.
   *  The box is occluded if all 8 corners project behind the depth buffer at their
   *  screen positions. Conservative: we sample the box's 8 corners (not every interior
   *  point), so a small gap between corners can miss a thin occluder — acceptable for
   *  a city where occluders are large. */
  private isOccluded(obj: THREE.Object3D): boolean {
    const box = boxOf(obj);
    if (box.isEmpty()) return false;
    // If the box is closer to the camera than the near plane, never cull (avoid
    // false-positives on objects the player is touching).
    const center = box.getCenter(this._tmpV);
    if (center.distanceToSquared(this.camera.position) < 4) return false; // within 2m
    boxCorners(box, this._boxPoints);
    let allBehind = true;
    for (const p of this._boxPoints) {
      const ok = projectPointInto(p, this._projScreenMatrix, this._boxNdc);
      if (!ok) { allBehind = false; break; } // off-screen → not occluded here
      const ndc = this._boxNdc;
      const u = Math.floor((ndc.x * 0.5 + 0.5) * this.occlusionResolution);
      const v = Math.floor((ndc.y * 0.5 + 0.5) * this.occlusionResolution);
      if (u < 0 || v < 0 || u >= this.occlusionResolution || v >= this.occlusionResolution) {
        allBehind = false; break;
      }
      const idx = v * this.occlusionResolution + u;
      // ndc.z in [-1,1] → [0,1] (near=0, far=1). Occluded if the point's depth is
      // GREATER than the buffer (it's farther). The 0.0005 tolerance avoids
      // self-occlusion (an object's own box tested against the buffer it was rasterized
      // into) without missing genuine occlusion (which has a depth delta ≥ ~0.002 at
      // typical city scales).
      const depth = (ndc.z + 1) * 0.5;
      const buf = this.depthBuffer[idx];
      if (depth <= buf + 0.0005) { allBehind = false; break; }
    }
    return allBehind;
  }

  // ── Visibility application ─────────────────────────────────────────────────
  // (inlined into cull() above so we hide frustum-culled top-level objects in the
  //  same pass that shows the survivors — no second scan over the scene.)
}

// ── BVH construction + traversal (module-level helpers) ───────────────────────

function buildBVH(leaves: BVHNode[]): BVHNode | null {
  if (leaves.length === 0) return null;
  if (leaves.length === 1) return leaves[0];
  // Split along the longest axis of the union bounds, median partition.
  const bounds = new THREE.Box3();
  for (const l of leaves) bounds.union(l.bounds);
  const size = bounds.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  leaves.sort((a, b) => centerAxis(a.bounds, axis) - centerAxis(b.bounds, axis));
  const mid = leaves.length >> 1;
  const left = buildBVH(leaves.slice(0, mid))!;
  const right = buildBVH(leaves.slice(mid))!;
  const nodeBounds = new THREE.Box3();
  nodeBounds.union(left.bounds);
  nodeBounds.union(right.bounds);
  return {
    bounds: nodeBounds,
    children: [left, right],
    object: null,
    hasOccluder: left.hasOccluder || right.hasOccluder,
  };
}

function centerAxis(box: THREE.Box3, axis: number): number {
  const min = box.min.getComponent(axis);
  const max = box.max.getComponent(axis);
  return (min + max) * 0.5;
}

function countNodes(node: BVHNode, fn: () => void): void {
  fn();
  for (const c of node.children) countNodes(c, fn);
}

function cullBVH(node: BVHNode, frustum: THREE.Frustum, visibleSet: THREE.Object3D[], onCull: () => void): void {
  if (!frustum.intersectsBox(node.bounds)) { onCull(); return; }
  if (node.object) {
    visibleSet.push(node.object);
    return;
  }
  for (const c of node.children) cullBVH(c, frustum, visibleSet, onCull);
}

// ── Occluder rasterization (software depth buffer) ────────────────────────────

/** Rasterize an occluder's triangles into the software depth buffer. We walk the
 *  object's meshes, project each triangle's 3 vertices to NDC, and rasterize the
 *  screen-space triangle with a simple scanline + 1/z interpolation. */
function rasterizeOccluder(
  obj: THREE.Object3D,
  camera: THREE.Camera,
  depthBuffer: Float32Array,
  resolution: number,
): int {
  let triCount = 0;
  const projScreen = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    if (!geo || !geo.attributes.position) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const idx = geo.index;
    const matrix = mesh.matrixWorld;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const aN = new THREE.Vector3(), bN = new THREE.Vector3(), cN = new THREE.Vector3();
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const ia = idx.getX(i), ib = idx.getX(i + 1), ic = idx.getX(i + 2);
        a.fromBufferAttribute(pos, ia).applyMatrix4(matrix);
        b.fromBufferAttribute(pos, ib).applyMatrix4(matrix);
        c.fromBufferAttribute(pos, ic).applyMatrix4(matrix);
        const okA = projectPointInto(a, projScreen, aN);
        const okB = projectPointInto(b, projScreen, bN);
        const okC = projectPointInto(c, projScreen, cN);
        if (!okA || !okB || !okC) continue;
        rasterizeTri(aN, bN, cN, depthBuffer, resolution);
        triCount++;
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        b.fromBufferAttribute(pos, i + 1).applyMatrix4(matrix);
        c.fromBufferAttribute(pos, i + 2).applyMatrix4(matrix);
        const okA = projectPointInto(a, projScreen, aN);
        const okB = projectPointInto(b, projScreen, bN);
        const okC = projectPointInto(c, projScreen, cN);
        if (!okA || !okB || !okC) continue;
        rasterizeTri(aN, bN, cN, depthBuffer, resolution);
        triCount++;
      }
    }
  });
  return triCount;
}

/** Rasterize one triangle (NDC coords) into the depth buffer with a scanline fill. */
function rasterizeTri(
  a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
  depthBuffer: Float32Array, resolution: number,
): void {
  // To screen coords (u, v in [0, resolution]).
  const au = (a.x * 0.5 + 0.5) * resolution;
  const av = (a.y * 0.5 + 0.5) * resolution;
  const bu = (b.x * 0.5 + 0.5) * resolution;
  const bv = (b.y * 0.5 + 0.5) * resolution;
  const cu = (c.x * 0.5 + 0.5) * resolution;
  const cv = (c.y * 0.5 + 0.5) * resolution;
  // Depth at each vertex (NDC z in [-1,1] → [0,1]).
  const az = (a.z + 1) * 0.5;
  const bz = (b.z + 1) * 0.5;
  const cz = (c.z + 1) * 0.5;
  // Bounding box (clamped to buffer).
  const minU = Math.max(0, Math.floor(Math.min(au, bu, cu)));
  const maxU = Math.min(resolution - 1, Math.ceil(Math.max(au, bu, cu)));
  const minV = Math.max(0, Math.floor(Math.min(av, bv, cv)));
  const maxV = Math.min(resolution - 1, Math.ceil(Math.max(av, bv, cv)));
  if (minU > maxU || minV > maxV) return;
  // Edge function setup. Note: the sign of `area` depends on winding order; we take the
  // absolute value and use barycentric weights that sum to 1 inside the triangle
  // regardless of winding. A point is inside iff all three weights have the same sign
  // as the area (i.e. w0,w1,w2 ≥ 0 for CCW, or all ≤ 0 for CW). We normalise by
  // flipping the sign of all weights when the area is negative.
  const area = (bu - au) * (cv - av) - (cu - au) * (bv - av);
  if (Math.abs(area) < 1e-6) return; // degenerate
  const invArea = 1 / area;
  const sign = area < 0 ? -1 : 1;
  for (let v = minV; v <= maxV; v++) {
    for (let u = minU; u <= maxU; u++) {
      const w0 = ((bu - u) * (cv - v) - (cu - u) * (bv - v)) * invArea;
      const w1 = ((cu - u) * (av - v) - (au - u) * (cv - v)) * invArea;
      const w2 = 1 - w0 - w1;
      // Inside the triangle iff all weights share the area's sign (i.e. w*sign ≥ 0).
      if (w0 * sign < 0 || w1 * sign < 0 || w2 * sign < 0) continue;
      // Barycentric depth interpolation. NDC z is already perspective-correct (the
      // projection matrix divides by w), so a plain barycentric blend of the vertex
      // NDC-z values is the correct screen-space depth. (The 1/z trick is needed when
      // rasterizing in screen-space with linear z; here NDC z is the value the depth
      // buffer wants directly, and barycentric weights in screen-space are correct for it
      // because NDC z varies linearly in screen space after the perspective divide.)
      const z = w0 * az + w1 * bz + w2 * cz;
      const idx = v * resolution + u;
      if (z < depthBuffer[idx]) depthBuffer[idx] = z;
    }
  }
}

/** Project a world point to NDC; returns null if the point is behind the camera.
 *  Writes into the supplied `out` (caller-owned) to avoid per-vertex allocation. */
function projectPointInto(world: THREE.Vector3, projScreen: THREE.Matrix4, out: THREE.Vector3): boolean {
  // Manual projection with the matrix elements (we need the w-divide + the sign of w
  // for the behind-camera test, which Vector3.applyMatrix4 doesn't expose).
  const px = world.x, py = world.y, pz = world.z;
  const e = projScreen.elements;
  const w = e[3] * px + e[7] * py + e[11] * pz + e[15];
  if (w <= 0) return false; // behind the camera
  const nx = (e[0] * px + e[4] * py + e[8] * pz + e[12]) / w;
  const ny = (e[1] * px + e[5] * py + e[9] * pz + e[13]) / w;
  const nz = (e[2] * px + e[6] * py + e[10] * pz + e[14]) / w;
  out.set(nx, ny, nz);
  return true;
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

// No per-object box cache — the cache invalidation cost (tracking matrixWorld.version
// or geometry changes) outweighs the recomputation for the typical streamed-city object
// set, and a stale cache is a correctness bug. The BVH itself caches the top-level
// bounds (rebuilt only on cull_rebuild), so the per-frame cost is the leaf-box
// recomputation which Three's setFromObject does efficiently.
function boxOf(obj: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(obj);
}

function boxCorners(box: THREE.Box3, out: THREE.Vector3[]): void {
  out[0].set(box.min.x, box.min.y, box.min.z);
  out[1].set(box.max.x, box.min.y, box.min.z);
  out[2].set(box.min.x, box.max.y, box.min.z);
  out[3].set(box.max.x, box.max.y, box.min.z);
  out[4].set(box.min.x, box.min.y, box.max.z);
  out[5].set(box.max.x, box.min.y, box.max.z);
  out[6].set(box.min.x, box.max.y, box.max.z);
  out[7].set(box.max.x, box.max.y, box.max.z);
}

function hasOccluderInTree(obj: THREE.Object3D): boolean {
  if (obj.userData.occluder) return true;
  for (const c of obj.children) if (hasOccluderInTree(c)) return true;
  return false;
}

// `int` alias for readability (TypeScript doesn't have it; this is just a doc hint).
type int = number;
