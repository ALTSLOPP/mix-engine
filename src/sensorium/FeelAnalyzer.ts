import type { TelemetrySnapshot, TelemetryEvent } from './TelemetryRecorder';
import type {
  FeelProfile,
  FeelMetric,
  FeelMetricKey,
  FeelIntent,
  ScenarioProfile,
} from './types';

/**
 * SENSORIUM — FeelAnalyzer.
 *
 * This is what lets an AI *feel* a game instead of only watching it. It turns the
 * per-frame physics telemetry into human-interpretable kinesthetic proxies — the
 * same things a human playtester means by "responsive", "snappy", "floaty",
 * "twitchy", "smooth". Each metric is a defensible derivation from the velocity,
 * acceleration, heading and camera series; none of them is the whole truth, which is
 * why the vision model still watches the footage. Together they give the agent a
 * felt sense to correlate against what it sees.
 *
 * Everything here is pure: telemetry in, FeelProfile out. No engine access, so it is
 * trivially unit-testable and can run server-side on a saved JSONL just as well.
 */

const MOVE_INTENTS = new Set<FeelIntent>(['throttle', 'strafe', 'turn', 'jump']);

/** Per-profile weighting of which metrics decide the composite "overall" score. */
const PROFILE_WEIGHTS: Record<ScenarioProfile, Partial<Record<FeelMetricKey, number>>> = {
  locomotion: { responsiveness: 3, snappiness: 2, stability: 2, cameraSmooth: 1, framePacing: 1 },
  driving:    { responsiveness: 3, grip: 3, stability: 2, snappiness: 1, framePacing: 1, cameraSmooth: 1 },
  jump:       { responsiveness: 3, snappiness: 2, stability: 1, framePacing: 1 },
  combat:     { responsiveness: 3, snappiness: 2, cameraSmooth: 2, framePacing: 1 },
  camera:     { cameraSmooth: 4, framePacing: 2, stability: 1 },
  stress:     { framePacing: 4, stability: 2, responsiveness: 1 },
  free:       { responsiveness: 2, snappiness: 1, stability: 2, cameraSmooth: 1, framePacing: 2 },
};

export class FeelAnalyzer {
  analyze(
    snapshots: readonly TelemetrySnapshot[],
    events: readonly TelemetryEvent[],
    profile: ScenarioProfile,
  ): FeelProfile {
    // Keep only frames with a usable dt. The engine clamps dt to MAX_FRAME_TIME
    // (0.25s), so frames at a throttled/janky rate land at exactly 0.25 — include
    // them (a strict `< 0.25` would discard every frame on a slow machine / CI).
    const frames = snapshots.filter((s) => s.dt > 0 && s.dt <= 0.26);
    if (frames.length < 4) {
      return emptyProfile(profile, 'Not enough telemetry was captured to judge feel.');
    }

    const t = frames.map((f) => f.t);
    const speed = frames.map((f) => f.speed);
    const dt = frames.map((f) => f.dt);
    // Smooth speed before differentiating so a single throttled frame (dt clamped at
    // 0.25s, common on a slow machine / CI) can't manufacture a nonphysical accel spike.
    const accel = derivative(smooth(speed, 3), t);
    const heading = frames.map((f) => f.headingDeg);
    const camYaw = frames.map((f) => f.cameraYaw);
    const camPitch = frames.map((f) => f.cameraPitch);

    const topSpeed = Math.max(...speed);
    // p95 of |accel| ignores lone derivative spikes from frame-time jitter.
    const peakAccel = percentile(accel.map(Math.abs), 0.95);

    const inputs = events.filter((e) => e.kind === 'input');

    const metrics: FeelMetric[] = [
      this.responsiveness(frames, t, speed, heading, inputs),
      this.snappiness(t, accel, inputs, peakAccel),
      this.floatiness(speed, accel, topSpeed),
      this.stability(t, speed, accel),
      this.cameraSmooth(t, camYaw, camPitch, dt),
      this.framePacing(dt),
      this.weight(t, speed, inputs, topSpeed),
      this.grip(frames, heading, inputs),
    ];

    const responsivenessMs = metrics.find((m) => m.key === 'responsiveness')!.raw;
    const overall = weightedOverall(metrics, profile);
    const band = toBand(overall);
    const summary = buildSummary(metrics, overall, band, topSpeed, profile);

    return { overall, band, metrics, responsivenessMs, topSpeed, peakAccel, summary };
  }

