// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../src/ecs/SceneManager';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { AssetCache } from '../src/animation/AssetCache';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { registerCoreBuilders } from '../src/engine/builders';

/**
 * Regression for the lighting builder additions: RectAreaLight ('area') with
 * width/height, and the point/spot defaults staying intact. Uses a real Rapier
 * body (the builder creates a fixed body + sensor collider for the light).
 */
async function makeSceneManager(): Promise<SceneManager> {
  const physics = await PhysicsWorld.create();
  const sm = new SceneManager(new THREE.Scene(), physics, new AssetCache(), new WorldOrigin());
  registerCoreBuilders(sm);
  return sm;
}

function findLight<T extends THREE.Light>(root: THREE.Object3D, pred: (l: THREE.Light) => l is T): T | null {
  let found: T | null = null;
  root.traverse((o) => { if (!found && (o as THREE.Light).isLight && pred(o as THREE.Light)) found = o as T; });
  return found;
}

const origin = () => new THREE.Vector3(0, 0, 0);

describe('light builder', () => {
  let sm: SceneManager;
  beforeEach(async () => { sm = await makeSceneManager(); });

  it('builds a RectAreaLight sized by width/height for lightType "area"', () => {
    const id = sm.spawnNow(origin(), { kind: 'light', params: { lightType: 'area', width: 3, height: 2, intensity: 5 } });
    const group = sm.getRigidBody(id)!.mesh;
    const area = findLight(group, (l): l is THREE.RectAreaLight => (l as THREE.RectAreaLight).isRectAreaLight);
    expect(area).not.toBeNull();
    expect(area!.width).toBe(3);
    expect(area!.height).toBe(2);
    expect(area!.intensity).toBe(5);
    // A visible emissive panel helper is added alongside, sized to match.
    let panel: THREE.Mesh | null = null;
    group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name === 'AreaPanelHelper') panel = o as THREE.Mesh; });
    expect(panel).not.toBeNull();
  });

  it('still builds a PointLight by default and a SpotLight for lightType "spot"', () => {
    const pid = sm.spawnNow(origin(), { kind: 'light', params: {} });
    expect(findLight(sm.getRigidBody(pid)!.mesh, (l): l is THREE.PointLight => (l as THREE.PointLight).isPointLight)).not.toBeNull();

    const sid = sm.spawnNow(origin(), { kind: 'light', params: { lightType: 'spot', angle: 0.5, penumbra: 0.7 } });
    const spot = findLight(sm.getRigidBody(sid)!.mesh, (l): l is THREE.SpotLight => (l as THREE.SpotLight).isSpotLight);
    expect(spot).not.toBeNull();
    expect(spot!.angle).toBeCloseTo(0.5);
    expect(spot!.penumbra).toBeCloseTo(0.7);
  });

  it('accepts a spotlight cookie URL without throwing (texture loads async)', () => {
    expect(() =>
      sm.spawnNow(origin(), { kind: 'light', params: { lightType: 'spot', cookie: '/assets/vfx/blinds.png' } }),
    ).not.toThrow();
  });
});
