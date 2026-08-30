import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { SchemaRegistry } from '../../inspector/SchemaRegistry';
import { ValidatorRegistry } from '../../inspector/ValidatorRegistry';
import { SerializationEngine } from '../../inspector/SerializationEngine';

function resolveTargetEntity(ctx: CmdCtx, ref?: string | number): number | undefined {
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') return ctx.resolveEntity(ref);
  return ctx.getSelectedEntityId?.() ?? undefined;
}

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('inspect_schema_get', (cmd: Extract<AICommand, { type: 'inspect_schema_get' }>) => {
    const schema = SchemaRegistry.get(cmd.target);
    ctx.setQueryResult({ ok: Boolean(schema), target: cmd.target, schema });
  });

  map.set('inspect_schema_define', (cmd: Extract<AICommand, { type: 'inspect_schema_define' }>) => {
    try {
      const def = SchemaRegistry.define(cmd.target, cmd.schema);
      ctx.setQueryResult({ ok: true, target: cmd.target, schema: def });
    } catch (e) {
      ctx.setQueryResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  map.set('inspect_schema_patch', (cmd: Extract<AICommand, { type: 'inspect_schema_patch' }>) => {
    const patched = SchemaRegistry.patch(cmd.target, cmd.patch);
    ctx.setQueryResult({ ok: Boolean(patched), target: cmd.target, schema: patched });
  });

  map.set('inspect_property_get', (cmd: Extract<AICommand, { type: 'inspect_property_get' }>) => {
    const studio = ctx.inspectorStudio;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (studio && entityId !== undefined) {
      const bp = ctx.sceneManager.getBlueprint(entityId);
      const rb = ctx.sceneManager.getRigidBody(entityId);
      const targetObj = bp ?? rb;
      if (targetObj) {
        const tree = studio.getTree(targetObj);
        const val = tree.readValue(cmd.path);
        ctx.setQueryResult({ ok: true, entityId, path: cmd.path, value: val });
        return;
      }
    }
    ctx.setQueryResult({ ok: false, error: 'Entity or property not found' });
  });

  map.set('inspect_property_set', (cmd: Extract<AICommand, { type: 'inspect_property_set' }>) => {
    const studio = ctx.inspectorStudio;
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (studio && entityId !== undefined) {
      const bp = ctx.sceneManager.getBlueprint(entityId);
      const rb = ctx.sceneManager.getRigidBody(entityId);
      const targetObj = bp ?? rb;
      if (targetObj) {
        const tree = studio.getTree(targetObj);
        tree.writeValue(cmd.path, cmd.value);
        ctx.setQueryResult({ ok: true, entityId, path: cmd.path, value: cmd.value });
        return;
      }
    }
    ctx.setQueryResult({ ok: false, error: 'Entity not found' });
  });

  map.set('inspect_validate', (cmd: Extract<AICommand, { type: 'inspect_validate' }>) => {
    let target: any = null;
    if (cmd.entityId !== undefined) {
      const entityId = resolveTargetEntity(ctx, cmd.entityId);
      if (entityId !== undefined) {
        target = ctx.sceneManager.getBlueprint(entityId) ?? ctx.sceneManager.getRigidBody(entityId);
      }
    } else {
      // Scene or global validation
      target = ctx.sceneManager.gameState.getAll();
    }

    if (target) {
      const report = ValidatorRegistry.validateTarget(target, undefined, {
        dryRun: cmd.dryRun ?? true,
        autoFix: cmd.autoFix ?? false,
      });
      ctx.setQueryResult({ ok: true, report });
    } else {
      ctx.setQueryResult({ ok: false, error: 'Target not found for validation' });
    }
  });

  map.set('inspect_serialize', (cmd: Extract<AICommand, { type: 'inspect_serialize' }>) => {
    const entityId = resolveTargetEntity(ctx, cmd.entityId);
    if (entityId !== undefined) {
      const bp = ctx.sceneManager.getBlueprint(entityId);
      if (bp) {
        const json = SerializationEngine.serialize(bp);
        ctx.setQueryResult({ ok: true, entityId, json });
        return;
      }
    }
    ctx.setQueryResult({ ok: false, error: 'Entity blueprint not found' });
  });

  map.set('inspect_deserialize', (cmd: Extract<AICommand, { type: 'inspect_deserialize' }>) => {
    try {
      const data = SerializationEngine.deserialize(cmd.json);
      ctx.setQueryResult({ ok: true, data });
    } catch (e) {
      ctx.setQueryResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  map.set('inspect_diff', (cmd: Extract<AICommand, { type: 'inspect_diff' }>) => {
    const diffs = SerializationEngine.diff(cmd.a, cmd.b);
    ctx.setQueryResult({ ok: true, diffs });
  });
}
