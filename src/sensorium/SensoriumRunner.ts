import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { AIBridge } from '../ai/AIBridge';
import type { EntityId } from '../ecs/SceneManager';
import { TelemetryRecorder } from './TelemetryRecorder';
import { AnomalyDetector } from './AnomalyDetector';
import { SensoriumRecorder } from './SensoriumRecorder';
import { FeelAnalyzer } from './FeelAnalyzer';
import { VisionReportBuilder } from './VisionReportBuilder';
import { buildScenario } from './ScenarioLibrary';
import type {
  TestScript,
  TestAction,
  SetupCommand,
  AssertionPredicate,
  EntityRef,
  FeelIntent,
  FeelProfile,
  ScenarioProfile,
  ScenarioOptions,
  PlaybackFpsMetrics,
  PlaybackAnomaly,
  PlaybackAssertionResult,
  PlaybackArtifacts,
  BaselineDiff,
  BaselineMetricDiff,
  SensoriumReport,
} from './types';

const PUBLIC_ROOT = '/sensorium';
const API_BASE = '/api/sensorium';
const _yAxis = new THREE.Vector3(0, 1, 0);

/**
 * SENSORIUM — SensoriumRunner (the orchestrator).
 *
 * Drives a TestScript (or a generated scenario) from start to finish, frame-coherent
 * with the engine loop:
 *   1. runs setup commands so the test sees a known scene,
 *   2. enters test mode + drives the possessed character via synthetic InputManager
 *      input (exercising the same PlayerController path real players use),
 *   3. records video + keyframes (SensoriumRecorder) and per-frame telemetry
 *      (TelemetryRecorder), tagging inputs with their kinesthetic intent,
 *   4. detects anomalies with real collision attribution (AnomalyDetector),
 *   5. on finish, computes the FeelProfile (FeelAnalyzer), evaluates assertions
 *      (including feel-based ones), diffs against a baseline, and assembles a
 *      model-agnostic vision request + contact sheet (VisionReportBuilder),
 *   6. POSTs the artifacts and resolves a SINGLE promise with the SensoriumReport.
 *
 * Architecture note: unlike the original PLAYBACK runner, this does NOT spin its own
 * requestAnimationFrame loop. Action firing + anomaly scanning run on the engine's
 * update hook and keyframe capture on its post-render hook, so test time, physics,
 * and telemetry never drift apart — and there is exactly one promise, resolved once.
 */
export class SensoriumRunner {
  private active = false;
  private finished = false;
  private aborted = false;
  private script: TestScript | null = null;

  private startTime = 0;
  private elapsed = 0;
  private maxDuration = 120;
  private keyframeEvery = 0.5;
  private nextKeyframeAt = 0;
  private idleAt = 0;

  private actionCursor = 0;
  private readonly heldKeys = new Set<string>();
  private readonly heldUntil = new Map<string, number>();
  private readonly assertedNames = new Set<string>();
  private currentIntent: FeelIntent | undefined;
  private currentMarker: string | undefined;

  private readonly telemetry: TelemetryRecorder;
  private readonly detector: AnomalyDetector;
  private readonly feelAnalyzer = new FeelAnalyzer();
  private readonly reportBuilder = new VisionReportBuilder();
  private recorder: SensoriumRecorder | null = null;

  private assertionResults: PlaybackAssertionResult[] = [];
  private deferredAsserts: { name: string; predicate: AssertionPredicate; at: number }[] = [];
  private logs: { level: string; text: string; t: number }[] = [];
  private recordingName = '';

  private report: SensoriumReport | null = null;
  private resolveRun: ((r: SensoriumReport) => void) | null = null;
  private updateUnsub: (() => void) | null = null;
  private postRenderUnsub: (() => void) | null = null;
  private collisionUnsub: (() => void) | null = null;
  /** Wall-clock safety net: force-finishes even if the engine update loop stalls
   *  (e.g. a backgrounded tab pausing rAF) so a run promise can never hang. */
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private aiBridge!: AIBridge;

  private readonly _v = new THREE.Vector3();
  private readonly _fwd = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();

