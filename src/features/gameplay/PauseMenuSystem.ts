import type { Engine } from '../../engine/Engine';
import type { PauseMenuConfig } from './GeneralFeatureTypes';

/** Owns pause state without modifying any slow-motion or hitstop settings. */
export class PauseMenuSystem {
  private config: PauseMenuConfig;
  private paused = false;
  private reason = 'manual';
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.code !== 'Escape' || event.repeat || !this.config.enabled || this.engine.input?.mode !== 'play') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.toggle();
  };
  private readonly onHidden = () => {
    if (typeof document !== 'undefined' && document.hidden && this.config.pauseOnFocusLoss && this.engine.input?.mode === 'play') this.pause('focus');
  };

  constructor(private readonly engine: Engine, config: PauseMenuConfig) {
    this.config = { ...config };
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKey, true);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onHidden);
  }
  get isPaused(): boolean { return this.paused; }
  get pauseReason(): string { return this.reason; }
  getConfig(): Readonly<PauseMenuConfig> { return this.config; }
  setConfig(config: Partial<PauseMenuConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) this.resume();
  }
  pause(reason = 'manual'): boolean {
    if (!this.config.enabled || this.paused) return false;
    this.paused = true;
    this.reason = reason;
    this.engine.input?.resetInput?.();
    this.engine.input?.exitPointerLock?.();
    this.engine.gameplayFeatures?.loadout.closeWheel();
    this.engine.gameplayFeatures?.ranged.setAiming(false);
    this.engine.sceneManager.events.emit('game_paused', { reason });
    return true;
  }
  resume(): boolean {
    if (!this.paused) return false;
    this.paused = false;
    this.engine.input?.resetInput?.();
    this.engine.sceneManager.events.emit('game_resumed', {});
    return true;
  }
  toggle(): boolean { if (this.paused) this.resume(); else this.pause(); return this.paused; }
  update(): void { if (this.paused && this.engine.input?.mode === 'editor') this.resume(); }
  dispose(): void {
    this.resume();
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey, true);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onHidden);
  }
}
