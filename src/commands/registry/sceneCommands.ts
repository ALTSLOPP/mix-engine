/**
 * MIX Engine Command Registry — SCENE domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const sceneCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "set_mode",
    summary: "Switch editor/play mode.",
    category: "scene",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "mode": {
                      "type": "string",
                      "description": "Parameter mode",
                      "required": true
                }
          },
          "requiredProperties": [
                "mode"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "clear_scene",
    summary: "Destroy everything and respawn a ground plane.",
    category: "scene",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "destructive.clear",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "set_snap",
    summary: "Configure transform snapping.",
    category: "scene",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "viewport.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "enabled": {
                      "type": "boolean",
                      "description": "Parameter enabled",
                      "required": false
                },
                "translateSnap": {
                      "type": "any",
                      "description": "Parameter translateSnap",
                      "required": false
                },
                "rotateSnap": {
                      "type": "any",
                      "description": "Parameter rotateSnap",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "set_grid",
    summary: "Configure the editor grid.",
    category: "scene",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "viewport.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": false
                },
                "divisions": {
                      "type": "any",
                      "description": "Parameter divisions",
                      "required": false
                },
                "colorCenterLine": {
                      "type": "any",
                      "description": "Parameter colorCenterLine",
                      "required": false
                },
                "colorGrid": {
                      "type": "any",
                      "description": "Parameter colorGrid",
                      "required": false
                },
                "visible": {
                      "type": "boolean",
                      "description": "Parameter visible",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "set_gizmo_mode",
    summary: "Choose translate, rotate, or scale gizmo mode.",
    category: "scene",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "viewport.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "mode": {
                      "type": "string",
                      "description": "Parameter mode",
                      "required": true
                }
          },
          "requiredProperties": [
                "mode"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "viewport_detach",
    summary: "Detach the live viewport into its own window.",
    category: "scene",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "viewport.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "viewport_reattach",
    summary: "Return the detached viewport to the editor.",
    category: "scene",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "viewport.control",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "query_raycast",
    summary: "Physics ray query in world space.",
    category: "scene",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "origin": {
                      "type": "object",
                      "description": "Parameter origin",
                      "required": true
                },
                "direction": {
                      "type": "object",
                      "description": "Parameter direction",
                      "required": true
                },
                "maxDistance": {
                      "type": "any",
                      "description": "Parameter maxDistance",
                      "required": false
                }
          },
          "requiredProperties": [
                "origin",
                "direction"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "query_sphere",
    summary: "Find entities in a world-space sphere.",
    category: "scene",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "center": {
                      "type": "object",
                      "description": "Parameter center",
                      "required": true
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": true
                },
                "tags": {
                      "type": "array",
                      "description": "Parameter tags",
                      "required": false
                }
          },
          "requiredProperties": [
                "center",
                "radius"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "query_scene",
    summary: "Push a filtered scene query to the cache.",
    category: "scene",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "filter": {
                      "type": "object",
                      "description": "Parameter filter",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "scene_diff",
    summary: "Compute structural and transform JSON delta between scene snapshots.",
    category: "scene",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "beforeEntities": {
                      "type": "any",
                      "description": "Parameter beforeEntities",
                      "required": false
                },
                "afterEntities": {
                      "type": "any",
                      "description": "Parameter afterEntities",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
];