  constructor(private readonly engine: Engine, aiBridge: AIBridge | null) {
    this.telemetry = new TelemetryRecorder(engine);
    this.detector = new AnomalyDetector(engine);
    if (aiBridge) this.aiBridge = aiBridge;
  }

  /** Engine constructs the runner before the AIBridge; this closes the two-way link. */
  attachAIBridge(bridge: AIBridge): void { this.aiBridge = bridge; }

  get isActive(): boolean { return this.active; }
  get lastReport(): SensoriumReport | null { return this.report; }

  /** Generate + run a scenario by profile name ("driving", "locomotion", …). */
  test(profile: ScenarioProfile, opts: ScenarioOptions = {}): Promise<SensoriumReport> {
    return this.run(buildScenario(profile, opts));
  }

  /** Run a fully-authored TestScript end-to-end. */
  async run(script: TestScript): Promise<SensoriumReport> {
    if (this.active) throw new Error('[SENSORIUM] a run is already active');
    this.resetState(script);
    this.engine.isTestMode = true;
    this.engine.input.setTestMode(true);

    this.telemetry.start();
    this.startTime = performance.now();
    this.detector.reset();
    this.telemetry.recordState('run_start', { name: this.recordingName, actions: script.actions.length, profile: script.profile });

    try { await this.runSetup(script.setup); }
    catch (err) { console.error('[SENSORIUM] setup failed:', err); }

    // Visual capture.
    const canvas = this.engine.viewport.renderer.domElement as HTMLCanvasElement;
    this.recorder = new SensoriumRecorder(canvas, this.recordingName, PUBLIC_ROOT, API_BASE);
    if (script.record?.video !== false) {
      const ok = await this.recorder.startVideo(script.record?.fps ?? 30);
      if (!ok) console.warn('[SENSORIUM] video unavailable — telemetry + keyframes only');
    }

    // Loop-coherent hooks.
    this.collisionUnsub = this.engine.onCollision((e) => this.detector.onCollision(e, this.elapsed));
    this.postRenderUnsub = this.engine.addPostRenderHook(() => this.onPostRender());
    this.updateUnsub = this.engine.addUpdateHook(() => this.onUpdate());

    // Pre-arm pointer-lock bypass if any look/move is scripted.
    if (script.actions.some((a) => a.type === 'press' || a.type === 'lookAt' || a.type === 'move' || a.type === 'possess')) {
      this.engine.input.injectPointerLock(true);
    }

    // Watchdog: if the loop never advances us to maxDuration (stalled/backgrounded
    // rAF), force a finish so `await runSensorium(...)` always resolves.
    this.watchdog = setTimeout(() => { if (!this.finished) void this.finish(); }, (this.maxDuration + 8) * 1000);

    return new Promise<SensoriumReport>((resolve) => { this.resolveRun = resolve; });
  }

  abort(): void { if (this.active) this.aborted = true; }

