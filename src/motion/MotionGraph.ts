import * as THREE from 'three';
import type { RigidBodyComponent } from '../physics/RigidBodyComponent';
import { ClipState } from './ClipState';
import { MotionHandle } from './MotionHandle';
import { MotionLayer } from './MotionLayer';
import { MotionMask } from './MotionMask';
import { MotionParameterStore } from './MotionParameterStore';
import type { MotionState } from './MotionState';
import { TransitionLibrary, type MotionTransition } from './TransitionLibrary';
import type {
  LayerBlendMode,
  MotionGraphInspection,
  MotionLayerInfo,
  PlayOptions,
  RootMotionMode,
} from './types';


/**
 * MotionGraph — Code-driven root motion director orchestrator per animated entity.
 */
export class MotionGraph {
  readonly entityId?: number;
  readonly rb?: RigidBodyComponent;
  readonly rootObject: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly parameters = new MotionParameterStore();
  readonly transitions = new TransitionLibrary();

  private layers: MotionLayer[] = [];
  private layerByName = new Map<string, MotionLayer>();
  private clips = new Map<string, THREE.AnimationClip>();
  private rootTracks = new Map<string, THREE.VectorKeyframeTrack | null>();
  private rootRotTracks = new Map<string, THREE.QuaternionKeyframeTrack | null>();
  private activeHandles = new Map<string, MotionHandle>();
  private masks = new Map<string, MotionMask>();

  private defaultRootMotionMode: RootMotionMode = 'applyPhysics';
  private frameRootDelta = new THREE.Vector3();
  private frameAppliedRootDelta = new THREE.Vector3();
  private frameRootRotDelta = new THREE.Quaternion();
  private frameAppliedRootRotDelta = new THREE.Quaternion();

  private tempRootDelta = new THREE.Vector3();
  private tempRootRot = new THREE.Quaternion();
  private tempWorldDelta = new THREE.Vector3();
  private accumulatedWorldDelta = new THREE.Vector3();
  private isPaused = false;
  private stateCounter = 0;

  // Debug event history
  private eventHistory: Array<{ name: string; timestamp: number; stateId: string }> = [];

  constructor(
    root: THREE.Object3D,
    options: {
      rb?: RigidBodyComponent;
      entityId?: number;
      defaultRootMotion?: RootMotionMode;
    } = {},
  ) {
    this.rootObject = root;
    this.rb = options.rb;
    this.entityId = options.entityId;
    this.defaultRootMotionMode = options.defaultRootMotion ?? 'applyPhysics';
    this.mixer = new THREE.AnimationMixer(root);

    // Create default base layer
    this.createLayer('base', 0, 'override');
  }

  createLayer(
    name: string,
    index?: number,
    blendMode: LayerBlendMode = 'override',
    maskNameOrDef?: string | MotionMask,
  ): MotionLayer {
    if (this.layerByName.has(name)) {
      return this.layerByName.get(name)!;
    }

    const layerIndex = index !== undefined ? index : this.layers.length;
    let maskObj: MotionMask | null = null;

    if (typeof maskNameOrDef === 'string') {
      maskObj = this.masks.get(maskNameOrDef) ?? MotionMask.fromPreset(maskNameOrDef);
    } else if (maskNameOrDef instanceof MotionMask) {
      maskObj = maskNameOrDef;
    }

    const layer = new MotionLayer(layerIndex, name, blendMode, maskObj);
    this.layers[layerIndex] = layer;
    this.layerByName.set(name, layer);
    return layer;
  }

  getLayer(indexOrName: number | string = 0): MotionLayer | null {
    if (typeof indexOrName === 'string') {
      return this.layerByName.get(indexOrName) ?? null;
    }
    return this.layers[indexOrName] ?? null;
  }

  setLayerWeight(indexOrName: number | string, weight: number, fade = 0.2): void {
    const layer = this.getLayer(indexOrName);
    if (!layer) return;
    if (fade > 0) {
      layer.fadeGroup.fade(weight, fade);
    } else {
      layer.weight = weight;
    }
  }

