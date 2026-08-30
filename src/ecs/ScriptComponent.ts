import * as THREE from 'three';
import type { EntityId, SceneManager } from './SceneManager';

export interface ScriptEvent {
  type: 'sensor';
  otherEntityId: EntityId;
  intersecting: boolean;
}

/** Outcome of compiling/hot-swapping a script's source. */
export interface ReloadResult {
  ok: boolean;
  /** Compiler (syntax) error message when `ok` is false. */
  error?: string;
}

export interface ScriptAPI {
  entityId: EntityId;
  sceneManager: SceneManager;
  /** Modular gameplay services (pause, settings, objectives, notifications, rounds). */
  readonly gameplay?: import('../features/gameplay/GameplayFeatureManager').GameplayFeatureManager;
  /** The THREE namespace — exposed so scripts can write `new api.THREE.Vector3()`
   *  instead of relying on the (separately-passed) `THREE` global. */
  THREE: typeof THREE;
  readonly position: THREE.Vector3 | undefined;
  readonly rotation: THREE.Quaternion | undefined;
  events: ScriptEvent[];
  /** Persistent key-value store shared across all scripts and saved to localStorage.
   *  Use `api.state.setItem('score', 100)` / `api.state.getItem('score')`. */
  state: {
    getItem: <T = unknown>(key: string) => T | undefined;
    setItem: (key: string, value: unknown) => void;
    removeItem: (key: string) => void;
    clear: () => void;
    getAll: () => Record<string, unknown>;
  };
  /** Per-entity scratch object for this script's own variables (timers, state
   *  machines, cached handles). Unlike a `let` inside the body — which is re-run
   *  every frame — `self` PERSISTS across ticks AND survives a live hot-swap of
   *  the script source, so iterating on code never resets the entity's behaviour.
   *  Mutate it in place (`api.self.cooldown = 1.5`); don't reassign it. It is
   *  snapshotted into PersistentGameState on hot-swap/dispose so it also survives
   *  a full page reload (best-effort, keyed by entity id). */
  self: Record<string, unknown>;
  /** True only on the first tick AFTER a hot-swap, so a script can re-acquire
   *  transient handles without re-running its one-time init block. */
  reloaded: boolean;
  /** True only on the very first tick after the script is attached. */
  firstRun: boolean;
  /** Force-persist `self` into PersistentGameState now (otherwise it is flushed
   *  automatically on hot-swap and dispose). */
  saveSelf: () => void;
  /** AI-Native 3D debug drawing — lines, boxes, spheres, text that auto-expire. */
  debug: {
    drawLine: (from: THREE.Vector3, to: THREE.Vector3, color?: number | string, lifetime?: number) => void;
    drawRay: (origin: THREE.Vector3, direction: THREE.Vector3, length: number, color?: number | string, lifetime?: number) => void;
    drawBox: (center: THREE.Vector3, size: THREE.Vector3, color?: number | string, lifetime?: number) => void;
    drawSphere: (center: THREE.Vector3, radius: number, color?: number | string, lifetime?: number) => void;
    drawText: (position: THREE.Vector3, text: string, color?: number | string, size?: number, lifetime?: number) => void;
    clearAll: () => void;
  };
  /** Global pub/sub event bus. Listen to or emit events.
   *  Built-in: collision_start, collision_end, sensor_enter, sensor_exit,
   *  entity_destroyed, script_error. */
  bus: {
    on: (event: string, cb: (data: unknown) => void) => () => void;
    off: (event: string, cb: (data: unknown) => void) => void;
    emit: (event: string, data?: unknown) => void;
  };
  /** Declarative HUD control. Load/show/hide HUD layouts from scripts. */
  hud: {
    load: (layout: import('../ui/HUD').HUDLayout) => void;
    show: (id: string) => void;
    hide: (id: string) => void;
    clear: () => void;
    updateWidget: (id: string, props: Partial<import('../ui/HUD').HUDWidgetBase>) => void;
  };
  /** Semantic spatial queries */
  query: {
    /** Find entities within `radius` of `center` that optionally match ANY of the given `tags` */
    sphere: (center: THREE.Vector3, radius: number, tags?: string[]) => EntityId[];
  };
  /** Procedural 3D Mesh Slicing (IDE & AI Friendly) */
  slicing: {
    slice: (planePoint?: THREE.Vector3, planeNormal?: THREE.Vector3, separationForce?: number) => { pieceA: EntityId | null; pieceB: EntityId | null; cutArea: number };
  };
  /** Deformable Ground & Impact Craters */
  ground: {
    createCrater: (center: THREE.Vector3, radius?: number, depth?: number, rimHeight?: number) => boolean;
  };
  /** Anime Combat Presentation & Director (Impact Frames, Hit-Stop, Camera Punch, Outlines) */
  combat: {
    impactFrame: (style?: 'invert' | 'black_white' | 'crimson' | 'gold' | 'neon_cyan', frames?: number) => void;
    hitStop: (duration?: number, timeScale?: number) => void;
    cameraPunch: (fovPunch?: number, duration?: number) => void;
    addOutline: (thickness?: number, color?: number) => THREE.Mesh | null;
    removeOutline: () => void;
  };
  /** Procedural City & Map Building System */
  city: {
    generate: (config?: any) => any;
    loadBlueprint: (blueprintName?: string) => any;
    clear: () => void;
  };
}

