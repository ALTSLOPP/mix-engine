import type { WeatherType } from '../environment/WeatherSystem';
import type { VisualStyleName } from '../features/VisualStyles';
import type { WorldGenOptions } from '../terrain/worldgen';

/** High-level, IDE-facing vocabulary for composing a complete world. */
export type WorldTheme =
  | 'temperate'
  | 'tropical'
  | 'desert'
  | 'arctic'
  | 'volcanic'
  | 'alpine'
  | 'coastal'
  | 'fantasy';

export type WorldLandform = 'continent' | 'island' | 'archipelago' | 'highlands' | 'valley' | 'plains';
export type WorldMood = 'bright' | 'cinematic' | 'moody' | 'stormy' | 'dreamlike';
export type WorldQuality = 'draft' | 'balanced' | 'aaa';
export type WorldPathKind = 'road' | 'trail' | 'river';

export interface WorldPathPoint { x: number; z: number; y?: number }

export interface WorldPathSpec {
  name?: string;
  kind: WorldPathKind;
  points: WorldPathPoint[];
  /** Full authored corridor width in metres. */
  width?: number;
  /** River channel depth in metres when point heights are inferred. */
  depth?: number;
  /** Terrain material layer painted under roads/trails (0..3). */
  materialLayer?: number;
}

export interface WorldPointOfInterest {
  name: string;
  kind?: 'spawn' | 'settlement' | 'landmark' | 'vista';
  x: number;
  z: number;
  /** Radius of the gently flattened composition pad. */
  radius?: number;
  /** Optional world-space target height. Existing terrain height is used when omitted. */
  height?: number;
}

export interface WorldComposeRequest {
  entityId?: number;
  seed?: number;
  theme?: WorldTheme;
  landform?: WorldLandform;
  mood?: WorldMood;
  quality?: WorldQuality;
  size?: number;
  resolution?: number;
  center?: [number, number];
  water?: boolean;
  foliage?: boolean;
  navigation?: boolean;
  autoLayout?: boolean;
  paths?: WorldPathSpec[];
  pointsOfInterest?: WorldPointOfInterest[];
}

export interface ResolvedWorldAtmosphere {
  visualStyle: VisualStyleName;
  weather: WeatherType;
  cloudCoverage: number;
  cloudDensity: number;
  wind: { x: number; z: number; strength: number; gustiness: number };
  fogDensity: number;
  water: {
    enabled: boolean;
    waveScale: number;
    choppiness: number;
    foam: number;
    deepColor: number;
    shallowColor: number;
  };
}

export interface ResolvedWorldRecipe {
  seed: number;
  theme: WorldTheme;
  landform: WorldLandform;
  mood: WorldMood;
  quality: WorldQuality;
  size: number;
  resolution: number;
  center: [number, number];
  terrain: WorldGenOptions;
  atmosphere: ResolvedWorldAtmosphere;
  foliage: { enabled: boolean; density: number; radius: number };
  navigation: { enabled: boolean; buildSize: number; cellSize: number; maxSlopeDeg: number; maxStepHeight: number };
  scatterDensity: number;
  paths: WorldPathSpec[];
  pointsOfInterest: WorldPointOfInterest[];
  warnings: string[];
}

interface ThemePreset {
  climate: NonNullable<WorldGenOptions['climate']>;
  amplitude: number;
  mountainAmount: number;
  landBias: number;
  warp: number;
  foliage: number;
  clouds: number;
  cloudDensity: number;
  wind: number;
  fog: number;
  water: boolean;
  waterColors: [number, number];
}

