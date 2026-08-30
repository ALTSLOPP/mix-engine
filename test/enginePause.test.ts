import { expect, it, vi } from 'vitest';
import { Engine } from '../src/engine/Engine';
import { Time } from '../src/engine/Time';
import { TimeDilationManager } from '../src/playback/TimeDilationManager';

it('the actual Engine frame keeps rendering/commands alive while skipping every simulation service', () => {
  const engine = Object.create(Engine.prototype) as any;
  engine.time = new Time();
  engine.timeDilation = new TimeDilationManager();
  const slowMotion = vi.spyOn(engine.timeDilation, 'update');
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  engine.profiler = { beginFrame: vi.fn(), endFrame: vi.fn() };
  engine.gameplayFeatures = { pause: { isPaused: true, update: vi.fn() }, updateRealtime: vi.fn() };
  engine.aiBridge = { processQueue: vi.fn() };
  engine.viewport = { render: vi.fn(), renderer: {}, scene: {} };
  engine.effects = { endFrame: vi.fn() };
  engine.input = { endFrame: vi.fn() };
  // Intentionally no physics, scripts, replay, animations or tween services:
  // touching any of them would throw and be caught by Engine's error handler.
  engine.runFrame(0); engine.runFrame(16); engine.runFrame(10016);
  expect(errors).not.toHaveBeenCalled();
  expect(engine.time.elapsed).toBe(0);
  expect(slowMotion).not.toHaveBeenCalled();
  expect(engine.viewport.render).toHaveBeenCalledTimes(3);
  expect(engine.aiBridge.processQueue).toHaveBeenCalledTimes(3);
  expect(engine.gameplayFeatures.updateRealtime).toHaveBeenCalledTimes(3);
  expect(engine.input.endFrame).toHaveBeenCalledTimes(3);
  engine.time.setTimeScale(1); engine.time.update(10032);
  expect(engine.time.dt).toBeCloseTo(0.016); // no catch-up after pause
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
