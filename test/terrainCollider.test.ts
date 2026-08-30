import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Heightmap } from '../src/terrain/Heightmap';
import { TerrainField, packRapierHeights } from '../src/terrain/TerrainField';
import { SplatMap } from '../src/terrain/SplatMap';
import type { RigidBodyComponent } from '../src/physics/RigidBodyComponent';

/**
 * Phase 1 (async terrain physics): the terrain collider is now a Rapier HEIGHTFIELD, rebuilt
 * via an atomic create-before-remove swap and debounced off the stroke-end critical path.
 * These tests pin the one real risk (heightfield orientation vs. our grid) and the two
 * safety properties (no collider leak/gap, rebuilds coalesce).
 */

const SIZE = 8;   // local x,z ∈ [-4, 4]
const RES = 9;    // step = 1

/** A globally-LINEAR, asymmetric-in-(x,z) height field. Linear ⇒ the triangulated heightfield
 *  surface equals the exact plane everywhere, so a raycast must match `sampleLocal` to fp. The
 *  asymmetry (different x vs z slope) is what makes a transpose/flip error observable. */
function fillLinear(hm: Heightmap): void {
  for (let j = 0; j < hm.res; j++)
    for (let i = 0; i < hm.res; i++) {
      const x = i * hm.step - hm.half;
      const z = j * hm.step - hm.half;
      hm.heights[hm.idx(i, j)] = 0.5 * x + 0.25 * z;
    }
}

/** Minimal stand-in: rebuildCollider needs `rapierBody`, the chunk grid needs `mesh` (its root). */
function fakeRb(body: any): RigidBodyComponent {
  return { rapierBody: body, mesh: new THREE.Group() } as unknown as RigidBodyComponent;
}

describe('terrain heightfield collider — orientation', () => {
  it('raycasting the heightfield matches Heightmap.sampleLocal (no transpose/flip)', async () => {
    const hm = new Heightmap(RES, SIZE);
    fillLinear(hm);

    const pw = await PhysicsWorld.create();
    const R = pw.RAPIER;
    const body = pw.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
    const heights = packRapierHeights(hm.res, hm.heights);
    pw.createHeightfieldCollider(body, hm.cells, hm.cells, heights, { x: SIZE, y: 1, z: SIZE });
    pw.step(1 / 60); // refresh the query pipeline before casting

    // Interior points incl. a between-vertex sample (1.5, 2.5); each distinguishes the correct
    // mapping from a swap (0.5x+0.25z vs 0.25x+0.5z) and from an axis flip.
    const pts: [number, number][] = [[2, 0], [0, 2], [2, -2], [-3, 1], [1.5, 2.5]];
    for (const [x, z] of pts) {
      const hit = pw.raycast(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0), 1000, true);
      expect(hit, `ray at (${x},${z}) should hit the terrain`).not.toBeNull();
      expect(hit!.point.y).toBeCloseTo(hm.sampleLocal(x, z), 3);
    }
    pw.dispose();
  });
});

describe('terrain heightfield collider — atomic swap', () => {
  it('create-before-remove leaves the body with exactly one collider (no gap, no leak)', async () => {
    const hm = new Heightmap(RES, SIZE);
    const splat = new SplatMap(16);
    const pw = await PhysicsWorld.create();
    const body = pw.createRigidBody(pw.RAPIER.RigidBodyDesc.fixed());
    const field = new TerrainField(pw, fakeRb(body), hm, splat, new THREE.MeshStandardMaterial(), null);

    expect(body.numColliders()).toBe(0);
    field.rebuildCollider();               // null → first heightfield
    expect(body.numColliders()).toBe(1);
    field.rebuildCollider();               // swap: build new, then remove old
    expect(body.numColliders()).toBe(1);
    pw.dispose();
  });
});

describe('terrain collider rebuild — debounced coalescing', () => {
  it('one rebuild fires only after the quiet window, and only once per dirty burst', async () => {
    const hm = new Heightmap(RES, SIZE);
    const splat = new SplatMap(16);
    const pw = await PhysicsWorld.create();
    const body = pw.createRigidBody(pw.RAPIER.RigidBodyDesc.fixed());
    const field = new TerrainField(pw, fakeRb(body), hm, splat, new THREE.MeshStandardMaterial(), null);
    field.rebuildCollider();               // initial collider; not dirty

    const spy = vi.spyOn(field, 'rebuildCollider');
    field.markColliderDirty();
    expect(field.colliderDirty).toBe(true);

    // REBUILD_DEBOUNCE is 0.12s; 0.05 + 0.05 = 0.10 < 0.12 → no rebuild yet.
    expect(field.tickColliderRebuild(0.05)).toBe(false);
    expect(field.tickColliderRebuild(0.05)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(field.tickColliderRebuild(0.05)).toBe(true);   // 0.15 ≥ 0.12 → fires
    expect(spy).toHaveBeenCalledTimes(1);
    expect(field.colliderDirty).toBe(false);

    // Quiet field: no further rebuilds.
    expect(field.tickColliderRebuild(0.05)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    pw.dispose();
  });
});
