import catalog from './crestbound-starter.catalog.json';
import type { AssetEntry, AssetManifest } from '../animation/AssetManifest';

/** Bundled Crestbound environment assets and provenance catalog. */
export const CRESTBOUND_STARTER_CONTENT = catalog;
export const CRESTBOUND_STARTER_ASSET_PATHS = catalog.assets.map((asset) => asset.path);
export const CRESTBOUND_STARTER_MODELS = catalog.assets.filter((asset) => asset.kind === 'model');

export function registerCrestboundStarterAssets(manifest: Pick<AssetManifest, 'register'>): void {
  for (const asset of catalog.assets) {
    if (asset.kind === 'audio' || asset.kind === 'texture') continue;
    const entry: AssetEntry = {
      id: asset.id,
      path: asset.path,
      type: asset.type as AssetEntry['type'],
      tags: [
        'preset',
        'crestbound',
        asset.type,
        ...asset.name.toLowerCase().split(/\s+/),
      ],
      targetSize: asset.targetSize,
    };
    manifest.register(entry);
  }
}