  // ── Individual metrics ──────────────────────────────────────────────────

  /** Input → first visible motion. The single most important "feel" number. */
  private responsiveness(
    frames: readonly TelemetrySnapshot[],
    t: number[],
    speed: number[],
    heading: number[],
    inputs: readonly TelemetryEvent[],
  ): FeelMetric {
    const latencies: number[] = [];
    let misses = 0;
    for (const ev of inputs) {
      const intent = ev.intent;
      if (intent && !MOVE_INTENTS.has(intent)) continue;
      const i0 = nearestIndex(t, ev.t);
      const isTurn = intent === 'turn';
      const baseSpeed = speed[i0] ?? 0;
      const baseHeading = heading[i0] ?? 0;
      let hit = -1;
      for (let i = i0 + 1; i < t.length && t[i] - ev.t <= 0.6; i++) {
        const respondedLinear = speed[i] - baseSpeed > 0.25;
        const respondedTurn = Math.abs(angleDelta(heading[i], baseHeading)) > 8;
        if ((isTurn && respondedTurn) || (!isTurn && respondedLinear)) { hit = i; break; }
      }
      if (hit >= 0) latencies.push((t[hit] - ev.t) * 1000);
      else misses++;
    }
    const raw = latencies.length ? median(latencies) : (inputs.length ? 600 : 0);
    // 0–60 ms feels instant; 250 ms+ feels laggy.
    const score = latencies.length ? scoreLowerBetter(raw, 60, 250) : 50;
    const note = latencies.length
      ? `median input→motion ${raw.toFixed(0)} ms across ${latencies.length} inputs` +
        (misses ? `, ${misses} produced no motion` : '')
      : 'no movement inputs to measure';
    return mk('responsiveness', 'Responsiveness', raw, 'ms', score, note, latencies.length);
  }

  /** Peak acceleration onset right after movement inputs — how "snappy" it feels. */
  private snappiness(
    t: number[],
    accel: number[],
    inputs: readonly TelemetryEvent[],
    peakAccelGlobal: number,
  ): FeelMetric {
    const peaks: number[] = [];
    for (const ev of inputs) {
      if (ev.intent && !MOVE_INTENTS.has(ev.intent)) continue;
      const i0 = nearestIndex(t, ev.t);
      let pk = 0;
      for (let i = i0; i < t.length && t[i] - ev.t <= 0.8; i++) pk = Math.max(pk, accel[i] ?? 0);
      if (pk > 0) peaks.push(pk);
    }
    const raw = peaks.length ? median(peaks) : peakAccelGlobal;
    // ~25 m/s² is a brisk character launch; <4 is sluggish.
    const score = scoreHigherBetter(raw, 4, 25);
    return mk('snappiness', 'Snappiness', raw, 'm/s²', score,
      `peak acceleration ${raw.toFixed(1)} m/s² after input`, peaks.length || 1);
  }

  /** How long momentum lingers — high = floaty, low = grounded. Descriptive (stylistic). */
  private floatiness(speed: number[], accel: number[], topSpeed: number): FeelMetric {
    const decels: number[] = [];
    for (let i = 0; i < accel.length; i++) {
      if (speed[i] > 1 && accel[i] < 0) decels.push(-accel[i]);
    }
    const medDecel = decels.length ? median(decels) : 0;
    // Estimated time to coast to a stop from top speed.
    const stopTime = medDecel > 0.05 ? Math.min(topSpeed / medDecel, 10) : (topSpeed > 0.5 ? 10 : 0);
    // Map 0.1 s (grounded) → 0, 2.0 s (very floaty) → 100. Purely descriptive.
    const score = scoreHigherBetter(stopTime, 0.1, 2.0);
    return mk('floatiness', 'Floatiness', stopTime, 's', score,
      `~${stopTime.toFixed(2)} s to coast to a stop (stylistic, not pass/fail)`, decels.length);
  }

