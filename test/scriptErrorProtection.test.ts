import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ScriptComponent } from '../src/ecs/ScriptComponent';
import { EventBus } from '../src/ecs/EventBus';
import { PersistentGameState } from '../src/ecs/PersistentGameState';

describe('ScriptComponent Error Boundaries & Circuit Breaker', () => {
  it('catches runtime errors and disables the script after 5 consecutive failures', () => {
    const events = new EventBus();
    const gameState = new PersistentGameState();

    const mockSceneManager: any = {
      events,
      gameState,
      debugDraw: null,
      hud: null,
      getRigidBody: () => null,
    };

    let errorEventsCount = 0;
    let disabledEventsCount = 0;

    events.on('script_error', () => {
      errorEventsCount++;
    });

    events.on('script_disabled', () => {
      disabledEventsCount++;
    });

    // Script with intentional runtime error
    const brokenScript = new ScriptComponent(
      100,
      mockSceneManager,
      `
        const obj = null;
        obj.nonExistentMethod();
      `
    );

    // Tick 4 times -> errors caught, not yet circuit-broken
    for (let i = 0; i < 4; i++) {
      brokenScript.update(0.016);
    }
    expect(errorEventsCount).toBe(4);
    expect(disabledEventsCount).toBe(0);

    // 5th tick -> trips circuit breaker
    brokenScript.update(0.016);
    expect(errorEventsCount).toBe(5);
    expect(disabledEventsCount).toBe(1);

    // 6th tick -> circuit is open, no more executions or error spam
    brokenScript.update(0.016);
    expect(errorEventsCount).toBe(5);
  });

  it('resets circuit breaker and resumes execution when source is updated', () => {
    const events = new EventBus();
    const gameState = new PersistentGameState();

    const mockSceneManager: any = {
      events,
      gameState,
      debugDraw: null,
      hud: null,
      getRigidBody: () => null,
    };

    const script = new ScriptComponent(
      101,
      mockSceneManager,
      `throw new Error('Fatal failure');`
    );

    // Trip circuit breaker
    for (let i = 0; i < 6; i++) {
      script.update(0.016);
    }

    let runs = 0;
    // Hot swap with fixed source code
    script.sourceCode = `api.self.runs = (api.self.runs || 0) + 1;`;
    (script as any).compile();

    script.update(0.016);
    expect(script.api.self.runs).toBe(1);
  });
});
