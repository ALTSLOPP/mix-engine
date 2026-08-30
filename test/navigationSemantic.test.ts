import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { NavigationSystem } from '../src/ai/NavigationSystem';

/**
 * Unit-tests the SEMANTIC destination layer of NavigationSystem (landmark registry +
 * resolveDestination + navigateTo's fail-fast paths) without a physics world — these are
 * the pure resolution rules behind `engine.nav.agent(id).navigateTo("building_42")`.
 */
function makeNav(opts: {
  resolveEntityRef?: (ref: string) => number | undefined;
  getRigidBody?: (id: number) => unknown;
} = {}): NavigationSystem {
  return new NavigationSystem({
    sceneManager: { getRigidBody: opts.getRigidBody ?? (() => null) } as any,
    physicsWorld: { raycast: () => null } as any,
    worldOrigin: new WorldOrigin(),
    scene: new THREE.Scene(),
    resolveEntityRef: opts.resolveEntityRef,
  });
}

describe('NavigationSystem — semantic destinations', () => {
  it('resolves a registered landmark by name', () => {
    const nav = makeNav();
    nav.registerLandmark('building_42', new THREE.Vector3(10, 1, 5), 2);
    const r = nav.resolveDestination('building_42');
    expect(r).not.toBeNull();
    expect(r!.position.x).toBe(10);
    expect(r!.position.z).toBe(5);
    expect(r!.name).toBe('building_42');
    expect(r!.radius).toBe(2);
  });

  it('passes through Vector3 and tuple destinations', () => {
    const nav = makeNav();
    expect(nav.resolveDestination([1, 2, 3])!.position.equals(new THREE.Vector3(1, 2, 3))).toBe(true);
    expect(nav.resolveDestination(new THREE.Vector3(4, 5, 6))!.position.y).toBe(5);
  });

  it('resolves a named entity via the injected resolver (tries @ref)', () => {
    const nav = makeNav({
      resolveEntityRef: (ref) => (ref === '@hero' ? 7 : undefined),
      getRigidBody: (id) => (id === 7 ? { mesh: { position: new THREE.Vector3(2, 0, 3) } } : null),
    });
    const r = nav.resolveDestination('hero');
    expect(r).not.toBeNull();
    expect(r!.position.x).toBe(2);
    expect(r!.position.z).toBe(3);
  });

  it('returns null for an unresolvable reference', () => {
    expect(makeNav().resolveDestination('nowhere')).toBeNull();
  });

  it('navigateTo resolves "unreachable" when the destination cannot be resolved', async () => {
    const arrival = await makeNav().navigateTo(1, 'ghost_town');
    expect(arrival.status).toBe('unreachable');
    expect(arrival.destination).toBeNull();
  });

  it('navigateTo resolves "unreachable" (with destination) when the entity has no body', async () => {
    const nav = makeNav();
    const arrival = await nav.navigateTo(1, [5, 0, 5]);
    expect(arrival.status).toBe('unreachable');
    expect(arrival.destination).toEqual({ x: 5, y: 0, z: 5 });
  });

  it('markChunkDirty is a no-op until a navmesh exists', () => {
    const nav = makeNav();
    nav.setDynamic({ enabled: true });
    nav.markChunkDirty(0, 0);
    expect(nav.dirtyRegionCount).toBe(0);
  });

  it('agent() returns a stable handle bound to the entity id', () => {
    const nav = makeNav();
    const h = nav.agent(42);
    expect(h.entityId).toBe(42);
    expect(nav.agent(42)).toBe(h);
  });
});
