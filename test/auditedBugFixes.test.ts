import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RigidBodyComponent } from '../src/physics/RigidBodyComponent';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { WaterSystem } from '../src/water/WaterSystem';
import { defaultWaves, gerstnerHeight } from '../src/water/gerstner';
import { TerrainSystem } from '../src/terrain/TerrainSystem';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Heightmap } from '../src/terrain/Heightmap';
import { SplatMap } from '../src/terrain/SplatMap';
import { TerrainField } from '../src/terrain/TerrainField';

describe('audited runtime bug fixes', () => {
  it('scales pending root rotation with dropped time and returns unaliased snapshots', () => {
    const rb = new RigidBodyComponent({} as any, {} as any, new THREE.Object3D(), { source: 'owned' });
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    rb.accumulateRootMotion(new THREE.Vector3(10, 0, 0), 1, rotation);
    rb.scalePending(0.1);

    const pending = (rb as any).pendingRootRotation as THREE.Quaternion;
    expect(THREE.MathUtils.radToDeg(2 * Math.acos(pending.w))).toBeCloseTo(18, 5);
    expect((rb as any).pendingTime).toBeCloseTo(0.1, 6);

    const first = rb.currentPosition;
    const second = rb.currentPosition;
    expect(first).not.toBe(second);
  });

  it('keeps lake placement and sampling in absolute world space after an origin shift', () => {
    const hooks: Array<(dt: number) => void> = [];
    const worldOrigin = new WorldOrigin();
    worldOrigin.offset.set(30, 25, -40);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const engine = {
      worldOrigin,
      viewport: { scene, camera },
      addUpdateHook: (hook: (dt: number) => void) => hooks.push(hook),
    } as any;
    const water = new WaterSystem(engine);
    const lake = water.create({ kind: 'lake', position: [100, 200], seaLevel: 4 });

    expect(lake.mesh.position.toArray()).toEqual([70, -21, 240]);
    const waves = defaultWaves(1, 0.6);
    expect(water.sampleHeight(101, 203)).toBeCloseTo(4 + gerstnerHeight(101, 203, 0, waves), 6);

    hooks[0](0.5);
    expect(water.sampleHeight(101, 203)).toBeCloseTo(4 + gerstnerHeight(101, 203, 0.5, waves), 6);
  });

  it('installs complete hydraulic defaults before scheduling erosion', () => {
    const engine = { addUpdateHook: () => {} } as any;
    const terrain = new TerrainSystem(engine);
    terrain.erode({} as any, { i0: 0, i1: 8, j0: 0, j1: 8 }, 'hydraulic', { iterations: 2 });
    const opts = (terrain as any).erodeJobs[0].opts;
    expect(opts).toMatchObject({
      iterations: 2,
      maxLifetime: 30,
      erosionRadius: 3,
      startSpeed: 1,
      startWater: 1,
    });
  });

  it('places chunked colliders in terrain engine space and disposes dedicated bodies', async () => {
    const physics = await PhysicsWorld.create();
    const R = physics.RAPIER;
    const root = new THREE.Group();
    root.position.set(100, 0, 200);
    const terrainBody = physics.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(100, 0, 200));
    const rb = new RigidBodyComponent(physics, terrainBody, root, { source: 'owned' });
    const hm = new Heightmap(5, 4);
    const field = new TerrainField(
      physics,
      rb,
      hm,
      new SplatMap(4),
      new THREE.MeshStandardMaterial(),
      null,
      { maxChunkCells: 4 },
      { maxChunkCells: 4 },
    );
    field.enableChunkedColliders(true);
    field.updateColliderStreaming(new THREE.Vector3(100, 10, 200), new THREE.Vector3(1000, 20, -500));
    physics.step(1 / 60);

    const hit = physics.raycast(new THREE.Vector3(100, 10, 200), new THREE.Vector3(0, -1, 0), 20, true);
    expect(hit?.point.y).toBeCloseTo(0, 4);
    expect(physics.rawWorld.bodies.len()).toBe(2);

    field.dispose();
    expect(physics.rawWorld.bodies.len()).toBe(1);
    physics.dispose();
  });
});
