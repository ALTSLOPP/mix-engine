import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VerletClothSystem } from '../src/physics/VerletClothSystem';

describe('VerletClothSystem runtime integration', () => {
  it('owns, renders, advances, and removes cloth instances', () => {
    const scene = new THREE.Scene();
    const system = new VerletClothSystem(scene);
    const instance = system.createGrid('flag', { width: 2, height: 2, segsX: 2, segsY: 2 });
    const beforeY = instance.simulation.particles.at(-1)!.pos.y;
    const positionAttribute = instance.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const beforeVersion = positionAttribute.version;

    expect(scene.children).toContain(instance.mesh);
    expect(system.list()).toEqual([{ id: 'flag', particleCount: 9, constraintCount: 20 }]);

    system.fixedStep(1 / 30);
    expect(instance.simulation.particles.at(-1)!.pos.y).toBeLessThan(beforeY);
    expect(positionAttribute.version).toBeGreaterThan(beforeVersion);

    expect(system.remove('flag')).toBe(true);
    expect(scene.children).not.toContain(instance.mesh);
  });
});
