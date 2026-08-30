/** Non-destructive edge-collapse simplification and independently animated LOD hierarchies. */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js';

export interface MeshOptimizeOptions {
  ratio?: number;
  /** Maximum relative geometric error. The requested ratio is a target, not a guarantee. */
  maxError?: number;
  preserveSkinning?: boolean;
  preserveMorphTargets?: boolean;
  quantizeAttributes?: boolean;
}

export class MeshOptimizer {
  /** Await WASM readiness; preserve original vertex streams and simplify only topology. */
  static async optimizeGeometry(geometry: THREE.BufferGeometry, opts: MeshOptimizeOptions = {}): Promise<THREE.BufferGeometry> {
    if (!Number.isFinite(opts.ratio ?? 1) || !Number.isFinite(opts.maxError ?? 0.01)) {
      throw new Error('Mesh simplification ratio and error must be finite.');
    }
    let clone = geometry.clone();
    clone.userData = { ...geometry.userData };
    const ratio = THREE.MathUtils.clamp(opts.ratio ?? 1, 0.1, 1);
    const position = clone.getAttribute('position');
    if (ratio < 0.999 && position && position.count >= 3) {
      if (!MeshoptSimplifier.supported) throw new Error('Mesh simplification requires WebAssembly.');
      await MeshoptSimplifier.ready;
      // mergeVertices compares vertex attributes, preserving UV/normal/skin seams.
      // Morph streams are not part of its weld key: keep their vertices distinct.
      if (!clone.index && Object.keys(clone.morphAttributes).length === 0) clone = mergeVertices(clone);
      const pos = clone.getAttribute('position');
      const indices = clone.index
        ? Uint32Array.from(clone.index.array)
        : Uint32Array.from({ length: pos.count }, (_, i) => i);
      const positions = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) positions.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
      // Partial draw ranges and non-partitioning groups cannot be rewritten safely.
      const groups = clone.groups.length ? clone.groups : [{ start: 0, count: indices.length, materialIndex: 0 }];
      let end = 0;
      const partition = groups.every(group => {
        const valid = group.start === end && group.count % 3 === 0;
        end = group.start + group.count;
        return valid;
      }) && end === indices.length;
      if (partition && clone.drawRange.start === 0 && clone.drawRange.count >= indices.length) {
        const result: number[] = [];
        const newGroups: THREE.BufferGeometry['groups'] = [];
        for (const group of groups) {
          const source = indices.slice(group.start, group.start + group.count);
          const target = Math.max(3, Math.floor(source.length * ratio / 3) * 3);
          const [simplified] = source.length > target
            ? MeshoptSimplifier.simplify(source, positions, 3, target, Math.max(0, opts.maxError ?? 0.01), ['LockBorder'])
            : [source];
          newGroups.push({ start: result.length, count: simplified.length, materialIndex: group.materialIndex });
          for (const index of simplified) result.push(index);
        }
        clone.setIndex(result);
        if (clone.groups.length) clone.groups = newGroups;
      } else {
        clone.userData.simplificationSkipped = 'Partial draw range or non-partitioning material groups';
      }
    }
    clone.computeBoundingBox();
    clone.computeBoundingSphere();
    return clone;
  }

  /** Source must contain its skeleton bones. All variants share the cloned rig, never the source rig. */
  static async createObjectLOD(sourceObject: THREE.Object3D, opts: {
    lod1Ratio?: number; lod2Ratio?: number; lod1Distance?: number; lod2Distance?: number;
  } = {}): Promise<THREE.Object3D> {
    const sourceNodes = new Set<THREE.Object3D>();
    sourceObject.traverse(node => sourceNodes.add(node));
    sourceObject.traverse(node => {
      if ((node as THREE.SkinnedMesh).isSkinnedMesh && (node as THREE.SkinnedMesh).skeleton.bones.some(bone => !sourceNodes.has(bone))) {
        throw new Error('LOD source hierarchy must include all skeleton bones.');
      }
    });
    let root = cloneSkeleton(sourceObject);
    const meshes: THREE.Mesh[] = [];
    root.traverse(node => { if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh); });
    // Capture first: never mutate children during Object3D.traverse().
    for (const mesh of meshes) {
      const geometries = [mesh.geometry,
        await this.optimizeGeometry(mesh.geometry, { ratio: opts.lod1Ratio ?? 0.6 }),
        await this.optimizeGeometry(mesh.geometry, { ratio: opts.lod2Ratio ?? 0.35 })];
      // Keep original name/transforms on an anchor so animation tracks move every level.
      const anchor = new THREE.Group().copy(mesh, false);
      Object.assign(anchor, {
        geometry: mesh.geometry,
        morphTargetInfluences: mesh.morphTargetInfluences,
        morphTargetDictionary: mesh.morphTargetDictionary,
        skeleton: (mesh as THREE.SkinnedMesh).skeleton,
      });
      const lod = new THREE.LOD();
      lod.name = mesh.name + '_LOD';
      const distances = [0, opts.lod1Distance ?? 25, opts.lod2Distance ?? 60];
      for (let i = 0; i < geometries.length; i++) {
        const level = mesh.clone(false);
        level.name = mesh.name + '_LOD' + i;
        level.geometry = geometries[i];
        level.position.set(0, 0, 0);
        level.quaternion.identity();
        level.scale.set(1, 1, 1);
        level.updateMatrix();
        level.morphTargetInfluences = mesh.morphTargetInfluences;
        lod.addLevel(level, distances[i]);
      }
      const parent = mesh.parent;
      if (parent) { parent.add(anchor); parent.remove(mesh); } else root = anchor;
      for (const child of [...mesh.children]) anchor.add(child);
      anchor.add(lod);
    }
    return root;
  }
}
