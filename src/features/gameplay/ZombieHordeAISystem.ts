import { validateFeatureRuntime } from './RuntimeSnapshot';
import { disposeOwnedObject } from './DisposeOwnedObject';
import { gameplayWallet } from './GameplayWallet';
import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import { applyGameplayHit } from './GameplayHit';
import type {
  ZombieArchetype,
  ZombieArchetypeDef,
  ZombieAttackDef,
  ZombieBehaviorState,
  ZombieHordeConfig,
  ZombieSpitProjectile,
  ZombieState,
  ZombieWaveDef,
  ZombieWaveState,
} from './types';

export const DEFAULT_ZOMBIE_ARCHETYPES: Record<ZombieArchetype, ZombieArchetypeDef> = {
  shambler: {
    archetype: 'shambler',
    maxHealth: 100,
    speed: 1.8,
    runSpeed: 2.8,
    frenzySpeedMultiplier: 1.4,
    poise: 30,
    headshotMultiplier: 2.5,
    detectionRange: 18.0,
    fovAngle: Math.PI * 0.65, // ~117 degrees
    attacks: [
      {
        name: 'Claw Swipe',
        damage: 15,
        range: 1.8,
        cooldown: 1.6,
        windup: 0.4,
        knockback: 2.0,
        poiseDamage: 15,
      },
    ],
  },
  runner: {
    archetype: 'runner',
    maxHealth: 60,
    speed: 3.2,
    runSpeed: 6.5,
    frenzySpeedMultiplier: 1.6,
    poise: 15,
    headshotMultiplier: 2.0,
    detectionRange: 24.0,
    fovAngle: Math.PI * 0.8,
    attacks: [
      {
        name: 'Frenzy Leap',
        damage: 22,
        range: 3.0,
        cooldown: 1.2,
        windup: 0.25,
        knockback: 4.0,
        poiseDamage: 25,
      },
    ],
  },
  spitter: {
    archetype: 'spitter',
    maxHealth: 80,
    speed: 2.0,
    runSpeed: 3.5,
    frenzySpeedMultiplier: 1.2,
    poise: 20,
    headshotMultiplier: 2.2,
    detectionRange: 22.0,
    fovAngle: Math.PI * 0.7,
    attacks: [
      {
        name: 'Acid Spit',
        damage: 28,
        range: 14.0,
        cooldown: 3.5,
        windup: 0.6,
        knockback: 1.0,
        poiseDamage: 10,
        isAOE: true,
        aoeRadius: 2.5,
      },
      {
        name: 'Claw Swipe',
        damage: 10,
        range: 1.6,
        cooldown: 1.5,
        windup: 0.3,
        knockback: 1.0,
        poiseDamage: 10,
      },
    ],
  },
  tank: {
    archetype: 'tank',
    maxHealth: 450,
    speed: 1.5,
    runSpeed: 3.8,
    frenzySpeedMultiplier: 1.3,
    poise: 120,
    headshotMultiplier: 1.5,
    detectionRange: 20.0,
    fovAngle: Math.PI * 0.6,
    attacks: [
      {
        name: 'Ground Slam',
        damage: 50,
        range: 3.2,
        cooldown: 3.0,
        windup: 0.8,
        knockback: 10.0,
        poiseDamage: 70,
        isAOE: true,
        aoeRadius: 4.0,
      },
      {
        name: 'Brute Punch',
        damage: 35,
        range: 2.2,
        cooldown: 1.8,
        windup: 0.5,
        knockback: 6.0,
        poiseDamage: 40,
      },
    ],
  },
  crawler: {
    archetype: 'crawler',
    maxHealth: 50,
    speed: 1.2,
    runSpeed: 1.8,
    frenzySpeedMultiplier: 1.2,
    poise: 10,
    headshotMultiplier: 3.0,
    detectionRange: 14.0,
    fovAngle: Math.PI * 0.5,
    attacks: [
      {
        name: 'Ankle Bite',
        damage: 12,
        range: 1.4,
        cooldown: 1.4,
        windup: 0.3,
        knockback: 0.5,
        poiseDamage: 10,
      },
    ],
  },
};

