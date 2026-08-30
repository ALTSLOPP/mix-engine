import { describe, it, expect } from 'vitest';
import { createMockEngine } from './helpers/gameplayEngine';
import { TwoAxisCombatSystem } from '../src/features/gameplay/TwoAxisCombatSystem';
import { GameplayFeatureRegistry } from '../src/features/gameplay/GameplayFeatureRegistry';

describe('TwoAxisCombatSystem', () => {
  it('registers two_axis_combat in GameplayFeatureRegistry', () => {
    const desc = GameplayFeatureRegistry.get('two_axis_combat');
    expect(desc).toBeDefined();
    expect(desc?.category).toBe('combat');
    expect(desc?.name).toContain('Two-Axis');
  });

  it('manages 2-axis state (MovementMode x Action) and transitions', () => {
    const engine = createMockEngine() as any;
    const defaults = GameplayFeatureRegistry.getDefaults<any>('two_axis_combat');
    const combat = new TwoAxisCombatSystem(engine, defaults);

    const entityId = 1 as any;
    const state = combat.getState(entityId);
    expect(state.movementMode).toBe('grounded');
    expect(state.action).toBe('idle');

    // Switch movement mode to flight
    combat.setMovementMode(entityId, 'flight');
    expect(combat.getState(entityId).movementMode).toBe('flight');

    // Perform melee attack action
    const started = combat.requestAction(entityId, 'melee_string', { duration: 0.5 });
    expect(started).toBe(true);
    expect(combat.getState(entityId).action).toBe('melee_string');
    expect(combat.getState(entityId).phase).toBe('startup');

    // Advance to recovery cancel window
    combat.update(0.4); // 0.4 / 0.5 = 0.8 -> recovery phase
    expect(combat.getState(entityId).phase).toBe('recovery');
    expect(combat.getState(entityId).cancelWindowOpen).toBe(true);

    // Cancel into dodge dash
    const canceled = combat.requestAction(entityId, 'dash');
    expect(canceled).toBe(true);
    expect(combat.getState(entityId).action).toBe('dash');

    combat.dispose();
  });

  it('charges Ki and enforces Ki resource costs', () => {
    const engine = createMockEngine() as any;
    const defaults = GameplayFeatureRegistry.getDefaults<any>('two_axis_combat');
    const combat = new TwoAxisCombatSystem(engine, defaults);

    const entityId = 2 as any;
    const state = combat.getState(entityId);
    state.currentKi = 10;

    // Try to perform action requiring 50 Ki -> should fail
    const enoughKi = combat.requestAction(entityId, 'beam_channel', { kiCost: 50 });
    expect(enoughKi).toBe(false);

    // Charge Ki
    combat.startChargingKi(entityId);
    expect(combat.getState(entityId).isChargingKi).toBe(true);
    combat.update(1.5); // 1.5 * 35 Ki/s = +52.5 Ki
    expect(combat.getState(entityId).currentKi).toBeGreaterThan(60);

    combat.stopChargingKi(entityId);
    expect(combat.getState(entityId).action).toBe('idle');

    // Now fire beam with 50 Ki -> should succeed
    const beamFired = combat.requestAction(entityId, 'beam_channel', { kiCost: 50 });
    expect(beamFired).toBe(true);
    expect(combat.getState(entityId).currentKi).toBeLessThan(25);

    combat.dispose();
  });

  it('applies per-actor hit-stop freeze on impact', () => {
    const engine = createMockEngine() as any;
    const defaults = GameplayFeatureRegistry.getDefaults<any>('two_axis_combat');
    const combat = new TwoAxisCombatSystem(engine, defaults);

    const targetId = 10 as any;
    combat.triggerHitStop(targetId, 0.1);
    expect(combat.getState(targetId).hitStopTimer).toBe(0.1);

    combat.update(0.05);
    expect(combat.getState(targetId).hitStopTimer).toBeCloseTo(0.05, 3);

    combat.dispose();
  });
});
