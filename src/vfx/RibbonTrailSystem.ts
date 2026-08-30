/**
 * RibbonTrailSystem — Dynamic polygon ribbon mesh trails for flight streaks,
 * weapon slashes, speed motion blurs, and aura streaks.
 */

import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';

export interface RibbonTrailConfig {
  lifetime?: number; // duration in seconds (default 0.3)
  color?: string | number; // default '#00ffff'
  tipOffset?: [number, number, number]; // default [0, 1.0, 0]
  baseOffset?: [number, number, number]; // default [0, 0, 0]
  maxPoints?: number; // default 30
  width?: number; // default 0.5
  taperEnd?: number; // width multiplier at tail (0.0 to 1.0, default 0.1)
  opacity?: number; // default 0.8
}

interface RibbonPoint {
  tip: THREE.Vector3;
  base: THREE.Vector3;
  timestamp: number;
}

export class RibbonTrailInstance {
  readonly entityId: EntityId;
  readonly config: Required<RibbonTrailConfig>;
  readonly points: RibbonPoint[] = [];
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshBasicMaterial;
  private isEmitting = true;

  private readonly _tip = new THREE.Vector3();
  private readonly _base = new THREE.Vector3();

  constructor(entityId: EntityId, config: RibbonTrailConfig = {}) {
    this.entityId = entityId;
    this.config = {
      lifetime: config.lifetime ?? 0.3,
      color: config.color ?? '#00ffff',
      tipOffset: config.tipOffset ?? [0, 1.0, 0],
      baseOffset: config.baseOffset ?? [0, 0, 0],
      maxPoints: config.maxPoints ?? 30,
      width: config.width ?? 0.5,
      taperEnd: config.taperEnd ?? 0.1,
      opacity: config.opacity ?? 0.8,
    };

    const maxVertices = this.config.maxPoints * 2;
    const positions = new Float32Array(maxVertices * 3);
    const uvs = new Float32Array(maxVertices * 2);
    const indices = new Uint32Array(Math.max(0, this.config.maxPoints - 1) * 6);
    for (let i = 0; i < this.config.maxPoints - 1; i++) {
      const v = i * 2;
      const o = i * 6;
      indices[o] = v;
      indices[o + 1] = v + 1;
      indices[o + 2] = v + 2;
      indices[o + 3] = v + 1;
      indices[o + 4] = v + 3;
      indices[o + 5] = v + 2;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    this.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.config.color),
      transparent: true,
      opacity: this.config.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  setEmitting(emitting: boolean): void {
    this.isEmitting = emitting;
  }

  update(worldMesh: THREE.Object3D, now = performance.now()): void {
    // 1. Calculate current tip and base in world space if emitting
    if (this.isEmitting) {
      this._tip.set(...this.config.tipOffset).applyMatrix4(worldMesh.matrixWorld);
      this._base.set(...this.config.baseOffset).applyMatrix4(worldMesh.matrixWorld);

      this.points.unshift({
        tip: this._tip.clone(),
        base: this._base.clone(),
        timestamp: now,
      });
    }

    // 2. Remove points older than lifetime
    const expireBefore = now - this.config.lifetime * 1000;
    while (this.points.length > 0 && this.points[this.points.length - 1].timestamp < expireBefore) {
      this.points.pop();
    }

    if (this.points.length > this.config.maxPoints) {
      this.points.splice(this.config.maxPoints);
    }

    // 3. Rebuild mesh geometry buffers
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const uvAttr = this.geometry.attributes.uv as THREE.BufferAttribute;
    const uvArr = uvAttr.array as Float32Array;

    const count = this.points.length;
    for (let i = 0; i < count; i++) {
      const pt = this.points[i];
      const vIdx = i * 2;
      const progress = count > 1 ? i / (count - 1) : 0; // 0 = newest, 1 = oldest
      const taper = THREE.MathUtils.lerp(1.0, this.config.taperEnd, progress) * this.config.width;

      // Interpolate center toward tip/base for taper
      const midX = (pt.tip.x + pt.base.x) * 0.5;
      const midY = (pt.tip.y + pt.base.y) * 0.5;
      const midZ = (pt.tip.z + pt.base.z) * 0.5;

      // Tip vertex
      posArr[vIdx * 3] = THREE.MathUtils.lerp(midX, pt.tip.x, taper);
      posArr[vIdx * 3 + 1] = THREE.MathUtils.lerp(midY, pt.tip.y, taper);
      posArr[vIdx * 3 + 2] = THREE.MathUtils.lerp(midZ, pt.tip.z, taper);
      uvArr[vIdx * 2] = progress;
      uvArr[vIdx * 2 + 1] = 1.0;

      // Base vertex
      posArr[(vIdx + 1) * 3] = THREE.MathUtils.lerp(midX, pt.base.x, taper);
      posArr[(vIdx + 1) * 3 + 1] = THREE.MathUtils.lerp(midY, pt.base.y, taper);
      posArr[(vIdx + 1) * 3 + 2] = THREE.MathUtils.lerp(midZ, pt.base.z, taper);
      uvArr[(vIdx + 1) * 2] = progress;
      uvArr[(vIdx + 1) * 2 + 1] = 0.0;
    }

    posAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, count - 1) * 6);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class RibbonTrailManager {
  private readonly trails = new Map<EntityId, RibbonTrailInstance>();

  /**
   * Attaches or updates a ribbon trail on an entity.
   */
  attachTrail(scene: THREE.Scene, entityId: EntityId, config?: RibbonTrailConfig): RibbonTrailInstance {
    this.removeTrail(scene, entityId);

    const instance = new RibbonTrailInstance(entityId, config);
    this.trails.set(entityId, instance);
    scene.add(instance.mesh);
    return instance;
  }

  /**
   * Toggles emitting state for an entity's trail.
   */
  setEmitting(entityId: EntityId, emitting: boolean): void {
    const trail = this.trails.get(entityId);
    if (trail) trail.setEmitting(emitting);
  }

  /**
   * Removes and disposes a ribbon trail from an entity.
   */
  removeTrail(scene: THREE.Scene, entityId: EntityId): boolean {
    const instance = this.trails.get(entityId);
    if (!instance) return false;

    scene.remove(instance.mesh);
    instance.dispose();
    this.trails.delete(entityId);
    return true;
  }

  /**
   * Updates all active ribbon trails.
   */
  update(sceneManager: SceneManager, now = performance.now()): void {
    for (const [entityId, trail] of this.trails.entries()) {
      const rb = sceneManager.getRigidBody(entityId);
      if (rb) {
        trail.update(rb.mesh, now);
      } else {
        trail.mesh.removeFromParent();
        trail.dispose();
        this.trails.delete(entityId);
      }
    }
  }

  /**
   * Cleans up all trails and meshes.
   */
  clear(scene?: THREE.Scene): void {
    for (const trail of this.trails.values()) {
      if (scene) scene.remove(trail.mesh);
      trail.dispose();
    }
    this.trails.clear();
  }
}
