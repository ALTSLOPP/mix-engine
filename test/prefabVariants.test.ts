import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PrefabManager } from '../src/engine/PrefabManager';

describe('PrefabManager nested prefabs, variants, and unpacking', () => {
  it('spawns nested definitions with variant overrides and tracks the instance', () => {
    let nextId = 1;
    const spawned: Array<{ id: number; kind: string; params: Record<string, unknown>; parent?: number }> = [];
    const requested: Array<{ id: number; policy: string }> = [];
    const engine = {
      sceneManager: {
        spawnNow: (_pos: THREE.Vector3, blueprint: any, opts: any) => {
          const id = nextId++;
          spawned.push({ id, kind: blueprint.kind, params: blueprint.params, parent: opts.parent });
          return id;
        },
        requestDestroy: (id: number, policy: string) => requested.push({ id, policy }),
      },
    } as any;
    const prefabs = new PrefabManager(engine);
    prefabs.register({
      name: 'Wheel',
      root: { id: 'wheel', blueprint: { kind: 'sphere', params: { radius: 0.5, color: 'black' } } },
      variants: { large: { overrides: { wheel: { blueprint: { params: { radius: 1 } } } } } },
    });
    prefabs.register({
      name: 'Car',
      root: {
        id: 'body', blueprint: { kind: 'box', params: { color: 'blue' } },
        children: [{ id: 'frontWheel', prefab: 'Wheel', variant: 'large', localPos: [1, 0, 0] }],
      },
      variants: { red: { overrides: { body: { blueprint: { params: { color: 'red' } } } } } },
    });

    const root = prefabs.spawn('Car', new THREE.Vector3(), undefined, 'red')!;
    expect(spawned).toHaveLength(2);
    expect(spawned[0].params.color).toBe('red');
    expect(spawned[1].params.radius).toBe(1);
    expect(spawned[1].parent).toBe(root);
    expect(prefabs.getInstance(root)?.entityIds).toEqual([1, 2]);

    const unpacked = prefabs.unpack(root);
    expect(unpacked?.linked).toBe(false);
    expect(prefabs.getInstance(root)).toBeUndefined();

    const linkedRoot = prefabs.spawn('Car', new THREE.Vector3())!;
    expect(prefabs.destroyInstance(linkedRoot)).toBe(true);
    expect(requested).toEqual([{ id: linkedRoot, policy: 'cascade' }]);
  });

  it('rejects recursive nested prefab cycles', () => {
    const engine = { sceneManager: { spawnNow: () => 1 } } as any;
    const prefabs = new PrefabManager(engine);
    prefabs.register({ name: 'Loop', root: { prefab: 'Loop' } });
    expect(() => prefabs.spawn('Loop', new THREE.Vector3())).toThrow(/cycle/i);
  });
});
