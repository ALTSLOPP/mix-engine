/**
 * Time.ts — Fixed Timestep Accumulator
 *
 * A dependency-free leaf. The physics world is ALWAYS stepped with FIXED_DT, never
 * a variable dt. `computeAlpha()` returns a `keepRatio` so the caller (Engine) can
 * scale pending root motion when unrecoverable debt is dropped — Time itself never
 * reaches into the SceneManager.
 */
export class Time {
  static readonly FIXED_DT = 1 / 60;
  static readonly MAX_SUBSTEPS = 5;
  static readonly MAX_FRAME_TIME = 0.25;

  /** Seconds of unsimulated time waiting to be consumed by fixed steps. */
  private accumulator = 0;
  /** Last frame's clamped wall-clock delta, in seconds. */
  private _dt = 0;
  /** Last frame's clamped wall-clock delta before global time scaling. */
  private _wallClockDt = 0;
  /** Interpolation factor in [0,1] between the previous and current physics state. */
  private _alpha = 0;
  /** Total elapsed (clamped) seconds since start. */
  private _elapsed = 0;
  /** Fixed substeps already taken this frame. */
  private _stepsThisFrame = 0;
  /** Consecutive frames the simulation has saturated MAX_SUBSTEPS and dropped debt. */
  private saturationStreak = 0;
  /** Wall-clock timestamp (ms) of the previous update, or null before the first. */
  private last: number | null = null;
  /** Global time scale: 1 = real-time, 0.25 = quarter-speed (bullet-time), 2 = double. */
  private _timeScale = 1;
  /** Clamp so a stray negative / enormous scale doesn't break the loop. Zero is a true pause. */
  private static readonly MIN_SCALE = 0;
  private static readonly MAX_SCALE = 4;

  /** Called once at the top of every rAF frame. */
  update(timestamp: number): void {
    if (this.last === null) this.last = timestamp;
    const raw = Math.max(0, (timestamp - this.last) / 1000);
    this._wallClockDt = Math.min(Math.max(0, raw), Time.MAX_FRAME_TIME);
    // Lower clamp blocks negative dt (clock skew / tab restore); upper clamp bounds debt.
    // Apply the global time scale so `engine.setTimeScale(0.25)` slows EVERYTHING
    // (physics, animation, VFX, AI) without per-system plumbing.
    const scaled = raw * this._timeScale;
    this._dt = Math.min(Math.max(0, scaled), Time.MAX_FRAME_TIME);
    this.accumulator += this._dt;
    this._elapsed += this._dt;
    this._stepsThisFrame = 0;
    // Never move the baseline backwards: otherwise a single skewed timestamp is
    // counted again as a large positive delta on the following frame.
    if (timestamp >= this.last) this.last = timestamp;
  }

  /** True while another fixed substep is owed AND we are under the per-frame cap. */
  shouldStepPhysics(): boolean {
    return this.accumulator >= Time.FIXED_DT && this._stepsThisFrame < Time.MAX_SUBSTEPS;
  }

  /** Account for one consumed fixed substep. */
  consumeFixedStep(): void {
    this.accumulator -= Time.FIXED_DT;
    this._stepsThisFrame += 1;
  }

  /**
   * Finalize the frame's interpolation factor. Returns the kept-time ratio:
   *   - 1   when no debt was dropped.
   *   - <1  when MAX_SUBSTEPS saturated and leftover debt was discarded; the caller
   *         scales pending root motion by this ratio so pose and physics dilate together.
   */
  computeAlpha(): number {
    let keepRatio = 1;

    if (this._stepsThisFrame === Time.MAX_SUBSTEPS && this.accumulator >= Time.FIXED_DT) {
      const remainder = this.accumulator % Time.FIXED_DT;
      // accumulator >= FIXED_DT > 0 here, so this division is always safe.
      keepRatio = remainder / this.accumulator;
      this.accumulator = remainder; // drop unrecoverable debt — no spiral of death.
      if (++this.saturationStreak === 30) {
        console.warn('[Time] Physics cannot keep up — simulation is in slow motion.');
      }
    } else {
      this.saturationStreak = 0;
    }

    this._alpha = Math.min(Math.max(this.accumulator / Time.FIXED_DT, 0), 1);
    return keepRatio;
  }

  get dt(): number {
    return this._dt;
  }
  /** Real elapsed frame time, independent of the gameplay time scale. */
  get wallClockDt(): number {
    return this._wallClockDt;
  }
  get fixedDt(): number {
    return Time.FIXED_DT;
  }
  get alpha(): number {
    return this._alpha;
  }
  get elapsed(): number {
    return this._elapsed;
  }
  get stepsThisFrame(): number {
    return this._stepsThisFrame;
  }
  /** Current global time scale (1 = real-time). */
  get timeScale(): number {
    return this._timeScale;
  }
  /** Set the global time scale (1 = real-time, 0.25 = bullet-time, 2 = fast-forward). */
  setTimeScale(scale: number): void {
    this._timeScale = Math.max(Time.MIN_SCALE, Math.min(Time.MAX_SCALE, scale));
  }
}
