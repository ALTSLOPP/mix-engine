import type * as THREE from 'three';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';

export type EaseName =
  | 'linear'
  | 'sineIn'
  | 'sineOut'
  | 'sineInOut'
  | 'quadIn'
  | 'quadOut'
  | 'quadInOut'
  | 'cubicIn'
  | 'cubicOut'
  | 'cubicInOut'
  | 'quartIn'
  | 'quartOut'
  | 'quartInOut'
  | 'quintIn'
  | 'quintOut'
  | 'quintInOut'
  | 'expoIn'
  | 'expoOut'
  | 'expoInOut'
  | 'circIn'
  | 'circOut'
  | 'circInOut'
  | 'backIn'
  | 'backOut'
  | 'backInOut'
  | 'elasticIn'
  | 'elasticOut'
  | 'elasticInOut'
  | 'bounceIn'
  | 'bounceOut'
  | 'bounceInOut'
  | 'smoothstep'
  | 'smootherstep';

export type EaseFunction = (t: number) => number;
export type EaseType = EaseName | EaseFunction | string;

export interface EaseParams {
  overshoot?: number;
  amplitude?: number;
  period?: number;
  bezier?: [number, number, number, number];
}

export type LoopType = 'restart' | 'yoyo' | 'incremental';
export type UpdateMode = 'normal' | 'unscaled' | 'fixed' | 'manual';

export type ConflictPolicy =
  | 'replace'
  | 'reject_if_busy'
  | 'queue'
  | 'blend'
  | 'additive'
  | 'multiply'
  | 'highest_priority'
  | 'complete_previous'
  | 'cancel_previous';

export type PhysicsPolicy =
  | 'visual_only'
  | 'kinematic'
  | 'dynamic_target'
  | 'dynamic_force'
  | 'teleport'
  | 'physics_safe_rotation';

export type TweenStatus = 'idle' | 'playing' | 'paused' | 'completed' | 'killed';

export type TweenInterruptionReason =
  | 'completed'
  | 'cancelled'
  | 'replaced'
  | 'destroyed_target'
  | 'timed_out'
  | 'invalid_target'
  | 'validation_failure'
  | 'manual_kill';

export type TweenTarget = Record<string, any> | object;

export interface TweenCallbacks {
  onStart?: () => void;
  onUpdate?: (progress: number, currentVal?: any) => void;
  onStep?: (stepIndex: number) => void;
  onLoop?: (loopIndex: number) => void;
  onComplete?: () => void;
  onKill?: (reason: TweenInterruptionReason) => void;
  onPause?: () => void;
  onResume?: () => void;
  onRewind?: () => void;
}

export interface TweenOptions extends TweenCallbacks {
  duration?: number;
  delay?: number;
  ease?: EaseType;
  easeParams?: EaseParams;
  loops?: number;
  loopType?: LoopType;
  loopDelay?: number;
  timeScale?: number;
  autoPlay?: boolean;
  autoKill?: boolean;
  updateMode?: UpdateMode;
  conflictPolicy?: ConflictPolicy;
  priority?: number;
  physicsPolicy?: PhysicsPolicy;
  id?: string;
  tag?: string;
  stringMode?: 'typewriter' | 'scramble' | 'numeric';
  scrambleCharset?: string;
}

export interface SequenceOptions extends TweenCallbacks {
  id?: string;
  tag?: string;
  timeScale?: number;
  autoPlay?: boolean;
  autoKill?: boolean;
  updateMode?: UpdateMode;
  loops?: number;
  loopType?: LoopType;
  loopDelay?: number;
  conflictPolicy?: ConflictPolicy;
}

export interface SerializedTweenTrack {
  target: {
    entityId?: number;
    entityName?: string;
    ref?: string;
    path?: string;
  };
  property: string;
  from?: any;
  to: any;
  start: number;
  duration: number;
  ease?: string;
  easeParams?: EaseParams;
  loops?: number;
  loopType?: LoopType;
  conflictPolicy?: ConflictPolicy;
  physicsPolicy?: PhysicsPolicy;
  stringMode?: string;
}

export interface SerializedMarker {
  name: string;
  time: number;
}

export interface SerializedSequence {
  id: string;
  version: number;
  clock?: UpdateMode;
  loops?: number;
  loopType?: LoopType;
  defaults?: {
    ease?: string;
    conflictPolicy?: ConflictPolicy;
    duration?: number;
  };
  tracks: SerializedTweenTrack[];
  markers?: SerializedMarker[];
}

export interface TweenDiagnosticReport {
  activeTweenCount: number;
  activeSequenceCount: number;
  poolUsage: {
    vector3: number;
    quaternion: number;
    euler: number;
    color: number;
    tweenNodes: number;
  };
  activeTweens: Array<{
    id: string;
    targetName: string;
    property: string;
    status: TweenStatus;
    elapsed: number;
    duration: number;
    progress: number;
    loopCount: number;
    ease: string;
    conflictPolicy: ConflictPolicy;
    currentValue: any;
  }>;
  activeSequences: Array<{
    id: string;
    status: TweenStatus;
    elapsed: number;
    duration: number;
    progress: number;
    timeScale: number;
    activeTrackCount: number;
  }>;
  warnings: string[];
  errors: string[];
}
