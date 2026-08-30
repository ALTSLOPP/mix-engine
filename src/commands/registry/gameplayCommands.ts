/**
 * MIX Engine Command Registry — GAMEPLAY domain.
 * Authoritative definitions generated from engine specification.
 */

import type { CommandDefinition, CommandParamSchema } from '../types';

export const gameplayCommandDefinitions: readonly CommandDefinition[] = [
  {
    type: "save_scene",
    summary: "Persist the world snapshot to disk/IndexedDB.",
    category: "gameplay",
    sideEffect: "external",
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
    type: "load_scene",
    summary: "Load a saved world snapshot.",
    category: "gameplay",
    sideEffect: "external",
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
    type: "set_state",
    summary: "Set one game-state key.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
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
                "key",
                "value"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "get_state",
    summary: "Read one game-state key.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "key": {
                      "type": "string",
                      "description": "Parameter key",
                      "required": true
                }
          },
          "requiredProperties": [
                "key"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "remove_state",
    summary: "Remove one game-state key.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "key": {
                      "type": "string",
                      "description": "Parameter key",
                      "required": true
                }
          },
          "requiredProperties": [
                "key"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "list_state",
    summary: "List all game-state keys and values.",
    category: "gameplay",
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
    type: "clear_state",
    summary: "Clear all game-state keys.",
    category: "gameplay",
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
    type: "save_state_snapshot",
    summary: "Save a named game-state snapshot.",
    category: "gameplay",
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
    type: "load_state_snapshot",
    summary: "Load a named game-state snapshot.",
    category: "gameplay",
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
    type: "combat_add_health",
    summary: "COMBAT: add a health component to an entity.",
    category: "gameplay",
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
                "hp": {
                      "type": "number",
                      "description": "Parameter hp",
                      "required": true
                },
                "faction": {
                      "type": "any",
                      "description": "Parameter faction",
                      "required": false
                },
                "damageMultiplier": {
                      "type": "number",
                      "description": "Parameter damageMultiplier",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "hp"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "combat_add_hitbox",
    summary: "COMBAT: tag a sensor collider as a hitbox (head=2×, torso=1×, limb=0.5×).",
    category: "gameplay",
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
                "colliderHandle": {
                      "type": "any",
                      "description": "Parameter colliderHandle",
                      "required": true
                },
                "part": {
                      "type": "any",
                      "description": "Parameter part",
                      "required": true
                },
                "multiplier": {
                      "type": "number",
                      "description": "Parameter multiplier",
                      "required": false
                }
          },
          "requiredProperties": [
                "entityId",
                "colliderHandle",
                "part"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "combat_equip_weapon",
    summary: "COMBAT: equip a weapon spec (hitscan or projectile, damage, fire rate, spread).",
    category: "gameplay",
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
                "weapon": {
                      "type": "any",
                      "description": "Parameter weapon",
                      "required": true
                }
          },
          "requiredProperties": [
                "entityId",
                "weapon"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "combat_fire",
    summary: "COMBAT: fire the equipped weapon from a position towards a direction.",
    category: "gameplay",
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
                }
          },
          "requiredProperties": [
                "entityId",
                "originX",
                "originY",
                "originZ",
                "dirX",
                "dirY",
                "dirZ"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "combat_apply_damage",
    summary: "COMBAT: apply direct damage (bypasses the fire/hitbox pipeline).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "attackerId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter attackerId",
                      "required": false
                },
                "targetId": {
                      "type": [
                            "number",
                            "string",
                            "object"
                      ],
                      "description": "Parameter targetId",
                      "required": true
                },
                "amount": {
                      "type": "number",
                      "description": "Parameter amount",
                      "required": true
                },
                "damageType": {
                      "type": "any",
                      "description": "Parameter damageType",
                      "required": false
                }
          },
          "requiredProperties": [
                "targetId",
                "amount"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "combat_status",
    summary: "COMBAT: query health records + active projectiles.",
    category: "gameplay",
    sideEffect: "read",
    atomicSupport: "full",
    atomicBoundary: "Complete rollback supported via scene graph snapshot",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "gameplay_load",
    summary: "GAMEPLAY: load an ENTIRE game's logic as one declarative JSON object — variables, trigger zones, reactive rules (WHEN trigger IF conditions THEN actions), multi-step quests/objectives, and timers. Rule actions are AICommands, so gameplay reaches the whole engine. Writes runtime status to lastQueryResult. The 'make it a game' layer.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "def": {
                      "type": "object",
                      "description": "Parameter def",
                      "required": true
                }
          },
          "requiredProperties": [
                "def"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "gameplay_status",
    summary: "GAMEPLAY: read the full runtime (status playing/won/lost, variables, quests + per-objective progress, zones, timers) into lastQueryResult.",
    category: "gameplay",
    sideEffect: "read",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "gameplay_reset",
    summary: "GAMEPLAY: clear the loaded game definition.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "gameplay_set_var",
    summary: "GAMEPLAY: set a gameplay variable (fires var_changed rules).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
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
                "key",
                "value"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "gameplay_signal",
    summary: "GAMEPLAY: raise a custom signal (fires `signal` rules + echoes on the EventBus for scripts).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "name": {
                      "type": "string",
                      "description": "Parameter name",
                      "required": true
                },
                "data": {
                      "type": "any",
                      "description": "Parameter data",
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
    type: "gameplay_start_quest",
    summary: "GAMEPLAY: activate a quest.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "quest": {
                      "type": "string",
                      "description": "Parameter quest",
                      "required": true
                }
          },
          "requiredProperties": [
                "quest"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "gameplay_advance",
    summary: "GAMEPLAY: advance an objective progress counter (default +1); auto-completes the quest when all required objectives are done.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "quest": {
                      "type": "string",
                      "description": "Parameter quest",
                      "required": true
                },
                "objective": {
                      "type": "string",
                      "description": "Parameter objective",
                      "required": true
                },
                "by": {
                      "type": "any",
                      "description": "Parameter by",
                      "required": false
                }
          },
          "requiredProperties": [
                "quest",
                "objective"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "gameplay_complete_quest",
    summary: "GAMEPLAY: force-complete a quest (runs its rewards).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "quest": {
                      "type": "string",
                      "description": "Parameter quest",
                      "required": true
                }
          },
          "requiredProperties": [
                "quest"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "gameplay_fail_quest",
    summary: "GAMEPLAY: fail a quest.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "quest": {
                      "type": "string",
                      "description": "Parameter quest",
                      "required": true
                }
          },
          "requiredProperties": [
                "quest"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "gameplay_dialogue_start",
    summary: "GAMEPLAY: open a branching dialogue tree (from the loaded def's `dialogues`) — nodes show text + condition-gated choices that run actions (gift items, advance quests, set flags) and branch. Reuses the DialogueSystem UI; pauses the game. Emits dialogue_ended.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
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
    type: "gameplay_dialogue_choose",
    summary: "GAMEPLAY: pick a choice on the active dialogue node (the dialogue UI issues this; -1 = Continue).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "index": {
                      "type": "number",
                      "description": "Parameter index",
                      "required": true
                }
          },
          "requiredProperties": [
                "index"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "item_define",
    summary: "ITEMS: register an item type — name/icon/stackable/maxStack/tags + `onUse` AICommand effects (heal, explode, unlock…) + free-form data. Composes with gameplay (giveItem/hasItem/item_used).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "def": {
                      "type": "object",
                      "description": "Parameter def",
                      "required": true
                }
          },
          "requiredProperties": [
                "def"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inventory_give",
    summary: "ITEMS: add items to an owner's bag ('player' default). Writes {added} (capacity-limited) to lastQueryResult.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "item": {
                      "type": "string",
                      "description": "Parameter item",
                      "required": true
                },
                "count": {
                      "type": "number",
                      "description": "Parameter count",
                      "required": false
                },
                "owner": {
                      "type": "any",
                      "description": "Parameter owner",
                      "required": false
                }
          },
          "requiredProperties": [
                "item"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inventory_remove",
    summary: "ITEMS: remove items from an owner. Writes {removed} to lastQueryResult.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "item": {
                      "type": "string",
                      "description": "Parameter item",
                      "required": true
                },
                "count": {
                      "type": "number",
                      "description": "Parameter count",
                      "required": false
                },
                "owner": {
                      "type": "any",
                      "description": "Parameter owner",
                      "required": false
                }
          },
          "requiredProperties": [
                "item"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inventory_transfer",
    summary: "ITEMS: move items between two owners (e.g. loot 'chest_01' → 'player').",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
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
                "item": {
                      "type": "string",
                      "description": "Parameter item",
                      "required": true
                },
                "count": {
                      "type": "number",
                      "description": "Parameter count",
                      "required": false
                }
          },
          "requiredProperties": [
                "from",
                "to",
                "item"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inventory_use",
    summary: "ITEMS: use one unit (runs its onUse effects, consumes if consumable, fires item_used).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "item": {
                      "type": "string",
                      "description": "Parameter item",
                      "required": true
                },
                "owner": {
                      "type": "any",
                      "description": "Parameter owner",
                      "required": false
                }
          },
          "requiredProperties": [
                "item"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "inventory_list",
    summary: "ITEMS: read an owner's items (or every owner + item-def count when owner omitted) into lastQueryResult.",
    category: "gameplay",
    sideEffect: "read",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "owner": {
                      "type": "any",
                      "description": "Parameter owner",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "inventory_clear",
    summary: "ITEMS: empty an owner's inventory.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "destructive.clear",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "owner": {
                      "type": "any",
                      "description": "Parameter owner",
                      "required": false
                }
          },
          "additionalProperties": true
    },
  },
  {
    type: "interaction_register",
    summary: "INTERACT: mark an entity (by entityId/name/tag) interactable — prompt + radius + optional requireFacing + `commands` run on the interact key (KeyE). Raises `interacted` → gameplay `interact` triggers; commands can open a chest (inventory_transfer), talk (dialogue_show), pull a lever (gameplay_signal).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "def": {
                      "type": "object",
                      "description": "Parameter def",
                      "required": true
                }
          },
          "requiredProperties": [
                "def"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "interaction_unregister",
    summary: "INTERACT: remove an interactable.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
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
    type: "interaction_set_enabled",
    summary: "INTERACT: enable/disable an interactable at runtime.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Parameter id",
                      "required": true
                },
                "enabled": {
                      "type": "boolean",
                      "description": "Parameter enabled",
                      "required": true
                }
          },
          "requiredProperties": [
                "id",
                "enabled"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "interaction_trigger",
    summary: "INTERACT: programmatically activate an interactable (ignores range; respects once/cooldown).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
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
    type: "interaction_status",
    summary: "INTERACT: read registered interactables + the current prompt target into lastQueryResult.",
    category: "gameplay",
    sideEffect: "read",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {},
          "additionalProperties": true
    },
  },
  {
    type: "spawner_create",
    summary: "SPAWN: define a spawner — blueprint + area (point/sphere/box) + count/interval + maxAlive (concurrent cap) + total (lifetime cap) + tags + per-spawn `onSpawn` commands (\"$entity\" → new id, e.g. combat_add_health / add_nav_agent). GLB blueprints must be preloaded. WAVES = spawners chained by a gameplay rule on `spawner_cleared`.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "def": {
                      "type": "object",
                      "description": "Parameter def",
                      "required": true
                }
          },
          "requiredProperties": [
                "def"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "spawner_start",
    summary: "SPAWN: start (or restart a finished) spawner.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
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
    type: "spawner_stop",
    summary: "SPAWN: pause a spawner.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
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
    type: "spawner_remove",
    summary: "SPAWN: remove a spawner (already-spawned entities are left alone).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
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
    type: "spawner_clear",
    summary: "SPAWN: despawn every entity a spawner created (clear the arena).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "destructive.clear",
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
    type: "spawner_status",
    summary: "SPAWN: read spawner runtime (running/alive/spawnedTotal/exhausted) into lastQueryResult.",
    category: "gameplay",
    sideEffect: "read",
    atomicSupport: "partial",
    atomicBoundary: "Rollback supported within subsystem transaction boundary",
    capability: "gameplay.mutate",
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
    type: "save_game",
    summary: "SAVE: snapshot ALL progress (gameplay def+runtime, inventory bags, persistent flags, player position) into a named slot for resumable games. Distinct from save_scene (geometry to disk) / save_state_snapshot (kv only). Summary → lastQueryResult.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "slot": {
                      "type": "string",
                      "description": "Parameter slot",
                      "required": true
                }
          },
          "requiredProperties": [
                "slot"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "load_game",
    summary: "SAVE: restore a slot — rebuilds gameplay structure quietly (no start rules), then applies saved quests/variables/inventory + teleports the player.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "slot": {
                      "type": "string",
                      "description": "Parameter slot",
                      "required": true
                }
          },
          "requiredProperties": [
                "slot"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "list_saves",
    summary: "SAVE: list saved slots (slot/savedAt/hasGameplay/itemOwners/stateKeys/hasPlayer) into lastQueryResult.",
    category: "gameplay",
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
    type: "delete_save",
    summary: "SAVE: delete a saved slot.",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "slot": {
                      "type": "string",
                      "description": "Parameter slot",
                      "required": true
                }
          },
          "requiredProperties": [
                "slot"
          ],
          "additionalProperties": true
    },
  },
  {
    type: "kcc_get_state",
    summary: "Retrieve current KCC locomotion state machine status (idle, walk, run, air, slide, dash, crouch).",
    category: "gameplay",
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
    type: "input_action_state",
    summary: "Query evaluated state of an input action.",
    category: "gameplay",
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
    type: "director_set_phase",
    summary: "Direct AI gameplay pacing phase (relax, build_up, peak).",
    category: "gameplay",
    sideEffect: "runtime",
    atomicSupport: "none",
    atomicBoundary: "Irreversible external or runtime side effect",
    capability: "runtime.mutate",
    versionIntroduced: '1.0.0',
    parameters: {
          "type": "object",
          "properties": {
                "phase": {
                      "type": "any",
                      "description": "Parameter phase",
                      "required": true
                }
          },
          "requiredProperties": [
                "phase"
          ],
          "additionalProperties": true
    },
  },
];
