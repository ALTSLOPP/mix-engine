import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { NavMesh } from '../src/ai/NavMesh';
import { Pathfinder } from '../src/ai/Pathfinder';

/**
 * Builds a small heightfield navmesh over a floor + a tall wall obstacle, then runs A*
 * around it. Exercises the real Rapier raycast path the engine uses at runtime — the
 * same code an LLM drives via `navmesh_build` + `find_path`.
 */
async function buildSceneNavMesh(): Promise<{ nav: NavMesh; pw: PhysicsWorld }> {
  const pw = await PhysicsWorld.create();
  const R = pw.RAPIER;
  // Floor: 24×24m fixed box, top at y=0.5.
  const floor = pw.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
  pw.createBoxCollider(floor, 12, 0.5, 12, false, false);
  // Wall: tall thin box at (0, 0, 0) blocking the straight diagonal from (-8,_,−8) to (8,_,8).
  // Tall enough (hy=2, top at 2.5) that the height delta from the floor (0.5) exceeds
  // maxStepHeight, so A* treats it as an unreachable step and routes around.
  // hz=6 so the wall spans z∈[-6,6] — the agent must detour around either end.
  const wall = pw.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 1, 0));
  pw.createBoxCollider(wall, 0.5, 2, 6, false, false);
  // Step once so Rapier builds its broadphase — raycasts against a never-stepped world
  // see no colliders (the query pipeline is lazy until the first step).
  pw.step(1 / 60);

  const nav = new NavMesh({ center: new THREE.Vector3(0, 0, 0), size: 24, cellSize: 1, agentRadius: 0.4, agentHeight: 1.8, maxSlopeDeg: 45, maxStepHeight: 0.5 });
  await nav.build(pw, new WorldOrigin(), { center: new THREE.Vector3(0, 0, 0), size: 24, cellSize: 1, agentRadius: 0.4, agentHeight: 1.8, maxSlopeDeg: 45, maxStepHeight: 0.5, raycastCeiling: 50, budgetMsPerTick: 50 });
  return { nav, pw };
}

describe('Pathfinder (A* over heightfield navmesh)', () => {
  it('builds a navmesh with walkable cells over a flat floor', async () => {
    const { nav, pw } = await buildSceneNavMesh();
    expect(nav.isBuilt).toBe(true);
    expect(nav.walkableCount).toBeGreaterThan(50); // 24×24 field minus border erosion minus wall
    // The centre cell should be walkable (it's on the floor, away from the wall).
    expect(nav.isWalkableAt(0, 0)).toBe(true);
    pw.dispose();
  });

  it('finds a path between two walkable points and routes around a wall', async () => {
    const { nav, pw } = await buildSceneNavMesh();
    const pf = new Pathfinder(nav);
    const result = pf.find({
      from: new THREE.Vector3(-8, 0.5, -8),
      to: new THREE.Vector3(8, 0.5, 8),
      smooth: true,
    });
    expect(result.found).toBe(true);
    expect(result.waypoints.length).toBeGreaterThanOrEqual(2);
    // The path length must exceed the straight-line distance because the wall at (5,_,0)
    // blocks the diagonal. Straight-line ≈ √(16²+16²) ≈ 22.6m; the detour adds >2m.
    const straight = Math.sqrt(16 * 16 + 16 * 16);
    expect(result.length).toBeGreaterThan(straight + 2);
    // No waypoint may sit inside the wall's XZ footprint (x∈[-0.5,0.5], z∈[-6,6]).
    for (const wp of result.waypoints) {
      const insideWall = wp.x > -0.6 && wp.x < 0.6 && wp.z > -6.1 && wp.z < 6.1;
      expect(insideWall).toBe(false);
    }
    pw.dispose();
  });

  it('returns no-start when the start is far off the navmesh', async () => {
    const { nav, pw } = await buildSceneNavMesh();
    const pf = new Pathfinder(nav);
    const result = pf.find({
      from: new THREE.Vector3(1000, 0, 1000), // way outside the 24m region
      to: new THREE.Vector3(0, 0.5, 0),
    });
    expect(result.found).toBe(false);
    expect(result.reason).toBe('no-start');
    pw.dispose();
  });

  it('snapToWalkable finds the nearest walkable cell to an off-grid point', async () => {
    const { nav, pw } = await buildSceneNavMesh();
    const out = new THREE.Vector3();
    const snapped = nav.snapToWalkable(0.3, 0.3, 4, out);
    expect(snapped).not.toBeNull();
    // The snap should land within one cell of the requested point.
    expect(Math.abs(out.x - 0.3)).toBeLessThan(1.5);
    expect(Math.abs(out.z - 0.3)).toBeLessThan(1.5);
    pw.dispose();
  });

  it('hasLineOfSight is true on a clear flat floor and false across a wall', async () => {
    const { nav, pw } = await buildSceneNavMesh();
    // Clear line along z=−10 (far from the wall at z=0): should have LoS.
    expect(nav.hasLineOfSight(-9, -9, 9, -9)).toBe(true);
    // Line straight through the wall at z=0: should NOT have LoS.
    expect(nav.hasLineOfSight(-9, 0, 9, 0)).toBe(false);
    pw.dispose();
  });
});
