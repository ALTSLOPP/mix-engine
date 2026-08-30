# Modular gameplay contracts

See [the generated catalog](gameplay-features.generated.md) for current feature and preset counts. Regenerate it with `npm run docs:gameplay` after changing registrations.

## Activation and presets

Subsystem configuration is the single activation source. The duplicate manager active-feature set has been removed; queries, updates, commands and saved activation lists all read the same state. Optional modules are constructed inactive. The existing core feature list is explicitly enabled during manager construction.

`applyPreset(name)` replaces the previous configuration, disables old systems, restores registered initial runtime snapshots, applies defaults and enables the selected pack. It returns the exact enabled feature list. `addPreset(name)` is the explicit composition API. Preset IDs come from `GameplayPresets.ts`; feature IDs derive from `GameplayFeatureConfigMap`. Required integrations are declared in registry metadata and enabled automatically.

Configuration commands validate before mutation: known fields, types, finite numbers, registered limits and enum options, integer-step properties, and nested JSON/vector shapes. Subsystem gameplay actions must reject disabled calls. Administrative authoring, reset, restore and disposal are intentionally permitted while disabled.

Known configuration fields include defaults normalized by subsystem constructors. This keeps supported options (such as graphics settings added before their editor metadata) round-trippable without allowing arbitrary unknown keys.

## Points and events

`engine.gameplayFeatures.wallet` (also available as `gameplayWallet(engine)`) owns spendable zombie points. `getBalance`, `add`, `set` and `trySpend` use the actual PersistentGameState key/value API. A missing balance means zero, never unlimited credit. SessionFlow's round score remains separate from spendable currency.

Shooter fire/impact, perk acquisition, points changes and committed vehicle theft share `GameplayEventMap` payloads. Custom script events remain supported. WantedCrime alone converts `vehicle_theft_committed` into theft heat; civilian ejection is presentation, not another crime.

## Lifecycle and simulation

Disable stops simulation, owned visual presentation and temporary perk modifiers. Authored barricades survive disable/enable. `resetFeature(id)` restores defaults and initial captured runtime; disposal permanently releases resources. Simulation recovery uses `dt`, including zombie attacks and police vehicle exits; browser timers cannot advance these states through pause.

`disposeOwnedObject` releases procedural geometry/materials and deduplicates resources within a tree. Borrowed asset-cache models must first use their own disposal/release API. Shared textures are not owned by this helper.

## Persistence

Manager snapshot version 2 retains the legacy per-feature configuration fields and adds a `runtime` map routed through subsystem `toJSON/fromJSON` pairs. Older unversioned config-only snapshots remain readable. The main SaveSystem captures, validates and restores modular state after world/player restoration. Persistent wallet state travels through the existing key/value save layer.

Restore is replacement-based for captured runtime, including zombie wave progress and live zombies/projectiles, upgrade tiers and in-progress upgrades, perks, mystery-box spins, power/doors/traps, power-ups, bosses, hellhounds, buildables and wonder-weapon effects. Derived vectors and upgrade multipliers are rebuilt on load. Unknown future manager versions and invalid configuration fail validation before application.

Subsystems without a runtime serializer remain configuration-only; this does not promise arbitrary engine/physics state capture. Temporary runtime and presentation ownership remain explicit per subsystem rather than being inferred by reflection.

## Regression checks

`test/modularGameplayAudit.test.ts` covers registry bounds, preset replacement and command parity, real economy wiring, disable gates, perk cleanup, no-player targeting, shooter hearing, transaction-safe theft, persistence and resource disposal. Existing zombie fixtures use PersistentGameState rather than mocking the removed score API.

### Verification for this remediation

- Completed full suite: **1,148 tests passed across 165 files**.
- Final focused audit suite: **95 tests passed**, including live-state restore and pause/recovery checks.
- Final combined audit/general-gameplay rerun after the supported-settings compatibility fix: **110 tests passed**.
- TypeScript `--noEmit` checks passed.
- Vite production code bundling passed with `copyPublicDir: false`. The ordinary build was stopped during asset packaging; complete asset-package verification is not claimed. Temporary code-only output is in `dist-code-check/`, not a complete playable distribution.
- Follow-up isolated jsdom runs intermittently timed out while starting Vitest workers (before test execution). The final combined rerun completed successfully, including the jsdom gameplay tests.
