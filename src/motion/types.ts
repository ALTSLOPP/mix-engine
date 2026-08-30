import * as THREE from 'three';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import type { CanonicalBone } from '../animation/SkeletonProfile';

export type MotionPlayStatus = 'playing' | 'paused' | 'stopped' | 'interrupted' | 'completed';

export type FadeMode = 'fixedDuration' | 'fixedSpeed' | 'normalizedDuration';

export type EasingType =
  | 'linear'
  | 'quadIn'
  | 'quadOut'
  | 'quadInOut'
  | 'cubicIn'
  | 'cubicOut'
  | 'cubicInOut'
  | 'sineIn'
  | 'sineOut'
  | 'sineInOut'
  | 'smoothstep';

export type RootMotionMode =
  | 'off'
  | 'extractOnly'
  | 'applyPhysics'
  | 'consumePartially'
  | 'xzOnly'
  | 'yawOnly';

export type LayerBlendMode = 'override' | 'additive';

export interface MotionEventPayload {
  name: string;
  time: number;
  normalizedTime?: number;
  parameters?: Record<string, unknown>;
  clipId?: string;
  stateId?: string;
  layerIndex?: number;
}

export type MotionEventListener = (payload: MotionEventPayload) => void;

export interface MotionEventDef {
  name: string;
  time: number;
  isNormalized?: boolean;
  parameters?: Record<string, unknown>;
  /** If true, fires once per loop cycle. Default true. */
  fireOnLoop?: boolean;
}

export interface PlayOptions {
  layer?: string | number;
  fade?: number;
  fadeMode?: FadeMode;
  easing?: EasingType;
  speed?: number;
  startTime?: number;
  normalizedStartTime?: number;
  loop?: boolean;
  rootMotion?: RootMotionMode;
  events?: MotionEventDef[];
  mask?: string | MotionMaskDef | any;
  weight?: number;
  interruptionPolicy?: 'immediate' | 'queue' | 'rejectIfBusy' | 'crossfade';
  aliases?: string[];
  tags?: string[];
  isPersistent?: boolean;
}

export interface MotionMaskDef {
  name?: string;
  baseWeight?: number;
  /** Bone name or canonical bone name -> weight (0.0 to 1.0) */
  boneWeights: Record<string | CanonicalBone, number>;
  /** Whether child bones inherit parent bone weight if not explicitly specified */
  hierarchical?: boolean;
}

export interface MotionStateInfo {
  id: string;
  type: string;
  clipName?: string;
  time: number;
  normalizedTime: number;
  duration: number;
  speed: number;
  weight: number;
  targetWeight: number;
  fadeDuration: number;
  fadeProgress: number;
  loop: boolean;
  status: MotionPlayStatus;
  layer: number;
  maskName?: string;
  activeEvents: string[];
  rootMotion: RootMotionMode;
  tags?: string[];
  aliases?: string[];
  metadata?: Record<string, unknown>;
}

export interface MotionLayerInfo {
  index: number;
  name: string;
  weight: number;
  targetWeight: number;
  blendMode: LayerBlendMode;
  maskName?: string;
  activeStateId: string | null;
  activeStates: MotionStateInfo[];
}

export interface MotionGraphInspection {
  entityId?: number;
  activeLayerCount: number;
  layers: MotionLayerInfo[];
  parameters: Record<string, unknown>;
  rootMotion: {
    mode: RootMotionMode;
    lastDelta: [number, number, number];
    lastRotationDelta?: [number, number, number, number];
    lastYawDelta?: number;
    accumulatedWorld: [number, number, number];
  };
  eventHistory: Array<{ name: string; timestamp: number; stateId: string }>;
  stats: {
    activeStateCount: number;
    activeActionCount: number;
    frameTimeMs: number;
  };
}

export interface AwaitResult {
  completed: boolean;
  interrupted: boolean;
  cancelled: boolean;
  reason?: 'event' | 'end' | 'fade_complete' | 'normalized_time' | 'cancelled' | 'destroyed' | 'timeout' | 'interrupted';
  eventName?: string;
  elapsed: number;
}




