import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldOrigin } from '../src/streaming/WorldOrigin';

describe('WorldOrigin', () => {
  it('round-trips world ↔ engine space through an accumulated offset', () => {
    const wo = new WorldOrigin();
    wo.accumulate(new THREE.Vector3(1000, 0, -2000));
    const world = new THREE.Vector3(1234, 5, -1900);
    const eng = wo.toEngineSpace(world);
    expect(eng.x).toBeCloseTo(234, 6);
    expect(eng.z).toBeCloseTo(100, 6);
    const back = wo.toWorldSpace(eng);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.z).toBeCloseTo(world.z, 6);
  });

  it('is alias-safe when out === input (the AIBridge set_transform pattern)', () => {
    const wo = new WorldOrigin();
    wo.accumulate(new THREE.Vector3(10, 20, 30));
    const v = new THREE.Vector3(15, 25, 35);
    wo.toEngineSpaceInto(v, v); // same object as out and source
    expect(v.x).toBeCloseTo(5, 6);
    expect(v.y).toBeCloseTo(5, 6);
    expect(v.z).toBeCloseTo(5, 6);
  });

  it('accumulate is additive', () => {
    const wo = new WorldOrigin();
    wo.accumulate(new THREE.Vector3(1, 2, 3));
    wo.accumulate(new THREE.Vector3(4, 5, 6));
    expect(wo.offset.toArray()).toEqual([5, 7, 9]);
  });
});
