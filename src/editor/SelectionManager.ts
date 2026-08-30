import * as THREE from 'three';
import type { EntityId, SceneManager } from '../ecs/SceneManager';

export class SelectionManager {
  private readonly ids = new Set<EntityId>();
  private _primary: EntityId | null = null;
  get primary(): EntityId | null { return this._primary; }
  get size(): number { return this.ids.size; }
  list(): EntityId[] { return [...this.ids]; }
  has(id: EntityId): boolean { return this.ids.has(id); }
  set(ids: Iterable<EntityId>, primary?: EntityId | null): void {
    this.ids.clear();
    for (const id of ids) this.ids.add(id);
    this._primary = primary !== undefined ? primary : this.ids.size ? [...this.ids].at(-1)! : null;
    if (this._primary !== null) this.ids.add(this._primary);
  }
  add(id: EntityId): void { this.ids.add(id); this._primary = id; }
  toggle(id: EntityId): void {
    if (this.ids.delete(id)) this._primary = this.ids.size ? [...this.ids].at(-1)! : null;
    else this.add(id);
  }
  clear(): void { this.ids.clear(); this._primary = null; }
  prune(scene: SceneManager): void {
    const primary = this._primary !== null && scene.hasEntity(this._primary) ? this._primary : undefined;
    this.set([...this.ids].filter((id) => scene.hasEntity(id)), primary);
  }
  selectScreenRect(scene: SceneManager, camera: THREE.Camera, width: number, height: number, x0: number, y0: number, x1: number, y1: number, additive = false): EntityId[] {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    if (!additive) this.clear();
    const center = new THREE.Vector3();
    const box = new THREE.Box3();
    for (let i = 0; i < scene.rigidBodyList.length; i++) {
      const id = scene.entityAtIndex(i);
      if (id === undefined) continue;
      box.setFromObject(scene.rigidBodyList[i].mesh).getCenter(center).project(camera);
      if (center.z < -1 || center.z > 1) continue;
      const x = (center.x * 0.5 + 0.5) * width, y = (-center.y * 0.5 + 0.5) * height;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) this.add(id);
    }
    return this.list();
  }
}
