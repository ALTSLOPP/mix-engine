# Gemini implementation prompt: Crestbound content + remaining FPS features

Copy everything below the separator into Gemini with local filesystem/terminal access.

---

You are implementing reusable content and gameplay features in MIX Engine. Do the work in phases, with working integrations and tests—not just a plan, copied folders, disconnected classes, or placeholder buttons.

## Paths and purpose

- Destination: `C:\Users\Jetma\Downloads\mix engine`
- Shooter donor: `G:\Games\glb fps\glb-migration-project`
- Crestbound donor: `G:\Games\crestbound`

The goal is to let users quickly build shooting games and stylized action/adventure games in MIX. Keep the engine general-purpose. Do not turn the whole engine into either donor game, replace the editor, or require Unity/Electron to run exported browser games. Treat donor projects as read-only.

Inspect the current destination before editing; work may have continued since this prompt was written. Read applicable AGENTS.md instructions. Preserve unrelated changes and the recent PCG fixes. Do not reset or overwrite a dirty workspace. Maintain a progress checklist and a source-to-destination port ledger. Work phase by phase, testing each before moving on; if a phase is genuinely blocked, document the precise dependency rather than claiming it is done.

## Existing work: extend, do not redo

Read `docs/FPS_STARTER_CONTENT.md`, `docs/PCG_MAP_BUILDER.md`, `src/content/FpsStarterPack.ts`, `src/content/ContentModelInstance.ts`, and `test/fpsStarterContent.test.ts` in MIX.

The `fps_starter` feature preset already includes:

- Five models: AK47, MP4, DRACO, Hi Point pistol, grenade.
- Eleven firing/explosion WAV files and one grenade-throw animation asset.
- Five weapon profiles/slots; sniper intentionally reuses MP4, as in the donor.
- Camera-relative gun presentation, visible thrown grenades, imported firing/explosion sounds, and semi-auto trigger behavior.
- Asset browser entries and a Feature Hub button.

There is no separate imported shotgun/sniper mesh, no discovered reload/release sound, and no automatic grenade animation playback. Do not invent missing donor assets or substitute punch sounds. The current grenade simulation bounces on a fixed ground height; it is not environment-aware yet. The starter currently uses MIX's controller rather than the donor's complete FPS controller.

Preserve async model disposal/reference counting and the AssetManifest concurrent-load fix. Keep `src/content/fps-starter.catalog.json` and `public/assets/fps-starter/content.json` identical; Vite cannot import modules directly from `public`.

MIX already has ranged combat, loadouts, cover, waves, AI, abilities, dialogue, inventory, progression, objectives, session UI, camera/animation infrastructure, networking, and procedural cities. Reuse/extend those systems instead of creating parallel versions with competing input, damage, camera, persistence, or update loops.

Useful destination integration points:

- `src/features/gameplay/{GameplayFeatureManager,GameplayFeatureRegistry,RangedShooterSystem,WeaponLoadoutSystem,ExplosivesSystem,EncounterAISystem,CoverPeekingSystem,ArenaWaveSystem,SessionFlowSystem,DialogueSystem,ObjectiveTrackerSystem}.ts`
- `src/features/combat/{UltimateAttackStudio,AnimeCombatDirector}.ts`
- `src/features/city/` and `src/animation/` including sockets, IK, retargeting and animation notifications.
- `src/engine/{Engine,PlayerController,InputManager}.ts`, `src/ecs/CombatSystem.ts`, `src/network/`, `src/project/`, `src/export/`.
- Feature Hub, asset browser, command registry and command handlers under `src/editor/`, `src/commands/`, `src/ai/`.

## Crestbound findings to verify against current code

Crestbound is a Unity 6000.4.7f1 C# project. Its product docs call the overall JRPG Maskbound and the online mode Crestbound. Those donor-specific names, story rules and third-person-only design must not become global MIX requirements.