  private resetState(script: TestScript): void {
    this.active = true;
    this.finished = false;
    this.aborted = false;
    this.script = script;
    this.elapsed = 0;
    this.idleAt = 0;
    this.actionCursor = 0;
    this.heldKeys.clear();
    this.heldUntil.clear();
    this.assertedNames.clear();
    this.currentIntent = undefined;
    this.currentMarker = undefined;
    this.assertionResults = [];
    this.deferredAsserts = [];
    this.logs = [];
    this.maxDuration = script.record?.maxDuration ?? 120;
    this.keyframeEvery = script.record?.extractKeyframesEvery ?? 0.5;
    this.nextKeyframeAt = this.keyframeEvery;
    this.recordingName = (script.record?.name ?? script.name ?? `sensorium_${Date.now()}`)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  // ── Per-frame (engine update hook) ───────────────────────────────────────

  private onUpdate(): void {
    if (!this.active) return;
    this.elapsed = (performance.now() - this.startTime) / 1000;
    const script = this.script!;

    // Auto-release held keys whose hold expired.
    for (const [code, until] of this.heldUntil) {
      if (this.elapsed >= until) {
        this.heldKeys.delete(code);
        this.engine.input.injectKey(code, false);
        this.heldUntil.delete(code);
      }
    }

    // Fire all actions whose time has arrived.
    while (this.actionCursor < script.actions.length && script.actions[this.actionCursor].at <= this.elapsed) {
      this.fireAction(script.actions[this.actionCursor]);
      this.actionCursor++;
    }

    this.detector.onFrame(this.elapsed, this.heldKeys.size);

    // End conditions.
    if (this.aborted || this.elapsed >= this.maxDuration) { void this.finish(); return; }
    if (this.actionCursor >= script.actions.length && this.heldKeys.size === 0) {
      if (this.idleAt === 0) this.idleAt = this.elapsed;
      else if (this.elapsed - this.idleAt > 1.0) { void this.finish(); return; }
    } else {
      this.idleAt = 0;
    }
  }

  private onPostRender(): void {
    if (!this.active || !this.recorder) return;
    if (this.elapsed >= this.nextKeyframeAt) {
      this.recorder.captureKeyframe(this.elapsed, this.currentMarker);
      this.nextKeyframeAt += this.keyframeEvery;
    }
  }

  // ── Action firing ────────────────────────────────────────────────────────

  private fireAction(a: TestAction): void {
    switch (a.type) {
      case 'wait': break;
      case 'intent': this.currentIntent = a.intent; break;
      case 'marker':
        this.currentMarker = a.name;
        if (a.intent) this.currentIntent = a.intent;
        this.telemetry.recordEvent({ kind: 'marker', t: this.elapsed, text: a.name, intent: a.intent });
        break;
      case 'possess': this.actionPossess(a.entityId, a.entityName, a.label); break;
      case 'unpossess': this.engine.player.possess(null); break;
      case 'setMode': this.engine.input.setMode(a.mode); break;
      case 'move': this.actionMove(a.direction, a.duration); break;
      case 'jump': this.tapKey('Space', 0.15, 'jump'); break;
      case 'attack': this.tapKey('KeyF', 0.2); break;
      case 'press': this.actionPress(a.down, a.up, a.duration); break;
      case 'release': this.actionRelease(a.keys); break;
      case 'lookAt': this.recordInput('look', a.label ?? 'lookAt'); this.actionLookAt(a.target); break;
      case 'setCamera': this.actionSetCamera(a.position, a.lookAt, a.fov); break;
      case 'cinematic': this.engine.cinematic.play(a.sequence); break;
      case 'spawnVfx':
        this.engine.spawnVfx(a.preset as any, new THREE.Vector3(a.x, a.y, a.z), { duration: a.duration, loop: a.loop });
        break;
      case 'assert': this.scheduleAssertion(a.name, a.predicate); break;
      case 'log':
        this.logs.push({ level: a.level ?? 'info', text: a.message, t: this.elapsed });
        this.telemetry.recordEvent({ kind: 'log', t: this.elapsed, text: a.message, extra: { level: a.level ?? 'info' } });
        break;
    }
  }

  /** Record an input event with its intent so the FeelAnalyzer can window it. */
  private recordInput(intent: FeelIntent | undefined, label: string): void {
    this.telemetry.recordEvent({ kind: 'input', t: this.elapsed, text: label, intent });
    if (intent && intent !== 'look' && intent !== 'idle') this.detector.noteMovementInput();
  }

  private actionPossess(entityId: number | undefined, entityName: string | undefined, label?: string): void {
    let id: EntityId | null = entityId ?? null;
    if (id === null && entityName) {
      for (const eid of this.entityIds()) {
        if (this.engine.aiBridge.getEntityName(eid) === entityName) { id = eid; break; }
      }
    }
    // Fallback: first character-like body so a test never silently no-ops.
    if (id === null) id = this.firstPossessable();
    if (id === null) {
      this.logs.push({ level: 'warn', text: `possess: no entity ${entityName ?? entityId} found`, t: this.elapsed });
      return;
    }
    this.engine.player.possess(id);
    this.engine.input.setMode('play');
    this.engine.input.injectPointerLock(true);
    this.telemetry.recordState('possess', { id, name: entityName, label });
  }

  private actionMove(direction: [number, number], duration: number): void {
    const yaw = this.engine.player.getCameraYaw();
    this._fwd.set(0, 0, -1).applyAxisAngle(_yAxis, yaw);
    this._right.set(1, 0, 0).applyAxisAngle(_yAxis, yaw);
    const dx = direction[0], dz = direction[1];
    const fwd = -(this._fwd.x * dx + this._fwd.z * dz);
    const rgt = this._right.x * dx + this._right.z * dz;
    const down: string[] = [];
    const up: string[] = [];
    if (fwd > 0.1) down.push('KeyW'); else up.push('KeyW');
    if (fwd < -0.1) down.push('KeyS'); else up.push('KeyS');
    if (rgt > 0.1) down.push('KeyD'); else up.push('KeyD');
    if (rgt < -0.1) down.push('KeyA'); else up.push('KeyA');
    const intent = this.currentIntent ?? (Math.abs(fwd) >= Math.abs(rgt) ? 'throttle' : 'strafe');
    this.recordInput(intent, `move ${dx},${dz}`);
    this.actionPress(down, up, duration, /* alreadyRecorded */ true);
  }

  private actionPress(down: string[], up: string[] | undefined, duration: number | undefined, alreadyRecorded = false): void {
    if (up) for (const k of up) {
      this.heldKeys.delete(k); this.heldUntil.delete(k);
      this.engine.input.injectKey(k, false);
    }
    if (!alreadyRecorded && down.length) {
      this.recordInput(this.currentIntent ?? inferPressIntent(down), `press ${down.join('+')}`);
    }
    const hold = duration ?? 0.5;
    for (const k of down) {
      this.engine.input.injectKey(k, true);
      this.heldKeys.add(k);
      if (hold > 0) this.heldUntil.set(k, this.elapsed + hold);
    }
  }

  private actionRelease(keys: string[]): void {
    for (const k of keys) {
      this.heldKeys.delete(k);
      this.heldUntil.delete(k);
      this.engine.input.injectKey(k, false);
    }
  }

  private tapKey(code: string, hold: number, intent?: FeelIntent): void {
    if (intent) this.recordInput(intent, intent);
    this.engine.input.injectKey(code, true);
    this.heldKeys.add(code);
    this.heldUntil.set(code, this.elapsed + hold);
  }

  private actionLookAt(target: [number, number, number]): void {
    const pid = this.engine.player.getPossessedId();
    if (pid === null) return;
    const rb = this.engine.sceneManager.getRigidBody(pid);
    if (!rb) return;
    this.engine.worldOrigin.toEngineSpaceInto(this._v, new THREE.Vector3(target[0], target[1], target[2]));
    const from = rb.mesh.position;
    const dx = this._v.x - from.x, dz = this._v.z - from.z;
    // The PlayerController's forward = -(sin(yaw), cos(yaw)) (camera sits at +offset and
    // looks back toward the player). To face the target, forward must point along
    // (dx,dz), so sin(yaw)=-dx, cos(yaw)=-dz → atan2(-dx,-dz). The old atan2(dx,dz)
    // pointed the character 180° away from the target.
    const yaw = Math.atan2(-dx, -dz);
    const horiz = Math.max(Math.hypot(dx, dz), 1e-3);
    const pitch = Math.atan2(this._v.y - from.y, horiz);
    this.engine.player.setCameraAngles(yaw, pitch);
  }

  private actionSetCamera(position: [number, number, number], lookAt: [number, number, number] | undefined, fov?: number): void {
    this.engine.worldOrigin.toEngineSpaceInto(this._v, new THREE.Vector3(position[0], position[1], position[2]));
    this.engine.viewport.camera.position.copy(this._v);
    if (lookAt) {
      this.engine.worldOrigin.toEngineSpaceInto(this._v, new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]));
      this.engine.viewport.camera.lookAt(this._v);
    }
    if (fov) {
      this.engine.viewport.camera.fov = fov;
      this.engine.viewport.camera.updateProjectionMatrix();
    }
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  private async runSetup(commands: SetupCommand[] | undefined): Promise<void> {
    if (!commands) return;
    for (const c of commands) {
      try { await this.runOneSetup(c); }
      catch (err) { this.logs.push({ level: 'error', text: `setup: ${(err as Error).message}`, t: this.elapsed }); }
    }
  }

