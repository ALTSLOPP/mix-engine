import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ZombieHordeAISystem, DEFAULT_ZOMBIE_HORDE_CONFIG } from '../src/features/gameplay/ZombieHordeAISystem';
import { GameplayFeatureRegistry } from '../src/features/gameplay/GameplayFeatureRegistry';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';

function createMockEngine(): any {
  const events = {
    listeners: new Map<string, Array<(payload: any) => void>>(),
    on(event: string, callback: (payload: any) => void) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event)!.push(callback);
      return () => {
        const arr = this.listeners.get(event) ?? [];
        const idx = arr.indexOf(callback);
        if (idx !== -1) arr.splice(idx, 1);
      };
    },
    emit(event: string, payload: any) {
      const arr = this.listeners.get(event);
      if (arr) for (const cb of [...arr]) cb(payload);
    },
    get listenerCount() {
      let count = 0;
      for (const arr of this.listeners.values()) count += arr.length;
      return count;
    },
  };

  const scene = new THREE.Scene();
  const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
  playerMesh.position.set(0, 0, 0);

  const healthMap = new Map<number, { hp: number; maxHp: number; faction: string }>();
  healthMap.set(1, { hp: 100, maxHp: 100, faction: 'player' });

  return {
    sceneManager: {
      events,
      getRigidBody: (id: number) => {
        if (id === 1) {
          return { mesh: playerMesh, setNextKinematicTranslation: () => {} };
        }
        return null;
      },
    },
    player: {
      getPossessedId: () => 1,
      enabled: true,
      setInputLocked: vi.fn(),
    },
    combat: {
      getHealth: (id: number) => healthMap.get(id) ?? null,
      applyDamage: (attackerId: number | null, targetId: number, damage: number) => {
        const h = healthMap.get(targetId);
        if (h) h.hp = Math.max(0, h.hp - damage);
      },
    },
    viewport: {
      scene,
      camera: { position: new THREE.Vector3(0, 2, 5), fov: 75, updateProjectionMatrix: vi.fn() },
      renderer: { toneMappingExposure: 1, shadowMap: { enabled: true } },
    },
    burstVfx: vi.fn(),
    audio: { play: vi.fn() },
    timeDilation: { getGlobalTimeScale: () => 1, setTimeScale: vi.fn() },
    findAnimationStateMachine: () => null,
  };
}

describe('ZombieHordeAISystem — Core Archetypes & Spawning', () => {
  let engine: any;
  let system: ZombieHordeAISystem;

  beforeEach(() => {
    engine = createMockEngine();
    system = new ZombieHordeAISystem(engine, DEFAULT_ZOMBIE_HORDE_CONFIG);
  });

  it('spawns zombies with distinct archetype attributes and registers visual meshes', () => {
    const shambler = system.spawnZombie('shambler', new THREE.Vector3(10, 0, 10));
    expect(shambler).not.toBeNull();
    expect(shambler?.archetype).toBe('shambler');
    expect(shambler?.health).toBe(100);
    expect(shambler?.poise).toBe(30);

    const runner = system.spawnZombie('runner', new THREE.Vector3(15, 0, 10));
    expect(runner?.archetype).toBe('runner');
    expect(runner?.health).toBe(60);

    const tank = system.spawnZombie('tank', new THREE.Vector3(20, 0, 10));
    expect(tank?.archetype).toBe('tank');
    expect(tank?.health).toBe(450);
    expect(tank?.poise).toBe(120);

    const spitter = system.spawnZombie('spitter', new THREE.Vector3(25, 0, 10));
    expect(spitter?.archetype).toBe('spitter');
    expect(spitter?.health).toBe(80);

    expect(system.getZombies().length).toBe(4);
    expect(system.getRoot().children.length).toBe(4);
  });

  it('respects maxActiveZombies configuration limit', () => {
    system.setConfig({ maxActiveZombies: 2 });
    expect(system.spawnZombie('shambler')).not.toBeNull();
    expect(system.spawnZombie('runner')).not.toBeNull();
    expect(system.spawnZombie('tank')).toBeNull();
    expect(system.getZombies().length).toBe(2);
  });
});

