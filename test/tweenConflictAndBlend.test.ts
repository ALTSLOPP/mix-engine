import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TweenGraph } from '../src/tween/TweenGraph';
import { Tween } from '../src/tween/Tween';
import { TweenPluginRegistry } from '../src/tween/TweenPluginRegistry';

describe('TweenConflictAndBlend — Conflict Policies & Priority', () => {
  it('replaces previous active tween on the same property by default (replace policy)', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const graph = new TweenGraph(mesh);

    const tw1 = new Tween(mesh, 'position.x', 10, { duration: 2.0, conflictPolicy: 'replace' });
    const tw2 = new Tween(mesh, 'position.x', 50, { duration: 1.0, conflictPolicy: 'replace' });

    graph.addTween(tw1);
    graph.update(0.5);
    expect(mesh.position.x).toBeCloseTo(2.5, 3);

    // Add tw2 -> tw1 should be replaced and killed
    graph.addTween(tw2);
    expect(tw1.status).toBe('killed');
    expect(graph.activeTweenList).toContain(tw2);
  });

  it('rejects new tween if target property is busy under reject_if_busy policy', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const graph = new TweenGraph(mesh);

    const tw1 = new Tween(mesh, 'position.x', 10, { duration: 2.0 });
    const tw2 = new Tween(mesh, 'position.x', 50, { duration: 1.0, conflictPolicy: 'reject_if_busy' });

    graph.addTween(tw1);
    const added = graph.addTween(tw2);

    expect(added).toBe(false);
    expect(tw2.status).toBe('killed');
    expect(tw1.status).toBe('playing');
  });

  it('queues next tween until previous tween finishes under queue policy', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const graph = new TweenGraph(mesh);

    const tw1 = new Tween(mesh, 'position.x', 10, { duration: 1.0 });
    const tw2 = new Tween(mesh, 'position.x', 30, { duration: 1.0, conflictPolicy: 'queue' });

    graph.addTween(tw1);
    graph.addTween(tw2);

    expect(tw2.status).toBe('paused');

    // Finish tw1
    graph.update(1.0);
    expect(mesh.position.x).toBeCloseTo(10, 3);
    expect(tw1.status).toBe('completed');
    expect(tw2.status).toBe('playing');

    // Advance tw2
    graph.update(0.5);
    expect(mesh.position.x).toBeCloseTo(20, 3);
  });

  it('completes previous tween immediately under complete_previous policy', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const graph = new TweenGraph(mesh);

    const tw1 = new Tween(mesh, 'position.x', 10, { duration: 2.0 });
    const tw2 = new Tween(mesh, 'position.x', 50, { duration: 1.0, conflictPolicy: 'complete_previous' });

    graph.addTween(tw1);
    graph.update(0.5); // was at 2.5

    graph.addTween(tw2);
    expect(tw1.status).toBe('completed');
    expect(mesh.position.x).toBeCloseTo(10, 3); // jumped to tw1's end
  });

  it('evaluates highest_priority policy correctly', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const graph = new TweenGraph(mesh);

    const lowPriority = new Tween(mesh, 'position.x', 10, { duration: 1.0, priority: 1, conflictPolicy: 'highest_priority' });
    const highPriority = new Tween(mesh, 'position.x', 50, { duration: 1.0, priority: 10, conflictPolicy: 'highest_priority' });

    graph.addTween(lowPriority);
    const addedHigh = graph.addTween(highPriority);

    expect(addedHigh).toBe(true);
    expect(lowPriority.status).toBe('killed');
    expect(highPriority.status).toBe('playing');
  });

  it('mathematically combines blend and additive writers instead of using last-writer-wins', () => {
    const blended = { value: 0 };
    const blendGraph = new TweenGraph(blended);
    blendGraph.addTween(new Tween(blended, 'value', 10, { duration: 1, ease: 'linear' }));
    blendGraph.addTween(new Tween(blended, 'value', 20, { duration: 1, ease: 'linear', conflictPolicy: 'blend' }));
    blendGraph.update(0.5);
    expect(blended.value).toBeCloseTo(7.5, 5);

    const additive = { value: 10 };
    const additiveGraph = new TweenGraph(additive);
    additiveGraph.addTween(new Tween(additive, 'value', 20, { duration: 1, ease: 'linear' }));
    additiveGraph.addTween(new Tween(additive, 'value', 14, { duration: 1, ease: 'linear', conflictPolicy: 'additive' }));
    additiveGraph.update(0.5);
    expect(additive.value).toBeCloseTo(17, 5);
  });

  it('delegates custom-value blending to registered plugin adapters', () => {
    const adapter = {
      name: 'testPoint',
      canHandle: (v: any) => Boolean(v && v.kind === 'testPoint'),
      clone: (v: any) => ({ kind: 'testPoint', value: v.value }),
      lerp: (a: any, b: any, t: number) => ({ kind: 'testPoint', value: a.value + (b.value - a.value) * t }),
      diff: (a: any, b: any) => ({ kind: 'testPoint', value: b.value - a.value }),
      add: (a: any, b: any) => ({ kind: 'testPoint', value: a.value + b.value }),
      combine: (_base: any, values: any[], mode: string) => mode === 'blend'
        ? { kind: 'testPoint', value: values.reduce((sum, v) => sum + v.value, 0) / values.length }
        : undefined,
    };
    TweenPluginRegistry.register(adapter);
    const target = { point: { kind: 'testPoint', value: 0 } };
    const graph = new TweenGraph(target);
    graph.addTween(new Tween(target, 'point', { kind: 'testPoint', value: 10 }, { duration: 1 }));
    graph.addTween(new Tween(target, 'point', { kind: 'testPoint', value: 20 }, { duration: 1, conflictPolicy: 'blend' }));
    graph.update(0.5);
    expect(target.point.value).toBeCloseTo(7.5, 5);
    TweenPluginRegistry.clear();
  });

  it('composes overlapping quaternion deltas without denormalizing rotations', () => {
    const target = { rotation: new THREE.Quaternion() };
    const graph = new TweenGraph(target);
    const halfTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    graph.addTween(new Tween(target, 'rotation', halfTurn, { duration: 1, ease: 'linear' }));
    graph.addTween(new Tween(target, 'rotation', halfTurn, { duration: 1, ease: 'linear', conflictPolicy: 'additive' }));
    graph.update(1);
    expect(Math.abs(target.rotation.y)).toBeCloseTo(1, 4);
    expect(target.rotation.length()).toBeCloseTo(1, 5);
  });
});
