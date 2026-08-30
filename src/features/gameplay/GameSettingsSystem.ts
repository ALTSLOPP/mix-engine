import type { Engine } from '../../engine/Engine';
import { finiteRange, type GameSettingsConfig } from './GeneralFeatureTypes';

export class GameSettingsSystem {
  private config: GameSettingsConfig;
  private readonly defaults: GameSettingsConfig;
  private initialized = false;
  constructor(private readonly engine: Engine, config: GameSettingsConfig) {
    this.defaults = { ...config };
    this.config = { ...config };
  }
  getConfig(): Readonly<GameSettingsConfig> { return this.config; }
  private storageKey(): string {
    return `${this.config.storageKey}:${typeof location !== 'undefined' ? location.pathname : 'game'}`;
  }
  initialize(): void {
    this.initialized = true;
    if (this.config.persist) {
      try {
        const saved = JSON.parse(localStorage.getItem(this.storageKey()) ?? 'null');
        if (saved && typeof saved === 'object' && saved.version === 1 && saved.settings && typeof saved.settings === 'object') {
          const { enabled, persist, storageKey, ...preferences } = saved.settings;
          this.configure(preferences, false);
        }
      } catch { /* unavailable storage or invalid data must never stop a game */ }
    }
    this.apply();
  }
  /** Authored defaults never overwrite the player's saved preferences. */
  setConfig(config: Partial<GameSettingsConfig>): void { this.configure(config, false); }
  setPreferences(config: Partial<GameSettingsConfig>): void { this.configure(config, true); }
  private configure(patch: Partial<GameSettingsConfig>, save: boolean): void {
    if (!patch || typeof patch !== 'object') return;
    const next = { ...this.config };
    const ranges: Record<string, [number, number]> = {
      renderScale: [0.5, 1.5], exposure: [0.2, 2], fieldOfView: [45, 100],
      masterVolume: [0, 1], musicVolume: [0, 1], sfxVolume: [0, 1], mouseSensitivity: [0.0005, 0.01],
    };
    for (const [key, [min, max]] of Object.entries(ranges)) {
      (next as any)[key] = finiteRange((patch as any)[key], (next as any)[key], min, max);
    }
    for (const key of ['enabled', 'persist', 'shadows', 'bloom', 'ambientOcclusion', 'invertY'] as const) {
      if (typeof patch[key] === 'boolean') next[key] = patch[key];
    }
    if (typeof patch.storageKey === 'string' && patch.storageKey.trim()) next.storageKey = patch.storageKey;
    this.config = next;
    // Enabling/disabling from manager initialization should not reset an authored viewport.
    if (this.initialized || Object.keys(patch).some(key => key !== 'enabled')) this.apply();
    if (save && this.config.persist && Object.keys(patch).some(key => key !== 'enabled')) {
      const { enabled, persist, storageKey, ...preferences } = this.config;
      try { localStorage.setItem(this.storageKey(), JSON.stringify({ version: 1, settings: preferences })); } catch { /* private mode/quota */ }
    }
    this.engine.sceneManager.events.emit('game_settings_changed', { settings: { ...this.config } });
  }
  apply(): void {
    if (!this.config.enabled) return;
    const c = this.config;
    const viewport = this.engine.viewport;
    viewport.setRenderScale?.(c.renderScale);
    viewport.renderer.toneMappingExposure = c.exposure;
    if (viewport.renderer.shadowMap) { viewport.renderer.shadowMap.enabled = c.shadows; viewport.renderer.shadowMap.needsUpdate = true; }
    viewport.camera.fov = c.fieldOfView;
    viewport.camera.updateProjectionMatrix();
    if (viewport.pipeline?.bloomPass) viewport.pipeline.bloomPass.enabled = c.bloom;
    viewport.pipeline?.setAmbientOcclusion?.(c.ambientOcclusion);
    this.engine.audio.setMasterVolume?.(c.masterVolume);
    this.engine.audio.setBusVolume?.('music', c.musicVolume);
    this.engine.audio.setBusVolume?.('sfx', c.sfxVolume);
    if (this.engine.player) { this.engine.player.mouseSensitivity = c.mouseSensitivity; this.engine.player.invertY = c.invertY; }
  }
  reset(): void { this.setPreferences({ ...this.defaults, enabled: this.config.enabled, storageKey: this.config.storageKey, persist: this.config.persist }); }
  applyQuality(preset: 'low' | 'balanced' | 'high'): void {
    const presets = {
      low: { renderScale: 0.65, shadows: false, bloom: false, ambientOcclusion: false },
      balanced: { renderScale: 1, shadows: true, bloom: true, ambientOcclusion: true },
      high: { renderScale: 1.25, shadows: true, bloom: true, ambientOcclusion: true },
    };
    if (presets[preset]) this.setPreferences(presets[preset]);
  }
}
