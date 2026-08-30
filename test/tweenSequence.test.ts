import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Tween } from '../src/tween/Tween';
import { TweenSequence } from '../src/tween/TweenSequence';

describe('TweenSequence — Timelines, Callbacks, Markers & Nesting', () => {
  it('chains tweens sequentially with append and calculates duration accurately', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const seq = new TweenSequence();

    seq.append(new Tween(mesh, 'position.x', 10, { duration: 1.0, ease: 'linear' }))
       .append(new Tween(mesh, 'position.y', 20, { duration: 2.0, ease: 'linear' }));

    expect(seq.duration).toBe(3.0);

    seq.update(1.0); // step 1 ends
    expect(mesh.position.x).toBeCloseTo(10, 4);
    expect(mesh.position.y).toBeCloseTo(0, 4);

    seq.update(1.0); // step 2 halfway
    expect(mesh.position.x).toBeCloseTo(10, 4);
    expect(mesh.position.y).toBeCloseTo(10, 4);

    seq.update(1.0); // step 2 finishes
    expect(mesh.position.y).toBeCloseTo(20, 4);
    expect(seq.status).toBe('completed');
  });

  it('runs parallel tweens with join', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0), scale: new THREE.Vector3(1, 1, 1) };
    const seq = new TweenSequence();

    seq.append(new Tween(mesh, 'position.x', 10, { duration: 2.0, ease: 'linear' }))
       .join(new Tween(mesh, 'scale.x', 3, { duration: 2.0, ease: 'linear' }));

    expect(seq.duration).toBe(2.0);

    seq.update(1.0);
    expect(mesh.position.x).toBeCloseTo(5, 4);
    expect(mesh.scale.x).toBeCloseTo(2, 4);

    seq.update(1.0);
    expect(mesh.position.x).toBeCloseTo(10, 4);
    expect(mesh.scale.x).toBeCloseTo(3, 4);
  });

  it('inserts tweens and callbacks at absolute timestamps', () => {
    let callbackFired = false;
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const seq = new TweenSequence();

    seq.append(new Tween(mesh, 'position.x', 10, { duration: 4.0, ease: 'linear' }))
       .insert(2.0, () => { callbackFired = true; });

    seq.update(1.0);
    expect(callbackFired).toBe(false);

    seq.update(1.5);
    expect(callbackFired).toBe(true);
  });

  it('triggers markers and callbacks reliably across large dt jumps that span multiple steps', () => {
    const events: string[] = [];
    const seq = new TweenSequence();

    seq.append(() => events.push('e1'), 1.0)
       .append(() => events.push('e2'), 1.0)
       .appendMarker('impact', 0)
       .append(() => events.push('e3'), 1.0);

    let markerFired = false;
    seq.getHandle().awaitMarker('impact').then(() => { markerFired = true; });

    // Jump immediately across entire 3 second timeline
    seq.update(3.0);

    expect(events).toEqual(['e1', 'e2', 'e3']);
  });

  it('supports nested sequences with relative timing and timeScale inheritance', () => {
    const obj1 = { val: 0 };
    const obj2 = { val: 0 };

    const childSeq = new TweenSequence();
    childSeq.append(new Tween(obj2, 'val', 50, { duration: 1.0, ease: 'linear' }));

    const parentSeq = new TweenSequence();
    parentSeq.append(new Tween(obj1, 'val', 100, { duration: 1.0, ease: 'linear' }))
             .append(childSeq);

    expect(parentSeq.duration).toBe(2.0);

    parentSeq.update(1.0);
    expect(obj1.val).toBeCloseTo(100, 4);
    expect(obj2.val).toBeCloseTo(0, 4);

    parentSeq.update(0.5);
    expect(obj2.val).toBeCloseTo(25, 4);

    parentSeq.update(0.5);
    expect(obj2.val).toBeCloseTo(50, 4);
    expect(parentSeq.status).toBe('completed');
  });

  it('handles reverse playback and seeking correctly', () => {
    const mesh = { position: new THREE.Vector3(0, 0, 0) };
    const seq = new TweenSequence();

    seq.append(new Tween(mesh, 'position.x', 10, { duration: 2.0, ease: 'linear' }));

    seq.seek(1.0);
    expect(mesh.position.x).toBeCloseTo(5, 4);

    seq.reverse();
    seq.play();
    seq.update(0.5);
    expect(mesh.position.x).toBeCloseTo(2.5, 4);
  });

  it('traverses multiple sequence loops and markers with one large dt', () => {
    let markerCount = 0;
    const seq = new TweenSequence({ loops: 3 });
    seq.appendInterval(0.5).append(() => { markerCount++; });
    seq.update(1.25);
    expect(seq.loopCount).toBe(2);
    expect(markerCount).toBe(2);
    expect(seq.progress).toBeCloseTo(0.5, 5);
  });
});
