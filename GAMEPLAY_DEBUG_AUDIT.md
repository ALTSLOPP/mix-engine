# Modular gameplay debug audit

Historical audit of the 27 systems registered at the time (not the current engine inventory). See the [generated catalog](docs/gameplay-features.generated.md) and [current modular contracts](docs/modular-gameplay-contracts.md).

This pass audited those systems, their player inputs, combat integration, command definitions, configuration persistence, and disposal. This is a code and automated-test pass; it does not certify every advertised mechanic as a finished game feature.

## Fixes by system

| System | Fixes / checks |
| --- | --- |
| Target lock | Reject missing combatants and friendly targets; separate lock from reload inputs; enable/disable restoration checked. |
| Timed hitboxes | Apply actual combat damage, follow moving attackers without bones, stop after owner destruction, reject noncombatants/friendlies, cancel on disable. |
| Combos | Count confirmed damaging hits, respect disabled state, reject empty chains, expire buffered inputs before cancel processing. |
| Dodge / guard / stamina | Guard direction uses attacker position; insufficient stamina breaks guard; dodge movement is bounded by duration; no resource consumption without a player; parry identifies its attacker. |
| Hit reactions | Only confirmed hits trigger reactions; hitstop uses the engine timer; airborne gravity continues through the launch apex; disabling clears reactions. |
| Abilities / elemental | Apply real damage; damage-over-time catches up ticks only within effect lifetime and triggers combat deaths; preserve caster attribution. |
| Enemy / boss AI | Arena uses the modular controller to pursue and attack the actual player; destroyed actors release attack tokens; boss transition timing uses simulation time. |
| Stats / progression | Equipment configuration replaces equipped bonuses; clamp health when maximum HP falls; reject invalid XP. |
| Arena waves | Recognize canonical destruction payloads; schedule spawns in simulation time; cancel pending spawns on defeat/disable; empty waves complete; attach working combat AI; pass the selected character through the builder's `assetId` parameter. |
| Stealth | Clear disabled stance/detection state; recheck backstab eligibility at execution; reject dead targets. |
| Parkour | Cancel actions on disable; exclude the player's capsule from obstacle rays; avoid competing with vehicle/dodge inputs. |
| Loot / inventory | Enemy combat deaths trigger drops; failed multi-item removals are atomic. |
| Dialogue | Disabling ends conversation; invalid choice indices fail safely; early-return input handling clears stale movement. |
| Ranged shooter | Resolve the actual struck collider; exclude the shooter; preserve custom camera FOV; apply weapon configuration changes; preserve magazine counts when switching. |
| Vehicle mount | Initialize configured boost duration; stable friction cannot reverse speed on long frames; disabling dismounts. |
| Grapple | Resolve the actual enemy collider; exclude the player; bound pull movement to prevent overshoot; release on disable. |
| Time mechanics | Slow-motion owners can close in either order; retain seconds of rewind history at different frame rates; reject another character's history; bound restored HP. |
| Crafting | Validate output and player availability before consuming ingredients; aggregate duplicate ingredient requirements; successful crafts deliver configured ground loot. |
| Companion | Disabling dismisses the body; bound following and attack-approach movement to prevent overshoot. |
| Weapon loadout | Tab + number selects without casting; initial slot selection equips its weapon; disabling closes the wheel and releases slow motion. |
| Cover / peeking | Separate cover from crouch inputs and target cycling; exclude the player from cover queries; disabling exits cover. |
| Explosives | Integrate only the remaining fuse interval with bounded physics steps; credit the thrower; protect zero-radius blasts; cancel on disable. |
| Killstreaks | Credit combat kills instead of arbitrary despawns; reset on player death; clear rewards on disable. |
| Bonfire checkpoint | Restore Vector3 positions after JSON loading; fast travel works after restoration and respects disabling; resting restores configured maximum MP. |
| Estus flasks | Reject use without a player; clamp charges after capacity changes; cancel pending drinking on disable. |
| Bloodstain / souls | Listen to the actual player-death event; credit combat kills; prevent negative spending; do not auto-recover onto a dead player. |
| Posture / visceral | Confirmed hits and attributed parries accumulate posture; clear destroyed/disabled actor state; reject invalid posture damage. |

## Shared integration

- Added the ten existing feature command handlers to the authoritative registry, schemas, and public `AICommand` type. Registry parity now covers 393 commands.
- Saved modular configurations in scene snapshots, canonical project documents, and canonical standalone-runtime loads. Snapshots are detached; restored enabled flags agree with the active-feature list.
- Added module-owned event unsubscription and engine disposal integration.
- Prevented kinematic character locomotion from overwriting movement owned by dodge, parkour, grapple, or mounted vehicles.
- Replaced raycast self-skipping with Rapier's rigid-body exclusion filter. A real Rapier regression covers a ray starting inside the player's collider.
- Added 69 regression cases in `test/gameplayFeatureRegressions.test.ts`, including enable/disable and JSON restoration for every registered system.

## Controls changed to resolve conflicts

| Action | Input |
| --- | --- |
| Target lock | L or middle mouse |
| Reload | R |
| Crimson flask | B |
| Grapple | J |
| Grenade | G |
| Cover | C |
| Crouch | Left Ctrl; C also works when cover is disabled |
| Select weapon | Hold Tab + weapon number |
| Cast ability | Number without Tab |

## Verification

- Original baseline: 727 tests passed, one failed because the ten feature handlers were absent from the command registry.
- Focused new regression suite: 69 passing tests.
- Final full suite: **797 passing tests across 133 files**.
- Editor and standalone runtime production builds passed. Results are recorded in `.gameplay-audit-tests-final.log` and `.gameplay-audit-build.log`. Vite reports existing mixed static/dynamic loader-import warnings; these did not fail either build.
- The editor and standalone-runtime builds are generated locally; nothing was published.

## Remaining prototype limitations

- No interactive visual playtest was performed. Animation availability, scene-specific traversal, feel, and HUD placement still need testing in actual game scenes.
- Several descriptions exceed the implemented mechanics: cover primarily exposes cover/lean state, gathering/discovery remains skeletal, and bonfire enemy respawn is an emitted hook rather than a complete world-reset implementation.
- Some status-effect metadata (for example stun and movement modifiers) is not yet a complete shared character-status pipeline. Damage-over-time was fixed; these broader mechanics were not implemented by this pass.
- Grenade bounce and some knockback/launch logic still assume a simple floor rather than complete terrain/wall collision handling.
- Saved feature configuration is not a complete gameplay save: inventories, progression, current souls, ongoing encounters, and per-weapon ammunition still require an authored save-state integration.

The workspace has no Git metadata. Scripted edits retain original-file backups under `.codex-gameplay-audit/backups`; the audit scripts and logs are local debugging artifacts.
