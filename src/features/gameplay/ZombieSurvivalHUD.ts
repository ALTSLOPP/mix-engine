import type { Engine } from '../../engine/Engine';
import type { GameplayFeatureManager } from './GameplayFeatureManager';
import { escapeHtml } from '../../ui/domUtils';

const escape = (val: unknown) => escapeHtml(String(val));

export class ZombieSurvivalHUD {
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private hudElement: HTMLDivElement | null = null;
  private unsubs: Array<() => void> = [];
  private lastSignature = '';

  constructor(private readonly engine: Engine, private readonly features: GameplayFeatureManager) {
    if (typeof document === 'undefined') return;

    this.host = document.createElement('div');
    this.host.id = 'mix-zombie-survival-hud';
    this.root = this.host.attachShadow({ mode: 'open' });

    this.root.innerHTML = `
      <style>
        :host {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9998;
          font-family: 'Impact', 'Arial Black', sans-serif;
          color: #ffffff;
          user-select: none;
        }
        .zombie-hud {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          padding: 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .top-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .round-display {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-shadow: 0 0 12px rgba(255, 0, 0, 0.8), 2px 2px 0 #000;
        }
        .round-title {
          font-size: 38px;
          letter-spacing: 3px;
          color: #ff2222;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .round-special {
          font-size: 20px;
          letter-spacing: 2px;
          color: #ffaa00;
          animation: pulse 1s infinite alternate;
        }
        .score-display {
          font-size: 36px;
          color: #ffdd44;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.6), 2px 2px 0 #000;
          letter-spacing: 2px;
        }
        .bottom-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .perks-row {
          display: flex;
          gap: 12px;
        }
        .perk-badge {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.7);
          border: 2px solid #555;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.6);
          opacity: 0.35;
          transition: transform 0.2s, opacity 0.2s;
        }
        .perk-badge.active {
          opacity: 1.0;
          transform: scale(1.08);
          border-color: #ffd700;
          box-shadow: 0 0 12px rgba(255, 215, 0, 0.8);
        }
        .perk-juggernog.active { border-color: #ff2222; box-shadow: 0 0 12px #ff2222; }
        .perk-speed_cola.active { border-color: #22cc44; box-shadow: 0 0 12px #22cc44; }
        .perk-quick_revive.active { border-color: #2288ff; box-shadow: 0 0 12px #2288ff; }
        .perk-double_tap.active { border-color: #ff8800; box-shadow: 0 0 12px #ff8800; }
        .perk-stamin_up.active { border-color: #ffea00; box-shadow: 0 0 12px #ffea00; }
        .perk-deadshot.active { border-color: #00e5ff; box-shadow: 0 0 12px #00e5ff; }
        .perk-mule_kick.active { border-color: #b000ff; box-shadow: 0 0 12px #b000ff; }

        .powerups-bar {
          display: flex;
          gap: 10px;
        }
        .powerup-pill {
          background: rgba(20, 20, 20, 0.85);
          border: 2px solid #00e5ff;
          border-radius: 20px;
          padding: 6px 14px;
          font-size: 16px;
          letter-spacing: 1px;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 0 10px rgba(0, 229, 255, 0.6);
        }

        .infection-meter {
          width: 220px;
          background: rgba(0, 0, 0, 0.7);
          border: 2px solid #555;
          border-radius: 6px;
          overflow: hidden;
          padding: 3px;
        }
        .infection-fill {
          height: 12px;
          border-radius: 3px;
          background: linear-gradient(90deg, #22cc44, #ff8800, #ff2222);
          transition: width 0.3s;
        }
        .quest-box {
          background: rgba(10, 10, 15, 0.8);
          border-left: 4px solid #aa00ff;
          padding: 8px 14px;
          border-radius: 0 6px 6px 0;
          font-size: 14px;
          max-width: 280px;
          font-family: sans-serif;
        }
        @keyframes pulse {
          0% { transform: scale(1.0); filter: brightness(1.0); }
          100% { transform: scale(1.05); filter: brightness(1.3); }
        }
      </style>
      <div class="zombie-hud"></div>
    `;

    this.hudElement = this.root.querySelector('.zombie-hud');
    document.body.appendChild(this.host);
    this.bindEvents();
    this.update();
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    const u1 = events.on('zombie_wave_started', () => this.update());
    const u2 = events.on('zombie_killed', () => this.update());
    const u3 = events.on('perk_bought', () => this.update());
    const u4 = events.on('powerup_collected', () => this.update());
    const u5 = events.on('infection_changed', () => this.update());
    const u6 = events.on('hellhound_round_started', () => this.update());
    const u7 = events.on('hellhound_round_completed', () => this.update());

    if (u1) this.unsubs.push(u1);
    if (u2) this.unsubs.push(u2);
    if (u3) this.unsubs.push(u3);
    if (u4) this.unsubs.push(u4);
    if (u5) this.unsubs.push(u5);
    if (u6) this.unsubs.push(u6);
    if (u7) this.unsubs.push(u7);
  }

