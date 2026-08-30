import type { Engine } from '../../engine/Engine';
import type { GameplayFeatureManager } from './GameplayFeatureManager';
import type { GameSettingsConfig, ObjectiveState } from './GeneralFeatureTypes';
import { escapeHtml } from '../../ui/domUtils';
import { generalGameplayStyles } from './GeneralGameplayStyles';

type Tab = 'overview' | 'display' | 'audio' | 'controls' | 'objectives';
const escape = (value: unknown) => escapeHtml(String(value));
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** A reusable runtime UI, isolated from editor CSS. No editor imports or polling timers. */
export class GeneralGameplayUI {
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private modal: HTMLDivElement | null = null;
  private hud: HTMLDivElement | null = null;
  private tab: Tab = 'overview';
  private wasOpen = false;
  private previousFocus: HTMLElement | null = null;
  private hudSignature = '';
  private menuSignature = '';
  private off: Array<() => void> = [];

  constructor(private readonly engine: Engine, private readonly features: GameplayFeatureManager) {
    if (typeof document === 'undefined') return;
    this.host = document.createElement('div');
    this.host.id = 'mix-general-gameplay';
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${generalGameplayStyles}</style><div class="hud"></div><div class="modal"></div>`;
    this.hud = this.root.querySelector('.hud');
    this.modal = this.root.querySelector('.modal');
    document.body.appendChild(this.host);
    this.root.addEventListener('click', this.onClick as EventListener);
    this.root.addEventListener('input', this.onInput as EventListener);
    this.root.addEventListener('keydown', this.onKey as EventListener);
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'wheel', 'keyup']) {
      this.root.addEventListener(type, event => { if (this.wasOpen) event.stopPropagation(); });
    }
    this.off.push(engine.sceneManager.events.on('game_paused', () => this.update()));
    this.off.push(engine.sceneManager.events.on('game_resumed', () => this.update()));
    this.update();
  }

  update(): void {
    if (!this.root || !this.modal || !this.hud || !this.host) return;
    const inPlay = this.engine.input?.mode === 'play';
    this.host.hidden = !inPlay;
    const open = inPlay && this.features.pause.isPaused;
    if (open !== this.wasOpen) {
      this.wasOpen = open;
      if (open) {
        this.previousFocus = document.activeElement as HTMLElement;
        this.tab = 'overview';
        this.renderMenu();
        this.root.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
      } else {
        this.modal.replaceChildren();
        this.previousFocus?.focus?.();
      }
    }
    const notifications = this.features.notifications.items;
    const objectiveConfig = this.features.objectives.getConfig();
    const objectives = objectiveConfig.enabled ? this.features.objectives.items.filter(o => objectiveConfig.showCompleted || !o.completed).slice(0, objectiveConfig.maxVisible) : [];
    const session = this.features.session.getState();
    const menuSignature = JSON.stringify([this.features.pause.getConfig(), this.features.settings.getConfig().enabled, objectiveConfig, this.features.objectives.items, session]);
    if (open && this.menuSignature !== menuSignature) {
      const active = this.root.activeElement as HTMLElement | null;
      const tab = active?.dataset.tab;
      const action = active?.dataset.action;
      const setting = active?.id;
      this.renderMenu();
      const selector = setting ? `#${setting}` : tab ? `[data-tab="${tab}"]` : action ? `[data-action="${action}"]` : '[data-action="resume"]';
      this.root.querySelector<HTMLElement>(selector)?.focus();
    }
    this.menuSignature = menuSignature;
    const signature = JSON.stringify([notifications.map(n => [n.id, n.message, n.kind]), objectiveConfig.title, objectives, this.features.session.getConfig(), session.status, session.score, Math.ceil(session.remaining), Math.floor(session.elapsed), open]);
    if (signature === this.hudSignature) return;
    this.hudSignature = signature;
    this.hud.innerHTML = `${!open && objectives.length ? `<section class="objective-hud" aria-label="Objectives"><div class="eyebrow">${escape(objectiveConfig.title)}</div>${this.objectiveRows(objectives)}</section>` : ''}
      <div class="toasts" role="status" aria-live="polite">${notifications.map(n => `<div class="toast" data-kind="${n.kind}"><span>${escape(n.message)}</span><button data-dismiss="${n.id}" aria-label="Dismiss notification">×</button></div>`).join('')}</div>
      ${!open && this.features.session.getConfig().enabled && session.status !== 'idle' ? `<div class="session-hud"><span>${escape(this.features.session.getConfig().title)}</span><b>${session.score} pts</b><span>${session.status === 'running' ? clock(this.features.session.getConfig().duration > 0 ? Math.ceil(session.remaining) : session.elapsed) : session.status.toUpperCase()}</span></div>` : ''}`;
  }

  private objectiveRows(items: ObjectiveState[]): string {
    return items.map(o => `<div class="objective"><span><span>${o.completed ? '✓ ' : ''}${escape(o.title)}${o.optional ? ' <small>(optional)</small>' : ''}</span><small>${o.progress}/${o.target}</small></span><div class="bar" role="progressbar" aria-label="${escape(o.title)}" aria-valuenow="${o.progress}" aria-valuemin="0" aria-valuemax="${o.target}"><i style="width:${Math.min(100, o.progress / o.target * 100)}%"></i></div></div>`).join('');
  }

  private renderMenu(): void {
    if (!this.modal || !this.features.pause.isPaused) return;
    const session = this.features.session.getState();
    const ended = session.status === 'won' || session.status === 'lost';
    const settings = this.features.settings.getConfig();
    const hasSettings = this.features.pause.getConfig().showSettings && settings.enabled;
    if (!hasSettings && ['display', 'audio', 'controls'].includes(this.tab)) this.tab = 'overview';
    const tabs: Array<[Tab, string]> = [['overview', 'Overview'], ...(hasSettings ? [['display', 'Display'], ['audio', 'Audio'], ['controls', 'Controls']] as Array<[Tab, string]> : []), ...(this.features.objectives.getConfig().enabled ? [['objectives', 'Objectives']] as Array<[Tab, string]> : [])];
    this.modal.innerHTML = `<div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <header class="top"><div><div class="eyebrow">${ended ? session.status === 'won' ? 'ROUND COMPLETE' : 'ROUND ENDED' : 'GAME PAUSED'}</div><h1 id="pause-title">${escape(this.features.pause.getConfig().title)}</h1></div><div class="status"><span class="dot"></span>Gameplay is paused</div></header>
      <div class="body"><nav class="nav" aria-label="Pause menu"><button class="primary" data-action="resume">Resume game <span aria-hidden="true">↗</span></button><div class="nav-label">YOUR GAME</div>${tabs.map(([id, label]) => `<button data-tab="${id}" aria-selected="${this.tab === id}">${label}</button>`).join('')}</nav><main class="content">${this.content(settings)}</main></div>
      <footer class="footer"><span><span class="key">ESC</span> Back to game · settings apply immediately</span>${hasSettings && this.tab !== 'overview' && this.tab !== 'objectives' ? '<button data-action="reset">Reset settings</button>' : '<span>Take your time.</span>'}</footer>
    </section></div>`;
  }

  private range(key: keyof GameSettingsConfig, label: string, description: string, min: number, max: number, step: number, value: number): string {
    return `<div class="row"><label for="setting-${key}">${label}<small>${description}</small></label><div class="control"><input id="setting-${key}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output for="setting-${key}">${value}</output></div></div>`;
  }
  private toggle(key: keyof GameSettingsConfig, label: string, description: string, value: boolean): string {
    return `<div class="row"><label for="setting-${key}">${label}<small>${description}</small></label><input id="setting-${key}" data-setting="${key}" type="checkbox" ${value ? 'checked' : ''}></div>`;
  }
  private content(c: Readonly<GameSettingsConfig>): string {
    if (this.tab === 'display') return `<h2>Make it look right.</h2><p class="intro">Tune image quality for your screen and hardware. Lower resolution scale improves performance.</p><div class="presets"><button data-quality="low">Performance</button><button data-quality="balanced">Balanced</button><button data-quality="high">Quality</button></div>${this.range('renderScale', 'Resolution scale', 'Internal render resolution', 0.5, 1.5, 0.05, c.renderScale)}${this.range('fieldOfView', 'Field of view', 'Camera viewing angle', 45, 100, 1, c.fieldOfView)}${this.range('exposure', 'Brightness / exposure', 'Scene exposure', 0.2, 2, 0.05, c.exposure)}${this.toggle('shadows', 'Dynamic shadows', 'Shadows cast by scene lights', c.shadows)}${this.toggle('bloom', 'Bloom', 'Glow around bright surfaces', c.bloom)}${this.toggle('ambientOcclusion', 'Ambient occlusion', 'Soft shading around contact points', c.ambientOcclusion)}`;
    if (this.tab === 'audio') return `<h2>Find your balance.</h2><p class="intro">Adjust the mix without changing individual sounds in your scene.</p>${this.range('masterVolume', 'Master volume', 'All game audio', 0, 1, 0.05, c.masterVolume)}${this.range('musicVolume', 'Music', 'Music bus', 0, 1, 0.05, c.musicVolume)}${this.range('sfxVolume', 'Sound effects', 'Gameplay and world sounds', 0, 1, 0.05, c.sfxVolume)}`;
    if (this.tab === 'controls') return `<h2>Your way to play.</h2><p class="intro">Fine-tune mouse look. Custom action bindings remain available through the engine’s input system.</p>${this.range('mouseSensitivity', 'Mouse sensitivity', 'Camera turn speed', 0.0005, 0.01, 0.0005, c.mouseSensitivity)}${this.toggle('invertY', 'Invert vertical look', 'Reverse mouse and controller Y look', c.invertY)}<div class="home-card"><p><span class="key">W A S D</span> Move</p><p style="margin-top:12px"><span class="key">ESC</span> Pause / resume</p></div>`;
    if (this.tab === 'objectives') return `<h2>${escape(this.features.objectives.getConfig().title)}</h2><p class="intro">Keep track of what comes next.</p>${this.objectiveRows(this.features.objectives.items) || '<div class="empty">No objectives yet. Add them through the objective tracker module.</div>'}`;
    const session = this.features.session.getState();
    const ended = session.status === 'won' || session.status === 'lost';
    return `<h2>${ended ? session.status === 'won' ? 'Nicely done.' : 'Another try?' : 'Take a breather.'}</h2><p class="intro">${ended ? escape(session.message) : 'Your game is right where you left it. Adjust your settings, check your objectives, or jump back in.'}</p><div class="home-card"><div class="eyebrow">${session.status === 'idle' ? 'READY WHEN YOU ARE' : escape(this.features.session.getConfig().title)}</div>${session.status === 'idle' ? '<strong>On your terms.</strong><small>Nothing moves until you return.</small>' : `<div class="home-grid"><div><strong>${session.score}</strong><small>Score</small></div><div><strong>${clock(session.elapsed)}</strong><small>Time played</small></div></div>`}</div>${ended ? '<button data-action="new-session">Start a new round</button><p class="intro">Resets round score and timer. Scene reset is controlled by your game.</p>' : '<p class="muted">Press Escape to resume.</p>'}`;
  }

  private readonly onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    event.stopPropagation();
    if (button.dataset.tab) { this.tab = button.dataset.tab as Tab; this.renderMenu(); this.root?.querySelector<HTMLButtonElement>(`[data-tab="${this.tab}"]`)?.focus(); }
    if (button.dataset.action === 'resume') this.features.pause.resume();
    if (button.dataset.action === 'new-session') this.features.session.start();
    if (button.dataset.action === 'reset') { this.features.settings.reset(); this.renderMenu(); this.root?.querySelector<HTMLElement>('[data-action="reset"]')?.focus(); }
    if (button.dataset.quality) { this.features.settings.applyQuality(button.dataset.quality as 'low'); this.renderMenu(); this.root?.querySelector<HTMLElement>(`[data-quality="${button.dataset.quality}"]`)?.focus(); }
    if (button.dataset.dismiss) { this.features.notifications.dismiss(Number(button.dataset.dismiss)); this.update(); }
  };
  private readonly onInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.setting) return;
    event.stopPropagation();
    this.features.settings.setPreferences({ [input.dataset.setting]: input.type === 'checkbox' ? input.checked : Number(input.value) });
    const output = input.parentElement?.querySelector('output');
    if (output) output.textContent = input.value;
  };
  private readonly onKey = (event: KeyboardEvent) => {
    if (!this.wasOpen) return;
    event.stopPropagation();
    if (event.key !== 'Tab' || !this.root) return;
    const controls = [...this.root.querySelectorAll<HTMLElement>('.modal button, .modal input')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && this.root.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && this.root.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  dispose(): void {
    for (const off of this.off) off();
    this.off = [];
    this.host?.remove();
    this.host = null;
    this.root = null;
  }
}
