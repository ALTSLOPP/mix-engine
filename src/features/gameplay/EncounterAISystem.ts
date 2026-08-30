import * as THREE from 'three';
import { applyGameplayHit } from './GameplayHit';
import { StockCombatAIController, STOCK_COMBAT_ARCHETYPES } from './StockCombatAI';
import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { BossPhaseDef, BossPhaseState, EncounterAIConfig } from './types';

export interface AttackTelegraph {
  id: string;
  sourceEntityId: EntityId;
  worldPos: THREE.Vector3;
  radius: number;
  duration: number;
  timeRemaining: number;
  color: string;
}

export class EncounterAISystem {
  private readonly enemies = new Map<EntityId, StockCombatAIController>();

  registerEnemy(entityId: EntityId, boss = false): void {
    if (this.enemies.has(entityId)) return;
    const rb = this.engine.sceneManager.getRigidBody(entityId);
    rb?.setKinematicOverride?.(true);
    this.enemies.set(entityId, new StockCombatAIController(this.engine, entityId,
      boss ? STOCK_COMBAT_ARCHETYPES.boss : STOCK_COMBAT_ARCHETYPES.grunt));
  }

  dispose(): void {
    for (const controller of this.enemies.values()) controller.dispose();
    this.enemies.clear();
    this.setConfig({ enabled: false });
  }
  private config: EncounterAIConfig;
  private readonly activeTelegraphs: AttackTelegraph[] = [];
  private readonly allocatedAttackTokens = new Set<EntityId>();
  private readonly bossState: BossPhaseState = {
    bossEntityId: null,
    currentPhaseIndex: 0,
    currentPhase: null,
    isTransitioning: false,
  };

  private transitionRemaining = 0;
  private readonly _tempVec = new THREE.Vector3();

  constructor(private readonly engine: Engine, initialConfig: EncounterAIConfig) {
    this.config = { ...initialConfig };
    if (this.config.bossPhases.length > 0) {
      this.bossState.currentPhase = this.config.bossPhases[0];
    }
  }

  setConfig(config: Partial<EncounterAIConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { this.activeTelegraphs.length = 0; this.allocatedAttackTokens.clear(); this.bossState.isTransitioning = false; }
  }

  getConfig(): Readonly<EncounterAIConfig> {
    return this.config;
  }

  getBossState(): Readonly<BossPhaseState> {
    return this.bossState;
  }

  registerBoss(bossEntityId: EntityId): void {
    this.bossState.bossEntityId = bossEntityId;
    this.bossState.currentPhaseIndex = 0;
    this.bossState.currentPhase = this.config.bossPhases[0] ?? null;
    this.bossState.isTransitioning = false;

    this.engine.sceneManager.events.emit('boss_spawned', {
      bossId: bossEntityId,
      phase: this.bossState.currentPhase,
    });
  }

  // ── Attack Tokens & Spacing ──────────────────────────────────────────────

  requestAttackToken(entityId: EntityId): boolean {
    if (!this.config.enabled) return true;
    if (this.allocatedAttackTokens.has(entityId)) return true;

    if (this.allocatedAttackTokens.size < this.config.maxSimultaneousAttackTokens) {
      this.allocatedAttackTokens.add(entityId);
      return true;
    }
    return false;
  }

  releaseAttackToken(entityId: EntityId): void {
    this.allocatedAttackTokens.delete(entityId);
  }

  // ── Ground Attack Telegraphs ──────────────────────────────────────────────

  spawnTelegraph(sourceEntityId: EntityId, worldPos: THREE.Vector3, radius = 3.0, duration?: number): void {
    if (!this.config.enabled || !this.config.enableTelegraphs) return;

    const dur = duration ?? this.config.telegraphDuration;
    this.activeTelegraphs.push({
      id: `tel_${Date.now()}_${Math.random()}`,
      sourceEntityId,
      worldPos: worldPos.clone(),
      radius,
      duration: dur,
      timeRemaining: dur,
      color: this.config.telegraphColor,
    });

    // Audio cue warning
    this.engine.audio.play('/assets/audio/MELEE LIGHT/LIGHTPUNCH.wav', { volume: 0.5, loop: false });
  }