  /** Freedom from unwanted jitter while moving — catching on geometry, twitch, bounce. */
  private stability(t: number[], speed: number[], accel: number[]): FeelMetric {
    // Look at sustained-movement frames only (speed > 0.5).
    const idx: number[] = [];
    for (let i = 0; i < speed.length; i++) if (speed[i] > 0.5) idx.push(i);
    if (idx.length < 6) {
      return mk('stability', 'Stability', 0, 'CoV', 60, 'too little movement to judge stability', idx.length);
    }
    const movingSpeeds = idx.map((i) => speed[i]);
    const cov = stdev(movingSpeeds) / Math.max(mean(movingSpeeds), 1e-3);
    // Acceleration sign-flips per second = micro-jitter / catching.
    let flips = 0;
    for (let k = 1; k < idx.length; k++) {
      const a = accel[idx[k]] ?? 0, b = accel[idx[k - 1]] ?? 0;
      if (a * b < 0 && Math.abs(a - b) > 4) flips++;
    }
    const span = Math.max(t[idx[idx.length - 1]] - t[idx[0]], 1e-3);
    const flipsPerSec = flips / span;
    // Low CoV and few flips = stable.
    const covScore = scoreLowerBetter(cov, 0.08, 0.5);
    const flipScore = scoreLowerBetter(flipsPerSec, 2, 18);
    const score = 0.6 * covScore + 0.4 * flipScore;
    return mk('stability', 'Stability', cov, 'CoV', score,
      `speed CoV ${cov.toFixed(2)}, ${flipsPerSec.toFixed(1)} jitter-flips/s`, idx.length);
  }

  /** Camera angular smoothness — penalises disorienting snaps and high angular jerk. */
  private cameraSmooth(t: number[], yaw: number[], pitch: number[], dt: number[]): FeelMetric {
    const yawVel = derivativeAngular(yaw, t);
    const pitchVel = derivative(pitch, t);
    const yawAcc = derivative(yawVel, t);
    let snaps = 0;
    for (let i = 1; i < yaw.length; i++) {
      // > ~25° in a single frame is a jarring cut.
      if (Math.abs(angleDeltaRad(yaw[i], yaw[i - 1])) > 0.44) snaps++;
    }
    const jerk = rms(yawAcc) + 0.5 * rms(pitchVel);
    const span = Math.max(t[t.length - 1] - t[0], 1e-3);
    const snapsPerSec = snaps / span;
    const jerkScore = scoreLowerBetter(jerk, 1.5, 14);
    const snapScore = scoreLowerBetter(snapsPerSec, 0.2, 4);
    const score = 0.6 * jerkScore + 0.4 * snapScore;
    void dt;
    return mk('cameraSmooth', 'Camera Smoothness', jerk, 'rad/s²', score,
      `angular jerk ${jerk.toFixed(1)}, ${snapsPerSec.toFixed(1)} snaps/s`, yaw.length);
  }

  /** Steadiness of frame delivery — the felt difference between 60 fps and 60-with-hitches. */
  private framePacing(dt: number[]): FeelMetric {
    const m = mean(dt);
    const cov = stdev(dt) / Math.max(m, 1e-4);
    const worst = Math.max(...dt) * 1000;
    const covScore = scoreLowerBetter(cov, 0.15, 0.9);
    const worstScore = scoreLowerBetter(worst, 20, 120);
    const score = 0.6 * covScore + 0.4 * worstScore;
    return mk('framePacing', 'Frame Pacing', cov, 'CoV', score,
      `dt CoV ${cov.toFixed(2)}, worst frame ${worst.toFixed(0)} ms`, dt.length);
  }

