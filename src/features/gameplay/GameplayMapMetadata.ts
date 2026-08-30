import * as THREE from 'three';
import type { TeamId } from './ArenaMatchModes';

export interface SpawnPointMetadata {
  id: string;
  position: THREE.Vector3;
  yaw: number;
  team?: TeamId | 'ffa';
}

export interface CoverPointMetadata {
  id: string;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  type: 'low' | 'high';
  width?: number;
  height?: number;
}

export interface FlagBaseMetadata {
  team: TeamId;
  position: THREE.Vector3;
}

export interface PatrolWaypointMetadata {
  id: string;
  position: THREE.Vector3;
  group?: string;
}

export interface GameplayMapMetadata {
  mapName: string;
  version: number;
  bounds: { min: THREE.Vector3; max: THREE.Vector3 };
  spawnPoints: SpawnPointMetadata[];
  coverPoints: CoverPointMetadata[];
  flagBases: FlagBaseMetadata[];
  patrolWaypoints: PatrolWaypointMetadata[];
}

export function createDefaultArenaMetadata(): GameplayMapMetadata {
  return {
    mapName: 'Shooter Arena Alpha',
    version: 1,
    bounds: {
      min: new THREE.Vector3(-35, 0, -35),
      max: new THREE.Vector3(35, 10, 35),
    },
    spawnPoints: [
      { id: 'sp_ffa_0', position: new THREE.Vector3(0, 0, 24), yaw: Math.PI, team: 'ffa' },
      { id: 'sp_ffa_1', position: new THREE.Vector3(0, 0, -24), yaw: 0, team: 'ffa' },
      { id: 'sp_ffa_2', position: new THREE.Vector3(-24, 0, 0), yaw: Math.PI * 0.5, team: 'ffa' },
      { id: 'sp_ffa_3', position: new THREE.Vector3(24, 0, 0), yaw: -Math.PI * 0.5, team: 'ffa' },
      { id: 'sp_htr_0', position: new THREE.Vector3(-26, 0, -6), yaw: Math.PI * 0.5, team: 'heaters' },
      { id: 'sp_htr_1', position: new THREE.Vector3(-26, 0, 6), yaw: Math.PI * 0.5, team: 'heaters' },
      { id: 'sp_rlr_0', position: new THREE.Vector3(26, 0, -6), yaw: -Math.PI * 0.5, team: 'rollers' },
      { id: 'sp_rlr_1', position: new THREE.Vector3(26, 0, 6), yaw: -Math.PI * 0.5, team: 'rollers' },
    ],
    flagBases: [
      { team: 'heaters', position: new THREE.Vector3(-25, 0, 0) },
      { team: 'rollers', position: new THREE.Vector3(25, 0, 0) },
    ],
    coverPoints: [
      { id: 'cp_mid_left', position: new THREE.Vector3(-10, 0, -8), normal: new THREE.Vector3(1, 0, 0), type: 'low' },
      { id: 'cp_mid_right', position: new THREE.Vector3(10, 0, -8), normal: new THREE.Vector3(-1, 0, 0), type: 'low' },
      { id: 'cp_mid_south_l', position: new THREE.Vector3(-10, 0, 8), normal: new THREE.Vector3(1, 0, 0), type: 'high' },
      { id: 'cp_mid_south_r', position: new THREE.Vector3(10, 0, 8), normal: new THREE.Vector3(-1, 0, 0), type: 'high' },
      { id: 'cp_center_w', position: new THREE.Vector3(-4, 0, 0), normal: new THREE.Vector3(1, 0, 0), type: 'low' },
      { id: 'cp_center_e', position: new THREE.Vector3(4, 0, 0), normal: new THREE.Vector3(-1, 0, 0), type: 'low' },
    ],
    patrolWaypoints: [
      { id: 'wp_0', position: new THREE.Vector3(-15, 0, -15) },
      { id: 'wp_1', position: new THREE.Vector3(15, 0, -15) },
      { id: 'wp_2', position: new THREE.Vector3(15, 0, 15) },
      { id: 'wp_3', position: new THREE.Vector3(-15, 0, 15) },
    ],
  };
}
