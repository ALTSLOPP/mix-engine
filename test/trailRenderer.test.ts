// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TrailRenderer } from '../src/effects/TrailRenderer';

describe('TrailRenderer (ribbon)', () => {
  it('starts empty so no stray ribbon renders before any sample lands', () => {
    const t = new TrailRenderer(new THREE.Scene(), { segments: 8, lifetime: 1 });
    expect(t.sampleCount).toBe(0);
    for (let i = 0; i < 8; i++) expect(t.sampleLife(i)).toBe(0);
    t.update(1 / 60, 1 / 60);
    expect(t.line.geometry.drawRange.count).toBe(0); // nothing drawn
    t.dispose();
  });

  it('seeds a fresh head (life 1) and shifts older samples back with their position + life', () => {
    const t = new TrailRenderer(new THREE.Scene(), { segments: 8, lifetime: 1 });
    t.updateHead(new THREE.Vector3(0, 0, 0), 0);
    expect(t.sampleLife(0)).toBe(1);
    expect(t.sampleCount).toBe(1);

    t.updateHead(new THREE.Vector3(1, 0, 0), 0.016);
    expect(t.sampleLife(0)).toBe(1); // new head fresh
    expect(t.sampleLife(1)).toBe(1); // previous head shifted back, not yet aged
    expect(t.sampleCenter(0).x).toBe(1); // head position
    expect(t.sampleCenter(1).x).toBe(0); // previous shifted to slot 1
    expect(t.sampleCount).toBe(2);
    t.dispose();
  });

  it('does NOT drain in a single frame (the old bug) and decays a head over ~lifetime', () => {
    const lifetime = 0.5;
    const t = new TrailRenderer(new THREE.Scene(), { segments: 16, lifetime });
    t.updateHead(new THREE.Vector3(0, 0, 0), 0);

    // One frame of aging must leave the head clearly visible — the old code zeroed it.
    t.update(1 / 60, 1 / 60);
    expect(t.sampleLife(0)).toBeGreaterThan(0.8);

    // With no new samples, the head should fully decay after ~lifetime of aging.
    const steps = Math.ceil(lifetime / (1 / 60)) + 2;
    for (let i = 0; i < steps; i++) t.update(1 / 60, (i + 2) / 60);
    expect(t.sampleLife(0)).toBe(0);
    t.dispose();
  });

  it('builds a ribbon (2 verts/sample) facing a camera and draws the filled span', () => {
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 0, 10);
    const t = new TrailRenderer(new THREE.Scene(), { segments: 8, lifetime: 1, width: 0.4, camera: cam });
    t.updateHead(new THREE.Vector3(0, 0, 0), 0);
    t.updateHead(new THREE.Vector3(1, 0, 0), 0.016);
    t.update(0, 0.016); // dt 0 → no aging, just rebuild the ribbon
    // One quad spans the two filled samples → 6 indices.
    expect(t.line.geometry.drawRange.count).toBe(6);
    // Two rail vertices per sample share the sample's centre on the trail axis but are
    // pushed apart across the width, so the head's two verts differ in Y (side ≈ ±up here).
    const pos = t.line.geometry.attributes.position.array as Float32Array;
    const leftY = pos[1];
    const rightY = pos[4];
    expect(Math.abs(leftY - rightY)).toBeGreaterThan(0.1); // real width, not a hairline
    t.dispose();
  });
});