  private async runOneSetup(c: SetupCommand): Promise<void> {
    if (c.type === 'aiCommand') {
      this.aiBridge.execute(c.command);
      await new Promise((r) => setTimeout(r, 60));
    } else if (c.type === 'setTimeOfDay') {
      this.engine.setTimeOfDay(c.hour);
    } else if (c.type === 'setWeather') {
      this.aiBridge.execute({ type: 'set_weather', fogDensity: c.fogDensity, fogColor: c.fogColor, ambient: c.ambient });
    } else if (c.type === 'setPostFx') {
      this.aiBridge.execute({ type: 'set_post_fx', bloomStrength: c.bloomStrength, bloomThreshold: c.bloomThreshold, bloomRadius: c.bloomRadius });
      if (c.exposure !== undefined) {
        this.aiBridge.execute({ type: 'set_tone', exposure: c.exposure });
      }
    }
  }

  // ── Assertions ──────────────────────────────────────────────────────────

  /** Immediate predicates evaluate now; feel/anomaly ones defer to finish(). */
  private scheduleAssertion(name: string, predicate: AssertionPredicate): void {
    const deferredKinds = ['feel_score_gte', 'responsiveness_lt_ms', 'no_anomaly', 'fps_gt'];
    if (deferredKinds.includes(predicate.kind)) {
      this.deferredAsserts.push({ name, predicate, at: this.elapsed });
    } else {
      this.evaluateImmediate(name, predicate, this.elapsed);
    }
  }

