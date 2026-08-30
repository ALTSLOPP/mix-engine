import type { Engine } from '../engine/Engine';
import { GameplayFeatureRegistry } from '../features/gameplay/GameplayFeatureRegistry';
import type { FeatureDescriptor, GameplayFeatureId } from '../features/gameplay/types';
import { escapeHtml } from '../ui/domUtils';

let selectedFeatureId: GameplayFeatureId = 'target_lock';
let currentCategoryFilter = 'all';
let featureSearchQuery = '';

export function renderFeatureHubModal(engine: Engine): string {
  const features = GameplayFeatureRegistry.list();
  const activeFeatures = (engine as any).gameplayFeatures;

  const filteredFeatures = features.filter((feat) => {
    if (currentCategoryFilter !== 'all' && feat.category !== currentCategoryFilter) return false;
    if (featureSearchQuery) {
      const q = featureSearchQuery.toLowerCase();
      return (
        feat.name.toLowerCase().includes(q) ||
        feat.description.toLowerCase().includes(q) ||
        feat.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedFeature = GameplayFeatureRegistry.get(selectedFeatureId) ?? features[0];
  const selectedConfig = activeFeatures ? activeFeatures.getSystem(selectedFeature.id)?.getConfig() ?? selectedFeature.defaultConfig : selectedFeature.defaultConfig;

  return `
    <div class="feature-hub-overlay" id="feature-hub-overlay">
      <div class="feature-hub-dialog">
        <!-- Header -->
        <div class="feature-hub-header">
          <div class="feature-hub-title-area">
            <span class="feature-hub-icon">⚡</span>
            <div>
              <div class="feature-hub-title">GAMEPLAY FEATURE HUB</div>
              <div class="feature-hub-subtitle">Game Essentials, UI & Modular Gameplay</div>
            </div>
          </div>

          <!-- Quick Presets -->
          <div class="feature-hub-presets">
            <button class="btn-preset-chip" id="btn-preset-essentials">☰ Game Essentials</button>
            <button class="btn-preset-chip" id="btn-preset-all">⚡ Enable All Systems</button>
            <button class="btn-preset-chip" id="btn-preset-souls">🗡️ Souls-like</button>
            <button class="btn-preset-chip" id="btn-preset-action">⚡ Character Action</button>
            <button class="btn-preset-chip" id="btn-preset-shooter">🔫 Tactical Shooter</button>
            <button class="btn-preset-chip" id="btn-preset-fps-starter">📦 FPS Starter Content</button>
            <button class="btn-preset-chip" id="btn-preset-reset">🔄 Defaults</button>
            <button class="btn-preset-chip" id="btn-launch-arena-demo" style="background:#00f0ff;color:#000;font-weight:bold;border-color:#00f0ff;">🎮 Launch Arena Demo</button>
          </div>

          <button class="feature-hub-close-btn" id="btn-close-feature-hub" title="Close">✕</button>
        </div>

        <!-- Filter Bar -->
        <div class="feature-hub-filter-bar">
          <input
            type="text"
            class="feature-hub-search"
            placeholder="Search features (e.g. dodge, parry, combo, boss, abilities, loadout, bonfire, posture)..."
            value="${escapeHtml(featureSearchQuery)}"
            id="feature-hub-search-input"
          />
          <div class="feature-hub-category-pills">
            ${['all', 'general', 'combat', 'defense', 'souls', 'ranged', 'loadout', 'explosives', 'vehicles', 'traversal', 'stealth', 'crafting', 'progression', 'encounter', 'narrative', 'ai'].map((cat) => `
              <button class="category-pill ${currentCategoryFilter === cat ? 'active' : ''}" data-cat="${cat}">
                ${cat.toUpperCase()}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Main Body -->
        <div class="feature-hub-body">
          <!-- Left: Feature Grid -->
          <div class="feature-hub-grid">
            ${filteredFeatures.map((feat) => {
              const isEnabled = activeFeatures ? activeFeatures.isFeatureEnabled(feat.id) : true;
              const isSelected = feat.id === selectedFeatureId;
              return `
                <div class="feature-card ${isSelected ? 'selected' : ''} ${isEnabled ? 'enabled' : 'disabled'}" data-feature-id="${feat.id}">
                  <div class="feature-card-top">
                    <span class="feature-card-icon">${feat.icon}</span>
                    <div class="feature-card-header-info">
                      <div class="feature-card-name">${escapeHtml(feat.name)}</div>
                      <span class="feature-card-badge badge-${feat.category}">${feat.category.toUpperCase()}</span>
                    </div>
                    <label class="feature-toggle-switch" onclick="event.stopPropagation()">
                      <input type="checkbox" data-feature-toggle="${feat.id}" ${isEnabled ? 'checked' : ''} />
                      <span class="slider"></span>
                    </label>
                  </div>
                  <div class="feature-card-desc">${escapeHtml(feat.description)}</div>
                  <div class="feature-card-tags">
                    ${feat.tags.slice(0, 3).map((t) => `<span class="tag-chip">#${t}</span>`).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Right: Live Parameter Inspector -->
          <div class="feature-hub-inspector">
            <div class="inspector-header">
              <span style="font-size:18px">${selectedFeature.icon}</span>
              <div>
                <div style="font-weight:bold;color:#fff;font-size:13px">${escapeHtml(selectedFeature.name)}</div>
                <div style="font-size:10px;color:var(--text-muted)">Live Parameter Customizer</div>
              </div>
            </div>

            <div class="inspector-properties-list">
              ${selectedFeature.properties.map((prop) => {
                const val = selectedConfig[prop.key] ?? prop.default;
                return `
                  <div class="prop-row">
                    <div class="prop-label-col">
                      <label class="prop-label">${escapeHtml(prop.label)}</label>
                      ${prop.description ? `<div class="prop-desc">${escapeHtml(prop.description)}</div>` : ''}
                    </div>
                    <div class="prop-input-col">
                      ${renderPropertyInput(selectedFeature.id, prop, val)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="inspector-footer">
              <button class="btn-accent" style="font-size:10px;padding:6px 12px" id="btn-test-feature-play">
                ▶ Test in Scene (Play Mode)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPropertyInput(featureId: string, prop: any, val: any): string {
  if (prop.type === 'boolean') {
    return `
      <input type="checkbox" class="feature-prop-input" data-feature="${featureId}" data-prop="${prop.key}" ${val ? 'checked' : ''} />
    `;
  }
  if (prop.type === 'number') {
    return `
      <div style="display:flex;align-items:center;gap:8px">
        <input
          type="range"
          class="feature-prop-slider"
          data-feature="${featureId}"
          data-prop="${prop.key}"
          min="${prop.min ?? 0}"
          max="${prop.max ?? 100}"
          step="${prop.step ?? 1}"
          value="${val}"
          oninput="this.nextElementSibling.value = this.value"
        />
        <input
          type="number"
          class="feature-prop-input prop-num-box"
          data-feature="${featureId}"
          data-prop="${prop.key}"
          min="${prop.min ?? 0}"
          max="${prop.max ?? 100}"
          step="${prop.step ?? 1}"
          value="${val}"
          oninput="this.previousElementSibling.value = this.value"
        />
      </div>
    `;
  }
  if (prop.type === 'color') {
    return `
      <input type="color" class="feature-prop-color" data-feature="${featureId}" data-prop="${prop.key}" value="${val}" />
    `;
  }
  return `
    <input type="text" class="feature-prop-input" data-feature="${featureId}" data-prop="${prop.key}" value="${escapeHtml(String(val))}" />
  `;
}

// ── Hook Events & Live Parameter Updates ─────────────────────────────────────

export function hookFeatureHubEvents(engine: Engine, container: HTMLElement): void {
  container.querySelector('#btn-preset-essentials')?.addEventListener('click', () => {
    engine.gameplayFeatures.applyPreset('essentials');
    refreshFeatureHub(engine, container);
  });
  const gfm = (engine as any).gameplayFeatures;
  if (!gfm) return;

  // 1. Close Button
  const btnClose = container.querySelector('#btn-close-feature-hub');
  btnClose?.addEventListener('click', () => {
    const modal = document.getElementById('feature-hub-modal-container');
    if (modal) modal.style.display = 'none';
  });

  // 2. Search & Category Filters
  const searchInput = container.querySelector('#feature-hub-search-input') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    featureSearchQuery = searchInput.value;
    refreshFeatureHub(engine, container);
  });

  const categoryPills = container.querySelectorAll('.category-pill');
  categoryPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      currentCategoryFilter = pill.getAttribute('data-cat') || 'all';
      refreshFeatureHub(engine, container);
    });
  });

  // 3. Feature Selection
  const cards = container.querySelectorAll('.feature-card');
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const fid = card.getAttribute('data-feature-id') as GameplayFeatureId;
      if (fid) {
        selectedFeatureId = fid;
        refreshFeatureHub(engine, container);
      }
    });
  });

  // 4. Feature Enable/Disable Toggles
  const toggles = container.querySelectorAll('[data-feature-toggle]');
  toggles.forEach((tog) => {
    tog.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const fid = target.getAttribute('data-feature-toggle') as GameplayFeatureId;
      if (fid) {
        if (target.checked) gfm.enableFeature(fid);
        else gfm.disableFeature(fid);
        refreshFeatureHub(engine, container);
      }
    });
  });

  // 5. Presets
  container.querySelector('#btn-preset-all')?.addEventListener('click', () => {
    gfm.enableAllFeatures();
    refreshFeatureHub(engine, container);
  });
  container.querySelector('#btn-preset-souls')?.addEventListener('click', () => {
    gfm.applyPreset('souls');
    refreshFeatureHub(engine, container);
  });
  container.querySelector('#btn-preset-action')?.addEventListener('click', () => {
    gfm.applyPreset('action');
    refreshFeatureHub(engine, container);
  });
  container.querySelector('#btn-preset-shooter')?.addEventListener('click', () => {
    gfm.applyPreset('shooter');
    refreshFeatureHub(engine, container);
  });
  container.querySelector('#btn-preset-fps-starter')?.addEventListener('click', () => {
    gfm.applyPreset('fps_starter');
    refreshFeatureHub(engine, container);
  });
  container.querySelector('#btn-preset-reset')?.addEventListener('click', () => {
    gfm.applyPreset('defaults');
    refreshFeatureHub(engine, container);
  });
  container.querySelector('#btn-launch-arena-demo')?.addEventListener('click', () => {
    const modal = document.getElementById('feature-hub-modal-container');
    if (modal) modal.style.display = 'none';
    gfm.enableAllFeatures();
    gfm.arena.startArena();
    engine.input.setMode('play');
  });

  // 6. Live Parameter Inputs
  const propInputs = container.querySelectorAll('[data-prop]');
  propInputs.forEach((input) => {
    const handleUpdate = () => {
      const el = input as HTMLInputElement;
      const featId = el.getAttribute('data-feature') as GameplayFeatureId;
      const propKey = el.getAttribute('data-prop');
      if (!featId || !propKey) return;

      let value: any = el.value;
      if (el.type === 'checkbox') value = el.checked;
      else if (el.type === 'number' || el.type === 'range') value = parseFloat(el.value);

      gfm.configureFeature(featId, { [propKey]: value });
    };

    input.addEventListener('change', handleUpdate);
    if (input.tagName === 'INPUT' && (input as HTMLInputElement).type === 'range') {
      input.addEventListener('input', handleUpdate);
    }
  });

  // 7. Test in Play Mode
  container.querySelector('#btn-test-feature-play')?.addEventListener('click', () => {
    const modal = document.getElementById('feature-hub-modal-container');
    if (modal) modal.style.display = 'none';
    engine.input.setMode('play');
  });
}

function refreshFeatureHub(engine: Engine, container: HTMLElement): void {
  container.innerHTML = renderFeatureHubModal(engine);
  hookFeatureHubEvents(engine, container);
}

// ── In-Game Action HUD Overlay ───────────────────────────────────────────────

export class ActionCombatHUD {
  private domRoot: HTMLElement | null = null;

  constructor(private readonly engine: Engine) {
    this.createDom();
    this.bindEvents();
  }

  private createDom(): void {
    if (typeof document === 'undefined') return;

    let root = document.getElementById('action-combat-hud');
    if (!root) {
      root = document.createElement('div');
      root.id = 'action-combat-hud';
      root.className = 'action-combat-hud';
      document.body.appendChild(root);
    }
    this.domRoot = root;
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager.events;

    events.on('arena_wave_started', (data: any) => {
      this.showWaveBanner(`WAVE ${data.waveIndex + 1}`, data.waveTitle);
    });

    events.on('arena_wave_cleared', (data: any) => {
      this.showWaveBanner(`WAVE ${data.waveIndex + 1} CLEARED!`, `Next wave in ${data.intermissionDuration}s...`);
    });

    events.on('arena_victory', (data: any) => {
      this.showVictoryModal(data);
    });

    events.on('arena_defeat', (data: any) => {
      this.showDefeatModal(data);
    });
  }

  update(): void {
    if (!this.domRoot) return;
    if (this.engine.input.mode !== 'play') {
      this.domRoot.style.display = 'none';
      return;
    }
    this.domRoot.style.display = 'block';

    const gfm = (this.engine as any).gameplayFeatures;
    if (!gfm) return;

    const playerEntityId = this.engine.player.getPossessedId();
    const playerHealth = playerEntityId !== null ? this.engine.combat.getHealth(playerEntityId) : null;
    const hp = playerHealth?.hp ?? 100;
    const maxHp = playerHealth?.maxHp ?? 100;
    const stamina = gfm.defense.currentStamina;
    const maxStamina = gfm.defense.maxStamina;
    const mp = gfm.abilities.currentMp;
    const maxMp = gfm.abilities.maxMp;

    const lockState = gfm.targetLock.getState();
    const comboState = gfm.combo.getState();
    const arenaState = gfm.arena.getState();
    const bossState = gfm.encounterAI.getBossState();

    // Render In-Game HUD Elements
    this.domRoot.innerHTML = `
      <!-- Player Resource Bars -->
      <div class="hud-player-bars">
        <!-- HP Bar -->
        <div class="hud-bar-container hp-bar">
          <div class="hud-bar-fill" style="width: ${(hp / maxHp) * 100}%"></div>
          <span class="hud-bar-text">HP ${Math.ceil(hp)} / ${maxHp}</span>
        </div>
        <!-- Stamina Bar -->
        <div class="hud-bar-container stamina-bar">
          <div class="hud-bar-fill" style="width: ${(stamina / maxStamina) * 100}%"></div>
          <span class="hud-bar-text">STAMINA ${Math.ceil(stamina)} / ${maxStamina}</span>
        </div>
        <!-- MP Bar -->
        <div class="hud-bar-container mp-bar">
          <div class="hud-bar-fill" style="width: ${(mp / maxMp) * 100}%"></div>
          <span class="hud-bar-text">MP ${Math.ceil(mp)} / ${maxMp}</span>
        </div>
      </div>

      <!-- Target Lock Reticle -->
      ${lockState.screenPos.visible ? `
        <div class="hud-target-lock-reticle" style="left: ${lockState.screenPos.x}px; top: ${lockState.screenPos.y}px;">
          <div class="reticle-diamond"></div>
          <span class="reticle-lock-text">LOCKED</span>
        </div>
      ` : ''}

      <!-- Combo Counter & Rank Badge -->
      ${comboState.comboCount > 0 ? `
        <div class="hud-combo-container">
          <div class="hud-combo-rank rank-${comboState.comboRank}">${comboState.comboRank}</div>
          <div class="hud-combo-count">${comboState.comboCount} <span style="font-size:12px">HITS</span></div>
          <div class="hud-combo-score">${comboState.comboScore} PTS</div>
        </div>
      ` : ''}

      <!-- Ability Hotbar -->
      <div class="hud-ability-hotbar">
        ${[1, 2, 3, 4].map((slot) => {
          const ab = gfm.abilities.getAbilityBySlot(slot as any);
          const cd = ab ? gfm.abilities.getCooldownRemaining(ab.id) : 0;
          return `
            <div class="hud-ability-slot ${cd > 0 ? 'on-cooldown' : ''}">
              <span class="ability-slot-key">${slot}</span>
              <span class="ability-slot-icon">${ab?.icon ?? '✨'}</span>
              ${cd > 0 ? `<div class="ability-cooldown-overlay">${cd.toFixed(1)}s</div>` : ''}
              <div class="ability-slot-name">${ab?.name ?? ''}</div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Boss Health Bar -->
      ${bossState.bossEntityId !== null ? (() => {
        const bHealth = this.engine.combat.getHealth(bossState.bossEntityId);
        const bHp = bHealth?.hp ?? 0;
        const bMaxHp = bHealth?.maxHp ?? 1;
        return `
          <div class="hud-boss-bar-container">
            <div class="hud-boss-title">${bossState.currentPhase?.name ?? 'BOSS ENCOUNTER'}</div>
            <div class="hud-boss-bar">
              <div class="hud-boss-bar-fill" style="width: ${(bHp / bMaxHp) * 100}%"></div>
            </div>
          </div>
        `;
      })() : ''}

      <!-- Stealth Stance & Backstab Prompt -->
      ${gfm.isFeatureEnabled('stealth_detection') && gfm.stealth.crouching ? `
        <div class="hud-stealth-badge">🥷 CROUCH / SNEAK ACTIVE</div>
      ` : ''}

      ${gfm.isFeatureEnabled('stealth_detection') && gfm.stealth.backstabTarget !== null ? `
        <div class="hud-backstab-prompt animate-pulse">
          <span style="background:var(--accent-gold);color:#000;padding:2px 8px;border-radius:4px;font-weight:bold;margin-right:6px">E</span>
          EXECUTE BACKSTAB (4.0x CRIT)
        </div>
      ` : ''}

      <!-- Interactive Dialogue Box -->
      ${gfm.isFeatureEnabled('dialogue_system') && gfm.dialogue.isActive && gfm.dialogue.currentNode ? (() => {
        const node = gfm.dialogue.currentNode;
        const txt = gfm.dialogue.currentText;
        return `
          <div class="hud-dialogue-overlay animate-slide-up">
            <div class="dialogue-speaker-badge">💬 ${escapeHtml(node.speakerName)}</div>
            <div class="dialogue-text-body">${escapeHtml(txt)}</div>
            ${node.choices && node.choices.length > 0 ? `
              <div class="dialogue-choices-row">
                ${node.choices.map((c: any, i: number) => `
                  <button class="btn-dialogue-choice" data-choice-idx="${i}">
                    <span class="choice-key">[${i + 1}]</span> ${escapeHtml(c.text)}
                  </button>
                `).join('')}
              </div>
            ` : `
              <div style="font-size:11px;color:var(--text-muted);margin-top:8px">Press [ESC] to close</div>
            `}
          </div>
        `;
      })() : ''}

      <!-- Ranged Gunplay Crosshair & Ammo Counter -->
      ${gfm.isFeatureEnabled('ranged_shooter') && gfm.ranged.aiming ? `
        <div class="hud-gun-crosshair">
          <div class="crosshair-dot"></div>
          <div class="crosshair-line top"></div>
          <div class="crosshair-line bottom"></div>
          <div class="crosshair-line left"></div>
          <div class="crosshair-line right"></div>
        </div>
        <div class="hud-ammo-counter">
          <span style="font-size:22px;font-weight:900;color:var(--accent-cyan)">${gfm.ranged.ammo}</span>
          <span style="font-size:12px;color:var(--text-muted)">/ ${gfm.ranged.capacity}</span>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">${escapeHtml(gfm.ranged.weapon?.name ?? 'WEAPON')} ${gfm.ranged.reloading ? ' (RELOADING...)' : ''}</div>
        </div>
      ` : ''}

      <!-- Vehicle Speedometer & Nitro HUD -->
      ${gfm.isFeatureEnabled('vehicle_mount') && gfm.vehicle.isMounted ? `
        <div class="hud-speedometer-container">
          <div class="speed-value">${Math.abs(Math.round(gfm.vehicle.speed * 3.6))} <span style="font-size:12px;color:var(--text-muted)">KM/H</span></div>
          <div class="nitro-bar">
            <div class="nitro-fill" style="width: ${(gfm.vehicle.boost / 4.0) * 100}%"></div>
          </div>
          <span style="font-size:9px;color:var(--accent-cyan);letter-spacing:1px">${gfm.vehicle.boosting ? '🔥 NITRO BOOST ACTIVE' : '⚡ NITRO (SHIFT)'}</span>
        </div>
      ` : ''}

      <!-- Bullet Time Slowmo Vignette -->
      ${gfm.isFeatureEnabled('time_mechanics') && gfm.time.inBulletTime ? `
        <div class="hud-bullet-time-banner animate-pulse">
          ⏳ BULLET TIME DILATION ACTIVE (0.2x)
        </div>
      ` : ''}

      <!-- Tactical Weapon Wheel Radial HUD (Tab) -->
      ${gfm.isFeatureEnabled('weapon_wheel_loadout') && gfm.loadout.isOpen ? `
        <div class="hud-weapon-wheel-overlay animate-scale-up">
          <div class="wheel-center-title">SELECT WEAPON</div>
          <div class="wheel-slots-ring">
            ${gfm.loadout.getConfig().slots.map((slot: any) => `
              <div class="wheel-slot-card ${gfm.loadout.getState().activeSlot === slot.slot ? 'active-slot' : ''}" data-wheel-slot="${slot.slot}">
                <span class="slot-icon">${slot.icon}</span>
                <span class="slot-name">${escapeHtml(slot.name)}</span>
                <span class="slot-key">[${slot.slot}]</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Estus Flasks & Tears HUD -->
      ${gfm.isFeatureEnabled('estus_flask_healing') ? `
        <div class="hud-estus-counter">
          <div class="estus-chip crimson">
            <span class="flask-icon">🧪</span>
            <span class="flask-count">${gfm.flasks.crimsonRemaining}</span>
          </div>
          <div class="estus-chip cerulean">
            <span class="flask-icon">✨</span>
            <span class="flask-count">${gfm.flasks.ceruleanRemaining}</span>
          </div>
          <span style="font-size:9px;color:var(--text-muted);letter-spacing:0.5px">[B] DRINK FLASK</span>
        </div>
      ` : ''}

      <!-- Tactical Cover Badge -->
      ${gfm.isFeatureEnabled('cover_peeking') && gfm.cover.inCover ? `
        <div class="hud-cover-badge animate-fade-in">
          🧱 ${gfm.cover.coverType.toUpperCase()} COVER ACTIVE ${gfm.cover.isPeeking ? `(PEEKING ${gfm.cover.getState().leanDirection.toUpperCase()})` : ''}
        </div>
      ` : ''}

      <!-- Bonfire Rest Prompt -->
      ${gfm.isFeatureEnabled('bonfire_checkpoint') && gfm.bonfire.getNearbyBonfire() !== null ? `
        <div class="hud-bonfire-prompt animate-pulse">
          <span style="background:var(--accent-gold);color:#000;padding:2px 8px;border-radius:4px;font-weight:bold;margin-right:6px">E</span>
          REST AT ${escapeHtml(gfm.bonfire.getNearbyBonfire().name.toUpperCase())}
        </div>
      ` : ''}

      <!-- Visceral Deathblow Execution Prompt -->
      ${gfm.isFeatureEnabled('posture_visceral') && gfm.posture.getExecutableTarget() !== null ? `
        <div class="hud-visceral-prompt animate-pulse">
          🔴 [LMB / ATTACK] VISCERAL DEATHBLOW (4.0x CRIT)
        </div>
      ` : ''}

      <!-- Killstreak Banner -->
      ${gfm.isFeatureEnabled('killstreaks_rewards') && gfm.killstreaks.currentStreak >= 2 ? `
        <div class="hud-killstreak-chip animate-fade-in">
          🎖️ ${gfm.killstreaks.currentStreak} KILLSTREAK ${gfm.killstreaks.isRadarActive ? '• 📡 RADAR ACTIVE' : ''}
        </div>
      ` : ''}
    `;

    // Bind dialogue button clicks
    this.domRoot.querySelectorAll('.btn-dialogue-choice').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-choice-idx') ?? '0', 10);
        gfm.dialogue.selectChoice(idx);
      });
    });
  }

  showWaveBanner(title: string, subtitle: string): void {
    const banner = document.createElement('div');
    banner.className = 'hud-wave-banner animate-fade-in';
    banner.innerHTML = `
      <div style="font-size:28px;font-weight:900;letter-spacing:2px;color:var(--accent-gold)">${escapeHtml(title)}</div>
      <div style="font-size:14px;color:#fff;margin-top:4px">${escapeHtml(subtitle)}</div>
    `;
    this.domRoot?.appendChild(banner);
    window.setTimeout(() => banner.remove(), 2500);
  }

  showVictoryModal(data: any): void {
    const modal = document.createElement('div');
    modal.className = 'hud-endgame-modal victory-modal animate-scale-up';
    modal.innerHTML = `
      <div class="endgame-title gold-text">${escapeHtml(data.banner)}</div>
      <div class="endgame-rank-grade">GRADE ${data.grade}</div>
      <div class="endgame-stats-row">
        <div>Time: ${data.elapsedSec.toFixed(1)}s</div>
        <div>Enemies Defeated: ${data.totalKills}</div>
      </div>
      <div class="endgame-actions">
        <button class="btn-accent" id="btn-arena-rematch">REMATCH / PLAY AGAIN</button>
      </div>
    `;
    this.domRoot?.appendChild(modal);

    modal.querySelector('#btn-arena-rematch')?.addEventListener('click', () => {
      modal.remove();
      (this.engine as any).gameplayFeatures?.arena.restartArena();
    });
  }

  showDefeatModal(data: any): void {
    const modal = document.createElement('div');
    modal.className = 'hud-endgame-modal defeat-modal animate-scale-up';
    modal.innerHTML = `
      <div class="endgame-title red-text">${escapeHtml(data.banner)}</div>
      <div class="endgame-actions" style="margin-top:20px">
        <button class="btn-accent" id="btn-arena-retry">RETRY ENCOUNTER</button>
      </div>
    `;
    this.domRoot?.appendChild(modal);

    modal.querySelector('#btn-arena-retry')?.addEventListener('click', () => {
      modal.remove();
      (this.engine as any).gameplayFeatures?.arena.restartArena();
    });
  }
}
