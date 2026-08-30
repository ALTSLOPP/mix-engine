/**
 * MIX Engine Command Registry — NAVIGATION domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const navigationCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "navmesh_build",
    summary: "NAV: (re)build the heightfield navmesh over a world region (async).",
    category: "navigation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "centerX": {
                      "type": "any",
                      "description": "Parameter centerX",
                      "required": true
                },
                "centerZ": {
                      "type": "any",
                      "description": "Parameter centerZ",
                      "required": true
                },
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": true
                },
                "cellSize": {
                      "type": "number",
                      "description": "Parameter cellSize",
                      "required": false
                },
                "agentRadius": {
                      "type": "number",
                      "description": "Parameter agentRadius",
                      "required": false
                },
                "agentHeight": {
                      "type": "number",
                      "description": "Parameter agentHeight",
                      "required": false
                },
                "maxSlopeDeg": {
                      "type": "number",
                      "description": "Parameter maxSlopeDeg",
                      "required": false
                },
                "maxStepHeight": {
                      "type": "number",
                      "description": "Parameter maxStepHeight",
                      "required": false
                }
          },
          "requiredProperties": [
                "centerX",
                "centerZ",
                "size"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "navmesh_build_multilayer",
    summary: "NAV: voxel-rasterize scene triangles into a live multi-span navmesh for floors, bridges, and underpasses.",
    category: "navigation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "centerX": {
                      "type": "any",
                      "description": "Parameter centerX",
                      "required": true
                },
                "centerZ": {
                      "type": "any",
                      "description": "Parameter centerZ",
                      "required": true
                },
                "size": {
                      "type": "any",
                      "description": "Parameter size",
                      "required": true
                },
                "cellSize": {
                      "type": "number",
                      "description": "Parameter cellSize",
                      "required": false
                },
                "agentRadius": {
                      "type": "number",
                      "description": "Parameter agentRadius",
                      "required": false
                },
                "agentHeight": {
                      "type": "number",
                      "description": "Parameter agentHeight",
                      "required": false
                },
                "maxSlopeDeg": {
                      "type": "number",
                      "description": "Parameter maxSlopeDeg",
                      "required": false
                },
                "maxStepHeight": {
                      "type": "number",
                      "description": "Parameter maxStepHeight",
                      "required": false
                }
          },
          "requiredProperties": [
                "centerX",
                "centerZ",
                "size"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "eqs_query",
    summary: "EQS: generate and score tactical positions using navigation, distance, LOS, facing, and cover tests.",
    category: "navigation",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "querier": {
                      "type": "any",
                      "description": "Parameter querier",
                      "required": true
                },
                "target": {
                      "type": "string",
                      "description": "Parameter target",
                      "required": false
                },
                "generator": {
                      "type": "object",
                      "description": "Parameter generator",
                      "required": true
                },
                "tests": {
                      "type": "any",
                      "description": "Parameter tests",
                      "required": true
                }
          },
          "requiredProperties": [
                "querier",
                "generator",
                "tests"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "nav_debug",
    summary: "NAV: toggle the navmesh + path debug overlay.",
    category: "navigation",
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
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "nav_query",
    summary: "NAV: walkable floor height at a world position.",
    category: "navigation",
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
    type: "find_path",
    summary: "NAV: A* path between two world positions (waypoints to lastQueryResult).",
    category: "navigation",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "scene.read",
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
                "smooth": {
                      "type": "boolean",
                      "description": "Parameter smooth",
                      "required": false
                },
                "goalTolerance": {
                      "type": "any",
                      "description": "Parameter goalTolerance",
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
    type: "nav_goto",
    summary: "NAV: SEMANTIC — send an agent to a named landmark / named-or-tagged entity / world point at a gait (walk|run|sprint). Auto-creates the agent; async, writes the arrival result (status/elapsed/pathLength) to lastQueryResult.",
    category: "navigation",
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
                "pathMode": {
                      "type": "any",
                      "description": "Parameter pathMode",
                      "required": false
                },
                "arriveRadius": {
                      "type": "any",
                      "description": "Parameter arriveRadius",
                      "required": false
                },
                "requirePath": {
                      "type": "any",
                      "description": "Parameter requirePath",
                      "required": false
                },
                "timeoutSec": {
                      "type": "any",
                      "description": "Parameter timeoutSec",
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
  {
    type: "nav_register_landmark",
    summary: "NAV: register/move a named semantic destination the AI can nav_goto by string.",
    category: "navigation",
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
                      "required": false
                }
          },
          "requiredProperties": [
                "name",
                "x",
                "y",
                "z"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "navmesh_auto",
    summary: "NAV: enable/configure the dynamic, chunk-aware navmesh (incremental per-region re-rasterization as chunks stream and buildings extrude).",
    category: "navigation",
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
                "maxRegionsPerFrame": {
                      "type": "any",
                      "description": "Parameter maxRegionsPerFrame",
                      "required": false
                },
                "maxQueued": {
                      "type": "any",
                      "description": "Parameter maxQueued",
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
    type: "navmesh_invalidate",
    summary: "NAV: invalidate a world-space rectangle of the navmesh (re-rasterized over the next ticks) — call after extruding/demolishing a building.",
    category: "navigation",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "minX": {
                      "type": "number",
                      "description": "Parameter minX",
                      "required": true
                },
                "minZ": {
                      "type": "number",
                      "description": "Parameter minZ",
                      "required": true
                },
                "maxX": {
                      "type": "number",
                      "description": "Parameter maxX",
                      "required": true
                },
                "maxZ": {
                      "type": "number",
                      "description": "Parameter maxZ",
                      "required": true
                }
          },
          "requiredProperties": [
                "minX",
                "minZ",
                "maxX",
                "maxZ"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "goap_plan",
    summary: "Compute optimal action sequence to achieve world-state goals using Goal-Oriented Action Planning.",
    category: "navigation",
    sideEffect: "read",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "scene.read",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "startState": {
                      "type": "any",
                      "description": "Parameter startState",
                      "required": true
                },
                "goalState": {
                      "type": "any",
                      "description": "Parameter goalState",
                      "required": true
                },
                "actions": {
                      "type": "array",
                      "description": "Parameter actions",
                      "required": true
                }
          },
          "requiredProperties": [
                "startState",
                "goalState",
                "actions"
          ],
          "additionalProperties": true
    },
  },
];
