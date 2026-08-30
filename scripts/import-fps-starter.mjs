// Copy only the selected source content; never modify the source project.
// Usage: node scripts/import-fps-starter.mjs <source-project> > manifest-preview.json
// The JSON on stdout is the provenance manifest to review before checking it in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Pass the glb-migration-project source directory.');
const destination = fileURLToPath(new URL('../public/assets/fps-starter/', import.meta.url));
const selections = [
  ['fps_ak47', 'AK47 Rifle', 'model', 'GUNS/AK47 Rifle/base_basic_pbr.glb', 'models/ak47.glb', 0.88],
  ['fps_mp4', 'MP4 Rifle', 'model', 'GUNS/MP4 Rifle/base_basic_pbr.glb', 'models/mp4.glb', 0.75],
  ['fps_draco', 'DRACO SMG', 'model', 'GUNS/DRACO/base_basic_pbr.glb', 'models/draco.glb', 0.5],
  ['fps_hipoint', 'Hi Point Pistol', 'model', 'GUNS/Hi point pistol/base_basic_pbr.glb', 'models/hipoint.glb', 0.22],
  ['fps_grenade', 'Frag Grenade', 'model', 'GUNS/grenade/base_basic_pbr.glb', 'models/grenade.glb', 0.12],
  ['fps_grenade_throw', 'Grenade Throw', 'animation', 'grenadethrow/grenade throw.glb', 'animations/grenade-throw.glb'],
  ['fps_ak47_fire', 'AK47 Fire', 'audio', 'gun sounds/Assautl rifles/Ak47 Cod Shooting Sound.wav', 'audio/ak47-fire.wav'],
  ['fps_ak47_single', 'AK47 Single Shot', 'audio', 'gun sounds/Assautl rifles/Single Ak47 Shot Soundaaa Professional Sound For Gaming.wav', 'audio/ak47-single.wav'],
  ['fps_rifle_fire', 'Assault Rifle Fire', 'audio', 'gun sounds/Assautl rifles/ASSAULT RIFLEGunshot.wav', 'audio/rifle-fire.wav'],
  ['fps_mp4_fire', 'MP4 Fire', 'audio', 'gun sounds/light smg (Dracos)/Mp4 Gun Sound Shooting.wav', 'audio/mp4-fire.wav'],
  ['fps_draco_fire', 'DRACO Fire', 'audio', 'gun sounds/light smg (Dracos)/Draco Gun Sound Shooting.wav', 'audio/draco-fire.wav'],
  ['fps_pistol_fire', 'Pistol Fire', 'audio', 'gun sounds/hi-point/Pistol Shooting Sound Effect.wav', 'audio/pistol-fire.wav'],
  ['fps_shotgun_fire', 'Shotgun Fire', 'audio', 'gun sounds/shotguns/Shotgun Sound.wav', 'audio/shotgun-fire.wav'],
  ['fps_shotgun_blast', 'Shotgun Blast', 'audio', 'gun sounds/shotguns/level 1Powerful Single Shotgun Blast.wav', 'audio/shotgun-blast.wav'],
  ['fps_sniper_fire', 'Sniper Fire', 'audio', 'gun sounds/snipers/Sniper Rifle Sound Shooting.wav', 'audio/sniper-fire.wav'],
  ['fps_sniper_fire_alt', 'Sniper Fire Alt', 'audio', 'gun sounds/snipers/Sniper Rifle Sound Shooting 2.wav', 'audio/sniper-fire-alt.wav'],
  ['fps_explosion', 'Grenade Explosion', 'audio', 'gun sounds/EXPLOSIONS/Explosion (Edit).wav', 'audio/explosion.wav'],
];

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Validate the entire selection before creating destination files.
const assets = selections.map(([id, name, kind, source, relativePath, targetSize]) => {
  const bytes = fs.readFileSync(path.join(sourceRoot, source));
  const target = path.join(destination, relativePath);
  const sha256 = hash(bytes);
  if (fs.existsSync(target) && hash(fs.readFileSync(target)) !== sha256) {
    throw new Error(`Refusing to overwrite different existing content: ${target}`);
  }
  return { id, name, kind, source, path: `/assets/fps-starter/${relativePath}`, targetSize, bytes: bytes.length, sha256 };
});
for (const asset of assets) {
  const target = path.join(destination, asset.path.replace('/assets/fps-starter/', ''));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(sourceRoot, asset.source), target);
  if (hash(fs.readFileSync(target)) !== asset.sha256) throw new Error(`Copy integrity failed: ${target}`);
}
console.log(JSON.stringify({
  id: 'fps-starter', version: 1, sourceProject: 'glb-migration-project',
  licenseStatus: 'unverified',
  licenseNote: 'No asset license or redistribution grant was found in the source project. Imported at the project owner request for local bundled content; verify rights before distributing engine or game builds. Original filenames are retained in source metadata; no new license is asserted.',
  assets,
}, null, 2));
