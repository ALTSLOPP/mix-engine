/**
 * TimeDilationManager — Hitstop, micro-pauses, and per-entity/global time dilation.
 *
 * Provides frame-freeze game feel on heavy impacts without stalling renderer or UI threads.
 */

import type { EntityId } from '../ecs/SceneManager';

export interface HitstopRequest {
  id: string;
  durationMs: number;
  remainingMs: number;
  timeScale: number; // e.g. 0.0 for full freeze, 0.1 for dramatic slow-mo
  targetEntityIds?: Set<EntityId>; // undefined = global
}

export class TimeDilationManager {
  private globalBaseTimeScale = 1.0;
  private readonly activeHitstops: HitstopRequest[] = [];
  private readonly entityTimeScales = new Map<EntityId, number>();
  private readonly immuneEntities = new Set<EntityId>();
  private counter = 0;

  /**
   * Triggers a hitstop micro-pause for combat impact game feel.
   */
  triggerHitstop(options: {
    durationMs: number;
    timeScale?: number;
    targetEntityIds?: EntityId[];
  }): string {
    if (!Number.isFinite(options.durationMs) || options.durationMs < 0) {
      throw new RangeError('Hitstop durationMs must be a finite non-negative number.');
    }
    const requestedScale = options.timeScale ?? 0;
    if (!Number.isFinite(requestedScale) || requestedScale < 0) {
      throw new RangeError('Hitstop timeScale must be a finite non-negative number.');
    }
    const id = `hitstop-${Date.now()}-${++this.counter}`;
    const request: HitstopRequest = {
      id,
      durationMs: options.durationMs,
      remainingMs: options.durationMs,
      timeScale: requestedScale,
      targetEntityIds: options.targetEntityIds ? new Set(options.targetEntityIds) : undefined,
    };

    this.activeHitstops.push(request);
    return id;
  }

  /**
   * Convenience combat hitstop between attacker and victim.
   */
  triggerCombatHitstop(attackerId: EntityId, victimId: EntityId, durationMs = 80, timeScale = 0.0): string {
    return this.triggerHitstop({
      durationMs,
      timeScale,
      targetEntityIds: [attackerId, victimId],
    });
  }

  /**
   * Marks an entity as immune to hitstop pauses (e.g. cinematic camera, UI cursors, super armor state).
   */
  setEntityImmune(entityId: EntityId, immune: boolean): void {
    if (immune) {
      this.immuneEntities.add(entityId);
    } else {
      this.immuneEntities.delete(entityId);
    }
  }

  /**
   * Checks if an entity is immune to hitstops.
   */
  isEntityImmune(entityId: EntityId): boolean {
    return this.immuneEntities.has(entityId);
  }

  /**
   * Sets custom time scale for an entity (e.g. slowed by cold effect or accelerated by speed buff).
   */
  setEntityTimeScale(entityId: EntityId, scale: number): void {
    if (!Number.isFinite(scale)) throw new RangeError('Entity time scale must be finite.');
    this.entityTimeScales.set(entityId, Math.max(0, scale));
  }

  /**
   * Clears custom time scale for an entity.
   */
  clearEntityTimeScale(entityId: EntityId): void {
    this.entityTimeScales.delete(entityId);
  }

  /**
   * Sets global baseline time scale (1.0 = real-time, 0.5 = half speed).
   */
  setGlobalTimeScale(scale: number): void {
    if (!Number.isFinite(scale)) throw new RangeError('Global time scale must be finite.');
    this.globalBaseTimeScale = Math.max(0, scale);
  }

  /**
   * Returns current effective time scale for a specific entity.
   */
  getEntityTimeScale(entityId: EntityId): number {
    if (this.immuneEntities.has(entityId)) {
      return this.entityTimeScales.get(entityId) ?? 1.0;
    }

    let effective = this.globalBaseTimeScale;

    // Apply entity-specific base modifier if set
    const custom = this.entityTimeScales.get(entityId);
    if (custom !== undefined) {
      effective *= custom;
    }

    // Apply active hitstops
    for (const hs of this.activeHitstops) {
      if (!hs.targetEntityIds || hs.targetEntityIds.has(entityId)) {
        effective = Math.min(effective, hs.timeScale);
      }
    }

    return effective;
  }

  /**
   * Returns current effective global time scale.
   */
  getGlobalTimeScale(): number {
    let effective = this.globalBaseTimeScale;
    for (const hs of this.activeHitstops) {
      if (!hs.targetEntityIds) {
        effective = Math.min(effective, hs.timeScale);
      }
    }
    return effective;
  }

  getGlobalBaseTimeScale(): number { return this.globalBaseTimeScale; }

  /**
   * Advances active hitstop timers by delta time in milliseconds.
   */
  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return;
    if (this.activeHitstops.length === 0) return;

    for (let i = this.activeHitstops.length - 1; i >= 0; i--) {
      const hs = this.activeHitstops[i];
      hs.remainingMs -= deltaMs;
      if (hs.remainingMs <= 0) {
        this.activeHitstops.splice(i, 1);
      }
    }
  }

  /**
   * Clears all active hitstops.
   */
  clear(): void {
    this.activeHitstops.length = 0;
    this.entityTimeScales.clear();
    this.immuneEntities.clear();
    this.globalBaseTimeScale = 1.0;
  }

  get hasActiveHitstops(): boolean { return this.activeHitstops.length > 0; }
}
