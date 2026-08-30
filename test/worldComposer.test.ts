import { describe, expect, it } from 'vitest';
import { resolveWorldRecipe, sampleWorldPath } from '../src/world/WorldComposer';

describe('WorldComposer', () => {
  it('resolves sparse intent into a complete deterministic exploration layout', () => {
    const a = resolveWorldRecipe({ seed: 42, theme: 'tropical', quality: 'balanced' });
    const b = resolveWorldRecipe({ seed: 42, theme: 'tropical', quality: 'balanced' });

    expect(a).toEqual(b);
    expect(a.landform).toBe('archipelago');
    expect(a.terrain.climate).toBe('tropical');
    expect(a.atmosphere.water.enabled).toBe(true);
    expect(a.pointsOfInterest.map((p) => p.name)).toEqual(['player_start', 'central_landmark', 'scenic_overlook']);
    expect(a.paths.some((p) => p.kind === 'road')).toBe(true);
    expect(a.paths.some((p) => p.kind === 'river')).toBe(true);
    expect(a.navigation.enabled).toBe(true);
  });

  it('maps quality to bounded production budgets and normalizes heightfield resolution', () => {
    const draft = resolveWorldRecipe({ quality: 'draft', autoLayout: false });
    const aaa = resolveWorldRecipe({ quality: 'aaa', size: 5000, resolution: 500, autoLayout: false });

    expect(draft.resolution).toBe(129);
    expect(draft.navigation.enabled).toBe(false);
    expect(aaa.resolution).toBe(513);
    expect(aaa.navigation.cellSize).toBe(1.5);
    expect(aaa.navigation.buildSize).toBe(2048);
    expect(aaa.warnings.join(' ')).toContain('normalized to 513');
    expect(aaa.warnings.join(' ')).toContain('streaming world');
  });

  it('preserves explicit authored paths and POIs when automatic layout is disabled', () => {
    const recipe = resolveWorldRecipe({
      autoLayout: false,
      paths: [{ name: 'main_street', kind: 'road', points: [{ x: -20, z: 0 }, { x: 20, z: 0 }], width: 12 }],
      pointsOfInterest: [{ name: 'town', kind: 'settlement', x: 0, z: 0, radius: 30 }],
    });

    expect(recipe.paths).toHaveLength(1);
    expect(recipe.paths[0]).toMatchObject({ name: 'main_street', width: 12, materialLayer: 1 });
    expect(recipe.pointsOfInterest).toEqual([{ name: 'town', kind: 'settlement', x: 0, z: 0, radius: 30 }]);
  });

  it('reports invalid authoring data instead of allowing malformed paths into terrain tools', () => {
    const recipe = resolveWorldRecipe({
      autoLayout: false,
      size: 256,
      paths: [{ kind: 'road', points: [{ x: 0, z: 0 }] }],
      pointsOfInterest: [
        { name: 'edge', x: 999, z: 0 },
        { name: 'edge', x: 0, z: 0 },
      ],
    });

    expect(recipe.paths).toEqual([]);
    expect(recipe.pointsOfInterest[1].name).toBe('edge_2');
    expect(recipe.warnings.some((w) => w.includes('at least two finite points'))).toBe(true);
    expect(recipe.warnings.some((w) => w.includes('outside the terrain bounds'))).toBe(true);
  });

  it('samples painted corridors at stable spacing including the final endpoint', () => {
    const samples = sampleWorldPath({ kind: 'road', points: [{ x: 0, y: 2, z: 0 }, { x: 10, y: 4, z: 0 }] }, 3);
    expect(samples).toHaveLength(5);
    expect(samples[0]).toEqual({ x: 0, y: 2, z: 0 });
    expect(samples.at(-1)).toEqual({ x: 10, y: 4, z: 0 });
    expect(samples[2].y).toBeCloseTo(3);
  });
});