  registerClip(
    name: string,
    clip: THREE.AnimationClip,
    rootTrack?: THREE.VectorKeyframeTrack | null,
    rootRotTrack?: THREE.QuaternionKeyframeTrack | null,
  ): void {
    this.clips.set(name, clip);
    this.rootTracks.set(
      name,
      rootTrack ?? (clip as unknown as { __rootTrack?: THREE.VectorKeyframeTrack }).__rootTrack ?? null,
    );
    this.rootRotTracks.set(
      name,
      rootRotTrack ?? (clip as unknown as { __rootRotTrack?: THREE.QuaternionKeyframeTrack }).__rootRotTrack ?? null,
    );
  }

  registerTransition(transition: MotionTransition): void {
    this.transitions.register(transition);
  }

  registerMask(mask: MotionMask): void {
    this.masks.set(mask.name, mask);
  }

  hasClip(name: string): boolean {
    return this.clips.has(name) || this.transitions.has(name);
  }

  listClipNames(): string[] {
    return Array.from(new Set([...this.clips.keys(), ...this.transitions.listAll().map((t) => t.clipName)]));
  }

  /**
   * Direct high-level playback method for IDE agents & game code.
   *
   * Example:
   * ```ts
   * const handle = motion.play("combat/heavy_kick", { fade: 0.18, speed: 1.2, layer: "base" });
   * ```
   */
  play(clipNameOrClip: string | THREE.AnimationClip, options: PlayOptions = {}): MotionHandle {
    let clip: THREE.AnimationClip;
    let clipName: string;
    let rootTrack: THREE.VectorKeyframeTrack | null = null;
    let rootRotTrack: THREE.QuaternionKeyframeTrack | null = null;

    if (typeof clipNameOrClip === 'string') {
      clipName = clipNameOrClip;
      let found = this.clips.get(clipName);

      // Check transition library aliases if not found directly
      if (!found && this.transitions.has(clipName)) {
        const trans = this.transitions.get(clipName)!;
        clipName = trans.clipName;
        found = this.clips.get(trans.clipName);
        if (trans.fadeDuration !== undefined && options.fade === undefined) {
          options.fade = trans.fadeDuration;
        }

        if (trans.speed !== undefined && options.speed === undefined) {
          options.speed = trans.speed;
        }
        if (trans.loop !== undefined && options.loop === undefined) {
          options.loop = trans.loop;
        }
        if (trans.rootMotion !== undefined && options.rootMotion === undefined) {
          options.rootMotion = trans.rootMotion;
        }
        if (trans.events && !options.events) {
          options.events = trans.events;
        }
        if (trans.interruptionPolicy && !options.interruptionPolicy) {
          options.interruptionPolicy = trans.interruptionPolicy;
        }
        if (trans.tags && !options.tags) {
          options.tags = trans.tags;
        }
        if (trans.aliases && !options.aliases) {
          options.aliases = trans.aliases;
        }
      }

      if (!found) {
        throw new Error(`[MotionGraph] Clip '${clipName}' has not been registered in MotionGraph`);
      }
      clip = found;
      rootTrack = this.rootTracks.get(clipName) ?? null;
      rootRotTrack = this.rootRotTracks.get(clipName) ?? null;
    } else {
      clip = clipNameOrClip;
      clipName = clip.name || `clip_${++this.stateCounter}`;
      this.registerClip(clipName, clip);
    }

    const layer = this.getLayer(options.layer ?? 0) ?? this.createLayer(String(options.layer ?? 0));

    // Handle 'rejectIfBusy' policy: reject if a non-looping animation is currently playing
    const policy = options.interruptionPolicy ?? 'crossfade';
    if (policy === 'rejectIfBusy') {
      const current = layer.currentState;
      if (current && current.status === 'playing' && !current.loop && current.normalizedTime < 0.99) {
        // Return existing handle if available or create a rejected handle
        const existingHandle = this.activeHandles.get(current.id);
        if (existingHandle) return existingHandle;
      }
    }

    const stateId = `${clipName}_${++this.stateCounter}`;

    // Resolve per-play mask or inherit layer mask
    let effectiveMask: MotionMask | null = layer.mask;
    if (options.mask) {
      if (typeof options.mask === 'string') {
        effectiveMask = this.masks.get(options.mask) ?? MotionMask.fromPreset(options.mask);
      } else if (options.mask instanceof MotionMask) {
        effectiveMask = options.mask;
      } else if (typeof options.mask === 'object' && 'boneWeights' in options.mask) {
        effectiveMask = new MotionMask(options.mask);
      }
    }

    const clipState = new ClipState(stateId, clipName, this.mixer, clip, {
      rootTrack,
      rootRotTrack,
      mask: effectiveMask,
      blendMode: layer.blendMode,
      loop: options.loop ?? true,
      speed: options.speed ?? 1.0,
      events: options.events ?? [],
    });

    if (options.tags) {
      clipState.tags = [...options.tags];
    }
    if (options.aliases) {
      clipState.aliases = [...options.aliases];
    }
    if (options.isPersistent) {
      clipState.isPersistent = true;
    }

    if (options.rootMotion) {
      clipState.rootMotionMode = options.rootMotion;
    } else {
      clipState.rootMotionMode = this.defaultRootMotionMode;
    }

    if (options.startTime !== undefined) {
      clipState.time = options.startTime;
    } else if (options.normalizedStartTime !== undefined) {
      clipState.normalizedTime = options.normalizedStartTime;
    }

    // Attach to layer
    layer.addState(clipState);

    // Apply interruption policy
    const fadeDuration = policy === 'immediate' ? 0 : (options.fade ?? 0.2);
    const easing = options.easing ?? 'linear';

    if (policy === 'queue') {
      layer.queue(stateId, fadeDuration, easing);
    } else {
      layer.play(stateId, fadeDuration, easing);
    }

    // Create & register handle
    const handle = new MotionHandle(clipState);
    this.activeHandles.set(stateId, handle);

    // Record history
    clipState.eventTrack.onAny((payload) => {
      this.eventHistory.push({
        name: payload.name,
        timestamp: performance.now(),
        stateId,
      });
      if (this.eventHistory.length > 50) {
        this.eventHistory.shift();
      }
    });

    return handle;
  }

