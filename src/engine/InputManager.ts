import { InputContextStack } from '../input/InputContextStack';
import { GamepadDriver } from '../input/GamepadDriver';
import { SyntheticActionDriver } from '../input/SyntheticActionDriver';
import type { ActionDef, ActionValue, Binding, InputActionAsset } from '../input/types';

export type InputMode = 'editor' | 'play';

export interface PointerEventPayload {
  button: number;
  /** Position relative to the canvas top-left, in CSS pixels. */
  x: number;
  y: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

type EventMap = {
  modechange: InputMode;
  pointerdown: PointerEventPayload;
  pointerup: PointerEventPayload;
  pointermove: PointerEventPayload;
};
type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

/**
 * InputManager.ts — Centralized, passive input with Universal Action Mapping.
 *
 * Passive DOM contract: this manager only READS and EMITS. It never calls
 * stopPropagation()/preventDefault() on POINTER events, because the gizmo
 * (TransformControls) owns its own listeners on the same canvas. Conflicts during a
 * drag are resolved by transformAuthority, not by swallowing events here. (We DO
 * preventDefault on `contextmenu` and `wheel`, which are not pointer events, so RMB
 * look and wheel-to-adjust-speed don't trigger the browser menu / page scroll.)
 *
 * Pointer-lock guard: a lock request is refused while a guard predicate returns true
 * (wired by the Engine to `() => gizmo.dragging`), so brushing RMB during an LMB gizmo
 * drag can never trap the cursor mid-operation.
 *
 * Focus-loss safety: on `blur` / `visibilitychange→hidden` all transient input is
 * cleared and pointer lock is exited. (The gizmo force-ends its own drag via its
 * matching blur handler.)
 */
export class InputManager {
  readonly contexts = new InputContextStack();
  readonly gamepad = new GamepadDriver();
  readonly synthetic = new SyntheticActionDriver();

  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private readonly mouseDelta = { x: 0, y: 0 };
  private _wheelDelta = 0;
  private _mode: InputMode = 'editor';
  private readonly actionActiveLastFrame = new Map<string, boolean>();
  /** SENSORIUM test-driver bypass: when true, pointer-lock requests are no-ops,
   *  `isPointerLocked` honours the injected value instead of the real DOM state, and
   *  blur/visibility focus-loss will NOT clear injected input (see clearTransient).
   *  Set by SensoriumRunner while a scripted test is driving the possessed character. */
  private _testMode = false;
  private _injectedPointerLocked = false;

  private pointerLockGuard: () => boolean = () => false;

  private target: HTMLElement;
  private currentWindow: Window = window;
  private currentDocument: Document = document;

  private readonly listeners: { [K in keyof EventMap]: Set<Listener<K>> } = {
    modechange: new Set(),
    pointerdown: new Set(),
    pointerup: new Set(),
    pointermove: new Set(),
  };

