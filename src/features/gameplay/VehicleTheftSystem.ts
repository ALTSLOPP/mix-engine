import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { VehicleTheftConfig } from './types';

export const DEFAULT_VEHICLE_THEFT_CONFIG: VehicleTheftConfig = {
  enabled: true,
  theftRange: 4.5,
  ejectionImpulse: 8.0,
  stolenCarWantedEscalation: 1,
};

export class VehicleTheftSystem {
  private config: VehicleTheftConfig;

  constructor(private readonly engine: Engine, initialConfig: VehicleTheftConfig = DEFAULT_VEHICLE_THEFT_CONFIG) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<VehicleTheftConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<VehicleTheftConfig> {
    return this.config;
  }

  attemptHijack(): { success: boolean; vehicleId?: string; wasOccupied?: boolean } {
    if (!this.config.enabled) return { success: false };

    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    if (!playerRb) return { success: false };

    const playerPos = playerRb.mesh.position;

    // 1. Check for nearby traffic car
    const trafficSystem = this.engine.gameplayFeatures?.traffic;
    const nearestTraffic = trafficSystem?.findNearestHijackable?.(playerPos, this.config.theftRange);

    if (!nearestTraffic) return { success: false };
    const civilianSystem = this.engine.gameplayFeatures?.civilian;
    const driver = civilianSystem?.getCivilians().find(c => c.id === nearestTraffic.driverId && c.mode === 'driving');
    // Claim is the transaction boundary: rejected claims cannot eject anyone or create crime.
    if (!trafficSystem?.claimCarForPlayer(nearestTraffic.carId)) return { success: false };
    const driverId = driver?.id ?? null;
    if (driver) civilianSystem!.ejectDriver(driver.id, new THREE.Vector3(1, 0, 0).applyQuaternion(playerRb.mesh.quaternion));
    const event = {
      carId: nearestTraffic.carId, position: nearestTraffic.position,
      wasOccupied: driverId !== null, driverId,
    };
    this.engine.sceneManager.events.emit('vehicle_theft_committed', event);
    this.engine.sceneManager.events.emit('vehicle_hijacked', event);
    return { success: true, vehicleId: nearestTraffic.carId, wasOccupied: driverId !== null };
  }
}
