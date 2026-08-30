/**
 * MIX Engine Command Registry — AUDIO domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const audioCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "add_trigger_zone",
    summary: "Add a spherical world trigger with optional audio cues.",
    category: "audio",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "audio.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Parameter id",
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
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": true
                },
                "enterSound": {
                      "type": "any",
                      "description": "Parameter enterSound",
                      "required": false
                },
                "exitSound": {
                      "type": "any",
                      "description": "Parameter exitSound",
                      "required": false
                },
                "ambientSound": {
                      "type": "any",
                      "description": "Parameter ambientSound",
                      "required": false
                },
                "volume": {
                      "type": "number",
                      "description": "Parameter volume",
                      "required": false
                }
          },
          "requiredProperties": [
                "id",
                "x",
                "y",
                "z",
                "radius"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "remove_trigger_zone",
    summary: "Remove a trigger zone by id.",
    category: "audio",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "audio.control",
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
    type: "crossfade_music",
    summary: "Crossfade to a streaming music track.",
    category: "audio",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "audio.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "src": {
                      "type": "string",
                      "description": "Parameter src",
                      "required": true
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                }
          },
          "requiredProperties": [
                "src"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "stop_music",
    summary: "Stop music with an optional fade.",
    category: "audio",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "audio.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "fadeOut": {
                      "type": "any",
                      "description": "Parameter fadeOut",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "set_bus_volume",
    summary: "Set one audio mixer bus volume.",
    category: "audio",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "audio.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "bus": {
                      "type": "any",
                      "description": "Parameter bus",
                      "required": true
                },
                "volume": {
                      "type": "number",
                      "description": "Parameter volume",
                      "required": true
                }
          },
          "requiredProperties": [
                "bus",
                "volume"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "play_sound",
    summary: "Play a positional/one-shot sound.",
    category: "audio",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "audio.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "src": {
                      "type": "string",
                      "description": "Parameter src",
                      "required": true
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
                },
                "volume": {
                      "type": "number",
                      "description": "Parameter volume",
                      "required": false
                },
                "loop": {
                      "type": "boolean",
                      "description": "Parameter loop",
                      "required": false
                },
                "refDistance": {
                      "type": "any",
                      "description": "Parameter refDistance",
                      "required": false
                },
                "maxDistance": {
                      "type": "any",
                      "description": "Parameter maxDistance",
                      "required": false
                }
          },
          "requiredProperties": [
                "src"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "attach_sound",
    summary: "Attach a looping sound to an entity.",
    category: "audio",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "audio.control",
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
                "src": {
                      "type": "string",
                      "description": "Parameter src",
                      "required": true
                },
                "volume": {
                      "type": "number",
                      "description": "Parameter volume",
                      "required": false
                },
                "loop": {
                      "type": "boolean",
                      "description": "Parameter loop",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "src"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "stop_sound",
    summary: "Stop a sound by src or entity.",
    category: "audio",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "audio.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "src": {
                      "type": "string",
                      "description": "Parameter src",
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
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "set_master_volume",
    summary: "Set master audio volume.",
    category: "audio",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "audio.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "volume": {
                      "type": "number",
                      "description": "Parameter volume",
                      "required": true
                }
          },
          "requiredProperties": [
                "volume"
          ],
          "additionalProperties": true
    },
  },
];
