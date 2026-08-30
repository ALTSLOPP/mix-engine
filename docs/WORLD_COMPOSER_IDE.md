# MIX World Composer — IDE command guide

World Composer is the high-level map-authoring layer for Codex, Claude Code, Antigravity, MCP clients,
and the in-engine JSON terminal. It turns a small declarative recipe into a coherent live 3D world.
The low-level `terrain_*`, `water_*`, `foliage_*`, and rendering commands remain available for edits.

## Fastest useful command

```json
{
  "type": "world_compose",
  "seed": 93021,
  "theme": "alpine",
  "landform": "highlands",
  "mood": "cinematic",
  "quality": "balanced"
}
```

With `autoLayout` left on, the composer adds a flattened player start, central landmark, scenic
overlook, and a painted/conformed hero route. Tropical and coastal recipes also receive a carved
watershed. The same seed and inputs produce the same recipe and terrain.

## Full authored recipe

```json
{
  "type": "world_compose",
  "seed": 8128,
  "theme": "fantasy",
  "landform": "valley",
  "mood": "dreamlike",
  "quality": "aaa",
  "size": 1536,
  "center": [0, 0],
  "water": true,
  "foliage": true,
  "navigation": true,
  "autoLayout": false,
  "pointsOfInterest": [
    { "name": "village", "kind": "settlement", "x": -260, "z": 120, "radius": 45 },
    { "name": "ancient_gate", "kind": "landmark", "x": 20, "z": -30, "radius": 32 },
    { "name": "dragon_peak", "kind": "vista", "x": 310, "z": -240, "radius": 24, "height": 115 }
  ],
  "paths": [
    {
      "name": "king_road",
      "kind": "road",
      "width": 14,
      "materialLayer": 1,
      "points": [
        { "x": -260, "z": 120 },
        { "x": -120, "z": 30 },
        { "x": 20, "z": -30 },
        { "x": 310, "z": -240 }
      ]
    },
    {
      "name": "silver_river",
      "kind": "river",
      "width": 22,
      "depth": 4,
      "points": [
        { "x": 260, "z": 260 },
        { "x": 80, "z": 100 },
        { "x": -90, "z": -30 },
        { "x": -430, "z": -260 }
      ]
    }
  ]
}
```

Point heights are inferred from the generated terrain when omitted. Roads and trails blend the
terrain toward a smooth driveable/walkable spline and paint a material corridor. Rivers only cut
downward, so they do not create unnatural embankments. Named points of interest are also registered
as semantic navigation landmarks.

## Vocabulary

- `theme`: `temperate`, `tropical`, `desert`, `arctic`, `volcanic`, `alpine`, `coastal`, `fantasy`
- `landform`: `continent`, `island`, `archipelago`, `highlands`, `valley`, `plains`
- `mood`: `bright`, `cinematic`, `moody`, `stormy`, `dreamlike`
- `quality`: `draft`, `balanced`, `aaa`
- path `kind`: `road`, `trail`, `river`
- POI `kind`: `spawn`, `settlement`, `landmark`, `vista`

`draft` uses a 129² terrain and skips navigation by default. `balanced` uses 257² terrain and a 2 m
navigation grid. `aaa` uses 513² terrain and a 1.5 m navigation grid. Very large maps bake the central
2048 m first; enable `navmesh_auto` for streamed regions.

## Agent verification loop

1. Run `world_compose` and keep its structured response.
2. Run `world_report`. Resolve failed live checks and review normalization/bounds warnings.
3. Use HELM `observe` to inspect frame health, visibility, composition, and scale.
4. Add assets with `spawn_smart`, prefabs, or normal entity commands at named POIs.
5. Use `checkpoint` before fine terrain/material edits and `restore` when an experiment fails.
6. Switch the recipe to `quality:"aaa"`, rebuild, run `world_report`, then perform a SENSORIUM test.

`world_report` calls its grade “world-composition readiness.” It verifies that the requested systems
are live and connected; it does not claim that unreviewed art assets are automatically shipping AAA.
