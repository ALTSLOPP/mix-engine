import type { AnimationPackRegistry } from './AnimationPackRegistry';
import type { SceneManager } from '../ecs/SceneManager';
import type { AnimationStateMachine } from './AnimationStateMachine';

export type CombatSlot =
  | 'idle' | 'walk' | 'run' | 'jump'
  | 'lightAttack' | 'heavyAttack' | 'special'
  | 'block' | 'hit' | 'death';

export interface WireCombatOptions {
  pack: string;
  mapping?: Partial<Record<CombatSlot, string>>;
  auto?: boolean;
  targetSelector?: 'all' | 'selection' | number[];
  prefix?: string;
  fade?: number;
}

export interface WireCombatResult {
  ok: boolean;
  wired: Array<{ slot: CombatSlot; entryId: string; stateName: string }>;
  warnings: string[];
  error?: string;
}

const AUTO_SLOT_HINTS: Array<[RegExp, CombatSlot]> = [
  [/idle|stand/i, 'idle'],
  [/walk/i, 'walk'],
  [/run/i, 'run'],
  [/jump/i, 'jump'],
  [/heavy|power|charge|special|slam|throw|takedown|overhead/i, 'heavyAttack'],
  [/light.*attack|slash|punch|jab|quick|kick|elbow|knee|sweep|thrust|roundhouse|teep|axe|heel/i, 'lightAttack'],
  [/attack|slash|strike|combo|sequence/i, 'lightAttack'],
  [/spell|special|ultimate/i, 'special'],
  [/block|parry|guard/i, 'block'],
  [/hit|hurt|flinch|damage/i, 'hit'],
  [/die|death|dead|fall/i, 'death'],
];

function autoPickForSlot(slot: CombatSlot, entries: Array<{ id: string; category: string; displayName: string }>): string | null {
  const byCat: Record<string, CombatSlot> = { idle: 'idle', locomotion: 'walk', combat: 'lightAttack', hit_reaction: 'hit', death: 'death' };
  for (const e of entries) if (byCat[e.category] === slot) return e.id;
  for (const [re, s] of AUTO_SLOT_HINTS) if (s === slot) {
    for (const e of entries) if (re.test(e.id) || re.test(e.displayName)) return e.id;
  }
  return null;
}

export function wireCombat(
  opts: WireCombatOptions,
  deps: {
    registry: AnimationPackRegistry;
    sceneManager: SceneManager;
    findAsmForEntity: (id: number) => AnimationStateMachine | null;
    allAsm: () => Iterable<AnimationStateMachine>;
    gizmoSelectedId?: () => number | null;
  },
): WireCombatResult {
  const warnings: string[] = [];
  const pack = deps.registry.get(opts.pack);
  if (!pack) return { ok: false, wired: [], warnings, error: `pack '${opts.pack}' not found` };

  const entries = pack.def.entries;
  const slotToEntry = new Map<CombatSlot, string>();
  if (opts.mapping) for (const [slot, entryId] of Object.entries(opts.mapping) as Array<[CombatSlot, string]>) {
    if (!pack.clips.has(entryId)) warnings.push(`[wire] entry '${entryId}' not in pack '${opts.pack}' — slot '${slot}' skipped`);
    else slotToEntry.set(slot, entryId);
  }
  if (opts.auto || (!opts.mapping || Object.keys(opts.mapping).length === 0)) {
    const enriched = entries.map(e => ({ id: e.id, category: e.category, displayName: e.displayName }));
    const slots: CombatSlot[] = ['idle', 'walk', 'run', 'lightAttack', 'heavyAttack', 'special', 'block', 'hit', 'death'];
    for (const slot of slots) if (!slotToEntry.has(slot)) {
      const picked = autoPickForSlot(slot, enriched);
      if (picked) slotToEntry.set(slot, picked);
    }
    if (slotToEntry.size === 0) warnings.push('[wire] auto-map found nothing — supply an explicit mapping');
  }

  let asms: AnimationStateMachine[] = [];
  const sel = opts.targetSelector ?? 'all';
  if (sel === 'all') asms = [...deps.allAsm()];
  else if (sel === 'selection') {
    const sid = deps.gizmoSelectedId?.() ?? null;
    if (sid === null) return { ok: false, wired: [], warnings: [...warnings, 'no selection to wire to'], error: 'select a character first or use targetSelector:"all"' };
    const asm = deps.findAsmForEntity(sid);
    if (!asm) return { ok: false, wired: [], warnings, error: `selected entity ${sid} has no AnimationStateMachine` };
    asms = [asm];
  } else if (Array.isArray(sel)) {
    for (const id of sel) { const a = deps.findAsmForEntity(id); if (a) asms.push(a); else warnings.push(`[wire] entity ${id} has no ASM — skipped`); }
  }

  if (asms.length === 0) return { ok: false, wired: [], warnings: [...warnings, 'no target AnimationStateMachines found (spawn a character first?)'], error: 'no targets' };

  const wired: Array<{ slot: CombatSlot; entryId: string; stateName: string }> = [];
  // entry id → loop flag (one-shot combat slots like attacks/death must not loop).
  const loopById = new Map(entries.map(e => [e.id, e.loop]));
  for (const [slot, entryId] of slotToEntry) {
    const clip = pack.clips.get(entryId);
    if (!clip) continue;
    const stateName = opts.prefix ? `${opts.prefix}/${slot}` : slot;
    const loop = loopById.get(entryId) ?? true;
    for (const asm of asms) asm.addAnimation(stateName, clip, { loop });
    wired.push({ slot, entryId, stateName });
  }

  return { ok: true, wired, warnings };
}
