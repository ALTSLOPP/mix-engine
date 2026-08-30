import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './PhysicsWorld';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { RigidBodyComponent } from './RigidBodyComponent';

export type JointType = 'fixed' | 'spherical' | 'revolute' | 'prismatic' | 'rope' | 'spring';

export interface JointMotorConfig {
  targetVelocity: number;
  maxForce: number;
  stiffness?: number;
  damping?: number;
}

export interface JointConfig {
  id?: string;
  type: JointType;
  entityA: EntityId;
  entityB: EntityId;
  anchorA: { x: number; y: number; z: number };
  anchorB: { x: number; y: number; z: number };
  axisA?: { x: number; y: number; z: number };
  axisB?: { x: number; y: number; z: number };
  limits?: [min: number, max: number];
  motor?: JointMotorConfig;
  breakForce?: number;
}

export interface JointInstance {
  id: string;
  config: JointConfig;
  rapierJoint: RAPIER.ImpulseJoint;
  breakForce?: number;
}

export class JointSystem {
  private readonly joints = new Map<string, JointInstance>();
  private nextJointId = 1;

  constructor(
    private readonly physicsWorld: PhysicsWorld,
    private readonly sceneManager: SceneManager,
  ) {}

  createJoint(config: JointConfig): string {
    const id = config.id ?? `joint_${this.nextJointId++}`;
    const rbA = this.sceneManager.getComponent<RigidBodyComponent>(config.entityA, 'rigidBody');
    const rbB = this.sceneManager.getComponent<RigidBodyComponent>(config.entityB, 'rigidBody');

    if (!rbA || !rbB) {
      console.warn(`[JointSystem] Cannot create joint '${id}': entities missing rigid bodies`);
      return id;
    }

    const bodyA = rbA.rapierBody;
    const bodyB = rbB.rapierBody;
    const R = this.physicsWorld.RAPIER;

    let jointData: RAPIER.JointData;
    const pA = config.anchorA;
    const pB = config.anchorB;
    const axA = config.axisA ?? { x: 1, y: 0, z: 0 };
    const axB = config.axisB ?? { x: 1, y: 0, z: 0 };

    switch (config.type) {
      case 'fixed': {
        const frameA = new THREE.Matrix4().identity();
        const frameB = new THREE.Matrix4().identity();
        jointData = R.JointData.fixed(
          pA,
          { x: 0, y: 0, z: 0, w: 1 },
          pB,
          { x: 0, y: 0, z: 0, w: 1 },
        );
        break;
      }
      case 'spherical': {
        jointData = R.JointData.spherical(pA, pB);
        break;
      }
      case 'revolute': {
        const rev = R.JointData.revolute(pA, pB, axA);
        if (config.limits) {
          rev.limitsEnabled = true;
          rev.limits = [config.limits[0], config.limits[1]];
        }
        jointData = rev;
        break;
      }
      case 'prismatic': {
        const pris = R.JointData.prismatic(pA, pB, axA);
        if (config.limits) {
          pris.limitsEnabled = true;
          pris.limits = [config.limits[0], config.limits[1]];
        }
        jointData = pris;
        break;
      }
      case 'rope': {
        const maxDist = Math.hypot(pA.x - pB.x, pA.y - pB.y, pA.z - pB.z);
        jointData = (R.JointData as any).rope(Math.max(maxDist, 0.1), pA, pB);
        break;
      }
      case 'spring': {
        const restDist = Math.hypot(pA.x - pB.x, pA.y - pB.y, pA.z - pB.z);
        const stiffness = config.motor?.stiffness ?? 100.0;
        const damping = config.motor?.damping ?? 10.0;
        jointData = (R.JointData as any).spring(restDist, stiffness, damping, pA, pB);
        break;
      }
      default:
        throw new Error(`Unsupported joint type: ${config.type}`);
    }

    const rapierJoint = this.physicsWorld.rawWorld.createImpulseJoint(
      jointData,
      bodyA,
      bodyB,
      true,
    );

    if (config.motor && config.type === 'revolute') {
      (rapierJoint as any).configureMotorVelocity?.(
        config.motor.targetVelocity,
        config.motor.maxForce,
      );
    }

    this.joints.set(id, {
      id,
      config,
      rapierJoint,
      breakForce: config.breakForce,
    });

    return id;
  }

  /** Reserve an id now and create the Rapier joint at the Step 8 mutation flush. */
  requestCreateJoint(config: JointConfig): string {
    const id = config.id ?? `joint_${this.nextJointId++}`;
    this.sceneManager.queueDeferredOp({
      kind: 'jointAttach',
      fn: () => { this.createJoint({ ...config, id }); },
    });
    return id;
  }

  requestRemoveJoint(id: string): void {
    this.sceneManager.queueDeferredOp({ kind: 'jointDetach', fn: () => { this.removeJoint(id); } });
  }

  removeJoint(id: string): boolean {
    const instance = this.joints.get(id);
    if (!instance) return false;

    this.physicsWorld.rawWorld.removeImpulseJoint(instance.rapierJoint, true);
    this.joints.delete(id);
    return true;
  }

  getJoint(id: string): JointInstance | undefined {
    return this.joints.get(id);
  }

  allJoints(): JointInstance[] {
    return Array.from(this.joints.values());
  }

  fixedStep(_fixedDt: number): void {
    // Check break forces
    for (const [id, j] of Array.from(this.joints.entries())) {
      if (j.breakForce && j.breakForce > 0) {
        // Estimate reaction force
        const bodyA = j.rapierJoint.body1();
        const bodyB = j.rapierJoint.body2();
        if (bodyA && bodyB) {
          const vA = bodyA.linvel();
          const vB = bodyB.linvel();
          const relVel = Math.hypot(vA.x - vB.x, vA.y - vB.y, vA.z - vB.z);
          const mass = bodyA.mass() + bodyB.mass();
          const impulseEst = relVel * mass;
          if (impulseEst > j.breakForce) {
            this.removeJoint(id);
            this.sceneManager.events.emit('joint_broken', {
              jointId: id,
              entityA: j.config.entityA,
              entityB: j.config.entityB,
            });
          }
        }
      }
    }
  }

  clear(): void {
    for (const j of this.joints.values()) {
      this.physicsWorld.rawWorld.removeImpulseJoint(j.rapierJoint, true);
    }
    this.joints.clear();
  }
}