/**
 * Security model: scripts are TRUSTED CONTENT ONLY.
 * Only code authored in project files / editor is executed. Arbitrary untrusted
 * strings (e.g., from network or user paste) must be reviewed before becoming
 * a ScriptComponent. For untrusted use-cases, use `createSandboxedScript`
 * which runs the source inside a Worker (see `scriptSandbox.ts`).
 *
 * This file enforces a lightweight capability guard at compile time: forbidden
 * globals (window, document, eval, Function, fetch, etc.) are rejected unless
 * `ScriptComponent.ALLOW_UNTRUSTED_GLOBALS` is explicitly set true. This does
 * NOT replace a real Worker/iframe sandbox — it is a defense-in-depth check
 * that fails safe (keeps last-good script running).
 */
export class ScriptComponent {
  /** Set true to allow scripts to touch browser globals (disables the guard). */
  static ALLOW_UNTRUSTED_GLOBALS = false;
  /** Substrings that are rejected at compile time when the guard is active.
   *  `window` / `document` are intentionally ALLOWED for the stock internal script
   *  (`window.engine` for effects/audio) — they are trusted content. The guard blocks
   *  the truly exfiltrative / code-gen primitives. For fully untrusted content, use
   *  the Worker sandbox (scriptSandbox.ts). */
  private static readonly FORBIDDEN = [
    'localStorage', 'sessionStorage',
    'fetch', 'XMLHttpRequest', 'WebSocket',
    'eval', 'Function(', 'import(', 'require(',
  ];

  public sourceCode: string;
  private updateFn: ((dt: number, api: ScriptAPI, THREE: typeof import('three')) => void) | null = null;
  private api: ScriptAPI;
  private queuedEvents: ScriptEvent[] = [];
  private activeListeners = new Set<() => void>();
  /** Compiler error from the most recent (initial or hot-swap) compile, else null. */
  public compileError: string | null = null;
  /** Set true by a successful hot-swap; surfaced to `api.reloaded` for one tick. */
  private justReloaded = false;
  /** False until the first successful `update` tick; drives `api.firstRun`. */
  private hasRun = false;
  /** PersistentGameState key backing `api.self` (so vars survive a page reload). */
  private readonly selfKey: string;