  private evaluateImmediate(name: string, pred: AssertionPredicate, at: number): void {
    if (this.assertedNames.has(name)) return;
    this.assertedNames.add(name);
    let passed = false, message = '';
    try {
      switch (pred.kind) {
        case 'position_gt': case 'position_lt': {
          const ref = this.resolveEntityRef(pred.entityRef);
          if (!ref) { message = 'entity not found'; break; }
          const v = ref.pos[axisIndex(pred.axis)];
          passed = pred.kind === 'position_gt' ? v > pred.value : v < pred.value;
          message = `${ref.label}.${pred.axis} = ${v.toFixed(2)} (want ${pred.kind === 'position_gt' ? '>' : '<'} ${pred.value})`;
          break;
        }
        case 'distance_lt': {
          const ref = this.resolveEntityRef(pred.entityRef);
          if (!ref) { message = 'entity not found'; break; }
          // ref.pos is now WORLD space; compare against the world-space target directly
          // (no engine-space conversion — that would double-count the origin offset).
          const d = Math.hypot(ref.pos[0] - pred.target[0], ref.pos[1] - pred.target[1], ref.pos[2] - pred.target[2]);
          passed = d < pred.value;
          message = `distance = ${d.toFixed(2)} (want < ${pred.value})`;
          break;
        }
        case 'velocity_gt': case 'velocity_lt': {
          const ref = this.resolveEntityRef(pred.entityRef);
          if (!ref) { message = 'entity not found'; break; }
          passed = pred.kind === 'velocity_gt' ? ref.velMag > pred.magnitude : ref.velMag < pred.magnitude;
          message = `velocity = ${ref.velMag.toFixed(2)} (want ${pred.kind === 'velocity_gt' ? '>' : '<'} ${pred.magnitude})`;
          break;
        }
        case 'collision_count_gte': {
          const collisions = this.telemetry.events.filter((e) => e.kind === 'collision').length;
          passed = collisions >= pred.value;
          message = `collisions = ${collisions} (want >= ${pred.value})`;
          break;
        }
        default: message = 'predicate deferred or unknown';
      }
    } catch (err) { message = `error: ${(err as Error).message}`; }
    this.assertionResults.push({ name, passed, message, at });
  }

