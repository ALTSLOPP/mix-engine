import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { GoapPlanner, GoapAction, type GoapActionDef } from '../goap';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('goap_plan', (cmd: Extract<AICommand, { type: 'goap_plan' }>) => {
    const actions = cmd.actions.map((a: GoapActionDef) => new GoapAction(a));
    const plan = GoapPlanner.plan(cmd.startState, cmd.goalState, actions);
    return {
      success: plan !== null,
      plan: plan ? plan.map((a) => a.name) : [],
    };
  });

  map.set('timeline_create', (cmd: Extract<AICommand, { type: 'timeline_create' }>) => {
    const sequencer = (ctx as any).timelineSequencer;
    if (!sequencer) return false;
    sequencer.addTimeline({
      id: cmd.id,
      duration: cmd.duration,
      loop: cmd.loop,
      tracks: cmd.tracks,
    });
    return true;
  });

  map.set('timeline_play', (cmd: Extract<AICommand, { type: 'timeline_play' }>) => {
    const sequencer = (ctx as any).timelineSequencer;
    return sequencer ? sequencer.play(cmd.id, cmd.loop) : false;
  });

  map.set('timeline_scrub', (cmd: Extract<AICommand, { type: 'timeline_scrub' }>) => {
    const sequencer = (ctx as any).timelineSequencer;
    if (sequencer) {
      sequencer.scrub(cmd.id, cmd.time);
      return true;
    }
    return false;
  });

  map.set('timeline_stop', (cmd: Extract<AICommand, { type: 'timeline_stop' }>) => {
    const sequencer = (ctx as any).timelineSequencer;
    if (sequencer) {
      sequencer.stop(cmd.id);
      return true;
    }
    return false;
  });
}
