import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';

/**
 * GameplayCommands — the text-first surface for the declarative gameplay-logic layer
 * ({@link GameplayDirector}). An LLM authors a whole game's rules/quests/zones/timers as
 * one `gameplay_load` payload, then drives + introspects it with the smaller verbs.
 *
 * All of these no-op (with a warning) if the gameplay system wasn't injected, matching
 * the rest of the optional-subsystem command modules.
 */
export function register(map: CommandMap, ctx: CmdCtx): void {
  const warnMissing = (cmd: string) =>
    console.warn(`[AIBridge] ${cmd}: gameplay system unavailable (no GameplayDirector wired).`);

  map.set('gameplay_load', (cmd: Extract<AICommand, { type: 'gameplay_load' }>) => {
    if (!ctx.gameplay) return warnMissing('gameplay_load');
    ctx.gameplay.load(cmd.def);
    ctx.setQueryResult(ctx.gameplay.getStatus());
  });

  map.set('gameplay_reset', () => {
    if (!ctx.gameplay) return warnMissing('gameplay_reset');
    ctx.gameplay.reset();
  });

  map.set('gameplay_status', () => {
    if (!ctx.gameplay) return warnMissing('gameplay_status');
    ctx.setQueryResult(ctx.gameplay.getStatus());
  });

  map.set('gameplay_set_var', (cmd: Extract<AICommand, { type: 'gameplay_set_var' }>) => {
    if (!ctx.gameplay) return warnMissing('gameplay_set_var');
    ctx.gameplay.setVar(cmd.key, cmd.value);
  });

  map.set('gameplay_signal', (cmd: Extract<AICommand, { type: 'gameplay_signal' }>) => {
    if (!ctx.gameplay) return warnMissing('gameplay_signal');
    ctx.gameplay.signal(cmd.name, cmd.data);
  });

  map.set('gameplay_start_quest', (cmd: Extract<AICommand, { type: 'gameplay_start_quest' }>) => {
    if (!ctx.gameplay) return warnMissing('gameplay_start_quest');
    ctx.gameplay.startQuest(cmd.quest);
  });

  map.set('gameplay_advance', (cmd: Extract<AICommand, { type: 'gameplay_advance' }>) => {
    if (!ctx.gameplay) return warnMissing('gameplay_advance');
    ctx.gameplay.advanceObjective(cmd.quest, cmd.objective, cmd.by);
  });

  map.set('gameplay_complete_quest', (cmd: Extract<AICommand, { type: 'gameplay_complete_quest' }>) => {
    if (!ctx.gameplay) return warnMissing('gameplay_complete_quest');
    ctx.gameplay.completeQuest(cmd.quest);
  });

  map.set('gameplay_fail_quest', (cmd: Extract<AICommand, { type: 'gameplay_fail_quest' }>) => {
    if (!ctx.gameplay) return warnMissing('gameplay_fail_quest');
    ctx.gameplay.failQuest(cmd.quest);
  });

  map.set('gameplay_dialogue_start', (cmd: Extract<AICommand, { type: 'gameplay_dialogue_start' }>) => {
    if (!ctx.gameplay) return warnMissing('gameplay_dialogue_start');
    ctx.gameplay.startDialogue(cmd.id);
  });

  map.set('gameplay_dialogue_choose', (cmd: Extract<AICommand, { type: 'gameplay_dialogue_choose' }>) => {
    if (!ctx.gameplay) return warnMissing('gameplay_dialogue_choose');
    ctx.gameplay.chooseDialogue(cmd.index);
  });
}