  private evaluateDeferred(feel: FeelProfile, anomalies: PlaybackAnomaly[], fps: PlaybackFpsMetrics): void {
    for (const { name, predicate: pred, at } of this.deferredAsserts) {
      if (this.assertedNames.has(name)) continue;
      this.assertedNames.add(name);
      let passed = false, message = '';
      switch (pred.kind) {
        case 'feel_score_gte': {
          const score = pred.metric === 'overall' ? feel.overall : (feel.metrics.find((m) => m.key === pred.metric)?.score ?? 0);
          passed = score >= pred.value;
          message = `feel ${pred.metric} = ${score} (want >= ${pred.value})`;
          break;
        }
        case 'responsiveness_lt_ms': {
          passed = feel.responsivenessMs > 0 && feel.responsivenessMs < pred.value;
          message = `responsiveness = ${feel.responsivenessMs.toFixed(0)}ms (want < ${pred.value}ms)`;
          break;
        }
        case 'no_anomaly': {
          const hit = anomalies.find((a) => a.kind === pred.anomaly);
          passed = !hit;
          message = hit ? `found ${pred.anomaly} at t=${hit.t.toFixed(2)}s` : `no ${pred.anomaly} detected`;
          break;
        }
        case 'fps_gt': {
          const during = pred.during;
          const samples = this.telemetry.snapshots
            .filter((s) => !during || (s.t >= during[0] && s.t <= during[1]))
            .map((s) => s.fps);
          const min = samples.length ? Math.min(...samples) : 0;
          passed = min > pred.value;
          message = `min fps ${during ? `in [${during[0]},${during[1]}] ` : ''}= ${min.toFixed(1)} (want > ${pred.value})`;
          break;
        }
        default: message = 'unknown deferred predicate';
      }
      this.assertionResults.push({ name, passed, message, at });
    }
  }

  private resolveEntityRef(ref: EntityRef): { pos: [number, number, number]; velMag: number; label: string } | null {
    let id: EntityId | null = null;
    let label = 'entity';
    if ('entityId' in ref) { id = ref.entityId; label = `entity#${id}`; }
    else if ('entityName' in ref) {
      for (const eid of this.entityIds()) {
        if (this.engine.aiBridge.getEntityName(eid) === ref.entityName) { id = eid; break; }
      }
      label = ref.entityName;
    } else if ('possessed' in ref && ref.possessed) { id = this.engine.player.getPossessedId(); label = 'possessed'; }
    else if ('camera' in ref && ref.camera) {
      const cam = this.engine.viewport.camera;
      return { pos: [cam.position.x, cam.position.y, cam.position.z], velMag: 0, label: 'camera' };
    }
    if (id === null) return null;
    const rb = this.engine.sceneManager.getRigidBody(id);
    if (!rb) return null;
    const m = rb.mesh;
    // Return WORLD-space position so assertions (position_gt/lt, distance_lt) compare
    // against authored world-space thresholds correctly even after a floating-origin
    // shift (which now actually fires from the engine loop).
    this.engine.worldOrigin.toWorldSpaceInto(this._v, m.position);
    // For the possessed (kinematic) body, linvel() is 0 — use the world-derived speed
    // the telemetry recorder computed for the latest frame instead.
    let velMag: number;
    const snaps = this.telemetry.snapshots;
    if (id === this.engine.player.getPossessedId() && snaps.length) {
      velMag = snaps[snaps.length - 1].speed;
    } else {
      const lv = rb.rapierBody.linvel();
      velMag = Math.hypot(lv.x, lv.y, lv.z);
    }
    return { pos: [this._v.x, this._v.y, this._v.z], velMag, label };
  }

  // ── Finish + report assembly ─────────────────────────────────────────────

  private async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    if (this.watchdog) { clearTimeout(this.watchdog); this.watchdog = null; }

    this.updateUnsub?.(); this.updateUnsub = null;
    this.postRenderUnsub?.(); this.postRenderUnsub = null;
    this.collisionUnsub?.(); this.collisionUnsub = null;

    this.engine.cinematic.stop();
    for (const k of this.heldKeys) this.engine.input.injectKey(k, false);
    this.heldKeys.clear();
    this.engine.input.injectPointerLock(false);
    this.engine.input.setTestMode(false);

