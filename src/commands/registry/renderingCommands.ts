/**
 * MIX Engine Command Registry — RENDERING domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const renderingCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "set_tone",
    summary: "Set renderer exposure.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "exposure": {
                      "type": "any",
                      "description": "Parameter exposure",
                      "required": true
                }
          },
          "requiredProperties": [
                "exposure"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "set_sky_environment",
    summary: "Set procedural sky direction and fog.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "elevationDeg": {
                      "type": "number",
                      "description": "Parameter elevationDeg",
                      "required": false
                },
                "azimuthDeg": {
                      "type": "number",
                      "description": "Parameter azimuthDeg",
                      "required": false
                },
                "fogDensity": {
                      "type": "any",
                      "description": "Parameter fogDensity",
                      "required": false
                },
                "fogColor": {
                      "type": "any",
                      "description": "Parameter fogColor",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "set_weather_preset",
    summary: "Apply a compact weather preset.",
    category: "rendering",
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
                      "required": true
                },
                "intensity": {
                      "type": "number",
                      "description": "Parameter intensity",
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
    type: "set_material",
    summary: "Edit PBR material (color/rough/metal/emissive/opacity).",
    category: "rendering",
    sideEffect: "scene",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "scene.write",
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
                      "required": true
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "roughness": {
                      "type": "number",
                      "description": "Parameter roughness",
                      "required": false
                },
                "metalness": {
                      "type": "number",
                      "description": "Parameter metalness",
                      "required": false
                },
                "emissive": {
                      "type": "string",
                      "description": "Parameter emissive",
                      "required": false
                },
                "emissiveIntensity": {
                      "type": "any",
                      "description": "Parameter emissiveIntensity",
                      "required": false
                },
                "transparent": {
                      "type": "any",
                      "description": "Parameter transparent",
                      "required": false
                },
                "opacity": {
                      "type": "number",
                      "description": "Parameter opacity",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "set_time_of_day",
    summary: "Set sun/sky from a 0–24 clock hour.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "hour": {
                      "type": "number",
                      "description": "Parameter hour",
                      "required": true
                }
          },
          "requiredProperties": [
                "hour"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "day_night_cycle",
    summary: "Animated day/night: enable auto time-of-day (sun arc, dawn/dusk colour, fog), set the hour, or set the speed (clock-hours per real second). Throttled sky re-bake.",
    category: "rendering",
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
                "hour": {
                      "type": "number",
                      "description": "Parameter hour",
                      "required": false
                },
                "speed": {
                      "type": "number",
                      "description": "Parameter speed",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "set_weather",
    summary: "Fog density/color + ambient intensity.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "fogDensity": {
                      "type": "any",
                      "description": "Parameter fogDensity",
                      "required": false
                },
                "fogColor": {
                      "type": "any",
                      "description": "Parameter fogColor",
                      "required": false
                },
                "ambient": {
                      "type": "any",
                      "description": "Parameter ambient",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "add_light",
    summary: "Add a point/spot/directional/area light (camera-anchored). Spots take a cookie/gobo URL + angle/penumbra; area lights take width/height; pass target to aim.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "kind": {
                      "type": "string",
                      "description": "Parameter kind",
                      "required": true
                },
                "position": {
                      "type": "object",
                      "description": "Parameter position",
                      "required": true
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "intensity": {
                      "type": "number",
                      "description": "Parameter intensity",
                      "required": false
                },
                "distance": {
                      "type": "number",
                      "description": "Parameter distance",
                      "required": false
                },
                "castShadow": {
                      "type": "boolean",
                      "description": "Parameter castShadow",
                      "required": false
                },
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": false
                },
                "angle": {
                      "type": "number",
                      "description": "Parameter angle",
                      "required": false
                },
                "penumbra": {
                      "type": "number",
                      "description": "Parameter penumbra",
                      "required": false
                },
                "decay": {
                      "type": "number",
                      "description": "Parameter decay",
                      "required": false
                },
                "width": {
                      "type": "number",
                      "description": "Parameter width",
                      "required": false
                },
                "height": {
                      "type": "number",
                      "description": "Parameter height",
                      "required": false
                },
                "cookie": {
                      "type": "any",
                      "description": "Parameter cookie",
                      "required": false
                }
          },
          "requiredProperties": [
                "kind",
                "position"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "set_exposure",
    summary: "Set tone-mapping exposure.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "value": {
                      "type": "any",
                      "description": "Parameter value",
                      "required": true
                }
          },
          "requiredProperties": [
                "value"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "set_environment",
    summary: "LIGHTING: swap procedural sky for an equirectangular HDRI (IBL+background), or revert (sky:true); tune IBL/background intensity + blur.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "hdri": {
                      "type": "any",
                      "description": "Parameter hdri",
                      "required": false
                },
                "sky": {
                      "type": "any",
                      "description": "Parameter sky",
                      "required": false
                },
                "background": {
                      "type": "string",
                      "description": "Parameter background",
                      "required": false
                },
                "environmentIntensity": {
                      "type": "any",
                      "description": "Parameter environmentIntensity",
                      "required": false
                },
                "backgroundIntensity": {
                      "type": "any",
                      "description": "Parameter backgroundIntensity",
                      "required": false
                },
                "backgroundBlurriness": {
                      "type": "any",
                      "description": "Parameter backgroundBlurriness",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "set_post_fx",
    summary: "Tune the post chain: bloom, outline, vignette, color grade, chromatic aberration, film grain, volumetric god rays, depth-of-field, screen-space reflections (ssr), volumetric atmospheric fog, camera motion blur, contact shadows, HDR auto-exposure/eye-adaptation, and temporal anti-aliasing (taa, replaces SMAA).",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "bloom": {
                      "type": "any",
                      "description": "Parameter bloom",
                      "required": false
                },
                "bloomStrength": {
                      "type": "any",
                      "description": "Parameter bloomStrength",
                      "required": false
                },
                "outline": {
                      "type": "any",
                      "description": "Parameter outline",
                      "required": false
                },
                "vignette": {
                      "type": "any",
                      "description": "Parameter vignette",
                      "required": false
                },
                "colorGrade": {
                      "type": "any",
                      "description": "Parameter colorGrade",
                      "required": false
                },
                "chromaticAberration": {
                      "type": "any",
                      "description": "Parameter chromaticAberration",
                      "required": false
                },
                "filmGrain": {
                      "type": "any",
                      "description": "Parameter filmGrain",
                      "required": false
                },
                "godRays": {
                      "type": "any",
                      "description": "Parameter godRays",
                      "required": false
                },
                "godRaysStrength": {
                      "type": "any",
                      "description": "Parameter godRaysStrength",
                      "required": false
                },
                "godRaysDensity": {
                      "type": "any",
                      "description": "Parameter godRaysDensity",
                      "required": false
                },
                "dof": {
                      "type": "any",
                      "description": "Parameter dof",
                      "required": false
                },
                "dofFocusDistance": {
                      "type": "any",
                      "description": "Parameter dofFocusDistance",
                      "required": false
                },
                "dofBokehScale": {
                      "type": "any",
                      "description": "Parameter dofBokehScale",
                      "required": false
                },
                "dofAutoFocus": {
                      "type": "any",
                      "description": "Parameter dofAutoFocus",
                      "required": false
                },
                "ssr": {
                      "type": "any",
                      "description": "Parameter ssr",
                      "required": false
                },
                "ssrIntensity": {
                      "type": "any",
                      "description": "Parameter ssrIntensity",
                      "required": false
                },
                "ssrMaxDistance": {
                      "type": "any",
                      "description": "Parameter ssrMaxDistance",
                      "required": false
                },
                "ssrThickness": {
                      "type": "any",
                      "description": "Parameter ssrThickness",
                      "required": false
                },
                "ssrFresnel": {
                      "type": "any",
                      "description": "Parameter ssrFresnel",
                      "required": false
                },
                "volumetricFog": {
                      "type": "any",
                      "description": "Parameter volumetricFog",
                      "required": false
                },
                "fogDensity": {
                      "type": "any",
                      "description": "Parameter fogDensity",
                      "required": false
                },
                "fogColor": {
                      "type": "any",
                      "description": "Parameter fogColor",
                      "required": false
                },
                "fogColorSun": {
                      "type": "any",
                      "description": "Parameter fogColorSun",
                      "required": false
                },
                "fogHeight": {
                      "type": "any",
                      "description": "Parameter fogHeight",
                      "required": false
                },
                "fogHeightFalloff": {
                      "type": "any",
                      "description": "Parameter fogHeightFalloff",
                      "required": false
                },
                "fogScattering": {
                      "type": "any",
                      "description": "Parameter fogScattering",
                      "required": false
                },
                "fogAnisotropy": {
                      "type": "any",
                      "description": "Parameter fogAnisotropy",
                      "required": false
                },
                "fogMaxDistance": {
                      "type": "any",
                      "description": "Parameter fogMaxDistance",
                      "required": false
                },
                "motionBlur": {
                      "type": "any",
                      "description": "Parameter motionBlur",
                      "required": false
                },
                "motionBlurIntensity": {
                      "type": "any",
                      "description": "Parameter motionBlurIntensity",
                      "required": false
                },
                "motionBlurMax": {
                      "type": "any",
                      "description": "Parameter motionBlurMax",
                      "required": false
                },
                "contactShadows": {
                      "type": "any",
                      "description": "Parameter contactShadows",
                      "required": false
                },
                "contactShadowIntensity": {
                      "type": "any",
                      "description": "Parameter contactShadowIntensity",
                      "required": false
                },
                "contactShadowDistance": {
                      "type": "any",
                      "description": "Parameter contactShadowDistance",
                      "required": false
                },
                "autoExposure": {
                      "type": "any",
                      "description": "Parameter autoExposure",
                      "required": false
                },
                "exposureKey": {
                      "type": "any",
                      "description": "Parameter exposureKey",
                      "required": false
                },
                "exposureMin": {
                      "type": "any",
                      "description": "Parameter exposureMin",
                      "required": false
                },
                "exposureMax": {
                      "type": "any",
                      "description": "Parameter exposureMax",
                      "required": false
                },
                "exposureSpeed": {
                      "type": "any",
                      "description": "Parameter exposureSpeed",
                      "required": false
                },
                "taa": {
                      "type": "any",
                      "description": "Parameter taa",
                      "required": false
                },
                "taaFeedback": {
                      "type": "any",
                      "description": "Parameter taaFeedback",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "set_visual_style",
    summary: "VISUAL STYLE: one-command cinematic look — golden_hour/neon_night/stylized/photoreal/moody/midnight/daylight (sun+sky+fog+exposure+IBL+post). Optional overrides bag.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "style": {
                      "type": "string",
                      "description": "Parameter style",
                      "required": true
                },
                "overrides": {
                      "type": "object",
                      "description": "Parameter overrides",
                      "required": false
                }
          },
          "requiredProperties": [
                "style"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "bake_scene",
    summary: "BAKE: capture current look into a named recipe (re-appliable, persisted via save_game).",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "name": {
                      "type": "string",
                      "description": "Parameter name",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "bake_apply",
    summary: "BAKE: re-apply a named baked look.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "name": {
                      "type": "string",
                      "description": "Parameter name",
                      "required": true
                }
          },
          "requiredProperties": [
                "name"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "bake_list",
    summary: "BAKE: list named baked looks.",
    category: "rendering",
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
    type: "bake_ao",
    summary: "BAKE: deterministic vertex AO into vertex colors (seeded, diffable).",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "samples": {
                      "type": "any",
                      "description": "Parameter samples",
                      "required": false
                },
                "distance": {
                      "type": "number",
                      "description": "Parameter distance",
                      "required": false
                },
                "strength": {
                      "type": "number",
                      "description": "Parameter strength",
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
    type: "bake_flush",
    summary: "BAKE: reverse vertex AO, restore original materials.",
    category: "rendering",
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
    type: "cull_enable",
    summary: "CULL: enable/disable hierarchical frustum + software occlusion culling.",
    category: "rendering",
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
                      "required": true
                },
                "occlusion": {
                      "type": "boolean",
                      "description": "Parameter occlusion",
                      "required": false
                },
                "hierarchicalFrustum": {
                      "type": "boolean",
                      "description": "Parameter hierarchicalFrustum",
                      "required": false
                }
          },
          "requiredProperties": [
                "enabled"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "cull_rebuild",
    summary: "CULL: rebuild the culling BVH from the current scene (after chunk load/unload).",
    category: "rendering",
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
    type: "cull_set_occluder",
    summary: "CULL: tag an entity root as an occluder (rasterized into the depth buffer).",
    category: "rendering",
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
                      "required": true
                },
                "occluder": {
                      "type": "any",
                      "description": "Parameter occluder",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "occluder"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "cull_set_exclude",
    summary: "CULL: tag an entity root to be excluded from culling (lights, gizmo, debug).",
    category: "rendering",
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
                      "required": true
                },
                "exclude": {
                      "type": "any",
                      "description": "Parameter exclude",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "exclude"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "cull_status",
    summary: "CULL: query the last cull stats (frustum/occlusion counts, timings).",
    category: "rendering",
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
    type: "set_shadow_strategy",
    summary: "RENDER: swap shadow strategy — single (1 map) or csm (4-cascade open-world).",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "strategy": {
                      "type": "string",
                      "description": "Parameter strategy",
                      "required": true
                }
          },
          "requiredProperties": [
                "strategy"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "lod_enable",
    summary: "LOD: enable/disable auto level-of-detail (simplified meshes by camera distance).",
    category: "rendering",
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
                      "required": true
                }
          },
          "requiredProperties": [
                "enabled"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "lod_register",
    summary: "LOD: register an entity (generates 2 simplified levels via SimplifyModifier).",
    category: "rendering",
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
                      "required": true
                },
                "distances": {
                      "type": "array",
                      "description": "Parameter distances",
                      "required": false
                },
                "ratios": {
                      "type": "array",
                      "description": "Parameter ratios",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "lod_unregister",
    summary: "LOD: unregister an entity (restores original mesh).",
    category: "rendering",
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
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "gpu_particles_start",
    summary: "Initialize and dispatch the WebGPU compute particle simulation with a visible render proxy.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "maxParticles": {
                      "type": "any",
                      "description": "Parameter maxParticles",
                      "required": false
                },
                "x": {
                      "type": "number",
                      "description": "Parameter x",
                      "required": false
                },
                "y": {
                      "type": "number",
                      "description": "Parameter y",
                      "required": false
                },
                "z": {
                      "type": "number",
                      "description": "Parameter z",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "gpu_particles_stop",
    summary: "Stop WebGPU particle compute dispatch.",
    category: "rendering",
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
    type: "gpu_particles_status",
    summary: "Query WebGPU particle support and dispatch status.",
    category: "rendering",
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
    type: "world_canvas_create",
    summary: "Create an interactive in-world 3D UI plane with canvas rendering.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "canvasId": {
                      "type": "string",
                      "description": "Parameter canvasId",
                      "required": true
                },
                "width": {
                      "type": "number",
                      "description": "Parameter width",
                      "required": false
                },
                "height": {
                      "type": "number",
                      "description": "Parameter height",
                      "required": false
                },
                "billboard": {
                      "type": "any",
                      "description": "Parameter billboard",
                      "required": false
                },
                "position": {
                      "type": "object",
                      "description": "Parameter position",
                      "required": false
                },
                "text": {
                      "type": "string",
                      "description": "Parameter text",
                      "required": false
                }
          },
          "requiredProperties": [
                "canvasId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "world_canvas_set_text",
    summary: "Update text rendered onto an in-world 3D UI plane.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "canvasId": {
                      "type": "string",
                      "description": "Parameter canvasId",
                      "required": true
                },
                "text": {
                      "type": "string",
                      "description": "Parameter text",
                      "required": true
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "background": {
                      "type": "string",
                      "description": "Parameter background",
                      "required": false
                }
          },
          "requiredProperties": [
                "canvasId",
                "text"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "world_canvas_destroy",
    summary: "Destroy an in-world 3D UI canvas plane.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "canvasId": {
                      "type": "string",
                      "description": "Parameter canvasId",
                      "required": true
                }
          },
          "requiredProperties": [
                "canvasId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "reverb_zone_create",
    summary: "Create an AABB environmental DSP reverb zone with synthetic impulse response.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "zoneId": {
                      "type": "string",
                      "description": "Parameter zoneId",
                      "required": true
                },
                "name": {
                      "type": "string",
                      "description": "Parameter name",
                      "required": true
                },
                "min": {
                      "type": "object",
                      "description": "Parameter min",
                      "required": true
                },
                "max": {
                      "type": "object",
                      "description": "Parameter max",
                      "required": true
                },
                "wet": {
                      "type": "number",
                      "description": "Parameter wet",
                      "required": false
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "decay": {
                      "type": "number",
                      "description": "Parameter decay",
                      "required": false
                }
          },
          "requiredProperties": [
                "zoneId",
                "name",
                "min",
                "max"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "reverb_zone_remove",
    summary: "Remove an environmental reverb zone.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "zoneId": {
                      "type": "string",
                      "description": "Parameter zoneId",
                      "required": true
                }
          },
          "requiredProperties": [
                "zoneId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "reflection_probe_create",
    summary: "Create a live local cubemap reflection probe.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "probeId": {
                      "type": "string",
                      "description": "Parameter probeId",
                      "required": true
                },
                "position": {
                      "type": "object",
                      "description": "Parameter position",
                      "required": true
                },
                "resolution": {
                      "type": "any",
                      "description": "Parameter resolution",
                      "required": false
                },
                "boxSize": {
                      "type": "any",
                      "description": "Parameter boxSize",
                      "required": false
                },
                "intensity": {
                      "type": "number",
                      "description": "Parameter intensity",
                      "required": false
                }
          },
          "requiredProperties": [
                "probeId",
                "position"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "reflection_probe_remove",
    summary: "Remove and dispose a local reflection probe.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "probeId": {
                      "type": "string",
                      "description": "Parameter probeId",
                      "required": true
                }
          },
          "requiredProperties": [
                "probeId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "reflection_probe_capture",
    summary: "Mark a local reflection probe for recapture.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "probeId": {
                      "type": "string",
                      "description": "Parameter probeId",
                      "required": true
                }
          },
          "requiredProperties": [
                "probeId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "fog_set_params",
    summary: "Configure atmospheric volumetric fog density, height falloff, color, and godray anisotropy.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "density": {
                      "type": "any",
                      "description": "Parameter density",
                      "required": false
                },
                "heightFalloff": {
                      "type": "any",
                      "description": "Parameter heightFalloff",
                      "required": false
                },
                "groundLevel": {
                      "type": "any",
                      "description": "Parameter groundLevel",
                      "required": false
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "anisotropy": {
                      "type": "any",
                      "description": "Parameter anisotropy",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "fog_volume_add",
    summary: "Spawn a local spherical volumetric fog/mist/smoke volume.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Parameter id",
                      "required": true
                },
                "position": {
                      "type": "object",
                      "description": "Parameter position",
                      "required": true
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": true
                },
                "density": {
                      "type": "any",
                      "description": "Parameter density",
                      "required": true
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                }
          },
          "requiredProperties": [
                "id",
                "position",
                "radius",
                "density"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "render_style_list",
    summary: "List all registered visual styles and presets.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: { "type": "object", "properties": {}, "additionalProperties": true },
  },
  {
    type: "render_style_get",
    summary: "Get a registered visual style by ID.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "styleId": { "type": "string", "description": "Visual style ID", "required": true }
      },
      "requiredProperties": ["styleId"],
      "additionalProperties": true
    },
  },
  {
    type: "render_style_apply",
    summary: "Apply a coordinated visual style preset (e.g. mix_anime_neutral, mix_anime_shonen, realistic).",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "styleId": { "type": "string", "description": "Visual style ID (e.g. mix_anime_neutral, mix_anime_shonen, mix_anime_warm, realistic)", "required": true }
      },
      "requiredProperties": ["styleId"],
      "additionalProperties": true
    },
  },
  {
    type: "render_style_describe",
    summary: "Get plain-text semantic description of a visual style.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "styleId": { "type": "string", "description": "Visual style ID", "required": true }
      },
      "requiredProperties": ["styleId"],
      "additionalProperties": true
    },
  },
  {
    type: "render_target_list",
    summary: "List all registered performance targets (e.g. ps3_plus_500, balanced, high_end, unbounded).",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: { "type": "object", "properties": {}, "additionalProperties": true },
  },
  {
    type: "render_target_get",
    summary: "Get a registered performance target by ID.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "targetId": { "type": "string", "description": "Performance target ID", "required": true }
      },
      "requiredProperties": ["targetId"],
      "additionalProperties": true
    },
  },
  {
    type: "render_target_apply",
    summary: "Apply a hardware performance target profile.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "targetId": { "type": "string", "description": "Target ID (ps3_plus_500, balanced, high_end, unbounded)", "required": true }
      },
      "requiredProperties": ["targetId"],
      "additionalProperties": true
    },
  },
  {
    type: "render_target_describe",
    summary: "Get plain-text semantic description of a performance target.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "targetId": { "type": "string", "description": "Target profile ID", "required": true }
      },
      "requiredProperties": ["targetId"],
      "additionalProperties": true
    },
  },
  {
    type: "render_resolution_status",
    summary: "Query current internal rendering resolution, output presentation resolution, and FSR upscaling status.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: { "type": "object", "properties": {}, "additionalProperties": true },
  },
  {
    type: "render_capabilities",
    summary: "Query GPU capabilities, compressed texture support, and asset cooking features.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: { "type": "object", "properties": {}, "additionalProperties": true },
  },
  {
    type: "render_budget_report",
    summary: "Generate deterministic scene cost budget report with draw calls, triangles, and bottleneck breakdown.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "targetFps": { "type": "number", "description": "Target framerate (default 60)", "required": false }
      },
      "additionalProperties": true
    },
  },
  {
    type: "render_explain",
    summary: "Provide deterministic answers and actionable advice for 'Why is my game slow?'.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "targetFps": { "type": "number", "description": "Target framerate (default 60)", "required": false }
      },
      "additionalProperties": true
    },
  },
  {
    type: "anime_material_apply",
    summary: "Apply anime material family across an entity or character hierarchy.",
    category: "rendering",
    sideEffect: "scene",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "scene.write",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "entityId": { "type": ["number", "string"], "description": "Target entity ID", "required": true },
        "skinColor": { "type": "string", "description": "Skin tint (#hex)", "required": false },
        "hairColor": { "type": "string", "description": "Hair tint (#hex)", "required": false },
        "eyeColor": { "type": "string", "description": "Eye tint (#hex)", "required": false },
        "clothColor": { "type": "string", "description": "Cloth tint (#hex)", "required": false },
        "hairHighlightStrength": { "type": "number", "description": "Graphic hair highlight intensity (0..1)", "required": false },
        "rimIntensity": { "type": "number", "description": "Rim light intensity (0..2)", "required": false },
        "shadowTint": { "type": "string", "description": "Character shadow tint (#hex)", "required": false }
      },
      "requiredProperties": ["entityId"],
      "additionalProperties": true
    },
  },
  {
    type: "anime_material_configure",
    summary: "Configure fine-grained anime toon shading parameters on entity materials.",
    category: "rendering",
    sideEffect: "scene",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "scene.write",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "entityId": { "type": ["number", "string"], "description": "Target entity ID", "required": true },
        "surface": { "type": "string", "description": "Surface mode (standard, skin, face, hair, eye, cloth, stylized_metal)", "required": false },
        "shadowThreshold": { "type": "number", "description": "Shadow boundary position (0..1)", "required": false },
        "shadowSoftness": { "type": "number", "description": "Shadow transition softness (0..0.5)", "required": false },
        "shadowColor": { "type": "string", "description": "Shadow tint (#hex)", "required": false },
        "rimIntensity": { "type": "number", "description": "Rim light intensity (0..2)", "required": false },
        "hairHighlightStrength": { "type": "number", "description": "Hair highlight intensity (0..1)", "required": false }
      },
      "requiredProperties": ["entityId"],
      "additionalProperties": true
    },
  },
  {
    type: "anime_material_describe",
    summary: "Get plain-text semantic description of all anime materials on an entity.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "entityId": { "type": ["number", "string"], "description": "Target entity ID", "required": true }
      },
      "requiredProperties": ["entityId"],
      "additionalProperties": true
    },
  },
  {
    type: "asset_analyze",
    summary: "Extract machine-readable metrics (triangles, materials, memory, bone count, animation tracks) for an asset or entity.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "assetId": { "type": "string", "description": "Asset ID", "required": false },
        "entityId": { "type": ["number", "string"], "description": "Entity ID", "required": false }
      },
      "additionalProperties": true
    },
  },
  {
    type: "asset_optimize_plan",
    summary: "Generate a non-destructive dry-run optimization plan for an asset and target profile.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "assetId": { "type": "string", "description": "Asset ID", "required": false },
        "entityId": { "type": ["number", "string"], "description": "Entity ID", "required": false },
        "targetProfile": { "type": "string", "description": "Target performance profile (e.g. ps3_plus_500, balanced)", "required": false }
      },
      "additionalProperties": true
    },
  },
  {
    type: "asset_variant_list",
    summary: "List all cached derived runtime asset variants.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: { "type": "object", "properties": {}, "additionalProperties": true },
  },
  {
    type: "anime_material_revert",
    summary: "Revert character meshes converted to anime cel-toon shaders back to their original materials.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "full",
    atomicBoundary: "Mesh material restoration",
    capability: "scene.write",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "entityId": { "type": ["number", "string"], "description": "Entity ID to revert", "required": false }
      },
      "additionalProperties": true
    },
  },
  {
    type: "asset_optimize",
    summary: "Run complete non-destructive asset optimization pipeline (analyze, plan, simplify/downscale, persist, cache).",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "full",
    atomicBoundary: "Derived asset optimization",
    capability: "scene.write",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "assetId": { "type": "string", "description": "Asset ID", "required": false },
        "entityId": { "type": ["number", "string"], "description": "Entity ID", "required": false },
        "targetProfile": { "type": "string", "description": "Target profile", "required": false },
        "category": { "type": "string", "description": "Semantic category", "required": false },
        "importance": { "type": "string", "description": "Asset importance", "required": false },
        "overrides": { "type": "object", "description": "Optimization overrides", "required": false }
      },
      "additionalProperties": true
    },
  },
  {
    type: "asset_variant_get",
    summary: "Query active and available derived variants for an asset.",
    category: "rendering",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Read-only inspection",
    capability: "scene.read",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "assetId": { "type": "string", "description": "Asset ID", "required": true }
      },
      "requiredProperties": ["assetId"],
      "additionalProperties": true
    },
  },
  {
    type: "asset_variant_pin",
    summary: "Pin an asset to always use a specific variant key or source.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "full",
    atomicBoundary: "Variant resolution pinning",
    capability: "scene.write",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "assetId": { "type": "string", "description": "Asset ID", "required": true },
        "variantKey": { "type": "string", "description": "Variant key or 'source'", "required": true }
      },
      "requiredProperties": ["assetId", "variantKey"],
      "additionalProperties": true
    },
  },
  {
    type: "asset_variant_unpin",
    summary: "Remove variant pinning for an asset.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "full",
    atomicBoundary: "Variant resolution unpinning",
    capability: "scene.write",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "assetId": { "type": "string", "description": "Asset ID", "required": true }
      },
      "requiredProperties": ["assetId"],
      "additionalProperties": true
    },
  },
  {
    type: "animation_optimize",
    summary: "Optimize animation clips by reducing redundant keyframes and pruning constant tracks.",
    category: "rendering",
    sideEffect: "runtime",
    atomicSupport: "full",
    atomicBoundary: "Animation clip curve optimization",
    capability: "scene.write",
    versionIntroduced: '1.1.0',
    parameters: {
      "type": "object",
      "properties": {
        "assetId": { "type": "string", "description": "Asset ID", "required": true },
        "tolerance": { "type": "number", "description": "Quaternion rotation error tolerance in radians", "required": false },
        "pruneConstant": { "type": "boolean", "description": "Whether to remove constant tracks", "required": false },
        "preserveRootMotion": { "type": "boolean", "description": "Preserve root motion curves", "required": false }
      },
      "requiredProperties": ["assetId"],
      "additionalProperties": true
    },
  },
];
