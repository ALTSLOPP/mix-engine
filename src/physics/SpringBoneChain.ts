import * as THREE from 'three';

export interface SphereCollider {
  kind?: 'sphere';
  center: THREE.Vector3;
  radius: number;
}

export interface CapsuleCollider {
  kind: 'capsule';
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
}

export type SpringCollider = SphereCollider | CapsuleCollider;

export interface SpringBoneParams {
  stiffness?: number; // 0.05 to 1.0 (spring force pulling back to rest pose)
  damping?: number;   // 0.5 to 0.99 (velocity dissipation)
  gravity?: THREE.Vector3;
  inertia?: number;   // 0 to 1 (responsiveness to parent movement)
  radius?: number;    // Collision radius of nodes
}

export interface SpringNode {
  bone: THREE.Object3D;
  length: number;
  currentPos: THREE.Vector3;
  prevPos: THREE.Vector3;
  initLocalPos: THREE.Vector3;
  initLocalRot: THREE.Quaternion;
  radius: number;
  /** The bone that is actually rotated to aim at this node's simulated position. */
  parentBone: THREE.Object3D | null;
  /** `parentBone`'s authored local rotation — the frame the aim delta is measured from. */
  parentInitLocalRot: THREE.Quaternion;
}

/**
 * SpringBoneChain.ts — Secondary procedural spring-mass physics (KawaiiPhysics style).
 * Simulates inertia, wind, and collision for character hair, capes, skirts, and attachments.
 */
export class SpringBoneChain {
  readonly root: THREE.Object3D;
  readonly nodes: SpringNode[] = [];
  stiffness: number;
  damping: number;
  gravity: THREE.Vector3;
  inertia: number;
  radius: number;

  private static readonly _targetPos = new THREE.Vector3();
  private static readonly _force = new THREE.Vector3();
  private static readonly _velocity = new THREE.Vector3();
  private static readonly _dir = new THREE.Vector3();
  private static readonly _parentWorldPos = new THREE.Vector3();
  private static readonly _parentWorldQuat = new THREE.Quaternion();
  private static readonly _invParentQuat = new THREE.Quaternion();
  private static readonly _restWorldDir = new THREE.Vector3();
  private static readonly _aimDelta = new THREE.Quaternion();
  private static readonly _newWorldQuat = new THREE.Quaternion();
  private static readonly _grandparentQuat = new THREE.Quaternion();
  private static readonly _v0 = new THREE.Vector3();
  private static readonly _closest = new THREE.Vector3();
  private static readonly _segment = new THREE.Vector3();