  update(): void {
    if (!this.hudElement || !this.host) return;

    const isZombieMode = this.features.isFeatureEnabled('zombie_horde_ai');
    if (!isZombieMode) {
      this.host.hidden = true;
      return;
    }
    this.host.hidden = false;

    const wave = this.features.zombieHorde.getWaveState();
    const roundNumber = wave.currentWaveIndex + 1;
    const score = (this.engine.sceneManager?.gameState as any)?.score ?? 0;
    const activePerks = this.features.perkVending.getState().activePerks;
    const isHellhound = this.features.hellhounds.getState().isHellhoundRound;

    const signature = JSON.stringify([
      roundNumber,
      score,
      activePerks,
      isHellhound,
      this.features.infection.getState().infectionPercent,
      this.features.zombiePowerups.getState().activeEffects,
      this.features.easterEggQuest.getState().currentStepIndex,
    ]);

    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    const allPerks = [
      { id: 'juggernog', icon: '✚' },
      { id: 'speed_cola', icon: '⚡' },
      { id: 'quick_revive', icon: '🕊️' },
      { id: 'double_tap', icon: 'Ⅱ' },
      { id: 'stamin_up', icon: '👟' },
      { id: 'deadshot', icon: '🎯' },
      { id: 'mule_kick', icon: '🔫' },
    ];

    const infectionState = this.features.infection.getState();
    const questStep = this.features.easterEggQuest.getCurrentStep();

    this.hudElement.innerHTML = `
      <div class="top-bar">
        <div class="round-display">
          <div class="round-title">
            <span>💀</span>
            <span>ROUND ${roundNumber}</span>
          </div>
          ${isHellhound ? '<div class="round-special">⚡ HELLHOUNDS WAVE ⚡</div>' : ''}
        </div>
        <div class="score-display">
          <span>${score} PTS</span>
        </div>
      </div>

      <div class="middle-bar">
        ${this.features.isFeatureEnabled('zombie_easter_egg_quest') && questStep ? `
          <div class="quest-box">
            <b>QUEST: ${escape(questStep.title)}</b>
            <div><small>${escape(questStep.description)}</small></div>
          </div>
        ` : ''}
      </div>

      <div class="bottom-bar">
        <div class="perks-row">
          ${allPerks.map((p) => `
            <div class="perk-badge perk-${p.id} ${activePerks.includes(p.id as any) ? 'active' : ''}">
              ${p.icon}
            </div>
          `).join('')}
        </div>

        ${this.features.isFeatureEnabled('infection_immunity_meter') ? `
          <div class="infection-meter">
            <div class="infection-fill" style="width: ${Math.min(100, infectionState.infectionPercent)}%"></div>
          </div>
        ` : ''}
      </div>
    `;
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    if (this.host && typeof document !== 'undefined') {
      this.host.remove();
    }
  }
}