Some donor status documents are outdated: `GDD_VS_CODE_GAP.md` describes saves, dialogue, wildlife and other systems as missing, while current source contains implementations. Inspect code and tests; do not treat either documentation or a class name as proof of a finished playable feature. In particular, `WorldGenerator.cs` creates a logical node/route graph, NOT complete 3D terrain or collision. Puzzle logic and environmental roadblock policies still require actual scene interactions.

## Phase 1 — finish the offline shooting starter

Read shooter `renderer.js`, `mapEditor.js`, `networking.js`, `renderer/`, and the animation/model folders. Search symbols instead of relying on fixed line numbers. Helpful landmarks are `CLASS_DEFS`, `viewModelRig`, `findBestCover`, view-kick spring recovery, `getGunWallPushTarget`, wave state, FFA respawn, and CTF flag state.

Implement these as configurable MIX systems:

1. **FPS controller and weapon feel:** opt-in first-person camera, pointer-lock lifecycle, aim/hipfire transition, per-weapon aim offsets, recoil/recovery, movement sway/bob, sprint pose, weapon switch transitions, wall pushback. Keep existing third-person play working. Camera ownership must arbitrate FPS, aiming, cutscenes, pause/editor, possession and future photo mode. Do not let cinematic features steal the FPS camera by default.
2. **Animation content and runtime wiring:** inspect `Rifle shooting animations`, `Pistol Shooting Animations`, `DYING`, `SHOOTERS`, and `grenadethrow`. Import only needed unique clips/characters and dependencies. Retarget to MIX rigs, bind weapon sockets, and wire idle/move/aim/fire/reload/switch/throw/hit/death states where source clips actually exist. Handle missing clips explicitly. Prevent T-poses, root-motion drift and double-fired animation events. The grenade-throw GLB is already imported; reuse it.
3. **Combat presentation and tuning:** correct muzzle/socket placement; raycast from camera for aiming but prevent shooting through a wall at the muzzle; tracers/impacts and hit feedback; scoped/sniper presentation; ammo/reload/death/respawn HUD. Preserve per-weapon magazines, semi-auto versus auto, and the source seconds-per-shot to MIX rounds-per-second conversion. Keep damage in the existing combat path, not in presentation effects.
4. **Real grenades:** adapt the donor's useful behavior to Rapier/world collisions instead of retaining the flat-ground approximation. Test walls, slopes, stairs, bounce, fuse, direct/self/team damage policy, blast falloff and occlusion, pause, scene unload, floating-origin shifts and resource cleanup. Support additional grenade types only where implemented behavior or an explicit new implementation is documented.
5. **Ranged enemies:** cover selection/occupancy, patrol, sight checks, chase, strafing, aiming, reload, damage/death and wave reuse. Integrate with MIX navigation/AI/combat; do not paste the donor's monolithic render-loop AI. Cover reservations must release on death, despawn or feature disable. Enemies cannot see or shoot through solid geometry.
6. **Match templates:** configurable waves, FFA, TDM and CTF, player/AI spawning, respawn rules, score/time limits, win/loss/restart and scoreboard. Implement flag pickup/drop/return/capture as explicit state transitions. Adapt class loadouts/passives/abilities (assault, support mini-UAV, medic self-heal, sniper) into optional data-driven class definitions; no duplicated health/ammo stores or permanently active class effects.
7. **Gameplay map metadata:** adapt useful donor map data into MIX entities/components: player/team/enemy spawns, cover, patrols, flag bases, objectives, doors and collision. Provide import validation and a small playable arena preset. Use existing MIX editing/PCG workflows; do not transplant the donor map editor UI wholesale. Generated maps need accessible spawns and valid objectives, not just decorative geometry.

Acceptance: a new demo arena can be generated/loaded, a player can move/aim/fire/reload/switch/throw, enemies fight from cover, and each implemented mode starts, scores, ends and restarts without stale entities or listeners. Test both editor Play and the standalone runtime.

