import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { ArenaWaveConfig, ArenaWaveState, WaveDef } from './types';

export class ArenaWaveSystem {
  private readonly unsubscribe: Array<() => void> = [];

  dispose(): void {
    this.setConfig({ enabled: false });
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
  }

  private config: ArenaWaveConfig;
  private readonly state: ArenaWaveState = {
    active: false,
    currentWaveIndex: 0,
    enemiesRemaining: 0,
    state: 'idle',
    timer: 0,
    totalKills: 0,
    startTime: 0,
  };

  private readonly spawnedWaveEntityIds = new Set<EntityId>();
  private readonly pendingSpawns: Array<{ remaining: number; spawn: () => void }> = [];

  constructor(private readonly engine: Engine, initialConfig: ArenaWaveConfig) {
    this.config = { ...initialConfig };
    this.bindEvents();
  }

  setConfig(config: Partial<ArenaWaveConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.stopArena(); }
  }

  getConfig(): Readonly<ArenaWaveConfig> {
    return this.config;
  }

  getState(): Readonly<ArenaWaveState> {
    return this.state;
  }

  get isWaveActive(): boolean {
    return this.state.active && this.state.state === 'in_wave';
  }

  getCurrentWave(): WaveDef | undefined {
    return this.config.waves[this.state.currentWaveIndex];
  }

  private bindEvents(): void {
    // Listen for entity destroyed / dead events
    this.unsubscribe.push(this.engine.sceneManager.events.on('entity_destroyed', (payload: any) => {
      const id = payload?.entityId;
      if (id !== undefined && this.spawnedWaveEntityIds.has(id)) {
        this.onWaveEnemyDefeated(id);
      }
    }));

    // Listen for player death
    this.unsubscribe.push(this.engine.sceneManager.events.on('player_death', () => {
      if (this.state.active && this.state.state !== 'victory' && this.state.state !== 'defeat') {
        this.triggerDefeat();
      }
    }));
  }

  // ── Arena Lifecycle ──────────────────────────────────────────────────────

  startArena(): boolean {
    if (!this.config.enabled || this.config.waves.length === 0) return false;

    this.clearSpawnedEnemies();
    this.state.active = true;
    this.state.currentWaveIndex = 0;
    this.state.totalKills = 0;
    this.state.startTime = performance.now();
    this.startWaveCountdown(0);
    return true;
  }

  restartArena(): void {
    this.startArena();
  }

  stopArena(): void {
    this.clearSpawnedEnemies();
    this.state.active = false;
    this.state.state = 'idle';
    this.state.timer = 0;
    this.state.enemiesRemaining = 0;
  }

  private startWaveCountdown(waveIndex: number): void {
    this.state.currentWaveIndex = waveIndex;
    this.state.state = 'countdown';
    this.state.timer = 3.0; // 3 second countdown

    const wave = this.getCurrentWave();
    this.engine.sceneManager.events.emit('arena_wave_countdown', {
      waveIndex,
      waveTitle: wave?.title ?? `Wave ${waveIndex + 1}`,
      duration: this.state.timer,
    });
  }

  private spawnWave(waveIndex: number): void {
    const wave = this.config.waves[waveIndex];
    if (!wave) return;

    this.state.state = 'in_wave';
    this.spawnedWaveEntityIds.clear();

    const playerEntityId = this.engine.player.getPossessedId();
    const playerRb = playerEntityId !== null ? this.engine.sceneManager.getRigidBody(playerEntityId) : null;
    const centerPos = playerRb?.mesh.position ?? new THREE.Vector3(0, 0, 0);

    let totalEnemies = 0;

    for (const enemyDef of wave.enemies) {
      totalEnemies += enemyDef.count;
      for (let i = 0; i < enemyDef.count; i++) {
        // Spawn ring around center position
        const angle = (i / Math.max(1, enemyDef.count)) * Math.PI * 2 + Math.random() * 0.5;
        const radius = enemyDef.isBoss ? 8.0 : 6.0 + Math.random() * 4.0;
        const spawnX = centerPos.x + Math.cos(angle) * radius;
        const spawnZ = centerPos.z + Math.sin(angle) * radius;

        this.pendingSpawns.push({ remaining: enemyDef.delaySec + i * 0.2, spawn: () => {
          this.spawnEnemy(enemyDef.blueprint, spawnX, 1.0, spawnZ, enemyDef.customHp, enemyDef.isBoss);
        } });
      }
    }

    this.state.enemiesRemaining = totalEnemies;

    // Audio & Wave Start Notification
    this.engine.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 1.0, loop: false });
    this.engine.sceneManager.events.emit('arena_wave_started', {
      waveIndex,
      waveTitle: wave.title,
      totalEnemies,
    });
  }

  private spawnEnemy(blueprint: string, x: number, y: number, z: number, customHp?: number, isBoss = false): void {
    try {
      const entityId = this.engine.sceneManager.spawnNow(
        new THREE.Vector3(x, y, z),
        { kind: 'character', params: { assetId: blueprint } },
        { rootMotion: true },
      );

      if (entityId !== null && entityId !== undefined) {
        this.spawnedWaveEntityIds.add(entityId);
        this.engine.sceneManager.addTag(entityId, 'enemy');

        // Add health component
        const hp = customHp ?? (isBoss ? 500 : 100);
        this.engine.combat.addHealth(entityId, hp, 'enemy');

        // The modular controller follows and attacks the possessed player.
        this.engine.gameplayFeatures?.encounterAI.registerEnemy(entityId, isBoss);

        // If boss, register with EncounterAISystem
        if (isBoss) {
          const encounterAI = (this.engine as any).gameplayFeatures?.getSystem('enemy_boss_ai');
          if (encounterAI) {
            encounterAI.registerBoss(entityId);
          }
        }
      }
    } catch (err) {
      this.state.enemiesRemaining = Math.max(0, this.state.enemiesRemaining - 1);
      console.warn('[ArenaWaveSystem] Failed to spawn enemy:', err);
    }
  }

  private onWaveEnemyDefeated(entityId: EntityId): void {
    this.spawnedWaveEntityIds.delete(entityId);
    this.state.enemiesRemaining = Math.max(0, this.state.enemiesRemaining - 1);
    this.state.totalKills++;

    this.engine.sceneManager.events.emit('arena_enemy_killed', {
      enemiesRemaining: this.state.enemiesRemaining,
    });

    if (this.state.enemiesRemaining <= 0) {
      this.onWaveCleared();
    }
  }

  private onWaveCleared(): void {
    const wave = this.getCurrentWave();
    const nextWaveIndex = this.state.currentWaveIndex + 1;

    // Grant EXP reward to player
    if (wave?.rewardExp) {
      const stats = (this.engine as any).gameplayFeatures?.getSystem('stats_progression');
      if (stats) {
        stats.addExp(wave.rewardExp);
      }
    }

    if (nextWaveIndex < this.config.waves.length) {
      // Intermission before next wave
      this.state.state = 'intermission';
      this.state.timer = wave?.intermissionSec ?? 3.0;

      this.engine.sceneManager.events.emit('arena_wave_cleared', {
        waveIndex: this.state.currentWaveIndex,
        nextWaveIndex,
        intermissionDuration: this.state.timer,
      });
    } else {
      // All waves cleared — Victory!
      this.triggerVictory();
    }
  }

  private triggerVictory(): void {
    this.state.state = 'victory';
    const elapsedSec = (performance.now() - this.state.startTime) / 1000;

    // Score calculation
    let grade = 'A';
    if (elapsedSec < 45) grade = 'SSS';
    else if (elapsedSec < 75) grade = 'S';
    else if (elapsedSec < 120) grade = 'A';
    else if (elapsedSec < 180) grade = 'B';
    else grade = 'C';

    this.engine.effects.flash({ color: '#ffd479', intensity: 0.9, duration: 0.8, mode: 'pulse' });
    this.engine.sceneManager.events.emit('arena_victory', {
      totalKills: this.state.totalKills,
      elapsedSec,
      grade,
      banner: this.config.victoryBanner,
    });
  }

  private triggerDefeat(): void {
    this.state.state = 'defeat';
    this.pendingSpawns.length = 0;
    this.engine.effects.flash({ color: '#ef4444', intensity: 0.8, duration: 0.6, mode: 'pulse' });
    this.engine.sceneManager.events.emit('arena_defeat', {
      banner: this.config.defeatBanner,
    });
  }

  private clearSpawnedEnemies(): void {
    this.pendingSpawns.length = 0;
    const ids = [...this.spawnedWaveEntityIds];
    this.spawnedWaveEntityIds.clear();
    for (const id of ids) this.engine.sceneManager.requestDestroy(id);
  }

  // ── Engine Update Loop ───────────────────────────────────────────────────

  update(dt: number): void {
    if (!this.config.enabled || !this.state.active) return;

    if (this.state.state === 'in_wave') {
      for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
        const pending = this.pendingSpawns[i];
        pending.remaining -= dt;
        if (pending.remaining <= 0) { this.pendingSpawns.splice(i, 1); pending.spawn(); }
      }
      if (this.state.enemiesRemaining === 0) this.onWaveCleared();
    } else if (this.state.state === 'countdown') {
      this.state.timer -= dt;
      if (this.state.timer <= 0) {
        this.spawnWave(this.state.currentWaveIndex);
      }
    } else if (this.state.state === 'intermission') {
      this.state.timer -= dt;
      if (this.state.timer <= 0) {
        this.startWaveCountdown(this.state.currentWaveIndex + 1);
      }
    }
  }
}
