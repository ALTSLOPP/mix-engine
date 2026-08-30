import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AIBridge } from '../src/ai/AIBridge';
import { TweenDirectorManager } from '../src/tween/TweenDirectorManager';

describe('TweenAICommands — AI Bridge & HELM Command Execution', () => {
  function createMockBridge() {
    const mesh = new THREE.Mesh();
    const rb = {
      mesh,
      rapierBody: {
        isKinematic: () => true,
        setNextKinematicTranslation: () => {},
        setNextKinematicRotation: () => {},
      },
    };

    const sceneManager = {
      getRigidBody: (id: number) => (id === 1 ? rb : null),
      entityOf: () => 1,
      rigidBodyList: [rb],
    };

    const tweenDirector = new TweenDirectorManager();

    const bridge = new AIBridge({
      sceneManager: sceneManager as any,
      worldOrigin: { toEngineSpaceInto: () => {}, toWorldSpaceInto: () => {} } as any,
      input: {} as any,
      manifest: {} as any,
      viewport: { camera: new THREE.PerspectiveCamera() } as any,
      physicsWorld: {} as any,
      cinematic: {} as any,
      audio: {} as any,
      sensorium: {} as any,
      spawnVfx: () => {},
      burstVfx: () => {},
      captureScreenshot: async () => {},
      setTimeOfDay: () => {},
      tweenDirector,
    });

    return { bridge, tweenDirector, rb, mesh };
  }

  it('executes tween_move AI command', () => {
    const { bridge, tweenDirector, mesh } = createMockBridge();

    bridge.execute({
      type: 'tween_move',
      entityId: 1,
      x: 10,
      y: 5,
      z: 0,
      duration: 1.0,
      ease: 'linear',
    });

    bridge.processQueue();
    expect(bridge.lastQueryResult).toEqual(
      expect.objectContaining({ ok: true, entityId: 1 }),
    );

    tweenDirector.update(1.0);
    expect(mesh.position.x).toBeCloseTo(10, 3);
  });

  it('executes high-level tween_effect_create composite orchestration command', () => {
    const { bridge, tweenDirector, mesh } = createMockBridge();

    bridge.execute({
      type: 'tween_effect_create',
      effectId: 'boss_intro',
      steps: [
        { op: 'scale', entityId: 1, to: [2, 2, 2], duration: 1.0, ease: 'linear' },
        { op: 'move', entityId: 1, to: [0, 5, 0], duration: 1.0, ease: 'linear', join: true },
        { op: 'marker', name: 'spawn_done' },
      ],
    });

    bridge.processQueue();
    expect(bridge.lastQueryResult).toEqual(
      expect.objectContaining({ ok: true, effectId: 'boss_intro' }),
    );

    tweenDirector.update(1.0);
    expect(mesh.scale.x).toBeCloseTo(2, 3);
    expect(mesh.position.y).toBeCloseTo(5, 3);
  });

  it('executes tween_camera and tween_material commands', () => {
    const { bridge, tweenDirector, mesh } = createMockBridge();
    mesh.material = new THREE.MeshStandardMaterial({ opacity: 1, roughness: 0.5 });

    bridge.execute({
      type: 'tween_material',
      entityId: 1,
      opacity: 0.2,
      duration: 1.0,
      ease: 'linear',
    });

    bridge.processQueue();
    expect(bridge.lastQueryResult).toEqual(
      expect.objectContaining({ ok: true, entityId: 1 }),
    );

    tweenDirector.update(1.0);
    expect((mesh.material as THREE.MeshStandardMaterial).opacity).toBeCloseTo(0.2, 3);
  });

  it('executes tween_seek and tween_reverse commands', () => {
    const { bridge, tweenDirector, mesh } = createMockBridge();

    const handle = tweenDirector.move(mesh, new THREE.Vector3(10, 0, 0), { duration: 2.0, ease: 'linear' });

    bridge.execute({
      type: 'tween_seek',
      id: handle.id,
      progress: 0.5,
    });
    bridge.processQueue();
    expect(mesh.position.x).toBeCloseTo(5, 3);

    bridge.execute({
      type: 'tween_reverse',
      id: handle.id,
    });
    bridge.processQueue();
    expect(bridge.lastQueryResult).toEqual(
      expect.objectContaining({ ok: true, id: handle.id, reversed: true }),
    );
  });
});
