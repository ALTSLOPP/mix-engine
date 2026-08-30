import { describe, it, expect } from 'vitest';
import { GoapAction } from '../src/ai/goap/GoapAction';
import { GoapPlanner } from '../src/ai/goap/GoapPlanner';
import { GoapAgent } from '../src/ai/goap/GoapAgent';

describe('Goal-Oriented Action Planning (GOAP) (S11)', () => {
  it('finds optimal multi-step action plan to achieve goals', () => {
    const actions = [
      new GoapAction({
        name: 'ScoutEnemy',
        cost: 1.0,
        preconditions: { hasTarget: false },
        effects: { hasTarget: true },
      }),
      new GoapAction({
        name: 'EquipWeapon',
        cost: 1.0,
        preconditions: { weaponDrawn: false },
        effects: { weaponDrawn: true },
      }),
      new GoapAction({
        name: 'AttackTarget',
        cost: 2.0,
        preconditions: { hasTarget: true, weaponDrawn: true },
        effects: { targetKilled: true },
      }),
    ];

    const startState = {
      hasTarget: false,
      weaponDrawn: false,
      targetKilled: false,
    };

    const goalState = {
      targetKilled: true,
    };

    const plan = GoapPlanner.plan(startState, goalState, actions);

    expect(plan).not.toBeNull();
    expect(plan!.length).toBe(3);
    expect(plan!.map((a) => a.name)).toContain('ScoutEnemy');
    expect(plan!.map((a) => a.name)).toContain('EquipWeapon');
    expect(plan![2].name).toBe('AttackTarget');
  });

  it('manages runtime agent state and plan execution with GoapAgent', () => {
    const agent = new GoapAgent();
    agent.setState('hasAmmo', false);
    agent.setState('inCover', false);
    agent.setState('targetAlive', true);

    agent.setGoal('targetAlive', false);

    agent.addAction(
      new GoapAction({
        name: 'Reload',
        cost: 1.0,
        preconditions: { hasAmmo: false },
        effects: { hasAmmo: true },
      }),
    );
    agent.addAction(
      new GoapAction({
        name: 'Shoot',
        cost: 1.0,
        preconditions: { hasAmmo: true },
        effects: { targetAlive: false },
      }),
    );

    const planned = agent.replan();
    expect(planned).toBe(true);
    expect(agent.getCurrentAction()?.name).toBe('Reload');

    // Complete Reload action
    agent.completeCurrentAction();
    expect(agent.worldState.hasAmmo).toBe(true);
    expect(agent.getCurrentAction()?.name).toBe('Shoot');

    // Complete Shoot action
    agent.completeCurrentAction();
    expect(agent.worldState.targetAlive).toBe(false);
    expect(agent.getCurrentAction()).toBeNull();
  });
});
