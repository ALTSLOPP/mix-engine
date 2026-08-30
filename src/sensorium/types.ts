/**
 * SENSORIUM — the AI's perception layer for the MIX Engine.
 *
 * A "sensorium" is the seat of an organism's perception: the place where it senses
 * its world and forms a felt judgment about it. That is exactly what this system is
 * for an AI agent. SENSORIUM lets a vision-capable model (Claude, GPT-4V, Gemini …)
 * actually *experience* a playthrough of the game:
 *
 *   1. The IDE asks for a SCENARIO ("test the driving mechanics").
 *   2. SENSORIUM drives the real PlayerController via synthetic input, recording
 *      video + per-frame telemetry.
 *   3. A FeelAnalyzer turns the telemetry into a FeelProfile — quantified
 *      kinesthetics (responsiveness, snappiness, floatiness, stability, camera
 *      smoothness …) so the AI can *feel* how the game plays, not just see it.
 *   4. A VisionReportBuilder assembles a model-agnostic analysis request (video +
 *      a captioned contact-sheet of keyframes + the FeelProfile + anomalies) so the
 *      model can correlate what it SEES with what the engine FELT.
 *   5. Optionally the run is diffed against a saved BASELINE so the IDE can catch
 *      regressions ("steering response is 40 ms slower than last build").
 *
 * SENSORIUM is the single greppable handle for the whole system — grep `SENSORIUM`
 * to find every file, command, endpoint and UI label that participates. The legacy
 * `PLAYBACK` name is kept as a deprecated alias so older scripts keep working.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TestScript — what the IDE sends. A complete test plan: optional scene setup, a
// timeline of input actions, optional assertions (as `assert` actions), and
// recording settings.
// ─────────────────────────────────────────────────────────────────────────────

export type TestAction =
  | { at: number; type: 'wait'; duration: number; label?: string }
  | { at: number; type: 'possess'; entityId?: number; entityName?: string; label?: string }
  | { at: number; type: 'unpossess'; label?: string }
  | { at: number; type: 'setMode'; mode: 'play' | 'editor'; label?: string }
  | {
      at: number;
      type: 'move';
      /** World-space direction. Each component ∈ [-1, 1]; runner normalises. */
      direction: [number, number];
      /** Seconds the keys stay held. Defaults to 0.5. */
      duration: number;
      label?: string;
    }
  | { at: number; type: 'jump'; label?: string }
  | { at: number; type: 'attack'; label?: string }
  | {
      at: number;
      type: 'press';
      down: string[];
      up?: string[];
      /** Hold the down-set for this many seconds before auto-releasing (0 = until manually released). */
      duration?: number;
      label?: string;
    }
  | { at: number; type: 'release'; keys: string[]; label?: string }
  | { at: number; type: 'lookAt'; target: [number, number, number]; label?: string }
  | {
      at: number;
      type: 'setCamera';
      position: [number, number, number];
      lookAt?: [number, number, number];
      fov?: number;
      label?: string;
    }
  | { at: number; type: 'cinematic'; sequence: any; label?: string }
  | { at: number; type: 'spawnVfx'; preset: string; x: number; y: number; z: number; duration?: number; loop?: boolean; label?: string }
  | { at: number; type: 'assert'; name: string; predicate: AssertionPredicate; label?: string }
  | { at: number; type: 'log'; message: string; level?: 'info' | 'warn' | 'error'; label?: string }
  // SENSORIUM additions ──────────────────────────────────────────────────────
  /** Drop a named marker into the telemetry so the FeelAnalyzer and the vision
   *  model can anchor a phase of the test (e.g. "corner-entry", "braking"). */
  | { at: number; type: 'marker'; name: string; intent?: FeelIntent; label?: string }
  /** Tell the FeelAnalyzer which kinesthetic "intent" the upcoming inputs express,
   *  so latency/feel is measured against the right expectation window. */
  | { at: number; type: 'intent'; intent: FeelIntent; label?: string };