  /** Sense of mass — ramp-up time to cruising speed. Descriptive (heavier ≠ worse). */
  private weight(t: number[], speed: number[], inputs: readonly TelemetryEvent[], topSpeed: number): FeelMetric {
    if (topSpeed < 0.5) return mk('weight', 'Weight', 0, 'ms', 50, 'no sustained motion to gauge mass', 0);
    const target = topSpeed * 0.63;
    const ramps: number[] = [];
    for (const ev of inputs) {
      if (ev.intent && !MOVE_INTENTS.has(ev.intent)) continue;
      const i0 = nearestIndex(t, ev.t);
      for (let i = i0; i < t.length && t[i] - ev.t <= 1.2; i++) {
        if (speed[i] >= target) { ramps.push((t[i] - ev.t) * 1000); break; }
      }
    }
    const raw = ramps.length ? median(ramps) : 400;
    // Heavier = longer ramp. 80 ms (light/twitchy) → 0; 700 ms (heavy) → 100.
    const score = scoreHigherBetter(raw, 80, 700);
    return mk('weight', 'Weight', raw, 'ms', score,
      `~${raw.toFixed(0)} ms to reach cruising speed (stylistic)`, ramps.length);
  }

  /** Driving grip — slip angle between travel direction and facing during turns. */
  private grip(
    frames: readonly TelemetrySnapshot[],
    heading: number[],
    inputs: readonly TelemetryEvent[],
  ): FeelMetric {
    // Only meaningful when the body is actually moving AND turning.
    const turnWindows = inputs.filter((e) => e.intent === 'turn').map((e) => e.t);
    const slips: number[] = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (!f.possessedVel || f.speed < 1.5) continue;
      const inTurn = turnWindows.some((tw) => f.t >= tw - 0.1 && f.t <= tw + 1.2);
      if (turnWindows.length && !inTurn) continue;
      const velDeg = Math.atan2(f.possessedVel[0], f.possessedVel[2]) * 180 / Math.PI;
      slips.push(Math.abs(angleDelta(velDeg, heading[i])));
    }
    if (slips.length < 4) {
      return mk('grip', 'Grip', 0, '°', 50, 'not enough cornering to measure slip', slips.length);
    }
    const raw = median(slips);
    // 0–10° tight grip; 60°+ is a slide.
    const score = scoreLowerBetter(raw, 10, 60);
    return mk('grip', 'Grip', raw, '°', score,
      `median slip ${raw.toFixed(0)}° between travel & facing`, slips.length);
  }
}

// ── Pure math helpers ───────────────────────────────────────────────────────

function mk(key: FeelMetricKey, label: string, raw: number, unit: string, score: number, note: string, samples: number): FeelMetric {
  return { key, label, raw: round2(raw), unit, score: Math.round(clamp(score, 0, 100)), note, samples };
}

function weightedOverall(metrics: FeelMetric[], profile: ScenarioProfile): number {
  const weights = PROFILE_WEIGHTS[profile] ?? PROFILE_WEIGHTS.free;
  let num = 0, den = 0;
  for (const m of metrics) {
    const w = weights[m.key];
    if (!w) continue;
    // Down-weight metrics with thin sample support so a fluke doesn't dominate.
    const conf = m.samples >= 3 ? 1 : m.samples === 0 ? 0.25 : 0.6;
    num += m.score * w * conf;
    den += w * conf;
  }
  return den > 0 ? Math.round(num / den) : 50;
}

function toBand(overall: number): FeelProfile['band'] {
  if (overall >= 85) return 'great';
  if (overall >= 70) return 'good';
  if (overall >= 50) return 'okay';
  if (overall >= 30) return 'rough';
  return 'broken';
}

