import * as THREE from 'three';
import type { AnimationPackDef, RuntimeAnimationPack } from './AnimationPack';

/**
 * AnimationPackRegistry.ts — live registry of imported animation packs.
 */

const STORAGE_KEY = 'mix_anim_packs_v1';

export class AnimationPackRegistry {
  private readonly packs = new Map<string, RuntimeAnimationPack>();
  private persistenceEnabled = true;
  readonly packIssues = new Map<string, string[]>();

  has(id: string): boolean { return this.packs.has(id); }
  get(id: string): RuntimeAnimationPack | undefined { return this.packs.get(id); }
  list(): RuntimeAnimationPack[] { return [...this.packs.values()]; }
  defs(): AnimationPackDef[] { return [...this.packs.values()].map(p => p.def); }

  register(pack: RuntimeAnimationPack, issues: string[] = []): void {
    this.packs.set(pack.def.id, pack);
    this.packIssues.set(pack.def.id, issues);
    this.persistDefs();
    this.notifyChanged();
  }

  registerDef(def: AnimationPackDef): RuntimeAnimationPack {
    const pack: RuntimeAnimationPack = { def, clips: new Map() };
    this.packs.set(def.id, pack);
    this.persistDefs();
    this.notifyChanged();
    return pack;
  }

  addClip(packId: string, entryId: string, clip: THREE.AnimationClip): boolean {
    const pack = this.packs.get(packId);
    if (!pack) return false;
    pack.clips.set(entryId, clip);
    return true;
  }

  getClip(packId: string, entryId: string): THREE.AnimationClip | undefined {
    return this.packs.get(packId)?.clips.get(entryId);
  }

  findClipByEntryId(entryId: string): { packId: string; clip: THREE.AnimationClip } | null {
    for (const [packId, pack] of this.packs) {
      const c = pack.clips.get(entryId);
      if (c) return { packId, clip: c };
    }
    return null;
  }

  remove(packId: string): boolean {
    const ok = this.packs.delete(packId);
    this.packIssues.delete(packId);
    this.persistDefs();
    if (ok) this.notifyChanged();
    return ok;
  }

  clear(): void {
    this.packs.clear();
    this.packIssues.clear();
    this.persistDefs();
    this.notifyChanged();
  }

  applyToStateMachine(
    packId: string,
    asm: { addAnimation: (name: string, clip: THREE.AnimationClip, opts?: { loop?: boolean }) => void },
    opts: { prefix?: string; overwrite?: boolean } = {},
  ): number {
    const pack = this.packs.get(packId);
    if (!pack) return 0;
    // entry id → loop flag (one-shot attacks/deaths must not loop).
    const loopById = new Map(pack.def.entries.map(e => [e.id, e.loop]));
    let count = 0;
    for (const [entryId, clip] of pack.clips) {
      const stateName = opts.prefix ? `${opts.prefix}/${entryId}` : entryId;
      if (!opts.overwrite && (asm as unknown as { hasAnimation?: (s: string) => boolean }).hasAnimation?.(stateName)) continue;
      asm.addAnimation(stateName, clip, { loop: loopById.get(entryId) ?? true });
      count++;
    }
    return count;
  }

  applyToAll(
    packId: string,
    asms: Iterable<{ addAnimation: (n: string, c: THREE.AnimationClip) => void; hasAnimation?: (s: string) => boolean }>,
    opts: { prefix?: string } = {},
  ): number {
    let total = 0;
    for (const asm of asms) total += this.applyToStateMachine(packId, asm, opts);
    return total;
  }

  private persistDefs(): void {
    if (!this.persistenceEnabled || typeof localStorage === 'undefined') return;
    try {
      const defs = this.defs();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defs));
      if (typeof fetch !== 'undefined') {
        fetch('/api/anim-packs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(defs),
        }).catch(() => {});
      }
    } catch {}
  }

  hydrateFromStorage(): AnimationPackDef[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const defs = JSON.parse(raw) as AnimationPackDef[];
      for (const def of defs) if (!this.packs.has(def.id)) this.packs.set(def.id, { def, clips: new Map() });
      return defs;
    } catch { return []; }
  }

  setPersistenceEnabled(v: boolean): void { this.persistenceEnabled = v; }

  private notifyChanged(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mix:animation-packs-changed'));
    }
  }

  toJSON(): { packs: AnimationPackDef[]; packIssues: Record<string, string[]> } {
    const issues: Record<string, string[]> = {};
    for (const [k, v] of this.packIssues) issues[k] = v;
    return { packs: this.defs(), packIssues: issues };
  }
}
