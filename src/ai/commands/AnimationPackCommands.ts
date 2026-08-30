import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import { wireCombat } from '../../animation/CombatRigWiring';
import { buildRetargetProReport } from '../../animation/RetargetProReport';

function resolveTargets(ctx: CmdCtx, sel: 'all' | number | string | number[] = 'all') {
  const out: Array<import('../../animation/AnimationStateMachine').AnimationStateMachine> = [];
  if (sel === 'all') return [...(ctx.getAllAsm?.() ?? [])];
  const ids: number[] = typeof sel === 'number' ? [sel] : Array.isArray(sel) ? sel : [];
  if (typeof sel === 'string' && sel.startsWith('@')) { const id = ctx.resolveEntity(sel); if (id !== undefined) ids.push(id); }
  for (const id of ids) { const asm = ctx.findAsm?.(id); if (asm) out.push(asm); }
  return out;
}

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('import_animation_pack', (cmd: Extract<AICommand, { type: 'import_animation_pack' }>) => {
    const imp = ctx.animImporter;
    if (!imp) { console.warn('[AIBridge] import_animation_pack: AnimationImporter unavailable'); ctx.setQueryResult({ ok: false, error: 'AnimationImporter unavailable' }); return; }
    void ctx.trackAsync(
      imp.importPack({
        packId: cmd.packId,
        displayName: cmd.displayName,
        targetRig: cmd.targetRig,
        sourcePath: cmd.sourcePath,
        boneMappingOverride: cmd.boneMappingOverride,
        scaleOverride: cmd.scaleOverride,
        keepRootMotion: cmd.keepRootMotion,
        qualityPreset: cmd.qualityPreset,
        footLock: cmd.footLock,
      }).then(res => {
        ctx.setQueryResult(res);
        if (typeof fetch !== 'undefined') {
          fetch('/api/anim-packs/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packId: cmd.packId, res }) }).catch(() => {});
        }
        if (!res.ok) console.warn('[import_animation_pack] failed:', res.error, res.warnings);
        else console.log(`[import_animation_pack] pack '${cmd.packId}' → ${res.imported} clips`, res.warnings);
      }).catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.setQueryResult({ ok: false, error: msg });
        console.warn('[import_animation_pack] threw:', msg);
      })
    );
  });

  map.set('retarget_pro_report', (cmd: Extract<AICommand, { type: 'retarget_pro_report' }>) => {
    const reg = ctx.animRegistry;
    if (!reg) { ctx.setQueryResult({ ok: false, error: 'AnimationPackRegistry unavailable' }); return; }
    const packs = cmd.packId ? [reg.get(cmd.packId)].filter(Boolean) : reg.list();
    if (cmd.packId && packs.length === 0) { ctx.setQueryResult({ ok: false, error: `pack '${cmd.packId}' not found` }); return; }
    const reports = packs.map(p => buildRetargetProReport(p!.def, reg.packIssues.get(p!.def.id) ?? []));
    ctx.setQueryResult({ ok: true, reports });
  });

  map.set('retarget_pro_build', (cmd: Extract<AICommand, { type: 'retarget_pro_build' }>) => {
    const imp = ctx.animImporter, reg = ctx.animRegistry;
    if (!imp || !reg) { ctx.setQueryResult({ ok: false, error: 'Retarget Pro services unavailable' }); return; }
    void ctx.trackAsync(imp.importPack({
      packId: cmd.packId, targetRig: cmd.targetRig, sourcePath: cmd.sourcePath,
      displayName: cmd.displayName, qualityPreset: cmd.qualityPreset ?? 'aaa',
      keepRootMotion: cmd.keepRootMotion, boneMappingOverride: cmd.boneMappingOverride,
      scaleOverride: cmd.scaleOverride,
    }).then(imported => {
      if (!imported.ok || !imported.pack || !imported.report) { ctx.setQueryResult(imported); return; }
      if (cmd.strict && imported.report.readiness !== 'ready') {
        ctx.setQueryResult({ ...imported, ok: false, error: `strict quality gate rejected grade ${imported.report.grade}: ${imported.report.readiness}` });
        return;
      }
      const targets = resolveTargets(ctx, cmd.target ?? 'all');
      let applied = 0;
      if (cmd.autoApply !== false) for (const asm of targets) applied += reg.applyToStateMachine(cmd.packId, asm, { prefix: cmd.prefix });
      let combat: ReturnType<typeof wireCombat> | null = null;
      if (cmd.autoWireCombat !== false) combat = wireCombat(
        { pack: cmd.packId, auto: true, targetSelector: cmd.target as 'all'|number[]|undefined, prefix: cmd.prefix },
        { registry: reg, sceneManager: ctx.sceneManager, findAsmForEntity: id => ctx.findAsm?.(id) ?? null, allAsm: () => ctx.getAllAsm?.() ?? [], gizmoSelectedId: () => ctx.getSelectedEntityId?.() ?? null },
      );
      let previewed = false;
      if (cmd.previewEntry && targets[0]) {
        const clip = reg.getClip(cmd.packId, cmd.previewEntry);
        if (clip) { if (!targets[0].hasAnimation(cmd.previewEntry)) targets[0].addAnimation(cmd.previewEntry, clip); targets[0].transition(cmd.previewEntry, .2); previewed = true; }
      }
      ctx.setQueryResult({ ...imported, workflow: { applied, targets: targets.length, combat, previewed } });
    }).catch(err => ctx.setQueryResult({ ok: false, error: err instanceof Error ? err.message : String(err) })));
  });

  map.set('anim_pack_list', (_cmd: Extract<AICommand, { type: 'anim_pack_list' }>) => {
    const reg = ctx.animRegistry;
    if (!reg) { ctx.setQueryResult({ packs: [] }); return; }
    ctx.setQueryResult(reg.toJSON());
    if (typeof fetch !== 'undefined') {
      fetch('/api/scene-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reg.toJSON()) }).catch(() => {});
    }
  });

  map.set('anim_pack_remove', (cmd: Extract<AICommand, { type: 'anim_pack_remove' }>) => {
    const reg = ctx.animRegistry;
    if (!reg) return;
    const ok = reg.remove(cmd.packId);
    ctx.setQueryResult({ ok, packId: cmd.packId });
  });

  map.set('anim_pack_apply', (cmd: Extract<AICommand, { type: 'anim_pack_apply' }>) => {
    const reg = ctx.animRegistry;
    if (!reg) { ctx.setQueryResult({ ok: false, error: 'AnimationPackRegistry unavailable' }); return; }
    const pack = reg.get(cmd.packId);
    if (!pack) { ctx.setQueryResult({ ok: false, error: `pack '${cmd.packId}' not found` }); return; }
    const sel = cmd.target ?? 'all';
    const asms: Array<{ addAnimation: (n: string, c: import('three').AnimationClip) => void; hasAnimation?: (s: string) => boolean }> = [];
    if (sel === 'all') {
      for (const asm of ctx.getAllAsm?.() ?? []) asms.push(asm as unknown as typeof asms[number]);
    } else if (typeof sel === 'number') {
      const asm = ctx.findAsm?.(sel);
      if (asm) asms.push(asm as unknown as typeof asms[number]);
    } else if (typeof sel === 'string' && sel.startsWith('@')) {
      const id = ctx.resolveEntity(sel);
      if (id !== undefined) { const asm = ctx.findAsm?.(id); if (asm) asms.push(asm as unknown as typeof asms[number]); }
    } else if (Array.isArray(sel)) {
      for (const id of sel) { const asm = ctx.findAsm?.(id); if (asm) asms.push(asm as unknown as typeof asms[number]); }
    }
    if (asms.length === 0) { ctx.setQueryResult({ ok: false, error: 'no target AnimationStateMachines found (spawn a character first, or pass a valid target)' }); return; }
    let applied = 0;
    for (const asm of asms) applied += reg.applyToStateMachine(cmd.packId, asm as unknown as { addAnimation: (n:string,c:import('three').AnimationClip)=>void }, { prefix: cmd.prefix });
    ctx.setQueryResult({ ok: true, packId: cmd.packId, applied, targets: asms.length });
  });

  map.set('anim_pack_wire_combat', (cmd: Extract<AICommand, { type: 'anim_pack_wire_combat' }>) => {
    const reg = ctx.animRegistry;
    if (!reg) { ctx.setQueryResult({ ok: false, error: 'AnimationPackRegistry unavailable' }); return; }
    const res = wireCombat(
      { pack: cmd.packId, mapping: cmd.mapping, auto: cmd.auto, targetSelector: cmd.target as unknown as 'all' | 'selection' | number[] | undefined, prefix: cmd.prefix },
      {
        registry: reg,
        sceneManager: ctx.sceneManager,
        findAsmForEntity: (id: number) => ctx.findAsm?.(id) ?? null,
        allAsm: () => (ctx.getAllAsm?.() ?? []) as unknown as Iterable<import('../../animation/AnimationStateMachine').AnimationStateMachine>,
        gizmoSelectedId: () => ctx.getSelectedEntityId?.() ?? null,
      },
    );
    ctx.setQueryResult(res);
    if (!res.ok) console.warn('[anim_pack_wire_combat]', res.error, res.warnings);
  });

  map.set('anim_pack_preview', (cmd: Extract<AICommand, { type: 'anim_pack_preview' }>) => {
    const reg = ctx.animRegistry;
    if (!reg) { ctx.setQueryResult({ ok: false, error: 'AnimationPackRegistry unavailable' }); return; }
    const clip = reg.getClip(cmd.packId, cmd.entryId);
    if (!clip) { ctx.setQueryResult({ ok: false, error: `clip '${cmd.entryId}' not in pack '${cmd.packId}'` }); return; }
    let targetId: number | null = null;
    if (typeof cmd.entityId === 'number') targetId = cmd.entityId;
    else targetId = ctx.getSelectedEntityId?.() ?? null;
    if (targetId === null) { ctx.setQueryResult({ ok: false, error: 'no target entity — select a character or pass entityId' }); return; }
    const asm = ctx.findAsm?.(targetId);
    if (!asm) { ctx.setQueryResult({ ok: false, error: `entity ${targetId} has no AnimationStateMachine` }); return; }
    const stateName = cmd.entryId;
    if (!asm.hasAnimation(stateName)) {
      const loop = reg.get(cmd.packId)?.def.entries.find(e => e.id === cmd.entryId)?.loop ?? true;
      asm.addAnimation(stateName, clip, { loop });
    }
    asm.transition(stateName, cmd.fade ?? 0.25);
    ctx.setQueryResult({ ok: true, entityId: targetId, state: stateName });
  });
}
