import * as THREE from 'three';
import {
  HlodImpostorGenerator,
  type HlodClusterItem,
  type HlodConfig,
  type ImpostorAtlas,
  type ImpostorBakeOptions,
} from './HlodImpostorGenerator';

export interface HlodClusterHandle {
  id: string;
  /** The batched impostor mesh living in the scene. */
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  boundingRadius: number;
  nearDistance: number;
  farDistance: number;
  /** Full-detail objects this cluster stands in for. Hidden while the impostor shows. */
  sources: THREE.Object3D[];
  atlas: ImpostorAtlas | null;
  /** Whether the impostor (rather than the source objects) is currently visible. */
  impostorVisible: boolean;
}

/**
 * HlodSystem.ts — the runtime half of hierarchical LOD.
 *
 * {@link HlodImpostorGenerator} could bake an atlas and batch billboards, but nothing
 * put the result in the scene and — critically — nothing ever *swapped* on
 * `nearDistance` / `farDistance`, so those two fields were decoration. This system owns
 * the clusters, hides the full-detail sources once the camera is past `nearDistance`,
 * shows them again when it comes back, and culls the impostor entirely past
 * `farDistance`.
 *
 * Distance is measured to the cluster's bounding sphere, not its centre, so a large
 * cluster doesn't pop while the camera is still inside it.
 */
export class HlodSystem {
  private readonly clusters = new Map<string, HlodClusterHandle>();
  private readonly _camPos = new THREE.Vector3();

  /** Hysteresis band (metres) so a camera hovering on the threshold doesn't flicker. */
  static readonly SWITCH_HYSTERESIS = 4;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer?: THREE.WebGLRenderer,
  ) {}

  get count(): number {
    return this.clusters.size;
  }

  list(): HlodClusterHandle[] {
    return [...this.clusters.values()];
  }

  get(id: string): HlodClusterHandle | undefined {
    return this.clusters.get(id);
  }

  /**
   * Bake `prototype` into an impostor atlas and batch `items` into one cluster mesh.
   * Requires a renderer; without one the cluster is built untextured and a warning is
   * logged rather than silently shipping grey cards.
   */
  createCluster(
    id: string,
    items: HlodClusterItem[],
    prototype: THREE.Object3D | null,
    config: HlodConfig = {},
    bakeOptions: ImpostorBakeOptions = {},
  ): HlodClusterHandle | null {
    if (items.length === 0) return null;
    this.removeCluster(id);

    let atlas: ImpostorAtlas | null = null;
    if (prototype && this.renderer) {
      atlas = HlodImpostorGenerator.renderImpostorAtlas(this.renderer, prototype, bakeOptions);
    } else if (prototype) {
      console.warn(`[HlodSystem] cluster '${id}' has a prototype but no renderer — impostor will be untextured`);
    }

    const result = HlodImpostorGenerator.generateCluster(items, {
      ...config,
      atlas: atlas ?? config.atlas,
    });

    result.mesh.name = `hlod_${id}`;
    result.mesh.userData.hlod = true;
    // The impostor is already a distance LOD; excluding it from the culling system's
    // occlusion pass avoids paying twice for the same decision.
    result.mesh.userData.cullExclude = true;
    result.mesh.visible = false;
    this.scene.add(result.mesh);

    const handle: HlodClusterHandle = {
      id,
      mesh: result.mesh,
      center: result.center.clone(),
      boundingRadius: result.boundingRadius,
      nearDistance: result.nearDistance,
      farDistance: result.farDistance,
      sources: [],
      atlas,
      impostorVisible: false,
    };
    this.clusters.set(id, handle);
    return handle;
  }

  /**
   * Register the full-detail objects the cluster replaces. They are hidden whenever the
   * impostor is showing and restored when the camera comes back inside `nearDistance`.
   */
  bindSources(id: string, sources: THREE.Object3D[]): boolean {
    const cluster = this.clusters.get(id);
    if (!cluster) return false;
    cluster.sources = sources;
    return true;
  }

  removeCluster(id: string): boolean {
    const cluster = this.clusters.get(id);
    if (!cluster) return false;
    // Never leave the sources hidden behind a cluster that no longer exists.
    for (const src of cluster.sources) src.visible = true;
    this.scene.remove(cluster.mesh);
    cluster.mesh.geometry.dispose();
    const mat = cluster.mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
    cluster.atlas?.dispose();
    this.clusters.delete(id);
    return true;
  }

  /**
   * Per-frame distance evaluation. Cheap: one distance per cluster, no per-item work.
   * Call before `viewport.render()`.
   */
  update(camera: THREE.Camera): void {
    if (this.clusters.size === 0) return;
    camera.getWorldPosition(this._camPos);
    const h = HlodSystem.SWITCH_HYSTERESIS;

    for (const cluster of this.clusters.values()) {
      // Distance to the sphere surface, so a camera inside a big cluster reads 0.
      const dist = Math.max(0, this._camPos.distanceTo(cluster.center) - cluster.boundingRadius);

      // Beyond farDistance nothing is drawn at all.
      if (dist > cluster.farDistance) {
        cluster.mesh.visible = false;
        this.setSourcesVisible(cluster, false);
        cluster.impostorVisible = false;
        continue;
      }

      // Hysteresis: switch to impostor past near+h, back to full detail before near-h.
      const wantImpostor = cluster.impostorVisible
        ? dist > cluster.nearDistance - h
        : dist > cluster.nearDistance + h;

      cluster.mesh.visible = wantImpostor;
      this.setSourcesVisible(cluster, !wantImpostor);
      cluster.impostorVisible = wantImpostor;
    }
  }

  dispose(): void {
    for (const id of [...this.clusters.keys()]) this.removeCluster(id);
  }

  private setSourcesVisible(cluster: HlodClusterHandle, visible: boolean): void {
    for (const src of cluster.sources) {
      if (src.visible !== visible) src.visible = visible;
    }
  }
}
