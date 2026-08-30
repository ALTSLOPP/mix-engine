# FPS Starter Content

The engine now bundles the selected content from `G:\Games\glb fps\glb-migration-project` locally under `public/assets/fps-starter`. It does not depend on that drive at runtime.

## Quick start

1. Open Feature Hub and choose **FPS Starter Content**. This applies the shooter feature preset, then installs the imported weapon loadout and frag grenade.
2. Create/possess a player using the existing engine workflow and enter Play.
3. Left mouse fires (including hipfire); right mouse aims; R reloads; 1–5 select weapons; G throws a grenade. The pistol and sniper require a new press per shot.
4. Use **Weapons** in the asset browser to place the models as props. **Gun Sounds** exposes sound preview buttons.

The equivalent command is `{ "type": "feature_apply_preset", "preset": "fps_starter" }`.
Applying the preset changes gameplay feature settings and replaces the current weapon/grenade definitions; it does not generate a map or spawn a player.

## Included content

- Five textured, self-contained GLBs: AK47, MP4, DRACO, Hi Point pistol, frag grenade.
- Eleven WAVs: gunfire variants (including shotgun/sniper sounds) and an explosion.
- One grenade-throw animation GLB, registered for animation workflows; automatic character retargeting/throw-state playback is not included.
- Five configured weapon slots. The sniper reuses the MP4 mesh, matching the source project. There is no separate sniper or shotgun mesh in this pack.
- Camera-relative weapon presentation, visible thrown grenade models, source fire-rate conversion from seconds/shot to rounds/second, and imported firing/explosion audio. No reload or grenade-release sound was found, so those actions are silent in this preset.

This is a content/starter integration, not a wholesale port of the donor game's FPS controller, animated hands, recoil/ADS system, AI or multiplayer. It uses MIX's existing camera/controller and grenade simulation; grenade bounces currently use the existing flat-ground approximation, not full environment collision.

## Provenance and packaging

`public/assets/fps-starter/content.json` records source-relative filenames, exact byte counts and SHA-256 hashes. All binary files are unchanged copies. `scripts/import-fps-starter.mjs <source-directory>` can verify/repeat the import and refuses conflicting destination bytes.

The code-facing copy is `src/content/fps-starter.catalog.json` because Vite does not permit module imports from `public`; update both catalogs together. A regression test checks they match.

No asset license or redistribution grant was found in the selected source folders. Rights are recorded as **unverified**, not reassigned. Verify your rights before publishing a game containing these assets.

Normal public-directory builds include this pack. For selective asset packaging, include the URLs exported as `FPS_STARTER_ASSET_PATHS` from `src/content/FpsStarterPack.ts`, together with any other scene dependencies; model IDs alone are not file paths. The catalog is also available as `FPS_STARTER_CONTENT`.

The development preview at `/artifacts/fps-content-preview.html` renders all five models through the engine asset pipeline and decodes all eleven sound files. It does not modify a game scene.

## Recommended next ports

1. **Rifle/pistol locomotion, shooting and death animations + shooter characters.** Sources: `Rifle shooting animations`, `Pistol Shooting Animations`, `DYING`, `SHOOTERS`. Retarget them to MIX skeletons and replace placeholder melee shooting transitions.
2. **Weapon feel and first-person controller.** Adapt donor `renderer.js` recoil springs, aim offsets, sway and wall pushback to MIX input/camera lifecycle; add correct muzzle placement, animated reloads and environment-aware grenades.
3. **Cover-aware ranged enemy AI.** Adapt donor cover selection/occupancy penalties, strafing, patrol and shooting to MIX's entity/physics systems. This gives generated maps useful combat behavior.
4. **Arena match templates and map metadata.** Port FFA/waves/CTF rules, respawn and scoring, plus map-editor spawn/cover/flag markers. Keep this data-driven so PCG maps can reuse it.

Multiplayer should come later: donor PeerJS networking accepts client-supplied hit damage and needs host-side validation before reuse. Do not copy its Electron `nodeIntegration`/`webSecurity` settings or machine-specific paths into the engine.