/**
 * The kinesthetic intent behind a stretch of input. The FeelAnalyzer uses this to
 * decide what "good feel" means for the window: a `throttle` window is judged on
 * acceleration onset, a `brake` window on deceleration, a `turn` window on heading
 * response, etc.
 */
export type FeelIntent =
  | 'throttle'
  | 'brake'
  | 'turn'
  | 'strafe'
  | 'jump'
  | 'look'
  | 'idle';

/**
 * A small, JSON-serialisable assertion vocabulary. The runner evaluates each at its
 * scheduled time and records the result. Keep this set tight and high-signal — the
 * vision model gives the qualitative read; assertions are the hard pass/fail gates.
 */
export type AssertionPredicate =
  | { kind: 'position_gt'; entityRef: EntityRef; axis: 'x' | 'y' | 'z'; value: number }
  | { kind: 'position_lt'; entityRef: EntityRef; axis: 'x' | 'y' | 'z'; value: number }
  | { kind: 'distance_lt'; entityRef: EntityRef; target: [number, number, number]; value: number }
  | { kind: 'velocity_gt'; entityRef: EntityRef; magnitude: number }
  | { kind: 'velocity_lt'; entityRef: EntityRef; magnitude: number }
  | { kind: 'fps_gt'; value: number; during?: [number, number] }
  | { kind: 'collision_count_gte'; value: number; tag?: string }
  // SENSORIUM additions: assert on the felt experience, not just raw state.
  | { kind: 'feel_score_gte'; metric: FeelMetricKey | 'overall'; value: number }
  | { kind: 'responsiveness_lt_ms'; value: number }
  | { kind: 'no_anomaly'; anomaly: PlaybackAnomaly['kind'] };

export type EntityRef =
  | { entityId: number }
  | { entityName: string }
  | { possessed: true }      // refers to whatever the test is currently possessing
  | { camera: true };

/** Commands the runner can execute as part of scene setup/teardown. */
export type SetupCommand =
  | { type: 'aiCommand'; command: any; label?: string }
  | { type: 'setTimeOfDay'; hour: number }
  | { type: 'setWeather'; fogDensity?: number; fogColor?: string; ambient?: number }
  | { type: 'setPostFx'; bloomStrength?: number; bloomThreshold?: number; bloomRadius?: number; exposure?: number };

export interface RecordSettings {
  /** Capture framerate (hint to MediaRecorder / canvas.captureStream). */
  fps?: number;
  /** Save a PNG keyframe every N seconds. Default 0.5. */
  extractKeyframesEvery?: number;
  /** Override the auto-generated recording name. */
  name?: string;
  /** Stop the recording after this many seconds even if no action finishes the script. */
  maxDuration?: number;
  /** Optional free-text note surfaced in the report. */
  note?: string;
  /** Build a captioned montage of keyframes for image-only vision models. Default true. */
  contactSheet?: boolean;
  /** Max number of cells in the contact sheet (keyframes are sub-sampled to fit). Default 12. */
  contactSheetCells?: number;
  /** Capture video at all. When false only telemetry + keyframes are produced (faster, smaller). Default true. */
  video?: boolean;
  /** Keep the engine in play mode possessing the test target after the run finishes.
   *  Default false — SENSORIUM restores editor mode + unpossesses for a clean handoff. */
  keepPlayState?: boolean;
}

