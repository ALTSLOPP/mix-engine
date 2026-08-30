/**
 * MIX Engine Command Registry — TWEEN domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const tweenCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "tween_to",
    summary: "TWEEN DIRECTOR: tween a property to target value with duration, ease, loops, and conflict policy.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "property": {
                      "type": "string",
                      "description": "Parameter property",
                      "required": true
                },
                "to": {
                      "type": "string",
                      "description": "Parameter to",
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
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": false
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "delay": {
                      "type": "any",
                      "description": "Parameter delay",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                },
                "loops": {
                      "type": "any",
                      "description": "Parameter loops",
                      "required": false
                },
                "loopType": {
                      "type": "any",
                      "description": "Parameter loopType",
                      "required": false
                },
                "conflictPolicy": {
                      "type": "any",
                      "description": "Parameter conflictPolicy",
                      "required": false
                },
                "id": {
                      "type": "string",
                      "description": "Parameter id",
                      "required": false
                }
          },
          "requiredProperties": [
                "property",
                "to"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_from",
    summary: "TWEEN DIRECTOR: tween from initial value to current pose.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "property": {
                      "type": "string",
                      "description": "Parameter property",
                      "required": true
                },
                "from": {
                      "type": "string",
                      "description": "Parameter from",
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
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": false
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "delay": {
                      "type": "any",
                      "description": "Parameter delay",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                },
                "loops": {
                      "type": "any",
                      "description": "Parameter loops",
                      "required": false
                },
                "loopType": {
                      "type": "any",
                      "description": "Parameter loopType",
                      "required": false
                },
                "conflictPolicy": {
                      "type": "any",
                      "description": "Parameter conflictPolicy",
                      "required": false
                },
                "id": {
                      "type": "string",
                      "description": "Parameter id",
                      "required": false
                }
          },
          "requiredProperties": [
                "property",
                "from"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_from_to",
    summary: "TWEEN DIRECTOR: explicit from-to tween between two values.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "property": {
                      "type": "string",
                      "description": "Parameter property",
                      "required": true
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
                "entityId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter entityId",
                      "required": false
                },
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": false
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "delay": {
                      "type": "any",
                      "description": "Parameter delay",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                },
                "loops": {
                      "type": "any",
                      "description": "Parameter loops",
                      "required": false
                },
                "loopType": {
                      "type": "any",
                      "description": "Parameter loopType",
                      "required": false
                },
                "conflictPolicy": {
                      "type": "any",
                      "description": "Parameter conflictPolicy",
                      "required": false
                },
                "id": {
                      "type": "string",
                      "description": "Parameter id",
                      "required": false
                }
          },
          "requiredProperties": [
                "property",
                "from",
                "to"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_move",
    summary: "TWEEN DIRECTOR: smooth position movement on an entity.",
    category: "tween",
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
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                },
                "loops": {
                      "type": "any",
                      "description": "Parameter loops",
                      "required": false
                },
                "loopType": {
                      "type": "any",
                      "description": "Parameter loopType",
                      "required": false
                },
                "conflictPolicy": {
                      "type": "any",
                      "description": "Parameter conflictPolicy",
                      "required": false
                },
                "id": {
                      "type": "string",
                      "description": "Parameter id",
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
    type: "tween_rotate",
    summary: "TWEEN DIRECTOR: smooth rotation on an entity using shortest angular/quaternion path.",
    category: "tween",
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
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                },
                "loops": {
                      "type": "any",
                      "description": "Parameter loops",
                      "required": false
                },
                "loopType": {
                      "type": "any",
                      "description": "Parameter loopType",
                      "required": false
                },
                "conflictPolicy": {
                      "type": "any",
                      "description": "Parameter conflictPolicy",
                      "required": false
                },
                "id": {
                      "type": "string",
                      "description": "Parameter id",
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
    type: "tween_scale",
    summary: "TWEEN DIRECTOR: uniform or multi-axis scale tween.",
    category: "tween",
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
                "scale": {
                      "type": "number",
                      "description": "Parameter scale",
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
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                },
                "loops": {
                      "type": "any",
                      "description": "Parameter loops",
                      "required": false
                },
                "loopType": {
                      "type": "any",
                      "description": "Parameter loopType",
                      "required": false
                },
                "conflictPolicy": {
                      "type": "any",
                      "description": "Parameter conflictPolicy",
                      "required": false
                },
                "id": {
                      "type": "string",
                      "description": "Parameter id",
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
    type: "tween_punch",
    summary: "TWEEN DIRECTOR: decaying spring punch oscillation.",
    category: "tween",
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
                "property": {
                      "type": "string",
                      "description": "Parameter property",
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
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "vibrato": {
                      "type": "any",
                      "description": "Parameter vibrato",
                      "required": false
                },
                "elasticity": {
                      "type": "any",
                      "description": "Parameter elasticity",
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
    type: "tween_shake",
    summary: "TWEEN DIRECTOR: multi-frequency noise shake with decay.",
    category: "tween",
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
                "property": {
                      "type": "string",
                      "description": "Parameter property",
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
                "fadeOut": {
                      "type": "any",
                      "description": "Parameter fadeOut",
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
    type: "tween_sequence_create",
    summary: "TWEEN DIRECTOR: create a timeline sequence.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "sequenceId": {
                      "type": "string",
                      "description": "Parameter sequenceId",
                      "required": false
                },
                "timeScale": {
                      "type": "any",
                      "description": "Parameter timeScale",
                      "required": false
                },
                "loops": {
                      "type": "any",
                      "description": "Parameter loops",
                      "required": false
                },
                "loopType": {
                      "type": "any",
                      "description": "Parameter loopType",
                      "required": false
                },
                "autoPlay": {
                      "type": "boolean",
                      "description": "Parameter autoPlay",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "tween_sequence_append",
    summary: "TWEEN DIRECTOR: append step to timeline sequence.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "sequenceId": {
                      "type": "string",
                      "description": "Parameter sequenceId",
                      "required": true
                },
                "op": {
                      "type": "string",
                      "description": "Parameter op",
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
                "scale": {
                      "type": "number",
                      "description": "Parameter scale",
                      "required": false
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                }
          },
          "requiredProperties": [
                "sequenceId",
                "op"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_sequence_join",
    summary: "TWEEN DIRECTOR: join step running in parallel on timeline sequence.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "sequenceId": {
                      "type": "string",
                      "description": "Parameter sequenceId",
                      "required": true
                },
                "op": {
                      "type": "string",
                      "description": "Parameter op",
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
                "scale": {
                      "type": "number",
                      "description": "Parameter scale",
                      "required": false
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                }
          },
          "requiredProperties": [
                "sequenceId",
                "op"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_sequence_marker",
    summary: "TWEEN DIRECTOR: add named event marker to sequence timeline.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "sequenceId": {
                      "type": "string",
                      "description": "Parameter sequenceId",
                      "required": true
                },
                "name": {
                      "type": "string",
                      "description": "Parameter name",
                      "required": true
                },
                "time": {
                      "type": "number",
                      "description": "Parameter time",
                      "required": false
                }
          },
          "requiredProperties": [
                "sequenceId",
                "name"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_sequence_play",
    summary: "TWEEN DIRECTOR: play timeline sequence.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "sequenceId": {
                      "type": "string",
                      "description": "Parameter sequenceId",
                      "required": true
                }
          },
          "requiredProperties": [
                "sequenceId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_pause",
    summary: "TWEEN DIRECTOR: pause tween or sequence by id, or pause all.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
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
    type: "tween_resume",
    summary: "TWEEN DIRECTOR: resume tween or sequence by id, or resume all.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
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
    type: "tween_cancel",
    summary: "TWEEN DIRECTOR: cancel/kill tween or sequence by id, entityId, or all.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Parameter id",
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
    type: "tween_complete",
    summary: "TWEEN DIRECTOR: complete tween or sequence immediately.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
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
    type: "tween_inspect",
    summary: "TWEEN DIRECTOR: return structured diagnostics and telemetry report of active tweens.",
    category: "tween",
    sideEffect: "read",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "tween_validate",
    summary: "TWEEN DIRECTOR: validate sequence JSON against schema.",
    category: "tween",
    sideEffect: "read",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "sequenceJson": {
                      "type": "any",
                      "description": "Parameter sequenceJson",
                      "required": true
                }
          },
          "requiredProperties": [
                "sequenceJson"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_camera",
    summary: "TWEEN DIRECTOR: smooth camera movement, FOV transition, or LookAt targeting.",
    category: "tween",
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
                "fov": {
                      "type": "number",
                      "description": "Parameter fov",
                      "required": false
                },
                "lookAt": {
                      "type": "any",
                      "description": "Parameter lookAt",
                      "required": false
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "tween_color",
    summary: "TWEEN DIRECTOR: animate material or light color smoothly.",
    category: "tween",
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
                "property": {
                      "type": "string",
                      "description": "Parameter property",
                      "required": false
                },
                "color": {
                      "type": "string",
                      "description": "Parameter color",
                      "required": true
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                }
          },
          "requiredProperties": [
                "color"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_material",
    summary: "TWEEN DIRECTOR: animate material properties (opacity, roughness, metalness, emissive).",
    category: "tween",
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
                "opacity": {
                      "type": "number",
                      "description": "Parameter opacity",
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
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
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
    type: "tween_audio",
    summary: "TWEEN DIRECTOR: fade audio volume smoothly.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "trackId": {
                      "type": "any",
                      "description": "Parameter trackId",
                      "required": false
                },
                "volume": {
                      "type": "number",
                      "description": "Parameter volume",
                      "required": true
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                }
          },
          "requiredProperties": [
                "volume"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_path",
    summary: "TWEEN DIRECTOR: animate entity along waypoints path with constant speed and banking.",
    category: "tween",
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
                "waypoints": {
                      "type": "array",
                      "description": "Parameter waypoints",
                      "required": true
                },
                "duration": {
                      "type": "number",
                      "description": "Parameter duration",
                      "required": false
                },
                "ease": {
                      "type": "any",
                      "description": "Parameter ease",
                      "required": false
                },
                "lookAhead": {
                      "type": "any",
                      "description": "Parameter lookAhead",
                      "required": false
                },
                "autoRotate": {
                      "type": "any",
                      "description": "Parameter autoRotate",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "waypoints"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "tween_seek",
    summary: "TWEEN DIRECTOR: seek tween or sequence to specified time or normalized progress.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
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
                      "required": false
                },
                "progress": {
                      "type": "number",
                      "description": "Parameter progress",
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
    type: "tween_reverse",
    summary: "TWEEN DIRECTOR: reverse playback direction of tween or sequence.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
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
    type: "tween_effect_create",
    summary: "TWEEN DIRECTOR: create high-level multi-step composite effect in a single command.",
    category: "tween",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "steps": {
                      "type": "array",
                      "description": "Parameter steps",
                      "required": true
                },
                "effectId": {
                      "type": "string",
                      "description": "Parameter effectId",
                      "required": false
                },
                "autoPlay": {
                      "type": "boolean",
                      "description": "Parameter autoPlay",
                      "required": false
                }
          },
          "requiredProperties": [
                "steps"
          ],
          "additionalProperties": true
    },
  },
];
