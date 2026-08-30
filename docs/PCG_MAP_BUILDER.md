# PCG map builder

The city generator is available through `engine.gameplayFeatures.city`,
`api.city.generate(config)` in entity scripts, and the `city_*` commands.

## Generate a complete city

```json
{"type":"city_generate_world","worldSize":400,"roadAlgorithm":"Grid","roadDensity":0.6,"seed":42}
```

Generation uses the feature's stored settings, with explicit command arguments
taking precedence for that call. `city_generate_world`, `city_build_roads`, and
successful blueprint loads replace the previous city.

## Build in stages

Execute these commands in order:

```json
[
  {"type":"city_build_roads","worldSize":400,"roadAlgorithm":"Radial","roadDensity":0.6,"seed":42},
  {"type":"city_zone_districts"},
  {"type":"city_spawn_buildings","seed":42}
]
```

Road building also accepts the older `algorithm` and `density` argument names.
Zoning preserves roads and bridges but removes outdated buildings, props, and
vegetation. Building placement replaces only buildings on the current parcels,
including parcels from a blueprint. Neither stage silently creates a new network
when the city is empty.

`feature_apply_preset` accepts `city_builder` and `gta_open_world`. The built-in
blueprint name is `GTA_Los_Santos`. Invalid names or malformed blueprint grids leave
the current city intact.

## Collision and lifetime

Roads, sidewalks, buildings, bridge structures, props, and tree trunks have static
Rapier collision surfaces. Markings and tree canopies do not. Disabling the feature
hides the city and disables its bodies; re-enabling restores both. `city_clear`
removes city meshes and their bodies without removing other world objects.
Scene-root and physics-body shifts keep the city aligned with the floating origin.

Generated geometry remains runtime-owned, not individual editable/saved ECS
entities. Projects that need it after reload should rerun their generation recipe.

## Regression checks

Run `npm test -- test/proceduralCity.test.ts test/proceduralCityRegressions.test.ts`.
Coverage includes triangle topology, configuration, staged commands, blueprint
error handling, command validation, real collision response, body cleanup, and
floating-origin alignment.