const THEMES: Record<WorldTheme, ThemePreset> = {
  temperate: { climate: 'temperate', amplitude: 120, mountainAmount: 0.62, landBias: 0.08, warp: 0.75, foliage: 1, clouds: 0.42, cloudDensity: 1.1, wind: 5, fog: 0.012, water: true, waterColors: [0x123652, 0x2e8c9e] },
  tropical: { climate: 'tropical', amplitude: 96, mountainAmount: 0.5, landBias: 0.02, warp: 1.1, foliage: 1.4, clouds: 0.58, cloudDensity: 1.25, wind: 7, fog: 0.016, water: true, waterColors: [0x073c58, 0x36c9bd] },
  desert: { climate: 'desert', amplitude: 82, mountainAmount: 0.38, landBias: 0.2, warp: 0.45, foliage: 0.15, clouds: 0.15, cloudDensity: 0.65, wind: 8, fog: 0.009, water: false, waterColors: [0x15394a, 0x49a4a5] },
  arctic: { climate: 'arctic', amplitude: 112, mountainAmount: 0.7, landBias: 0.06, warp: 0.6, foliage: 0.28, clouds: 0.68, cloudDensity: 1.1, wind: 9, fog: 0.022, water: true, waterColors: [0x0b2744, 0x6fa7bd] },
  volcanic: { climate: 'volcanic', amplitude: 158, mountainAmount: 0.92, landBias: 0.1, warp: 1.25, foliage: 0.08, clouds: 0.72, cloudDensity: 1.45, wind: 6, fog: 0.028, water: true, waterColors: [0x080f16, 0x293941] },
  alpine: { climate: 'temperate', amplitude: 190, mountainAmount: 0.95, landBias: 0.12, warp: 0.72, foliage: 0.82, clouds: 0.5, cloudDensity: 1.05, wind: 7, fog: 0.016, water: true, waterColors: [0x102f4c, 0x4f9db4] },
  coastal: { climate: 'temperate', amplitude: 78, mountainAmount: 0.42, landBias: 0, warp: 1.05, foliage: 1.12, clouds: 0.46, cloudDensity: 1.05, wind: 10, fog: 0.014, water: true, waterColors: [0x092f50, 0x43a9b7] },
  fantasy: { climate: 'temperate', amplitude: 148, mountainAmount: 0.8, landBias: 0.08, warp: 1.6, foliage: 1.22, clouds: 0.62, cloudDensity: 1.3, wind: 5, fog: 0.021, water: true, waterColors: [0x172b5c, 0x5d74ca] },
};

const QUALITY: Record<WorldQuality, { resolution: number; scatter: number; foliageRadius: number; navCell: number }> = {
  draft: { resolution: 129, scatter: 0.35, foliageRadius: 260, navCell: 3 },
  balanced: { resolution: 257, scatter: 0.75, foliageRadius: 480, navCell: 2 },
  aaa: { resolution: 513, scatter: 1, foliageRadius: 720, navCell: 1.5 },
};

const MOOD_STYLE: Record<WorldMood, VisualStyleName> = {
  bright: 'daylight', cinematic: 'golden_hour', moody: 'moody', stormy: 'moody', dreamlike: 'stylized',
};

/** Resolve sparse human/agent intent into one deterministic, fully specified recipe. */
export function resolveWorldRecipe(input: WorldComposeRequest = {}): ResolvedWorldRecipe {
  const warnings: string[] = [];
  const seed = finiteInt(input.seed, 1337) >>> 0;
  const theme = input.theme ?? 'temperate';
  const landform = input.landform ?? defaultLandform(theme);
  const mood = input.mood ?? 'cinematic';
  const quality = input.quality ?? 'balanced';
  const preset = THEMES[theme];
  const budget = QUALITY[quality];
  const size = clampFinite(input.size, 1024, 128, 8192, 'size', warnings);
  const resolution = normalizeResolution(input.resolution ?? budget.resolution, warnings);
  const center: [number, number] = [finite(input.center?.[0], 0), finite(input.center?.[1], 0)];

  const terrain: WorldGenOptions = {
    seed,
    climate: preset.climate,
    amplitude: preset.amplitude,
    oceanDepthRatio: 0.24,
    continentScale: 1.15,
    landBias: preset.landBias,
    mountainScale: 2.7,
    mountainAmount: preset.mountainAmount,
    hillScale: 7,
    detailScale: 24,
    moistureScale: 4.5,
    warp: preset.warp,
    island: false,
    islandFalloff: 1.1,
  };
  applyLandform(terrain, landform);

  const atmosphere = resolveAtmosphere(theme, mood, preset, input.water);
  const foliageEnabled = input.foliage ?? preset.foliage > 0.1;
  const navigationEnabled = input.navigation ?? quality !== 'draft';
  const navBuildSize = Math.min(size, 2048);
  if (navigationEnabled && navBuildSize < size) warnings.push(`Navigation is initially baked over the central ${navBuildSize}m; use navmesh_auto for the rest of this streaming world.`);
  const pointsOfInterest = normalizePois(input.pointsOfInterest ?? [], size, center, warnings);
  const paths = normalizePaths(input.paths ?? [], size, center, warnings);
  if (input.autoLayout !== false) addAutoLayout(paths, pointsOfInterest, seed, size, center, theme);

  return {
    seed, theme, landform, mood, quality, size, resolution, center, terrain, atmosphere,
    foliage: {
      enabled: foliageEnabled,
      density: foliageEnabled ? preset.foliage * budget.scatter : 0,
      radius: Math.min(size * 0.46, budget.foliageRadius),
    },
    navigation: { enabled: navigationEnabled, buildSize: navBuildSize, cellSize: budget.navCell, maxSlopeDeg: 48, maxStepHeight: 0.8 },
    scatterDensity: budget.scatter,
    paths,
    pointsOfInterest,
    warnings,
  };
}