  // Bound handlers, retained so dispose() can detach them.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!e.repeat && !this.keysDown.has(e.code)) this.keysPressed.add(e.code);
    this.keysDown.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code);
  };
  private readonly onPointerDown = (e: PointerEvent) => {
    this.mouseButtons.add(e.button);
    this.emit('pointerdown', { button: e.button, ...this.localPoint(e), shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
  };
  private readonly onPointerUp = (e: PointerEvent) => {
    this.mouseButtons.delete(e.button);
    this.emit('pointerup', { button: e.button, ...this.localPoint(e), shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
  };
  private readonly onPointerMove = (e: PointerEvent) => {
    // movementX/Y are correct both locked (raw device delta) and unlocked (CSS delta).
    this.mouseDelta.x += e.movementX;
    this.mouseDelta.y += e.movementY;
    this.emit('pointermove', { button: e.button, ...this.localPoint(e), shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
  };
  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault(); // not a pointer event — safe to stop page scroll/zoom.
    this._wheelDelta += e.deltaY;
  };
  private readonly onContextMenu = (e: MouseEvent) => {
    e.preventDefault(); // let RMB drive look instead of opening the browser menu.
  };
  private readonly onBlur = () => this.clearTransient();
  private readonly onVisibility = () => {
    if (this.currentDocument.visibilityState === 'hidden') this.clearTransient();
  };

  constructor(target: HTMLElement) {
    this.target = target;
    this.currentWindow.addEventListener('keydown', this.onKeyDown);
    this.currentWindow.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('pointerdown', this.onPointerDown);
    this.currentWindow.addEventListener('pointerup', this.onPointerUp); // catch release outside canvas
    this.currentWindow.addEventListener('pointermove', this.onPointerMove);
    this.target.addEventListener('wheel', this.onWheel, { passive: false });
    this.target.addEventListener('contextmenu', this.onContextMenu);
    this.currentWindow.addEventListener('blur', this.onBlur);
    this.currentDocument.addEventListener('visibilitychange', this.onVisibility);
    this.initDefaultContexts();
  }

  updateTarget(newTarget: HTMLElement, newWindow: Window): void {
    // Remove old listeners
    this.currentWindow.removeEventListener('keydown', this.onKeyDown);
    this.currentWindow.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.currentWindow.removeEventListener('pointerup', this.onPointerUp);
    this.currentWindow.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.currentWindow.removeEventListener('blur', this.onBlur);
    this.currentDocument.removeEventListener('visibilitychange', this.onVisibility);

    // Update references
    this.target = newTarget;
    this.currentWindow = newWindow;
    this.currentDocument = newWindow.document;

    // Attach new listeners
    this.currentWindow.addEventListener('keydown', this.onKeyDown);
    this.currentWindow.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('pointerdown', this.onPointerDown);
    this.currentWindow.addEventListener('pointerup', this.onPointerUp);
    this.currentWindow.addEventListener('pointermove', this.onPointerMove);
    this.target.addEventListener('wheel', this.onWheel, { passive: false });
    this.target.addEventListener('contextmenu', this.onContextMenu);
    this.currentWindow.addEventListener('blur', this.onBlur);
    this.currentDocument.addEventListener('visibilitychange', this.onVisibility);
  }

  private localPoint(e: PointerEvent): { x: number; y: number } {
    const r = this.target.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // --- Query API -----------------------------------------------------------
  isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }
  /** True only on the frame the key transitioned to down. */
  isKeyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }
  isMouseButtonDown(button: number): boolean {
    return this.mouseButtons.has(button);
  }
  /** Accumulated pointer delta since the last endFrame(). */
  getMouseDelta(): { x: number; y: number } {
    return this.mouseDelta;
  }
  getWheelDelta(): number {
    return this._wheelDelta;
  }
  get mode(): InputMode {
    return this._mode;
  }

  // --- Universal Input Action Mapping (S3) ----------------------------------
  getActionValue(name: string, device?: Binding['device']): ActionValue {
    return this.contexts.evaluate(
      name,
      {
        isKeyDown: (c) => this.isKeyDown(c),
        isMouseButtonDown: (b) => this.isMouseButtonDown(b),
        mouseDeltaX: this.mouseDelta.x,
        mouseDeltaY: this.mouseDelta.y,
      },
      this.gamepad,
      this.synthetic,
      device,
    );
  }

  isActionActive(name: string): boolean {
    const val = this.getActionValue(name);
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return Math.abs(val) > 0.5;
    if (typeof val === 'object' && val !== null) {
      return Math.hypot(val.x, val.y) > 0.1;
    }
    return false;
  }

  /** True only on the frame an action crosses from inactive to active. */
  isActionPressed(name: string): boolean {
    return this.isActionActive(name) && !this.actionActiveLastFrame.get(name);
  }

  getActionAxis2D(name: string, device?: Binding['device']): { x: number; y: number } {
    const val = this.getActionValue(name, device);
    if (typeof val === 'object' && val !== null && 'x' in val && 'y' in val) {
      return val;
    }
    return { x: 0, y: 0 };
  }

  defineAction(definition: ActionDef, context = 'OnFoot'): void {
    this.contexts.defineAction(definition, context);
  }

  setActionBindings(action: string, bindings: Binding[]): boolean {
    return this.contexts.map.replaceBindings(action, bindings);
  }

  clearActionBindings(action: string): boolean {
    return this.contexts.map.unbind(action);
  }

  getActions(): ActionDef[] {
    return this.contexts.map.getActions();
  }

  exportActionAsset(): InputActionAsset {
    return { version: 1, actions: this.getActions() };
  }

  importActionAsset(source: InputActionAsset | ActionDef[] | string, context = 'OnFoot'): InputActionAsset {
    const parsed = typeof source === 'string' ? JSON.parse(source) as InputActionAsset | ActionDef[] : source;
    const actions = Array.isArray(parsed) ? parsed : parsed?.actions;
    if (!Array.isArray(actions)) throw new Error('Input action asset must contain an actions array.');
    for (const action of actions) {
      if (!action || typeof action.name !== 'string' || !['button', 'axis1d', 'axis2d'].includes(action.kind) || !Array.isArray(action.bindings)) {
        throw new Error('Invalid input action definition. Expected name, kind, and bindings.');
      }
    }
    this.contexts.replaceActions(actions, context);
    return this.exportActionAsset();
  }

  private initDefaultContexts(): void {
    this.contexts.push({
      name: 'OnFoot',
      priority: 0,
      actions: [
        {
          name: 'Move',
          kind: 'axis2d',
          bindings: [
            { device: 'keyboard', code: 'KeyW' },
            { device: 'keyboard', code: 'KeyS' },
            { device: 'keyboard', code: 'KeyA' },
            { device: 'keyboard', code: 'KeyD' },
            { device: 'keyboard', code: 'ArrowUp' },
            { device: 'keyboard', code: 'ArrowDown' },
            { device: 'keyboard', code: 'ArrowLeft' },
            { device: 'keyboard', code: 'ArrowRight' },
            { device: 'gamepad', control: '<Gamepad>/leftStick' },
          ],
        },
        {
          name: 'Look',
          kind: 'axis2d',
          bindings: [
            { device: 'mouse' },
            { device: 'gamepad', control: '<Gamepad>/rightStick' },
          ],
        },
        {
          name: 'Jump',
          kind: 'button',
          bindings: [
            { device: 'keyboard', code: 'Space' },
            { device: 'gamepad', control: '<Gamepad>/buttonSouth' },
          ],
        },
        {
          name: 'Sprint',
          kind: 'button',
          bindings: [
            { device: 'keyboard', code: 'ShiftLeft' },
            { device: 'keyboard', code: 'ShiftRight' },
            { device: 'gamepad', control: '<Gamepad>/leftStickPress' },
          ],
        },
        {
          name: 'Crouch',
          kind: 'button',
          bindings: [
            { device: 'keyboard', code: 'KeyC' },
            { device: 'gamepad', control: '<Gamepad>/buttonEast' },
          ],
        },
        {
          name: 'Attack',
          kind: 'button',
          bindings: [
            { device: 'mouse', button: 0 },
            { device: 'gamepad', control: '<Gamepad>/rightTrigger', triggerThreshold: 0.35 },
          ],
        },
        {
          name: 'Interact',
          kind: 'button',
          bindings: [
            { device: 'keyboard', code: 'KeyE' },
            { device: 'gamepad', control: '<Gamepad>/buttonWest' },
          ],
        },
        {
          name: 'Backflip',
          kind: 'button',
          bindings: [
            { device: 'keyboard', code: 'KeyR' },
            { device: 'gamepad', control: '<Gamepad>/buttonNorth' },
          ],
        },
        {
          name: 'Charge',
          kind: 'button',
          bindings: [{ device: 'gamepad', control: '<Gamepad>/leftTrigger', triggerThreshold: 0.35 }],
        },
      ],
    });
  }

  // ── Replay support (expose private state for InputReplay) ────────────────
  /** @internal Read-only view of current held keys. */
  get keysDownSet(): ReadonlySet<string> { return this.keysDown; }
  /** @internal Read-only view of keys pressed this frame. */
  get keysPressedSet(): ReadonlySet<string> { return this.keysPressed; }
  /** @internal Read-only view of held mouse buttons. */
  get mouseButtonsSet(): ReadonlySet<number> { return this.mouseButtons; }
  /** @internal Used by InputReplay to set replay state. */
  setReplayKeysDown(keys: string[]): void { this.keysDown.clear(); for (const k of keys) this.keysDown.add(k); }
  setReplayKeysPressed(keys: string[]): void { this.keysPressed.clear(); for (const k of keys) this.keysPressed.add(k); }
  setReplayMouseButtons(btns: number[]): void { this.mouseButtons.clear(); for (const b of btns) this.mouseButtons.add(b); }
  setReplayMouseDelta(x: number, y: number): void { this.mouseDelta.x = x; this.mouseDelta.y = y; }
  setReplayWheelDelta(v: number): void { this._wheelDelta = v; }

  // --- Events --------------------------------------------------------------
  on<K extends keyof EventMap>(event: K, cb: Listener<K>): () => void {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const cb of this.listeners[event]) cb(payload);
  }

  setMode(mode: InputMode): void {
    if (mode === this._mode) return;
    this._mode = mode;
    this.emit('modechange', mode);
  }

  // --- Pointer lock --------------------------------------------------------
  setPointerLockGuard(guard: () => boolean): void {
    this.pointerLockGuard = guard;
  }
  get isPointerLocked(): boolean {
    if (this._testMode) return this._injectedPointerLocked;
    return this.currentDocument.pointerLockElement === this.target;
  }
  /** Guarded request — refused while the guard predicate is true (e.g. gizmo dragging). */
  requestPointerLock(): void {
    if (this.pointerLockGuard()) return;
    if (this._testMode) { this._injectedPointerLocked = true; return; }
    if (!this.isPointerLocked) void this.target.requestPointerLock?.();
  }
  exitPointerLock(): void {
    if (this._testMode) { this._injectedPointerLocked = false; return; }
    if (this.isPointerLocked) this.currentDocument.exitPointerLock?.();
  }

  // --- SENSORIUM: synthetic input + test mode ------------------------------
  setTestMode(on: boolean): void {
    this._testMode = on;
    if (!on) {
      this._injectedPointerLocked = false;
      // Don't clear keysDown/Pressed here — the runner controls its own cleanup.
    }
  }
  get testMode(): boolean { return this._testMode; }

  /** Inject a keyboard event. `down=true` mirrors a keydown, `down=false` a keyup. */
  injectKey(code: string, down: boolean): void {
    if (down) {
      if (!this.keysDown.has(code)) this.keysPressed.add(code);
      this.keysDown.add(code);
    } else {
      this.keysDown.delete(code);
    }
  }
  injectMouseButton(button: number, down: boolean): void {
    if (down) this.mouseButtons.add(button);
    else this.mouseButtons.delete(button);
  }
  /** Accumulate synthetic mouse delta (same semantics as a real pointermove). */
  injectMouseDelta(x: number, y: number): void {
    this.mouseDelta.x += x;
    this.mouseDelta.y += y;
  }
  injectPointerLock(locked: boolean): void {
    this._injectedPointerLocked = locked;
  }

  /** Clear all transient input state (keys, mouse buttons, delta). Used when
   *  the game is paused/unpaused so held keys during the pause don't leak into
   *  the next frame of gameplay. */
  resetInput(): void {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.mouseButtons.clear();
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    this._wheelDelta = 0;
  }

  // --- Frame lifecycle -----------------------------------------------------
  /** Must run at the very end of every frame (loop step 12). */
  endFrame(): void {
    for (const action of this.contexts.map.getActions()) {
      this.actionActiveLastFrame.set(action.name, this.isActionActive(action.name));
    }
    this.keysPressed.clear();
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    this._wheelDelta = 0;
  }

  private clearTransient(): void {
    // SENSORIUM: while a scripted test drives the engine, synthetic input is
    // authoritative and MUST survive focus loss. Automated tests routinely run in an
    // unfocused / background / headless window, where blur + visibilitychange would
    // otherwise wipe the injected keys mid-run and freeze the possessed character.
    // (Real players still lose input on blur — this guard only applies in test mode.)
    if (this._testMode) return;
    this.keysDown.clear();
    this.keysPressed.clear();
    this.mouseButtons.clear();
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    this._wheelDelta = 0;
    this.exitPointerLock();
  }

  dispose(): void {
    this.currentWindow.removeEventListener('keydown', this.onKeyDown);
    this.currentWindow.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.currentWindow.removeEventListener('pointerup', this.onPointerUp);
    this.currentWindow.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.currentWindow.removeEventListener('blur', this.onBlur);
    this.currentDocument.removeEventListener('visibilitychange', this.onVisibility);
    this.gamepad.dispose();
    this.actionActiveLastFrame.clear();
    for (const key of Object.keys(this.listeners) as (keyof EventMap)[]) {
      this.listeners[key].clear();
    }
  }
}
