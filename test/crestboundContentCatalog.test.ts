import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as THREE from 'three';
import {
  CRESTBOUND_STARTER_CONTENT,
  CRESTBOUND_STARTER_MODELS,
  registerCrestboundStarterAssets,
} from '../src/content/CrestboundStarterPack';
import { StylizedTownRecipe } from '../src/features/city/StylizedTownRecipe';

describe('Crestbound Starter Content Catalog Integrity', () => {
  it('keeps public provenance catalog identical to bundled module catalog', () => {
    const publicPath = path.resolve(__dirname, '../public/assets/crestbound-starter/content.json');
    const srcPath = path.resolve(__dirname, '../src/content/crestbound-starter.catalog.json');

    const publicContent = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
    const srcContent = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

    expect(publicContent).toEqual(srcContent);
    expect(CRESTBOUND_STARTER_CONTENT).toEqual(srcContent);
  });

  for (const asset of CRESTBOUND_STARTER_CONTENT.assets) {
    it(`'${asset.id}' matches its source hash and is bundled properly`, () => {
      const filePath = path.resolve(__dirname, '../public', asset.path.replace(/^\//, ''));
      expect(fs.existsSync(filePath)).toBe(true);

      const buffer = fs.readFileSync(filePath);
      expect(buffer.length).toBe(asset.bytes);

      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      expect(hash).toBe(asset.sha256);
    });
  }

  it('registers all Crestbound model assets into AssetManifest', () => {
    const register = vi.fn();
    registerCrestboundStarterAssets({ register });

    expect(register).toHaveBeenCalledTimes(CRESTBOUND_STARTER_MODELS.length);
    const registeredIds = register.mock.calls.map((c: any) => c[0].id);
    expect(registeredIds).toContain('crest_house_route_starter');
    expect(registeredIds).toContain('crest_tree_alder');
    expect(registeredIds).toContain('crest_rocks_ghibli');
  });

  it('generates stylized town recipe and tears down cleanly', () => {
    const scene = new THREE.Scene();
    const mockEngine: any = {
      viewport: { scene },
      gameplayFeatures: {
        cover: {
          registerCoverNode: vi.fn(),
          clearCoverNodes: vi.fn(),
        },
      },
    };

    const recipe = new StylizedTownRecipe(mockEngine);
    recipe.generateTown();

    expect(recipe.getRoot().children.length).toBeGreaterThan(15);
    expect(scene.children).toContain(recipe.getRoot());
    expect(mockEngine.gameplayFeatures.cover.registerCoverNode).toHaveBeenCalled();

    // Clear
    recipe.clear();
    expect(recipe.getRoot().children.length).toBe(0);
    expect(scene.children).not.toContain(recipe.getRoot());
    expect(mockEngine.gameplayFeatures.cover.clearCoverNodes).toHaveBeenCalled();
  });
});