/** Evenly spaced XZ samples for painting a visible material corridor beneath a spline. */
export function sampleWorldPath(path: WorldPathSpec, spacing = 4): WorldPathPoint[] {
  const out: WorldPathPoint[] = [];
  for (let i = 0; i < path.points.length - 1; i++) {
    const a = path.points[i], b = path.points[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / Math.max(0.5, spacing)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: a.y !== undefined && b.y !== undefined ? lerp(a.y, b.y, t) : undefined });
    }
  }
  const last = path.points[path.points.length - 1];
  if (last) out.push({ ...last });
  return out;
}

function resolveAtmosphere(theme: WorldTheme, mood: WorldMood, preset: ThemePreset, waterOverride?: boolean): ResolvedWorldAtmosphere {
  let weather: WeatherType = theme === 'arctic' ? 'snow' : 'clear';
  let cloudCoverage = preset.clouds;
  let fogDensity = preset.fog;
  let windStrength = preset.wind;
  if (mood === 'bright') { cloudCoverage *= 0.55; fogDensity *= 0.6; }
  if (mood === 'moody') { cloudCoverage = Math.max(cloudCoverage, 0.68); fogDensity *= 1.45; }
  if (mood === 'stormy') { weather = theme === 'arctic' ? 'snow' : 'storm'; cloudCoverage = 0.95; fogDensity *= 1.8; windStrength *= 2; }
  if (mood === 'dreamlike') { cloudCoverage = Math.max(cloudCoverage, 0.56); fogDensity *= 1.25; }
  return {
    visualStyle: MOOD_STYLE[mood], weather, cloudCoverage, cloudDensity: preset.cloudDensity,
    wind: { x: 0.92, z: 0.38, strength: windStrength, gustiness: mood === 'stormy' ? 0.85 : 0.35 },
    fogDensity,
    water: {
      enabled: waterOverride ?? preset.water,
      waveScale: theme === 'coastal' || mood === 'stormy' ? 1.35 : 0.85,
      choppiness: mood === 'stormy' ? 1.1 : theme === 'coastal' ? 0.82 : 0.55,
      foam: theme === 'coastal' ? 0.82 : 0.58,
      deepColor: preset.waterColors[0], shallowColor: preset.waterColors[1],
    },
  };
}

function applyLandform(terrain: WorldGenOptions, landform: WorldLandform): void {
  switch (landform) {
    case 'island': terrain.island = true; terrain.islandFalloff = 1.15; break;
    case 'archipelago': terrain.island = true; terrain.islandFalloff = 0.82; terrain.continentScale = 1.8; terrain.warp = (terrain.warp ?? 0.8) * 1.35; terrain.landBias = -0.04; break;
    case 'highlands': terrain.amplitude = (terrain.amplitude ?? 120) * 1.25; terrain.mountainAmount = Math.max(0.82, terrain.mountainAmount ?? 0); terrain.landBias = 0.18; break;
    case 'valley': terrain.amplitude = (terrain.amplitude ?? 120) * 0.9; terrain.mountainAmount = Math.max(0.72, terrain.mountainAmount ?? 0); terrain.hillScale = 4.8; terrain.landBias = 0.22; break;
    case 'plains': terrain.amplitude = (terrain.amplitude ?? 120) * 0.42; terrain.mountainAmount = 0.18; terrain.hillScale = 10; terrain.landBias = 0.2; break;
    case 'continent': terrain.island = false; terrain.landBias = Math.max(0.14, terrain.landBias ?? 0); break;
  }
}

function addAutoLayout(paths: WorldPathSpec[], pois: WorldPointOfInterest[], seed: number, size: number, center: [number, number], theme: WorldTheme): void {
  const rng = mulberry32(seed ^ 0xa11ce);
  if (pois.length === 0) {
    const jitter = () => (rng() - 0.5) * size * 0.08;
    pois.push(
      { name: 'player_start', kind: 'spawn', x: center[0] - size * 0.17 + jitter(), z: center[1] + size * 0.11 + jitter(), radius: size * 0.035 },
      { name: 'central_landmark', kind: 'landmark', x: center[0] + jitter(), z: center[1] - size * 0.03 + jitter(), radius: size * 0.045 },
      { name: 'scenic_overlook', kind: 'vista', x: center[0] + size * 0.2 + jitter(), z: center[1] - size * 0.16 + jitter(), radius: size * 0.03 },
    );
  }
  if (paths.length === 0 && pois.length >= 2) {
    paths.push({
      name: 'hero_route', kind: theme === 'desert' ? 'trail' : 'road', width: Math.max(7, size * 0.009),
      points: pois.map((p) => ({ x: p.x, z: p.z })),
    });
  }
  if (paths.every((p) => p.kind !== 'river') && (theme === 'tropical' || theme === 'coastal')) {
    paths.push({
      name: 'watershed', kind: 'river', width: Math.max(10, size * 0.014), depth: Math.max(2, size * 0.003),
      points: [
        { x: center[0] - size * 0.05, z: center[1] - size * 0.12 },
        { x: center[0] + size * 0.08, z: center[1] + size * 0.02 },
        { x: center[0] + size * 0.32, z: center[1] + size * 0.22 },
      ],
    });
  }
}

