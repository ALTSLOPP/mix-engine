import type { Object3D, BufferGeometry, Material } from 'three';

/** Only for procedurally-owned trees. Asset-cache instances must use their own
 * release/dispose method first; borrowed textures are never disposed here. */
export function disposeOwnedObject(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse(object => {
    const mesh = object as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.clear();
}
