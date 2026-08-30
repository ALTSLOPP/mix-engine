import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export interface ExtrudeOptions {
  depth: number;
  /** World units per UV tile — keeps PBR texture density consistent across faces. */
  uvScale?: number;
  color?: THREE.ColorRepresentation;
}

/**
 * BuildingExtruder.ts — SVG extrusion with box-projection UVs.
 *
 * 1. SVG path → THREE.Shape   2. ExtrudeGeometry (no bevel)
 * 3. Box-projection UVs per vertex (dominant abs-normal axis: X→YZ, Y→XZ, Z→XY) × uvScale
 *    written into the standard 'uv' attribute, so MeshStandardMaterial tiles correctly and
 *    the mesh exports cleanly.
 *
 * Extruded meshes OWN their geometry/material ({source:'owned'}) and dispose on destroy.
 */
export class BuildingExtruder {
  /** Build a mesh from raw SVG markup. */
  static fromSVG(svgText: string, opts: ExtrudeOptions): THREE.Mesh {
    const parsed = new SVGLoader().parse(svgText);
    const shapes: THREE.Shape[] = [];
    for (const path of parsed.paths) {
      for (const shape of SVGLoader.createShapes(path)) shapes.push(shape);
    }
    if (shapes.length === 0) throw new Error('BuildingExtruder: SVG contained no closed shapes');
    return BuildingExtruder.fromShapes(shapes, opts);
  }

  static fromShapes(shapes: THREE.Shape | THREE.Shape[], opts: ExtrudeOptions): THREE.Mesh {
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: opts.depth,
      bevelEnabled: false,
    });
    geometry.computeVertexNormals();
    BuildingExtruder.applyBoxProjectionUVs(geometry, opts.uvScale ?? 1);

    const material = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xb0b4bb,
      roughness: 0.85,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Replace the geometry's UVs with a per-vertex box (triplanar-style) projection. */
  static applyBoxProjectionUVs(geometry: THREE.BufferGeometry, uvScale: number): void {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const count = pos.count;
    const uv = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const ax = Math.abs(nor.getX(i));
      const ay = Math.abs(nor.getY(i));
      const az = Math.abs(nor.getZ(i));

      let u: number;
      let v: number;
      if (ax >= ay && ax >= az) {
        // X-dominant → project onto YZ.
        u = pz;
        v = py;
      } else if (ay >= ax && ay >= az) {
        // Y-dominant → project onto XZ.
        u = px;
        v = pz;
      } else {
        // Z-dominant → project onto XY.
        u = px;
        v = py;
      }
      uv[i * 2] = u * uvScale;
      uv[i * 2 + 1] = v * uvScale;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  /** Export a mesh to a binary .glb (ArrayBuffer) — lossless mesh-asset export. */
  static async exportGLB(object: THREE.Object3D): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(object, { binary: true });
    return result as ArrayBuffer;
  }

  /** Dev convenience: POST a mesh as .glb to the Vite save endpoint. */
  static async saveGLB(object: THREE.Object3D, name: string): Promise<void> {
    const buffer = await BuildingExtruder.exportGLB(object);
    const res = await fetch(`/api/save-glb?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'model/gltf-binary' },
      body: buffer,
    });
    if (!res.ok) throw new Error(`saveGLB failed: ${res.status} ${res.statusText}`);
  }
}
