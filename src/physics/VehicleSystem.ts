import * as THREE from 'three';
import type { SceneManager, EntityId } from '../ecs/SceneManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { WorldOrigin } from '../streaming/WorldOrigin';
import { VehicleController, type WheelSpec, type VehicleSpec, type VehicleInput } from './VehiclePhysics';

/**
 * VehicleSystem.ts — the engine-owned registry of live vehicles.
 *
 * The engine loop calls `preStep(fixedDt)` INSIDE the fixed-step physics loop, before
 * `physicsWorld.step()`, so each vehicle's suspension + traction forces are applied
 * this step (Rapier integrates them). The system is the single integration point for
 * the AIBridge `add_vehicle` / `set_vehicle_input` / `remove_vehicle` commands and the
 * HELM `vehicle_status` op.
 *
 * A vehicle is attached to an EXISTING entity (one with a dynamic RigidBodyComponent
 * acting as the chassis). The system does NOT spawn the chassis — the caller does (via
 * `spawn_entity` first, then `add_vehicle` with that entity's id). This keeps the
 * vehicle stack composable: any dynamic body can become a vehicle, including a GLB
 * car model spawned from the asset manifest.
 */

export interface AddVehicleOptions {
  /** Wheel specifications (attach points + suspension + friction). */
  wheels: WheelSpec[];
  /** Vehicle tuning (engine force, brake, steer, downforce, anti-roll). */
  spec?: Partial<VehicleSpec>;
}

export interface VehicleInfo {
  entityId: EntityId;
  speed: number;
  rpm: number;
  input: VehicleInput;
  wheelCount: number;
  wheelsInContact: number;
}

export class VehicleSystem {
  private readonly vehicles = new Map<EntityId, VehicleController>();
  private readonly deps: { physicsWorld: PhysicsWorld; sceneManager: SceneManager; worldOrigin: WorldOrigin };

  constructor(deps: { physicsWorld: PhysicsWorld; sceneManager: SceneManager; worldOrigin: WorldOrigin }) {
    this.deps = deps;
  }

  addVehicle(entityId: EntityId, opts: AddVehicleOptions): VehicleController | null {
    if (this.vehicles.has(entityId)) {
      console.warn(`[VehicleSystem] addVehicle: entity ${entityId} already a vehicle`);
      return this.vehicles.get(entityId)!;
    }
    const rb = this.deps.sceneManager.getRigidBody(entityId);
    if (!rb) {
      console.warn(`[VehicleSystem] addVehicle: entity ${entityId} has no rigid body`);
      return null;
    }
    // The chassis must be dynamic (a fixed body can't be driven).
    if (rb.rapierBody.bodyType() !== this.deps.physicsWorld.RAPIER.RigidBodyType.Dynamic) {
      console.warn(`[VehicleSystem] addVehicle: entity ${entityId} is not dynamic — vehicle physics requires a dynamic chassis`);
      return null;
    }
    const vc = new VehicleController(entityId, rb, opts.wheels, opts.spec, this.deps);
    this.vehicles.set(entityId, vc);
    return vc;
  }

  removeVehicle(entityId: EntityId): void {
    const vc = this.vehicles.get(entityId);
    if (!vc) return;
    vc.dispose();
    this.vehicles.delete(entityId);
  }

  setVehicleInput(entityId: EntityId, input: Partial<VehicleInput>): boolean {
    const vc = this.vehicles.get(entityId);
    if (!vc) return false;
    vc.setInput(input);
    return true;
  }

  getVehicleInput(entityId: EntityId): VehicleInput | null {
    const vc = this.vehicles.get(entityId);
    return vc ? { ...vc.input } : null;
  }

  getVehicleInfo(entityId: EntityId): VehicleInfo | null {
    const vc = this.vehicles.get(entityId);
    if (!vc) return null;
    let inContact = 0;
    for (const w of vc.wheelStates) if (w.inContact) inContact++;
    return {
      entityId,
      speed: vc.speed,
      rpm: vc.rpm,
      input: { ...vc.input },
      wheelCount: vc.wheelStates.length,
      wheelsInContact: inContact,
    };
  }

  listVehicles(): VehicleInfo[] {
    return [...this.vehicles.keys()].map((id) => this.getVehicleInfo(id)!);
  }

  get vehicleCount(): number { return this.vehicles.size; }

  /** Per-fixed-step update — called by the engine loop BEFORE physicsWorld.step().
   *  `fixedDt` is the physics timestep (from Time.FIXED_DT); threaded into every
   *  vehicle controller so impulse magnitudes + spin rates scale with it. */
  preStep(fixedDt: number): void {
    for (const vc of this.vehicles.values()) vc.preStep(fixedDt);
  }

  dispose(): void {
    for (const vc of this.vehicles.values()) vc.dispose();
    this.vehicles.clear();
  }
}