  constructor(bones: THREE.Object3D[], params: SpringBoneParams = {}) {
    if (bones.length === 0) {
      throw new Error('SpringBoneChain requires at least one bone');
    }
    this.root = bones[0];
    this.stiffness = params.stiffness ?? 0.2;
    this.damping = params.damping ?? 0.85;
    this.gravity = params.gravity?.clone() ?? new THREE.Vector3(0, -9.81, 0);
    this.inertia = params.inertia ?? 0.8;
    this.radius = params.radius ?? 0.05;

    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      const worldPos = new THREE.Vector3();
      bone.getWorldPosition(worldPos);

      let length = 0.1;
      if (i > 0) {
        const prevBone = bones[i - 1];
        const prevPos = new THREE.Vector3();
        prevBone.getWorldPosition(prevPos);
        length = Math.max(0.01, worldPos.distanceTo(prevPos));
      }

      const parentBone = i > 0 ? bone.parent : null;
      this.nodes.push({
        bone,
        length,
        currentPos: worldPos.clone(),
        prevPos: worldPos.clone(),
        initLocalPos: bone.position.clone(),
        initLocalRot: bone.quaternion.clone(),
        radius: this.radius,
        parentBone,
        parentInitLocalRot: parentBone ? parentBone.quaternion.clone() : new THREE.Quaternion(),
      });
    }
  }

  /**
   * Advance one spring step and aim each bone at its child's simulated position.
   *
   * Two things this deliberately does NOT do the naive way:
   *  - the solved rotation is written to the node's PARENT, not to the node itself.
   *    A node's simulated point is where its own origin should end up, and the only
   *    joint that can move it there is the one above it. Writing it to `node.bone`
   *    rotated the wrong joint, so the chain aimed one bone off all the way down.
   *  - Verlet damping is raised to `dt * 60`, so hair settles at the same rate at
   *    30fps and 144fps instead of going limp on fast machines.
   */
  update(dt: number, colliders: SpringCollider[] = []): void {
    if (dt <= 0 || this.nodes.length === 0) return;

    // Frame-rate independent velocity retention: damping is authored per 60Hz frame.
    const damp = Math.pow(this.damping, dt * 60);

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const parent = node.parentBone;

      if (!parent || i === 0) {
        // Root node is anchored to whatever drives the chain (the character's skeleton).
        node.bone.getWorldPosition(node.currentPos);
        node.prevPos.copy(node.currentPos);
        continue;
      }

      // Measure the rest frame with the parent returned to its authored rotation, so
      // the aim delta below is relative to the pose the artist built, not to last
      // frame's already-solved rotation (which would integrate drift every frame).
      parent.quaternion.copy(node.parentInitLocalRot);
      parent.getWorldPosition(SpringBoneChain._parentWorldPos);
      parent.getWorldQuaternion(SpringBoneChain._parentWorldQuat);

      // Rest direction of this node as seen in world space.
      SpringBoneChain._restWorldDir
        .copy(node.initLocalPos)
        .applyQuaternion(SpringBoneChain._parentWorldQuat);
      if (SpringBoneChain._restWorldDir.lengthSq() < 1e-12) {
        // Zero-length rest offset — nothing to aim; keep the bone at rest.
        node.bone.getWorldPosition(node.currentPos);
        node.prevPos.copy(node.currentPos);
        continue;
      }
      SpringBoneChain._restWorldDir.normalize();

      // Target rest position: the authored local offset, rotated into world space.
      SpringBoneChain._targetPos
        .copy(node.initLocalPos)
        .applyQuaternion(SpringBoneChain._parentWorldQuat)
        .add(SpringBoneChain._parentWorldPos);

      // Verlet velocity: (curr - prev) * damping
      SpringBoneChain._velocity
        .subVectors(node.currentPos, node.prevPos)
        .multiplyScalar(damp);

      // Spring restoring force towards the rest position.
      SpringBoneChain._force
        .subVectors(SpringBoneChain._targetPos, node.currentPos)
        .multiplyScalar(this.stiffness);

      // Gravity, scaled down by how strongly the node follows its parent.
      SpringBoneChain._force.addScaledVector(this.gravity, dt * (1 - this.inertia));

      node.prevPos.copy(node.currentPos);
      node.currentPos
        .add(SpringBoneChain._velocity)
        .addScaledVector(SpringBoneChain._force, dt);

      // Rigid bone-length constraint from the parent joint.
      SpringBoneChain._dir
        .subVectors(node.currentPos, SpringBoneChain._parentWorldPos);
      if (SpringBoneChain._dir.lengthSq() < 1e-12) {
        SpringBoneChain._dir.copy(SpringBoneChain._restWorldDir);
      } else {
        SpringBoneChain._dir.normalize();
      }
      node.currentPos
        .copy(SpringBoneChain._parentWorldPos)
        .addScaledVector(SpringBoneChain._dir, node.length);

      // Sphere colliders (head, chest, shoulders), then re-project onto the bone length.
      for (const col of colliders) {
        const minDist = node.radius + col.radius;
        const center = col.kind === 'capsule'
          ? SpringBoneChain.closestPointOnSegment(node.currentPos, col.start, col.end, SpringBoneChain._closest)
          : col.center;
        const dist = node.currentPos.distanceTo(center);
        if (dist >= minDist) continue;

        if (dist > 1e-4) {
          SpringBoneChain._v0.subVectors(node.currentPos, center).normalize();
        } else {
          SpringBoneChain._v0.set(0, 1, 0);
        }
        node.currentPos.copy(center).addScaledVector(SpringBoneChain._v0, minDist);

        // Pushing out of a sphere breaks the length constraint; restore it and keep
        // the pushed-out direction as the new aim.
        SpringBoneChain._dir.subVectors(node.currentPos, SpringBoneChain._parentWorldPos);
        if (SpringBoneChain._dir.lengthSq() < 1e-12) {
          SpringBoneChain._dir.copy(SpringBoneChain._restWorldDir);
        } else {
          SpringBoneChain._dir.normalize();
        }
      }

      // Aim the PARENT bone so this node lands on its simulated position.
      SpringBoneChain._aimDelta.setFromUnitVectors(
        SpringBoneChain._restWorldDir,
        SpringBoneChain._dir,
      );
      SpringBoneChain._newWorldQuat
        .copy(SpringBoneChain._aimDelta)
        .multiply(SpringBoneChain._parentWorldQuat);

      if (parent.parent) {
        parent.parent.getWorldQuaternion(SpringBoneChain._grandparentQuat);
        SpringBoneChain._invParentQuat.copy(SpringBoneChain._grandparentQuat).invert();
        parent.quaternion
          .copy(SpringBoneChain._invParentQuat)
          .multiply(SpringBoneChain._newWorldQuat);
      } else {
        parent.quaternion.copy(SpringBoneChain._newWorldQuat);
      }
      parent.updateMatrixWorld(true);
    }
  }

  private static closestPointOnSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    SpringBoneChain._segment.subVectors(end, start);
    const lengthSq = SpringBoneChain._segment.lengthSq();
    if (lengthSq <= 1e-12) return out.copy(start);
    const t = THREE.MathUtils.clamp(SpringBoneChain._v0.subVectors(point, start).dot(SpringBoneChain._segment) / lengthSq, 0, 1);
    return out.copy(start).addScaledVector(SpringBoneChain._segment, t);
  }
}