    // Clean teardown: return the editor to a usable state unless asked to keep the
    // play session (so a panel/agent run doesn't strand the user in play mode
    // controlling the test character).
    if (this.script?.record?.keepPlayState !== true) {
      this.engine.player.possess(null);
      this.engine.input.setMode('editor');
    }

    const videoUrl = this.recorder ? await this.recorder.stopVideo() : '';

    const tel = this.telemetry.stop();
    await this.post(`${API_BASE}/telemetry`, { recording: this.recordingName, jsonl: tel.serializeJsonl() });
    for (const e of tel.events) {
      if (e.kind === 'log') this.logs.push({ level: (e.extra as any)?.level ?? 'info', text: e.text ?? '', t: e.t });
    }

    const duration = (performance.now() - this.startTime) / 1000;
    const fps = computeFpsMetrics(tel.snapshots.map((s) => s.fps));
    const feel = this.feelAnalyzer.analyze(tel.snapshots, tel.events, this.script!.profile ?? 'free');
    let anomalies = this.detector.finalize(fps.longStutterMs);
    // Reconcile: the detector's per-frame speed and the analyzer's top speed are two
    // estimates of the same motion. If the (authoritative, world-delta) telemetry shows
    // real movement, a "never_moved" flag is a low-frame-rate false positive — drop it.
    if (feel.topSpeed > 0.5) anomalies = anomalies.filter((a) => a.kind !== 'never_moved');
    const errorCount = this.logs.filter((l) => l.level === 'error').length;
    if (errorCount > 0) anomalies.unshift({ kind: 'console_error', t: 0, detail: `${errorCount} console error(s) during run`, severity: 'high' });

    this.evaluateDeferred(feel, anomalies, fps);

    // Contact sheet + analysis request.
    let contactSheetUrl: string | undefined;
    if (this.recorder && this.script!.record?.contactSheet !== false) {
      const sheet = await this.reportBuilder.buildContactSheet(this.recorder.getContactSheetSources(), this.script!.record?.contactSheetCells ?? 12);
      if (sheet) contactSheetUrl = await this.recorder.uploadContactSheet(sheet);
    }
    const keyframes = this.recorder?.getKeyframes() ?? [];

    const baselineDiff = await this.diffBaseline(this.script!, feel);

    const analysis = this.reportBuilder.buildAnalysisRequest({
      script: this.script!, fps, feel, anomalies, assertions: this.assertionResults,
      duration, videoUrl, keyframes, contactSheetUrl,
    });

    const artifacts: PlaybackArtifacts = {
      video: videoUrl,
      telemetry: `${PUBLIC_ROOT}/${this.recordingName}/telemetry.jsonl`,
      keyframes,
      report: `${PUBLIC_ROOT}/${this.recordingName}/report.json`,
      contactSheet: contactSheetUrl,
    };

    const success =
      this.assertionResults.every((a) => a.passed) &&
      AnomalyDetector.highCount(anomalies) === 0 &&
      !this.aborted;

    const report: SensoriumReport = {
      name: this.recordingName,
      description: this.script!.description,
      profile: this.script!.profile ?? 'free',
      startedAt: new Date(this.startTime + (Date.now() - performance.now())).toISOString(),
      duration,
      success,
      aborted: this.aborted,
      fps,
      collisions: tel.events.filter((e) => e.kind === 'collision').length,
      logs: this.logs,
      anomalies,
      assertions: this.assertionResults,
      artifacts,
      feel,
      analysis,
      baselineDiff,
      visionPrompt: analysis.instructions,
      followUpPrompts: this.reportBuilder.followUps(this.script!, anomalies, feel),
    };
    this.report = report;

