// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { GameSettingsSystem } from '../src/features/gameplay/GameSettingsSystem';
import { generalFeatureDescriptors } from '../src/features/gameplay/GeneralFeatureDescriptors';
import { installGraphicsSettings } from '../src/editor/graphicsSettings';
import { createMockEngine } from './helpers/gameplayEngine';

function setup() {
  const engine = createMockEngine() as any;
  engine.viewport.setResolutionSettings = vi.fn();
  const defaults = generalFeatureDescriptors.find(d => d.id === 'game_settings')!.defaultConfig;
  const settings = new GameSettingsSystem(engine, { ...defaults, persist: false });
  engine.gameplayFeatures = { settings };
  settings.initialize();
  return { engine, settings };
}

describe('FSR player and editor preferences', () => {
  it('starts in low-spec mode, validates new fields and preserves FSR-off resolutions', () => {
    const { engine, settings } = setup();
    expect(engine.viewport.setResolutionSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      fsrEnabled: true, internalHeight: 540, outputHeight: 900, shadows: false, bloom: false, ambientOcclusion: false,
    }));
    settings.setPreferences({ fsrEnabled: false, fsrSharpness: 999, outputHeight: NaN });
    expect(settings.getConfig()).toMatchObject({ fsrEnabled: false, fsrSharpness: 1, internalHeight: 540, outputHeight: 900 });
    settings.applyQuality('high');
    expect(settings.getConfig()).toMatchObject({ fsrEnabled: false, internalHeight: 0, outputHeight: 0, renderScale: 1 });
    settings.reset();
    expect(settings.getConfig()).toMatchObject({ fsrEnabled: true, internalHeight: 540, outputHeight: 900 });
  });
  it('restores FSR and resolution preferences across a new session', () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) });
    try {
      const { settings } = setup();
      settings.setPreferences({ persist: true, fsrEnabled: false, internalHeight: 600, outputHeight: 1080, fsrSharpness: 0.75 });
      const next = setup().settings;
      next.setConfig({ persist: true });
      next.initialize();
      expect(next.getConfig()).toMatchObject({ fsrEnabled: false, internalHeight: 600, outputHeight: 1080, fsrSharpness: 0.75 });
    } finally { vi.unstubAllGlobals(); }
  });
  it('applies editor toggles, resolution selects, automatic scale, and low-spec reset', () => {
    const { engine, settings } = setup();
    const modal = document.createElement('div');
    modal.innerHTML = '<div class="modal-body"></div>';
    installGraphicsSettings(engine, modal);
    const fsr = modal.querySelector<HTMLInputElement>('[data-setting="fsrEnabled"]')!;
    fsr.checked = false; fsr.dispatchEvent(new Event('input', { bubbles: true }));
    expect(settings.getConfig().fsrEnabled).toBe(false);
    const internal = modal.querySelector<HTMLSelectElement>('[data-setting="internalHeight"]')!;
    internal.value = '0'; internal.dispatchEvent(new Event('input', { bubbles: true }));
    const scale = modal.querySelector<HTMLInputElement>('[data-setting="renderScale"]')!;
    expect(scale.disabled).toBe(false);
    scale.value = '0.75'; scale.dispatchEvent(new Event('input', { bubbles: true }));
    expect(settings.getConfig()).toMatchObject({ renderScale: 0.75, internalHeight: 0 });
    modal.querySelector<HTMLButtonElement>('[data-quality="low"]')!.click();
    expect(settings.getConfig()).toMatchObject({ fsrEnabled: true, internalHeight: 540, outputHeight: 900 });
  });
});
