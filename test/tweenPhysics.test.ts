import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TweenDirectorManager } from '../src/tween/TweenDirectorManager';
import { TweenGraph } from '../src/tween/TweenGraph';
import { Tween } from '../src/tween/Tween';

describe('TweenPhysics — Rapier Kinematic & Teleport Integration', () => {
  it('synchronizes Rapier kinematic rigid bodies during transform tweens', () => {
    let kinematicTransSet: { x: number; y: number; z: number } | null = null;
    let kinematicRotSet: { x: number; y: number; z: number; w: number } | null = null;

    const mockRapierBody = {
      isKinematic: () => true,
      setNextKinematicTranslation: (pos: any) => { kinematicTransSet = pos; },
      setNextKinematicRotation: (rot: any) => { kinematicRotSet = rot; },
    };

    const mockRb = {
      mesh: new THREE.Object3D(),
      rapierBody: mockRapierBody as any,
    };

    const graph = new TweenGraph(mockRb.mesh, { entityId: 1, rb: mockRb as any });
    const tw = new Tween(mockRb.mesh, 'position', new THREE.Vector3(10, 5, 0), { duration: 1.0, ease: 'linear', physicsPolicy: 'kinematic' });

    graph.addTween(tw);
    graph.update(0.5);

    expect(mockRb.mesh.position.x).toBeCloseTo(5, 3);
    expect(kinematicTransSet).not.toBeNull();
    expect((kinematicTransSet as any).x).toBeCloseTo(5, 3);
  });

  it('teleports through the authoritative rigid-body API and clears velocity', () => {
    let translated: any;
    let rotated: any;
    let linvel: any;
    const body = {
      isKinematic: () => false,
      setTranslation: (v: any) => { translated = v; },
      setRotation: (v: any) => { rotated = v; },
      setLinvel: (v: any) => { linvel = v; },
      setAngvel: () => undefined,
    } as any;
    const mesh = new THREE.Object3D();
    const rb = { mesh, rapierBody: body, teleport: (p: THREE.Vector3, q: THREE.Quaternion) => {
      body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    } } as any;
    const graph = new TweenGraph(mesh, { rb });
    graph.addTween(new Tween(mesh, 'position', new THREE.Vector3(4, 2, 1), { duration: 1, physicsPolicy: 'teleport' }));
    graph.update(0.5);
    expect(translated.x).toBeCloseTo(2, 5);
    expect(rotated.w).toBeCloseTo(1, 5);
    expect(linvel).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('uses a dynamic target velocity instead of writing a kinematic target', () => {
    let velocity: any;
    const body = {
      isKinematic: () => false,
      translation: () => ({ x: 0, y: 0, z: 0 }),
      setLinvel: (v: any) => { velocity = v; },
      mass: () => 1,
      addForce: () => undefined,
      rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      setAngvel: () => undefined,
    } as any;
    const mesh = new THREE.Object3D();
    const graph = new TweenGraph(mesh, { rb: { mesh, rapierBody: body } as any });
    graph.addTween(new Tween(mesh, 'position', new THREE.Vector3(2, 0, 0), { duration: 1, physicsPolicy: 'dynamic_target' }));
    graph.update(0.5);
    expect(velocity.x).toBeCloseTo(2, 5);
  });
});
