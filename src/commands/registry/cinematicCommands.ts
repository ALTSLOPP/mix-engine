/**
 * MIX Engine Command Registry — CINEMATIC domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const cinematicCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "frame_entity",
    summary: "Frame one entity in the editor camera.",
    category: "cinematic",
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
                "padding": {
                      "type": "any",
                      "description": "Parameter padding",
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
    type: "frame_all",
    summary: "Frame all scene entities in the editor camera.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "padding": {
                      "type": "any",
                      "description": "Parameter padding",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "zoom_in",
    summary: "Zoom the editor camera in.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "factor": {
                      "type": "any",
                      "description": "Parameter factor",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "zoom_out",
    summary: "Zoom the editor camera out.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "factor": {
                      "type": "any",
                      "description": "Parameter factor",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "zoom_reset",
    summary: "Reset editor camera zoom.",
    category: "cinematic",
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
    type: "camera_preset",
    summary: "Apply a built-in camera preset (18 shipped: default, isometric, top_down, front, back, left, right, bird_eye, etc.).",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.1.0',
    parameters: {
          "type": "object",
          "properties": {
                "preset": {
                      "type": "string",
                      "description": "Preset id — e.g. 'default','isometric','top_down','front','wide','closeup','dutch_left','over_shoulder','fps_eyes' (use list_camera_presets to enumerate)",
                      "required": true
                },
                "anchorToSelection": {
                      "type": "boolean",
                      "description": "If true (default), re-anchor preset to selection/scene centre so it never strands at origin",
                      "required": false
                }
          },
          "requiredProperties": [
                "preset"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "camera_preset_next",
    summary: "Cycle to next camera preset.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.1.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "camera_preset_prev",
    summary: "Cycle to previous camera preset.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.1.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "list_camera_presets",
    summary: "List all built-in camera presets with ids and descriptions.",
    category: "cinematic",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.1.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "camera_shake",
    summary: "Trigger cinematic camera shake.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "trauma": {
                      "type": "any",
                      "description": "Parameter trauma",
                      "required": false
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "frequency": {
                      "type": "number",
                      "description": "Parameter frequency",
                      "required": false
                },
                "translation": {
                      "type": "any",
                      "description": "Parameter translation",
                      "required": false
                },
                "rotation": {
                      "type": "object",
                      "description": "Parameter rotation",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "cutscene_play",
    summary: "Play a unified cutscene event sequence.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "sequence": {
                      "type": "object",
                      "description": "Parameter sequence",
                      "required": true
                }
          },
          "requiredProperties": [
                "sequence"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "cutscene_stop",
    summary: "Stop the active cutscene sequence.",
    category: "cinematic",
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
    type: "cutscene_subtitle",
    summary: "Show a timed cinematic subtitle.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "text": {
                      "type": "string",
                      "description": "Parameter text",
                      "required": true
                },
                "speaker": {
                      "type": "string",
                      "description": "Parameter speaker",
                      "required": false
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                }
          },
          "requiredProperties": [
                "text"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "screen_flash",
    summary: "Flash or pulse the screen overlay.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
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
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "mode": {
                      "type": "string",
                      "description": "Parameter mode",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "cinematic_play",
    summary: "Play a scripted camera sequence.",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "sequence": {
                      "type": "object",
                      "description": "Parameter sequence",
                      "required": true
                }
          },
          "requiredProperties": [
                "sequence"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "cinematic_stop",
    summary: "Stop the cinematic camera.",
    category: "cinematic",
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
    type: "set_camera",
    summary: "Position/aim/FOV the camera (world space).",
    category: "cinematic",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "position": {
                      "type": "object",
                      "description": "Parameter position",
                      "required": true
                },
                "lookAt": {
                      "type": "any",
                      "description": "Parameter lookAt",
                      "required": false
                },
                "fov": {
                      "type": "number",
                      "description": "Parameter fov",
                      "required": false
                }
          },
          "requiredProperties": [
                "position"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "follow_path",
    summary: "Make an entity travel a spline path.",
    category: "cinematic",
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
                "points": {
                      "type": "array",
                      "description": "Parameter points",
                      "required": true
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
                "lookAlongPath": {
                      "type": "boolean",
                      "description": "Parameter lookAlongPath",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "points"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "focus_entity",
    summary: "Frame the camera on an entity.",
    category: "cinematic",
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
    type: "screenshot",
    summary: "Capture a hi-res still to public/screenshots/.",
    category: "cinematic",
    sideEffect: "external",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "filename": {
                      "type": "any",
                      "description": "Parameter filename",
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
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "timeline_create",
    summary: "Define multi-track cinematic timeline sequence with keyframes and tracks.",
    category: "cinematic",
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
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": true
                },
                "loop": {
                      "type": "boolean",
                      "description": "Parameter loop",
                      "required": false
                },
                "tracks": {
                      "type": "object",
                      "description": "Parameter tracks",
                      "required": true
                }
          },
          "requiredProperties": [
                "id",
                "duration",
                "tracks"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "timeline_play",
    summary: "Play cinematic timeline animation sequence.",
    category: "cinematic",
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
                "loop": {
                      "type": "boolean",
                      "description": "Parameter loop",
                      "required": false
                }
          },
          "requiredProperties": [
                "id"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "timeline_scrub",
    summary: "Scrub cinematic timeline sequence to target timestamp.",
    category: "cinematic",
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
                "time": {
                      "type": "number",
                      "description": "Parameter time",
                      "required": true
                }
          },
          "requiredProperties": [
                "id",
                "time"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "timeline_stop",
    summary: "Stop playback of cinematic timeline sequence.",
    category: "cinematic",
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
                }
          },
          "requiredProperties": [
                "id"
          ],
          "additionalProperties": true
    },
  },
];
