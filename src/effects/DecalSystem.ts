import * as THREE from 'three';

/** PlaneGeometry's intrinsic facing direction; reused to orient each decal quad. */
const _planeNormal = new THREE.Vector3(0, 0, 1);

/**
 * DecalSystem.ts — short-lived decal projector for impact marks, blood splats,
 * footprints, scorch marks, etc. A decal is a small textured plane that lies
 * flush against a surface; we use a `THREE.DecalGeometry` (auto-oriented to
 * the surface normal) so a single `decal()` call drops a decal on whatever
 * surface the ray hits.
 *
 * Two ways to spawn:
 *   1. `decalAtHit({ origin, direction, ...})` — raycast and place on hit.
 *   2. `decalAtPoint({ position, normal, ...})` — explicit surface point.
 *
 * The decal is owned by this system and auto-disposed after `lifetime` seconds.
 * Decal visuals are flat planes with a simple unlit material so they compose
 * well with toon / PBR scenes alike.
 */

export interface DecalOptions {
  /** Decal width/height in metres. */
  size?: number;
  /** RGBA tint (multiplied into the texture). */
  color?: THREE.ColorRepresentation;
  /** Texture (DataTexture / Image / canvas). If null, a solid colour is used. */
  texture?: THREE.Texture | null;
  /** Lifetime in seconds; 0 = infinite. */
  lifetime?: number;
  /** Random rotation in radians applied around the surface normal. */
  randomRotation?: boolean;
  /** Texture-repeat count; useful for tiled patterns (concrete, grass). */
  uvScale?: number;
  /** Opacity, 0..1. */
  opacity?: number;
  /** Maximum projection distance from the origin (clips the decal plane). */
  projectionDepth?: number;
  /** Tag the decal so you can clear all of a kind in one call. */
  tag?: string;
}

interface DecalRecord {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  lifetime: number;
  age: number;
  tag: string | undefined;
  colliderHandle?: number;
}

export class DecalSystem {
  private readonly scene: THREE.Scene;
  private readonly physicsWorld: { raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { colliderHandle: number; point: THREE.Vector3; normal?: THREE.Vector3 } | null };
  private readonly decals = new Set<DecalRecord>();

  constructor(scene: THREE.Scene, physicsWorld: DecalSystem['physicsWorld']) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
  }

  /** Raycast from `origin` along `direction`; drop a decal on the first hit. */
  decalAtHit(opts: DecalOptions & { origin: THREE.Vector3; direction: THREE.Vector3; maxDistance?: number }): DecalRecord | null {
    const dir = opts.direction.clone().normalize();
    const hit = this.physicsWorld.raycast(opts.origin, dir, opts.maxDistance ?? 30);
    if (!hit) return null;
    const normal = hit.normal?.clone() ?? dir.clone().multiplyScalar(-1);
    return this.decalAtPoint({ ...opts, position: hit.point.clone(), normal });
  }

  /** Place a decal at an explicit world point / normal. */
  decalAtPoint(opts: DecalOptions & { position: THREE.Vector3; normal: THREE.Vector3 }): DecalRecord {
    const size = opts.size ?? 0.5;
    const n = opts.normal.clone().normalize();

    // A decal is a flat quad lying flush against the surface. We deliberately do NOT
    // use DecalGeometry here: it projects onto the TARGET mesh's geometry, and we don't
    // hold the hit mesh (and skinned/grouped bodies project poorly anyway). An oriented
    // PlaneGeometry works on every surface and never depends on the source mesh.
    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.texture ?? null,
      transparent: true,
      opacity: opts.opacity ?? 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,   // bias toward the camera to avoid z-fighting with the surface
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide,
    });
    // Remember the configured opacity so the end-of-life fade scales from it
    // (update() reads userData.baseOpacity); without this the fade ignored opts.opacity.
    material.userData.baseOpacity = opts.opacity ?? 1;
    if (opts.uvScale && opts.uvScale !== 1 && material.map) {
      material.map.repeat.set(opts.uvScale, opts.uvScale);
    }

    const mesh = new THREE.Mesh(geometry, material);
    // PlaneGeometry faces +Z; rotate it to face along the surface normal.
    mesh.quaternion.setFromUnitVectors(_planeNormal, n);
    if (opts.randomRotation) mesh.rotateZ(Math.random() * Math.PI * 2);
    // Nudge off the surface along the normal so it doesn't z-fight the wall/floor.
    mesh.position.copy(opts.position).addScaledVector(n, 0.01);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.scene.add(mesh);

    const rec: DecalRecord = {
      mesh,
      geometry,
      material,
      lifetime: opts.lifetime ?? 8,
      age: 0,
      tag: opts.tag,
    };
    this.decals.add(rec);
    return rec;
  }

  /** Tick all decals: age, fade, dispose. Call once per frame from the engine loop. */
  update(dt: number): void {
    for (const d of [...this.decals]) {
      d.age += dt;
      const u = d.lifetime > 0 ? d.age / d.lifetime : 0;
      if (d.lifetime > 0 && u >= 1) {
        this.remove(d);
        continue;
      }
      // Fade the last 30% of life.
      if (d.lifetime > 0 && u > 0.7) {
        const mat = d.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, (1 - (u - 0.7) / 0.3) * (mat.userData.baseOpacity ?? 1));
      }
    }
  }

  /** Remove all decals with a given tag, or all of them if no tag is given. */
  clear(tag?: string): void {
    for (const d of [...this.decals]) {
      if (!tag || d.tag === tag) this.remove(d);
    }
  }

  private remove(d: DecalRecord): void {
    this.decals.delete(d);
    d.mesh.removeFromParent();
    d.geometry.dispose();
    d.material.dispose();
  }

  get count(): number { return this.decals.size; }
}
