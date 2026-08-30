/**
 * AnimNotifies — Frame-accurate animation event tracks and timeline notifications.
 *
 * Dispatches events at precise normalized animation times (0..1) for hitboxes, audio, and VFX.
 */

export interface AnimNotify {
  id: string;
  state: string; // e.g. 'punch_heavy', 'flight_dash'
  normalizedTime: number; // 0.0 to 1.0
  event: string; // e.g. 'hitbox_on', 'hitbox_off', 'spawn_aura'
  payload?: Record<string, unknown>;
}

export class AnimNotifyManager {
  private readonly stateNotifies = new Map<string, AnimNotify[]>();
  private readonly idMap = new Map<string, AnimNotify>();

  /**
   * Adds an animation notify event to a state timeline.
   */
  addNotify(notify: AnimNotify): void {
    if (!notify.id.trim() || !notify.state.trim() || !notify.event.trim()) {
      throw new Error('Animation notify id, state, and event must be non-empty.');
    }
    if (!Number.isFinite(notify.normalizedTime) || notify.normalizedTime < 0 || notify.normalizedTime > 1) {
      throw new RangeError('Animation notify normalizedTime must be finite and within [0, 1].');
    }
    this.removeNotify(notify.id);

    let list = this.stateNotifies.get(notify.state);
    if (!list) {
      list = [];
      this.stateNotifies.set(notify.state, list);
    }

    list.push(notify);
    // Keep list sorted by normalized timestamp
    list.sort((a, b) => a.normalizedTime - b.normalizedTime);
    this.idMap.set(notify.id, notify);
  }

  /**
   * Removes an animation notify by ID.
   */
  removeNotify(id: string): boolean {
    const notify = this.idMap.get(id);
    if (!notify) return false;

    this.idMap.delete(id);
    const list = this.stateNotifies.get(notify.state);
    if (list) {
      const idx = list.findIndex((n) => n.id === id);
      if (idx !== -1) list.splice(idx, 1);
      if (list.length === 0) this.stateNotifies.delete(notify.state);
    }
    return true;
  }

  /**
   * Gets all notifies registered on a specific animation state.
   */
  getNotifies(state: string): readonly AnimNotify[] {
    return this.stateNotifies.get(state) ?? [];
  }

  /**
   * Evaluates timeline advancement from prevTime to currTime and fires triggered notifies.
   */
  checkNotifies(
    state: string,
    prevNormTime: number,
    currNormTime: number,
    onTrigger: (notify: AnimNotify) => void
  ): void {
    const list = this.stateNotifies.get(state);
    if (!list || list.length === 0) return;

    for (const notify of list) {
      const targetTime = notify.normalizedTime;

      // Standard non-looping progression
      if (prevNormTime <= currNormTime) {
        if (targetTime > prevNormTime && targetTime <= currNormTime) {
          onTrigger(notify);
        }
      } else {
        // Looping wrap-around (e.g. 0.95 -> 0.1)
        if (targetTime > prevNormTime || targetTime <= currNormTime) {
          onTrigger(notify);
        }
      }
    }
  }

  /**
   * Convenience helper to add a notify using frame numbers rather than normalized decimals.
   */
  addNotifyAtFrame(
    id: string,
    state: string,
    frame: number,
    totalFrames: number,
    event: string,
    payload?: Record<string, unknown>
  ): void {
    const normalizedTime = Math.max(0, Math.min(1, frame / Math.max(1, totalFrames)));
    this.addNotify({
      id,
      state,
      normalizedTime,
      event,
      payload,
    });
  }

  /**
   * Clears all registered notifies.
   */
  clear(): void {
    this.stateNotifies.clear();
    this.idMap.clear();
  }
}
