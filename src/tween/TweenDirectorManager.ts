import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import { Tween } from './Tween';
import { TweenHandle } from './TweenHandle';
import { TweenSequence } from './TweenSequence';
import { TweenGraph } from './TweenGraph';
import { TweenClock } from './TweenClock';
import { TweenDiagnostics } from './TweenDiagnostics';
import { TweenHelpers } from './TweenHelpers';
import { TweenTargetResolver } from './TweenTargetResolver';
import { TweenValueAdapter } from './TweenValueAdapter';
import { TweenPool } from './TweenPool';
import type { PathOptions } from './TweenPath';
import type {
  SequenceOptions,
  TweenDiagnosticReport,
  TweenInterruptionReason,
  TweenOptions,
  UpdateMode,
} from './types';

export class TweenDirectorManager {
  readonly clock = new TweenClock();

  private standaloneTweens = new Set<Tween>();
  private activeSequenceSet = new Set<TweenSequence>();
  private graphsByEntity = new Map<number, TweenGraph>();
  private graphsByObject = new Map<any, TweenGraph>();

  constructor(public readonly engine?: Engine) {}

  // --- Fluent Primary Tween Creation API ---

  /**
   * Tween a target property or multiple properties to target values.
   * Examples:
   *   engine.tweens.to(mesh.position, 'y', 5, { duration: 1 })
   *   engine.tweens.to(mesh.position, { x: 10, y: 2, z: -4 }, { duration: 1.2 })
   *   engine.tweens.to(entity, { 'transform.position.y': 3, 'material.opacity': 0 }, { duration: 0.8 })
   */
  to(
    target: any,
    propertyOrValues: string | Record<string, any>,
    toValueOrOptions?: any,
    maybeOptions?: TweenOptions,
  ): TweenHandle {
    // 1. Multi-property map overload: to(target, { 'position.x': 5, 'opacity': 0 }, { duration: 1 })
    if (typeof propertyOrValues === 'object' && propertyOrValues !== null) {
      const options = (toValueOrOptions as TweenOptions) ?? {};
      const seq = this.sequence(options.id ? `${options.id}_multi` : undefined);

      for (const [prop, val] of Object.entries(propertyOrValues)) {
        const resolved = TweenTargetResolver.resolve(target, prop, this.engine);
        const resolvedTarget = resolved?.rawTarget ?? target;
        const resolvedProp = resolved?.resolvedProperty ?? prop;

        const tw = new Tween(resolvedTarget, resolvedProp, val, {
          ...options,
          autoPlay: false,
        }, resolved?.canonicalKey);

        seq.join(tw);
      }

      seq.play();
      return seq.getHandle();
    }

    // 2. Single property overload: to(target, 'position.y', 5, { duration: 1 })
    const property = propertyOrValues as string;
    const toVal = toValueOrOptions;
    const options = maybeOptions ?? {};

    const resolved = TweenTargetResolver.resolve(target, property, this.engine);
    const resolvedTarget = resolved?.rawTarget ?? target;
    const resolvedProp = resolved?.resolvedProperty ?? property;

    const tw = new Tween(
      resolvedTarget,
      resolvedProp,
      toVal,
      options,
      resolved?.canonicalKey,
    );

    this.registerTween(tw, resolved?.entityId, resolvedTarget);
    return tw.getHandle();
  }

  /**
   * Tween from a specific start value to current target value.
   */
  from(
    target: any,
    propertyOrValues: string | Record<string, any>,
    fromValueOrOptions?: any,
    maybeOptions?: TweenOptions,
  ): TweenHandle {
    if (typeof propertyOrValues === 'object' && propertyOrValues !== null) {
      const options = (fromValueOrOptions as TweenOptions) ?? {};
      const seq = this.sequence(options.id ? `${options.id}_from_multi` : undefined);

      for (const [prop, fromVal] of Object.entries(propertyOrValues)) {
        const resolved = TweenTargetResolver.resolve(target, prop, this.engine);
        const resolvedTarget = resolved?.rawTarget ?? target;
        const resolvedProp = resolved?.resolvedProperty ?? prop;

        const currentVal = TweenValueAdapter.getNestedProperty(resolvedTarget, resolvedProp);
        const tw = new Tween(resolvedTarget, resolvedProp, currentVal, {
          ...options,
          autoPlay: false,
        }, resolved?.canonicalKey).setFrom(fromVal);

        seq.join(tw);
      }

      seq.play();
      return seq.getHandle();
    }

    const property = propertyOrValues as string;
    const fromVal = fromValueOrOptions;
    const options = maybeOptions ?? {};

    const resolved = TweenTargetResolver.resolve(target, property, this.engine);
    const resolvedTarget = resolved?.rawTarget ?? target;
    const resolvedProp = resolved?.resolvedProperty ?? property;

    const currentVal = TweenValueAdapter.getNestedProperty(resolvedTarget, resolvedProp);
    const tw = new Tween(
      resolvedTarget,
      resolvedProp,
      currentVal,
      options,
      resolved?.canonicalKey,
    ).setFrom(fromVal);

    this.registerTween(tw, resolved?.entityId, resolvedTarget);
    return tw.getHandle();
  }

