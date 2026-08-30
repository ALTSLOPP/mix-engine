/**
 * MIX Engine Command Registry — ANIMATION domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const animationCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "play_animation",
    summary: "Transition a character to an animation state.",
    category: "animation",
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
                "state": {
                      "type": "string",
                      "description": "Parameter state",
                      "required": true
                },
                "fade": {
                      "type": "number",
                      "description": "Parameter fade",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "state"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "import_animation_pack",
    summary: "RETARGET PRO: import FBX/GLB folder, auto-detect rig, perform hierarchical world-space bind alignment, scale root motion, and return a structured readiness report. qualityPreset:\"aaa\" enables foot contact correction.",
    category: "animation",
    sideEffect: "external",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "asset.import",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
                      "required": true
                },
                "targetRig": {
                      "type": "any",
                      "description": "Parameter targetRig",
                      "required": true
                },
                "sourcePath": {
                      "type": "any",
                      "description": "Parameter sourcePath",
                      "required": false
                },
                "displayName": {
                      "type": "any",
                      "description": "Parameter displayName",
                      "required": false
                },
                "boneMappingOverride": {
                      "type": "any",
                      "description": "Parameter boneMappingOverride",
                      "required": false
                },
                "scaleOverride": {
                      "type": "any",
                      "description": "Parameter scaleOverride",
                      "required": false
                },
                "keepRootMotion": {
                      "type": "any",
                      "description": "Parameter keepRootMotion",
                      "required": false
                },
                "qualityPreset": {
                      "type": "any",
                      "description": "Parameter qualityPreset",
                      "required": false
                },
                "footLock": {
                      "type": "any",
                      "description": "Parameter footLock",
                      "required": false
                }
          },
          "requiredProperties": [
                "packId",
                "targetRig"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "retarget_pro_build",
    summary: "RETARGET PRO ONE-SHOT FOR IDE AGENTS: import + AAA quality pass + structured gate + apply to characters + auto-wire combat + optional preview. Use strict:true to reject anything below grade A/READY.",
    category: "animation",
    sideEffect: "external",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
                      "required": true
                },
                "targetRig": {
                      "type": "any",
                      "description": "Parameter targetRig",
                      "required": true
                },
                "sourcePath": {
                      "type": "any",
                      "description": "Parameter sourcePath",
                      "required": true
                },
                "displayName": {
                      "type": "any",
                      "description": "Parameter displayName",
                      "required": false
                },
                "qualityPreset": {
                      "type": "any",
                      "description": "Parameter qualityPreset",
                      "required": false
                },
                "strict": {
                      "type": "boolean",
                      "description": "Parameter strict",
                      "required": false
                },
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": false
                },
                "autoApply": {
                      "type": "boolean",
                      "description": "Parameter autoApply",
                      "required": false
                },
                "autoWireCombat": {
                      "type": "boolean",
                      "description": "Parameter autoWireCombat",
                      "required": false
                },
                "previewEntry": {
                      "type": "any",
                      "description": "Parameter previewEntry",
                      "required": false
                },
                "prefix": {
                      "type": "any",
                      "description": "Parameter prefix",
                      "required": false
                },
                "keepRootMotion": {
                      "type": "any",
                      "description": "Parameter keepRootMotion",
                      "required": false
                },
                "boneMappingOverride": {
                      "type": "any",
                      "description": "Parameter boneMappingOverride",
                      "required": false
                },
                "scaleOverride": {
                      "type": "any",
                      "description": "Parameter scaleOverride",
                      "required": false
                }
          },
          "requiredProperties": [
                "packId",
                "targetRig",
                "sourcePath"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "retarget_pro_report",
    summary: "RETARGET PRO QA: machine-readable grade/readiness, profiles, categories, root-motion coverage, scale range, severity buckets, and actionable recommendations for one or all packs.",
    category: "animation",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "anim_pack_list",
    summary: "ANIM PACKS: list every imported animation pack (defs + cross-pack issues) into lastQueryResult & /api/scene-query.",
    category: "animation",
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
    type: "anim_pack_remove",
    summary: "ANIM PACKS: remove a pack (clips stay on already-wired ASMs).",
    category: "animation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
                      "required": true
                }
          },
          "requiredProperties": [
                "packId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "anim_pack_apply",
    summary: "ANIM PACKS: register every clip in a pack onto target AnimationStateMachines (target \"all\" or an entity id/@name/tag or number[]; prefix optional).",
    category: "animation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
                      "required": true
                },
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": false
                },
                "prefix": {
                      "type": "any",
                      "description": "Parameter prefix",
                      "required": false
                }
          },
          "requiredProperties": [
                "packId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "anim_pack_wire_combat",
    summary: "ANIM PACKS: wire a pack combat slots (idle/lightAttack/heavyAttack/block/hit/death); auto:true infers from pack category/name so a store pack needs zero manual mapping.",
    category: "animation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
                      "required": true
                },
                "mapping": {
                      "type": "any",
                      "description": "Parameter mapping",
                      "required": false
                },
                "auto": {
                      "type": "any",
                      "description": "Parameter auto",
                      "required": false
                },
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": false
                },
                "prefix": {
                      "type": "any",
                      "description": "Parameter prefix",
                      "required": false
                }
          },
          "requiredProperties": [
                "packId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "anim_pack_preview",
    summary: "ANIM PACKS: preview one clip on a character (selected gizmo or explicit entityId).",
    category: "animation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
                      "required": true
                },
                "entryId": {
                      "type": "any",
                      "description": "Parameter entryId",
                      "required": true
                },
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "fade": {
                      "type": "number",
                      "description": "Parameter fade",
                      "required": false
                }
          },
          "requiredProperties": [
                "packId",
                "entryId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "motion_play",
    summary: "MOTION DIRECTOR: direct code-driven clip playback with layer, fade, speed, loop, and root-motion policy.",
    category: "animation",
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
                "clip": {
                      "type": "string",
                      "description": "Parameter clip",
                      "required": true
                },
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
                      "required": false
                },
                "layer": {
                      "type": "string",
                      "description": "Parameter layer",
                      "required": false
                },
                "fade": {
                      "type": "number",
                      "description": "Parameter fade",
                      "required": false
                },
                "speed": {
                      "type": "number",
                      "description": "Parameter speed",
                      "required": false
                },
                "loop": {
                      "type": "boolean",
                      "description": "Parameter loop",
                      "required": false
                },
                "rootMotion": {
                      "type": "any",
                      "description": "Parameter rootMotion",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "clip"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "motion_stop",
    summary: "MOTION DIRECTOR: stop motion playback on an entity or specific layer with fade.",
    category: "animation",
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
                "fade": {
                      "type": "number",
                      "description": "Parameter fade",
                      "required": false
                },
                "layer": {
                      "type": "string",
                      "description": "Parameter layer",
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
    type: "motion_pause",
    summary: "MOTION DIRECTOR: pause motion playback on an entity.",
    category: "animation",
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
    type: "motion_resume",
    summary: "MOTION DIRECTOR: resume motion playback on an entity.",
    category: "animation",
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
    type: "motion_crossfade",
    summary: "MOTION DIRECTOR: crossfade to a target animation clip.",
    category: "animation",
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
                "targetClip": {
                      "type": "any",
                      "description": "Parameter targetClip",
                      "required": true
                },
                "fade": {
                      "type": "number",
                      "description": "Parameter fade",
                      "required": false
                },
                "layer": {
                      "type": "string",
                      "description": "Parameter layer",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "targetClip"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "motion_layer_create",
    summary: "MOTION DIRECTOR: create an animation layer with blendMode (override/additive) and weighted mask.",
    category: "animation",
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
                "name": {
                      "type": "string",
                      "description": "Parameter name",
                      "required": true
                },
                "index": {
                      "type": "number",
                      "description": "Parameter index",
                      "required": false
                },
                "blendMode": {
                      "type": "any",
                      "description": "Parameter blendMode",
                      "required": false
                },
                "mask": {
                      "type": "any",
                      "description": "Parameter mask",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "name"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "motion_layer_weight",
    summary: "MOTION DIRECTOR: set layer weight with fade transition.",
    category: "animation",
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
                "layer": {
                      "type": "string",
                      "description": "Parameter layer",
                      "required": true
                },
                "weight": {
                      "type": "number",
                      "description": "Parameter weight",
                      "required": true
                },
                "fade": {
                      "type": "number",
                      "description": "Parameter fade",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "layer",
                "weight"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "motion_parameter_set",
    summary: "MOTION DIRECTOR: set damped parameter on MotionGraph (number/bool/string/vector).",
    category: "animation",
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
                "name": {
                      "type": "string",
                      "description": "Parameter name",
                      "required": true
                },
                "value": {
                      "type": "any",
                      "description": "Parameter value",
                      "required": true
                },
                "damping": {
                      "type": "number",
                      "description": "Parameter damping",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "name",
                "value"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "motion_parameter_get",
    summary: "MOTION DIRECTOR: read parameter value from MotionGraph.",
    category: "animation",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
                      "required": true
                },
                "name": {
                      "type": "string",
                      "description": "Parameter name",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "name"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "motion_graph_inspect",
    summary: "MOTION DIRECTOR: structured introspection of layers, active states, weights, events, and root motion.",
    category: "animation",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
                      "required": true
                },
                "include": {
                      "type": "any",
                      "description": "Parameter include",
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
    type: "motion_preview",
    summary: "MOTION DIRECTOR: preview animation clip on character.",
    category: "animation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "clip": {
                      "type": "string",
                      "description": "Parameter clip",
                      "required": true
                },
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
                      "required": false
                },
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "fade": {
                      "type": "number",
                      "description": "Parameter fade",
                      "required": false
                }
          },
          "requiredProperties": [
                "clip"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "character_motion_setup",
    summary: "HIGH-LEVEL ORCHESTRATION: one-shot full character animation setup (base layer, upper-body mask, parameters, pack clips).",
    category: "animation",
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
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
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
    type: "combat_motion_setup",
    summary: "HIGH-LEVEL ORCHESTRATION: configure combat layers, combo sequences, and root-motion warping.",
    category: "animation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "gameplay.mutate",
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
                "packId": {
                      "type": "string",
                      "description": "Parameter packId",
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
    type: "locomotion_motion_setup",
    summary: "HIGH-LEVEL ORCHESTRATION: configure 1D/2D directional locomotion blend trees with speed damping.",
    category: "animation",
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
                "mode": {
                      "type": "string",
                      "description": "Parameter mode",
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
    type: "motion_quality_report",
    summary: "HIGH-LEVEL ORCHESTRATION: generate AAA animation readiness & quality report for character.",
    category: "animation",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
    type: "morph_set",
    summary: "Set blendshape morph target weight on a mesh with optional tween duration.",
    category: "animation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    deprecatedAliases: ["morph_set_weight"],
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
                "morph": {
                      "type": "any",
                      "description": "Parameter morph",
                      "required": true
                },
                "weight": {
                      "type": "number",
                      "description": "Parameter weight",
                      "required": true
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "morph",
                "weight"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "morph_set_weight",
    summary: "Compatibility alias for morph_set.",
    category: "animation",
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
                "morph": {
                      "type": "any",
                      "description": "Parameter morph",
                      "required": true
                },
                "weight": {
                      "type": "number",
                      "description": "Parameter weight",
                      "required": true
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "morph",
                "weight"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "morph_get",
    summary: "Read current blendshape morph target weight on a mesh.",
    category: "animation",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
                      "required": true
                },
                "morph": {
                      "type": "any",
                      "description": "Parameter morph",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "morph"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "morphs_list",
    summary: "List available morph target blendshape names on an entity.",
    category: "animation",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
    type: "anim_event_add",
    summary: "Attach a frame-accurate event marker to an animation state.",
    category: "animation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "state": {
                      "type": "string",
                      "description": "Parameter state",
                      "required": true
                },
                "normalizedTime": {
                      "type": "any",
                      "description": "Parameter normalizedTime",
                      "required": true
                },
                "event": {
                      "type": "string",
                      "description": "Parameter event",
                      "required": true
                },
                "payload": {
                      "type": "any",
                      "description": "Parameter payload",
                      "required": false
                }
          },
          "requiredProperties": [
                "state",
                "normalizedTime",
                "event"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "ik_aim_target",
    summary: "Aim bones (head/spine/weapon) towards a world-space target with procedural IK.",
    category: "animation",
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
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": true
                },
                "weight": {
                      "type": "number",
                      "description": "Parameter weight",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "target"
          ],
          "additionalProperties": true
    },
  },
];