export interface TestScript {
  /** Required: human-readable name (becomes the artifact folder + report name). */
  name: string;
  /** Optional scene setup executed before the action timeline. */
  setup?: SetupCommand[];
  /** Optional cleanup executed after the timeline completes. */
  teardown?: SetupCommand[];
  /** The timeline. Sorted by `at`; the runner fires each when its time arrives. */
  actions: TestAction[];
  /** Recording settings. */
  record?: RecordSettings;
  /** Optional human description of what is being tested — surfaced in the vision prompt. */
  description?: string;
  /** Free-form context to append to the vision prompt (game name, what to look for, etc.). */
  visionContext?: string;
  /** Which scenario profile generated/authored this script (drives feel-metric weighting). */
  profile?: ScenarioProfile;
  /** Compare the resulting FeelProfile against a previously-saved baseline of this name. */
  baseline?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario profiles — high-level "what kind of test is this?" Used by the
// ScenarioLibrary to synthesise a sensible default timeline and to tell the
// FeelAnalyzer which metrics matter most for the verdict.
// ─────────────────────────────────────────────────────────────────────────────

export type ScenarioProfile =
  | 'locomotion'  // walk/run/strafe responsiveness & ground contact
  | 'driving'     // throttle, cornering, braking, slip
  | 'jump'        // air time, landing, gravity feel
  | 'combat'      // attack cadence, hit feedback, camera during action
  | 'camera'      // framing, smoothness, clipping while orbiting
  | 'stress'      // perf under dense input / many entities
  | 'free';       // caller fully authored the timeline

export interface ScenarioOptions {
  /** Entity to drive. If omitted, the runner auto-targets the first character. */
  entityName?: string;
  entityId?: number;
  /** Total wall-clock budget for the generated timeline (seconds). */
  duration?: number;
  /** Free-text describing the game so the vision prompt is grounded. */
  game?: string;
  /** Extra recording overrides merged onto the profile defaults. */
  record?: RecordSettings;
  /** Compare against this baseline name after the run. */
  baseline?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FeelProfile — the quantified "feel" of the playthrough. The headline of
// SENSORIUM: the AI doesn't only watch, it FEELS, via these proxies derived from
// per-frame physics telemetry. Every metric carries both a raw value (with units)
// and a normalised 0–100 score so it can be charted, asserted on, and diffed
// against a baseline.
// ─────────────────────────────────────────────────────────────────────────────

export type FeelMetricKey =
  | 'responsiveness' // input → first visible motion (lower latency = higher score)
  | 'snappiness'     // peak acceleration onset after an input
  | 'floatiness'     // how long momentum lingers after input release (higher = floatier)
  | 'stability'      // freedom from unwanted jitter / oscillation
  | 'cameraSmooth'   // absence of disorienting camera angular jerk
  | 'framePacing'    // steadiness of frame delivery (stutter-free)
  | 'weight'         // sense of mass — ramp-up + momentum balance
  | 'grip';          // (driving) how well velocity tracks facing through turns

export interface FeelMetric {
  key: FeelMetricKey;
  label: string;
  /** Raw measured value in `unit`. */
  raw: number;
  unit: string;
  /** 0 (bad) .. 100 (great). */
  score: number;
  /** One-line human note explaining the number. */
  note: string;
  /** How many telemetry samples / events backed this metric (confidence). */
  samples: number;
}

export interface FeelProfile {
  /** Composite 0–100 across the metrics that matter for the profile. */
  overall: number;
  /** Qualitative band derived from `overall`. */
  band: 'great' | 'good' | 'okay' | 'rough' | 'broken';
  metrics: FeelMetric[];
  /** Mean input→motion latency in ms (the single most important feel number). */
  responsivenessMs: number;
  /** Top speed reached by the possessed body (m/s). */
  topSpeed: number;
  /** Peak acceleration magnitude observed (m/s²). */
  peakAccel: number;
  /** 1–2 sentence plain-language read on how the game felt. */
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vision analysis request — a model-agnostic package the IDE hands to whatever
// vision model it uses. Strictly richer than a bare prompt string.
// ─────────────────────────────────────────────────────────────────────────────

export interface VisionFrameRef {
  t: number;
  path: string;
  /** Optional caption (phase marker, anomaly tag) shown to the model. */
  caption?: string;
}

export interface VisionAnalysisRequest {
  /** System role / persona for the model. */
  system: string;
  /** The concrete instructions + measured context (the old `visionPrompt`). */
  instructions: string;
  /** Public-URL path to the recorded video, if any. */
  video?: string;
  /** Captioned keyframes, oldest → newest. */
  frames: VisionFrameRef[];
  /** Public-URL path to a single captioned montage image (for image-only models). */
  contactSheet?: string;
  /** The structured rubric the model should fill in. */
  rubric: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline diffing — regression tracking across builds.
// ─────────────────────────────────────────────────────────────────────────────

export interface BaselineMetricDiff {
  key: FeelMetricKey | 'overall' | 'responsivenessMs';
  label: string;
  baseline: number;
  current: number;
  delta: number;
  /** True when the change is a meaningful regression (worse beyond the tolerance). */
  regressed: boolean;
  /** True when the change is a meaningful improvement. */
  improved: boolean;
}

export interface BaselineDiff {
  name: string;
  savedAt: string;
  diffs: BaselineMetricDiff[];
  /** True if any metric regressed beyond tolerance. */
  anyRegression: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report — what the engine hands back to the IDE.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlaybackArtifacts {
  /** Public-URL path to the recorded WebM. */
  video: string;
  /** Public-URL path to the per-frame telemetry JSONL. */
  telemetry: string;
  /** Public-URL paths to the extracted keyframe PNGs. */
  keyframes: KeyframeArtifact[];
  /** Public-URL path to the report JSON (also POSTed back via /api/sensorium/report). */
  report: string;
  /** Public-URL path to the captioned contact-sheet montage, if built. */
  contactSheet?: string;
}

export interface KeyframeArtifact {
  t: number;
  path: string;
  note?: string;
}

export interface PlaybackFpsMetrics {
  avg: number;
  min: number;
  max: number;
  /** P99 (1% worst frames). */
  p99: number;
  /** P1 (1% best frames) — useful symmetric counterpart. */
  p1: number;
  /** Longest contiguous period where fps < threshold. */
  longStutterMs: number;
  /** Count of distinct stutter events (fps dipped below threshold). */
  stutterEvents: number;
}

export interface PlaybackAnomaly {
  kind:
    | 'stuck'
    | 'fall_through'
    | 'physics_impulse'
    | 'animation_stuck'
    | 'low_fps'
    | 'out_of_frustum'
    | 'input_no_response'
    | 'teleport_jump'
    | 'oscillation'
    | 'never_moved'
    | 'console_error';
  t: number;
  duration?: number;
  detail: string;
  /** Higher = more likely a real problem (used to sort + gate `success`). */
  severity: 'low' | 'medium' | 'high';
}

export interface PlaybackAssertionResult {
  name: string;
  passed: boolean;
  message: string;
  at: number;
}

export interface PlaybackReport {
  name: string;
  description?: string;
  startedAt: string;
  duration: number;
  success: boolean;
  aborted: boolean;
  fps: PlaybackFpsMetrics;
  /** Per-event tally collected during the run. */
  collisions: number;
  /** Any console errors/warnings captured during the run. */
  logs: { level: string; text: string; t: number }[];
  anomalies: PlaybackAnomaly[];
  assertions: PlaybackAssertionResult[];
  artifacts: PlaybackArtifacts;
  /** Pre-formatted prompt the IDE sends to a vision model alongside the video. */
  visionPrompt: string;
  /** Suggested next-step prompts the IDE can use to drill in further. */
  followUpPrompts: string[];
}

/**
 * The SENSORIUM report — a strict superset of PlaybackReport with the felt
 * experience, a structured vision request, and an optional baseline diff.
 */
export interface SensoriumReport extends PlaybackReport {
  profile: ScenarioProfile;
  /** The quantified "feel" of the run. */
  feel: FeelProfile;
  /** Model-agnostic analysis package (video + frames + contact sheet + rubric). */
  analysis: VisionAnalysisRequest;
  /** Regression diff vs a saved baseline, when one was requested + found. */
  baselineDiff?: BaselineDiff;
}

// ── Back-compat: the legacy PLAYBACK names alias the SENSORIUM ones. ──────────
export type PlaybackScript = TestScript;
