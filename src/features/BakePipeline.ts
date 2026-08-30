import * as THREE from 'three';
import { RaycastIndex } from '../physics/RaycastIndex';

/**
 * BakePipeline.ts — a deterministic, world-space vertex ambient-occlusion baker.
 *
 * The visual moat strategy is "bake instead of real-time heroics": contact darkening,
 * crevice and ground-plane occlusion are sampled ONCE and stamped into each static
 * mesh's vertex colors — no per-frame SSAO aliasing, no screen-space cost at runtime.
 *
 * Determinism is the point (it's what makes a bake *diffable*):
 *   - a seeded PRNG (mulberry32) drives the hemisphere sampling, so the same scene
 *     input + seed → the bit-identical AO, bake after bake;
 *   - rays are fired against the same geometry with the same sample count.
 * An agent can bake, iterate on lighting, re-bake, and diff the two vertex-color
 * buffers (or their screenshots) in SENSORIUM — screen-space AO could never do that.
 *
 * Self-occlusion is excluded: when shading a mesh's own vertices, that mesh's own
 * triangles are skipped (`RaycastIndex.excludeUuids`), so a flat box doesn't bake black
 * just from its own surface. Contact AO *from other geometry* (a ground plane catching
 * a dropped prop) is fully captured.
 */

export interface VertexAOOptions {
  /** Hemisphere ray samples per vertex. More = smoother AO, linear cost. Default 64. */
  samples?: number;
  /** Max ray length in world units. Short → tight contact AO; long → soft global feel. Default 1.0. */
  distance?: number;
  /** AO strength multiplier [0,1]; 0 disables. Default 1. */
  strength?: number;
  /** PRNG seed — the SAME seed + same world ⇒ identical bake. Default 1337. */
  seed?: number;
  /** Only bake meshes whose uuid is in this set. Default: all supplied meshes. */
  onlyUuids?: ReadonlySet<string>;
}

export interface BakeStats {
  meshesBaked: number;
  verticesBaked: number;
  raysCast: number;
  samplesPerVertex: number;
  distance: number;
  seed: number;
  /** Concise line the agent can paste to reproduce the identical bake. */
  recipe: string;
}

/** mulberry32 — small, deterministic, seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _tangent = new THREE.Vector3();
const _bitangent = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Cosine-weighted random hemisphere direction around `normal`, written into `_dir`. */
function sampleHemisphere(normal: THREE.Vector3, rnd: () => number): void {
  // Uniform point in the unit disc; its z lifts it onto the hemisphere (cosine-weighted).
  let u = 2 * rnd() - 1;
  let v = 2 * rnd() - 1;
  let r2 = u * u + v * v;
  // Rejection-sample outliers (keeps the distribution exact; deterministic given seed).
  while (r2 > 1) {
    u = 2 * rnd() - 1;
    v = 2 * rnd() - 1;
    r2 = u * u + v * v;
  }
  const z = Math.sqrt(Math.max(0, 1 - r2));

  // Orthonormal frame around the normal.
  if (Math.abs(normal.y) < 0.999) _tangent.set(normal.z, 0, -normal.x).normalize();
  else _tangent.set(1, 0, 0);
  _bitangent.crossVectors(normal, _tangent).normalize();

  _dir
    .copy(_tangent).multiplyScalar(u)
    .addScaledVector(_bitangent, v)
    .addScaledVector(normal, z)
    .normalize();
}

/**
 * Bake deterministic vertex ambient occlusion for a set of static meshes, writing a
 * `color` attribute (1=open sky → 0=fully occluded) and enabling `material.vertexColors`
 * via a per-instance material clone where it wasn't already enabled. The occlusion
 * geometry is the same set of meshes (`RaycastIndex`), so props/terrain darken each other
 * across meshes; each mesh's own triangles are excluded to avoid self-occlusion.
 */
