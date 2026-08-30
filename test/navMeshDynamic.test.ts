import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { NavMesh, type NavMeshBuildOptions } from '../src/ai/NavMesh';
import { Pathfinder } from '../src/ai/Pathfinder';

/**
 * Dynamic / chunk-aware navmesh: build over a flat floor, then drop a tall obstacle into
 * the world AFTER the build and patch only its footprint with rebuildRegion(). Verifies the
 * incremental re-rasterization is (a) effective — the obstacle now blocks pathing onto it —
 * and (b) LOCAL — cells outside the patched rect are untouched. This is the same code path
 * the NavigationSystem runs when a streamed chunk loads or a building is extruded.
 */
const OPTS: NavMeshBuildOptions = {
  center: new THREE.Vector3(0, 0, 0), size: 24, cellSize: 1,
  agentRadius: 0.4, agentHeight: 1.8, maxSlopeDeg: 45, maxStepHeight: 0.5,
  raycastCeiling: 50, budgetMsPerTick: 50,
};

describe('NavMesh.rebuildRegion (dynamic / chunk-aware patching)', () => {
  it('re-rasterizes only the dirty rect and reflects a newly-added obstacle', async () => {
    const pw = await PhysicsWorld.create();
    const R = pw.RAPIER;
    const wo = new WorldOrigin();
    // Floor: 24×24, top at y=0.5.
    const floor = pw.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
    pw.createBoxCollider(floor, 12, 0.5, 12, false, false);
    pw.step(1 / 60);

    const nav = new NavMesh(OPTS);
    await nav.build(pw, wo, OPTS);
    const pf = new Pathfinder(nav);

    // Before: the centre is reachable ground at ~0.5m.
    expect(nav.isWalkableAt(0, 0)).toBe(true);
    expect(nav.heightAt(0, 0)).toBeCloseTo(0.5, 1);
    const before = pf.find({ from: new THREE.Vector3(-8, 0.5, -8), to: new THREE.Vector3(0, 0.5, 0) });
    expect(before.found).toBe(true);

    // Drop a tall 3×3×3 block centred at the origin (top at y=3.0). Its rooftop becomes a
    // walkable surface 2.5m above the floor — unreachable across the step-height gate.
    const wall = pw.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 1.5, 0));
    pw.createBoxCollider(wall, 1.5, 1.5, 1.5, false, false);
    pw.step(1 / 60);

    // The navmesh is STALE until we patch it (proves the patch is what changes it).
    expect(nav.heightAt(0, 0)).toBeCloseTo(0.5, 1);

    const touched = nav.rebuildRegion(pw, wo, { minX: -2.5, minZ: -2.5, maxX: 2.5, maxZ: 2.5 });
    expect(touched).toBeGreaterThan(0);

    // The patched cells now read the rooftop height (~3.0).
    expect(nav.heightAt(0, 0)).toBeCloseTo(3.0, 1);
    // A cell well outside the dirty rect is untouched.
    expect(nav.heightAt(8, 8)).toBeCloseTo(0.5, 1);

    // Pathing onto the isolated 3m rooftop from the ground is now unreachable.
    const after = pf.find({ from: new THREE.Vector3(-8, 0.5, -8), to: new THREE.Vector3(0, 0.5, 0) });
    expect(after.found).toBe(false);

    pw.dispose();
  });

  it('rebuildRegion ignores a rect that does not overlap the navmesh', async () => {
    const pw = await PhysicsWorld.create();
    const R = pw.RAPIER;
    const wo = new WorldOrigin();
    const floor = pw.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
    pw.createBoxCollider(floor, 12, 0.5, 12, false, false);
    pw.step(1 / 60);
    const nav = new NavMesh(OPTS);
    await nav.build(pw, wo, OPTS);

    expect(nav.rebuildRegion(pw, wo, { minX: 1000, minZ: 1000, maxX: 1001, maxZ: 1001 })).toBe(0);
    pw.dispose();
  });
});
