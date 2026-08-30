import * as THREE from 'three';

/**
 * compoundCollider.ts — derive a COMPOUND box collider from a model's meshes.
 *
 * The spec wants spawning to "auto-calculate the Rapier physics collision compound shape
 * based on the mesh bounding box" — so an agent never spawns a raw mesh with no physics.
 * A single bounding box is cheap but loose (a car's box swallows the gap under the chassis);
 * a per-mesh box set hugs the silhouette far better while staying convex + fast. This module
 * computes those boxes in the model root's LOCAL (body) frame so the builder can attach each
 * as an offset cuboid collider on the entity's rigid body.
 *
 * Pure (THREE only) + deterministic → unit-testable without a physics world.
 */

export interface CompoundBox {
  /** Half-extents (metres) in the body's local frame. */
  half: { x: number; y: number; z: number };
  /** Centre offset from the body origin (metres) in the body's local frame. */
  center: { x: number; y: number; z: number };
}

export interface CompoundOptions {
  /** Max boxes to emit (keeps the broadphase cheap). Excess small meshes are dropped. */
  maxBoxes?: number;
  /** Skip meshes whose local AABB volume is below this (filters tiny detail meshes). */
  minVolume?: number;
  /** Clamp each half-extent to at least this (avoids zero-thickness colliders). */
  minHalf?: number;
}

const _box = new THREE.Box3();
const _box2 = new THREE.Box3();
const _mat = new THREE.Matrix4();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/**
 * Compute compound boxes for `root` in ROOT-LOCAL space. `root` is expected to be already
 * positioned/scaled and `updateMatrixWorld()`-ed by the caller (or we do it here). Helper
 * meshes (name ending in 'Helper') and non-geometry nodes are ignored. Falls back to the
 * whole-object AABB if no qualifying mesh is found.
 */
export function computeCompoundBoxes(root: THREE.Object3D, opts: CompoundOptions = {}): CompoundBox[] {
  const maxBoxes = opts.maxBoxes ?? 16;
  const minVolume = opts.minVolume ?? 1e-4;
  const minHalf = opts.minHalf ?? 0.02;

  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const relativeMatrix = new THREE.Matrix4();

  const candidates: Array<{ box: CompoundBox; volume: number }> = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh || !mesh.geometry) return;
    if (mesh.name.endsWith('Helper')) return;
    const geom = mesh.geometry as THREE.BufferGeometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox) return;
    
    // Transform geometry-local bounding box directly to root-local space in a single step.
    relativeMatrix.multiplyMatrices(rootInv, mesh.matrixWorld);
    _box.copy(geom.boundingBox).applyMatrix4(relativeMatrix);
    
    _box.getSize(_size);
    _box.getCenter(_center);
    const hx = Math.max(_size.x / 2, minHalf);
    const hy = Math.max(_size.y / 2, minHalf);
    const hz = Math.max(_size.z / 2, minHalf);
    const volume = _size.x * _size.y * _size.z;
    if (volume < minVolume) return;
    candidates.push({
      box: { half: { x: hx, y: hy, z: hz }, center: { x: _center.x, y: _center.y, z: _center.z } },
      volume,
    });
  });

  if (candidates.length === 0) return [wholeObjectBox(root, rootInv, minHalf)];

  // Keep the largest meshes (they dominate the silhouette + physics response).
  candidates.sort((a, b) => b.volume - a.volume);
  return candidates.slice(0, maxBoxes).map((c) => c.box);
}

/** Single AABB of the whole object, in root-local space — the simple fallback. */
function wholeObjectBox(root: THREE.Object3D, rootInv: THREE.Matrix4, minHalf: number): CompoundBox {
  _box2.makeEmpty();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh || !mesh.geometry) return;
    if (mesh.name.endsWith('Helper')) return;
    const geom = mesh.geometry as THREE.BufferGeometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox) return;
    _mat.multiplyMatrices(rootInv, mesh.matrixWorld);
    _box.copy(geom.boundingBox).applyMatrix4(_mat);
    _box2.union(_box);
  });
  if (_box2.isEmpty()) {
    // No mesh geometry at all — emit a minimal unit box at the origin.
    _box2.set(
      new THREE.Vector3(-minHalf, -minHalf, -minHalf),
      new THREE.Vector3(minHalf, minHalf, minHalf),
    );
  }
  _box2.getSize(_size);
  _box2.getCenter(_center);
  return {
    half: {
      x: Math.max(_size.x / 2, minHalf),
      y: Math.max(_size.y / 2, minHalf),
      z: Math.max(_size.z / 2, minHalf),
    },
    center: { x: _center.x, y: _center.y, z: _center.z },
  };
}
