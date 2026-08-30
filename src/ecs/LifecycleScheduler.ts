import { Component, type CollisionInfo } from './Component';
import type { EntityId } from './SceneManager';

/**
 * High-performance lifecycle scheduler for modular ECS components.
 * Employs flat arrays with O(1) swap-pop removal for minimal GC overhead.
 */
export class LifecycleScheduler {
  // Un-awoken queue
  private readonly awakeQueue: Component[] = [];

  // Components waiting for their first onStart()
  private readonly startList: Component[] = [];

  // Hot lists for per-frame / fixed-step simulation
  private readonly fixedList: Component[] = [];
  private readonly fixedIndex = new Map<Component, number>();

  private readonly updateList: Component[] = [];
  private readonly updateIndex = new Map<Component, number>();

  private readonly lateList: Component[] = [];
  private readonly lateIndex = new Map<Component, number>();

  // Per-entity component index for direct collision/trigger dispatch
  private readonly entityComponents = new Map<EntityId, Set<Component>>();

  /**
   * Register a component into the lifecycle system.
   */
  register(component: Component): void {
    this.awakeQueue.push(component);

    // Index by entity
    let set = this.entityComponents.get(component.entity);
    if (!set) {
      set = new Set<Component>();
      this.entityComponents.set(component.entity, set);
    }
    set.add(component);

    // Register into hot lists based on prototype method overrides
    const proto = Object.getPrototypeOf(component);
    if (proto.onFixedUpdate !== Component.prototype.onFixedUpdate) {
      this.fixedIndex.set(component, this.fixedList.length);
      this.fixedList.push(component);
    }

    if (proto.onUpdate !== Component.prototype.onUpdate) {
      this.updateIndex.set(component, this.updateList.length);
      this.updateList.push(component);
    }

    if (proto.onLateUpdate !== Component.prototype.onLateUpdate) {
      this.lateIndex.set(component, this.lateList.length);
      this.lateList.push(component);
    }
  }

  /**
   * Unregister a component and remove from all lifecycle lists.
   */
  unregister(component: Component): void {
    if (component.destroyed) return;
    component.destroyed = true;

    try {
      component.onDestroy();
    } catch (err) {
      console.error(`[LifecycleScheduler] Error in onDestroy for entity ${component.entity}:`, err);
    }

    // Remove from entity map
    const set = this.entityComponents.get(component.entity);
    if (set) {
      set.delete(component);
      if (set.size === 0) {
        this.entityComponents.delete(component.entity);
      }
    }

    // Remove from awake / start queues
    const awakeIdx = this.awakeQueue.indexOf(component);
    if (awakeIdx !== -1) {
      this.awakeQueue.splice(awakeIdx, 1);
    }
    const startIdx = this.startList.indexOf(component);
    if (startIdx !== -1) {
      this.startList.splice(startIdx, 1);
    }

    // Swap-pop from hot lists
    this.swapPop(this.fixedList, this.fixedIndex, component);
    this.swapPop(this.updateList, this.updateIndex, component);
    this.swapPop(this.lateList, this.lateIndex, component);
  }

  /**
   * Drain awake queue and call onAwake on newly registered components.
   * Called during flush operations at Step 8.
   */
  flushAwake(): void {
    while (this.awakeQueue.length > 0) {
      const comp = this.awakeQueue.shift()!;
      if (comp.destroyed) continue;
      try {
        comp.onAwake();
      } catch (err) {
        console.error(`[LifecycleScheduler] Error in onAwake for entity ${comp.entity}:`, err);
      }
      this.startList.push(comp);
    }
  }

  /**
   * Call onStart for all awoken components before their first update tick.
   */
  flushStart(): void {
    if (this.startList.length === 0) return;
    const pending = this.startList.splice(0, this.startList.length);
    for (const comp of pending) {
      if (comp.destroyed || comp.started) continue;
      if (comp.enabled) {
        comp.started = true;
        try {
          comp.onStart();
        } catch (err) {
          console.error(`[LifecycleScheduler] Error in onStart for entity ${comp.entity}:`, err);
        }
      } else {
        // If currently disabled, requeue until enabled
        this.startList.push(comp);
      }
    }
  }

