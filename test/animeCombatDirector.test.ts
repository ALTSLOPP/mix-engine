import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { AnimeCombatDirector } from '../src/features/combat/AnimeCombatDirector';
import { createMockEngine } from './helpers/gameplayEngine';

describe('AnimeCombatDirector — Cinematic Impact Frames, Hit-Stop & Outlines', () => {
  let engine: any;
  let director: AnimeCombatDirector;

  beforeEach(() => {
    engine = createMockEngine();
    engine.time = { timeScale: 1.0, wallClockDt: 0.016 };
    director = new AnimeCombatDirector(engine, {
      enabled: true,
      hitStopDefaultScale: 0.08,
      hitStopMaxDuration: 0.25,
      impactFrameEnabled: true,
    });
  });

  afterEach(() => {
    director.dispose();
  });

  it('triggers anime impact frames and ticks frames remaining down', () => {
    director.triggerImpactFrame('black_white', 3);
    const state = director.getImpactState();
    expect(state.active).toBe(true);
    expect(state.style).toBe('black_white');
    expect(state.framesRemaining).toBe(3);

    director.update(0.016);
    expect(director.getImpactState().framesRemaining).toBe(2);

    director.update(0.016);
    expect(director.getImpactState().framesRemaining).toBe(1);

    director.update(0.016);
    expect(director.getImpactState().active).toBe(false);
  });

  it('triggers hit-stop time dilation and restores time scale when timer expires', () => {
    director.triggerHitStop(0.1, 0.05);
    expect(engine.time.timeScale).toBe(0.05);

    director.update(0.05);
    expect(engine.time.timeScale).toBe(0.05);

    director.update(0.06);
    expect(engine.time.timeScale).toBe(1.0);
  });

  it('generates an inverted-hull ink outline mesh with extruded vertices', () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    box.geometry.computeVertexNormals();

    const outline = director.createInvertedHullOutline(box, 0.05, 0x000000);
    expect(outline).not.toBeNull();
    expect(outline?.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((outline?.material as THREE.MeshBasicMaterial).side).toBe(THREE.BackSide);

    // Vertex coordinates should be expanded outwards along normal
    const origPos = box.geometry.getAttribute('position');
    const outlinePos = outline?.geometry.getAttribute('position');
    expect(outlinePos).toBeDefined();

    // Check vertex expansion
    let hasExpanded = false;
    for (let i = 0; i < (origPos?.count ?? 0); i++) {
      if (Math.abs(outlinePos!.getX(i)) > Math.abs(origPos.getX(i))) {
        hasExpanded = true;
        break;
      }
    }
    expect(hasExpanded).toBe(true);

    director.removeInvertedHullOutline(box);
    expect(box.children.length).toBe(0);
  });

  it('triggers camera FOV zoom punch and restores original FOV', () => {
    const cam = engine.viewport.camera as THREE.PerspectiveCamera;
    cam.fov = 60;
    cam.updateProjectionMatrix();

    director.triggerCameraPunch(-10, 0.1);
    expect(cam.fov).toBe(50);

    director.update(0.05);
    expect(cam.fov).toBeGreaterThan(50);
    expect(cam.fov).toBeLessThan(60);

    director.update(0.06);
    expect(cam.fov).toBe(60);
  });
});
