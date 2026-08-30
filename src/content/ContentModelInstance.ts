import * as THREE from 'three';
import type { AssetManifest } from '../animation/AssetManifest';
import type { AssetCache } from '../animation/AssetCache';

/** A resource-sharing asset checkout with async-safe teardown and metre-scale bounds. */
export class ContentModelInstance {
  readonly root = new THREE.Group();
  readonly ready: Promise<boolean>;
  private disposed = false;
  private checkedOut = false;
  private readonly materials: THREE.Material[] = [];

  constructor(
    manifest: Pick<AssetManifest, 'load'>,
    private readonly cache: Pick<AssetCache, 'release'>,
    private readonly assetId: string,
    size: number,
    overlay = false,
  ) {
    this.root.name = `ContentModel:${assetId}`;
    this.ready = manifest.load(assetId).then(model => {
      if (this.disposed) { cache.release(assetId); return false; }
      this.checkedOut = true;
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const extent = bounds.getSize(new THREE.Vector3());
      const longest = Math.max(extent.x, extent.y, extent.z);
      if (!(longest > 0) || !Number.isFinite(longest)) throw new Error('Model has empty or invalid bounds');
      const scale = size / longest;
      const center = bounds.getCenter(new THREE.Vector3());
      model.scale.multiplyScalar(scale);
      model.position.multiplyScalar(scale).addScaledVector(center, -scale);
      this.root.add(model);
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = !overlay;
        object.receiveShadow = !overlay;
        if (!overlay) return;
        object.frustumCulled = false;
        object.renderOrder = 1000;
        // Do not change the canonical/shared materials used by world pickups.
        const clone = (source: THREE.Material) => {
          const material = source.clone();
          material.depthTest = false; material.depthWrite = false;
          this.materials.push(material);
          return material;
        };
        object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
      });
      return true;
    }).catch(error => {
      if (!this.disposed) console.warn(`[FPS content] Unable to load ${assetId}:`, error);
      this.dispose();
      return false;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    for (const material of this.materials) material.dispose();
    this.materials.length = 0;
    if (this.checkedOut) { this.checkedOut = false; this.cache.release(this.assetId); }
  }
}