  constructor(
    public readonly entityId: EntityId,
    private readonly sceneManager: SceneManager,
    sourceCode: string
  ) {
    this.sourceCode = sourceCode;
    const gs = sceneManager.gameState;
    const dd = sceneManager.debugDraw;
    const eb = sceneManager.events;
    const hud = sceneManager.hud;
    this.selfKey = `__script_self_${entityId}`;
    // Best-effort hydrate `self` from a previous session (same entity id). Within a
    // live session this is almost always {} — the value is the cross-reload safety net.
    const storedSelf = gs.getItem<Record<string, unknown>>(this.selfKey);
    const initialSelf: Record<string, unknown> =
      storedSelf && typeof storedSelf === 'object' ? storedSelf : {};
    this.api = {
      entityId,
      sceneManager,
      get gameplay() { return sceneManager.gameplayFeatures; },
      THREE,
      get position() { return sceneManager.getRigidBody(entityId)?.mesh.position; },
      get rotation() { return sceneManager.getRigidBody(entityId)?.mesh.quaternion; },
      events: [],
      self: initialSelf,
      reloaded: false,
      firstRun: false,
      saveSelf: () => this.persistSelf(),
      state: {
        getItem: <T = unknown>(key: string) => gs.getItem<T>(key),
        setItem: (key: string, value: unknown) => gs.setItem(key, value),
        removeItem: (key: string) => gs.removeItem(key),
        clear: () => gs.clear(),
        getAll: () => gs.getAll(),
      },
      debug: {
        drawLine: (from, to, color, lifetime) => dd?.drawLine(from, to, color, lifetime),
        drawRay: (origin, dir, len, color, lifetime) => dd?.drawRay(origin, dir, len, color, lifetime),
        drawBox: (center, size, color, lifetime) => dd?.drawBox(center, size, color, lifetime),
        drawSphere: (center, radius, color, lifetime) => dd?.drawSphere(center, radius, color, lifetime),
        drawText: (pos, text, color, size, lifetime) => dd?.drawText(pos, text, color, size, lifetime),
        clearAll: () => dd?.clearAll(),
      },
      bus: {
        on: (event, cb) => {
          if (!this.api.firstRun && !this.api.reloaded) {
            console.warn(`[ScriptComponent] api.bus.on('${event}') called on a regular update tick for entity ${entityId}. This is a memory leak hazard and is ignored. Wrap listener registration in 'if (api.firstRun || api.reloaded) { ... }'`);
            return () => {};
          }
          const wrappedCb = (data: unknown) => {
            try {
              cb(data);
            } catch (err) {
              console.error(`[ScriptComponent] Error in '${event}' listener for entity ${entityId}:`, err);
              eb.emit('script_error', { entityId, error: err });
            }
          };
          const offFn = eb.on(event, wrappedCb);
          this.activeListeners.add(offFn);
          return offFn;
        },
        off: (event, cb) => eb.off(event, cb),
        emit: (event, data) => eb.emit(event, data),
      },
      hud: {
        load: (layout) => hud?.load(layout),
        show: (id) => hud?.show(id),
        hide: (id) => hud?.hide(id),
        clear: () => hud?.clear(),
        updateWidget: (id, props) => hud?.updateWidget(id, props as any),
      },
      query: {
        sphere: (center, radius, tags) => {
          const results: EntityId[] = [];
          const r2 = radius * radius;
          for (let i = 0; i < sceneManager.rigidBodyList.length; i++) {
            const rb = sceneManager.rigidBodyList[i];
            const distSq = rb.mesh.position.distanceToSquared(center);
            if (distSq <= r2) {
              const rbId = sceneManager.entityAtIndex(i);
              if (rbId === undefined) continue;
              if (tags && tags.length > 0) {
                let match = false;
                for (const t of tags) {
                  if (sceneManager.hasTag(rbId, t)) {
                    match = true;
                    break;
                  }
                }
                if (!match) continue;
              }
              results.push(rbId);
            }
          }
          return results;
        }
      },
      slicing: {
        slice: (planePoint, planeNormal, separationForce) => {
          const gfm = sceneManager.gameplayFeatures;
          const pos = planePoint ?? sceneManager.getRigidBody(entityId)?.mesh.position ?? new THREE.Vector3();
          const norm = planeNormal ?? new THREE.Vector3(0, 1, 0);
          if (gfm?.meshSlicing) {
            return gfm.meshSlicing.sliceEntity(entityId, pos, norm, separationForce);
          }
          return { pieceA: null, pieceB: null, cutArea: 0 };
        }
      },
      ground: {
        createCrater: (center, radius, depth, rimHeight) => {
          const gfm = sceneManager.gameplayFeatures;
          if (gfm?.deformableGround) {
            return !!gfm.deformableGround.createCrater(center, { radius, depth, lipHeight: rimHeight });
          }
          return false;
        }
      },
      combat: {
        impactFrame: (style, frames) => {
          sceneManager.gameplayFeatures?.combatDirector.triggerImpactFrame(style, frames);
        },
        hitStop: (duration, timeScale) => {
          sceneManager.gameplayFeatures?.combatDirector.triggerHitStop(duration, timeScale);
        },
        cameraPunch: (fovPunch, duration) => {
          sceneManager.gameplayFeatures?.combatDirector.triggerCameraPunch(fovPunch, duration);
        },
        addOutline: (thickness, color) => {
          const rb = sceneManager.getRigidBody(entityId);
          if (rb?.mesh && sceneManager.gameplayFeatures?.combatDirector) {
            return sceneManager.gameplayFeatures.combatDirector.createInvertedHullOutline(rb.mesh as THREE.Mesh, thickness, color);
          }
          return null;
        },
        removeOutline: () => {
          const rb = sceneManager.getRigidBody(entityId);
          if (rb?.mesh && sceneManager.gameplayFeatures?.combatDirector) {
            sceneManager.gameplayFeatures.combatDirector.removeInvertedHullOutline(rb.mesh as THREE.Mesh);
          }
        }
      },
      city: {
        generate: (config) => {
          return sceneManager.gameplayFeatures?.city.generateWorld(config);
        },
        loadBlueprint: (name) => {
          return sceneManager.gameplayFeatures?.city.loadBlueprint(name ?? 'GTA_Los_Santos');
        },
        clear: () => {
          sceneManager.gameplayFeatures?.city.clear();
        }
      }
    };
    this.compile();
  }

