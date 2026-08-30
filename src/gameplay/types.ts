import type { AICommand } from '../ai/AIBridge';

/**
 * MIX Engine — Gameplay Logic schema.
 *
 * The engine's world-simulation layers (rendering, physics, nav, terrain, combat)
 * describe a *world*. This layer describes a *game*: the rules, goals and progression
 * that turn that world into something with win/lose stakes. It is fully declarative —
 * an LLM authors an entire game's logic as ONE JSON object — and every effect an
 * action can produce is just an {@link AICommand}, so it inherits the whole engine
 * command surface (spawn, VFX, audio, dialogue, HUD, camera, …) for free.
 *
 * The shape is a reactive rules engine:  WHEN a {@link GpTrigger} fires, IF every
 * {@link GpCondition} holds, THEN run the {@link GpAction}s in order. Quests, zones
 * and timers are sugar on top of that core, modelled as first-class data so an agent
 * can introspect progress (via `gameplay_status`) instead of parsing imperative code.
 */

/** A value a gameplay variable can hold. */
export type GpValue = number | string | boolean;

/** Comparison operators used by conditions. */
export type GpCompare = '==' | '!=' | '>' | '>=' | '<' | '<=';

// ─────────────────────────────────────────────────────────────────────────────
// Triggers — what causes a rule to be evaluated.
// ─────────────────────────────────────────────────────────────────────────────

export type GpTrigger =
  /** Fires once when the definition is loaded (set up initial state / spawn the level). */
  | { event: 'start' }
  /** A watched entity entered / left a {@link GpZone}. Payload: { zone, entity }. */
  | { event: 'zone_enter'; zone: string }
  | { event: 'zone_exit'; zone: string }
  /** A custom signal raised by `gameplay_signal`, the `signal` action, or an `emit_event`
   *  AICommand with a matching name. Payload is whatever the emitter passed. */
  | { event: 'signal'; name: string }
  /** Two physics bodies touched. Optionally constrain by the tags on each side
   *  (order-insensitive: if only `tag` is given, fires when EITHER body has it). */
  | { event: 'collision'; tag?: string; otherTag?: string }
  /** An entity was destroyed. Match by the tag/name/kind it had at destruction. */
  | { event: 'destroyed'; tag?: string; name?: string; kind?: string }
  /** A gameplay variable changed value. Payload: { var, value, previous }. */
  | { event: 'var_changed'; var: string }
  /** Quest / objective lifecycle. */
  | { event: 'quest_started'; quest: string }
  | { event: 'quest_completed'; quest: string }
  | { event: 'quest_failed'; quest: string }
  | { event: 'objective_completed'; quest: string; objective: string }
  /** A {@link GpTimer} elapsed (fires every interval while running). */
  | { event: 'timer'; timer: string }
  /** Inventory changed (from the Items system). Optionally constrain by item/owner. */
  | { event: 'item_acquired'; item?: string; owner?: string }
  | { event: 'item_removed'; item?: string; owner?: string }
  | { event: 'item_used'; item?: string; owner?: string }
  /** The player activated a world interactable (from the InteractionSystem). */
  | { event: 'interact'; id?: string }
  /** A spawner created an entity (from the SpawnerSystem). */
  | { event: 'spawned'; spawner?: string }
  /** A spawner finished and all its entities are gone (wave cleared). */
  | { event: 'spawner_cleared'; spawner?: string }
  /** A dialogue tree finished (player closed it / reached a leaf). */
  | { event: 'dialogue_ended'; dialogue?: string }
  /** The game was won / lost. */
  | { event: 'won' }
  | { event: 'lost' };

export type GpTriggerEvent = GpTrigger['event'];

// ─────────────────────────────────────────────────────────────────────────────
// Conditions — guards evaluated when a trigger fires. ALL must hold.
// ─────────────────────────────────────────────────────────────────────────────

export type GpCondition =
  /** Compare a variable against a literal. `op` defaults to '=='. */
  | { var: string; op?: GpCompare; value: GpValue }
  /** At least one entity matches the selector. */
  | { entityExists: { tag?: string; name?: string; kind?: string } }
  /** The count of matching entities satisfies `op value`. */
  | { entityCount: { tag?: string; kind?: string }; op: GpCompare; value: number }
  /** A quest is in a given lifecycle state. */
  | { quest: string; is: 'inactive' | 'active' | 'completed' | 'failed' }
  /** An objective is (in)complete. */
  | { objective: { quest: string; objective: string }; is: 'incomplete' | 'completed' }
  /** Random gate — passes with probability `chance` (0..1). */
  | { chance: number }
  /** An owner holds at least `count` (default 1) of an item ('player' by default). */
  | { hasItem: string; count?: number; owner?: string }
  /** Logical negation of a nested condition. */
  | { not: GpCondition }
  /** The overall game status. */
  | { status: 'playing' | 'won' | 'lost' };