## Phase 2 — Crestbound reusable environment content

Inspect and selectively import these concrete sources:

- `Assets/Game/Art/Environment/City/ModernJRPG/`: `modern-jrpg-route-starter.fbx`, `modern-jrpg-sakura-family.fbx`, `modern-jrpg-balcony-blue.fbx`, and `SourceExports.md`.
- `Assets/Game/Art/Environment/City/Editor/ModernJrpgTownBuilder.cs` for layout recipes; `SaffronCityBuilder.cs` for additional useful layout ideas after assessing duplication.
- `Assets/Game/Art/Environment/Biomes/AnimeNature/Imported/Meshes/BasicNature/`: trees, rocks, bushes, grass and flowers.
- `Assets/Game/Art/Environment/Foliage/Rocks/Source/ghibli_style_rocks.glb`.
- `Assets/Game/Art/Characters/CityNPCs/Imported/` and `CityPedestrian.cs`; `Assets/Resources/OnlineEmotes/` for optional NPC/character animation content.

Create a compact `crestbound-starter` content catalog with stable IDs, source-relative paths, hashes, license status, scale/orientation and dependencies. Deduplicate against existing MIX assets and within the donor. Start with the three house variants and a representative nature set; do not copy every large character/clothing variant by default.

Prefer self-contained GLB after a verified conversion, or use existing FBX support when it retains the required textures/rigs reliably. Rebuild Unity materials into MIX-supported materials. Unity scenes, prefabs, ScriptableObjects, shaders and `.meta` GUIDs are not runtime assets for MIX. Explicitly map referenced textures/materials instead of assuming FBX importer results will match Unity. Never claim a conversion succeeded without loading the result.

Add asset browser categories, normalized placement, suitable collision and a named stylized-town PCG/scene recipe. Reuse the current city director; adapt donor layout ideas rather than replacing city generation. The town should have walkable roads, player/enemy spawns, a few usable cover points, and no buried/floating buildings. Check size and draw-call costs.

## Phase 3 — Crestbound attack targeting and cinematic presentation

Port the reusable behavior from:

- `Assets/Game/Presentation/AttackDefinition.cs`, `CreatureAttackRig.cs`, `CreaturePhysicsBody.cs`.
- `ImageAttackProfile.cs`, `ImageAttackEffect.cs`, `ElementalAttackEffect.cs`, `CombatImpactFeedback.cs`.
- `Camera/BattleCameraShotPlanner.cs`, `Camera/AAABattleCameraProfile.cs`, `Camera/AAABattleCameraDirector.cs`.
- `Assets/Game/Tools/Editor/AttackStudioWindow.cs` as authoring UX reference, not Unity editor code to copy.

Extend MIX's existing Attack Studio/director with authored sockets plus proportional fallback anchors, body-relative source/target offsets, adaptive hit zones for different body sizes, direct/curved projectile trajectories, windup/active/recovery timing, optional image silhouettes/element presets, and size-aware camera framing. Convert configuration to validated JSON/TypeScript data. Keep visual aim assistance separate from authoritative hit validation: a cosmetic projectile must not manufacture a gameplay hit through walls.

Port the intent of `AttackBodyGeometryTests.cs` and `BattleCameraShotPlannerTests.cs`. Demonstrate small-to-large, large-to-small and similarly sized actors. Verify effects/camera restore on interruption, death, pause, editor return and scene unload. Reuse MIX's tween/effects facilities; do not copy DOTween Pro or Unity shader code as browser dependencies. Implement equivalent material behavior only where useful, with a basic fallback.

## Phase 4 — Crestbound world encounters, quests, puzzles and persistence

Port generic mechanisms, with game-specific content supplied as optional sample data:

