import catalog from './fps-starter.catalog.json';
import type { AssetEntry, AssetManifest } from '../animation/AssetManifest';
import type { GrenadeDef, RangedWeaponDef, WeaponSlotDef } from '../features/gameplay/types';

/** Original files and provenance are bundled with the engine; no source-drive dependency. */
export const FPS_STARTER_CONTENT = catalog;
export const FPS_STARTER_ASSET_PATHS = catalog.assets.map(asset => asset.path);
export const FPS_STARTER_MODELS = catalog.assets.filter(asset => asset.kind === 'model');

export function registerFpsStarterAssets(manifest: Pick<AssetManifest, 'register'>): void {
  for (const asset of catalog.assets) {
    if (asset.kind === 'audio') continue;
    const entry: AssetEntry = {
      id: asset.id, path: asset.path,
      type: asset.kind === 'animation' ? 'animation' : 'prop',
      tags: ['preset', 'fps-starter', asset.kind === 'animation' ? 'animation' : 'weapon',
        ...asset.name.toLowerCase().split(/\s+/)],
      targetSize: asset.targetSize,
    };
    manifest.register(entry);
  }
}

const audio = (file: string) => `/assets/fps-starter/audio/${file}.wav`;
const weapon = (
  id: string, name: string, type: RangedWeaponDef['type'], modelAssetId: string,
  damage: number, secondsPerShot: number, magazineSize: number, reloadDuration: number,
  audioFire: string, automatic: boolean, modelSize: number,
): RangedWeaponDef => ({
  id, name, type, modelAssetId, damage, fireRate: 1 / secondsPerShot, magazineSize,
  reloadDuration, range: type === 'sniper' ? 180 : type === 'pistol' ? 45 : 90,
  spread: type === 'sniper' ? 0.0035 : type === 'pistol' ? 0.008 : 0.02,
  muzzleVfx: 'muzzle_flash', impactVfx: 'sparks', audioFire, audioReload: '', automatic,
  modelSize, viewModelRotation: [0, Math.PI, 0],
});

/** Source fireRate values were seconds/shot; MIX uses rounds/second. */
export function createFpsStarterWeapons(): RangedWeaponDef[] {
  return [
    weapon('fps_ak47', 'AK47', 'rifle', 'fps_ak47', 34, 0.08, 30, 2, audio('ak47-single'), true, 0.7),
    weapon('fps_mp4', 'MP4', 'rifle', 'fps_mp4', 31, 0.09, 28, 1.9, audio('mp4-fire'), true, 0.65),
    weapon('fps_draco', 'DRACO', 'rifle', 'fps_draco', 29, 0.1, 20, 1.7, audio('draco-fire'), true, 0.5),
    weapon('fps_hipoint', 'Hi Point', 'pistol', 'fps_hipoint', 32, 0.2, 12, 1.5, audio('pistol-fire'), false, 0.25),
    // The source's sniper also uses the MP4 mesh, not a separate sniper model.
    weapon('fps_sniper', 'Sniper (MP4 model)', 'sniper', 'fps_mp4', 150, 1.2, 5, 3, audio('sniper-fire'), false, 0.7),
  ];
}

export function createFpsStarterSlots(): WeaponSlotDef[] {
  return createFpsStarterWeapons().map((w, index) => ({
    slot: index + 1, id: w.id, name: w.name,
    category: w.type as WeaponSlotDef['category'], damage: w.damage, fireRate: w.fireRate,
    magazineCapacity: w.magazineSize, reloadTime: w.reloadDuration, range: w.range,
    icon: w.type === 'sniper' ? '🎯' : '🔫', modelAssetId: w.modelAssetId,
    crosshairType: w.type === 'pistol' ? 'dot' : 'cross',
  }));
}

export function createFpsStarterGrenades(): GrenadeDef[] {
  return [{
    id: 'fps_frag', name: 'Frag Grenade', type: 'frag', blastRadius: 8, damage: 120,
    fuseTime: 2.5, throwVelocity: 16, bounciness: 0.45, icon: '💣',
    modelAssetId: 'fps_grenade', modelSize: 0.12,
    audioThrow: '', audioExplosion: audio('explosion'),
  }];
}
