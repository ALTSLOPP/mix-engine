/**
 * gerstner.ts — PURE Gerstner (trochoidal) wave math, shared by the GPU water surface (vertex
 * displacement) and the CPU buoyancy sampler. Kept THREE-free so it's deterministic + Vitest-tested,
 * and so the EXACT same phase formula runs on the CPU (WaterSystem.sampleHeight) and in GLSL
 * (WaterMaterial) — otherwise a floating boat and the rendered crest would drift apart.
 *
 * Phase convention (mirror this verbatim in the shader): for a wave with unit direction d,
 *   k     = 2π / wavelength                       (wavenumber)
 *   omega = speed * sqrt(GRAVITY * k)             (angular frequency — deep-water dispersion)
 *   phase = k·(d·pos) − omega·t
 *   y     += amplitude·sin(phase)
 *   xz    += steepness·amplitude·d·cos(phase)     (horizontal pinch → sharper crests)
 */

export const GRAVITY = 9.81;

export interface GerstnerWave {
  dirX: number;
  dirZ: number;
  steepness: number;   // 0..1 (sum across waves should stay ≲ 1 to avoid looping crests)
  wavelength: number;  // metres between crests
  speed: number;       // multiplier on the physical phase speed
  amplitude: number;   // crest height in metres
}

function norm(dirX: number, dirZ: number): [number, number] {
  const d = Math.hypot(dirX, dirZ) || 1;
  return [dirX / d, dirZ / d];
}

/** Vertical surface height at world (x,z) and time t — the buoyancy/raycast sampler. */
export function gerstnerHeight(x: number, z: number, t: number, waves: GerstnerWave[]): number {
  let y = 0;
  for (const w of waves) {
    const k = (2 * Math.PI) / w.wavelength;
    const [dx, dz] = norm(w.dirX, w.dirZ);
    const omega = w.speed * Math.sqrt(GRAVITY * k);
    y += w.amplitude * Math.sin(k * (dx * x + dz * z) - omega * t);
  }
  return y;
}

/** Full 3D surface displacement of the rest-position (x,z) — matches the shader's vertex displace. */
export function gerstnerDisplace(
  x: number, z: number, t: number, waves: GerstnerWave[],
): { x: number; y: number; z: number } {
  let dispX = 0, dispY = 0, dispZ = 0;
  for (const w of waves) {
    const k = (2 * Math.PI) / w.wavelength;
    const [dx, dz] = norm(w.dirX, w.dirZ);
    const omega = w.speed * Math.sqrt(GRAVITY * k);
    const phase = k * (dx * x + dz * z) - omega * t;
    const c = Math.cos(phase), s = Math.sin(phase);
    dispX += w.steepness * w.amplitude * dx * c;
    dispZ += w.steepness * w.amplitude * dz * c;
    dispY += w.amplitude * s;
  }
  return { x: x + dispX, y: dispY, z: z + dispZ };
}

/** Sum of wave amplitudes — the maximum possible crest height (used to size bounds / tests). */
export function maxAmplitude(waves: GerstnerWave[]): number {
  return waves.reduce((s, w) => s + w.amplitude, 0);
}

/**
 * A spread of 4 waves (varied directions + wavelengths) for a believable open-ocean surface.
 * `scale` multiplies wavelength + amplitude (bigger = larger swells); `choppiness` ∈ [0,1] sets
 * crest sharpness. Deterministic — same inputs, same waves.
 */
export function defaultWaves(scale = 1, choppiness = 0.6): GerstnerWave[] {
  const dirs: [number, number][] = [[1, 0.15], [0.6, 0.8], [-0.4, 0.9], [-0.8, -0.3]];
  const base = [
    { wavelength: 64, amplitude: 1.2, speed: 1.0 },
    { wavelength: 31, amplitude: 0.6, speed: 1.1 },
    { wavelength: 17, amplitude: 0.3, speed: 1.25 },
    { wavelength: 9,  amplitude: 0.15, speed: 1.4 },
  ];
  return base.map((b, i) => ({
    dirX: dirs[i][0], dirZ: dirs[i][1],
    steepness: choppiness * (1 - i * 0.18),
    wavelength: b.wavelength * scale,
    amplitude: b.amplitude * scale,
    speed: b.speed,
  }));
}
