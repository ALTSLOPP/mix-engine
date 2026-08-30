import type { EntityId, SceneManager } from './SceneManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { EventBus } from './EventBus';
import type { Time } from '../engine/Time';
import type { InputManager } from '../engine/InputManager';
import type { AudioManager } from '../audio/AudioManager';

export interface CollisionInfo {
  otherEntity: EntityId;
  otherCollider: number;
  selfCollider: number;
}

export interface ComponentContext {
  sceneManager: SceneManager;
  physicsWorld: PhysicsWorld;
  events: EventBus;
  time?: Time;
  input?: InputManager;
  audio?: AudioManager;
}

export type ExposeType = 'range' | 'number' | 'string' | 'bool' | 'boolean' | 'enum' | 'vector3' | 'asset';

export interface ComponentFieldSchema {
  type: ExposeType;
  min?: number;
  max?: number;
  step?: number;
  options?: string[] | Array<{ label: string; value: unknown }>;
  doc?: string;
  default?: unknown;
}

export type ComponentSchema = Record<string, ComponentFieldSchema>;

/**
 * Base class for all modular ECS components in MIX Engine.
 * Supports standard lifecycle hooks:
 * - onAwake: called once on component attachment before first tick
 * - onStart: called on the first frame before first update (after all onAwake calls)
 * - onEnable / onDisable: called on active state toggles
 * - onUpdate(dt): render-rate update
 * - onFixedUpdate(fixedDt): deterministic fixed-rate simulation update (step 6)
 * - onLateUpdate(dt): post-interpolation, pre-render update (step 10b/11)
 * - onCollisionEnter / Exit: solid physics contacts
 * - onTriggerEnter / Exit: sensor / trigger overlaps
 * - onDestroy: called when component or entity is removed
 */
export abstract class Component {
  static readonly type: string = '';
  static _schema?: ComponentSchema;

  static get schema(): ComponentSchema | undefined {
    return this._schema;
  }

  entity!: EntityId;
  private _enabled = true;
  started = false;
  destroyed = false;
  protected ctx!: ComponentContext;

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(val: boolean) {
    if (this._enabled === val) return;
    this._enabled = val;
    if (val) {
      this.onEnable();
    } else {
      this.onDisable();
    }
  }

  /**
   * Internal initialization by SceneManager / ComponentRegistry.
   */
  __init(entity: EntityId, ctx: ComponentContext): void {
    this.entity = entity;
    this.ctx = ctx;
  }

  /** Called after attach, before first update. Safe to query siblings. */
  onAwake(): void {}

  /** First frame after all onAwake have executed. */
  onStart(): void {}

  /** Called when component is enabled. */
  onEnable(): void {}

  /** Called when component is disabled. */
  onDisable(): void {}

  /** Render-rate update. */
  onUpdate(_dt: number): void {}

  /** Deterministic fixed-substep update inside step 6 loop. */
  onFixedUpdate(_fixedDt: number): void {}

  /** Post-interpolation, pre-render update after step 10b. */
  onLateUpdate(_dt: number): void {}

  /** Called on solid physics contact start. */
  onCollisionEnter(_info: CollisionInfo): void {}

  /** Called on solid physics contact end. */
  onCollisionExit(_info: CollisionInfo): void {}

  /** Called when entering a trigger/sensor zone. */
  onTriggerEnter(_other: EntityId): void {}

  /** Called when exiting a trigger/sensor zone. */
  onTriggerExit(_other: EntityId): void {}

  /** Called when the component is destroyed. Clean up non-ECS resources here. */
  onDestroy(): void {}
}
