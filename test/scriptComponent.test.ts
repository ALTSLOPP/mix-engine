import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptComponent } from '../src/ecs/ScriptComponent';
import { PersistentGameState } from '../src/ecs/PersistentGameState';
import { EventBus } from '../src/ecs/EventBus';
import type { SceneManager, EntityId } from '../src/ecs/SceneManager';

/**
 * Live state-preserved script hot-reloading. Verifies that swapping a script's
 * source mid-run preserves the entity's per-script variables (`api.self`), that a
 * syntax error never kills the running (last-good) script, and that the one-shot
 * `reloaded` / `firstRun` lifecycle flags fire exactly once.
 *
 * ScriptComponent only needs a few SceneManager surfaces, so a minimal stand-in
 * (real PersistentGameState + EventBus, no rigid bodies) exercises the real code
 * paths without booting Rapier.
 */
const EID = 7 as EntityId;

function makeSceneManager(gameState = new PersistentGameState()): SceneManager {
  return {
    gameState,
    events: new EventBus(),
    debugDraw: undefined,
    hud: undefined,
    getRigidBody: () => undefined,
    rigidBodyList: [],
  } as unknown as SceneManager;
}

describe('ScriptComponent hot-reload', () => {
  let sm: SceneManager;
  beforeEach(() => { sm = makeSceneManager(); });

  it('preserves api.self variables across a hot-swap', () => {
    // v1 bumps self.n by 1 each tick and mirrors it to the observable store.
    const v1 = `api.self.n = (api.self.n || 0) + 1; api.state.setItem('observed', api.self.n);`;
    const sc = new ScriptComponent(EID, sm, v1);
    sc.update(0.016);
    sc.update(0.016);
    expect(sm.gameState.getItem('observed')).toBe(2);

    // Hot-swap to v2 (bumps by 10). self.n must carry over, NOT reset to 0.
    const res = sc.setSource(`api.self.n = (api.self.n || 0) + 10; api.state.setItem('observed', api.self.n);`);
    expect(res.ok).toBe(true);
    sc.update(0.016);
    expect(sm.gameState.getItem('observed')).toBe(12);
  });

  it('keeps the last-good script running when a hot-swap fails to compile', () => {
    const good = `api.state.setItem('tick', (api.state.getItem('tick') || 0) + 1);`;
    const sc = new ScriptComponent(EID, sm, good);
    sc.update(0.016);
    sc.update(0.016);
    expect(sm.gameState.getItem('tick')).toBe(2);

    // A syntax error must be rejected without disturbing the running function.
    const res = sc.setSource('this is ++ not valid javascript {');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(sc.compileError).toBeTruthy();

    // The previous (good) body still ticks.
    sc.update(0.016);
    expect(sm.gameState.getItem('tick')).toBe(3);
  });

  it('fires firstRun once on attach and reloaded once after a swap', () => {
    const probe = `api.state.setItem('firstRun', api.firstRun); api.state.setItem('reloaded', api.reloaded);`;
    const sc = new ScriptComponent(EID, sm, probe);

    sc.update(0.016);
    expect(sm.gameState.getItem('firstRun')).toBe(true);
    expect(sm.gameState.getItem('reloaded')).toBe(false);

    sc.update(0.016);
    expect(sm.gameState.getItem('firstRun')).toBe(false);
    expect(sm.gameState.getItem('reloaded')).toBe(false);

    expect(sc.setSource(probe).ok).toBe(true);
    sc.update(0.016);
    // A reload is NOT a first run: reloaded true, firstRun false.
    expect(sm.gameState.getItem('reloaded')).toBe(true);
    expect(sm.gameState.getItem('firstRun')).toBe(false);

    sc.update(0.016);
    expect(sm.gameState.getItem('reloaded')).toBe(false);
  });

  it('rehydrates api.self from PersistentGameState after a full reload', () => {
    const shared = new PersistentGameState();
    const sm1 = makeSceneManager(shared);
    const sc1 = new ScriptComponent(EID, sm1, `api.self.n = (api.self.n || 0) + 5;`);
    sc1.update(0.016);
    sc1.dispose(); // flushes self → gameState

    // Simulate a page reload: a fresh component, same entity id + same store.
    const sm2 = makeSceneManager(shared);
    const sc2 = new ScriptComponent(EID, sm2, `api.state.setItem('observed', api.self.n);`);
    sc2.update(0.016);
    expect(sm2.gameState.getItem('observed')).toBe(5);
  });
});
