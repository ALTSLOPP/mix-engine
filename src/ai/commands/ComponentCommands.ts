import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { ComponentRegistry } from '../../ecs/ComponentRegistry';
import { Component } from '../../ecs/Component';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('component_add', (cmd: Extract<AICommand, { type: 'component_add' }>) => {
    const compCtx = {
      sceneManager: ctx.sceneManager,
      physicsWorld: ctx.physicsWorld,
      events: ctx.sceneManager.events,
      audio: ctx.audio,
    };
    const comp = ComponentRegistry.create(cmd.component, cmd.entityId, compCtx, cmd.props);
    ctx.sceneManager.attachComponent(cmd.entityId, comp);
  });

  map.set('component_remove', (cmd: Extract<AICommand, { type: 'component_remove' }>) => {
    ctx.sceneManager.detachComponent(cmd.entityId, cmd.component);
  });

  map.set('component_set', (cmd: Extract<AICommand, { type: 'component_set' }>) => {
    const comp = ctx.sceneManager.getModularComponent<Component>(cmd.entityId, cmd.component);
    if (!comp) {
      console.warn(`[ComponentCommands] Entity ${cmd.entityId} has no component '${cmd.component}'`);
      return;
    }
    if (cmd.prop === 'enabled' && typeof cmd.value === 'boolean') {
      comp.enabled = cmd.value;
    } else if (cmd.prop in comp) {
      (comp as any)[cmd.prop] = cmd.value;
    }
  });

  map.set('component_get', (cmd: Extract<AICommand, { type: 'component_get' }>) => {
    const comp = ctx.sceneManager.getModularComponent<Component>(cmd.entityId, cmd.component);
    if (!comp) return null;
    return ComponentRegistry.serialize(comp);
  });

  map.set('components_list', (_cmd: Extract<AICommand, { type: 'components_list' }>) => {
    return ComponentRegistry.list();
  });
}
