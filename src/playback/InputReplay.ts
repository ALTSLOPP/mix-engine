import type { InputManager, InputMode } from '../engine/InputManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { Time } from '../engine/Time';

// ── Types ─────────────────────────────────────────────────────────────────

export interface InputSnapshot {
  /** Keys currently held. */
  keysDown: string[];
  /** Keys pressed this frame. */
  keysPressed: string[];
  /** Mouse buttons held. */
  mouseButtons: number[];
  /** Cumulative mouse delta since last snapshot. */
  mouseDeltaX: number;
  mouseDeltaY: number;
  /** Wheel delta since last snapshot. */
  wheelDelta: number;
  /** Mode at this frame. */
  mode: InputMode;
  /** Timestamp offset from start in ms. */
  timeOffset: number;
}

export interface ReplayRecording {
  /** Engine fixed timestep used during recording. */
  fixedDt: number;
  /** Snapshots captured every frame. */
  frames: InputSnapshot[];
}

export type ReplayState = 'idle' | 'recording' | 'playing' | 'paused';

// ── InputReplay ───────────────────────────────────────────────────────────

/**
 * Deterministic Input Replay — records raw player inputs frame-by-frame and
 * replays them deterministically, allowing tick-by-tick stepping for debugging.
 *
 * Usage (IDE):
 *   { "type": "replay_start_recording" }
 *   { "type": "replay_stop_recording" }
 *   { "type": "replay_play" }
 *   { "type": "replay_step" }
 *   { "type": "replay_pause" }
 *   { "type": "replay_stop" }
 *   { "type": "replay_set_frame"; frame: number }
 */
export class InputReplay {
  private _state: ReplayState = 'idle';
  private recording: InputReplayRecording | null = null;
  private playhead = 0;
  private frameSinceRecordingStart = 0;
  private prevKeysDown: string[] = [];
  private prevKeysPressed: string[] = [];
  private prevMouseButtons: number[] = [];
  private prevMouseDeltaX = 0;
  private prevMouseDeltaY = 0;
  private prevWheelDelta = 0;
  private prevMode: InputMode = 'editor';

  private readonly inputs: InputManager;
  private readonly physics?: PhysicsWorld;
  private readonly time?: Time;

  /** Callback invoked after each replay frame step. Useful for the engine to
   *  sync physics state for inspection. */
  onReplayFrame?: (frameIndex: number, snapshot: InputSnapshot) => void;

  /** Called when replay completes or is stopped. */
  onReplayEnd?: () => void;

  constructor(inputs: InputManager, deps?: { physics?: PhysicsWorld; time?: Time }) {
    this.inputs = inputs;
    this.physics = deps?.physics;
    this.time = deps?.time;
  }

  get state(): ReplayState {
    return this._state;
  }

  get currentFrame(): number {
    return this.playhead;
  }

  get totalFrames(): number {
    return this.recording?.frames.length ?? 0;
  }

  // ── Recording ──────────────────────────────────────────────────────────

  /** Start recording input snapshots. Call once per real frame. */
  startRecording(): void {
    this._state = 'recording';
    this.recording = { fixedDt: this.time?.fixedDt ?? 1 / 60, frames: [] };
    this.frameSinceRecordingStart = 0;
    this.captureSnapshot(); // seed frame 0
  }

  /** Stop recording and return the recorded data. */
  stopRecording(): ReplayRecording | null {
    if (this._state !== 'recording') return null;
    this._state = 'idle';
    return this.recording;
  }

  /** Capture one frame of input. Should be called by the engine loop
   *  when state is 'recording'. */
  captureSnapshot(): void {
    if (this._state !== 'recording' || !this.recording) return;

    const curDelta = this.inputs.getMouseDelta();
    const curWheel = this.inputs.getWheelDelta();
    const mouseDeltaX = curDelta.x - this.prevMouseDeltaX;
    const mouseDeltaY = curDelta.y - this.prevMouseDeltaY;
    const wheelDelta = curWheel - this.prevWheelDelta;

    this.prevMouseDeltaX = curDelta.x;
    this.prevMouseDeltaY = curDelta.y;
    this.prevWheelDelta = curWheel;

    const snapshot: InputSnapshot = {
      keysDown: [...this.inputs.keysDownSet],
      keysPressed: [...this.inputs.keysPressedSet],
      mouseButtons: [...this.inputs.mouseButtonsSet],
      mouseDeltaX,
      mouseDeltaY,
      wheelDelta,
      mode: this.inputs.mode,
      timeOffset: this.frameSinceRecordingStart * (this.recording.fixedDt * 1000),
    };

    this.recording.frames.push(snapshot);
    this.frameSinceRecordingStart++;
  }

  // ── Playback ────────────────────────────────────────────────────────────

  /** Load a recording and enter play mode at frame 0. */
  loadRecording(rec: ReplayRecording): void {
    this.recording = rec;
    this.playhead = 0;
    this._state = 'paused';
  }

  /** Start playback from current position. */
  play(): void {
    if (!this.recording || this.playhead >= this.recording.frames.length) return;
    this._state = 'playing';
  }

  /** Pause playback. */
  pause(): void {
    if (this._state === 'playing') this._state = 'paused';
  }

  /** Stop playback and reset to frame 0. */
  stop(): void {
    this._state = 'idle';
    this.playhead = 0;
    this.onReplayEnd?.();
  }

  /** Advance playback by one frame (draws a full physics step). */
  stepForward(): boolean {
    if (!this.recording || this.playhead >= this.recording.frames.length) {
      this.stop();
      return false;
    }
    return this.applyFrame(this.playhead++);
  }

  /** Step backward one frame (rewind). */
  stepBackward(): boolean {
    if (this.playhead <= 0) return false;
    this.playhead--;
    return true;
  }

  /** Jump to a specific frame index. */
  seekToFrame(frame: number): void {
    if (!this.recording) return;
    this.playhead = Math.max(0, Math.min(frame, this.recording.frames.length - 1));
  }

  /** Advance playback by one frame (auto-called in 'playing' state). */
  tick(): void {
    if (this._state !== 'playing') return;
    if (!this.stepForward()) {
      this.stop();
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private applyFrame(index: number): boolean {
    const rec = this.recording;
    if (!rec || index >= rec.frames.length) return false;

    const snap = rec.frames[index];

    this.inputs.setReplayKeysDown(snap.keysDown);
    this.inputs.setReplayKeysPressed(snap.keysPressed);
    this.inputs.setReplayMouseButtons(snap.mouseButtons);
    this.inputs.setReplayMouseDelta(snap.mouseDeltaX, snap.mouseDeltaY);
    this.inputs.setReplayWheelDelta(snap.wheelDelta);

    if (snap.mode !== this.inputs.mode) {
      this.inputs.setMode(snap.mode);
    }

    this.onReplayFrame?.(index, snap);
    return true;
  }

  dispose(): void {
    this._state = 'idle';
    this.recording = null;
    this.playhead = 0;
  }
}

// Internal recording container (not exported to avoid confusion with the class).
interface InputReplayRecording {
  fixedDt: number;
  frames: InputSnapshot[];
}
