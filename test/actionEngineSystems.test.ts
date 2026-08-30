import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  BoneSocketManager,
  AnimNotifyManager,
} from '../src/animation';
import {
  TimeDilationManager,
} from '../src/playback';
import {
  MultiTargetCamera,
} from '../src/rendering/MultiTargetCamera';
import {
  RibbonTrailManager,
} from '../src/vfx';
import {
  CelToonMaterial,
} from '../src/materials';
import {
  SpeedLinesPass,
  ImpactFramePass,
} from '../src/rendering/SpeedLinesPass';

describe('BoneSocketManager Unit & QoL Tests', () => {
  let sockets: BoneSocketManager;

  beforeEach(() => {
    sockets = new BoneSocketManager();
  });

  it('attaches and detaches entities to skeleton bones', () => {
    sockets.attach(2, 1, 'RightHand', {
      position: [0, 0.5, 0],
      scale: [1, 1, 1],
    });

    const att = sockets.getAttachment(2);
    expect(att).toBeDefined();
    expect(att?.parentId).toBe(1);
    expect(att?.boneName).toBe('RightHand');
    expect(att?.localPosition.y).toBe(0.5);

    expect(sockets.getAttachedChildren(1)).toEqual([2]);
    expect(sockets.getAllAttachments()).toHaveLength(1);

    const detached = sockets.detach(2);
    expect(detached).toBe(true);
    expect(sockets.getAttachment(2)).toBeUndefined();
    expect(sockets.getAttachedChildren(1)).toHaveLength(0);
  });

  it('finds bones using fuzzy lowercase and prefix/suffix matching', () => {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = 'mixamorig:RightHand';
    root.add(bone);

    const found = sockets.findBone(root, 'RightHand');
    expect(found).toBe(bone);
  });

  it('teleports the physics-backed child and preserves its local offset on fallback', () => {
    const parentMesh = new THREE.Object3D();
    parentMesh.position.set(4, 2, 0);
    parentMesh.updateMatrixWorld(true);
    const childMesh = new THREE.Object3D();
    const teleports: THREE.Vector3[] = [];
    const childRb: any = {
      mesh: childMesh,
      transformAuthority: 'physics',
      teleport: (p: THREE.Vector3, q: THREE.Quaternion) => { teleports.push(p.clone()); childMesh.position.copy(p); childMesh.quaternion.copy(q); },
    };
    sockets.attach(2, 1, 'MissingBone', { position: [0, 1, 0] });
    sockets.update({ getRigidBody: (id: number) => id === 1 ? { mesh: parentMesh } : childRb } as any);
    expect(teleports[0].toArray()).toEqual([4, 3, 0]);
    expect(sockets.getAttachment(2)?.localPosition.toArray()).toEqual([0, 1, 0]);
    expect(childRb.transformAuthority).toBe('animation');
  });
});

describe('AnimNotifyManager Unit & QoL Tests', () => {
  let notifyMgr: AnimNotifyManager;

  beforeEach(() => {
    notifyMgr = new AnimNotifyManager();
  });

  it('dispatches animation timeline notifies on exact frames', () => {
    notifyMgr.addNotify({
      id: 'punch_hitbox',
      state: 'punch_heavy',
      normalizedTime: 0.35,
      event: 'hitbox_active',
      payload: { damage: 50 },
    });

    const triggered: string[] = [];

    // Timeline advances from 0.0 to 0.3 -> not triggered yet
    notifyMgr.checkNotifies('punch_heavy', 0.0, 0.3, (n) => triggered.push(n.id));
    expect(triggered).toHaveLength(0);

    // Timeline advances from 0.3 to 0.4 -> passes 0.35 -> triggered!
    notifyMgr.checkNotifies('punch_heavy', 0.3, 0.4, (n) => triggered.push(n.id));
    expect(triggered).toEqual(['punch_hitbox']);
  });

  it('converts frame numbers to normalized time with addNotifyAtFrame', () => {
    notifyMgr.addNotifyAtFrame('footstep_1', 'run', 15, 30, 'sound_footstep');
    const notifies = notifyMgr.getNotifies('run');
    expect(notifies).toHaveLength(1);
    expect(notifies[0].normalizedTime).toBe(0.5);
  });
});

