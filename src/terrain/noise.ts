import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fractional Brownian motion in [-1,1] (approx). freq in cycles/metre. */
export function makeFbm(seed: number, octaves = 5, lacunarity = 2, gain = 0.5) {
  const simplex = new SimplexNoise({ random: mulberry32(seed) });
  return (x: number, z: number, baseFreq: number): number => {
    let amp = 1, freq = baseFreq, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * simplex.noise(x * freq, z * freq);
      norm += amp; amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  };
}