export function bakeVertexAO(
  meshes: THREE.Mesh[],
  options: VertexAOOptions = {},
): BakeStats {
  const samples = Math.min(512, Math.max(1, Math.round(options.samples ?? 64)));
  const distance = Math.min(64, Math.max(0.05, options.distance ?? 1.0));
  const strength = Math.min(1, Math.max(0, options.strength ?? 1.0));
  const seed = options.seed ?? 1337;
  const onlyUuids = options.onlyUuids;
  const rnd = mulberry32(seed);

  const index = new RaycastIndex();
  index.rebuildFrom(meshes);

  const raycaster = new THREE.Raycaster();
  raycaster.far = distance;

  let meshesBaked = 0;
  let verticesBaked = 0;
  let raysCast = 0;

  const origin = new THREE.Vector3();
  const worldPos = new THREE.Vector3();
  const worldNrm = new THREE.Vector3(0, 0, 1);

  for (const mesh of meshes) {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) continue;
    if (onlyUuids && !onlyUuids.has(mesh.uuid)) continue;

    const geom = mesh.geometry;
    mesh.updateMatrixWorld(true);
    const posAttr = geom.attributes.position as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const verts = posAttr.count;
    const nrmAttr = geom.attributes.normal as THREE.BufferAttribute | undefined;
    const nrm = nrmAttr ? (nrmAttr.array as Float32Array) : null;

    // (Re)create the color attribute at vertex granularity, preserving baked reuse.
    const existing = geom.attributes.color as THREE.BufferAttribute | undefined;
    const colors =
      existing && existing.count >= verts
        ? (existing.array as Float32Array)
        : new Float32Array(verts * 3).fill(1);
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    mesh.userData.bakedColorAttribute = true;

    // Exclude this mesh from its own sample rays (avoid self-occlusion).
    index.excludeUuids.clear();
    index.excludeUuids.add(mesh.uuid);

    for (let v = 0; v < verts; v++) {
      worldPos.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]).applyMatrix4(mesh.matrixWorld);
      if (nrm) {
        worldNrm
          .set(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2])
          .transformDirection(mesh.matrixWorld)
          .normalize();
      }

      let occluded = 0;
      for (let s = 0; s < samples; s++) {
        sampleHemisphere(worldNrm, rnd);
        origin.copy(worldPos).addScaledVector(worldNrm, 0.001);
        raycaster.ray.origin.copy(origin);
        raycaster.ray.direction.copy(_dir);
        if (index.raycastFirst(raycaster)) occluded++;
      }
      raysCast += samples;

      const ao = 1 - strength * (occluded / samples);
      const ci = v * 3;
      colors[ci] = ao;
      colors[ci + 1] = ao;
      colors[ci + 2] = ao;
      verticesBaked++;
    }

    ensureVertexColors(mesh);
    meshesBaked++;
  }

  return {
    meshesBaked,
    verticesBaked,
    raysCast,
    samplesPerVertex: samples,
    distance,
    seed,
    recipe: `bake_ao {samples:${samples},distance:${distance},strength:${strength},seed:${seed}}`,
  };
}

/**
 * Enable vertex colors on a per-instance material clone (never the shared cache
 * material), stashing the original so it can be restored. Foliage/terrain that already
 * use `vertexColors: true` are left untouched.
 */
function ensureVertexColors(mesh: THREE.Mesh): void {
  const mats = Array.isArray(mesh.material) ? (mesh.material as THREE.Material[]) : [mesh.material as THREE.Material];
  const owned: THREE.Material[] = [];
  for (const mat of mats) {
    if (!mat || !(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
    const std = mat as THREE.MeshStandardMaterial;
    if (std.vertexColors) continue;
    const clone = std.clone();
    clone.vertexColors = true;
    (clone as THREE.MeshStandardMaterial & { userData: Record<string, unknown> }).userData.bakedAO = true;
    owned.push(clone);
  }
  if (owned.length) {
    const oldMats = mats.slice();
    mesh.userData.originalMaterials = oldMats;
    mesh.material = Array.isArray(mesh.material) ? owned : owned[0];
  }
}

/**
 * Reverse a vertex-AO bake: restore the original (shared) materials and drop the baked
 * `color` attribute, so the mesh returns to its pre-bake state and shared cache materials
 * are never left half-baked. Idempotent — meshes that weren't baked are left untouched
 * (native vertex colors, e.g. foliage, survive).
 * @returns The number of meshes un-baked.
 */
export function flushBakedAO(meshes: THREE.Object3D[]): number {
  let flushed = 0;
  for (const root of meshes) {
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const orig = mesh.userData?.originalMaterials as THREE.Material[] | undefined;
      if (!orig) return;
      // Dispose the baked clones before restoring the originals.
      const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of current) if (m !== orig[0]) m.dispose();
      mesh.material = orig.length === 1 ? orig[0] : orig;
      delete mesh.userData.originalMaterials;
      // Only drop the attribute if WE added it (a mesh's native vertex colors survive).
      if (mesh.userData?.bakedColorAttribute) {
        mesh.geometry.deleteAttribute('color');
        delete mesh.userData.bakedColorAttribute;
      }
      flushed++;
    });
  }
  return flushed;
}