describe('ZombieHordeAISystem — Senses & Auditory Perception', () => {
  let engine: any;
  let system: ZombieHordeAISystem;

  beforeEach(() => {
    engine = createMockEngine();
    system = new ZombieHordeAISystem(engine, DEFAULT_ZOMBIE_HORDE_CONFIG);
  });

  it('alerts dormant/wandering zombies upon detecting gunfire noise events', () => {
    const zombie = system.spawnZombie('shambler', new THREE.Vector3(15, 0, 0), 'idle');
    expect(zombie?.state).toBe('idle');

    // Fire weapon nearby at (0, 0, 0)
    engine.sceneManager.events.emit('ranged_weapon_fired', {
      origin: new THREE.Vector3(0, 0, 0),
      noiseScale: 1.0,
    });

    expect(zombie?.state).toBe('investigating_noise');
    expect(zombie?.lastNoisePosition).toMatchObject({ x: 0, y: 0, z: 0 });

    // Step system towards noise
    system.update(0.5);
    expect(zombie?.position.x).toBeLessThan(15);
  });

  it('propagates alert screech wave when a zombie spots the player', () => {
    const spy = vi.fn();
    engine.sceneManager.events.on('zombie_screeched', spy);

    // Spawn zombie facing player at (0, 0, 0)
    const zombie = system.spawnZombie('runner', new THREE.Vector3(0, 0, 10), 'idle');
    if (zombie) {
      zombie.yaw = Math.PI; // facing -Z towards (0, 0, 0)
    }

    system.update(0.1);
    expect(zombie?.state).toBe('chasing');
    expect(spy).toHaveBeenCalled();
  });
});

describe('ZombieHordeAISystem — 360° Surrounding Flocking & Crowd Separation', () => {
  let engine: any;
  let system: ZombieHordeAISystem;

  beforeEach(() => {
    engine = createMockEngine();
    system = new ZombieHordeAISystem(engine, DEFAULT_ZOMBIE_HORDE_CONFIG);
  });

  it('assigns 360 degree surround slots and applies flocking crowd separation', () => {
    const z1 = system.spawnZombie('shambler', new THREE.Vector3(5, 0, 0), 'chasing');
    const z2 = system.spawnZombie('shambler', new THREE.Vector3(5.1, 0, 0.1), 'chasing');

    expect(z1?.assignedSurroundSlot).toBe(0);
    expect(z2?.assignedSurroundSlot).toBe(1);

    const initialDistance = z1!.position.distanceTo(z2!.position);

    // Step flocking updates
    system.update(0.2);

    const postDistance = z1!.position.distanceTo(z2!.position);
    expect(postDistance).toBeGreaterThan(initialDistance);
  });
});

describe('ZombieHordeAISystem — Combat, Dismemberment & Poise', () => {
  let engine: any;
  let system: ZombieHordeAISystem;

  beforeEach(() => {
    engine = createMockEngine();
    system = new ZombieHordeAISystem(engine, DEFAULT_ZOMBIE_HORDE_CONFIG);
  });

  it('applies headshot multipliers and triggers instant decapitation on lethal hits', () => {
    const zombie = system.spawnZombie('shambler', new THREE.Vector3(5, 0, 0));
    expect(zombie).not.toBeNull();

    const killedSpy = vi.fn();
    engine.sceneManager.events.on('zombie_killed', killedSpy);

    // Headshot with 60 base damage * 2.5 multiplier > 50 instakill threshold
    const result = system.applyZombieHit(zombie!.id, 60, true, 'head');
    expect(result).toBe(true);
    expect(zombie?.state).toBe('dead');
    expect(killedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: zombie!.id,
        isHeadshot: true,
      })
    );
  });

  it('transitions standing zombies into crawlers upon leg dismemberment', () => {
    const zombie = system.spawnZombie('shambler', new THREE.Vector3(5, 0, 0));
    expect(zombie?.isCrawling).toBe(false);
    expect(zombie?.archetype).toBe('shambler');

    // Hit leg
    system.applyZombieHit(zombie!.id, 25, false, 'leg');
    expect(zombie?.isCrawling).toBe(true);
    expect(zombie?.archetype).toBe('crawler');
  });

  it('triggers poise break and stagger state on heavy impacts', () => {
    const zombie = system.spawnZombie('shambler', new THREE.Vector3(5, 0, 0));
    expect(zombie?.state).toBe('idle');

    // Body shot with high poise damage
    system.applyZombieHit(zombie!.id, 45, false, 'torso');
    expect(zombie?.state).toBe('staggered');
    expect(zombie?.staggerTimer).toBeGreaterThan(0);
  });
});