  /**
   * Live, state-preserved hot-swap. Compiles `code` into a candidate WITHOUT
   * disturbing the running script first: only on a clean compile do we tear down
   * the old listeners and swap the function in. A syntax error therefore leaves
   * the last-good script (and its bus listeners) running untouched — an agent can
   * iterate on code mid-SENSORIUM-run and a transient typo never resets the entity.
   * `api.self`, the rigid body (position/velocity), and listeners are all preserved.
   */
  setSource(code: string): ReloadResult {
    let fn: typeof this.updateFn;
    try {
      fn = this.buildFn(code);
    } catch (e) {
      this.compileError = errMsg(e);
      console.error(
        `[ScriptComponent] Hot-swap compile failed for entity ${this.entityId} ` +
        `(keeping last-good script):`, e,
      );
      return { ok: false, error: this.compileError };
    }
    // New code compiled cleanly — atomically swap. Old script's bus listeners are
    // stale (the new body re-registers them on its next run), so drop them now.
    this.clearListeners();
    this.sourceCode = code;
    this.updateFn = fn;
    this.compileError = null;
    this.justReloaded = true;
    this.persistSelf();
    return { ok: true };
  }

  private clearListeners(): void {
    for (const off of this.activeListeners) off();
    this.activeListeners.clear();
  }

  dispose(): void {
    this.persistSelf();
    this.clearListeners();
  }

