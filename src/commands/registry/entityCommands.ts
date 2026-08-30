/**
 * MIX Engine Command Registry — ENTITY domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const entityCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "spawn_entity",
    summary: "Spawn a GLB/preset entity at a world position.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.write",
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
                "glbPath": {
                      "type": "string",
                      "description": "Parameter glbPath",
                      "required": true
                }
          },
          "requiredProperties": [
                "x",
                "y",
                "z",
                "glbPath"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "destroy_entity",
    summary: "Remove an entity (cascades to children).",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
    type: "set_transform",
    summary: "Teleport/orient an entity (world space, zero velocity carry).",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
                "position": {
                      "type": "object",
                      "description": "Parameter position",
                      "required": false
                },
                "rotation": {
                      "type": "object",
                      "description": "Parameter rotation",
                      "required": false
                },
                "scale": {
                      "type": "object",
                      "description": "Entity scale",
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
    type: "parent_entity",
    summary: "Reparent an entity while preserving its world transform; use parentId:null to detach.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
                "parentId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter parentId",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "parentId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "remove_tag",
    summary: "Remove a semantic tag from an entity.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
                "tag": {
                      "type": "string",
                      "description": "Parameter tag",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "tag"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "spawn_smart",
    summary: "SEMANTIC spawn: resolve a free-text description ('rusty red car') to a tagged GLB via the SemanticAssetRegistry, then spawn it with parsed material dressing (tint + procedural rust/dirt) + an auto-fitted compound collider. Async; writes {assetId, score, material} to lastQueryResult.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "scene.write",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "query": {
                      "type": "string",
                      "description": "Parameter query",
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
                "dynamic": {
                      "type": "boolean",
                      "description": "Parameter dynamic",
                      "required": false
                },
                "scale": {
                      "type": "number",
                      "description": "Parameter scale",
                      "required": false
                },
                "compound": {
                      "type": "boolean",
                      "description": "Parameter compound",
                      "required": false
                }
          },
          "requiredProperties": [
                "query",
                "x",
                "y",
                "z"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "set_entity_name",
    summary: "Name an entity (so agents can reference it).",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
    type: "tag_entity",
    summary: "Tag an entity.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
                "tag": {
                      "type": "string",
                      "description": "Parameter tag",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "tag"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "spawn_group",
    summary: "Spawn one blueprint at many positions.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.write",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "blueprint": {
                      "type": "object",
                      "description": "Parameter blueprint",
                      "required": true
                },
                "positions": {
                      "type": "array",
                      "description": "Parameter positions",
                      "required": true
                }
          },
          "requiredProperties": [
                "blueprint",
                "positions"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "scatter",
    summary: "Scatter N of a blueprint in a disk (seedable).",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.write",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "blueprint": {
                      "type": "object",
                      "description": "Parameter blueprint",
                      "required": true
                },
                "count": {
                      "type": "number",
                      "description": "Parameter count",
                      "required": true
                },
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
                "seed": {
                      "type": "number",
                      "description": "Parameter seed",
                      "required": false
                }
          },
          "requiredProperties": [
                "blueprint",
                "count",
                "center",
                "radius"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "prefab_register",
    summary: "Register a nested prefab definition with optional named variants.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "scene.write",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "prefab": {
                      "type": "any",
                      "description": "Parameter prefab",
                      "required": true
                }
          },
          "requiredProperties": [
                "prefab"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "prefab_spawn",
    summary: "Spawn and track a prefab instance, optionally applying a variant.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "scene.write",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "name": {
                      "type": "string",
                      "description": "Parameter name",
                      "required": true
                },
                "position": {
                      "type": "object",
                      "description": "Parameter position",
                      "required": true
                },
                "rotation": {
                      "type": "object",
                      "description": "Parameter rotation",
                      "required": false
                },
                "variant": {
                      "type": "any",
                      "description": "Parameter variant",
                      "required": false
                }
          },
          "requiredProperties": [
                "name",
                "position"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "prefab_unpack",
    summary: "Break a prefab instance link while preserving its entities.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "scene.write",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "rootEntity": {
                      "type": "any",
                      "description": "Parameter rootEntity",
                      "required": true
                }
          },
          "requiredProperties": [
                "rootEntity"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "prefab_list",
    summary: "List registered prefab definitions.",
    category: "entity",
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
    type: "prefab_instances",
    summary: "List linked prefab instances and their entity ids.",
    category: "entity",
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
    type: "selection_set",
    summary: "Replace the editor multi-selection and choose its primary gizmo entity.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.write",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "entityIds": {
                      "type": "array",
                      "description": "Parameter entityIds",
                      "required": true
                },
                "primary": {
                      "type": "any",
                      "description": "Parameter primary",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityIds"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "selection_add",
    summary: "Add an entity to the editor multi-selection.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
                }
          },
          "requiredProperties": [
                "entityId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "selection_toggle",
    summary: "Toggle an entity in the editor multi-selection.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
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
                }
          },
          "requiredProperties": [
                "entityId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "selection_clear",
    summary: "Clear editor selection.",
    category: "entity",
    sideEffect: "scene",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "scene.write",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "selection_get",
    summary: "Return selected entity ids and the primary entity.",
    category: "entity",
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
