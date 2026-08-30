import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { DOJO_NAME, DOJO_TAG } from './DojoScene';

/**
 * VillageScene.ts — the default landing scene's backdrop. Replaces the procedural dojo
 * with the imported "Naruto hidden village" GLB map; Ayo stands in the town square.
 *
 * The map is one fixed (non-falling) RigidBodyComponent wrapping the loaded GLB Group
 * (see the 'mapModel' builder in builders.ts), so the outliner shows a single
 * "Naruto Hidden Village" entry the user can select / move / scale as a whole.
 */

export const VILLAGE_NAME = 'Naruto Hidden Village';
export const VILLAGE_TAG = 'village-scene';
export const VILLAGE_ASSET_ID = 'NarutoVillage';

/** Uniform scale applied to the GLB. The raw export is ~4 m across; ×40 makes an ~170 m
 *  level. */
export const VILLAGE_SCALE = 160;
/** Where the map's origin sits in the world. */
export const VILLAGE_ORIGIN = new THREE.Vector3(0, 0, 0);
/** Town-square spot (world XZ) — open paved ground in front of the Hokage tower. The
 *  Y (ground height) is found at runtime by raycasting the map, since it depends on scale. */
export const VILLAGE_SQUARE_X = 272;
export const VILLAGE_SQUARE_Z = -464;
const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _w = new THREE.Vector3();

/** Find the village map's rigid body in the scene, or null. */
function findVillage(engine: Engine): RigidBodyComponent | null {
  for (const rb of engine.sceneManager.rigidBodyList) {
    if (rb.mesh?.userData?.[VILLAGE_TAG] || rb.mesh?.name === VILLAGE_NAME) return rb;
  }
  return null;
}

/** True if the village map is already in the scene (idempotent ensure). */
export function isVillagePresent(engine: Engine): boolean {
  return findVillage(engine) !== null;
}

/** Remove leftover boot fixtures the village replaces: the legacy dojo and the default
 *  grey 50×50 ground plane (the village has its own ground). */
function removeReplacedFixtures(engine: Engine): void {
  const sm = engine.sceneManager;
  for (const rb of [...sm.rigidBodyList]) {
    const id = sm.entityOf(rb);
    if (id == null) continue;
    const isDojo = rb.mesh?.name === DOJO_NAME || rb.mesh?.userData?.[DOJO_TAG];
    const bp = sm.getBlueprint(id);
    const isGround = bp?.kind === 'box'
      && (bp.params as { hx?: number }).hx === 50
      && (bp.params as { hz?: number }).hz === 50
      && (bp.params as { dynamic?: boolean }).dynamic === false;
    if (isDojo || isGround) sm.requestDestroy(id);
  }
  sm.flushDeferredOperations();
}

/**
 * Idempotently make sure the village map exists in the scene. Async because the GLB must
 * be loaded into the AssetCache before the (synchronous) builder checks it out. Returns
 * true if it was actually built this call, false if it was already present.
 */
export async function ensureVillage(engine: Engine): Promise<boolean> {
  if (isVillagePresent(engine)) return false;
  removeReplacedFixtures(engine);
  await engine.manifest.preload([VILLAGE_ASSET_ID]);
  const id = engine.sceneManager.spawnNow(
    VILLAGE_ORIGIN,
    { kind: 'mapModel', params: { assetId: VILLAGE_ASSET_ID, scale: VILLAGE_SCALE, collider: 'trimesh' } },
    { rootMotion: false },
  );
  const rb = engine.sceneManager.getRigidBody(id);
  if (rb) {
    rb.mesh.name = VILLAGE_NAME;
    rb.mesh.userData[VILLAGE_TAG] = true;
    rb.mesh.userData['engine-name'] = VILLAGE_NAME;
  }
  return true;
}

/** Lowest world-Y of the character's foot bones (true rendered foot height). */
function footWorldY(rb: RigidBodyComponent): number {
  rb.mesh.updateMatrixWorld(true);
  let y = Infinity;
  rb.mesh.traverse((o) => {
    if (o.name === 'LeftFoot' || o.name === 'RightFoot') { o.getWorldPosition(_w); y = Math.min(y, _w.y); }
  });
  return y;
}

/** Ground height of the map directly below (x, z), via a downward ray. */
function groundYAt(village: RigidBodyComponent, x: number, z: number): number | null {
  _ray.set(_origin.set(x, 200, z), _down);
  const hits = _ray.intersectObject(village.mesh, true);
  return hits.length ? hits[0].point.y : null;
}

/**
 * Stand the character in the town square, dropping its feet onto the ground.
 * Sizing is not this function's business — the character builder has already scaled the
 * model to its locked height via ScaleNormalizer.
 * Returns the final world position, or null if the village/character isn't ready.
 */
export function placeCharacterInSquare(engine: Engine, rb: RigidBodyComponent): THREE.Vector3 | null {
  const village = findVillage(engine);
  if (!village) return null;

  // 1. No scale correction here any more. This used to re-derive a height from the
  //    skeleton because the old bbox-based normalize was defeated by the GLB's internal
  //    Root_Scale — ScaleNormalizer measures with the root scale factored out, so the
  //    character builder already stands every character at its locked height. Rescaling
  //    again here layered a second factor on top (~1.23x) and flattened the roster's
  //    per-character heights back to one number.

  // 2. Find the square ground and drop the character's feet onto it.
  const groundY = groundYAt(village, VILLAGE_SQUARE_X, VILLAGE_SQUARE_Z) ?? 0;
  rb.mesh.position.set(VILLAGE_SQUARE_X, 0, VILLAGE_SQUARE_Z);
  rb.mesh.updateMatrixWorld(true);
  const footDrop = rb.mesh.position.y - footWorldY(rb); // how far feet sit below the body origin
  const pos = new THREE.Vector3(VILLAGE_SQUARE_X, groundY + footDrop, VILLAGE_SQUARE_Z);
  rb.teleport(pos, rb.mesh.quaternion);
  return pos;
}