  getStatesWithTag(tag: string): MotionState[] {
    const matched: MotionState[] = [];
    for (const layer of this.layers) {
      if (!layer) continue;
      for (const state of layer.getAllStates()) {
        if (state.tags.includes(tag)) {
          matched.push(state);
        }
      }
    }
    return matched;
  }

  hasTag(tag: string): boolean {
    return this.getStatesWithTag(tag).some((s) => s.status === 'playing' || s.weight > 0);
  }

  stopByTag(tag: string, fade = 0.2): void {
    for (const state of this.getStatesWithTag(tag)) {
      if (fade > 0) {
        state.fadeOut(fade, 'linear', () => state.stop());
      } else {
        state.stop();
      }
    }
  }

  stop(fade = 0.2, layer?: string | number): void {
    if (layer !== undefined) {
      this.getLayer(layer)?.stop(fade);
    } else {
      for (const l of this.layers) {
        if (l) l.stop(fade);
      }
    }
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  update(dt: number): void {
    if (this.isPaused || dt <= 0) return;

    // Update parameters
    this.parameters.update(dt);

    // Update state weights/time first so the mixer consumes this frame's values,
    // rather than applying fades and speed changes one frame late.
    this.frameRootDelta.set(0, 0, 0);
    this.frameAppliedRootDelta.set(0, 0, 0);
    this.frameRootRotDelta.identity();
    this.frameAppliedRootRotDelta.identity();

    for (const layer of this.layers) {
      if (!layer) continue;
      layer.update(dt);
      this.frameRootDelta.add(layer.extractRootDelta(this.tempRootDelta));
      this.frameAppliedRootDelta.add(layer.extractAppliedRootDelta(this.tempRootDelta));

      layer.extractRootRotationDelta(this.tempRootRot);
      if (this.tempRootRot.x !== 0 || this.tempRootRot.y !== 0 || this.tempRootRot.z !== 0 || this.tempRootRot.w !== 1) {
        this.frameRootRotDelta.multiply(this.tempRootRot);
      }

      layer.extractAppliedRootRotationDelta(this.tempRootRot);
      if (this.tempRootRot.x !== 0 || this.tempRootRot.y !== 0 || this.tempRootRot.z !== 0 || this.tempRootRot.w !== 1) {
        this.frameAppliedRootRotDelta.multiply(this.tempRootRot);
      }
    }

    this.mixer.update(dt);

    // Update pending handle promises and prune stale handles
    for (const handle of this.activeHandles.values()) {
      handle.update();
      if (handle.state.status === 'stopped' && handle.state.weight <= 0 && !handle.state.isPersistent) {
        this.activeHandles.delete(handle.id);
      }
    }

    // Apply root motion to physics if enabled
    if (this.rb) {
      const hasTranslation = this.frameAppliedRootDelta.lengthSq() > 0;
      const hasRotation =
        this.frameAppliedRootRotDelta.x !== 0 ||
        this.frameAppliedRootRotDelta.y !== 0 ||
        this.frameAppliedRootRotDelta.z !== 0 ||
        this.frameAppliedRootRotDelta.w !== 1;

      if (hasTranslation || hasRotation) {
        const worldDelta = this.tempWorldDelta.copy(this.frameAppliedRootDelta).applyQuaternion(this.rb.mesh.quaternion);
        this.accumulatedWorldDelta.add(worldDelta);
        this.rb.accumulateRootMotion(worldDelta, dt, this.frameAppliedRootRotDelta);
      }
    }
  }

  getRootMotionDelta(): THREE.Vector3 {
    return this.frameRootDelta.clone();
  }

  getRootMotionRotationDelta(): THREE.Quaternion {
    return this.frameRootRotDelta.clone();
  }

  inspect(): MotionGraphInspection {
    const layerInfos: MotionLayerInfo[] = this.layers
      .filter(Boolean)
      .map((l) => l.getInfo());

    let activeStateCount = 0;
    for (const l of layerInfos) {
      activeStateCount += l.activeStates.length;
    }

    const yawAngle = 2 * Math.atan2(this.frameRootRotDelta.y, this.frameRootRotDelta.w);

    return {
      entityId: this.entityId,
      activeLayerCount: this.layers.filter(Boolean).length,
      layers: layerInfos,
      parameters: this.parameters.toJSON(),
      rootMotion: {
        mode: this.defaultRootMotionMode,
        lastDelta: [this.frameRootDelta.x, this.frameRootDelta.y, this.frameRootDelta.z],
        lastRotationDelta: [
          this.frameRootRotDelta.x,
          this.frameRootRotDelta.y,
          this.frameRootRotDelta.z,
          this.frameRootRotDelta.w,
        ],
        lastYawDelta: yawAngle,
        accumulatedWorld: [
          this.accumulatedWorldDelta.x,
          this.accumulatedWorldDelta.y,
          this.accumulatedWorldDelta.z,
        ],
      },
      eventHistory: [...this.eventHistory],
      stats: {
        activeStateCount,
        activeActionCount: (this.mixer as unknown as { _actions?: unknown[] })._actions?.length ?? activeStateCount,
        frameTimeMs: 0,
      },
    };
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const h of this.activeHandles.values()) {
      h.dispose();
    }
    this.activeHandles.clear();
    for (const l of this.layers) {
      if (l) l.dispose();
    }
    this.layers = [];
    this.layerByName.clear();
    this.clips.clear();
    this.rootTracks.clear();
    this.rootRotTracks.clear();
  }
}