// ─────────────────────────────────────────────────────────────────────────────
// Actions — effects run when a rule fires, in order.
// ─────────────────────────────────────────────────────────────────────────────

export type GpAction =
  /** Run any engine command (the bridge between gameplay logic and the whole engine). */
  | { command: AICommand }
  | { commands: AICommand[] }
  /** Set / increment a gameplay variable (fires `var_changed`). */
  | { setVar: string; value: GpValue }
  | { addVar: string; by: number }
  /** Raise a custom signal (drives `signal` triggers AND the global EventBus, so
   *  scripts/other systems listening via `api.events.on(name)` also receive it). */
  | { signal: string; data?: unknown }
  /** Quest control. */
  | { startQuest: string }
  | { completeQuest: string }
  | { failQuest: string }
  /** Advance an objective's progress counter by `by` (default 1). */
  | { advance: { quest: string; objective: string; by?: number } }
  /** Inventory mutations (route to the Items system). */
  | { giveItem: string; count?: number; owner?: string }
  | { removeItem: string; count?: number; owner?: string }
  | { useItem: string; owner?: string }
  /** Open a branching dialogue tree (by id). */
  | { startDialogue: string }
  /** Timer control. */
  | { startTimer: string }
  | { stopTimer: string }
  /** Toggle other rules / zones at runtime (state machines, phases). */
  | { enableRule: string }
  | { disableRule: string }
  | { enableZone: string }
  | { disableZone: string }
  /** End the game. */
  | { win: { message?: string } }
  | { lose: { message?: string } }
  /** Console log (debugging an authored game). */
  | { log: string };

// ─────────────────────────────────────────────────────────────────────────────
// Zones — declarative spatial trigger volumes (distinct from the audio-only
// `add_trigger_zone`). Watched entities entering/leaving fire zone_enter/zone_exit.
// ─────────────────────────────────────────────────────────────────────────────

