import * as THREE from 'three';

/** Merge city triangle meshes, consuming/disposal-owning the input geometries.
 * Primitives such as BoxGeometry are indexed: copying their vertex buffers alone
 * changes the triangles. Expand indices before concatenating the render buffers.
 */
export function mergeCityGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const triangles = geometries.map((geometry) => {
    if (!geometry.index) return geometry;
    const expanded = geometry.toNonIndexed();
    geometry.dispose();
    return expanded;
  });
  const count = triangles.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  let offset = 0;
  for (const geometry of triangles) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    positions.set(geometry.attributes.position.array, offset);
    normals.set(geometry.attributes.normal.array, offset);
    offset += geometry.attributes.position.count * 3;
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return merged;
}
