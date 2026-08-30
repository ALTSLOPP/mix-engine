import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Component, type CollisionInfo } from '../src/ecs/Component';
import { ComponentRegistry } from '../src/ecs/ComponentRegistry';
import { LifecycleScheduler } from '../src/ecs/LifecycleScheduler';
import { SceneManager } from '../src/ecs/SceneManager';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { RigidBodyComponent } from '../src/physics/RigidBodyComponent';
import { AssetCache } from '../src/animation/AssetCache';
import { WorldOrigin } from '../src/streaming/WorldOrigin';
import { expose } from '../src/inspector/SchemaDecorators';

class TestPlayerComponent extends Component {
  static override readonly type = 'testPlayer';

  @expose({ type: 'number', min: 0, max: 100, doc: 'Player health points', default: 100 })
  health = 100;

  @expose({ type: 'string', doc: 'Player character name', default: 'Hero' })
  heroName = 'Hero';

  awakeCount = 0;
  startCount = 0;
  updateCount = 0;
  fixedUpdateCount = 0;
  lateUpdateCount = 0;
  enableCount = 0;
  disableCount = 0;
  destroyCount = 0;
  collisionEnterCount = 0;
  collisionExitCount = 0;
  triggerEnterCount = 0;
  triggerExitCount = 0;

  override onAwake(): void {
    this.awakeCount++;
  }

  override onStart(): void {
    this.startCount++;
  }

  override onEnable(): void {
    this.enableCount++;
  }

  override onDisable(): void {
    this.disableCount++;
  }

  override onUpdate(_dt: number): void {
    this.updateCount++;
  }

  override onFixedUpdate(_fixedDt: number): void {
    this.fixedUpdateCount++;
  }

  override onLateUpdate(_dt: number): void {
    this.lateUpdateCount++;
  }

  override onCollisionEnter(_info: CollisionInfo): void {
    this.collisionEnterCount++;
  }

  override onCollisionExit(_info: CollisionInfo): void {
    this.collisionExitCount++;
  }

  override onTriggerEnter(_other: number): void {
    this.triggerEnterCount++;
  }

  override onTriggerExit(_other: number): void {
    this.triggerExitCount++;
  }

  override onDestroy(): void {
    this.destroyCount++;
  }
}

describe('Modular Component Lifecycle (S4)', () => {
  it('populates @expose schema onto static schema and registry', () => {
    ComponentRegistry.register(TestPlayerComponent);

    expect(TestPlayerComponent.schema).toBeDefined();
    expect(TestPlayerComponent.schema?.health).toEqual({
      type: 'number',
      min: 0,
      max: 100,
      step: undefined,
      options: undefined,
      doc: 'Player health points',
      default: 100,
    });
    expect(TestPlayerComponent.schema?.heroName).toEqual({
      type: 'string',
      min: undefined,
      max: undefined,
      step: undefined,
      options: undefined,
      doc: 'Player character name',
      default: 'Hero',
    });
  });

  it('runs complete lifecycle: onAwake -> onStart -> onUpdate/onFixedUpdate/onLateUpdate -> onDestroy', async () => {
    const physicsWorld = await PhysicsWorld.create();
    const scene = new THREE.Scene();
    const assetCache = new AssetCache();
    const worldOrigin = new WorldOrigin();
    const sm = new SceneManager(scene, physicsWorld, assetCache, worldOrigin);

    sm.registerBuilder('dummy', (pos, _p, ctx) => {
      const b = ctx.physicsWorld.createRigidBody(ctx.physicsWorld.RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z));
      ctx.physicsWorld.createBoxCollider(b, 0.5, 0.5, 0.5);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      m.position.copy(pos);
      return new RigidBodyComponent(ctx.physicsWorld, b, m, { source: 'owned' });
    });

    let entityId = 1;
    sm.requestSpawn(new THREE.Vector3(0, 0, 0), { kind: 'dummy', params: {} }, {
      onSpawned: (id) => {
        entityId = id;
      },
    });

    // Flush spawn
    sm.flushDeferredOperations();

    const comp = new TestPlayerComponent();
    comp.__init(entityId, { sceneManager: sm, physicsWorld, events: sm.events });
    sm.attachComponent(entityId, comp);

    // Initial state: not awoken yet until flush
    expect(comp.awakeCount).toBe(0);
    expect(comp.startCount).toBe(0);

    // Step 8 flush triggers onAwake and onStart
    sm.flushDeferredOperations();
    expect(comp.awakeCount).toBe(1);
    expect(comp.startCount).toBe(1);

    // Step 4/5 update
    sm.lifecycle.stepUpdate(0.016);
    expect(comp.updateCount).toBe(1);

    // Step 6 fixed update (deterministic)
    const fixedDt = 1 / 60;
    for (let i = 0; i < 60; i++) {
      sm.lifecycle.stepFixed(fixedDt);
    }
    expect(comp.fixedUpdateCount).toBe(60);

    // Step 10b late update
    sm.lifecycle.stepLate(0.016);
    expect(comp.lateUpdateCount).toBe(1);

    // Toggling enabled flag
    comp.enabled = false;
    expect(comp.disableCount).toBe(1);
    sm.lifecycle.stepUpdate(0.016);
    expect(comp.updateCount).toBe(1); // Didn't increment while disabled

    comp.enabled = true;
    expect(comp.enableCount).toBe(1);
    sm.lifecycle.stepUpdate(0.016);
    expect(comp.updateCount).toBe(2);

    // Collision & trigger event dispatch
    sm.lifecycle.dispatchCollisionEnter(entityId, { otherEntity: 2, otherCollider: 0, selfCollider: 1 });
    expect(comp.collisionEnterCount).toBe(1);

    sm.lifecycle.dispatchCollisionExit(entityId, { otherEntity: 2, otherCollider: 0, selfCollider: 1 });
    expect(comp.collisionExitExitCount ?? comp.collisionExitCount).toBe(1);

    sm.lifecycle.dispatchTriggerEnter(entityId, 3);
    expect(comp.triggerEnterCount).toBe(1);

    sm.lifecycle.dispatchTriggerExit(entityId, 3);
    expect(comp.triggerExitCount).toBe(1);

    // Destroy entity
    sm.requestDestroy(entityId);
    sm.flushDeferredOperations();
    expect(comp.destroyCount).toBe(1);
  });

  it('serializes and deserializes component properties', () => {
    const comp = new TestPlayerComponent();
    comp.health = 75;
    comp.heroName = 'Warrior';

    const serialized = ComponentRegistry.serialize(comp);
    expect(serialized).toEqual({
      enabled: true,
      health: 75,
      heroName: 'Warrior',
    });

    ComponentRegistry.applyProps(comp, { health: 40, heroName: 'Mage' });
    expect(comp.health).toBe(40);
    expect(comp.heroName).toBe('Mage');
  });
});
