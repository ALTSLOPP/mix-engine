import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AIBridge } from '../src/ai/AIBridge';

describe('AIBridge Phase 1-8 dependency integration', () => {
  it('routes subsystem commands to the dependencies supplied by Engine', () => {
    const setParams = vi.fn();
    const requestCreateJoint = vi.fn(() => 'joint_1');
    const requestHumanoidRagdoll = vi.fn();
    const clearHistory = vi.fn();
    const addTimeline = vi.fn();
    const addZone = vi.fn();
    const requestFractureEntity = vi.fn();
    const setWeather = vi.fn();
    const setPhase = vi.fn();
    const createGrid = vi.fn(() => ({
      id: 'flag',
      simulation: { particles: new Array(4), constraints: new Array(5) },
    }));

    const bridge = new AIBridge({
      sceneManager: {
        getRigidBody: () => null,
        allEntityIds: () => [],
        getTags: () => [],
      } as any,
      worldOrigin: {
        toEngineSpaceInto: (out: THREE.Vector3, value: THREE.Vector3) => out.copy(value),
        toWorldSpaceInto: (out: THREE.Vector3, value: THREE.Vector3) => out.copy(value),
      } as any,
      input: {} as any,
      manifest: {} as any,
      viewport: { camera: new THREE.PerspectiveCamera(), scene: new THREE.Scene() } as any,
      physicsWorld: {} as any,
      cinematic: {} as any,
      audio: {} as any,
      sensorium: {} as any,
      spawnVfx: () => {},
      burstVfx: () => {},
      captureScreenshot: async () => {},
      setTimeOfDay: () => {},
      getLocomotor: () => ({ setParams } as any),
      jointSystem: { requestCreateJoint } as any,
      ragdollBuilder: { requestHumanoidRagdoll } as any,
      history: { clear: clearHistory } as any,
      timelineSequencer: { addTimeline } as any,
      reverbSystem: { addZone } as any,
      volumetricFog: { density: 0, heightFalloff: 0, groundLevel: 0, color: new THREE.Color(), anisotropy: 0 } as any,
      meshFracturer: { requestFractureEntity } as any,
      weatherSystem: { setWeather } as any,
      aiDirector: { setPhase } as any,
      clothSystem: { createGrid } as any,
    });

    const run = (command: Parameters<AIBridge['execute']>[0]) => {
      bridge.execute(command);
      bridge.processQueue();
    };

    run({ type: 'kcc_set_params', entityId: 1, params: { maxSpeed: 7 } });
    run({ type: 'joint_create', jointType: 'fixed', entityA: 1, entityB: 2, anchorA: { x: 0, y: 0, z: 0 }, anchorB: { x: 0, y: 0, z: 0 } });
    run({ type: 'ragdoll_create', rootEntity: 1, x: 1, y: 2, z: 3 });
    run({ type: 'history_clear' });
    run({ type: 'timeline_create', id: 'intro', duration: 1, tracks: [] });
    run({ type: 'reverb_zone_create', zoneId: 'hall', name: 'Hall', min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } });
    run({ type: 'mesh_fracture', entityId: 5, pieces: 4 });
    run({ type: 'weather_set', state: 'rain' });
    run({ type: 'director_set_phase', phase: 'peak' });
    run({ type: 'cloth_create_grid', id: 'flag', width: 2, height: 1, segsX: 2, segsY: 1 });

    expect(setParams).toHaveBeenCalledWith({ maxSpeed: 7 });
    expect(requestCreateJoint).toHaveBeenCalledOnce();
    expect(requestHumanoidRagdoll).toHaveBeenCalledOnce();
    expect(clearHistory).toHaveBeenCalledOnce();
    expect(addTimeline).toHaveBeenCalledOnce();
    expect(addZone).toHaveBeenCalledOnce();
    expect(requestFractureEntity).toHaveBeenCalledOnce();
    expect(setWeather).toHaveBeenCalledWith('rain', undefined);
    expect(setPhase).toHaveBeenCalledWith('peak');
    expect(createGrid).toHaveBeenCalledOnce();
    expect(bridge.lastQueryResult).toEqual({ id: 'flag', particleCount: 4, constraintCount: 5 });
  });
});