- Seeded world graph/POIs: `WorldGeneration/WorldGenerator.cs`, `WorldModels.cs`, `LandmarkGenerator.cs`.
- Encounters/time/ecology: `EncounterDirector.cs`, `RouteEncounterTable.cs`, `DayNightCycle.cs`, `WorldEventSystem.cs`, `LivingWorldAgents.cs`, `SpiritInstincts.cs`.
- Quests and traversal gates: `QuestBoard.cs`, `EnvironmentalRoadblocks.cs`.
- Puzzles: `Puzzles/PuzzleContracts.cs`, `CircuitPlatesPuzzle.cs`, `SequenceLockPuzzle.cs`, `PillarWeightPuzzle.cs`, `FloorPlateSequencePuzzle.cs`.
- Dialogue and save patterns: `Core/Dialogue/`, `Core/Save/`, especially `CampaignSaveService.cs`, `CampaignSaveFile.cs`, `CampaignSaveCodec.cs`.

Connect the graph to actual MIX 3D spawns/POIs; distinguish abstract wildlife population decisions from physical NPC movement. Use injected seeds and simulation clocks, not frame-rate-dependent random calls. Borrow `Infrastructure/SeededRandomSource.cs`, `SeedUtility.cs` and clock patterns where needed, with explicit C# integer/overflow semantics if preserving donor reproducibility.

Extend existing MIX dialogue/objectives/inventory rather than adding duplicate UI/state. Implement explore/defeat/deliver-style objectives only when their event paths work, reward claiming once, persistent world flags, and ability/item/flag-gated obstacles. Build at least one visible interactable puzzle with reset and completion feedback, then cover the remaining implemented puzzle cores. Do not advertise enum-only puzzle types as complete. Validate ownership, indices and replayed command sequences; donor code is a reference, not a guarantee those guards already exist.

Use MIX project/runtime serialization for configuration and a clearly separated player-progress save layer for mutable quest/inventory/world state. Do not replace MIX's project format with Crestbound's binary save format. Adapt version migration, bounds validation, recovery/backup and stable IDs. Preserve existing user saves. Include save/load tests for claimed rewards, unlocked gates and puzzle progress.

Acceptance: a small adventure sample has an NPC quest, a generated encounter/POI, a physical puzzle/gate and a reward, all persistent across the supported save/load workflow. Same seed and inputs produce the same domain results. No need to port the entire creature RPG to achieve this.

## Phase 5 — remaining shooter multiplayer, with Crestbound policy patterns

Complete the donor's useful multiplayer features after the offline modes work: host/join/lobby, player/team identity, spawn/respawn, weapon/fire/grenade events, scores/flags, late join, disconnect and restart. Use MIX's existing `NetworkSystem`, snapshot/prediction and transport abstractions. Prefer local/loopback tests first; do not provision paid services, publish a server, expose ports, or transmit credentials without explicit user direction.

Do NOT copy shooter `networking.js` verbatim. Its `sendHit(targetPeerId, damage, zone)` sends client-provided damage and its host HIT handler relays it. Replace that trust model: clients submit bounded intents; the host validates identity/ownership, sequence/timing, alive state, equipped weapon, cooldown/ammo, plausible origin/aim/range, collision and objective state, and computes outcomes. Host authority improves trust boundaries but is not a claim of cheat-proof competitive networking.

Crestbound references for reusable policy/test patterns:

- `Assets/Game/Network/{OnlineCommandValidator,CommandOwnershipPolicy,CommandRateLimiter,ServerConnectionGuard,PlayerInputPolicy,ExplorationMotorPolicy}.cs`
- `HandshakeValidator.cs`, `NetBuildStampRules.cs`, `ReconnectRegistry.cs`, `ConnectionLivenessRegistry.cs`, `BoundedSendBuffer.cs`, `HostRecoveryRules.cs`.
- `Assets/Game/Tests/EditMode/{NetworkPolicyTests,AuthoritativeMovementTests,OnlineBugSweepRegressionTests}.cs`.

