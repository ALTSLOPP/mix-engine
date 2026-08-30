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

    // 2. Check for nearby civilian driver
    const civilianSystem = this.engine.gameplayFeatures?.civilian;
    let ejectedDriverId: string | null = null;
    if (civilianSystem) {
      const civs = civilianSystem.getCivilians();
      for (const civ of civs) {
        if (civ.mode === 'driving' && civ.position.distanceTo(playerPos) <= this.config.theftRange) {
          const ejectDir = playerRb.mesh.quaternion ? new THREE.Vector3(1, 0, 0).applyQuaternion(playerRb.mesh.quaternion) : new THREE.Vector3(1, 0, 0);
          civilianSystem.ejectDriver(civ.id, ejectDir);
          ejectedDriverId = civ.id;
          break;
        }
      }
    }

    if (nearestTraffic) {
      trafficSystem?.claimCarForPlayer?.(nearestTraffic.carId);

      // Report crime
      const wantedSystem = this.engine.gameplayFeatures?.wanted;
      if (wantedSystem) {
        wantedSystem.reportCrime('vehicle_theft', playerPos);
      }

      this.engine.sceneManager?.events?.emit('vehicle_hijacked', {
        carId: nearestTraffic.carId,
        position: nearestTraffic.position,
        wasOccupied: ejectedDriverId !== null,
        driverId: ejectedDriverId,
      });

      return {
        success: true,
        vehicleId: nearestTraffic.carId,
        wasOccupied: ejectedDriverId !== null,
      };
    }

    return { success: false };
  }
}