function normalizePois(input: WorldPointOfInterest[], size: number, center: [number, number], warnings: string[]): WorldPointOfInterest[] {
  const out: WorldPointOfInterest[] = [];
  const names = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const p = input[i];
    if (!p || !p.name?.trim() || !Number.isFinite(p.x) || !Number.isFinite(p.z)) { warnings.push(`pointsOfInterest[${i}] was ignored because name/x/z is invalid.`); continue; }
    let name = p.name.trim();
    if (names.has(name)) { name = `${name}_${i + 1}`; warnings.push(`Duplicate point-of-interest name was renamed to "${name}".`); }
    names.add(name);
    warnOutside(p.x, p.z, size, center, `Point of interest "${name}"`, warnings);
    out.push({ ...p, name, radius: clampFinite(p.radius, Math.max(12, size * 0.035), 3, size * 0.2, `${name}.radius`, warnings) });
  }
  return out;
}

function normalizePaths(input: WorldPathSpec[], size: number, center: [number, number], warnings: string[]): WorldPathSpec[] {
  const out: WorldPathSpec[] = [];
  for (let i = 0; i < input.length; i++) {
    const p = input[i];
    const points = p?.points?.filter((v) => Number.isFinite(v?.x) && Number.isFinite(v?.z)).map((v) => ({ ...v }));
    if (!p || !['road', 'trail', 'river'].includes(p.kind) || !points || points.length < 2) { warnings.push(`paths[${i}] was ignored because it needs a valid kind and at least two finite points.`); continue; }
    for (const point of points) warnOutside(point.x, point.z, size, center, `Path "${p.name ?? i}" point`, warnings);
    const defaultWidth = p.kind === 'river' ? 14 : p.kind === 'road' ? 10 : 5;
    out.push({ ...p, points, width: clampFinite(p.width, defaultWidth, 1, size * 0.15, `paths[${i}].width`, warnings), depth: clampFinite(p.depth, 2.5, 0.25, 50, `paths[${i}].depth`, warnings), materialLayer: Math.round(clampFinite(p.materialLayer, p.kind === 'road' ? 1 : 2, 0, 3, `paths[${i}].materialLayer`, warnings)) });
  }
  return out;
}

function defaultLandform(theme: WorldTheme): WorldLandform {
  if (theme === 'coastal' || theme === 'tropical') return 'archipelago';
  if (theme === 'alpine') return 'highlands';
  if (theme === 'desert') return 'plains';
  if (theme === 'volcanic') return 'island';
  return 'continent';
}

function normalizeResolution(value: number, warnings: string[]): number {
  const choices = [65, 129, 257, 513, 1025];
  const n = finite(value, 257);
  const selected = choices.reduce((best, v) => Math.abs(v - n) < Math.abs(best - n) ? v : best, 257);
  if (selected !== value) warnings.push(`Terrain resolution ${String(value)} was normalized to ${selected} (2^n + 1 heightfield).`);
  return selected;
}

function clampFinite(value: number | undefined, fallback: number, min: number, max: number, label: string, warnings: string[]): number {
  const raw = finite(value, fallback);
  const clamped = Math.min(max, Math.max(min, raw));
  if (value !== undefined && clamped !== value) warnings.push(`${label} was clamped to ${clamped}.`);
  return clamped;
}

function finite(value: number | undefined, fallback: number): number { return value !== undefined && Number.isFinite(value) ? value : fallback; }
function finiteInt(value: number | undefined, fallback: number): number { return Math.round(finite(value, fallback)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function warnOutside(x: number, z: number, size: number, center: [number, number], label: string, warnings: string[]): void {
  const half = size * 0.5;
  if (Math.abs(x - center[0]) > half || Math.abs(z - center[1]) > half) warnings.push(`${label} is outside the terrain bounds and may not affect the world.`);
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