export const DEFAULT_ZOMBIE_WAVES: ZombieWaveDef[] = [
  {
    waveNumber: 1,
    totalZombies: 8,
    spawnRate: 1.5,
    archetypeWeights: { shambler: 1.0, runner: 0.0, spitter: 0.0, tank: 0.0, crawler: 0.0 },
    intermissionSec: 5.0,
  },
  {
    waveNumber: 2,
    totalZombies: 15,
    spawnRate: 2.0,
    archetypeWeights: { shambler: 0.7, runner: 0.3, spitter: 0.0, tank: 0.0, crawler: 0.0 },
    intermissionSec: 6.0,
  },
  {
    waveNumber: 3,
    totalZombies: 22,
    spawnRate: 2.5,
    archetypeWeights: { shambler: 0.5, runner: 0.3, spitter: 0.2, tank: 0.0, crawler: 0.0 },
    intermissionSec: 7.0,
  },
  {
    waveNumber: 4,
    totalZombies: 30,
    spawnRate: 3.0,
    archetypeWeights: { shambler: 0.4, runner: 0.3, spitter: 0.2, tank: 0.1, crawler: 0.0 },
    intermissionSec: 8.0,
  },
];

export const DEFAULT_ZOMBIE_HORDE_CONFIG: ZombieHordeConfig = {
  enabled: true,
  mode: 'waves',
  maxActiveZombies: 40,
  spawnDistanceMin: 12.0,
  spawnDistanceMax: 35.0,
  hearingSensitivity: 1.0,
  screechAlertRadius: 25.0,
  enableSurroundBehavior: true,
  surroundSlotsCount: 8,
  surroundDistance: 2.5,
  headshotInstakillThreshold: 50,
  legDismemberHealthPercent: 0.35,
  archetypes: DEFAULT_ZOMBIE_ARCHETYPES,
  waves: DEFAULT_ZOMBIE_WAVES,
};

export class ZombieHordeAISystem {
  private config: ZombieHordeConfig;
  private readonly zombies = new Map<string, ZombieState>();
  private readonly zombieMeshes = new Map<string, THREE.Object3D>();
  private readonly rootGroup = new THREE.Group();
  private readonly projectiles: ZombieSpitProjectile[] = [];
  private readonly unsubs: Array<() => void> = [];

  private nextZombieId = 1;
  private nextProjId = 1;
  private spawnCooldown = 0;

  private readonly waveState: ZombieWaveState = {
    active: false,
    currentWaveIndex: 0,
    zombiesSpawned: 0,
    zombiesAlive: 0,
    totalKills: 0,
    intermissionRemaining: 0,
    isWaveCompleted: false,
  };

  constructor(private readonly engine: Engine, initialConfig: ZombieHordeConfig = DEFAULT_ZOMBIE_HORDE_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.visible = this.config.enabled;
    this.rootGroup.name = 'ZombieHordeRoot';
    this.bindEvents();
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    // Listen for gunfire noise
    const u1 = events.on('ranged_weapon_fired', (e: any) => {
      if (e?.origin) {
        this.notifyNoise(new THREE.Vector3().copy(e.origin), (e.noiseRadius ?? 35.0));
      }
    });

    // Listen for crosshair bullet hit impact noise
    const u2 = events.on('crosshair_hit', (e: any) => {
      if (e?.hitPosition) {
        this.notifyNoise(new THREE.Vector3().copy(e.hitPosition), 15.0);
      }
    });

    // Listen for grenade / explosion noise
    const u3 = events.on('grenade_exploded', (e: any) => {
      if (e?.position) {
        this.notifyNoise(new THREE.Vector3().copy(e.position), 50.0);
      }
    });

    // Listen for general explosion events
    const u4 = events.on('explosion', (e: any) => {
      if (e?.position) {
        this.notifyNoise(new THREE.Vector3().copy(e.position), 60.0);
      }
    });

    // Listen for alert propagation screech waves
    const u5 = events.on('zombie_screeched', (e: any) => {
      if (e?.origin) {
        this.notifyNoise(new THREE.Vector3().copy(e.origin), this.config.screechAlertRadius);
      }
    });

    if (u1) this.unsubs.push(u1);
    if (u2) this.unsubs.push(u2);
    if (u3) this.unsubs.push(u3);
    if (u4) this.unsubs.push(u4);
    if (u5) this.unsubs.push(u5);
  }