export interface GpZone {
  id: string;
  /** WORLD-space centre. */
  center: [number, number, number];
  /** Sphere volume. */
  shape?: 'sphere' | 'box';
  /** Sphere radius (shape 'sphere'). */
  radius?: number;
  /** Box half-extents or full size (shape 'box'); interpreted as full size. */
  size?: [number, number, number];
  /** Who is tracked: 'player' (default), 'any', or a selector 'tag:foo' / 'name:foo' /
   *  'kind:foo'. */
  watch?: string;
  /** Fire zone_enter at most once (latching trigger), then stop tracking. */
  once?: boolean;
  /** Start disabled (enable later with the `enableZone` action). */
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules — the reactive core. WHEN `on` fires, IF every `if` holds, THEN run `do`.
// ─────────────────────────────────────────────────────────────────────────────

export interface GpRule {
  /** Stable id (so other rules can enable/disable it). Auto-assigned if omitted. */
  id?: string;
  on: GpTrigger;
  /** Optional guard conditions (ALL must pass). */
  if?: GpCondition[];
  do: GpAction[];
  /** Fire at most once for the whole game. */
  once?: boolean;
  /** Minimum seconds between fires. */
  cooldown?: number;
  /** Start disabled (enable later with the `enableRule` action). */
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quests / objectives — multi-step goals with progress tracking.
// ─────────────────────────────────────────────────────────────────────────────

export interface GpObjective {
  id: string;
  description: string;
  /** Target progress count (default 1). The objective completes when progress ≥ count. */
  count?: number;
  /** Optional objectives don't gate quest completion. */
  optional?: boolean;
}

export interface GpQuest {
  id: string;
  title: string;
  description?: string;
  /** Activate automatically when the definition loads. */
  autoStart?: boolean;
  objectives: GpObjective[];
  /** Actions run when the quest completes (rewards, next-quest, unlocks). */
  rewards?: GpAction[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Timers — repeating or one-shot clocks that fire `timer` triggers.
// ─────────────────────────────────────────────────────────────────────────────

export interface GpTimer {
  id: string;
  /** Seconds between fires. */
  interval: number;
  /** Re-arm after firing (default false = one-shot). */
  repeat?: boolean;
  /** Start running on load. */
  autoStart?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialogue trees — branching NPC conversations. Each node shows text + choices;
// choices are gated by conditions and run actions, then branch to another node.
// Reuses the engine's DialogueSystem UI (presented via the `dialogue_show` command)
// and the same condition/action vocabulary as rules, so a conversation can check
// `hasItem`, gift items, set flags, advance quests, etc.
// ─────────────────────────────────────────────────────────────────────────────

export interface GpDialogueChoice {
  text: string;
  /** Choice is hidden unless every condition holds. */
  if?: GpCondition[];
  /** Actions run when the choice is picked. */
  do?: GpAction[];
  /** Next node id; omit to end the conversation. */
  next?: string;
}

export interface GpDialogueNode {
  id: string;
  speaker?: string;
  text: string;
  /** Actions run when this node is shown (e.g. give a reward on reaching it). */
  actions?: GpAction[];
  /** Branching choices; when none are available the node shows a single "Continue". */
  choices?: GpDialogueChoice[];
  /** Linear continue target (used by the synthesized "Continue" when there are no choices). */
  next?: string;
}

export interface GpDialogueTree {
  id: string;
  /** Start node id. */
  start: string;
  nodes: GpDialogueNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// The complete game definition.
// ─────────────────────────────────────────────────────────────────────────────

export interface GameplayDef {
  /** Optional human label for the authored game. */
  name?: string;
  /** Initial variable values. */
  variables?: Record<string, GpValue>;
  zones?: GpZone[];
  rules?: GpRule[];
  quests?: GpQuest[];
  timers?: GpTimer[];
  dialogues?: GpDialogueTree[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime introspection (returned by gameplay_status — what an agent reads back).
// ─────────────────────────────────────────────────────────────────────────────

export type GpGameStatus = 'playing' | 'won' | 'lost';

export interface GpObjectiveStatus {
  id: string;
  description: string;
  progress: number;
  count: number;
  completed: boolean;
  optional: boolean;
}

export interface GpQuestStatus {
  id: string;
  title: string;
  description?: string;
  state: 'inactive' | 'active' | 'completed' | 'failed';
  objectives: GpObjectiveStatus[];
}

export interface GpZoneStatus {
  id: string;
  enabled: boolean;
  occupants: number;
}

export interface GpTimerStatus {
  id: string;
  running: boolean;
  remaining: number;
}

export interface GameplayStatus {
  loaded: boolean;
  name?: string;
  status: GpGameStatus;
  message?: string;
  elapsed: number;
  variables: Record<string, GpValue>;
  quests: GpQuestStatus[];
  zones: GpZoneStatus[];
  timers: GpTimerStatus[];
  ruleCount: number;
  /** The conversation currently open (if any). */
  activeDialogue: { id: string; node: string } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Host — the minimal surface the director needs from the engine (kept small so the
// director is unit-testable without a full Engine, like BehaviorTree/Steering).
// ─────────────────────────────────────────────────────────────────────────────

export interface GpEntitySnapshot {
  id: number;
  name?: string;
  kind?: string;
  tags: string[];
  /** WORLD-space position. */
  x: number;
  y: number;
  z: number;
}

export interface GameplayHost {
  /** Queue an engine command (the action→engine bridge). */
  execute(cmd: AICommand): void;
  /** Subscribe to the global EventBus. Returns an unsubscribe fn. */
  on(event: string, cb: (data: unknown) => void): () => void;
  /** Raise an event on the global EventBus (so scripts/other systems hear signals). */
  emit(event: string, data?: unknown): void;
  /** Snapshot of every physics entity (for zone occupancy + entity conditions). */
  listEntities(): GpEntitySnapshot[];
  /** The possessed player's WORLD position, or null if none. */
  getPlayerPosition(): { x: number; y: number; z: number } | null;
  /** How many of an item an owner holds (for `hasItem` conditions). Optional — wired
   *  to the InventorySystem; returns 0 if the items layer isn't present. */
  itemCount?(owner: string, item: string): number;
  /** Persist the director's serialized runtime (optional — wired to PersistentGameState). */
  persist?(serialized: string): void;
  /** Injectable RNG for deterministic `chance` conditions in tests (default Math.random). */
  random?(): number;
}
