import { describe, it, expect } from 'vitest';
import { Blackboard } from '../src/ai/Blackboard';
import {
  BehaviorTree,
  SequenceNode,
  SelectorNode,
  ParallelNode,
  InverterNode,
  CooldownNode,
  ActionNode,
  ConditionNode,
} from '../src/ai/BehaviorTree';

describe('BehaviorTree & Blackboard AI Framework', () => {
  it('manages blackboard memory and handles sensory TTL expiration', () => {
    const bb = new Blackboard();
    bb.set('targetEntity', 42);
    expect(bb.get('targetEntity')).toBe(42);

    bb.setWithTTL('lastSeenPlayerPos', { x: 10, y: 0, z: 5 }, 1.0); // 1.0s TTL
    expect(bb.has('lastSeenPlayerPos')).toBe(true);

    // Update with 0.5s -> still valid
    bb.update(0.5);
    expect(bb.has('lastSeenPlayerPos')).toBe(true);

    // Update with another 0.6s (total 1.1s) -> expired and auto-deleted
    bb.update(0.6);
    expect(bb.has('lastSeenPlayerPos')).toBe(false);
    expect(bb.get('targetEntity')).toBe(42); // permanent remains
  });

  it('evaluates Sequence and Selector composite node logic correctly', () => {
    const bb = new Blackboard();

    // Sequence (AND): all must succeed
    let step1Ran = false;
    let step2Ran = false;

    const seq = new SequenceNode([
      new ActionNode(() => {
        step1Ran = true;
        return 'SUCCESS';
      }),
      new ActionNode(() => {
        step2Ran = true;
        return 'SUCCESS';
      }),
    ]);

    const seqResult = seq.tick(bb, 0.016);
    expect(seqResult).toBe('SUCCESS');
    expect(step1Ran).toBe(true);
    expect(step2Ran).toBe(true);

    // Selector (OR): first success stops evaluation
    let fallbackRan = false;
    const sel = new SelectorNode([
      new ConditionNode(() => false), // fails
      new ActionNode(() => 'SUCCESS'), // succeeds
      new ActionNode(() => {
        fallbackRan = true;
        return 'SUCCESS';
      }),
    ]);

    const selResult = sel.tick(bb, 0.016);
    expect(selResult).toBe('SUCCESS');
    expect(fallbackRan).toBe(false);
  });

  it('inverts status with Inverter and throttles with Cooldown', () => {
    const bb = new Blackboard();

    const inverter = new InverterNode(new ConditionNode(() => true));
    expect(inverter.tick(bb, 0.016)).toBe('FAILURE');

    let actionExecCount = 0;
    const cooldown = new CooldownNode(
      new ActionNode(() => {
        actionExecCount++;
        return 'SUCCESS';
      }),
      1.0, // 1 second cooldown
    );

    expect(cooldown.tick(bb, 0.016)).toBe('SUCCESS');
    expect(actionExecCount).toBe(1);

    // Immediate second tick -> throttled
    expect(cooldown.tick(bb, 0.1)).toBe('FAILURE');
    expect(actionExecCount).toBe(1);

    // After 1.0s elapsed -> executes again
    expect(cooldown.tick(bb, 1.0)).toBe('SUCCESS');
    expect(actionExecCount).toBe(2);
  });
});
