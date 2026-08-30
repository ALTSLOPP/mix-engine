/**
 * MIX Engine Command Registry — MISC domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const miscCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "set_time_scale",
    summary: "Set simulation time scale.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "scale": {
                      "type": "number",
                      "description": "Parameter scale",
                      "required": true
                }
          },
          "requiredProperties": [
                "scale"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "add_script",
    summary: "Attach IDE-authored script source to an entity.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "script.attach",
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
                "sourceCode": {
                      "type": "string",
                      "description": "Parameter sourceCode",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "sourceCode"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "remove_script",
    summary: "Remove the script attached to an entity.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "script.attach",
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
    type: "emit_event",
    summary: "Emit a named engine event with optional data.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "event": {
                      "type": "string",
                      "description": "Parameter event",
                      "required": true
                },
                "data": {
                      "type": "any",
                      "description": "Parameter data",
                      "required": false
                }
          },
          "requiredProperties": [
                "event"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "hud_load",
    summary: "Load a declarative HUD layout.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "layout": {
                      "type": "object",
                      "description": "Parameter layout",
                      "required": true
                }
          },
          "requiredProperties": [
                "layout"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "hud_show",
    summary: "Show a HUD widget.",
    category: "misc",
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
  {
    type: "hud_hide",
    summary: "Hide a HUD widget.",
    category: "misc",
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
  {
    type: "hud_clear",
    summary: "Remove all HUD widgets.",
    category: "misc",
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
    type: "dialogue_show",
    summary: "Show branching dialogue whose choices can run AICommands.",
    category: "misc",
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
                "choices": {
                      "type": "any",
                      "description": "Parameter choices",
                      "required": false
                },
                "pauseGame": {
                      "type": "boolean",
                      "description": "Parameter pauseGame",
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
    type: "set_debug_draw",
    summary: "Enable or disable runtime debug drawing.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "debug.draw",
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
    type: "clear_debug_draw",
    summary: "Clear all persistent debug primitives.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "debug.draw",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "draw_debug_line",
    summary: "Draw a temporary world-space debug line.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "debug.draw",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "fromX": {
                      "type": "number",
                      "description": "Parameter fromX",
                      "required": true
                },
                "fromY": {
                      "type": "number",
                      "description": "Parameter fromY",
                      "required": true
                },
                "fromZ": {
                      "type": "number",
                      "description": "Parameter fromZ",
                      "required": true
                },
                "toX": {
                      "type": "number",
                      "description": "Parameter toX",
                      "required": true
                },
                "toY": {
                      "type": "number",
                      "description": "Parameter toY",
                      "required": true
                },
                "toZ": {
                      "type": "number",
                      "description": "Parameter toZ",
                      "required": true
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "lifetime": {
                      "type": "any",
                      "description": "Parameter lifetime",
                      "required": false
                }
          },
          "requiredProperties": [
                "fromX",
                "fromY",
                "fromZ",
                "toX",
                "toY",
                "toZ"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "draw_debug_ray",
    summary: "Draw a temporary world-space debug ray.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "debug.draw",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "originX": {
                      "type": "any",
                      "description": "Parameter originX",
                      "required": true
                },
                "originY": {
                      "type": "any",
                      "description": "Parameter originY",
                      "required": true
                },
                "originZ": {
                      "type": "any",
                      "description": "Parameter originZ",
                      "required": true
                },
                "dirX": {
                      "type": "number",
                      "description": "Parameter dirX",
                      "required": true
                },
                "dirY": {
                      "type": "any",
                      "description": "Parameter dirY",
                      "required": true
                },
                "dirZ": {
                      "type": "number",
                      "description": "Parameter dirZ",
                      "required": true
                },
                "length": {
                      "type": "any",
                      "description": "Parameter length",
                      "required": true
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "lifetime": {
                      "type": "any",
                      "description": "Parameter lifetime",
                      "required": false
                }
          },
          "requiredProperties": [
                "originX",
                "originY",
                "originZ",
                "dirX",
                "dirY",
                "dirZ",
                "length"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "draw_debug_sphere",
    summary: "Draw a temporary world-space debug sphere.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "debug.draw",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "centerX": {
                      "type": "any",
                      "description": "Parameter centerX",
                      "required": true
                },
                "centerY": {
                      "type": "any",
                      "description": "Parameter centerY",
                      "required": true
                },
                "centerZ": {
                      "type": "any",
                      "description": "Parameter centerZ",
                      "required": true
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": true
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "lifetime": {
                      "type": "any",
                      "description": "Parameter lifetime",
                      "required": false
                }
          },
          "requiredProperties": [
                "centerX",
                "centerY",
                "centerZ",
                "radius"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "draw_debug_box",
    summary: "Draw a temporary world-space debug box.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "debug.draw",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "centerX": {
                      "type": "any",
                      "description": "Parameter centerX",
                      "required": true
                },
                "centerY": {
                      "type": "any",
                      "description": "Parameter centerY",
                      "required": true
                },
                "centerZ": {
                      "type": "any",
                      "description": "Parameter centerZ",
                      "required": true
                },
                "sizeX": {
                      "type": "any",
                      "description": "Parameter sizeX",
                      "required": true
                },
                "sizeY": {
                      "type": "any",
                      "description": "Parameter sizeY",
                      "required": true
                },
                "sizeZ": {
                      "type": "any",
                      "description": "Parameter sizeZ",
                      "required": true
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "lifetime": {
                      "type": "any",
                      "description": "Parameter lifetime",
                      "required": false
                }
          },
          "requiredProperties": [
                "centerX",
                "centerY",
                "centerZ",
                "sizeX",
                "sizeY",
                "sizeZ"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "draw_debug_text",
    summary: "Draw temporary world-space debug text.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "debug.draw",
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
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": false
                },
                "lifetime": {
                      "type": "any",
                      "description": "Parameter lifetime",
                      "required": false
                }
          },
          "requiredProperties": [
                "x",
                "y",
                "z",
                "text"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "spawn_decal",
    summary: "Ray-project a decal from an origin and direction.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "ox": {
                      "type": "number",
                      "description": "Parameter ox",
                      "required": true
                },
                "oy": {
                      "type": "number",
                      "description": "Parameter oy",
                      "required": true
                },
                "oz": {
                      "type": "number",
                      "description": "Parameter oz",
                      "required": true
                },
                "dx": {
                      "type": "number",
                      "description": "Parameter dx",
                      "required": true
                },
                "dy": {
                      "type": "number",
                      "description": "Parameter dy",
                      "required": true
                },
                "dz": {
                      "type": "number",
                      "description": "Parameter dz",
                      "required": true
                },
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": false
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "lifetime": {
                      "type": "any",
                      "description": "Parameter lifetime",
                      "required": false
                },
                "tag": {
                      "type": "string",
                      "description": "Parameter tag",
                      "required": false
                }
          },
          "requiredProperties": [
                "ox",
                "oy",
                "oz",
                "dx",
                "dy",
                "dz"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "spawn_trail",
    summary: "Spawn a configurable motion trail.",
    category: "misc",
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
                "lifetime": {
                      "type": "any",
                      "description": "Parameter lifetime",
                      "required": false
                },
                "width": {
                      "type": "number",
                      "description": "Parameter width",
                      "required": false
                },
                "segments": {
                      "type": "any",
                      "description": "Parameter segments",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "hit_feedback",
    summary: "Trigger combined hit VFX, flash, and camera feedback.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
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
                "vfx": {
                      "type": "any",
                      "description": "Parameter vfx",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "explosion_feedback",
    summary: "Trigger cinematic explosion feedback.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
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
    type: "playback_run",
    summary: "Run a deterministic playback test script.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "script": {
                      "type": "any",
                      "description": "Parameter script",
                      "required": true
                }
          },
          "requiredProperties": [
                "script"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "playback_stop",
    summary: "Stop the active playback test.",
    category: "misc",
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
    type: "playback_status",
    summary: "Read playback test status.",
    category: "misc",
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
    type: "replay_start_recording",
    summary: "Start recording an input replay.",
    category: "misc",
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
    type: "replay_stop_recording",
    summary: "Stop input replay recording.",
    category: "misc",
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
    type: "replay_play",
    summary: "Play the loaded replay.",
    category: "misc",
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
    type: "replay_pause",
    summary: "Pause replay playback.",
    category: "misc",
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
    type: "replay_stop",
    summary: "Stop replay playback.",
    category: "misc",
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
    type: "replay_step",
    summary: "Advance replay by one frame.",
    category: "misc",
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
    type: "replay_step_back",
    summary: "Move replay back by one frame.",
    category: "misc",
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
    type: "replay_set_frame",
    summary: "Seek replay to an exact frame.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "frame": {
                      "type": "number",
                      "description": "Parameter frame",
                      "required": true
                }
          },
          "requiredProperties": [
                "frame"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "sensorium_run",
    summary: "Run a custom SENSORIUM test script.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "script": {
                      "type": "any",
                      "description": "Parameter script",
                      "required": true
                }
          },
          "requiredProperties": [
                "script"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "sensorium_stop",
    summary: "Stop the active SENSORIUM run.",
    category: "misc",
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
    type: "sensorium_status",
    summary: "Read SENSORIUM runner status.",
    category: "misc",
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
    type: "sensorium_baseline",
    summary: "Select or save a named SENSORIUM baseline.",
    category: "misc",
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
    type: "export_typings",
    summary: "Export current IDE TypeScript declarations.",
    category: "misc",
    sideEffect: "external",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "package.build",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "spawn_vfx",
    summary: "Spawn a VFX emitter at a world position.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "preset": {
                      "type": "string",
                      "description": "Parameter preset",
                      "required": true
                },
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
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "loop": {
                      "type": "boolean",
                      "description": "Parameter loop",
                      "required": false
                },
                "maxParticles": {
                      "type": "any",
                      "description": "Parameter maxParticles",
                      "required": false
                }
          },
          "requiredProperties": [
                "preset",
                "x",
                "y",
                "z"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "burst_vfx",
    summary: "One-shot VFX burst.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "preset": {
                      "type": "string",
                      "description": "Parameter preset",
                      "required": true
                },
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
                "count": {
                      "type": "number",
                      "description": "Parameter count",
                      "required": false
                }
          },
          "requiredProperties": [
                "preset",
                "x",
                "y",
                "z"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "register_asset",
    summary: "Register a GLB path under an id for spawning.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "asset.import",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Parameter id",
                      "required": true
                },
                "path": {
                      "type": "string",
                      "description": "Parameter path",
                      "required": true
                },
                "assetType": {
                      "type": "any",
                      "description": "Parameter assetType",
                      "required": false
                }
          },
          "requiredProperties": [
                "id",
                "path"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "preload_assets",
    summary: "Preload assets by id.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "asset.import",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "ids": {
                      "type": "array",
                      "description": "Parameter ids",
                      "required": true
                }
          },
          "requiredProperties": [
                "ids"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "run_script",
    summary: "Run a nested batch of commands.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "commands": {
                      "type": "array",
                      "description": "Parameter commands",
                      "required": true
                }
          },
          "requiredProperties": [
                "commands"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "sensorium_test",
    summary: "SENSORIUM: run a vision/feel test by profile (driving, locomotion, …).",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "profile": {
                      "type": "any",
                      "description": "Parameter profile",
                      "required": true
                },
                "options": {
                      "type": "object",
                      "description": "Parameter options",
                      "required": false
                }
          },
          "requiredProperties": [
                "profile"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "add_nav_agent",
    summary: "NAV: attach a NavAgent to an entity (steering + pathfinding + behavior).",
    category: "misc",
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
                },
                "targetX": {
                      "type": "any",
                      "description": "Parameter targetX",
                      "required": false
                },
                "targetY": {
                      "type": "any",
                      "description": "Parameter targetY",
                      "required": false
                },
                "targetZ": {
                      "type": "any",
                      "description": "Parameter targetZ",
                      "required": false
                },
                "targetEntityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter targetEntityId",
                      "required": false
                },
                "patrol": {
                      "type": "any",
                      "description": "Parameter patrol",
                      "required": false
                },
                "patrolLoop": {
                      "type": "any",
                      "description": "Parameter patrolLoop",
                      "required": false
                },
                "steering": {
                      "type": "object",
                      "description": "Parameter steering",
                      "required": false
                },
                "behaviorTree": {
                      "type": "any",
                      "description": "Parameter behaviorTree",
                      "required": false
                },
                "faceMovement": {
                      "type": "any",
                      "description": "Parameter faceMovement",
                      "required": false
                },
                "groundSnap": {
                      "type": "any",
                      "description": "Parameter groundSnap",
                      "required": false
                },
                "tag": {
                      "type": "string",
                      "description": "Parameter tag",
                      "required": false
                },
                "flockRadius": {
                      "type": "any",
                      "description": "Parameter flockRadius",
                      "required": false
                },
                "queueLaneWidth": {
                      "type": "any",
                      "description": "Parameter queueLaneWidth",
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
    type: "set_nav_target",
    summary: "NAV: set / change an agent mode + target (resets its path).",
    category: "misc",
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
                      "required": true
                },
                "targetX": {
                      "type": "any",
                      "description": "Parameter targetX",
                      "required": false
                },
                "targetY": {
                      "type": "any",
                      "description": "Parameter targetY",
                      "required": false
                },
                "targetZ": {
                      "type": "any",
                      "description": "Parameter targetZ",
                      "required": false
                },
                "targetEntityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter targetEntityId",
                      "required": false
                },
                "patrol": {
                      "type": "any",
                      "description": "Parameter patrol",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "mode"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "set_nav_behavior_tree",
    summary: "NAV: install / replace an agent behavior tree (sets mode to behavior_tree).",
    category: "misc",
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
                "tree": {
                      "type": "object",
                      "description": "Parameter tree",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "tree"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "set_nav_steering",
    summary: "NAV: override an agent steering params (maxSpeed, arriveRadius, …).",
    category: "misc",
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
                "steering": {
                      "type": "object",
                      "description": "Parameter steering",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "steering"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "set_nav_blackboard",
    summary: "NAV: set a blackboard key on an agent behavior tree.",
    category: "misc",
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
                "key": {
                      "type": "string",
                      "description": "Parameter key",
                      "required": true
                },
                "value": {
                      "type": "any",
                      "description": "Parameter value",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "key",
                "value"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "remove_nav_agent",
    summary: "NAV: remove a NavAgent (entity untouched).",
    category: "misc",
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
    type: "import_asset",
    summary: "IMPORT: download a third-party asset from a URL, cache in IndexedDB, register with manifest.",
    category: "misc",
    sideEffect: "external",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "asset.import",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Parameter id",
                      "required": true
                },
                "url": {
                      "type": "string",
                      "description": "Parameter url",
                      "required": true
                },
                "assetType": {
                      "type": "any",
                      "description": "Parameter assetType",
                      "required": false
                }
          },
          "requiredProperties": [
                "id",
                "url"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "import_list",
    summary: "IMPORT: list all cached asset ids.",
    category: "misc",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "asset.import",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "import_clear",
    summary: "IMPORT: clear a cached asset (or all).",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "asset.import",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Parameter id",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "inspect_schema_get",
    summary: "INSPECTOR STUDIO: retrieve registered inspector schema metadata for a target class/type.",
    category: "misc",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": true
                }
          },
          "requiredProperties": [
                "target"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inspect_schema_define",
    summary: "INSPECTOR STUDIO: define or replace an inspector schema for a target class/type.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": true
                },
                "schema": {
                      "type": "object",
                      "description": "Parameter schema",
                      "required": true
                }
          },
          "requiredProperties": [
                "target",
                "schema"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inspect_schema_patch",
    summary: "INSPECTOR STUDIO: patch an existing inspector schema with partial metadata.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": true
                },
                "patch": {
                      "type": "object",
                      "description": "Parameter patch",
                      "required": true
                }
          },
          "requiredProperties": [
                "target",
                "patch"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inspect_property_get",
    summary: "INSPECTOR STUDIO: read nested property value through PropertyTree reflection path.",
    category: "misc",
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
                "path": {
                      "type": "string",
                      "description": "Parameter path",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "path"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inspect_property_set",
    summary: "INSPECTOR STUDIO: write property value through PropertyTree reflection path.",
    category: "misc",
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
                "path": {
                      "type": "string",
                      "description": "Parameter path",
                      "required": true
                },
                "value": {
                      "type": "any",
                      "description": "Parameter value",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "path",
                "value"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inspect_validate",
    summary: "INSPECTOR STUDIO: run live or global validation with structured issues, warnings, and auto-fix dry-runs.",
    category: "misc",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
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
                "scope": {
                      "type": "any",
                      "description": "Parameter scope",
                      "required": false
                },
                "dryRun": {
                      "type": "boolean",
                      "description": "Parameter dryRun",
                      "required": false
                },
                "autoFix": {
                      "type": "boolean",
                      "description": "Parameter autoFix",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "inspect_serialize",
    summary: "INSPECTOR STUDIO: serialize entity or component into deterministic polymorphic JSON.",
    category: "misc",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
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
    type: "inspect_deserialize",
    summary: "INSPECTOR STUDIO: deserialize polymorphic JSON into structured runtime object.",
    category: "misc",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "json": {
                      "type": "any",
                      "description": "Parameter json",
                      "required": true
                }
          },
          "requiredProperties": [
                "json"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inspect_diff",
    summary: "INSPECTOR STUDIO: compute deep structural diff between two inspector objects.",
    category: "misc",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "a": {
                      "type": "any",
                      "description": "Parameter a",
                      "required": true
                },
                "b": {
                      "type": "any",
                      "description": "Parameter b",
                      "required": true
                }
          },
          "requiredProperties": [
                "a",
                "b"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "component_add",
    summary: "Attach a modular ECS component to an entity.",
    category: "misc",
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
                      "required": true
                },
                "component": {
                      "type": "string",
                      "description": "Parameter component",
                      "required": true
                },
                "props": {
                      "type": "object",
                      "description": "Parameter props",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "component"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "component_remove",
    summary: "Detach and destroy a modular ECS component on an entity.",
    category: "misc",
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
                      "required": true
                },
                "component": {
                      "type": "string",
                      "description": "Parameter component",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "component"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "component_set",
    summary: "Update a property on an attached modular ECS component.",
    category: "misc",
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
                      "required": true
                },
                "component": {
                      "type": "string",
                      "description": "Parameter component",
                      "required": true
                },
                "prop": {
                      "type": "string",
                      "description": "Parameter prop",
                      "required": true
                },
                "value": {
                      "type": "any",
                      "description": "Parameter value",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "component",
                "prop",
                "value"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "component_get",
    summary: "Read serialized state of an attached modular component.",
    category: "misc",
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
                      "required": true
                },
                "component": {
                      "type": "string",
                      "description": "Parameter component",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "component"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "components_list",
    summary: "List all registered modular ECS component types with schemas.",
    category: "misc",
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
    type: "kcc_set_params",
    summary: "Configure KCC kinematic locomotion parameters (speeds, jumps, slopes, coyote, dash).",
    category: "misc",
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
                "params": {
                      "type": "object",
                      "description": "Parameter params",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "params"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "kcc_get_params",
    summary: "Query current KCC parameters for a character.",
    category: "misc",
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
    type: "kcc_teleport",
    summary: "Teleport KCC character to world position and reset momentum.",
    category: "misc",
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
                }
          },
          "requiredProperties": [
                "entityId",
                "x",
                "y",
                "z"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "kcc_get_telemetry",
    summary: "Retrieve live KCC physics feel metrics (grounding, jitter, impact G, wall hits).",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    deprecatedAliases: ["kcc_telemetry_get"],
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
    type: "kcc_telemetry_get",
    summary: "Compatibility alias for kcc_get_telemetry.",
    category: "misc",
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
    type: "input_context_push",
    summary: "Push a named input context layer onto the priority stack.",
    category: "misc",
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
                },
                "priority": {
                      "type": "any",
                      "description": "Parameter priority",
                      "required": false
                },
                "actions": {
                      "type": "array",
                      "description": "Parameter actions",
                      "required": false
                },
                "maskAllBelow": {
                      "type": "boolean",
                      "description": "Parameter maskAllBelow",
                      "required": false
                }
          },
          "requiredProperties": [
                "name"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "input_context_pop",
    summary: "Pop an input context layer from the priority stack.",
    category: "misc",
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
    type: "input_contexts",
    summary: "List all active input contexts on the priority stack.",
    category: "misc",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "input_action_define",
    summary: "Define or modify an input action with multi-device bindings and deadzone.",
    category: "misc",
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
                },
                "kind": {
                      "type": "string",
                      "description": "Parameter kind",
                      "required": true
                },
                "bindings": {
                      "type": "any",
                      "description": "Parameter bindings",
                      "required": false
                },
                "deadzone": {
                      "type": "any",
                      "description": "Parameter deadzone",
                      "required": false
                },
                "responseCurve": {
                      "type": "any",
                      "description": "Parameter responseCurve",
                      "required": false
                },
                "context": {
                      "type": "any",
                      "description": "Parameter context",
                      "required": false
                }
          },
          "requiredProperties": [
                "name",
                "kind"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "input_bind",
    summary: "Bind a physical device input to an existing action.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "action": {
                      "type": "string",
                      "description": "Parameter action",
                      "required": true
                },
                "binding": {
                      "type": "object",
                      "description": "Parameter binding",
                      "required": true
                }
          },
          "requiredProperties": [
                "action",
                "binding"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "input_unbind",
    summary: "Remove all physical bindings from an input action.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "action": {
                      "type": "string",
                      "description": "Parameter action",
                      "required": true
                }
          },
          "requiredProperties": [
                "action"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "input_actions",
    summary: "Export the complete JSON-friendly input action asset.",
    category: "misc",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "input_remap",
    summary: "Replace a context action map from an action asset or actions array.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "actions": {
                      "type": "array",
                      "description": "Parameter actions",
                      "required": true
                },
                "context": {
                      "type": "any",
                      "description": "Parameter context",
                      "required": false
                }
          },
          "requiredProperties": [
                "actions"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "input_gamepad_status",
    summary: "Query connected gamepads status.",
    category: "misc",
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
    type: "input_gamepad_controls",
    summary: "List Unity-style semantic Gamepad control paths and aliases.",
    category: "misc",
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
    type: "input_gamepad_rumble",
    summary: "Trigger dual-rumble haptic feedback on a gamepad.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "pad": {
                      "type": "any",
                      "description": "Parameter pad",
                      "required": false
                },
                "durationMs": {
                      "type": "number",
                      "description": "Parameter durationMs",
                      "required": false
                },
                "weakMagnitude": {
                      "type": "number",
                      "description": "Parameter weakMagnitude",
                      "required": false
                },
                "strongMagnitude": {
                      "type": "number",
                      "description": "Parameter strongMagnitude",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "input_synthetic",
    summary: "Inject synthetic headless action input for automated tests and SENSORIUM.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "action": {
                      "type": "string",
                      "description": "Parameter action",
                      "required": true
                },
                "value": {
                      "type": "any",
                      "description": "Parameter value",
                      "required": true
                }
          },
          "requiredProperties": [
                "action",
                "value"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "chunk_deltas_export",
    summary: "Export persistent streamed-chunk modifications.",
    category: "misc",
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
    type: "chunk_deltas_import",
    summary: "Restore persistent streamed-chunk modifications.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "data": {
                      "type": "any",
                      "description": "Parameter data",
                      "required": true
                }
          },
          "requiredProperties": [
                "data"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "chunk_deltas_clear",
    summary: "Clear all persistent streamed-chunk modifications.",
    category: "misc",
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
    type: "hlod_create",
    summary: "Bake an impostor atlas, batch a source cluster, and enable runtime near/far swapping.",
    category: "misc",
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
                "entityIds": {
                      "type": "array",
                      "description": "Parameter entityIds",
                      "required": true
                },
                "prototypeEntityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter prototypeEntityId",
                      "required": false
                },
                "nearDistance": {
                      "type": "any",
                      "description": "Parameter nearDistance",
                      "required": false
                },
                "farDistance": {
                      "type": "any",
                      "description": "Parameter farDistance",
                      "required": false
                },
                "views": {
                      "type": "any",
                      "description": "Parameter views",
                      "required": false
                },
                "tileSize": {
                      "type": "any",
                      "description": "Parameter tileSize",
                      "required": false
                }
          },
          "requiredProperties": [
                "id",
                "entityIds"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "hlod_remove",
    summary: "Remove an HLOD cluster and restore its full-detail sources.",
    category: "misc",
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
  {
    type: "hlod_list",
    summary: "List runtime HLOD clusters and swap state.",
    category: "misc",
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
    type: "network_host",
    summary: "Start authoritative replication over WebSocket.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "network.start",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "url": {
                      "type": "string",
                      "description": "Parameter url",
                      "required": true
                }
          },
          "requiredProperties": [
                "url"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "network_join",
    summary: "Join an authoritative session over WebSocket.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "network.start",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "url": {
                      "type": "string",
                      "description": "Parameter url",
                      "required": true
                }
          },
          "requiredProperties": [
                "url"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "network_disconnect",
    summary: "Disconnect and return to offline simulation.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "network.start",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "network_replicate",
    summary: "Add or remove an entity from delta-compressed replication.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "network.start",
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
                "enabled": {
                      "type": "boolean",
                      "description": "Parameter enabled",
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
    type: "network_local_player",
    summary: "Select the locally predicted entity.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "network.start",
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
    type: "network_status",
    summary: "Query role, connection, tick, traffic, and reconciliation stats.",
    category: "misc",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "network.start",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "profiler_set",
    summary: "Enable or disable frame-timeline and VRAM profiling.",
    category: "misc",
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
    type: "profiler_status",
    summary: "Return the latest subsystem frame slices, render counters, and estimated VRAM.",
    category: "misc",
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
    type: "profiler_history",
    summary: "Return recent frame profiles for timeline analysis.",
    category: "misc",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "limit": {
                      "type": "number",
                      "description": "Parameter limit",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "profiler_clear",
    summary: "Clear captured profiler history.",
    category: "misc",
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
    type: "undo",
    summary: "Undo the last transactional change from history.",
    category: "misc",
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
    type: "redo",
    summary: "Redo the last reverted transactional change from history.",
    category: "misc",
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
    type: "history_list",
    summary: "List recent undoable actions in history.",
    category: "misc",
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
    type: "history_clear",
    summary: "Clear the undo/redo history stack.",
    category: "misc",
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
    type: "package_game",
    summary: "Bundle scenes, assets, gameplay rules, and visual styles into standalone game manifest.",
    category: "misc",
    sideEffect: "external",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "package.build",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "title": {
                      "type": "string",
                      "description": "Parameter title",
                      "required": false
                },
                "entryScene": {
                      "type": "any",
                      "description": "Parameter entryScene",
                      "required": false
                },
                "visualStyle": {
                      "type": "any",
                      "description": "Parameter visualStyle",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "export_tauri_manifest",
    summary: "Generate Tauri desktop executable configuration for cross-platform export.",
    category: "misc",
    sideEffect: "external",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "package.build",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "title": {
                      "type": "string",
                      "description": "Parameter title",
                      "required": false
                },
                "version": {
                      "type": "string",
                      "description": "Parameter version",
                      "required": false
                },
                "fullscreen": {
                      "type": "any",
                      "description": "Parameter fullscreen",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "decal_spawn",
    summary: "Project a surface decal (bullet hole, scorch mark, blood splatter) onto scene geometry.",
    category: "misc",
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
                "normal": {
                      "type": "object",
                      "description": "Parameter normal",
                      "required": true
                },
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": false
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": false
                },
                "lifespan": {
                      "type": "any",
                      "description": "Parameter lifespan",
                      "required": false
                }
          },
          "requiredProperties": [
                "position",
                "normal"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "weather_set",
    summary: "Transition world weather conditions (clear, rain, storm, snow, foggy).",
    category: "misc",
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
                "transitionDuration": {
                      "type": "any",
                      "description": "Parameter transitionDuration",
                      "required": false
                }
          },
          "requiredProperties": [
                "state"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "cloth_create_grid",
    summary: "Generate a particle-based Verlet cloth mesh grid with pin constraints.",
    category: "misc",
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
                "width": {
                      "type": "number",
                      "description": "Parameter width",
                      "required": true
                },
                "height": {
                      "type": "number",
                      "description": "Parameter height",
                      "required": true
                },
                "segsX": {
                      "type": "any",
                      "description": "Parameter segsX",
                      "required": true
                },
                "segsY": {
                      "type": "any",
                      "description": "Parameter segsY",
                      "required": true
                },
                "pinTop": {
                      "type": "boolean",
                      "description": "Parameter pinTop",
                      "required": false
                }
          },
          "requiredProperties": [
                "id",
                "width",
                "height",
                "segsX",
                "segsY"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "cloth_remove",
    summary: "Remove and dispose a live Verlet cloth simulation.",
    category: "misc",
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
  {
    type: "cloth_list",
    summary: "List live cloth simulations and particle/constraint counts.",
    category: "misc",
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
];
