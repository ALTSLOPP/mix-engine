import { describe, it, expect } from 'vitest';
import {
  parseDescriptor, scoreAsset, materialFromDescriptor, tokenize,
  SemanticAssetRegistry, COLOR_LEXICON, type AssetCatalog,
} from '../src/assets/SemanticAssetRegistry';
import type { AssetEntry } from '../src/animation/AssetManifest';

function entry(id: string, tags: string[]): AssetEntry {
  return { id, path: `/x/${id}.glb`, type: 'misc', tags };
}

const CATALOG: AssetCatalog = {
  toJSON: () => [
    entry('Sedan01', ['vehicle', 'sedan', 'car']),
    entry('PickupTruck', ['vehicle', 'truck']),
    entry('AnimeTree1', ['vegetation', 'flora', 'tree']),
    entry('PublicTrashCan', ['prop', 'trash', 'bin', 'can']),
    entry('Bench', ['prop', 'bench', 'seating']),
  ],
};

describe('SemanticAssetRegistry — query parsing', () => {
  it('tokenizes and splits on non-alphanumerics', () => {
    expect(tokenize('Rusty, RED  car!')).toEqual(['rusty', 'red', 'car']);
  });

  it('parses "rusty red car" into colour + rust + vehicle nouns', () => {
    const d = parseDescriptor('rusty red car');
    expect(d.color).toBe(COLOR_LEXICON.red);
    expect(d.rust).toBeGreaterThan(0.5);
    expect(d.dirt).toBe(0);
    expect(d.nouns).toContain('car');
    // 'rusty'/'red' are NOT treated as nouns.
    expect(d.nouns).not.toContain('rusty');
    expect(d.nouns).not.toContain('red');
    // 'car' expands to vehicle/sedan synonyms for scoring.
    expect(d.tagTokens).toEqual(expect.arrayContaining(['vehicle', 'sedan', 'car']));
  });

  it('"clean" zeroes weathering even if another word raised it; metallic sets metalness', () => {
    expect(parseDescriptor('old clean truck').rust).toBe(0);
    const m = parseDescriptor('metallic chrome car');
    expect(m.metalness).toBeGreaterThan(0.8);
    expect(m.roughness).toBeLessThan(0.2);
  });

  it('maps a descriptor to a material adjustment', () => {
    const mat = materialFromDescriptor(parseDescriptor('dirty blue sedan'));
    expect(mat.tint).toBe(COLOR_LEXICON.blue);
    expect(mat.dirt).toBeGreaterThan(0);
    expect(mat.rust).toBeUndefined();
  });
});

describe('SemanticAssetRegistry — scoring + resolution', () => {
  it('scores a matching category high and an unrelated asset zero', () => {
    const d = parseDescriptor('rusty red car');
    expect(scoreAsset(d, entry('Sedan01', ['vehicle', 'sedan', 'car']))).toBeGreaterThan(0.5);
    expect(scoreAsset(d, entry('AnimeTree1', ['vegetation', 'tree']))).toBe(0);
  });

  it('resolves "rusty red car" to the sedan with red tint + rust', () => {
    const reg = new SemanticAssetRegistry(CATALOG);
    const r = reg.resolve('rusty red car');
    expect(r).not.toBeNull();
    expect(r!.assetId).toBe('Sedan01');
    expect(r!.material.tint).toBe(COLOR_LEXICON.red);
    expect(r!.material.rust).toBeGreaterThan(0);
  });

  it('resolves "park bench" to the bench, and ranks candidates', () => {
    const reg = new SemanticAssetRegistry(CATALOG);
    expect(reg.resolve('park bench')?.assetId).toBe('Bench');
    const ranked = reg.rank('truck', 3);
    expect(ranked[0].assetId).toBe('PickupTruck');
  });

  it('returns null when nothing matches', () => {
    const reg = new SemanticAssetRegistry(CATALOG);
    expect(reg.resolve('quantum hyperdrive')).toBeNull();
  });
});