  /**
   * Deterministic fixed update — called in loop step 6 inside the substep loop.
   */
  stepFixed(fixedDt: number): void {
    for (let i = 0; i < this.fixedList.length; i++) {
      const comp = this.fixedList[i];
      if (comp.enabled && !comp.destroyed) {
        try {
          comp.onFixedUpdate(fixedDt);
        } catch (err) {
          console.error(`[LifecycleScheduler] Error in onFixedUpdate for entity ${comp.entity}:`, err);
        }
      }
    }
  }

  /**
   * Variable rate update — called in loop step 4/5.
   */
  stepUpdate(dt: number): void {
    for (let i = 0; i < this.updateList.length; i++) {
      const comp = this.updateList[i];
      if (comp.enabled && !comp.destroyed) {
        try {
          comp.onUpdate(dt);
        } catch (err) {
          console.error(`[LifecycleScheduler] Error in onUpdate for entity ${comp.entity}:`, err);
        }
      }
    }
  }

  /**
   * Late update — called after interpolation and parent-child updates (step 10b/11).
   */
  stepLate(dt: number): void {
    for (let i = 0; i < this.lateList.length; i++) {
      const comp = this.lateList[i];
      if (comp.enabled && !comp.destroyed) {
        try {
          comp.onLateUpdate(dt);
        } catch (err) {
          console.error(`[LifecycleScheduler] Error in onLateUpdate for entity ${comp.entity}:`, err);
        }
      }
    }
  }

  /**
   * Fan out collision start to all components attached to the entity.
   */
  dispatchCollisionEnter(entity: EntityId, info: CollisionInfo): void {
    const set = this.entityComponents.get(entity);
    if (!set) return;
    for (const comp of set) {
      if (comp.enabled && !comp.destroyed) {
        try {
          comp.onCollisionEnter(info);
        } catch (err) {
          console.error(`[LifecycleScheduler] Error in onCollisionEnter for entity ${entity}:`, err);
        }
      }
    }
  }

  /**
   * Fan out collision exit to all components attached to the entity.
   */
  dispatchCollisionExit(entity: EntityId, info: CollisionInfo): void {
    const set = this.entityComponents.get(entity);
    if (!set) return;
    for (const comp of set) {
      if (comp.enabled && !comp.destroyed) {
        try {
          comp.onCollisionExit(info);
        } catch (err) {
          console.error(`[LifecycleScheduler] Error in onCollisionExit for entity ${entity}:`, err);
        }
      }
    }
  }

  /**
   * Fan out trigger/sensor enter to all components attached to the entity.
   */
  dispatchTriggerEnter(entity: EntityId, otherEntity: EntityId): void {
    const set = this.entityComponents.get(entity);
    if (!set) return;
    for (const comp of set) {
      if (comp.enabled && !comp.destroyed) {
        try {
          comp.onTriggerEnter(otherEntity);
        } catch (err) {
          console.error(`[LifecycleScheduler] Error in onTriggerEnter for entity ${entity}:`, err);
        }
      }
    }
  }

  /**
   * Fan out trigger/sensor exit to all components attached to the entity.
   */
  dispatchTriggerExit(entity: EntityId, otherEntity: EntityId): void {
    const set = this.entityComponents.get(entity);
    if (!set) return;
    for (const comp of set) {
      if (comp.enabled && !comp.destroyed) {
        try {
          comp.onTriggerExit(otherEntity);
        } catch (err) {
          console.error(`[LifecycleScheduler] Error in onTriggerExit for entity ${entity}:`, err);
        }
      }
    }
  }

  /**
   * Get all components attached to an entity.
   */
  getComponentsForEntity(entity: EntityId): Component[] {
    const set = this.entityComponents.get(entity);
    return set ? Array.from(set) : [];
  }

  private swapPop(list: Component[], indexMap: Map<Component, number>, item: Component): void {
    const idx = indexMap.get(item);
    if (idx === undefined) return;
    const last = list.length - 1;
    if (idx !== last) {
      const moved = list[last];
      list[idx] = moved;
      indexMap.set(moved, idx);
    }
    list.pop();
    indexMap.delete(item);
  }
}
