import type { AICommand } from '../ai/AIBridge';

/**
 * MIX Engine — Interaction schema.
 *
 * The grounding layer that ties items/quests/dialogue to the 3D world: an entity is
 * marked interactable; when the player stands near it (and optionally looks at it) a
 * prompt appears, and pressing the interact key runs the interactable's commands. Those
 * commands are {@link AICommand}s — so "open chest" is `inventory_transfer`, "talk" is
 * `dialogue_show`, "pull lever" is `gameplay_signal` — and the system also raises an
 * `interacted` event the gameplay director turns into an `interact` trigger.
 *
 * THREE-free on purpose (plain-math distance/facing) so it unit-tests standalone.
 */

/** Minimal entity snapshot the interaction system needs (world position + identity). */
export interface IxEntity {
  id: number;
  name?: string;
  kind?: string;
  tags: string[];
  x: number;
  y: number;
  z: number;
}

/** The player's WORLD pose: position + a (normalized) forward direction for facing tests. */
export interface PlayerPose {
  x: number; y: number; z: number;
  fx: number; fy: number; fz: number;
}

/** A registered interactable. Its "hot spot" is an entity, selected by id, name or tag. */
export interface InteractableDef {
  id: string;
  /** Target a specific entity by id … */
  entityId?: number;
  /** … or the nearest entity with this name … */
  name?: string;
  /** … or the nearest entity with this tag. */
  tag?: string;
  /** Prompt text shown when in range (default "Interact"). */
  prompt?: string;
  /** Activation radius in metres (default 3). */
  radius?: number;
  /** Require the player to be roughly facing the target. */
  requireFacing?: boolean;
  /** Min dot(playerForward, dirToTarget) when requireFacing (default 0.35 ≈ 70° cone). */
  facingDot?: number;
  /** Fire at most once, then auto-disable. */
  once?: boolean;
  /** Minimum seconds between activations. */
  cooldown?: number;
  /** Commands run on activation. */
  commands?: AICommand[];
  /** Start disabled. */
  disabled?: boolean;
}

export interface InteractionHost {
  /** Run an engine command (the interactable's `commands`). */
  execute(cmd: AICommand): void;
  /** Raise a bus event (`interacted`, prompt changes) for the gameplay director + scripts. */
  emit(event: string, data?: unknown): void;
  /** Every physics entity's world pose + identity (to resolve interactable targets). */
  listEntities(): IxEntity[];
  /** Player pose, or null when nobody is possessed / in editor mode (no interaction then). */
  getPlayerPose(): PlayerPose | null;
  /** True on the frame the interact key transitioned down (edge-triggered). */
  isInteractPressed(): boolean;
  /** Show/hide the on-screen interaction prompt (null hides it). */
  showPrompt(text: string | null, entityId?: number): void;
}

export interface InteractionCurrent {
  id: string;
  entityId?: number;
  prompt: string;
  distance: number;
}

export interface InteractionStatus {
  count: number;
  current: InteractionCurrent | null;
  interactables: Array<{ id: string; enabled: boolean; prompt: string; target: string }>;
}
