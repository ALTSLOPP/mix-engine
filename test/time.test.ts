import { describe, it, expect } from 'vitest';
import { Time } from '../src/engine/Time';

const MS = (seconds: number) => seconds * 1000;

describe('Time', () => {
  it('reports zero dt on the very first update (no prior timestamp)', () => {
    const t = new Time();
    t.update(1234);
    expect(t.dt).toBe(0);
  });

  it('clamps an enormous frame delta to MAX_FRAME_TIME', () => {
    const t = new Time();
    t.update(0);
    t.update(MS(10)); // 10s wall-clock spike
    expect(t.dt).toBe(Time.MAX_FRAME_TIME);
  });

  it('clamps a negative delta (clock skew / tab restore) to zero', () => {
    const t = new Time();
    t.update(1000);
    t.update(500); // time went backwards
    expect(t.dt).toBe(0);
    t.update(1016);
    expect(t.dt).toBeCloseTo(0.016, 6);
  });

  it('applies the global time scale to dt', () => {
    const t = new Time();
    t.setTimeScale(0.5);
    t.update(0);
    t.update(MS(0.1));
    expect(t.dt).toBeCloseTo(0.05, 6);
  });

  it('exposes an independent wall-clock delta for unscaled systems', () => {
    const t = new Time();
    t.setTimeScale(0.25);
    t.update(0);
    t.update(MS(0.1));
    expect(t.dt).toBeCloseTo(0.025, 6);
    expect(t.wallClockDt).toBeCloseTo(0.1, 6);
  });

  it('clamps the time scale to its [MIN, MAX] range', () => {
    const t = new Time();
    t.setTimeScale(100);
    expect(t.timeScale).toBe(4);
    t.setTimeScale(-5);
    expect(t.timeScale).toBe(0);
  });

  it('caps fixed substeps at MAX_SUBSTEPS and returns a fractional keep-ratio for dropped debt', () => {
    const t = new Time();
    t.update(0);
    // 6.5 fixed steps owed in one frame → 5 taken, 1.5 left over (debt dropped).
    t.update(MS((6.5 / 60)));
    let steps = 0;
    while (t.shouldStepPhysics()) {
      t.consumeFixedStep();
      steps++;
    }
    expect(steps).toBe(Time.MAX_SUBSTEPS); // 5
    const keepRatio = t.computeAlpha();
    // remainder = 1.5 steps % 1 step = 0.5 step; keepRatio = 0.5 / 1.5 = 1/3.
    expect(keepRatio).toBeCloseTo(1 / 3, 5);
    expect(t.alpha).toBeGreaterThanOrEqual(0);
    expect(t.alpha).toBeLessThanOrEqual(1);
  });

  it('keeps the full ratio (1) when physics is not saturated', () => {
    const t = new Time();
    t.update(0);
    t.update(MS(2 / 60)); // 2 steps owed — well under the cap
    while (t.shouldStepPhysics()) t.consumeFixedStep();
    expect(t.computeAlpha()).toBe(1);
  });
});
