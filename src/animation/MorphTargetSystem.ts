import * as THREE from 'three';

export interface MorphWeightTransition {
  mesh: THREE.Mesh;
  morphIndex: number;
  targetWeight: number;
  currentWeight: number;
  speed: number;
}

export class MorphTargetSystem {
  private readonly transitions = new Set<MorphWeightTransition>();

  setWeight(mesh: THREE.Mesh, name: string, weight: number, duration = 0): boolean {
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) {
      return false;
    }
    const idx = mesh.morphTargetDictionary[name];
    if (idx === undefined) return false;

    const targetVal = THREE.MathUtils.clamp(weight, 0, 1);

    if (duration <= 0) {
      mesh.morphTargetInfluences[idx] = targetVal;
      return true;
    }

    const currentVal = mesh.morphTargetInfluences[idx] ?? 0;
    const speed = Math.abs(targetVal - currentVal) / duration;

    // Remove existing transition for same mesh and morphIndex
    for (const t of this.transitions) {
      if (t.mesh === mesh && t.morphIndex === idx) {
        this.transitions.delete(t);
        break;
      }
    }

    this.transitions.add({
      mesh,
      morphIndex: idx,
      targetWeight: targetVal,
      currentWeight: currentVal,
      speed,
    });

    return true;
  }

  getWeight(mesh: THREE.Mesh, name: string): number | null {
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return null;
    const idx = mesh.morphTargetDictionary[name];
    if (idx === undefined) return null;
    return mesh.morphTargetInfluences[idx] ?? 0;
  }

  listMorphs(mesh: THREE.Mesh): string[] {
    if (!mesh.morphTargetDictionary) return [];
    return Object.keys(mesh.morphTargetDictionary);
  }

  private readonly _meshWorldPos = new THREE.Vector3();

  update(dt: number, cameraPos?: THREE.Vector3): void {
    if (this.transitions.size === 0) return;

    for (const t of this.transitions) {
      if (!t.mesh.morphTargetInfluences) {
        this.transitions.delete(t);
        continue;
      }

      // LOD distance check: if mesh is > 20m from camera, decay weight to save perf
      let effectiveTarget = t.targetWeight;
      if (cameraPos) {
        t.mesh.getWorldPosition(this._meshWorldPos);
        const dist = cameraPos.distanceTo(this._meshWorldPos);
        if (dist > 20.0) {
          effectiveTarget = 0;
        }
      }

      const diff = effectiveTarget - t.currentWeight;
      const step = Math.sign(diff) * t.speed * dt;

      if (Math.abs(step) >= Math.abs(diff)) {
        t.currentWeight = effectiveTarget;
        t.mesh.morphTargetInfluences[t.morphIndex] = effectiveTarget;
        this.transitions.delete(t);
      } else {
        t.currentWeight += step;
        t.mesh.morphTargetInfluences[t.morphIndex] = t.currentWeight;
      }
    }
  }

  clear(): void {
    this.transitions.clear();
  }
}
