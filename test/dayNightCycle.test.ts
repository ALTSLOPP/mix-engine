import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  DayNightCycle, elevationDeg, daylight01, sunDirForHour,
  sunColorForHour, sunIntensityForHour, fogColorForHour,
} from '../src/rendering/DayNightCycle';

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('DayNightCycle time→value helpers', () => {
  it('puts the sun overhead at noon and below the horizon at midnight', () => {
    expect(elevationDeg(12)).toBeCloseTo(55, 5);
    expect(elevationDeg(0)).toBeCloseTo(-55, 5);
    expect(sunDirForHour(12).y).toBeGreaterThan(0);   // above horizon
    expect(sunDirForHour(0).y).toBeLessThan(0);        // below horizon
  });

  it('daylight ramps from 0 at night to 1 at midday', () => {
    expect(daylight01(0)).toBe(0);
    expect(daylight01(12)).toBe(1);
    expect(daylight01(6)).toBeGreaterThan(0);          // dawn: partial
    expect(daylight01(6)).toBeLessThan(1);
  });

  it('sun is brightest + whitest at noon, dim at night', () => {
    expect(sunIntensityForHour(12)).toBeGreaterThan(sunIntensityForHour(0));
    expect(sunIntensityForHour(0)).toBeLessThan(0.2);  // moonlight floor only
    expect(lum(sunColorForHour(12))).toBeGreaterThan(lum(sunColorForHour(0)));
    // Fog darkens at night.
    expect(lum(fogColorForHour(12))).toBeGreaterThan(lum(fogColorForHour(0)));
  });

  it('sun colour warms (more red than blue) near the horizon', () => {
    const dusk = sunColorForHour(7); // low sun
    expect(dusk.r).toBeGreaterThan(dusk.b);
  });
});

function mockDeps() {
  return {
    setShadowSunDirection: vi.fn(),
    bakeSky: vi.fn(),
    setSunColor: vi.fn(),
    setSunIntensity: vi.fn(),
    setFogColor: vi.fn(),
  };
}

describe('DayNightCycle class', () => {
  it('does nothing while disabled', () => {
    const deps = mockDeps();
    const c = new DayNightCycle(deps);
    c.update(1);
    expect(deps.setShadowSunDirection).not.toHaveBeenCalled();
    expect(deps.bakeSky).not.toHaveBeenCalled();
  });

  it('snaps the world (incl. a sky bake) the moment it is enabled', () => {
    const deps = mockDeps();
    const c = new DayNightCycle(deps);
    c.setEnabled(true);
    expect(deps.setShadowSunDirection).toHaveBeenCalledTimes(1);
    expect(deps.setSunColor).toHaveBeenCalledTimes(1);
    expect(deps.setSunIntensity).toHaveBeenCalledTimes(1);
    expect(deps.bakeSky).toHaveBeenCalledTimes(1); // forced on enable
  });

  it('advances + wraps the clock and pushes cheap state every frame', () => {
    const deps = mockDeps();
    const c = new DayNightCycle(deps);
    c.setEnabled(true);
    c.speed = 1; // 1 clock-hour per second
    c.hour = 23.5;
    c.update(1); // → 0.5, wrapping past midnight
    expect(c.hour).toBeCloseTo(0.5, 5);
    // setShadowSunDirection / colours updated again this frame (>= the enable call).
    expect(deps.setShadowSunDirection.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('throttles the expensive sky bake to large sun movements, not every frame', () => {
    const deps = mockDeps();
    const c = new DayNightCycle(deps);
    c.bakeStepDeg = 3;
    c.setEnabled(true);          // bake #1 (forced)
    const afterEnable = deps.bakeSky.mock.calls.length;
    c.speed = 0.001;             // sun barely moves
    for (let i = 0; i < 30; i++) c.update(0.016); // ~0.5s of tiny movement
    // No (or at most a negligible) extra bake despite 30 frames of updates.
    expect(deps.bakeSky.mock.calls.length).toBeLessThanOrEqual(afterEnable + 1);
    // ...but the cheap per-frame work ran on every one of those frames.
    expect(deps.setSunIntensity.mock.calls.length).toBeGreaterThanOrEqual(30);
  });

  it('setHour applies immediately and normalizes out-of-range hours', () => {
    const deps = mockDeps();
    const c = new DayNightCycle(deps);
    c.setHour(26);               // → 2
    expect(c.hour).toBeCloseTo(2, 5);
    expect(deps.bakeSky).toHaveBeenCalled(); // applied now even though not "enabled"/animating
  });
});
