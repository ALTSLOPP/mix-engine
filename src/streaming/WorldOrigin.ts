import * as THREE from 'three';

/**
 * WorldOrigin.ts — the single converter between engine space and world space.
 *
 *   worldSpace  = engineSpace + offset
 *   engineSpace = worldSpace  - offset
 *
 * `offset` is the single source of truth for the floating-origin system. It grows as
 * the world shifts to keep live Three.js / Rapier coordinates near zero.
 *
 * Per-frame callers MUST use the in-place `*Into` variants to avoid per-frame allocation.
 */
export class WorldOrigin {
  /** Accumulated shift applied to keep engine space near the origin. */
  readonly offset = new THREE.Vector3(0, 0, 0);

  /** world → engine (allocates). */
  toEngineSpace(worldVec: THREE.Vector3): THREE.Vector3 {
    return worldVec.clone().sub(this.offset);
  }

  /** world → engine (in place, no alloc). */
  toEngineSpaceInto(out: THREE.Vector3, worldVec: THREE.Vector3): THREE.Vector3 {
    return out.copy(worldVec).sub(this.offset);
  }

  /** engine → world (allocates). */
  toWorldSpace(engineVec: THREE.Vector3): THREE.Vector3 {
    return engineVec.clone().add(this.offset);
  }

  /** engine → world (in place, no alloc). */
  toWorldSpaceInto(out: THREE.Vector3, engineVec: THREE.Vector3): THREE.Vector3 {
    return out.copy(engineVec).add(this.offset);
  }

  /** Grow the offset by a floating-origin shift. */
  accumulate(shift: THREE.Vector3): void {
    this.offset.add(shift);
  }
}