  /** Snapshot `api.self` into PersistentGameState (best-effort; non-JSON-safe
   *  values are dropped by the store's own serialization guard). */
  private persistSelf(): void {
    try {
      this.sceneManager.gameState.setItem(this.selfKey, this.api.self);
    } catch {
      // store unavailable — in-memory `self` is still preserved across the swap
    }
  }

  private consecutiveErrors = 0;
  private isCircuitBroken = false;

  private assertTrusted(code: string): void {
    if (ScriptComponent.ALLOW_UNTRUSTED_GLOBALS) return;
    // Strip string literals and comments before scanning, so `api.state.setItem('window', ...)`
    // doesn't false-positive. This is a best-effort guard, not a full parser sandbox.
    const stripped = code
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ')
      .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, ' ');
    for (const token of ScriptComponent.FORBIDDEN) {
      // Match as a token boundary (avoid flagging `wind` containing `window`)
      const re = new RegExp(`(^|[^a-zA-Z0-9_$])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zA-Z0-9_$]|$)`);
      // Special-case: Function( is intentional — we also check bare `Function` via new RegExp
      if (re.test(stripped)) {
        throw new SyntaxError(`ScriptComponent: forbidden global '${token.trim()}' — scripts are trusted-content-only. If you need untrusted code, use the Worker sandbox (see scriptSandbox.ts) or set ScriptComponent.ALLOW_UNTRUSTED_GLOBALS = true.`);
      }
    }
  }

  /** Wrap user source in the runtime try/catch and compile it. Throws on a
   *  SyntaxError (caller decides whether to keep the last-good function). */
  private buildFn(code: string): NonNullable<typeof this.updateFn> {
    this.assertTrusted(code);
    // THREE is passed as a 3rd arg so user scripts can do `new THREE.Vector3()` without
    // referencing a global (Vite bundles imports locally, so without this every
    // script that touches THREE would throw ReferenceError at runtime).
    // 'use strict' prevents leaking `this` as globalThis inside the function body.
    return new Function('dt', 'api', 'THREE', `
        'use strict';
        try {
          ${code}
          this.consecutiveErrors = 0;
        } catch(e) {
          this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
          console.error('[ScriptComponent] Runtime error for entity ' + api.entityId + ' (streak: ' + this.consecutiveErrors + '):', e);
          api.bus.emit('script_error', { entityId: api.entityId, error: e, streak: this.consecutiveErrors });
          if (this.consecutiveErrors >= 5) {
            this.isCircuitBroken = true;
            console.warn('[ScriptComponent] Circuit breaker tripped for entity ' + api.entityId + '. Script disabled until edit.');
            api.bus.emit('script_disabled', { entityId: api.entityId, reason: 'consecutive_errors', error: e });
          }
        }
      `) as NonNullable<typeof this.updateFn>;
  }

  private compile(): void {
    try {
      this.updateFn = this.buildFn(this.sourceCode);
      this.compileError = null;
      this.consecutiveErrors = 0;
      this.isCircuitBroken = false;
    } catch (e) {
      this.compileError = errMsg(e);
      console.error(`[ScriptComponent] Compilation failed for entity ${this.entityId}:`, e);
      this.updateFn = null;
    }
  }

  onSensor(otherEntityId: EntityId, intersecting: boolean): void {
    this.queuedEvents.push({ type: 'sensor', otherEntityId, intersecting });
  }

  update(dt: number): void {
    if (this.isCircuitBroken) return;

    // Drain queued events every tick regardless of compile state, so a script that
    // failed to compile can't leak an ever-growing sensor-event backlog. splice(0)
    // hands the script a fresh list each frame (empty when nothing happened).
    this.api.events = this.queuedEvents.splice(0);
    this.api.reloaded = this.justReloaded;
    this.api.firstRun = !this.hasRun;
    if (this.updateFn) {
      this.updateFn.call(this, dt, this.api, THREE);
      this.hasRun = true;
    }
    // One-shot flags: consume after the tick that observed them.
    this.justReloaded = false;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