describe('TimeDilationManager Unit & QoL Tests', () => {
  let timeMgr: TimeDilationManager;

  beforeEach(() => {
    timeMgr = new TimeDilationManager();
  });

  it('triggers hitstop micro-pause and restores speed on update', () => {
    timeMgr.triggerHitstop({
      durationMs: 100,
      timeScale: 0.0, // full freeze
      targetEntityIds: [1, 2],
    });

    // Targets are frozen
    expect(timeMgr.getEntityTimeScale(1)).toBe(0.0);
    expect(timeMgr.getEntityTimeScale(2)).toBe(0.0);
    // Non-target entity 3 remains unaffected at 1.0
    expect(timeMgr.getEntityTimeScale(3)).toBe(1.0);

    // Advance 120ms -> hitstop expires
    timeMgr.update(120);
    expect(timeMgr.getEntityTimeScale(1)).toBe(1.0);
    expect(timeMgr.getEntityTimeScale(2)).toBe(1.0);
  });

  it('supports combat hitstop helper and immune entities', () => {
    timeMgr.setEntityImmune(1, true); // Attacker is immune during counter
    timeMgr.triggerCombatHitstop(1, 2, 80, 0.0);

    expect(timeMgr.getEntityTimeScale(1)).toBe(1.0); // Immune attacker keeps moving
    expect(timeMgr.getEntityTimeScale(2)).toBe(0.0); // Victim frozen
  });

  it('rejects invalid timing values and clear resets immunity', () => {
    expect(() => timeMgr.triggerHitstop({ durationMs: Number.NaN })).toThrow();
    timeMgr.setEntityImmune(1, true);
    timeMgr.clear();
    expect(timeMgr.isEntityImmune(1)).toBe(false);
  });
});

describe('MultiTargetCamera Unit & QoL Tests', () => {
  it('calculates bounding distance and frames target positions', () => {
    const multiCam = new MultiTargetCamera({ minDistance: 5, maxDistance: 50, minHeight: 2.0 });
    multiCam.setTargets([1, 2]);

    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);

    const mockSceneManager = {
      getRigidBody: (id: number) => {
        const mesh = new THREE.Mesh();
        if (id === 1) mesh.position.set(-10, 0, 0);
        if (id === 2) mesh.position.set(10, 0, 0);
        return { mesh };
      },
    } as any;

    multiCam.update(cam, mockSceneManager, 0.1);

    // Centroid of (-10, 0, 0) and (10, 0, 0) is (0, 0, 0)
    // Distance between targets is 20 -> camera should pull back
    expect(cam.position.z).toBeGreaterThan(10);
    expect(cam.position.y).toBeGreaterThanOrEqual(2.0); // Enforces floor clamp
  });

  it('snaps camera position immediately without damping delay', () => {
    const multiCam = new MultiTargetCamera({ minDistance: 5, maxDistance: 50 });
    multiCam.setTargets([1]);

    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
    const mockSceneManager = {
      getRigidBody: () => ({ mesh: new THREE.Mesh() }),
    } as any;

    multiCam.update(cam, mockSceneManager, 0.001);
    multiCam.snap();
    expect(cam.position).toBeDefined();
  });
});

describe('RibbonTrailManager Unit & QoL Tests', () => {
  it('creates, updates, and disposes ribbon trail meshes', () => {
    const trailMgr = new RibbonTrailManager();
    const scene = new THREE.Scene();

    const instance = trailMgr.attachTrail(scene, 1, {
      lifetime: 0.2,
      color: '#ff0055',
      taperEnd: 0.0,
    });

    expect(instance.mesh).toBeDefined();
    expect(scene.children).toContain(instance.mesh);

    const mockMesh = new THREE.Mesh();
    mockMesh.position.set(0, 5, 0);
    mockMesh.updateMatrixWorld(true);

    instance.update(mockMesh, 1000);
    expect(instance.points).toHaveLength(1);
    mockMesh.position.x = 1;
    mockMesh.updateMatrixWorld(true);
    instance.update(mockMesh, 1010);
    expect(instance.geometry.index).toBeTruthy();
    expect(instance.geometry.drawRange.count).toBe(6);

    // Toggling emitting off stops new points but updates existing
    trailMgr.setEmitting(1, false);
    instance.update(mockMesh, 1100);
    expect(instance.points).toHaveLength(2);

    trailMgr.removeTrail(scene, 1);
    expect(scene.children).not.toContain(instance.mesh);
  });
});

describe('Stylized Cel-Shading & Speed Lines Unit & QoL Tests', () => {
  it('creates CelToonMaterial with stepped lighting uniforms', () => {
    const mat = new CelToonMaterial({
      color: 0xffaa00,
      shadowColor: 0x331144,
      bands: 3,
      rimIntensity: 0.5,
    });

    expect(mat.uniforms.uBands.value).toBe(3);
    expect(mat.uniforms.uRimIntensity.value).toBe(0.5);
    expect(mat.fragmentShader).toContain('stepped');
    expect(mat.fragmentShader).toContain('rim');
  });

  it('creates SpeedLinesPass with customizable center and ImpactFramePass', () => {
    const speedLines = new SpeedLinesPass();
    expect(speedLines.uniforms.intensity.value).toBe(0.0);
    expect(speedLines.uniforms.density.value).toBe(30.0);
    expect(speedLines.uniforms.center.value.x).toBe(0.5);

    speedLines.uniforms.center.value.set(0.75, 0.25);
    expect(speedLines.uniforms.center.value.x).toBe(0.75);

    const impact = new ImpactFramePass();
    expect(impact.uniforms.active.value).toBe(0.0);

    speedLines.dispose();
    impact.dispose();
  });
});
