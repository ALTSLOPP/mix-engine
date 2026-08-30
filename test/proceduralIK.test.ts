import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TwoBoneIKSolver } from '../src/animation/TwoBoneIKSolver';
import { AimIKSolver } from '../src/animation/AimIKSolver';

describe('Procedural Inverse Kinematics (S6)', () => {
  it('analytically solves two-bone limb kinematics with TwoBoneIKSolver', () => {
    // Upper leg at (0, 2, 0), knee at (0, 1, 0), foot at (0, 0, 0)
    const rootPos = new THREE.Vector3(0, 2, 0);
    const midPos = new THREE.Vector3(0, 1, 0);
    const endPos = new THREE.Vector3(0, 0, 0);

    // Target foot slightly forward and higher (bent leg)
    const targetPos = new THREE.Vector3(0, 0.4, 0.4);

    const solve = TwoBoneIKSolver.solve(rootPos, midPos, endPos, targetPos);

    expect(solve.rootQuat).toBeDefined();
    expect(solve.midQuat).toBeDefined();
    expect(Number.isNaN(solve.rootQuat.x)).toBe(false);
    expect(Number.isNaN(solve.midQuat.x)).toBe(false);
  });

  it('clamps and blends procedural aim look-at rotations with AimIKSolver', () => {
    const headBone = new THREE.Bone();
    headBone.position.set(0, 1.7, 0);

    const solver = new AimIKSolver([{ bone: headBone, weight: 1.0 }], {
      maxYaw: 1.0,
      maxPitch: 0.5,
    });

    // Aim to right-front
    const target = new THREE.Vector3(10, 1.7, 10);
    solver.aimAt(target, 1.0);

    expect(headBone.quaternion.y).not.toBe(0);
    expect(Number.isNaN(headBone.quaternion.y)).toBe(false);
  });
});
