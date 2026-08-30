import type { EventBus } from '../ecs/EventBus';

export type DirectorPacingPhase = 'relax' | 'build_up' | 'peak';

export interface DirectorConfig {
  relaxDuration?: number; // seconds
  buildUpDuration?: number; // seconds
  peakStressThreshold?: number;
}

export class AIDirector {
  phase: DirectorPacingPhase = 'relax';
  playerStress = 0; // 0..1
  phaseTimer = 0;

  relaxDuration: number;
  buildUpDuration: number;
  peakStressThreshold: number;

  autoPacing = true;

  constructor(
    private readonly eventBus?: EventBus,
    config: DirectorConfig = {},
  ) {
    this.relaxDuration = config.relaxDuration ?? 15.0;
    this.buildUpDuration = config.buildUpDuration ?? 25.0;
    this.peakStressThreshold = config.peakStressThreshold ?? 0.85;

    // Listen to gameplay events to modulate stress
    this.eventBus?.on('player_damaged', (payload: any) => {
      const amount = (payload?.amount as number) ?? 10;
      this.playerStress = Math.min(this.playerStress + amount * 0.02, 1.0);
    });

    this.eventBus?.on('enemy_killed', () => {
      this.playerStress = Math.min(this.playerStress + 0.05, 1.0);
    });
  }

  update(dt: number): void {
    if (!this.autoPacing) return;

    this.phaseTimer += dt;

    // Natural stress decay when not taking damage
    this.playerStress = Math.max(this.playerStress - dt * 0.015, 0.0);

    switch (this.phase) {
      case 'relax':
        if (this.phaseTimer >= this.relaxDuration) {
          this.setPhase('build_up');
        }
        break;

      case 'build_up':
        if (this.playerStress >= this.peakStressThreshold || this.phaseTimer >= this.buildUpDuration) {
          this.setPhase('peak');
        }
        break;

      case 'peak':
        // Stay in peak until stress drops or timer exceeds 15s
        if (this.phaseTimer >= 15.0 && this.playerStress < 0.5) {
          this.setPhase('relax');
          this.eventBus?.emit('director_supply_drop', { reason: 'peak_survived' });
        }
        break;
    }
  }

  setPhase(newPhase: DirectorPacingPhase): void {
    this.phase = newPhase;
    this.phaseTimer = 0;
    this.eventBus?.emit('director_phase_changed', { phase: newPhase });
  }
}
