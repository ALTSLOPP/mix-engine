import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ComponentRegistry } from '../src/ecs/ComponentRegistry';
import { LightComponent } from '../src/ecs/components/LightComponent';
import { CameraComponent } from '../src/ecs/components/CameraComponent';
import { AudioSourceComponent } from '../src/ecs/components/AudioSourceComponent';
import { ColliderComponent } from '../src/ecs/components/ColliderComponent';
import { CharacterLocomotorComponent } from '../src/ecs/components/CharacterLocomotorComponent';
import { ParticleEmitterComponent } from '../src/ecs/components/ParticleEmitterComponent';

describe('Standard ECS Components Library', () => {
  beforeEach(() => {
    ComponentRegistry.clear();
    ComponentRegistry.registerBuiltins();
  });

  it('registers all standard built-in component types in the registry', () => {
    const list = ComponentRegistry.list();
    const types = list.map((item) => item.type);

    expect(types).toContain('health');
    expect(types).toContain('rotator');
    expect(types).toContain('light');
    expect(types).toContain('camera');
    expect(types).toContain('audioSource');
    expect(types).toContain('collider');
    expect(types).toContain('characterLocomotor');
    expect(types).toContain('particleEmitter');
    expect(types).toContain('transform');
    expect(types).toContain('audioListener');
  });

  it('instantiates and configures LightComponent correctly', () => {
    const mockCtx: any = {
      sceneManager: {
        getComponent: () => null,
      },
    };

    const light = ComponentRegistry.create('light', 1, mockCtx, {
      lightType: 'spot',
      intensity: 5.5,
      color: '#ff0000',
      castShadow: true,
    }) as LightComponent;

    expect(light).toBeInstanceOf(LightComponent);
    expect(light.lightType).toBe('spot');
    expect(light.intensity).toBe(5.5);
    expect(light.color).toBe('#ff0000');
    expect(light.castShadow).toBe(true);

    const serialized = ComponentRegistry.serialize(light);
    expect(serialized.lightType).toBe('spot');
    expect(serialized.intensity).toBe(5.5);
    expect(serialized.color).toBe('#ff0000');
  });

  it('instantiates and configures CameraComponent correctly', () => {
    const mockCtx: any = {
      sceneManager: {
        getComponent: () => null,
      },
    };

    const camera = ComponentRegistry.create('camera', 2, mockCtx, {
      fov: 75,
      near: 0.2,
      far: 2000,
      isMain: true,
    }) as CameraComponent;

    expect(camera).toBeInstanceOf(CameraComponent);
    expect(camera.fov).toBe(75);
    expect(camera.near).toBe(0.2);
    expect(camera.far).toBe(2000);
    expect(camera.isMain).toBe(true);

    const serialized = ComponentRegistry.serialize(camera);
    expect(serialized.fov).toBe(75);
    expect(serialized.far).toBe(2000);
  });

  it('instantiates and configures AudioSourceComponent correctly', () => {
    const mockCtx: any = {
      sceneManager: {
        getComponent: () => null,
      },
    };

    const audio = ComponentRegistry.create('audioSource', 3, mockCtx, {
      src: 'sfx/laser.mp3',
      volume: 0.8,
      loop: true,
      bus: 'sfx',
    }) as AudioSourceComponent;

    expect(audio).toBeInstanceOf(AudioSourceComponent);
    expect(audio.src).toBe('sfx/laser.mp3');
    expect(audio.volume).toBe(0.8);
    expect(audio.loop).toBe(true);
    expect(audio.bus).toBe('sfx');

    const serialized = ComponentRegistry.serialize(audio);
    expect(serialized.src).toBe('sfx/laser.mp3');
    expect(serialized.volume).toBe(0.8);
  });

  it('instantiates and configures ColliderComponent correctly', () => {
    const mockCtx: any = {
      sceneManager: {
        getComponent: () => null,
      },
    };

    const col = ComponentRegistry.create('collider', 4, mockCtx, {
      shape: 'capsule',
      radius: 0.6,
      halfHeight: 1.2,
      isTrigger: true,
      friction: 0.7,
    }) as ColliderComponent;

    expect(col).toBeInstanceOf(ColliderComponent);
    expect(col.shape).toBe('capsule');
    expect(col.radius).toBe(0.6);
    expect(col.halfHeight).toBe(1.2);
    expect(col.isTrigger).toBe(true);
    expect(col.friction).toBe(0.7);

    const serialized = ComponentRegistry.serialize(col);
    expect(serialized.shape).toBe('capsule');
    expect(serialized.isTrigger).toBe(true);
  });

  it('instantiates and configures CharacterLocomotorComponent correctly', () => {
    const mockCtx: any = {
      sceneManager: {
        getComponent: () => null,
      },
    };

    const kcc = ComponentRegistry.create('characterLocomotor', 5, mockCtx, {
      walkSpeed: 5.0,
      runSpeed: 10.0,
      jumpHeight: 2.0,
      coyoteTime: 0.15,
    }) as CharacterLocomotorComponent;

    expect(kcc).toBeInstanceOf(CharacterLocomotorComponent);
    expect(kcc.walkSpeed).toBe(5.0);
    expect(kcc.runSpeed).toBe(10.0);
    expect(kcc.jumpHeight).toBe(2.0);
    expect(kcc.coyoteTime).toBe(0.15);

    const serialized = ComponentRegistry.serialize(kcc);
    expect(serialized.walkSpeed).toBe(5.0);
    expect(serialized.runSpeed).toBe(10.0);
  });

  it('instantiates and configures ParticleEmitterComponent correctly', () => {
    const mockCtx: any = {
      sceneManager: {
        getComponent: () => null,
      },
    };

    const emitter = ComponentRegistry.create('particleEmitter', 6, mockCtx, {
      preset: 'sparks',
      rate: 50,
      maxParticles: 500,
      color: '#ffff00',
    }) as ParticleEmitterComponent;

    expect(emitter).toBeInstanceOf(ParticleEmitterComponent);
    expect(emitter.preset).toBe('sparks');
    expect(emitter.rate).toBe(50);
    expect(emitter.maxParticles).toBe(500);
    expect(emitter.color).toBe('#ffff00');

    const serialized = ComponentRegistry.serialize(emitter);
    expect(serialized.preset).toBe('sparks');
    expect(serialized.maxParticles).toBe(500);
  });
});
