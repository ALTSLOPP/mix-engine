import type { CommandMap, CmdCtx } from './BridgeContext';
import * as THREE from 'three';
import type { AICommand } from '../AIBridge';
import { applyVisualStyle, resolveVisualStyle } from '../../features/VisualStyles';
import {
  resolveWorldRecipe,
  sampleWorldPath,
  type ResolvedWorldRecipe,
  type WorldPathSpec,
  type WorldPointOfInterest,
} from '../../world/WorldComposer';
import type { TerrainField } from '../../terrain/TerrainField';
import type { WorldStats } from '../../terrain/worldgen';

interface WorldBuildState {
  terrainId: number;
  recipe: ResolvedWorldRecipe;
  stats: WorldStats;
  navStats: unknown;
  builtAt: string;
  warnings: string[];
}

export function register(map: CommandMap, ctx: CmdCtx): void {
  let lastBuild: WorldBuildState | null = null;
  // ─── Terrain ───────────────────────────────────────────────────────────
  map.set('terrain_create', (cmd: Extract<AICommand, { type: 'terrain_create' }>) => {
    if (!ctx.terrain) { console.warn('[AIBridge] terrain_create: terrain system unavailable'); return; }
    const id = ctx.terrain.create(new THREE.Vector3(cmd.x, cmd.y, cmd.z), {
      size: cmd.size,
      resolution: cmd.resolution,
      materialId: cmd.materialId,
      seed: cmd.seed,
      baseNoiseAmplitude: cmd.baseNoiseAmplitude,
    });
    ctx.setQueryResult({ entityId: id });
  });

  map.set('terrain_sculpt', (cmd: Extract<AICommand, { type: 'terrain_sculpt' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    ctx.terrain.sculptWorld(f, cmd.op, cmd.x, cmd.z, (cmd.strength ?? 0.5) * 1, {
      radius: cmd.radius, strength: cmd.strength ?? 0.5, hardness: cmd.hardness ?? 0.5,
      targetHeight: cmd.targetHeight, terraceStep: cmd.terraceStep,
    });
    f.markColliderDirty();
  });

  map.set('terrain_ramp', (cmd: Extract<AICommand, { type: 'terrain_ramp' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    ctx.terrain.rampWorld(f, cmd.from, cmd.to, cmd.width, cmd.hardness ?? 0.5);
    f.markColliderDirty();
  });

  map.set('terrain_noise', (cmd: Extract<AICommand, { type: 'terrain_noise' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    ctx.terrain.noiseWorld(f, cmd.x, cmd.z, cmd.radius, cmd.amplitude, cmd.frequency ?? 0.02, cmd.seed ?? 1, cmd.octaves ?? 5, cmd.hardness ?? 0.5);
    f.markColliderDirty();
  });

  map.set('terrain_erode', (cmd: Extract<AICommand, { type: 'terrain_erode' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;

    let i0 = 0, i1 = f.hm.res - 1, j0 = 0, j1 = f.hm.res - 1;
    if (cmd.x !== undefined && cmd.z !== undefined && cmd.radius !== undefined) {
      const enginePt = ctx.worldOrigin.toEngineSpace(new THREE.Vector3(cmd.x, 0, cmd.z));
      const localPt = f.mesh.worldToLocal(enginePt);
      const half = Math.ceil(cmd.radius / f.hm.step);
      const cx = f.hm.toI(localPt.x);
      const cz = f.hm.toJ(localPt.z);
      i0 = Math.max(0, cx - half);
      i1 = Math.min(f.hm.res - 1, cx + half);
      j0 = Math.max(0, cz - half);
      j1 = Math.min(f.hm.res - 1, cz + half);
    }

    const opts = { ...cmd.options };
    if (cmd.iterations !== undefined) opts.iterations = cmd.iterations;

    ctx.terrain.erode(f, { i0, i1, j0, j1 }, cmd.kind, opts);
  });

  map.set('terrain_paint', (cmd: Extract<AICommand, { type: 'terrain_paint' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    ctx.terrain.paintWorld(f, cmd.layer, cmd.x, cmd.z, {
      radius: cmd.radius,
      strength: cmd.strength ?? 0.5,
      hardness: cmd.hardness ?? 0.5,
    });
  });

  map.set('terrain_material_layers', (cmd: Extract<AICommand, { type: 'terrain_material_layers' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    const mat = f.material as { setLayerPreset?: (layer: number, url: string, repeat?: number) => void };
    if (mat.setLayerPreset) {
      for (const l of cmd.layers) mat.setLayerPreset(l.layer, l.presetOrUrl, l.repeat ?? 10);
    }
  });

  map.set('terrain_spline', (cmd: Extract<AICommand, { type: 'terrain_spline' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    const points = cmd.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    ctx.terrain.splineConformWorld(f, points, cmd.width, cmd.hardness ?? 0.5, { mode: cmd.mode });
  });

  map.set('terrain_scatter', (cmd: Extract<AICommand, { type: 'terrain_scatter' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    if (cmd.density !== undefined) ctx.terrain.setScatterDensity(f, cmd.density);
    if (cmd.enabled !== undefined) ctx.terrain.enableScatter(f, cmd.enabled);
    if (cmd.regenerate) ctx.terrain.regenScatter(f);
    ctx.setQueryResult(ctx.terrain.scatterInfo(f));
  });

  map.set('terrain_sample', (cmd: Extract<AICommand, { type: 'terrain_sample' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    ctx.setQueryResult({ height: ctx.terrain.sampleHeightWorld(f, cmd.x, cmd.z), collider: f.colliderInfo() });
  });

  map.set('terrain_lod', (cmd: Extract<AICommand, { type: 'terrain_lod' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    if (cmd.distances && cmd.distances.length > 0) f.setLodDistances(cmd.distances);
    ctx.setQueryResult(f.colliderInfo().lod);
  });

  map.set('terrain_reset', (cmd: Extract<AICommand, { type: 'terrain_reset' }>) => {
    if (!ctx.terrain) return;
    const f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) return;
    ctx.terrain.reset(f);
  });

  map.set('world_generate', (cmd: Extract<AICommand, { type: 'world_generate' }>) => {
    if (!ctx.terrain) { console.warn('[AIBridge] world_generate: terrain system unavailable'); return; }
    let f = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (!f) {
      const id = ctx.terrain.create(new THREE.Vector3(0, 0, 0), {
        size: cmd.size ?? 1024,
        resolution: cmd.resolution ?? 257,
        seed: cmd.seed,
        baseNoiseAmplitude: 0,
      });
      f = ctx.terrain.field(id);
    }
    if (!f) return;
    const stats = ctx.terrain.generateWorld(f, {
      seed: cmd.seed, amplitude: cmd.amplitude, oceanDepthRatio: cmd.oceanDepthRatio,
      continentScale: cmd.continentScale, landBias: cmd.landBias,
      mountainScale: cmd.mountainScale, mountainAmount: cmd.mountainAmount,
      hillScale: cmd.hillScale, detailScale: cmd.detailScale,
      moistureScale: cmd.moistureScale, warp: cmd.warp,
      island: cmd.island, islandFalloff: cmd.islandFalloff, climate: cmd.climate,
    });
    ctx.setQueryResult(stats);
  });

  map.set('world_compose', async (cmd: Extract<AICommand, { type: 'world_compose' }>) => {
    if (!ctx.terrain) return { ok: false, error: 'World Composer requires the TerrainSystem.' };
    const recipe = resolveWorldRecipe(cmd);
    const warnings = [...recipe.warnings];
    let field = cmd.entityId !== undefined ? ctx.terrain.field(cmd.entityId) : ctx.terrain.firstField();
    if (cmd.entityId !== undefined && !field) return { ok: false, error: `Terrain entity #${cmd.entityId} was not found.` };

    let terrainId = cmd.entityId;
    if (!field) {
      terrainId = ctx.terrain.create(new THREE.Vector3(recipe.center[0], 0, recipe.center[1]), {
        size: recipe.size, resolution: recipe.resolution, seed: recipe.seed, baseNoiseAmplitude: 0,
      });
      field = ctx.terrain.field(terrainId);
    }
    if (!field || terrainId === undefined) return { ok: false, error: 'World Composer could not create a terrain field.' };
    if (field.hm.res !== recipe.resolution || field.hm.size !== recipe.size) {
      warnings.push(`Existing terrain dimensions (${field.hm.size}m/${field.hm.res}) were preserved; requested ${recipe.size}m/${recipe.resolution}.`);
    }

    const stats = ctx.terrain.generateWorld(field, recipe.terrain) as WorldStats;
    for (const poi of recipe.pointsOfInterest) composePointOfInterest(ctx, field, poi);
    for (const path of recipe.paths) composePath(ctx, field, path);
    // One rebuild after every terrain edit makes the following navigation bake observe the final world.
    field.rebuildCollider();

    ctx.terrain.setScatterDensity(field, recipe.scatterDensity);
    ctx.terrain.enableScatter(field, recipe.scatterDensity > 0);
    ctx.terrain.regenScatter(field);

    if (recipe.atmosphere.water.enabled) {
      // Composition is seed-deterministic, so replace any previous primary/lake setup instead of
      // letting WaterSystem.set() silently preserve the old body's kind and dimensions.
      ctx.water?.removeAll();
      ctx.water?.create({
        kind: 'ocean', seaLevel: 0, size: Math.max(2000, recipe.size * 1.5),
        waveScale: recipe.atmosphere.water.waveScale,
        choppiness: recipe.atmosphere.water.choppiness,
        foam: recipe.atmosphere.water.foam,
        deepColor: recipe.atmosphere.water.deepColor,
        shallowColor: recipe.atmosphere.water.shallowColor,
      });
    } else {
      ctx.water?.removeAll();
    }
    ctx.clouds?.setParams({
      enabled: true,
      coverage: recipe.atmosphere.cloudCoverage,
      density: recipe.atmosphere.cloudDensity,
      speed: Math.max(2, recipe.atmosphere.wind.strength * 1.5),
      heightBottom: Math.max(260, stats.max * 1.35),
      heightTop: Math.max(560, stats.max * 2.25),
    });
    ctx.wind?.set({
      dirX: recipe.atmosphere.wind.x, dirZ: recipe.atmosphere.wind.z,
      strength: recipe.atmosphere.wind.strength, gustiness: recipe.atmosphere.wind.gustiness,
    });
    ctx.weatherSystem?.setWeather(recipe.atmosphere.weather, 2.5);
    if (ctx.volumetricFog) {
      ctx.volumetricFog.density = recipe.atmosphere.fogDensity;
      ctx.volumetricFog.groundLevel = 0;
      ctx.volumetricFog.heightFalloff = recipe.theme === 'alpine' ? 0.055 : 0.1;
    }
    applyVisualStyle(ctx.viewport, resolveVisualStyle(recipe.atmosphere.visualStyle));

    if (recipe.foliage.enabled && ctx.foliage) {
      ctx.foliage.populate({ entityId: terrainId, density: recipe.foliage.density, radius: recipe.foliage.radius, seed: recipe.seed ^ 0xf01a6e });
    } else {
      ctx.foliage?.clear();
    }

    ctx.entityNames.set(terrainId, ctx.entityNames.get(terrainId) ?? 'world_terrain');
    ctx.sceneManager.addTag(terrainId, 'world-composed');
    ctx.sceneManager.addTag(terrainId, `theme:${recipe.theme}`);
    for (const poi of recipe.pointsOfInterest) {
      const height = poi.height ?? ctx.terrain.sampleHeightWorld(field, poi.x, poi.z);
      ctx.nav?.registerLandmark(poi.name, new THREE.Vector3(poi.x, height, poi.z), Math.max(1, (poi.radius ?? 12) * 0.3));
    }

    let navStats: unknown = null;
    if (recipe.navigation.enabled && ctx.nav) {
      navStats = await ctx.nav.buildNavMesh({
        center: new THREE.Vector3(recipe.center[0], 0, recipe.center[1]),
        size: recipe.navigation.buildSize,
        cellSize: recipe.navigation.cellSize,
        agentRadius: 0.45,
        agentHeight: 1.8,
        maxSlopeDeg: recipe.navigation.maxSlopeDeg,
        maxStepHeight: recipe.navigation.maxStepHeight,
        raycastCeiling: Math.max(1000, stats.max + 250),
        budgetMsPerTick: 3,
      });
    } else if (recipe.navigation.enabled) {
      warnings.push('Navigation was requested but the NavigationSystem is unavailable.');
    }

    lastBuild = { terrainId, recipe, stats, navStats, builtAt: new Date().toISOString(), warnings };
    ctx.viewport.scene.userData.worldComposer = {
      terrainId, seed: recipe.seed, theme: recipe.theme, landform: recipe.landform,
      quality: recipe.quality, paths: recipe.paths.length, pointsOfInterest: recipe.pointsOfInterest.length,
    };
    ctx.frameAll?.(1.15);
    return buildWorldReport(ctx, lastBuild);
  });

  map.set('world_report', () => buildWorldReport(ctx, lastBuild));

  // ─── Water ─────────────────────────────────────────────────────────────
  map.set('water_create', (cmd: Extract<AICommand, { type: 'water_create' }>) => {
    if (!ctx.water) { console.warn('[AIBridge] water_create: water system unavailable'); return; }
    ctx.water.create({
      kind: cmd.kind, seaLevel: cmd.seaLevel, size: cmd.size, segments: cmd.segments,
      position: cmd.position, waveScale: cmd.waveScale, choppiness: cmd.choppiness,
      foam: cmd.foam, opacity: cmd.opacity,
      deepColor: cmd.deepColor, shallowColor: cmd.shallowColor, foamColor: cmd.foamColor,
    });
    ctx.setQueryResult(ctx.water.info());
  });

  map.set('water_set', (cmd: Extract<AICommand, { type: 'water_set' }>) => {
    if (!ctx.water) return;
    ctx.water.set({
      seaLevel: cmd.seaLevel, waveScale: cmd.waveScale, choppiness: cmd.choppiness,
      foam: cmd.foam, opacity: cmd.opacity,
      deepColor: cmd.deepColor, shallowColor: cmd.shallowColor, foamColor: cmd.foamColor,
    });
    ctx.setQueryResult(ctx.water.info());
  });

  map.set('water_remove', () => {
    if (!ctx.water) return;
    ctx.water.removeAll();
  });

  map.set('water_sample', (cmd: Extract<AICommand, { type: 'water_sample' }>) => {
    if (!ctx.water) return;
    ctx.setQueryResult({ height: ctx.water.sampleHeight(cmd.x, cmd.z) });
  });

  // ─── Clouds ────────────────────────────────────────────────────────────
  map.set('clouds_set', (cmd: Extract<AICommand, { type: 'clouds_set' }>) => {
    if (!ctx.clouds) { console.warn('[AIBridge] clouds_set: cloud layer unavailable'); return; }
    ctx.clouds.setParams({
      enabled: cmd.enabled, coverage: cmd.coverage, density: cmd.density, speed: cmd.speed,
      scale: cmd.scale, heightBottom: cmd.heightBottom, heightTop: cmd.heightTop, color: cmd.color,
    });
    ctx.setQueryResult(ctx.clouds.info());
  });

  // ─── Wind ──────────────────────────────────────────────────────────────
  map.set('wind_set', (cmd: Extract<AICommand, { type: 'wind_set' }>) => {
    if (!ctx.wind) { console.warn('[AIBridge] wind_set: wind system unavailable'); return; }
    ctx.wind.set({ dirX: cmd.dirX, dirZ: cmd.dirZ, strength: cmd.strength, gustiness: cmd.gustiness });
    ctx.setQueryResult(ctx.wind.info());
  });

  // ─── Foliage ───────────────────────────────────────────────────────────
  map.set('foliage_populate', (cmd: Extract<AICommand, { type: 'foliage_populate' }>) => {
    if (!ctx.foliage) { console.warn('[AIBridge] foliage_populate: foliage system unavailable'); return; }
    ctx.foliage.populate({ entityId: cmd.entityId as number | undefined, density: cmd.density, radius: cmd.radius, seed: cmd.seed });
    ctx.setQueryResult(ctx.foliage.info());
  });

  map.set('foliage_set', (cmd: Extract<AICommand, { type: 'foliage_set' }>) => {
    if (!ctx.foliage) return;
    if (cmd.density !== undefined) { ctx.foliage.densityScale = Math.max(0.05, cmd.density); ctx.foliage.regenerate(); }
    if (cmd.enabled !== undefined) ctx.foliage.setEnabled(cmd.enabled);
    ctx.setQueryResult(ctx.foliage.info());
  });

  map.set('foliage_clear', () => {
    if (!ctx.foliage) return;
    ctx.foliage.clear();
  });
}

function composePointOfInterest(ctx: CmdCtx, field: TerrainField, poi: WorldPointOfInterest): void {
  if (!ctx.terrain) return;
  const targetWorldY = poi.height ?? ctx.terrain.sampleHeightWorld(field, poi.x, poi.z);
  const enginePoint = ctx.worldOrigin.toEngineSpace(new THREE.Vector3(poi.x, targetWorldY, poi.z));
  const localTarget = field.mesh.worldToLocal(enginePoint).y;
  ctx.terrain.sculptWorld(field, 'flatten', poi.x, poi.z, 1, {
    radius: poi.radius ?? 18, strength: 1, hardness: 0.68, targetHeight: localTarget,
  });
}

function composePath(ctx: CmdCtx, field: TerrainField, path: WorldPathSpec): void {
  if (!ctx.terrain || path.points.length < 2) return;
  const depth = path.depth ?? 2.5;
  const points = path.points.map((p) => {
    const surface = ctx.terrain!.sampleHeightWorld(field, p.x, p.z);
    const y = p.y ?? (path.kind === 'river' ? surface - depth : surface);
    return new THREE.Vector3(p.x, y, p.z);
  });
  const width = path.width ?? (path.kind === 'river' ? 14 : 8);
  ctx.terrain.splineConformWorld(field, points, width * 0.5, path.kind === 'river' ? 0.42 : 0.72, {
    mode: path.kind === 'river' ? 'carve' : 'flatten', smooth: true,
  });

  const layer = path.kind === 'river' ? 1 : (path.materialLayer ?? (path.kind === 'road' ? 1 : 2));
  const paintRadius = path.kind === 'river' ? width * 0.44 : width * 0.48;
  for (const p of sampleWorldPath(path, Math.max(1.5, width * 0.3))) {
    ctx.terrain.paintWorld(field, layer, p.x, p.z, { radius: paintRadius, strength: 0.92, hardness: 0.74 });
  }
}

function buildWorldReport(ctx: CmdCtx, state: WorldBuildState | null): object {
  if (!state) {
    return {
      ok: false,
      readiness: { score: 0, grade: 'N/A' },
      error: 'No world_compose build has completed in this session.',
      next: 'Run world_compose first; world_generate is the lower-level terrain-only command.',
    };
  }
  const { recipe } = state;
  const waterOk = !recipe.atmosphere.water.enabled || !!ctx.water?.hasWater();
  const foliageInfo = ctx.foliage?.info() as { enabled?: boolean; counts?: Record<string, number> } | undefined;
  const foliageOk = !recipe.foliage.enabled || !!foliageInfo?.enabled;
  const navOk = !recipe.navigation.enabled || !!ctx.nav?.hasNavMesh;
  const checks = [
    { id: 'terrain', ok: !!ctx.terrain?.field(state.terrainId), detail: `${recipe.size}m / ${recipe.resolution} requested` },
    { id: 'composition', ok: recipe.paths.length > 0 && recipe.pointsOfInterest.length > 0, detail: `${recipe.paths.length} paths, ${recipe.pointsOfInterest.length} semantic POIs` },
    { id: 'water', ok: waterOk, detail: recipe.atmosphere.water.enabled ? 'ocean expected' : 'disabled by recipe' },
    { id: 'foliage', ok: foliageOk, detail: recipe.foliage.enabled ? foliageInfo?.counts ?? 'enabled' : 'disabled by recipe' },
    { id: 'atmosphere', ok: !!ctx.clouds && !!ctx.wind, detail: `${recipe.atmosphere.visualStyle} / ${recipe.atmosphere.weather}` },
    { id: 'navigation', ok: navOk, detail: recipe.navigation.enabled ? (state.navStats ?? 'requested') : 'disabled by recipe' },
  ];
  const score = Math.round(checks.filter((c) => c.ok).length / checks.length * 100);
  const grade = score >= 100 ? 'A' : score >= 84 ? 'B' : score >= 67 ? 'C' : 'Needs work';
  const recommendations: string[] = [];
  if (!checks[1].ok) recommendations.push('Add at least one path and one named pointOfInterest for authored traversal and semantic navigation.');
  if (!waterOk) recommendations.push('Enable the WaterSystem or set water:false in the recipe.');
  if (!foliageOk) recommendations.push('Enable the FoliageSystem or set foliage:false in the recipe.');
  if (!navOk) recommendations.push('Re-run with navigation:true after the terrain collider is available.');
  if (recipe.quality !== 'aaa') recommendations.push('Use quality:"aaa" for the final terrain and navigation bake; keep balanced for iteration.');

  return {
    ok: checks.every((c) => c.ok),
    command: 'world_compose',
    terrainId: state.terrainId,
    builtAt: state.builtAt,
    readiness: { score, grade, label: 'world-composition readiness' },
    recipe,
    terrain: state.stats,
    live: {
      water: ctx.water?.info() ?? null,
      foliage: foliageInfo ?? null,
      clouds: ctx.clouds?.info() ?? null,
      wind: ctx.wind?.info() ?? null,
      weather: ctx.weatherSystem ? { current: ctx.weatherSystem.currentWeather, target: ctx.weatherSystem.targetWeather } : null,
      navigation: state.navStats,
    },
    checks,
    warnings: state.warnings,
    recommendations,
  };
}