  setConfig(config: Partial<ZombieHordeConfig>): void {
    if (config.surroundSlotsCount !== undefined && (!Number.isInteger(config.surroundSlotsCount) || config.surroundSlotsCount < 1)) throw new Error('surroundSlotsCount must be an integer >= 1');
    this.config = { ...this.config, ...config };
    this.rootGroup.visible = this.config.enabled;
    if (config.archetypes) {
      this.config.archetypes = { ...this.config.archetypes, ...config.archetypes };
    }
    if (config.waves) {
      this.config.waves = [...config.waves];
    }
    if (!this.config.enabled) {
      this.clearAll();
    }
  }

  getConfig(): Readonly<ZombieHordeConfig> {
    return this.config;
  }

  getWaveState(): Readonly<ZombieWaveState> {
    return this.waveState;
  }

  getZombies(): readonly ZombieState[] {
    return Array.from(this.zombies.values());
  }

  getProjectiles(): readonly ZombieSpitProjectile[] {
    return this.projectiles;
  }

  getRoot(): THREE.Group {
    return this.rootGroup;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Zombie Spawning & Creation
  // ─────────────────────────────────────────────────────────────────────────

  spawnZombie(
    archetype: ZombieArchetype = 'shambler',
    spawnPos?: THREE.Vector3,
    initialState: ZombieBehaviorState = 'idle'
  ): ZombieState | null {
    if (!this.config.enabled || this.zombies.size >= this.config.maxActiveZombies) {
      return null;
    }

    const archDef = this.config.archetypes[archetype] ?? DEFAULT_ZOMBIE_ARCHETYPES.shambler;
    const id = `zombie_${this.nextZombieId++}`;

    let pos = spawnPos?.clone();
    if (!pos) {
      pos = this.findSpawnLocationAroundPlayer();
    }

    const assignedSlot = this.zombies.size % this.config.surroundSlotsCount;

    const zombie: ZombieState = {
      id,
      entityId: null,
      archetype,
      state: initialState,
      position: pos,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      health: archDef.maxHealth,
      maxHealth: archDef.maxHealth,
      poise: archDef.poise,
      targetEntityId: null,
      targetPosition: null,
      attackCooldown: Math.random() * 0.5,
      stateTimer: 0,
      staggerTimer: 0,
      isCrawling: archetype === 'crawler',
      isFrenzied: false,
      assignedSurroundSlot: assignedSlot,
      lastNoisePosition: null,
      noiseTimer: 0,
    };

    this.zombies.set(id, zombie);
    this.createZombieMesh(zombie);

    if (this.waveState.active) {
      this.waveState.zombiesAlive++;
      this.waveState.zombiesSpawned++;
    }

    this.engine.sceneManager?.events?.emit('zombie_spawned', { id, archetype, position: pos.clone() });
    return zombie;
  }

  private findSpawnLocationAroundPlayer(): THREE.Vector3 {
    const playerPos = this.getPlayerPosition() ?? new THREE.Vector3(0, 0, 0);
    const angle = Math.random() * Math.PI * 2;
    const dist = THREE.MathUtils.randFloat(this.config.spawnDistanceMin, this.config.spawnDistanceMax);
    return new THREE.Vector3(
      playerPos.x + Math.sin(angle) * dist,
      playerPos.y,
      playerPos.z + Math.cos(angle) * dist
    );
  }

  private createZombieMesh(zombie: ZombieState): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    const group = new THREE.Group();
    group.name = `ZombieMesh_${zombie.id}`;

    // Color by archetype
    let color = 0x556b2f; // Olive green shambler
    let height = 1.8;
    let radius = 0.4;

    if (zombie.archetype === 'runner') {
      color = 0x8b0000; // Crimson runner
      height = 1.7;
      radius = 0.35;
    } else if (zombie.archetype === 'spitter') {
      color = 0x2e8b57; // Sea green acid spitter
      height = 1.6;
      radius = 0.45;
    } else if (zombie.archetype === 'tank') {
      color = 0x4a4a4a; // Dark slate tank
      height = 2.4;
      radius = 0.9;
    } else if (zombie.archetype === 'crawler') {
      color = 0x4b3621; // Dirt brown crawler
      height = 0.6;
      radius = 0.5;
    }

    const bodyGeo = new THREE.CylinderGeometry(radius, radius, height, 8);
    const bodyMat = new THREE.MeshBasicMaterial({ color });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = height / 2;
    group.add(bodyMesh);

    // Glowing red eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 4, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.15, height * 0.85, radius * 0.9);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.15, height * 0.85, radius * 0.9);
    group.add(leftEye, rightEye);

    group.position.copy(zombie.position);
    this.rootGroup.add(group);
    this.zombieMeshes.set(zombie.id, group);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sensory & Hearing Engine
  // ─────────────────────────────────────────────────────────────────────────

  notifyNoise(noisePos: THREE.Vector3, baseRadius = 25.0): void {
    if (!this.config.enabled) return;

    const effectiveRadius = baseRadius * this.config.hearingSensitivity;
    for (const zombie of this.zombies.values()) {
      if (zombie.state === 'dead') continue;

      const dist = zombie.position.distanceTo(noisePos);
      if (dist <= effectiveRadius) {
        zombie.lastNoisePosition = noisePos.clone();
        zombie.noiseTimer = 8.0;

        if (zombie.state === 'idle' || zombie.state === 'wandering') {
          zombie.state = 'investigating_noise';
          zombie.targetPosition = noisePos.clone();
        }
      }
    }
  }

  private evaluateSensoryPerception(zombie: ZombieState, dt: number): void {
    const archDef = this.config.archetypes[zombie.archetype] ?? DEFAULT_ZOMBIE_ARCHETYPES.shambler;
    const target = this.findBestVictim(zombie);

    if (target) {
      const toTarget = new THREE.Vector3().subVectors(target.position, zombie.position);
      const dist = toTarget.length();

      // Check proximity (auto detect at close range)
      const closeRange = 3.5;
      let hasSight = dist <= closeRange;

      if (!hasSight && dist <= archDef.detectionRange) {
        // Evaluate sight cone
        const forward = new THREE.Vector3(Math.sin(zombie.yaw), 0, Math.cos(zombie.yaw)).normalize();
        const dirToTarget = toTarget.clone().normalize();
        const angle = forward.angleTo(dirToTarget);

        if (angle <= archDef.fovAngle / 2) {
          hasSight = true;
        }
      }

      if (hasSight) {
        zombie.targetEntityId = target.entityId;
        zombie.targetPosition = target.position.clone();

        if (zombie.state === 'idle' || zombie.state === 'wandering' || zombie.state === 'investigating_noise') {
          zombie.state = 'chasing';
          // Trigger alert wave screech to wake up nearby zombies
          this.engine.sceneManager?.events?.emit('zombie_screeched', {
            id: zombie.id,
            origin: zombie.position.clone(),
          });
        }
      }
    }
  }

  private findBestVictim(zombie: ZombieState): { entityId: EntityId | null; position: THREE.Vector3 } | null {
    // 0. Check active monkey bomb / decoy position
    const decoyPos = (this.engine.gameplayFeatures as any)?.wonderWeapons?.getActiveDecoyPosition?.();
    if (decoyPos) {
      return { entityId: null, position: decoyPos };
    }

    // 0.1 Check In Plain Sight GobbleGum
    if ((this.engine.gameplayFeatures as any)?.gobbleGums?.isGumActive?.('in_plain_sight')) {
      return null;
    }

    // 1. Check possessed player
    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;

    if (playerRb) {
      return { entityId: playerEntityId!, position: playerRb.mesh.position.clone() };
    }

    return null;
  }

  private getPlayerPosition(): THREE.Vector3 | null {
    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    return playerRb ? playerRb.mesh.position.clone() : this.engine.viewport?.camera?.position?.clone() ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Combat & Hit Reactions
  // ─────────────────────────────────────────────────────────────────────────

  applyZombieHit(
    zombieId: string,
    damage: number,
    isHeadshot = false,
    hitLimb: 'head' | 'torso' | 'leg' | 'arm' = 'torso',
    hitPosition?: THREE.Vector3
  ): boolean {
    const zombie = this.zombies.get(zombieId);
    if (!zombie || zombie.state === 'dead') return false;

    const archDef = this.config.archetypes[zombie.archetype] ?? DEFAULT_ZOMBIE_ARCHETYPES.shambler;
    let finalDamage = damage;

    // Check Insta-Kill Power-up
    if ((this.engine.gameplayFeatures as any)?.zombiePowerups?.isEffectActive?.('insta_kill')) {
      finalDamage = zombie.health + 100;
    } else if (isHeadshot || hitLimb === 'head') {
      finalDamage *= archDef.headshotMultiplier;
      // Headshot instakill if above threshold
      if (finalDamage >= this.config.headshotInstakillThreshold) {
        finalDamage = zombie.health + 10;
      }
    }

    zombie.health -= finalDamage;

    // Leg dismemberment -> convert to crawler
    if (hitLimb === 'leg' || zombie.health / zombie.maxHealth <= this.config.legDismemberHealthPercent) {
      if (!zombie.isCrawling && zombie.archetype !== 'tank') {
        zombie.isCrawling = true;
        zombie.archetype = 'crawler';
      }
    }

    // Stagger check
    zombie.poise -= finalDamage * 0.8;
    if (zombie.poise <= 0) {
      zombie.state = 'staggered';
      zombie.staggerTimer = 0.5;
      zombie.poise = archDef.poise;
    }

    // Death check
    if (zombie.health <= 0) {
      zombie.state = 'dead';
      zombie.health = 0;

      if (this.waveState.active) {
        this.waveState.zombiesAlive = Math.max(0, this.waveState.zombiesAlive - 1);
        this.waveState.totalKills++;
      }

      // Calculate kill score
      let pts = isHeadshot ? 100 : 60;
      if ((this.engine.gameplayFeatures as any)?.zombiePowerups?.isEffectActive?.('double_points')) {
        pts *= 2;
      }
      gameplayWallet(this.engine).add(pts);

      this.engine.sceneManager?.events?.emit('zombie_killed', {
        id: zombie.id,
        archetype: zombie.archetype,
        isHeadshot,
        position: zombie.position.clone(),
        scoreAwarded: pts,
      });

      // Remove visual mesh after death animation duration
      const mesh = this.zombieMeshes.get(zombie.id);
      if (mesh) {
        disposeOwnedObject(mesh);
      this.rootGroup.remove(mesh);
        this.zombieMeshes.delete(zombie.id);
      }
      this.zombies.delete(zombie.id);
      return true;
    }

    // Aggro on attacker
    if (zombie.state === 'idle' || zombie.state === 'wandering' || zombie.state === 'investigating_noise') {
      zombie.state = 'chasing';
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Wave Management Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  startWave(waveIndex = 0): boolean {
    if (!this.config.enabled || this.config.waves.length === 0) return false;

    const clampedIndex = THREE.MathUtils.clamp(waveIndex, 0, this.config.waves.length - 1);
    this.waveState.active = true;
    this.waveState.currentWaveIndex = clampedIndex;
    this.waveState.zombiesSpawned = 0;
    this.waveState.zombiesAlive = 0;
    this.waveState.intermissionRemaining = 0;
    this.waveState.isWaveCompleted = false;

    this.spawnCooldown = 0;
    this.engine.sceneManager?.events?.emit('zombie_wave_started', {
      waveNumber: this.config.waves[clampedIndex].waveNumber,
      totalZombies: this.config.waves[clampedIndex].totalZombies,
    });
    return true;
  }

  endWave(): void {
    this.waveState.active = false;
    this.waveState.isWaveCompleted = true;
    this.engine.sceneManager?.events?.emit('zombie_wave_ended', {
      waveNumber: this.config.waves[this.waveState.currentWaveIndex]?.waveNumber ?? 1,
      totalKills: this.waveState.totalKills,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update Loop & Flocking Behavior
  // ─────────────────────────────────────────────────────────────────────────

  update(dt: number): void {
    if (!this.config.enabled) return;

    // 1. Wave round spawner stepping
    if (this.waveState.active) {
      const curWave = this.config.waves[this.waveState.currentWaveIndex];
      if (curWave) {
        if (this.waveState.zombiesSpawned < curWave.totalZombies) {
          this.spawnCooldown -= dt;
          if (this.spawnCooldown <= 0 && this.zombies.size < this.config.maxActiveZombies) {
            this.spawnCooldown = 1.0 / curWave.spawnRate;
            const chosenArchetype = this.pickWeightedArchetype(curWave.archetypeWeights);
            this.spawnZombie(chosenArchetype);
          }
        } else if (this.waveState.zombiesAlive === 0 && this.zombies.size === 0) {
          // Wave cleared!
          if (!this.waveState.isWaveCompleted) {
            this.waveState.isWaveCompleted = true;
            this.waveState.intermissionRemaining = curWave.intermissionSec;
            this.engine.sceneManager?.events?.emit('zombie_wave_cleared', {
              waveNumber: curWave.waveNumber,
            });
          } else {
            this.waveState.intermissionRemaining -= dt;
            if (this.waveState.intermissionRemaining <= 0) {
              if (this.waveState.currentWaveIndex < this.config.waves.length - 1) {
                this.startWave(this.waveState.currentWaveIndex + 1);
              } else {
                this.endWave();
              }
            }
          }
        }
      }
    }

    // 2. Step Projectiles
    this.updateProjectiles(dt);

    // 3. Step individual Zombies
    for (const zombie of this.zombies.values()) {
      if (zombie.state === 'dead') continue;

      this.evaluateSensoryPerception(zombie, dt);
      this.updateZombieState(zombie, dt);
      this.syncMesh(zombie);
    }
  }

  private pickWeightedArchetype(weights: Record<ZombieArchetype, number>): ZombieArchetype {
    const rand = Math.random();
    let cumulative = 0;
    for (const [arch, weight] of Object.entries(weights) as Array<[ZombieArchetype, number]>) {
      cumulative += weight;
      if (rand <= cumulative) return arch;
    }
    return 'shambler';
  }

  private updateZombieState(zombie: ZombieState, dt: number): void {
    const archDef = this.config.archetypes[zombie.archetype] ?? DEFAULT_ZOMBIE_ARCHETYPES.shambler;
    zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt);

    if (['attacking', 'lunging', 'spitting'].includes(zombie.state)) {
      zombie.stateTimer = Math.max(0, zombie.stateTimer - dt);
      if (zombie.stateTimer === 0) zombie.state = 'chasing';
      return;
    }

    if (zombie.state === 'staggered') {
      zombie.staggerTimer -= dt;
      if (zombie.staggerTimer <= 0) {
        zombie.state = zombie.targetEntityId !== null ? 'chasing' : 'idle';
      }
      return;
    }

    if (zombie.state === 'idle') {
      zombie.stateTimer -= dt;
      if (zombie.stateTimer <= 0) {
        zombie.state = 'wandering';
        zombie.stateTimer = THREE.MathUtils.randFloat(3.0, 6.0);
        zombie.yaw += THREE.MathUtils.randFloat(-Math.PI * 0.5, Math.PI * 0.5);
      }
      return;
    }

    if (zombie.state === 'wandering') {
      zombie.stateTimer -= dt;
      const speed = archDef.speed * 0.6;
      const forward = new THREE.Vector3(Math.sin(zombie.yaw), 0, Math.cos(zombie.yaw));
      zombie.position.addScaledVector(forward, speed * dt);

      if (zombie.stateTimer <= 0) {
        zombie.state = 'idle';
        zombie.stateTimer = THREE.MathUtils.randFloat(2.0, 4.0);
      }
      return;
    }

    if (zombie.state === 'investigating_noise') {
      if (zombie.targetPosition) {
        const toNoise = new THREE.Vector3().subVectors(zombie.targetPosition, zombie.position);
        toNoise.y = 0;
        const dist = toNoise.length();

        if (dist > 1.5) {
          zombie.yaw = Math.atan2(toNoise.x, toNoise.z);
          const forward = new THREE.Vector3(Math.sin(zombie.yaw), 0, Math.cos(zombie.yaw));
          zombie.position.addScaledVector(forward, archDef.speed * dt);
        } else {
          zombie.state = 'idle';
          zombie.stateTimer = 3.0;
          zombie.targetPosition = null;
        }
      }
      return;
    }

    if (zombie.state === 'chasing') {
      const victim = this.findBestVictim(zombie);
      if (!victim) {
        zombie.state = 'idle';
        return;
      }

      const victimPos = victim.position;
      let desiredTargetPos = victimPos.clone();

      // Flocking & 360 Surround slot offset
      if (this.config.enableSurroundBehavior && zombie.archetype !== 'spitter') {
        const angle = (zombie.assignedSurroundSlot / this.config.surroundSlotsCount) * Math.PI * 2;
        desiredTargetPos.x += Math.sin(angle) * this.config.surroundDistance;
        desiredTargetPos.z += Math.cos(angle) * this.config.surroundDistance;
      }

      const toTarget = new THREE.Vector3().subVectors(desiredTargetPos, zombie.position);
      toTarget.y = 0;
      const distToVictim = zombie.position.distanceTo(victimPos);

      // Turn towards desired target
      if (toTarget.lengthSq() > 0.01) {
        zombie.yaw = Math.atan2(toTarget.x, toTarget.z);
      }

      // Flocking crowd separation
      const separation = this.calculateFlockingSeparation(zombie);

      // Speed calculation
      let speed = zombie.isCrawling ? archDef.speed * 0.7 : archDef.runSpeed;
      if (zombie.isFrenzied) speed *= archDef.frenzySpeedMultiplier;

      const forward = new THREE.Vector3(Math.sin(zombie.yaw), 0, Math.cos(zombie.yaw));
      forward.add(separation);
      forward.normalize();
      zombie.position.addScaledVector(forward, speed * dt);

      // Check attack execution
      const primaryAttack = archDef.attacks[0];
      if (victim.entityId !== null && primaryAttack && distToVictim <= primaryAttack.range && zombie.attackCooldown <= 0) {
        if (zombie.archetype === 'spitter') {
          this.executeSpitAttack(zombie, victimPos);
        } else if (zombie.archetype === 'runner') {
          this.executeLungeAttack(zombie, victim);
        } else {
          this.executeMeleeAttack(zombie, victim, primaryAttack);
        }
      }
    }
  }

  private calculateFlockingSeparation(zombie: ZombieState): THREE.Vector3 {
    const separation = new THREE.Vector3();
    const separationRadius = 1.4;

    for (const other of this.zombies.values()) {
      if (other.id === zombie.id || other.state === 'dead') continue;

      const diff = new THREE.Vector3().subVectors(zombie.position, other.position);
      diff.y = 0;
      const dist = diff.length();

      if (dist > 0 && dist < separationRadius) {
        diff.normalize().multiplyScalar((separationRadius - dist) / separationRadius);
        separation.add(diff);
      }
    }
    return separation;
  }

  private executeMeleeAttack(
    zombie: ZombieState,
    victim: { entityId: EntityId | null; position: THREE.Vector3 },
    attack: ZombieAttackDef
  ): void {
    if (victim.entityId === null) return;
    zombie.state = 'attacking';
    zombie.attackCooldown = attack.cooldown;

    // Apply combat hit through MIX combat engine
    applyGameplayHit(this.engine, {
      attackerId: zombie.entityId,
      targetId: victim.entityId as number,
      damage: attack.damage,
      poiseDamage: attack.poiseDamage,
      knockbackForce: attack.knockback,
      hitPosition: victim.position.clone(),
    });

    if (attack.isAOE) {
      this.engine.burstVfx?.('dust', zombie.position.clone(), 8);
    }

    this.engine.sceneManager?.events?.emit('zombie_attacked', {
      zombieId: zombie.id,
      archetype: zombie.archetype,
      attackName: attack.name,
      damage: attack.damage,
    });

    // Reset back to chasing after brief recovery
    zombie.stateTimer = attack.windup;
  }

  private executeLungeAttack(
    zombie: ZombieState,
    victim: { entityId: EntityId | null; position: THREE.Vector3 }
  ): void {
    if (victim.entityId === null) return;
    zombie.state = 'lunging';
    zombie.attackCooldown = 1.4;

    const toVictim = new THREE.Vector3().subVectors(victim.position, zombie.position).normalize();
    zombie.velocity.copy(toVictim).multiplyScalar(8.0);
    zombie.position.addScaledVector(toVictim, 1.2);

    applyGameplayHit(this.engine, {
      attackerId: zombie.entityId,
      targetId: victim.entityId as number,
      damage: 24,
      poiseDamage: 30,
      knockbackForce: 5.0,
      hitPosition: victim.position.clone(),
    });

    this.engine.sceneManager?.events?.emit('zombie_attacked', {
      zombieId: zombie.id,
      archetype: 'runner',
      attackName: 'Frenzy Leap',
      damage: 24,
    });

    zombie.stateTimer = 0.35;
  }

  private executeSpitAttack(zombie: ZombieState, victimPos: THREE.Vector3): void {
    zombie.state = 'spitting';
    zombie.attackCooldown = 3.5;

    const spawnPos = zombie.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const toVictim = new THREE.Vector3().subVectors(victimPos, spawnPos).normalize();

    const proj: ZombieSpitProjectile = {
      id: `spit_${this.nextProjId++}`,
      sourceZombieId: zombie.id,
      position: spawnPos,
      velocity: toVictim.multiplyScalar(18.0),
      damage: 28,
      radius: 2.2,
      lifeTime: 2.5,
    };

    this.projectiles.push(proj);
    this.engine.burstVfx?.('poison', spawnPos, 4);

    this.engine.sceneManager?.events?.emit('zombie_spit_fired', {
      zombieId: zombie.id,
      position: spawnPos.clone(),
    });

    zombie.stateTimer = 0.4;
  }

  private updateProjectiles(dt: number): void {
    const playerPos = this.getPlayerPosition();
    const playerEntityId = this.engine.player?.getPossessedId?.() ?? null;
    const playerExists = playerEntityId !== null && !!this.engine.sceneManager.getRigidBody(playerEntityId);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.lifeTime -= dt;
      proj.position.addScaledVector(proj.velocity, dt);

      // Check hit against player
      if (playerExists && playerPos && proj.position.distanceTo(playerPos) <= proj.radius) {
        applyGameplayHit(this.engine, {
          attackerId: null,
          targetId: playerEntityId as number,
          damage: proj.damage,
          poiseDamage: 10,
          knockbackForce: 1.0,
          hitPosition: proj.position.clone(),
        });
        this.engine.burstVfx?.('poison', proj.position.clone(), 6);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.lifeTime <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private syncMesh(zombie: ZombieState): void {
    const mesh = this.zombieMeshes.get(zombie.id);
    if (mesh) {
      mesh.position.copy(zombie.position);
      mesh.rotation.y = zombie.yaw;
      mesh.visible = zombie.health > 0;
    }
  }

  clearAll(): void {
    this.zombies.clear();
    for (const mesh of this.zombieMeshes.values()) {
      disposeOwnedObject(mesh);
      this.rootGroup.remove(mesh);
    }
    this.zombieMeshes.clear();
    this.projectiles.length = 0;
    disposeOwnedObject(this.rootGroup);

    this.waveState.active = false;
    this.waveState.zombiesSpawned = 0;
    this.waveState.zombiesAlive = 0;
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    this.clearAll();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Serialization
  // ─────────────────────────────────────────────────────────────────────────

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      maxActiveZombies: this.config.maxActiveZombies,
      waveState: { ...this.waveState },
      zombies: Array.from(this.zombies.values()), projectiles: this.projectiles,
      nextZombieId: this.nextZombieId, nextProjId: this.nextProjId, spawnCooldown: this.spawnCooldown,
      currentWaveIndex: this.waveState.currentWaveIndex,
      totalKills: this.waveState.totalKills,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    validateFeatureRuntime('zombie_horde_ai', data);
    this.clearAll();
    if (typeof data.enabled === 'boolean') this.config.enabled = data.enabled;
    if (data.waveState && typeof data.waveState === 'object') Object.assign(this.waveState, data.waveState);
    this.nextZombieId = Number(data.nextZombieId ?? 1);
    this.nextProjId = Number(data.nextProjId ?? 1);
    this.spawnCooldown = Number(data.spawnCooldown ?? 0);
    const vector = (v: any) => new THREE.Vector3(v.x, v.y, v.z);
    for (const saved of Array.isArray(data.zombies) ? data.zombies : []) {
      const zombie: ZombieState = { ...saved, position: vector(saved.position), velocity: vector(saved.velocity),
        targetPosition: saved.targetPosition ? vector(saved.targetPosition) : null,
        lastNoisePosition: saved.lastNoisePosition ? vector(saved.lastNoisePosition) : null };
      this.zombies.set(zombie.id, zombie);
      this.createZombieMesh(zombie);
      this.syncMesh(zombie);
    }
    for (const saved of Array.isArray(data.projectiles) ? data.projectiles : []) {
      this.projectiles.push({ ...saved, position: vector(saved.position), velocity: vector(saved.velocity) });
    }
    if (typeof data.mode === 'string') {
      if (!['waves', 'open_world_wandering', 'dormant_ambush'].includes(data.mode)) throw new Error('Invalid zombie mode');
      this.config.mode = data.mode as ZombieHordeConfig['mode'];
    }
    if (typeof data.maxActiveZombies === 'number') {
      if (!Number.isInteger(data.maxActiveZombies) || data.maxActiveZombies < 1 || data.maxActiveZombies > 200) throw new Error('Invalid maxActiveZombies');
      this.config.maxActiveZombies = data.maxActiveZombies;
    }
    if (typeof data.currentWaveIndex === 'number') this.waveState.currentWaveIndex = data.currentWaveIndex;
    if (typeof data.totalKills === 'number') this.waveState.totalKills = data.totalKills;
  }
}