function buildSummary(
  metrics: FeelMetric[],
  overall: number,
  band: FeelProfile['band'],
  topSpeed: number,
  profile: ScenarioProfile,
): string {
  const scored = metrics.filter((m) => m.samples > 0 && !isDescriptive(m.key));
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  const floaty = metrics.find((m) => m.key === 'floatiness');
  const feelWord = floaty ? (floaty.raw > 1.0 ? 'floaty' : floaty.raw < 0.4 ? 'grounded' : 'balanced') : 'balanced';
  const parts: string[] = [];
  parts.push(`The ${profile} test feels ${band} (${overall}/100), ${feelWord}, topping out at ${topSpeed.toFixed(1)} m/s.`);
  if (strongest && strongest !== weakest) parts.push(`${strongest.label} is the strong point (${strongest.score}).`);
  if (weakest) parts.push(`${weakest.label} is weakest (${weakest.score}) — ${weakest.note}.`);
  return parts.join(' ');
}

function isDescriptive(key: FeelMetricKey): boolean {
  return key === 'floatiness' || key === 'weight';
}

function emptyProfile(profile: ScenarioProfile, summary: string): FeelProfile {
  return {
    overall: 0,
    band: 'broken',
    metrics: [],
    responsivenessMs: 0,
    topSpeed: 0,
    peakAccel: 0,
    summary,
  };
}

function derivative(y: number[], x: number[]): number[] {
  const out = new Array(y.length).fill(0);
  for (let i = 1; i < y.length; i++) {
    const h = x[i] - x[i - 1];
    out[i] = h > 1e-5 ? (y[i] - y[i - 1]) / h : 0;
  }
  if (out.length > 1) out[0] = out[1];
  return out;
}

/** Derivative of an angular (degrees) series, unwrapping the ±180° seam. */
function derivativeAngular(deg: number[], x: number[]): number[] {
  const out = new Array(deg.length).fill(0);
  for (let i = 1; i < deg.length; i++) {
    const h = x[i] - x[i - 1];
    out[i] = h > 1e-5 ? angleDelta(deg[i], deg[i - 1]) / h : 0;
  }
  if (out.length > 1) out[0] = out[1];
  return out;
}

/** Smallest signed difference between two angles in degrees, in [-180, 180]. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Smallest signed difference between two angles in radians, in [-π, π]. */
function angleDeltaRad(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function nearestIndex(sortedT: number[], target: number): number {
  // Linear scan is fine — telemetry is a few hundred to a few thousand frames.
  let best = 0, bestD = Infinity;
  for (let i = 0; i < sortedT.length; i++) {
    const d = Math.abs(sortedT[i] - target);
    if (d < bestD) { bestD = d; best = i; }
    else if (sortedT[i] > target) break;
  }
  return best;
}

function mean(a: number[]): number { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function stdev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
}
function rms(a: number[]): number { return a.length ? Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length) : 0; }
function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function percentile(a: number[], p: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}
/** Centered moving average of half-window `w` (so window size 2w+1). */
function smooth(a: number[], w: number): number[] {
  if (a.length <= 2 || w < 1) return a.slice();
  const out = new Array(a.length).fill(0);
  for (let i = 0; i < a.length; i++) {
    let sum = 0, n = 0;
    for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < a.length) { sum += a[j]; n++; } }
    out[i] = sum / n;
  }
  return out;
}
function clamp(v: number, lo: number, hi: number): number { return Math.min(Math.max(v, lo), hi); }
function round2(v: number): number { return Math.round(v * 100) / 100; }

/** Linear score where smaller raw is better. raw<=good → 100, raw>=bad → 0. */
function scoreLowerBetter(raw: number, good: number, bad: number): number {
  if (raw <= good) return 100;
  if (raw >= bad) return 0;
  return 100 * (1 - (raw - good) / (bad - good));
}
/** Linear score where larger raw is better. raw>=good → 100, raw<=bad → 0. */
function scoreHigherBetter(raw: number, bad: number, good: number): number {
  if (raw >= good) return 100;
  if (raw <= bad) return 0;
  return 100 * ((raw - bad) / (good - bad));
}
