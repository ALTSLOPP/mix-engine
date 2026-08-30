import { describe, it, expect } from 'vitest';
import {
  gerstnerHeight, gerstnerDisplace, maxAmplitude, defaultWaves, GRAVITY, type GerstnerWave,
} from '../src/water/gerstner';

const flat: GerstnerWave[] = []; // no waves

describe('gerstner wave math', () => {
  it('a still surface (no waves) has height 0 everywhere', () => {
    expect(gerstnerHeight(0, 0, 0, flat)).toBe(0);
    expect(gerstnerHeight(37, -12, 4.5, flat)).toBe(0);
  });

  it('height stays within the summed amplitude envelope', () => {
    const waves = defaultWaves(1, 0.6);
    const amp = maxAmplitude(waves);
    for (let i = 0; i < 50; i++) {
      const h = gerstnerHeight(i * 3.1, i * -1.7, i * 0.2, waves);
      expect(Math.abs(h)).toBeLessThanOrEqual(amp + 1e-6);
    }
  });

  it('is deterministic and varies across space + time', () => {
    const waves = defaultWaves(1, 0.6);
    expect(gerstnerHeight(10, 20, 1, waves)).toBe(gerstnerHeight(10, 20, 1, waves));
    expect(gerstnerHeight(10, 20, 1, waves)).not.toBe(gerstnerHeight(11, 20, 1, waves));
    expect(gerstnerHeight(10, 20, 1, waves)).not.toBe(gerstnerHeight(10, 20, 2, waves));
  });

  it('a single wave is periodic in time (period = 2π/omega)', () => {
    const w: GerstnerWave = { dirX: 1, dirZ: 0, steepness: 0.5, wavelength: 20, speed: 1, amplitude: 1 };
    const k = (2 * Math.PI) / w.wavelength;
    const omega = w.speed * Math.sqrt(GRAVITY * k);
    const T = (2 * Math.PI) / omega;
    const a = gerstnerHeight(5, 0, 0.3, [w]);
    const b = gerstnerHeight(5, 0, 0.3 + T, [w]);
    expect(b).toBeCloseTo(a, 5);
  });

  it('displacement pinches horizontally toward crests and returns finite values', () => {
    const waves = defaultWaves(1, 0.8);
    const d = gerstnerDisplace(12, -8, 2.0, waves);
    expect(Number.isFinite(d.x)).toBe(true);
    expect(Number.isFinite(d.y)).toBe(true);
    expect(Number.isFinite(d.z)).toBe(true);
    // y matches the height sampler exactly (same phase formula).
    expect(d.y).toBeCloseTo(gerstnerHeight(12, -8, 2.0, waves), 10);
    // zero steepness ⇒ no horizontal pinch.
    const noPinch = waves.map((w) => ({ ...w, steepness: 0 }));
    const d2 = gerstnerDisplace(12, -8, 2.0, noPinch);
    expect(d2.x).toBeCloseTo(12, 10);
    expect(d2.z).toBeCloseTo(-8, 10);
  });
});

describe('defaultWaves', () => {
  it('produces a 4-wave spread that scales wavelength + amplitude', () => {
    const a = defaultWaves(1, 0.6);
    const b = defaultWaves(2, 0.6);
    expect(a).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(b[i].wavelength).toBeCloseTo(a[i].wavelength * 2, 6);
      expect(b[i].amplitude).toBeCloseTo(a[i].amplitude * 2, 6);
    }
    // Anti-looping invariant: each wave must satisfy steepness·amplitude·k ≤ 1 (else the
    // trochoid self-intersects into looping crests). Holds even at full choppiness.
    for (const w of defaultWaves(1, 1)) {
      const k = (2 * Math.PI) / w.wavelength;
      expect(w.steepness * w.amplitude * k).toBeLessThanOrEqual(1);
    }
  });
});