  /**
   * Explicit From-To Tween.
   */
  fromTo(
    target: any,
    property: string,
    fromValue: any,
    toValue: any,
    options: TweenOptions = {},
  ): TweenHandle {
    const resolved = TweenTargetResolver.resolve(target, property, this.engine);
    const resolvedTarget = resolved?.rawTarget ?? target;
    const resolvedProp = resolved?.resolvedProperty ?? property;

    const tw = new Tween(
      resolvedTarget,
      resolvedProp,
      toValue,
      options,
      resolved?.canonicalKey,
    ).setFrom(fromValue);

    this.registerTween(tw, resolved?.entityId, resolvedTarget);
    return tw.getHandle();
  }

  /**
   * Create a new deterministic TweenSequence timeline.
   */
  sequence(idOrOptions?: string | SequenceOptions): TweenSequence {
    const options: SequenceOptions =
      typeof idOrOptions === 'string' ? { id: idOrOptions } : (idOrOptions ?? {});

    const seq = new TweenSequence(options);
    this.activeSequenceSet.add(seq);
    return seq;
  }

  // --- Registration & Graph Association ---

  registerTween(tween: Tween, entityId?: number, rootTarget?: any): void {
    if (entityId !== undefined) {
      let graph = this.graphsByEntity.get(entityId);
      if (!graph) {
        const rb = this.engine?.sceneManager?.getRigidBody(entityId) ?? undefined;
        graph = new TweenGraph(rootTarget ?? rb?.mesh, { entityId, rb });
        this.graphsByEntity.set(entityId, graph);
      }
      graph.addTween(tween);
    } else if (rootTarget && typeof rootTarget === 'object') {
      let graph = this.graphsByObject.get(rootTarget);
      if (!graph) {
        graph = new TweenGraph(rootTarget);
        this.graphsByObject.set(rootTarget, graph);
      }
      graph.addTween(tween);
    } else {
      this.standaloneTweens.add(tween);
    }
  }

  // --- High-Level Three.js / Effect Helpers ---

  move(target: any, to: THREE.Vector3 | { x?: number; y?: number; z?: number }, options: TweenOptions = {}): TweenHandle {
    return TweenHelpers.move(this, target, to, options);
  }

  moveWorld(target: THREE.Object3D, worldTo: THREE.Vector3 | { x?: number; y?: number; z?: number }, options: TweenOptions = {}): TweenHandle {
    return TweenHelpers.moveWorld(this, target, worldTo, options);
  }

  rotate(target: any, to: THREE.Euler | { x?: number; y?: number; z?: number }, options: TweenOptions = {}): TweenHandle {
    return TweenHelpers.rotateEuler(this, target, to, options);
  }

  rotateQuaternion(target: any, to: THREE.Quaternion, options: TweenOptions = {}): TweenHandle {
    return TweenHelpers.rotateQuaternion(this, target, to, options);
  }

  scale(target: any, to: number | THREE.Vector3 | { x?: number; y?: number; z?: number }, options: TweenOptions = {}): TweenHandle {
    return TweenHelpers.scale(this, target, to, options);
  }

  lookAt(target: THREE.Object3D, lookAtPoint: THREE.Vector3, options: TweenOptions = {}): TweenHandle {
    return TweenHelpers.lookAt(this, target, lookAtPoint, options);
  }

  punch(target: any, property: string, punchVector: THREE.Vector3 | number, options?: any): TweenHandle {
    return TweenHelpers.punch(this, target, property, punchVector, options);
  }

  shake(target: any, property: string, strength?: THREE.Vector3 | number, options?: any): TweenHandle {
    return TweenHelpers.shake(this, target, property, strength, options);
  }

  jump(target: any, endPosition: THREE.Vector3, jumpHeight = 2.0, numJumps = 1, options: TweenOptions = {}): TweenHandle {
    return TweenHelpers.jump(this, target, endPosition, jumpHeight, numJumps, options);
  }

  followPath(target: THREE.Object3D, waypoints: THREE.Vector3[] | number[][], options?: { pathOptions?: PathOptions; orientToPath?: boolean } & TweenOptions): TweenHandle {
    return TweenHelpers.followPath(this, target, waypoints, options);
  }

  spiral(target: THREE.Object3D, options?: any): TweenHandle {
    return TweenHelpers.spiral(this, target, options);
  }

  material(mat: any, props: any, options: TweenOptions = {}): TweenSequence {
    return TweenHelpers.material(this, mat, props, options);
  }

  audio(audioSource: any, toVolume: number, options: TweenOptions = {}): TweenHandle {
    return TweenHelpers.audioFade(this, audioSource, toVolume, options);
  }

  audioFade(audioSource: any, toVolume: number, options: TweenOptions = {}): TweenHandle {
    return this.audio(audioSource, toVolume, options);
  }

  // --- Engine Lifecycle Loop ---

