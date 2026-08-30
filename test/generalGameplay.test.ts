// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameplayFeatureManager } from '../src/features/gameplay/GameplayFeatureManager';
import { createMockEngine } from './helpers/gameplayEngine';
import { register } from '../src/ai/commands/FeatureCommands';
import { ScriptComponent } from '../src/ecs/ScriptComponent';
import { PersistentGameState } from '../src/ecs/PersistentGameState';

let engine: any;
let features: GameplayFeatureManager;
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: vi.fn((key: string) => storage.get(key) ?? null), setItem: vi.fn((key: string, value: string) => storage.set(key, value)), clear: () => storage.clear() });
  engine = createMockEngine();
  engine.input = { mode: 'play', resetInput: vi.fn(), exitPointerLock: vi.fn() };
  engine.viewport.setRenderScale = vi.fn();
  engine.viewport.renderer.shadowMap = { enabled: true };
  engine.viewport.pipeline = { bloomPass: { enabled: true }, setAmbientOcclusion: vi.fn() };
  engine.audio.setMasterVolume = vi.fn();
  engine.audio.setBusVolume = vi.fn();
  features = engine.gameplayFeatures = new GameplayFeatureManager(engine);
});
afterEach(() => { features?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('general gameplay modules', () => {
  it('pauses on Escape only in play mode, clears held input, and resumes when disabled', () => {
    engine.input.mode = 'editor';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(features.pause.isPaused).toBe(false);
    engine.input.mode = 'play';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(features.pause.isPaused).toBe(true);
    expect(engine.input.resetInput).toHaveBeenCalledOnce();
    expect(engine.input.exitPointerLock).toHaveBeenCalledOnce();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', repeat: true }));
    expect(features.pause.isPaused).toBe(true);
    features.disableFeature('pause_menu');
    expect(features.pause.isPaused).toBe(false);
  });

  it('freezes gameplay updates while notification timers keep running', () => {
    features.session.start();
    const update = vi.spyOn(features.hitboxes, 'update');
    features.notifications.show('Message', 'info', 1);
    features.pause.pause();
    features.update(1);
    features.updateRealtime(1);
    expect(update).not.toHaveBeenCalled();
    expect(features.session.getState().elapsed).toBe(0);
    expect(features.notifications.items).toHaveLength(0);
    features.pause.resume();
    features.update(0.1);
    expect(features.session.getState().elapsed).toBe(0.1);
    expect(update).toHaveBeenCalledOnce();
  });

  it('applies validated graphics, audio and input preferences to the real service interfaces', () => {
    features.settings.setPreferences({ fieldOfView: 85, renderScale: 999, exposure: NaN, shadows: false, bloom: false, ambientOcclusion: false, masterVolume: 0.4, musicVolume: 0.2, sfxVolume: 0.6, mouseSensitivity: 0.005, invertY: true });
    expect(engine.viewport.camera.fov).toBe(85);
    expect(engine.viewport.setRenderScale).toHaveBeenLastCalledWith(1.5);
    expect(engine.viewport.renderer.toneMappingExposure).toBe(0.6);
    expect(engine.viewport.renderer.shadowMap.enabled).toBe(false);
    expect(engine.viewport.pipeline.bloomPass.enabled).toBe(false);
    expect(engine.viewport.pipeline.setAmbientOcclusion).toHaveBeenLastCalledWith(false);
    expect(engine.audio.setMasterVolume).toHaveBeenLastCalledWith(0.4);
    expect(engine.audio.setBusVolume).toHaveBeenCalledWith('music', 0.2);
    expect(engine.audio.setBusVolume).toHaveBeenCalledWith('sfx', 0.6);
    expect(engine.player.mouseSensitivity).toBe(0.005);
    expect(engine.player.invertY).toBe(true);
  });

  it('keeps saved player preferences when loading a project with different authored defaults', () => {
    features.settings.setPreferences({ fieldOfView: 90 });
    features.fromJSON({ game_settings: { fieldOfView: 60 } });
    expect(features.settings.getConfig().fieldOfView).toBe(90);
    expect(engine.viewport.camera.fov).toBe(90);
    features.settings.setConfig({ persist: false, fieldOfView: 65 });
    features.settings.initialize();
    expect(engine.viewport.camera.fov).toBe(65);
  });

  it('survives inaccessible preference storage', () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error('denied'); });
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('quota'); });
    expect(() => features.settings.initialize()).not.toThrow();
    expect(() => features.settings.setPreferences({ exposure: 1 })).not.toThrow();
    expect(engine.viewport.renderer.toneMappingExposure).toBe(1);
  });

  it('never lets stored preferences re-enable a disabled feature', () => {
    features.settings.setPreferences({ fieldOfView: 90 });
    features.fromJSON({ activeFeatures: ['pause_menu'] });
    expect(features.settings.getConfig().enabled).toBe(false);
    expect(features.isFeatureEnabled('game_settings')).toBe(false);
  });

  it('completes objectives once, clamps progress, and produces a bounded notification', () => {
    const completed = vi.fn();
    engine.sceneManager.events.on('objective_completed', completed);
    expect(features.objectives.add({ id: 'coins', title: 'Find coins', target: 3 })).toBe(true);
    expect(features.objectives.add({ id: 'coins', title: 'Duplicate', target: 2 })).toBe(false);
    expect(features.objectives.advance('coins', NaN)).toBe(false);
    features.objectives.advance('coins', 100);
    expect(features.objectives.items[0]).toMatchObject({ progress: 3, completed: true });
    expect(features.objectives.advance('coins')).toBe(false);
    expect(completed).toHaveBeenCalledOnce();
    expect(features.notifications.items[0].message).toContain('Find coins');
    for (let i = 0; i < 10; i++) features.notifications.show(String(i));
    expect(features.notifications.items.map(n => n.message)).toEqual(['7', '8', '9']);
  });

  it('wins at the target score, loses at the time limit, and restarts without destroying the scene', () => {
    const ended = vi.fn();
    engine.sceneManager.events.on('session_ended', ended);
    features.session.setConfig({ targetScore: 5, duration: 10 });
    features.session.start();
    features.session.addScore(5);
    expect(features.session.getState().status).toBe('won');
    expect(features.pause.isPaused).toBe(true);
    expect(features.session.finish('lost')).toBe(false);
    expect(ended).toHaveBeenCalledOnce();
    features.session.start();
    expect(features.pause.isPaused).toBe(false);
    expect(features.session.getState().score).toBe(0);
    features.session.update(11);
    expect(features.session.getState()).toMatchObject({ status: 'lost', remaining: 0 });
    expect(engine._entities.has(1)).toBe(true);
  });

  it('registers executable authoring commands for objectives, score, settings, pause and status', () => {
    const map = new Map(); const setQueryResult = vi.fn();
    register(map, { gameplayFeatures: features, input: engine.input, setQueryResult } as any);
    const run = (type: string, payload = {}) => map.get(type)({ type, ...payload });
    expect(run('objective_add', { id: 'goal', title: 'Reach exit', target: 1 }).ok).toBe(true);
    expect(run('objective_advance', { id: 'goal', amount: 1 }).ok).toBe(true);
    run('session_start'); run('session_add_score', { amount: 20 });
    run('game_settings_set', { settings: { fieldOfView: 70 } });
    run('game_pause');
    expect(run('game_essentials_status')).toMatchObject({ paused: true, session: { score: 20 }, settings: { fieldOfView: 70 } });
    expect(run('game_resume').paused).toBe(false);
    expect(setQueryResult).toHaveBeenCalled();
  });

  it('exposes modular services to actual entity scripts without browser globals', () => {
    engine.sceneManager.gameState = new PersistentGameState();
    engine.sceneManager.gameplayFeatures = features;
    const script = new ScriptComponent(1, engine.sceneManager, `if (api.firstRun) { api.gameplay.objectives.add({id:'script',title:'Script goal',target:2}); api.gameplay.session.start(); } api.gameplay.session.addScore(1);`);
    expect(script.compileError).toBeNull();
    script.update(0.1); script.update(0.1);
    expect(features.objectives.items[0].id).toBe('script');
    expect(features.session.getState().score).toBe(2);
    script.dispose();
  });

  it('round-trips all five module configurations without persisting live round progress', () => {
    features.settings.setConfig({ persist: false });
    features.objectives.setConfig({ objectives: [{ id: 'seed', title: 'Seed goal', target: 2 }] });
    features.objectives.advance('seed');
    features.pause.setConfig({ title: 'Prototype' });
    const saved: any = features.toJSON();
    saved.objective_tracker.objectives[0].title = 'Restored';
    expect(features.objectives.items[0].title).toBe('Seed goal');
    features.fromJSON(saved);
    expect(features.objectives.items[0]).toMatchObject({ title: 'Restored', progress: 0 });
    expect(features.pause.getConfig().title).toBe('Prototype');
    expect(features.toJSON().activeFeatures).toEqual(saved.activeFeatures);
    expect(features.isFeatureEnabled('zombie_horde_ai')).toBe(false);
  });
});