describe('ZombieHordeAISystem — Special Infected Projectiles & Attacks', () => {
  let engine: any;
  let system: ZombieHordeAISystem;

  beforeEach(() => {
    engine = createMockEngine();
    system = new ZombieHordeAISystem(engine, DEFAULT_ZOMBIE_HORDE_CONFIG);
  });

  it('spitter launches corrosive acid projectiles toward player with AOE collision', () => {
    const spitter = system.spawnZombie('spitter', new THREE.Vector3(0, 0, 8), 'chasing');
    if (spitter) spitter.attackCooldown = 0;

    system.update(0.1);
    expect(system.getProjectiles().length).toBeGreaterThan(0);

    const proj = system.getProjectiles()[0];
    expect(proj.damage).toBe(28);

    // Step projectile into player at (0, 0, 0)
    system.update(0.5);
    expect(engine.burstVfx).toHaveBeenCalledWith('poison', expect.any(Object), 6);
  });

  it('tank executes heavy ground slam attack with AOE shockwave', () => {
    const tank = system.spawnZombie('tank', new THREE.Vector3(0, 0, 2), 'chasing');
    if (tank) tank.attackCooldown = 0;

    system.update(0.1);
    expect(engine.burstVfx).toHaveBeenCalledWith('dust', expect.any(Object), 8);
  });
});

describe('ZombieHordeAISystem — Wave Survival Flow & Presets', () => {
  let engine: any;
  let manager: GameplayFeatureManager;

  beforeEach(() => {
    engine = createMockEngine();
    manager = new GameplayFeatureManager(engine);
  });

  it('manages wave survival round scaling and kill counting', () => {
    const zh = manager.zombieHorde;
    zh.setConfig({ enabled: true });
    zh.startWave(0);

    expect(zh.getWaveState().active).toBe(true);
    expect(zh.getWaveState().currentWaveIndex).toBe(0);

    // Step spawning
    zh.update(1.0);
    expect(zh.getZombies().length).toBeGreaterThan(0);

    // Kill all spawned zombies
    for (const z of zh.getZombies()) {
      zh.applyZombieHit(z.id, 999, true, 'head');
    }

    expect(zh.getWaveState().totalKills).toBeGreaterThan(0);
  });

  it('applies zombie_survival and fps_zombies presets seamlessly', () => {
    manager.applyPreset('zombie_survival');
    expect(manager.isFeatureEnabled('zombie_horde_ai')).toBe(true);
    expect(manager.isFeatureEnabled('ranged_shooter')).toBe(true);
    expect(manager.isFeatureEnabled('weapon_wheel_loadout')).toBe(true);
    expect(manager.zombieHorde.getWaveState().active).toBe(true);
  });

  it('round-trips zombie horde configuration through serialization', () => {
    const zh = manager.zombieHorde;
    zh.setConfig({ maxActiveZombies: 75, mode: 'open_world_wandering' });

    const json = manager.toJSON();
    const zhConfig: any = json.zombie_horde_ai;
    expect(zhConfig.maxActiveZombies).toBe(75);
    expect(zhConfig.mode).toBe('open_world_wandering');

    const newManager = new GameplayFeatureManager(engine);
    newManager.fromJSON(json);
    expect(newManager.zombieHorde.getConfig().maxActiveZombies).toBe(75);
    expect(newManager.zombieHorde.getConfig().mode).toBe('open_world_wandering');
  });

  it('cleans up all listeners and visual meshes on disposal', () => {
    expect(engine.sceneManager.events.listenerCount).toBeGreaterThan(0);
    manager.dispose();
    expect(engine.sceneManager.events.listenerCount).toBe(0);
    expect(manager.zombieHorde.getZombies().length).toBe(0);
  });
});
