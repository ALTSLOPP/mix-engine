import type { AICommand } from '../ai/AIBridge';
import type { HelmEntityRef } from './EntityRefs';

/** Runtime JSON can use stable semantic refs in fields that are numeric EntityIds in AICommand. */
export type HelmCommandInput = AICommand | (Record<string, unknown> & { type: string });

/**
 * HELM — the engine's control plane for IDE coding agents (Claude Code, Codex,
 * OpenCode, Copilot …).
 *
 * The MIX Engine's defining strength is being *driven by an agent*. The original
 * bridge was fire-and-forget: an agent POSTed a command over the WS bridge and got
 * nothing back — no ack, no created id, no error — and had to poll a separate cache
 * to read state. HELM turns that one-way pipe into a real request/response control
 * plane: every request returns a structured result (what was created/removed, what
 * went wrong), and the agent can introspect ("describe the scene"), probe ("what's
 * under the crosshair"), checkpoint/rollback, assert scene-state expectations, and
 * discover the whole API via a self-describing manifest.
 *
 * HELM is the single greppable handle for this system. It is separate from SENSORIUM
 * (which is the vision/feel *testing* layer); HELM is the *authoring/control* layer.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Request — what an agent sends (over /api/helm/rpc, then the WS bridge).
// ─────────────────────────────────────────────────────────────────────────────

export type HelmOp =
  | 'do'          // execute a batch of AICommands, report results
  | 'plan'        // validate and explain a batch without mutating the engine
  | 'apply'       // serialized, retry-safe, optionally atomic verified batch
  | 'resolve'     // turn @name/guid:/tag:/id: selectors into a current entity
  | 'describe'    // token-efficient summary of the whole scene
  | 'observe'     // RENDER-grounded visual check: is the frame healthy + each entity actually on screen?
  | 'query'       // filtered structured list of entities
  | 'get'         // full info on one entity
  | 'raycast'     // what entity is under a screen point / the crosshair
  | 'checkpoint'  // save a named in-memory scene snapshot
  | 'restore'     // restore a named snapshot
  | 'checkpoints' // list snapshot names
  | 'assert'      // evaluate scene-state expectations (agent edit-loop validation)
  | 'manifest'    // return the capability manifest
  | 'status'      // engine health / liveness
  | 'find_path'   // A* path between two world points (NavigationSystem)
  | 'nav_status'; // navmesh build state + agent list (NavigationSystem)

export interface HelmRequest {
  /** Correlation id (the dev server uses it to match the async result). */
  id: string;
  op: HelmOp;
  /** op:'do' — the commands to run (single or array). */
  commands?: HelmCommandInput | HelmCommandInput[];
  /** op:'do' — ms to wait for async spawns/loads to settle after the queue drains. */
  settleMs?: number;
  /** op:'query'|'observe' — filter (observe defaults to all physics entities). */
  filter?: { kind?: string; tag?: string; name?: string };
  /** op:'get' — entity id. */
  entityId?: number;
  /** op:'raycast' — normalized screen point in [0,1]; defaults to crosshair (0.5,0.5). */
  screen?: { x: number; y: number };
  /** op:'checkpoint'|'restore' — snapshot name. */
  name?: string;
  /** op:'assert' — expectations to evaluate. */
  expects?: HelmExpectation[];
  /** op:'plan'|'apply' — require the batch to be reversible by a scene snapshot. Defaults true for apply. */
  atomic?: boolean;
  /** op:'apply' — validate and return the plan without executing anything. */
  dryRun?: boolean;
  /** op:'apply' — stable IDE retry key. Reusing it with the same payload returns the original result. */
  requestKey?: string;
  /** op:'resolve' — stable entity selector (@name, guid:..., tag:..., id:..., or object form). */
  ref?: HelmEntityRef;
  /** op:'find_path' — world-space start + end. */
  from?: [number, number, number];
  to?: [number, number, number];
  /** op:'find_path' — smoothing toggle (default true). */
  smooth?: boolean;
  /** op:'find_path' — goal tolerance radius (metres). */
  goalTolerance?: number;
  /** Role-based access control roles (e.g. ['level_designer'], ['viewer'], ['admin']). */
  roles?: string[];
  /** Explicit capability tokens (e.g. ['scene.write']). */
  capabilities?: string[];
  /** Calling agent ID for multi-agent edit lease validation. */
  agentId?: string;
  /** Edit lease token if holding an active lease. */
  leaseId?: string;
  /** Dev-server injected authentication context. Incoming HTTP JSON is overwritten
   *  before forwarding; callers must never construct this field themselves. */
  _trustedAuth?: { rolesOrCapabilities: string[]; agentId: string; leaseId?: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene-state expectations — the agent validates its own edits.
// (Distinct from SENSORIUM's gameplay assertions, which judge a recorded run.)
// ─────────────────────────────────────────────────────────────────────────────

export type HelmExpectation =
  | { kind: 'entity_exists'; name?: string; tag?: string; entityKind?: string }
  | { kind: 'entity_count'; op: 'eq' | 'gte' | 'lte'; value: number; entityKind?: string; tag?: string }
  | { kind: 'entity_near'; name: string; position: [number, number, number]; radius: number }
  | { kind: 'no_errors' }
  // RENDER-grounded (uses op:'observe' diagnostics): is the entity actually drawn on screen?
  | { kind: 'entity_visible'; name?: string; tag?: string; entityKind?: string; minCoveragePct?: number }
  // RENDER-grounded: the frame is neither black nor blown out (lighting/exposure sane).
  | { kind: 'frame_renders' };

export interface HelmExpectationResult {
  expectation: HelmExpectation;
  passed: boolean;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response — what the agent gets back.
// ─────────────────────────────────────────────────────────────────────────────

export interface HelmEntityInfo {
  id: number;
  /** Stable identity that survives reloads and rollback restores. */
  guid?: string;
  kind?: string;
  name?: string;
  tags?: string[];
  /** WORLD-space position. */
  position: { x: number; y: number; z: number };
  /** WORLD-space axis-aligned size (bounding box), when meaningful. */
  size?: { x: number; y: number; z: number };
  bodyType?: string;
}

export interface HelmResponse {
  id: string;
  op: HelmOp;
  ok: boolean;
  /** Top-level failure reason (transport / unknown op / fatal). */
  error?: string;
  /** Non-fatal warnings surfaced during execution (e.g. an entity wasn't found). */
  warnings?: string[];
  /** Console errors captured while the batch ran. */
  errors?: string[];
  /** op:'do' — entities created by this batch. */
  created?: HelmEntityInfo[];
  /** op:'do' — entity ids removed by this batch. */
  removed?: number[];
  /** Structured payload (query list, entity info, raycast hit, manifest, …). */
  data?: unknown;
  /** Human-readable rendering for the agent to reason over (describe/assert/status). */
  text?: string;
  /** op:'assert' — per-expectation results; `ok` is true iff all passed. */
  expectations?: HelmExpectationResult[];
  /** op:'do'|'apply' — detailed per-command execution result in dependency order. */
  commandResults?: import('../commands/BatchPlanner').PerCommandResult[];
  /** op:'do'|'apply' — output bindings captured during batch dataflow. */
  bindings?: Record<string, unknown>;
  /** op:'apply' — true when a failed batch/postcondition was automatically restored. */
  rolledBack?: boolean;
  /** op:'apply' — true when an idempotency key returned a cached result. */
  replayed?: boolean;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability manifest — lets an agent / MCP self-discover the API.
// ─────────────────────────────────────────────────────────────────────────────

export interface HelmManifestArg {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface HelmManifestOp {
  op: HelmOp;
  summary: string;
  args: HelmManifestArg[];
}

export interface HelmCommandDoc {
  type: string;
  summary: string;
  params: string[];
}

export interface HelmManifest {
  name: 'HELM';
  version: string;
  description: string;
  ops: HelmManifestOp[];
  /** Every AICommand `type` accepted by op:'do', with its parameter names. */
  commands: HelmCommandDoc[];
}