describe('pause menu DOM', () => {
  const root = () => document.querySelector('#mix-general-gameplay')!.shadowRoot!;
  const click = (selector: string) => root().querySelector<HTMLButtonElement>(selector)!.click();
  it('opens an accessible dialog, switches pages, changes live settings, and resumes', () => {
    features.pause.pause();
    expect(root().querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(root().activeElement).toBe(root().querySelector('[data-action="resume"]'));
    click('[data-tab="display"]');
    const fov = root().querySelector<HTMLInputElement>('#setting-fieldOfView')!;
    fov.value = '80'; fov.dispatchEvent(new Event('input', { bubbles: true }));
    expect(engine.viewport.camera.fov).toBe(80);
    expect(fov.parentElement!.querySelector('output')!.textContent).toBe('80');
    click('[data-quality="low"]');
    expect(engine.viewport.renderer.shadowMap.enabled).toBe(false);
    click('[data-tab="audio"]');
    expect(root().querySelector('#setting-masterVolume')).not.toBeNull();
    click('[data-action="resume"]');
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('escapes authored labels and traps keyboard focus inside the menu', () => {
    features.pause.setConfig({ title: '<img src=x onerror=alert(1)>' });
    features.objectives.add({ id: 'html', title: '<script>bad()</script>', target: 1 });
    features.pause.pause();
    click('[data-tab="objectives"]');
    expect(root().querySelector('img,script')).toBeNull();
    expect(root().textContent).toContain('<script>bad()</script>');
    const first = root().querySelector<HTMLButtonElement>('[data-action="resume"]')!;
    first.focus(); first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(root().activeElement).toBe(root().querySelector('[data-tab="objectives"]'));
  });

  it('hides in editor mode and releases all UI/listeners on disposal', () => {
    features.pause.pause();
    engine.input.mode = 'editor'; features.updateRealtime(0.1);
    expect(features.pause.isPaused).toBe(false);
    expect((document.querySelector('#mix-general-gameplay') as HTMLElement).hidden).toBe(true);
    features.dispose();
    expect(document.querySelector('#mix-general-gameplay')).toBeNull();
    engine.input.mode = 'play';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(features.pause.isPaused).toBe(false);
  });

  it('removes settings pages immediately when their module is disabled while paused', () => {
    features.pause.pause(); click('[data-tab="display"]');
    features.disableFeature('game_settings'); features.updateRealtime(0.01);
    expect(root().querySelector('[data-tab="display"]')).toBeNull();
    expect(root().querySelector('#setting-fieldOfView')).toBeNull();
    expect(root().querySelector('[role="dialog"]')).not.toBeNull();
  });
});
