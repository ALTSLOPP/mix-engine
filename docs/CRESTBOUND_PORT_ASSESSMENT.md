# Crestbound → MIX: recommended ports

Source inspected: `G:\Games\crestbound` (Unity 6000.4.7f1). This is a source-code/content assessment, not a claim that its scenes or tests were run.

## Priority

| Order | Port | Why it helps MIX | Important boundary |
| --- | --- | --- | --- |
| 1 | Three Modern JRPG house variants + selected nature props | Immediately useful town/arena content for the PCG map builder | Convert/verify FBX materials, scale and collision; don't copy Unity scenes as runtime files |
| 2 | Body-aware attack anchors, adaptive hit zones, trajectories and camera framing | Makes attacks readable across humans, creatures and differently sized bosses | Extend MIX Attack Studio; presentation must not decide damage |
| 3 | Seeded encounter/world graph, day/night, wildlife decisions | Adds gameplay locations and population behavior to generated maps | Donor graph is not a 3D terrain generator; node movement is not physical navigation |
| 4 | Quest board, traversal gates and four puzzle cores | Reusable adventure objectives and interactable map content | Integrate MIX objectives/dialogue/inventory; puzzle logic needs visible scene interactions |
| 5 | Save migration/recovery and network validation patterns | Useful support for persistent adventure content and shooter multiplayer | Adapt to MIX formats/protocols; don't transplant Unity services or claim cheat-proof networking |

## Concrete source references

- Art: `Assets/Game/Art/Environment/City/ModernJRPG/`, `Biomes/AnimeNature/Imported/Meshes/BasicNature/`, and `Foliage/Rocks/Source/ghibli_style_rocks.glb` (the latter two under `Assets/Game/Art/Environment/`).
- Layout: `Assets/Game/Art/Environment/City/Editor/ModernJrpgTownBuilder.cs`.
- Attacks: `Assets/Game/Presentation/AttackDefinition.cs`, `CreatureAttackRig.cs`, `ImageAttackProfile.cs`, `ElementalAttackEffect.cs`.
- Camera: `Assets/Game/Presentation/Camera/BattleCameraShotPlanner.cs` and companion profile/director; existing tests cover extreme size mismatch.
- World: `Assets/Game/WorldGeneration/{WorldGenerator,LivingWorldAgents,DayNightCycle,EncounterDirector,QuestBoard,EnvironmentalRoadblocks}.cs` and `Puzzles/`.
- Persistence: `Assets/Game/Core/Save/`; `CampaignSaveCodec.cs` currently declares version 10.
- Network patterns: `Assets/Game/Network/{OnlineCommandValidator,CommandOwnershipPolicy,CommandRateLimiter,ServerConnectionGuard}.cs` and accompanying tests.

## Optional later

City NPCs/emotes are useful after rig and rights checks. Fishing/photo mode can become small optional features. The full creature-battle, mask/contract, evolution/breeding, journal and social systems belong in a separate RPG pack—not in the default shooter starter. CC4 clothing and third-party character libraries need a separate rights and size audit.

## Findings that affect the handoff

- Some donor status documents are stale: current code has saves, dialogue, masks and wildlife despite older gap lists saying otherwise. Use implementations plus tests as evidence.
- The donor's nature/town art, shaders and DOTween/Mirror integrations are not drop-in Three.js/browser code. Reuse data and algorithms; rebuild integration in MIX.
- MIX already has dialogue, inventory, combat, cameras, networking and city generation. Port missing capabilities into them, not duplicate subsystems.
- The shooter donor's host relays client-provided hit damage. Completing that port should use host-validated intents and MIX networking, informed by Crestbound's validation patterns.
- No new assets were imported or gameplay code changed during this assessment. Licensing and final asset selection remain implementation checkpoints.

The complete implementation handoff is `docs/GEMINI_TWO_PROJECT_PORT_PROMPT.md`.
