import type { Engine } from '../../engine/Engine';

type Clock = Engine['timeDilation'];
const clocks = new WeakMap<Clock, { base: number; requests: Map<object, number> }>();

/** Independent owners may release slow motion in either order. */
export function setGameplaySlowMotion(clock: Clock, owner: object, scale: number | null): void {
  let state = clocks.get(clock);
  if (!state && scale === null) return;
  if (!state) {
    state = { base: clock.getGlobalBaseTimeScale?.() ?? clock.getGlobalTimeScale(), requests: new Map() };
    clocks.set(clock, state);
  }
  if (scale === null) state.requests.delete(owner);
  else state.requests.set(owner, scale);
  clock.setGlobalTimeScale(Math.min(state.base, ...state.requests.values()));
  if (state.requests.size === 0) clocks.delete(clock);
}