These are largely RPG/session policies, not ready-made FPS lag compensation. Adapt only relevant concepts to MIX's protocol. Do not transplant Unity Mirror, Relay, Lobby, authentication service plumbing or hardcoded five-player constraints. Local reconnect/late-join support is required; full host migration is optional and must not be advertised unless tested. Add malformed-packet, spoofed-identity, duplicate-intent, excessive-fire-rate, invalid-grenade and forged-flag tests. Offline functionality must remain available without a network service.

## Deliberately deferred Crestbound features

List these as future optional packs, not prerequisites for the requested starter ports:

- Full deterministic turn-based creature battles, six-slot parties, capture/contracts/masks, breeding/evolution and donor-specific lore/progression.
- Fishing, photo mode, journal/phone, trading, tournaments and social features beyond the shooter multiplayer scope.
- Large CC4 clothing libraries, character variants, and any assets with unclear redistribution rights.

There is useful code here, but importing all of it would expand the engine and UI far beyond the immediate quick-game goal. Do not silently implement it as always-on behavior.

## Engineering and safety requirements

- Source projects remain unchanged. Do not copy `Library`, `Temp`, `obj`, `Builds`, `.git`, `.vs`, `node_modules`, executables, installers or entire vendor trees.
- Preserve license/attribution files. Record unknown rights; never assert redistribution permission based solely on file possession. Do not bundle paid plugins or uncertain third-party character/clothing assets for release without confirmation. The existing FPS pack also has unverified rights.
- Do not copy the shooter's permissive Electron security settings or machine-specific paths. Runtime URLs must resolve from the packaged destination, not G:.
- Feature flags default safely; presets enable related features deliberately. Define config validation, reset, teardown and save/load behavior. Remove listeners/timers/physics objects and release cached resources correctly.
- Distinguish simulation time from wall time. Handle pause, variable frame rates, disabled features, no possessed player, floating-origin rebasing and scene reload.
- Expose useful settings through Feature Hub and validated commands, with UI/schema/types/handler parity. Do not add an empty setting or button that has no working behavior.
- Keep editor and standalone runtime behavior aligned. Export must include model, animation, texture and audio dependencies actually referenced by enabled content. Test without the donor drives accessible.

## Verification and delivery

1. Capture a baseline before making changes. Add focused Vitest tests per phase and port relevant donor test cases, not just implementation code.
2. Run `npm run typecheck`, focused tests and the full test suite. The previous MIX run passed 866 tests across 145 files, but three worker-start timeouts affected `generalGameplay`, `lightBuilder` and `postFxPasses`; this is historical context, not permission to dismiss new failures. Report assertion failures separately from infrastructure failures, and do not call an incomplete run clean.
3. Check both Vite dev serving and production/editor/runtime compilation. A previous public-JSON module import worked in production but failed in dev.
4. For quick compilation checks, use Vite's programmatic `build` with `write:false`, `copyPublicDir:false`, `emptyOutDir:false`, including `vite.runtime.config.ts`. The public directory is large; don't repeatedly duplicate many gigabytes for code-only checks. Perform one complete supported package/export verification at the end, or explicitly report why it could not be performed. Do not ship old/stale dist output as the result.
5. In a browser, verify textures, rig animation, camera transitions, audio playback, controls, collisions, UI and restart. Exercise representative imported assets rather than relying only on file existence. Provide repeatable demo steps and screenshots where available.
6. Deliver a port ledger mapping donor files to destination modules/assets, a rights/dependency manifest, preset/controls docs, implemented-versus-deferred checklist, test/build results and honest limitations. Include at least a shooter arena and a stylized adventure/town sample. Do not overwrite the user's active scene to show demos.

Start by inspecting the current MIX project and both sources, identify overlaps, then implement Phase 1. Continue through the required phases with clear checkpoints and regression checks. Ask only when missing access, ambiguous ownership/rights, external services, or a material design decision blocks safe progress.
