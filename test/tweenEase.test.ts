import { describe, it, expect } from 'vitest';
import { TweenEase } from '../src/tween/TweenEase';

describe('TweenEase — Mathematical Correctness & Easing Families', () => {
  const allEaseNames = TweenEase.allNames();

  it('provides all standard easing families', () => {
    expect(allEaseNames.length).toBeGreaterThanOrEqual(30);
    expect(allEaseNames).toContain('linear');
    expect(allEaseNames).toContain('cubicIn');
    expect(allEaseNames).toContain('cubicOut');
    expect(allEaseNames).toContain('cubicInOut');
    expect(allEaseNames).toContain('elasticOut');
    expect(allEaseNames).toContain('bounceOut');
  });

  it('guarantees exact endpoints f(0) === 0 and f(1) === 1 for standard eases', () => {
    for (const name of allEaseNames) {
      const fn = TweenEase.get(name);
      const val0 = fn(0);
      const val1 = fn(1);

      expect(val0, `${name}(0) should be 0`).toBeCloseTo(0, 5);
      expect(val1, `${name}(1) should be 1`).toBeCloseTo(1, 5);
    }
  });

  it('produces zero NaN or Infinite values across continuous interpolation [0, 1]', () => {
    for (const name of allEaseNames) {
      const fn = TweenEase.get(name);
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const val = fn(t);
        expect(Number.isFinite(val), `${name}(${t}) must be finite`).toBe(true);
        expect(Number.isNaN(val), `${name}(${t}) must not be NaN`).toBe(false);
      }
    }
  });

  it('supports custom cubic Bézier curves (e.g. CSS ease-in-out bezier)', () => {
    const bezierEase = TweenEase.cubicBezier(0.42, 0, 0.58, 1);
    expect(bezierEase(0)).toBe(0);
    expect(bezierEase(1)).toBe(1);
    expect(bezierEase(0.5)).toBeCloseTo(0.5, 2);

    // Monotonic increase
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = bezierEase(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('supports custom keyframe / animation curves', () => {
    const keyframes = [
      { t: 0, v: 0 },
      { t: 0.2, v: 0.8 },
      { t: 0.8, v: 0.2 },
      { t: 1.0, v: 1.0 },
    ];
    const curveEase = TweenEase.createKeyframeEase(keyframes);

    expect(curveEase(0)).toBe(0);
    expect(curveEase(0.2)).toBeCloseTo(0.8, 5);
    expect(curveEase(0.5)).toBeCloseTo(0.5, 2);
    expect(curveEase(0.8)).toBeCloseTo(0.2, 5);
    expect(curveEase(1.0)).toBe(1.0);
  });

  it('supports custom easing function registration', () => {
    const customEase = (t: number) => Math.pow(t, 6);
    TweenEase.register('superHyperIn', customEase);

    const resolved = TweenEase.get('superHyperIn');
    expect(resolved(0.5)).toBeCloseTo(Math.pow(0.5, 6), 5);
  });

  it('allows parameterized overshoots on Back eases', () => {
    const defaultBackOut = TweenEase.get('backOut');
    const highOvershootBackOut = TweenEase.get('backOut', { overshoot: 4.0 });

    const defPeak = defaultBackOut(0.7);
    const highPeak = highOvershootBackOut(0.7);

    expect(highPeak).toBeGreaterThan(defPeak);
  });
});
