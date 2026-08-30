/**
 * MIX Engine Command Registry — TERRAIN domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const terrainCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "terrain_lod",
    summary: "Configure terrain level-of-detail distances.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "distances": {
                      "type": "array",
                      "description": "Parameter distances",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "terrain_scatter",
    summary: "Configure or regenerate terrain scatter.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "enabled": {
                      "type": "boolean",
                      "description": "Parameter enabled",
                      "required": false
                },
                "density": {
                      "type": "any",
                      "description": "Parameter density",
                      "required": false
                },
                "regenerate": {
                      "type": "any",
                      "description": "Parameter regenerate",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "terrain_create",
    summary: "TERRAIN: create a sculptable terrain mesh at a world position.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "x": {
                      "type": "number",
                      "description": "Parameter x",
                      "required": true
                },
                "y": {
                      "type": "number",
                      "description": "Parameter y",
                      "required": true
                },
                "z": {
                      "type": "number",
                      "description": "Parameter z",
                      "required": true
                },
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": false
                },
                "resolution": {
                      "type": "any",
                      "description": "Parameter resolution",
                      "required": false
                },
                "materialId": {
                      "type": "any",
                      "description": "Parameter materialId",
                      "required": false
                },
                "seed": {
                      "type": "number",
                      "description": "Parameter seed",
                      "required": false
                },
                "baseNoiseAmplitude": {
                      "type": "any",
                      "description": "Parameter baseNoiseAmplitude",
                      "required": false
                }
          },
          "requiredProperties": [
                "x",
                "y",
                "z"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "terrain_sculpt",
    summary: "TERRAIN: apply a sculpting operation.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "op": {
                      "type": "string",
                      "description": "Parameter op",
                      "required": true
                },
                "x": {
                      "type": "number",
                      "description": "Parameter x",
                      "required": true
                },
                "z": {
                      "type": "number",
                      "description": "Parameter z",
                      "required": true
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": true
                },
                "strength": {
                      "type": "number",
                      "description": "Parameter strength",
                      "required": false
                },
                "hardness": {
                      "type": "number",
                      "description": "Parameter hardness",
                      "required": false
                },
                "targetHeight": {
                      "type": "any",
                      "description": "Parameter targetHeight",
                      "required": false
                },
                "terraceStep": {
                      "type": "any",
                      "description": "Parameter terraceStep",
                      "required": false
                }
          },
          "requiredProperties": [
                "op",
                "x",
                "z",
                "radius"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "terrain_ramp",
    summary: "TERRAIN: apply a linear ramp.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "from": {
                      "type": "string",
                      "description": "Parameter from",
                      "required": true
                },
                "to": {
                      "type": "string",
                      "description": "Parameter to",
                      "required": true
                },
                "width": {
                      "type": "number",
                      "description": "Parameter width",
                      "required": true
                },
                "hardness": {
                      "type": "number",
                      "description": "Parameter hardness",
                      "required": false
                }
          },
          "requiredProperties": [
                "from",
                "to",
                "width"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "terrain_noise",
    summary: "TERRAIN: apply fBm noise.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "x": {
                      "type": "number",
                      "description": "Parameter x",
                      "required": true
                },
                "z": {
                      "type": "number",
                      "description": "Parameter z",
                      "required": true
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": true
                },
                "amplitude": {
                      "type": "number",
                      "description": "Parameter amplitude",
                      "required": true
                },
                "frequency": {
                      "type": "number",
                      "description": "Parameter frequency",
                      "required": false
                },
                "octaves": {
                      "type": "number",
                      "description": "Parameter octaves",
                      "required": false
                },
                "seed": {
                      "type": "number",
                      "description": "Parameter seed",
                      "required": false
                },
                "hardness": {
                      "type": "number",
                      "description": "Parameter hardness",
                      "required": false
                }
          },
          "requiredProperties": [
                "x",
                "z",
                "radius",
                "amplitude"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "terrain_erode",
    summary: "TERRAIN: apply hydraulic/thermal erosion.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "kind": {
                      "type": "string",
                      "description": "Parameter kind",
                      "required": true
                },
                "x": {
                      "type": "number",
                      "description": "Parameter x",
                      "required": false
                },
                "z": {
                      "type": "number",
                      "description": "Parameter z",
                      "required": false
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": false
                },
                "iterations": {
                      "type": "number",
                      "description": "Parameter iterations",
                      "required": false
                },
                "options": {
                      "type": "object",
                      "description": "Parameter options",
                      "required": false
                }
          },
          "requiredProperties": [
                "kind"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "terrain_paint",
    summary: "TERRAIN: apply multi-layer material painting.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "layer": {
                      "type": "string",
                      "description": "Parameter layer",
                      "required": true
                },
                "x": {
                      "type": "number",
                      "description": "Parameter x",
                      "required": true
                },
                "z": {
                      "type": "number",
                      "description": "Parameter z",
                      "required": true
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": true
                },
                "strength": {
                      "type": "number",
                      "description": "Parameter strength",
                      "required": false
                },
                "hardness": {
                      "type": "number",
                      "description": "Parameter hardness",
                      "required": false
                }
          },
          "requiredProperties": [
                "layer",
                "x",
                "z",
                "radius"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "terrain_material_layers",
    summary: "TERRAIN: set material layers (presets/URLs).",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "layers": {
                      "type": "array",
                      "description": "Parameter layers",
                      "required": true
                }
          },
          "requiredProperties": [
                "layers"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "terrain_spline",
    summary: "TERRAIN: conform terrain to a path.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "points": {
                      "type": "array",
                      "description": "Parameter points",
                      "required": true
                },
                "width": {
                      "type": "number",
                      "description": "Parameter width",
                      "required": true
                },
                "hardness": {
                      "type": "number",
                      "description": "Parameter hardness",
                      "required": false
                }
          },
          "requiredProperties": [
                "points",
                "width"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "terrain_sample",
    summary: "TERRAIN: query world height at (x,z).",
    category: "terrain",
    sideEffect: "read",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "x": {
                      "type": "number",
                      "description": "Parameter x",
                      "required": true
                },
                "z": {
                      "type": "number",
                      "description": "Parameter z",
                      "required": true
                }
          },
          "requiredProperties": [
                "x",
                "z"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "terrain_reset",
    summary: "TERRAIN: reset terrain height to 0.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "destructive.clear",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "world_generate",
    summary: "WORLDGEN: procedurally generate an entire open world (continents/mountains/biomes/auto-texture/scatter) from a seed; creates a terrain if none exists. Returns height range + biome histogram.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "seed": {
                      "type": "number",
                      "description": "Parameter seed",
                      "required": false
                },
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": false
                },
                "resolution": {
                      "type": "any",
                      "description": "Parameter resolution",
                      "required": false
                },
                "amplitude": {
                      "type": "number",
                      "description": "Parameter amplitude",
                      "required": false
                },
                "oceanDepthRatio": {
                      "type": "number",
                      "description": "Parameter oceanDepthRatio",
                      "required": false
                },
                "continentScale": {
                      "type": "number",
                      "description": "Parameter continentScale",
                      "required": false
                },
                "landBias": {
                      "type": "number",
                      "description": "Parameter landBias",
                      "required": false
                },
                "mountainScale": {
                      "type": "number",
                      "description": "Parameter mountainScale",
                      "required": false
                },
                "mountainAmount": {
                      "type": "number",
                      "description": "Parameter mountainAmount",
                      "required": false
                },
                "hillScale": {
                      "type": "number",
                      "description": "Parameter hillScale",
                      "required": false
                },
                "detailScale": {
                      "type": "number",
                      "description": "Parameter detailScale",
                      "required": false
                },
                "moistureScale": {
                      "type": "number",
                      "description": "Parameter moistureScale",
                      "required": false
                },
                "warp": {
                      "type": "number",
                      "description": "Parameter warp",
                      "required": false
                },
                "island": {
                      "type": "boolean",
                      "description": "Parameter island",
                      "required": false
                },
                "islandFalloff": {
                      "type": "number",
                      "description": "Parameter islandFalloff",
                      "required": false
                },
                "climate": {
                      "type": "any",
                      "description": "Parameter climate",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "world_compose",
    summary: "WORLD COMPOSER ONE-SHOT FOR IDE AGENTS: turn a sparse theme/landform/mood request into a deterministic authored world — terrain+biomes, semantic POI pads, painted roads/trails/carved rivers, ocean, foliage, clouds, wind, weather, cinematic visual style, and optional navmesh. Returns a structured readiness report.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "seed": {
                      "type": "number",
                      "description": "Parameter seed",
                      "required": false
                },
                "theme": {
                      "type": "any",
                      "description": "Parameter theme",
                      "required": false
                },
                "landform": {
                      "type": "any",
                      "description": "Parameter landform",
                      "required": false
                },
                "mood": {
                      "type": "any",
                      "description": "Parameter mood",
                      "required": false
                },
                "quality": {
                      "type": "any",
                      "description": "Parameter quality",
                      "required": false
                },
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": false
                },
                "resolution": {
                      "type": "any",
                      "description": "Parameter resolution",
                      "required": false
                },
                "center": {
                      "type": "object",
                      "description": "Parameter center",
                      "required": false
                },
                "water": {
                      "type": "any",
                      "description": "Parameter water",
                      "required": false
                },
                "foliage": {
                      "type": "any",
                      "description": "Parameter foliage",
                      "required": false
                },
                "navigation": {
                      "type": "any",
                      "description": "Parameter navigation",
                      "required": false
                },
                "autoLayout": {
                      "type": "any",
                      "description": "Parameter autoLayout",
                      "required": false
                },
                "paths": {
                      "type": "any",
                      "description": "Parameter paths",
                      "required": false
                },
                "pointsOfInterest": {
                      "type": "any",
                      "description": "Parameter pointsOfInterest",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "world_report",
    summary: "WORLD COMPOSER QA: inspect the last composed recipe against live terrain, traversal, water, foliage, atmosphere, and navigation; returns a readiness grade plus actionable recommendations.",
    category: "terrain",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "water_create",
    summary: "WATER: create a Gerstner-wave ocean (camera-following, sits at sea level y=0 — rings world_generate islands) or a fixed lake. Reflects sky+SSR, lit by day/night.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "kind": {
                      "type": "string",
                      "description": "Parameter kind",
                      "required": false
                },
                "seaLevel": {
                      "type": "number",
                      "description": "Parameter seaLevel",
                      "required": false
                },
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": false
                },
                "segments": {
                      "type": "any",
                      "description": "Parameter segments",
                      "required": false
                },
                "position": {
                      "type": "object",
                      "description": "Parameter position",
                      "required": false
                },
                "waveScale": {
                      "type": "number",
                      "description": "Parameter waveScale",
                      "required": false
                },
                "choppiness": {
                      "type": "number",
                      "description": "Parameter choppiness",
                      "required": false
                },
                "foam": {
                      "type": "number",
                      "description": "Parameter foam",
                      "required": false
                },
                "opacity": {
                      "type": "number",
                      "description": "Parameter opacity",
                      "required": false
                },
                "deepColor": {
                      "type": "string",
                      "description": "Parameter deepColor",
                      "required": false
                },
                "shallowColor": {
                      "type": "string",
                      "description": "Parameter shallowColor",
                      "required": false
                },
                "foamColor": {
                      "type": "string",
                      "description": "Parameter foamColor",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "water_set",
    summary: "WATER: tune the primary water body (creates an ocean if none exists).",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "seaLevel": {
                      "type": "number",
                      "description": "Parameter seaLevel",
                      "required": false
                },
                "waveScale": {
                      "type": "number",
                      "description": "Parameter waveScale",
                      "required": false
                },
                "choppiness": {
                      "type": "number",
                      "description": "Parameter choppiness",
                      "required": false
                },
                "foam": {
                      "type": "number",
                      "description": "Parameter foam",
                      "required": false
                },
                "opacity": {
                      "type": "number",
                      "description": "Parameter opacity",
                      "required": false
                },
                "deepColor": {
                      "type": "string",
                      "description": "Parameter deepColor",
                      "required": false
                },
                "shallowColor": {
                      "type": "string",
                      "description": "Parameter shallowColor",
                      "required": false
                },
                "foamColor": {
                      "type": "string",
                      "description": "Parameter foamColor",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "water_remove",
    summary: "WATER: remove all water bodies.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "water_sample",
    summary: "WATER: query the wave surface height at a world (x,z) — for buoyancy/floating.",
    category: "terrain",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "x": {
                      "type": "number",
                      "description": "Parameter x",
                      "required": true
                },
                "z": {
                      "type": "number",
                      "description": "Parameter z",
                      "required": true
                }
          },
          "requiredProperties": [
                "x",
                "z"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "clouds_set",
    summary: "CLOUDS: enable/tune the raymarched volumetric cloud layer (sun-lit, day/night-tinted).",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "enabled": {
                      "type": "boolean",
                      "description": "Parameter enabled",
                      "required": false
                },
                "coverage": {
                      "type": "any",
                      "description": "Parameter coverage",
                      "required": false
                },
                "density": {
                      "type": "any",
                      "description": "Parameter density",
                      "required": false
                },
                "speed": {
                      "type": "number",
                      "description": "Parameter speed",
                      "required": false
                },
                "scale": {
                      "type": "number",
                      "description": "Parameter scale",
                      "required": false
                },
                "heightBottom": {
                      "type": "number",
                      "description": "Parameter heightBottom",
                      "required": false
                },
                "heightTop": {
                      "type": "number",
                      "description": "Parameter heightTop",
                      "required": false
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "wind_set",
    summary: "WIND: set the global wind field (direction/strength/gustiness) that drives foliage sway + cloud drift coherently.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "dirX": {
                      "type": "number",
                      "description": "Parameter dirX",
                      "required": false
                },
                "dirZ": {
                      "type": "number",
                      "description": "Parameter dirZ",
                      "required": false
                },
                "strength": {
                      "type": "number",
                      "description": "Parameter strength",
                      "required": false
                },
                "gustiness": {
                      "type": "number",
                      "description": "Parameter gustiness",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "foliage_populate",
    summary: "FOLIAGE: populate biome-aware vegetation (instanced trees/bushes/rocks, wind-swayed) over the terrain; streams around the camera.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "density": {
                      "type": "any",
                      "description": "Parameter density",
                      "required": false
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": false
                },
                "seed": {
                      "type": "number",
                      "description": "Parameter seed",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "foliage_set",
    summary: "FOLIAGE: enable/disable or rescale foliage density.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "enabled": {
                      "type": "boolean",
                      "description": "Parameter enabled",
                      "required": false
                },
                "density": {
                      "type": "any",
                      "description": "Parameter density",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "foliage_clear",
    summary: "FOLIAGE: remove all foliage instances.",
    category: "terrain",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "destructive.clear",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
];
