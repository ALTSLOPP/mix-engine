/**
 * MIX Engine Command Registry — PHYSICS domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const physicsCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "set_gravity",
    summary: "Set world gravity magnitude.",
    category: "physics",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "gravity": {
                      "type": "number",
                      "description": "Parameter gravity",
                      "required": true
                }
          },
          "requiredProperties": [
                "gravity"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "apply_impulse",
    summary: "Apply a one-shot impulse to a dynamic body.",
    category: "physics",
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
    type: "set_velocity",
    summary: "Set linear velocity.",
    category: "physics",
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
    type: "set_angular_velocity",
    summary: "Set angular velocity.",
    category: "physics",
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
    type: "add_vehicle",
    summary: "VEHICLE: attach a raycast-vehicle controller to a dynamic entity (the chassis).",
    category: "physics",
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
                "wheels": {
                      "type": "array",
                      "description": "Parameter wheels",
                      "required": true
                },
                "spec": {
                      "type": "object",
                      "description": "Parameter spec",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "wheels"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "set_vehicle_input",
    summary: "VEHICLE: set throttle/brake/steer/handbrake (-1..1).",
    category: "physics",
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
                "throttle": {
                      "type": "number",
                      "description": "Parameter throttle",
                      "required": false
                },
                "brake": {
                      "type": "number",
                      "description": "Parameter brake",
                      "required": false
                },
                "steer": {
                      "type": "number",
                      "description": "Parameter steer",
                      "required": false
                },
                "handbrake": {
                      "type": "number",
                      "description": "Parameter handbrake",
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
    type: "remove_vehicle",
    summary: "VEHICLE: remove a vehicle controller (chassis untouched).",
    category: "physics",
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
    type: "vehicle_status",
    summary: "VEHICLE: query vehicle speed/rpm/input/wheels-in-contact.",
    category: "physics",
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
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "set_ccd",
    summary: "Toggle Continuous Collision Detection (CCD) on a rigid body.",
    category: "physics",
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
                "enabled": {
                      "type": "boolean",
                      "description": "Parameter enabled",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "enabled"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "collision_layer_define",
    summary: "Define or reconfigure a named collision layer and its collision matrix filter.",
    category: "physics",
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
                "id": {
                      "type": "string",
                      "description": "Parameter id",
                      "required": false
                },
                "collidesWith": {
                      "type": "array",
                      "description": "Parameter collidesWith",
                      "required": true
                }
          },
          "requiredProperties": [
                "name",
                "collidesWith"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "collision_set_layer",
    summary: "Assign an entity to a named collision layer.",
    category: "physics",
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
                }
          },
          "requiredProperties": [
                "entityId",
                "layer"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "collision_matrix_get",
    summary: "Dump the full 16-bit collision matrix layer definitions.",
    category: "physics",
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
    type: "joint_create",
    summary: "Create a physics joint between two rigid bodies (fixed, spherical, revolute, prismatic, rope, spring).",
    category: "physics",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "jointType": {
                      "type": "string",
                      "description": "Parameter jointType",
                      "required": true
                },
                "entityA": {
                      "type": "any",
                      "description": "Parameter entityA",
                      "required": true
                },
                "entityB": {
                      "type": "any",
                      "description": "Parameter entityB",
                      "required": true
                },
                "anchorA": {
                      "type": "object",
                      "description": "Parameter anchorA",
                      "required": true
                },
                "anchorB": {
                      "type": "object",
                      "description": "Parameter anchorB",
                      "required": true
                },
                "axisA": {
                      "type": "object",
                      "description": "Parameter axisA",
                      "required": false
                },
                "axisB": {
                      "type": "object",
                      "description": "Parameter axisB",
                      "required": false
                },
                "limits": {
                      "type": "object",
                      "description": "Parameter limits",
                      "required": false
                },
                "motor": {
                      "type": "object",
                      "description": "Parameter motor",
                      "required": false
                },
                "breakForce": {
                      "type": "number",
                      "description": "Parameter breakForce",
                      "required": false
                }
          },
          "requiredProperties": [
                "jointType",
                "entityA",
                "entityB",
                "anchorA",
                "anchorB"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "joint_remove",
    summary: "Remove and destroy a physics joint by id.",
    category: "physics",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "jointId": {
                      "type": "string",
                      "description": "Parameter jointId",
                      "required": true
                }
          },
          "requiredProperties": [
                "jointId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "joints_list",
    summary: "List all active physics joints.",
    category: "physics",
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
    type: "ragdoll_create",
    summary: "Create a procedural multi-bone humanoid ragdoll.",
    category: "physics",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    deprecatedAliases: ["ragdoll_spawn"],
    parameters: {
          "type": "object",
          "properties": {
                "rootEntity": {
                      "type": "any",
                      "description": "Parameter rootEntity",
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
                }
          },
          "requiredProperties": [
                "rootEntity"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "ragdoll_spawn",
    summary: "Compatibility alias for ragdoll_create.",
    category: "physics",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "rootEntity": {
                      "type": "any",
                      "description": "Parameter rootEntity",
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
                }
          },
          "requiredProperties": [
                "rootEntity"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "active_ragdoll_attach",
    summary: "Attach fixed-step muscle motors to an existing ragdoll.",
    category: "physics",
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
                "muscleStiffness": {
                      "type": "any",
                      "description": "Parameter muscleStiffness",
                      "required": false
                },
                "muscleDamping": {
                      "type": "any",
                      "description": "Parameter muscleDamping",
                      "required": false
                },
                "strength": {
                      "type": "number",
                      "description": "Parameter strength",
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
    type: "active_ragdoll_knockdown",
    summary: "Temporarily collapse an active ragdoll, then recover.",
    category: "physics",
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
                "seconds": {
                      "type": "any",
                      "description": "Parameter seconds",
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
    type: "active_ragdoll_strength",
    summary: "Set active-ragdoll muscle strength.",
    category: "physics",
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
                "strength": {
                      "type": "number",
                      "description": "Parameter strength",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "strength"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "spring_bone_add",
    summary: "Attach a ticked secondary-motion chain to named rig bones.",
    category: "physics",
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
                "bones": {
                      "type": "array",
                      "description": "Parameter bones",
                      "required": true
                },
                "stiffness": {
                      "type": "number",
                      "description": "Parameter stiffness",
                      "required": false
                },
                "damping": {
                      "type": "number",
                      "description": "Parameter damping",
                      "required": false
                },
                "inertia": {
                      "type": "number",
                      "description": "Parameter inertia",
                      "required": false
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": false
                },
                "gravity": {
                      "type": "number",
                      "description": "Parameter gravity",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "bones"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "spring_bone_collider",
    summary: "Add a bone-following spring collision sphere.",
    category: "physics",
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
                "bone": {
                      "type": "any",
                      "description": "Parameter bone",
                      "required": false
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": true
                },
                "offset": {
                      "type": "any",
                      "description": "Parameter offset",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "radius"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "spring_bone_capsule",
    summary: "Add a capsule spring collider spanning two moving bones.",
    category: "physics",
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
                "startBone": {
                      "type": "any",
                      "description": "Parameter startBone",
                      "required": true
                },
                "endBone": {
                      "type": "any",
                      "description": "Parameter endBone",
                      "required": true
                },
                "radius": {
                      "type": "number",
                      "description": "Parameter radius",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "startBone",
                "endBone",
                "radius"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "spring_bone_remove",
    summary: "Remove all spring chains and colliders for an entity.",
    category: "physics",
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
                }
          },
          "requiredProperties": [
                "entityId"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "foot_ik_set",
    summary: "Enable or disable post-animation grounded foot IK.",
    category: "physics",
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
                "enabled": {
                      "type": "boolean",
                      "description": "Parameter enabled",
                      "required": true
                },
                "rayLength": {
                      "type": "any",
                      "description": "Parameter rayLength",
                      "required": false
                },
                "footOffset": {
                      "type": "any",
                      "description": "Parameter footOffset",
                      "required": false
                },
                "maxPelvisDrop": {
                      "type": "any",
                      "description": "Parameter maxPelvisDrop",
                      "required": false
                },
                "smoothSpeed": {
                      "type": "any",
                      "description": "Parameter smoothSpeed",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "enabled"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "buoyancy_add",
    summary: "Register a rigid body for fixed-step Gerstner-water buoyancy.",
    category: "physics",
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
                "volume": {
                      "type": "number",
                      "description": "Parameter volume",
                      "required": false
                },
                "height": {
                      "type": "number",
                      "description": "Parameter height",
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
    type: "buoyancy_remove",
    summary: "Remove an entity from buoyancy simulation.",
    category: "physics",
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
    type: "buoyancy_status",
    summary: "Query entity submersion and swimming state.",
    category: "physics",
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
    type: "ragdoll_set_active",
    summary: "Toggle between active dynamic ragdoll simulation and kinematic animation.",
    category: "physics",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    deprecatedAliases: ["ragdoll_set_dynamic"],
    parameters: {
          "type": "object",
          "properties": {
                "rootEntity": {
                      "type": "any",
                      "description": "Parameter rootEntity",
                      "required": true
                },
                "active": {
                      "type": "boolean",
                      "description": "Parameter active",
                      "required": true
                }
          },
          "requiredProperties": [
                "rootEntity",
                "active"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "ragdoll_set_dynamic",
    summary: "Compatibility alias for ragdoll_set_active.",
    category: "physics",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "rootEntity": {
                      "type": "any",
                      "description": "Parameter rootEntity",
                      "required": true
                },
                "dynamic": {
                      "type": "boolean",
                      "description": "Parameter dynamic",
                      "required": true
                }
          },
          "requiredProperties": [
                "rootEntity",
                "dynamic"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "ragdoll_destroy",
    summary: "Destroy a humanoid ragdoll instance and its bone bodies.",
    category: "physics",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "runtime.mutate",
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
    type: "mesh_fracture",
    summary: "Fracture a rigid body into temporary dynamic physics shards with explosive impulse.",
    category: "physics",
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
                "epicenter": {
                      "type": "any",
                      "description": "Parameter epicenter",
                      "required": false
                },
                "pieces": {
                      "type": "any",
                      "description": "Parameter pieces",
                      "required": false
                },
                "impulse": {
                      "type": "any",
                      "description": "Parameter impulse",
                      "required": false
                },
                "lifespan": {
                      "type": "any",
                      "description": "Parameter lifespan",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId"
          ],
          "additionalProperties": true
    },
  },
];
