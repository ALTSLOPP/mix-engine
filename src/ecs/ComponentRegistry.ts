import { Component, type ComponentContext, type ComponentSchema } from './Component';
import type { EntityId } from './SceneManager';

export type ComponentConstructor<T extends Component = Component> = {
  new (): T;
  readonly type: string;
  readonly schema?: ComponentSchema;
};

export class ComponentRegistry {
  private static readonly types = new Map<string, ComponentConstructor>();

  /**
   * Register a component class with the engine registry.
   */
  static register<T extends Component>(ctor: ComponentConstructor<T>, explicitType?: string): void {
    const type = explicitType ?? (ctor as any).type;
    if (!type) {
      throw new Error(`Component class ${ctor.name} missing static 'type' property`);
    }
    this.types.set(type, ctor as ComponentConstructor);
  }

  /**
   * Look up a registered component constructor by type key.
   */
  static get(type: string): ComponentConstructor | undefined {
    return this.types.get(type);
  }

  /**
   * Check if a component type is registered.
   */
  static has(type: string): boolean {
    return this.types.has(type);
  }

  /**
   * Instantiate and initialize a component on an entity.
   */
  static create(
    type: string,
    entity: EntityId,
    ctx: ComponentContext,
    props?: Record<string, unknown>,
  ): Component {
    const Ctor = this.types.get(type);
    if (!Ctor) {
      throw new Error(`Component type '${type}' is not registered`);
    }
    const instance = new Ctor();
    instance.__init(entity, ctx);
    if (props) {
      this.applyProps(instance, props);
    }
    return instance;
  }

  /**
   * Apply properties to a component instance with basic validation.
   */
  static applyProps(component: Component, props: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(props)) {
      if (key in component) {
        (component as any)[key] = value;
      }
    }
  }

  /**
   * Serialize a component's exposed properties to JSON.
   */
  static serialize(component: Component): Record<string, unknown> {
    const ctor = component.constructor as ComponentConstructor;
    const schema = ctor.schema;
    const result: Record<string, unknown> = {
      enabled: component.enabled,
    };
    if (schema) {
      for (const propName of Object.keys(schema)) {
        if (propName in component) {
          result[propName] = (component as any)[propName];
        }
      }
    } else {
      // Fallback: serialize public primitive fields
      for (const [k, v] of Object.entries(component)) {
        if (k.startsWith('_') || k === 'ctx' || k === 'entity' || typeof v === 'function') continue;
        result[k] = v;
      }
    }
    return result;
  }

  /**
   * Return schema dump of all registered components for HELM/manifest/Inspector.
   */
  static list(): Array<{ type: string; schema?: ComponentSchema }> {
    const out: Array<{ type: string; schema?: ComponentSchema }> = [];
    for (const [type, ctor] of this.types.entries()) {
      out.push({
        type,
        schema: ctor.schema,
      });
    }
    return out;
  }

  /**
   * Reset registry (used in tests).
   */
  static clear(): void {
    this.types.clear();
  }

  /**
   * Register default built-in components.
   */
  static registerBuiltins(): void {
    this.register(HealthModularComponent);
    this.register(RotatorComponent);
    this.register(LightComponent);
    this.register(CameraComponent);
    this.register(AudioSourceComponent);
    this.register(ColliderComponent);
    this.register(CharacterLocomotorComponent);
    this.register(ParticleEmitterComponent);
    this.register(TransformComponent);
    this.register(AudioListenerComponent);
  }
}

import { HealthModularComponent } from './components/HealthComponent';
import { RotatorComponent } from './components/RotatorComponent';
import { LightComponent } from './components/LightComponent';
import { CameraComponent } from './components/CameraComponent';
import { AudioSourceComponent } from './components/AudioSourceComponent';
import { ColliderComponent } from './components/ColliderComponent';
import { CharacterLocomotorComponent } from './components/CharacterLocomotorComponent';
import { ParticleEmitterComponent } from './components/ParticleEmitterComponent';
import { TransformComponent } from './components/TransformComponent';
import { AudioListenerComponent } from './components/AudioListenerComponent';

ComponentRegistry.registerBuiltins();
