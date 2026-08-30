import type * as THREE from 'three';

export type RoadAlgorithm = 'Grid' | 'Organic' | 'Radial';
export type RoadType = 'highway' | 'avenue' | 'collector' | 'local' | 'alley';

export interface Point2D {
  x: number;
  z: number;
}

export interface RoadSegment {
  id: string;
  p1: Point2D;
  p2: Point2D;
  width: number;
  type: RoadType;
  speedLimit: number;
  elevation1?: number;
  elevation2?: number;
  hasBridge?: boolean;
}

export interface Intersection {
  id: string;
  position: Point2D;
  connectedRoadIds: string[];
  type: '3way' | '4way' | 'roundabout' | 'dead_end';
  hasTrafficLights?: boolean;
}

export type DistrictType =
  | 'downtown'
  | 'residential'
  | 'industrial'
  | 'civic'
  | 'waterfront'
  | 'park';

export interface Lot {
  id: string;
  blockId: string;
  frontagePoint: Point2D;
  center: Point2D;
  width: number;
  depth: number;
  rotation: number;
  district: DistrictType;
  setback: number;
  elevation: number;
  buildingId?: string;
}

export interface CityBlock {
  id: string;
  polygon: Point2D[];
  district: DistrictType;
  lotIds: string[];
}

export interface BuildingInstance {
  id: string;
  lotId: string;
  position: { x: number; y: number; z: number };
  width: number;
  depth: number;
  height: number;
  floors: number;
  rotation: number;
  district: DistrictType;
  facadeColor: number;
  roofType: 'flat' | 'sloped' | 'helipad' | 'hvac_parapet';
  hasFoundationRetainingWall: boolean;
  foundationHeight: number;
}

export interface BridgeSpan {
  id: string;
  roadId: string;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  length: number;
  pillarCount: number;
  clearanceHeight: number;
}

export interface PropInstance {
  id: string;
  type:
    | 'streetlight'
    | 'traffic_light'
    | 'fire_hydrant'
    | 'bus_shelter'
    | 'bench'
    | 'trash_can'
    | 'dumpster'
    | 'utility_pole';
  position: { x: number; y: number; z: number };
  rotation: number;
}

export interface VegetationInstance {
  id: string;
  type: 'canopy_tree' | 'street_tree' | 'bush' | 'grass_cluster' | 'planter';
  position: { x: number; y: number; z: number };
  scale: number;
  rotation: number;
}

export interface CityDNA {
  seed: number;
  name: string;
  archetype: 'metropolis' | 'cyberpunk' | 'coastal' | 'suburban' | 'industrial';
  density: number;
  roadGridSkew: number;
  wealthBias: number;
  greeneryRatio: number;
  highriseRatio: number;
}

export interface BlueprintCell {
  type: 'empty' | 'road' | 'building' | 'park' | 'water' | 'tree';
  district?: DistrictType;
  height?: number;
  rotation?: number;
}

export interface CityBlueprint {
  name: string;
  gridSize: number;
  cellSize: number;
  grid: BlueprintCell[][];
}

export interface CityGenerationConfig {
  worldSize?: number;
  seed?: number;
  dna?: Partial<CityDNA>;
  roadAlgorithm?: RoadAlgorithm;
  roadDensity?: number;
  enableSidewalks?: boolean;
  enableLaneMarkings?: boolean;
  enableBuildings?: boolean;
  enableStreetProps?: boolean;
  enableVegetation?: boolean;
  enableBridges?: boolean;
  terrainSampler?: (x: number, z: number) => number;
  waterSampler?: (x: number, z: number) => boolean;
}