  update(rawDt: number, wallClockDt = rawDt): void {
    if (rawDt <= 0) return;

    const normalDt = this.clock.getDelta('normal', rawDt);
    const unscaledDt = this.clock.getDelta('unscaled', wallClockDt);
    const fixedDt = this.clock.getDelta('fixed', rawDt);

    // 1. Update standalone tweens
    for (const tw of [...this.standaloneTweens]) {
      const dt = tw.updateMode === 'unscaled'
        ? unscaledDt
        : tw.updateMode === 'fixed'
          ? fixedDt
          : tw.updateMode === 'manual'
            ? 0
            : normalDt;
      const done = tw.update(dt);
      if (done || tw.status === 'completed' || tw.status === 'killed') {
        this.standaloneTweens.delete(tw);
      }
    }

    // 2. Update entity & object graphs
    for (const [entityId, graph] of [...this.graphsByEntity]) {
      graph.update(normalDt, unscaledDt, fixedDt);
      if (graph.activeTweenList.length === 0) {
        this.graphsByEntity.delete(entityId);
      }
    }

    for (const [obj, graph] of [...this.graphsByObject]) {
      graph.update(normalDt, unscaledDt, fixedDt);
      if (graph.activeTweenList.length === 0) {
        this.graphsByObject.delete(obj);
      }
    }

    // 3. Update sequences
    for (const seq of [...this.activeSequenceSet]) {
      const dt = seq.updateMode === 'unscaled'
        ? unscaledDt
        : seq.updateMode === 'fixed'
          ? fixedDt
          : seq.updateMode === 'manual'
            ? 0
            : normalDt;
      const done = seq.update(dt);
      if (done || seq.status === 'completed' || seq.status === 'killed') {
        if (seq.autoKill) {
          this.activeSequenceSet.delete(seq);
        }
      }
    }
  }

  /** Advance only nodes explicitly configured for manual updates. */
  manualUpdate(dt: number): void {
    const delta = Math.max(0, dt) * this.clock.getTimeScale('manual');
    if (delta <= 0 || this.clock.isPaused('manual')) return;

    for (const tw of [...this.standaloneTweens]) {
      if (tw.updateMode !== 'manual') continue;
      const done = tw.update(delta);
      if (done || tw.status === 'completed' || tw.status === 'killed') this.standaloneTweens.delete(tw);
    }
    for (const graph of this.graphsByEntity.values()) graph.updateManual(delta);
    for (const graph of this.graphsByObject.values()) graph.updateManual(delta);
    for (const seq of [...this.activeSequenceSet]) {
      if (seq.updateMode !== 'manual') continue;
      const done = seq.update(delta);
      if ((done || seq.status === 'completed' || seq.status === 'killed') && seq.autoKill) {
        this.activeSequenceSet.delete(seq);
      }
    }
  }

  // --- Global Controls ---

  pauseAll(): void {
    this.clock.pause();
    for (const tw of this.standaloneTweens) tw.pause();
    for (const g of this.graphsByEntity.values()) g.pauseAll();
    for (const g of this.graphsByObject.values()) g.pauseAll();
    for (const s of this.activeSequenceSet) s.pause();
  }

  resumeAll(): void {
    this.clock.resume();
    for (const tw of this.standaloneTweens) tw.resume();
    for (const g of this.graphsByEntity.values()) g.resumeAll();
    for (const g of this.graphsByObject.values()) g.resumeAll();
    for (const s of this.activeSequenceSet) s.resume();
  }

  killAll(reason: TweenInterruptionReason = 'manual_kill'): void {
    for (const tw of this.standaloneTweens) tw.kill(reason);
    this.standaloneTweens.clear();

    for (const g of this.graphsByEntity.values()) g.killAll(reason);
    this.graphsByEntity.clear();

    for (const g of this.graphsByObject.values()) g.killAll(reason);
    this.graphsByObject.clear();

    for (const s of this.activeSequenceSet) s.kill(reason);
    this.activeSequenceSet.clear();
  }

  killTarget(target: any, reason: TweenInterruptionReason = 'manual_kill'): void {
    if (typeof target === 'number') {
      const g = this.graphsByEntity.get(target);
      if (g) {
        g.killAll(reason);
        this.graphsByEntity.delete(target);
      }
    } else if (target && typeof target === 'object') {
      const g = this.graphsByObject.get(target);
      if (g) {
        g.killAll(reason);
        this.graphsByObject.delete(target);
      }
    }
  }

  getGraph(entityIdOrObject: any): TweenGraph | null {
    if (typeof entityIdOrObject === 'number') {
      return this.graphsByEntity.get(entityIdOrObject) ?? null;
    }
    return this.graphsByObject.get(entityIdOrObject) ?? null;
  }

  get activeTweens(): Tween[] {
    const list: Tween[] = [...this.standaloneTweens];
    for (const g of this.graphsByEntity.values()) {
      list.push(...g.activeTweenList);
    }
    for (const g of this.graphsByObject.values()) {
      list.push(...g.activeTweenList);
    }
    return list;
  }

  get activeSequences(): TweenSequence[] {
    return Array.from(this.activeSequenceSet);
  }

  inspect(): TweenDiagnosticReport {
    return TweenDiagnostics.generateReport(this);
  }

  dispose(): void {
    this.killAll('destroyed_target');
    TweenPool.clearPools();
  }
}