    await this.post(`${API_BASE}/report`, { recording: this.recordingName, report });
    this.engine.isTestMode = false;
    this.telemetry.recordState('run_end', { success });
    // Let the editor UI (outliner/inspector) refresh — a run may have spawned entities.
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('mix:scene-changed')); } catch { /* non-DOM env */ }
    }

    const resolve = this.resolveRun;
    this.resolveRun = null;
    this.script = null;
    this.recorder = null;
    resolve?.(report);
  }

  /** Save the current FeelProfile as a named baseline (for future regression diffs). */
  async saveBaseline(name: string): Promise<boolean> {
    const feel = this.report?.feel;
    if (!feel) return false;
    try {
      await fetch(`${API_BASE}/baseline?name=${encodeURIComponent(name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savedAt: new Date().toISOString(), feel }),
      });
      return true;
    } catch { return false; }
  }

  private async diffBaseline(script: TestScript, feel: FeelProfile): Promise<BaselineDiff | undefined> {
    if (!script.baseline) return undefined;
    let base: { savedAt: string; feel: FeelProfile } | null = null;
    try {
      const res = await fetch(`${API_BASE}/baseline?name=${encodeURIComponent(script.baseline)}`);
      if (res.ok) base = await res.json();
    } catch { /* absent */ }
    if (!base?.feel) return undefined;
    const diffs: BaselineMetricDiff[] = [];
    const tol = 6; // score points
    const push = (key: BaselineMetricDiff['key'], label: string, b: number, c: number, higherBetter: boolean) => {
      const delta = c - b;
      const improved = higherBetter ? delta > tol : delta < -tol;
      const regressed = higherBetter ? delta < -tol : delta > tol;
      diffs.push({ key, label, baseline: round2(b), current: round2(c), delta: round2(delta), regressed, improved });
    };
    push('overall', 'Overall', base.feel.overall, feel.overall, true);
    push('responsivenessMs', 'Responsiveness (ms)', base.feel.responsivenessMs, feel.responsivenessMs, false);
    for (const m of feel.metrics) {
      const bm = base.feel.metrics.find((x) => x.key === m.key);
      if (bm) push(m.key, m.label, bm.score, m.score, true);
    }
    return { name: script.baseline, savedAt: base.savedAt, diffs, anyRegression: diffs.some((d) => d.regressed) };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private entityIds(): Iterable<EntityId> {
    return (this.engine.sceneManager as unknown as { entities: Set<EntityId> }).entities;
  }

  private firstPossessable(): EntityId | null {
    // Prefer a root-motion (character) body; fall back to any rigid body.
    const sm = this.engine.sceneManager as unknown as { rigidBodyList: unknown[]; rigidBodyEntities: EntityId[] };
    const rmList = this.engine.sceneManager.rootMotionList;
    if (rmList.length) {
      const idx = sm.rigidBodyList.indexOf(rmList[0] as unknown);
      if (idx >= 0) return sm.rigidBodyEntities[idx];
    }
    return sm.rigidBodyEntities[0] ?? null;
  }

  private async post(url: string, body: unknown): Promise<void> {
    try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch { /* dev server absent in prod */ }
  }
}

function axisIndex(axis: 'x' | 'y' | 'z'): 0 | 1 | 2 { return axis === 'x' ? 0 : axis === 'y' ? 1 : 2; }

function inferPressIntent(down: string[]): FeelIntent {
  const has = (k: string) => down.includes(k);
  if (has('KeyA') || has('KeyD')) return (has('KeyW') || has('KeyS')) ? 'turn' : 'strafe';
  if (has('KeyW') || has('KeyS')) return 'throttle';
  if (has('Space')) return 'jump';
  return 'idle';
}

function computeFpsMetrics(samples: number[]): PlaybackFpsMetrics {
  // Drop the first sample (the pre-roll frame carries a bogus dt).
  const clean = samples.length > 1 ? samples.slice(1) : samples;
  if (clean.length === 0) return { avg: 0, min: 0, max: 0, p99: 0, p1: 0, longStutterMs: 0, stutterEvents: 0 };
  const sorted = [...clean].sort((a, b) => a - b);
  const avg = clean.reduce((s, v) => s + v, 0) / clean.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? max;
  const p1 = sorted[Math.floor(sorted.length * 0.01)] ?? min;
  let longest = 0, cur = 0, inStutter = false, events = 0;
  for (const fps of clean) {
    if (fps < 30) {
      if (!inStutter) { inStutter = true; events++; }
      cur += 1000 / 60;
      longest = Math.max(longest, cur);
    } else { inStutter = false; cur = 0; }
  }
  return { avg, min, max, p99, p1, longStutterMs: longest, stutterEvents: events };
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
