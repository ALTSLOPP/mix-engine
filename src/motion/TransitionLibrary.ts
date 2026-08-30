import type { EasingType, FadeMode, MotionEventDef, RootMotionMode } from './types';

export interface MotionTransition {
  id: string;
  clipName: string;
  fadeDuration?: number;
  fadeMode?: FadeMode;
  easing?: EasingType;
  startTime?: number;
  normalizedStartTime?: number;
  speed?: number;
  loop?: boolean;
  rootMotion?: RootMotionMode;
  events?: MotionEventDef[];
  interruptionPolicy?: 'immediate' | 'queue' | 'rejectIfBusy' | 'crossfade';
  exitTime?: number; // 0.0 to 1.0 normalized exit time
  aliases?: string[];
  tags?: string[];
  group?: string;
  metadata?: Record<string, unknown>;
}

/**
 * TransitionLibrary — Registry for reusable animation transitions with aliases, grouping, and override support.
 */
export class TransitionLibrary {
  private transitions = new Map<string, MotionTransition>();
  private aliasMap = new Map<string, string>(); // alias -> transition id
  private groups = new Map<string, Set<string>>(); // group name -> set of transition ids

  register(transition: MotionTransition): void {
    this.transitions.set(transition.id, { ...transition });

    // Index aliases
    if (transition.aliases) {
      for (const alias of transition.aliases) {
        this.aliasMap.set(alias, transition.id);
      }
    }

    // Index group
    if (transition.group) {
      if (!this.groups.has(transition.group)) {
        this.groups.set(transition.group, new Set());
      }
      this.groups.get(transition.group)!.add(transition.id);
    }
  }

  get(idOrAlias: string): MotionTransition | null {
    if (this.transitions.has(idOrAlias)) {
      return this.transitions.get(idOrAlias)!;
    }
    const resolvedId = this.aliasMap.get(idOrAlias);
    if (resolvedId && this.transitions.has(resolvedId)) {
      return this.transitions.get(resolvedId)!;
    }
    return null;
  }

  has(idOrAlias: string): boolean {
    return this.transitions.has(idOrAlias) || this.aliasMap.has(idOrAlias);
  }

  override(id: string, partial: Partial<MotionTransition>): boolean {
    const existing = this.transitions.get(id);
    if (!existing) return false;
    this.transitions.set(id, { ...existing, ...partial });
    return true;
  }

  getGroup(groupName: string): MotionTransition[] {
    const ids = this.groups.get(groupName);
    if (!ids) return [];
    const out: MotionTransition[] = [];
    for (const id of ids) {
      const t = this.transitions.get(id);
      if (t) out.push(t);
    }
    return out;
  }

  listAll(): MotionTransition[] {
    return Array.from(this.transitions.values());
  }

  remove(id: string): boolean {
    const t = this.transitions.get(id);
    if (!t) return false;

    if (t.aliases) {
      for (const a of t.aliases) this.aliasMap.delete(a);
    }
    if (t.group) {
      this.groups.get(t.group)?.delete(id);
    }
    return this.transitions.delete(id);
  }

  clear(): void {
    this.transitions.clear();
    this.aliasMap.clear();
    this.groups.clear();
  }
}