  // ── Boss Phase Transitions ───────────────────────────────────────────────

  private evaluateBossPhases(): void {
    if (!this.config.enableBossPhases || this.bossState.bossEntityId === null) return;

    const bossHealth = this.engine.combat.getHealth(this.bossState.bossEntityId);
    if (!bossHealth || bossHealth.hp <= 0) return;

    const hpPercent = (bossHealth.hp / bossHealth.maxHp) * 100;
    const nextPhaseIndex = this.bossState.currentPhaseIndex + 1;

    if (nextPhaseIndex < this.config.bossPhases.length) {
      const nextPhase = this.config.bossPhases[nextPhaseIndex];
      if (hpPercent <= nextPhase.hpThresholdPercent && !this.bossState.isTransitioning) {
        this.triggerBossPhaseShift(nextPhaseIndex, nextPhase);
      }
    }
  }

  private triggerBossPhaseShift(phaseIndex: number, phase: BossPhaseDef): void {
    this.bossState.currentPhaseIndex = phaseIndex;
    this.bossState.currentPhase = phase;
    this.bossState.isTransitioning = true;

    const bossRb = this.engine.sceneManager.getRigidBody(this.bossState.bossEntityId!);
    const bossPos = bossRb?.mesh.position ?? new THREE.Vector3();

    // Visual & Audio Transition Effects
    this.engine.effects.flash({ color: phase.themeColor, intensity: 0.8, duration: 0.5, mode: 'pulse' });
    this.engine.burstVfx('sparks', bossPos.clone().add(new THREE.Vector3(0, 1.5, 0)), 20);

    // Pushback knockback shockwave on phase shift
    const playerEntityId = this.engine.player.getPossessedId();
    if (playerEntityId !== null) {
      const playerRb = this.engine.sceneManager.getRigidBody(playerEntityId);
      if (playerRb) {
        const pushDir = this._tempVec.subVectors(playerRb.mesh.position, bossPos).normalize();
        applyGameplayHit(this.engine, {
          attackerId: this.bossState.bossEntityId,
          targetId: playerEntityId,
          damage: 15,
          poiseDamage: 100,
          knockbackForce: 16.0,
          knockbackDir: pushDir,
        });
      }
    }

    this.engine.sceneManager.events.emit('boss_phase_shift', {
      bossId: this.bossState.bossEntityId,
      phaseIndex,
      phase,
    });

    this.transitionRemaining = 1.5;
  }

  // ── Engine Update Loop ───────────────────────────────────────────────────

  update(dt: number): void {
    for (const [id, controller] of this.enemies) {
      if (!this.engine.sceneManager.getRigidBody(id)) {
        controller.dispose();
        this.enemies.delete(id);
      } else if (this.config.enabled) controller.update(dt);
    }
    if (!this.config.enabled) return;

    for (const id of this.allocatedAttackTokens) {
      if (!this.engine.sceneManager.getRigidBody(id)) this.allocatedAttackTokens.delete(id);
    }
    if (this.bossState.isTransitioning) {
      this.transitionRemaining -= dt;
      if (this.transitionRemaining <= 0) this.bossState.isTransitioning = false;
    }
    // 1. Telegraph Decals & Debug Render
    for (let i = this.activeTelegraphs.length - 1; i >= 0; i--) {
      const tel = this.activeTelegraphs[i];
      tel.timeRemaining -= dt;

      // Draw growing ground circle
      const progress = 1 - tel.timeRemaining / tel.duration;
      const currentRadius = tel.radius * Math.min(1.0, 0.4 + progress * 0.6);

      this.engine.debugDraw.drawSphere(tel.worldPos, currentRadius, tel.color, dt * 1.5);

      if (tel.timeRemaining <= 0) {
        this.activeTelegraphs.splice(i, 1);
      }
    }

    // 2. Boss Phase Tracking
    this.evaluateBossPhases();
  }
}
