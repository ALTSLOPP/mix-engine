import type {
  InteractableDef, InteractionHost, InteractionStatus, InteractionCurrent, IxEntity, PlayerPose,
} from './types';
import type { AICommand } from '../ai/AIBridge';

interface IxRuntime {
  def: InteractableDef;
  enabled: boolean;
  fired: number;
  lastFired: number;
}

/**
 * InteractionSystem — proximity/facing interaction in the 3D world.
 *
 * Each tick it finds the nearest enabled interactable within range of the player (and,
 * if required, roughly in front of them), shows its prompt, and — on the interact key —
 * runs its commands + raises an `interacted` event. Decoupled from the Engine via
 * {@link InteractionHost} so it unit-tests standalone.
 */
export class InteractionSystem {
  private readonly host: InteractionHost;
  private readonly interactables = new Map<string, IxRuntime>();
  private elapsed = 0;
  private current: InteractionCurrent | null = null;
  private promptKey: string | null = null;

  constructor(host: InteractionHost) {
    this.host = host;
  }

  register(def: InteractableDef): void {
    const existing = this.interactables.get(def.id);
    this.interactables.set(def.id, {
      def,
      enabled: !def.disabled,
      fired: existing?.fired ?? 0,
      lastFired: existing?.lastFired ?? -Infinity,
    });
  }

  unregister(id: string): void {
    this.interactables.delete(id);
    if (this.current?.id === id) this.setPrompt(null);
  }

  setEnabled(id: string, enabled: boolean): void {
    const rt = this.interactables.get(id);
    if (rt) rt.enabled = enabled;
  }

  clear(): void {
    this.interactables.clear();
    this.setPrompt(null);
  }

  get currentTargetId(): string | null { return this.current?.id ?? null; }

  // ── Per-frame ───────────────────────────────────────────────────────────────

  update(dt: number): void {
    if (dt > 0) this.elapsed += dt;
    const pose = this.host.getPlayerPose();
    if (!pose || this.interactables.size === 0) {
      this.setPrompt(null);
      return;
    }
    const entities = this.host.listEntities();

    let best: { rt: IxRuntime; entityId?: number; dist: number } | null = null;
    for (const rt of this.interactables.values()) {
      if (!rt.enabled) continue;
      const anchor = this.resolveAnchor(rt.def, entities, pose);
      if (!anchor) continue;
      const radius = rt.def.radius ?? 3;
      if (anchor.dist > radius) continue;
      if (rt.def.requireFacing && !this.isFacing(pose, anchor, rt.def.facingDot ?? 0.35)) continue;
      if (!best || anchor.dist < best.dist) best = { rt, entityId: anchor.entityId, dist: anchor.dist };
    }

    if (best) {
      this.current = {
        id: best.rt.def.id,
        entityId: best.entityId,
        prompt: best.rt.def.prompt ?? 'Interact',
        distance: Math.round(best.dist * 100) / 100,
      };
      this.setPrompt(this.current.prompt, best.entityId, best.rt.def.id);
      if (this.host.isInteractPressed()) this.fire(best.rt, best.entityId);
    } else {
      this.current = null;
      this.setPrompt(null);
    }
  }

  /** Resolve an interactable's target entity → distance from the player + its id. */
  private resolveAnchor(
    def: InteractableDef, entities: IxEntity[], pose: PlayerPose,
  ): { dist: number; entityId?: number } | null {
    if (def.entityId !== undefined) {
      const e = entities.find((x) => x.id === def.entityId);
      return e ? { dist: dist(pose, e), entityId: e.id } : null;
    }
    // name / tag selector — pick the NEAREST matching entity.
    let best: { dist: number; entityId: number } | null = null;
    for (const e of entities) {
      if (def.name !== undefined && e.name !== def.name) continue;
      if (def.tag !== undefined && !e.tags.includes(def.tag)) continue;
      if (def.name === undefined && def.tag === undefined) continue; // no selector ⇒ no target
      const d = dist(pose, e);
      if (!best || d < best.dist) best = { dist: d, entityId: e.id };
    }
    return best;
  }

  private isFacing(pose: PlayerPose, anchor: { dist: number; entityId?: number }, minDot: number): boolean {
    const e = this.host.listEntities().find((x) => x.id === anchor.entityId);
    if (!e) return true; // can't resolve direction → don't block
    let dx = e.x - pose.x, dy = e.y - pose.y, dz = e.z - pose.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    return dx * pose.fx + dy * pose.fy + dz * pose.fz >= minDot;
  }

  // ── Activation ────────────────────────────────────────────────────────────────

  /** Programmatically activate an interactable by id (ignores range; respects once/cooldown). */
  trigger(id: string): boolean {
    const rt = this.interactables.get(id);
    if (!rt) return false;
    const anchor = rt.def.entityId;
    return this.fire(rt, anchor);
  }

  private fire(rt: IxRuntime, entityId?: number): boolean {
    if (!rt.enabled) return false;
    if (rt.def.once && rt.fired > 0) return false;
    if (rt.def.cooldown !== undefined && this.elapsed - rt.lastFired < rt.def.cooldown) return false;
    rt.fired++;
    rt.lastFired = this.elapsed;
    if (rt.def.commands) for (const c of rt.def.commands) this.host.execute(c as AICommand);
    this.host.emit('interacted', { id: rt.def.id, entityId });
    if (rt.def.once) { rt.enabled = false; if (this.current?.id === rt.def.id) this.setPrompt(null); }
    return true;
  }

  // ── Prompt ──────────────────────────────────────────────────────────────────

  private setPrompt(text: string | null, entityId?: number, id?: string): void {
    const key = text === null ? null : `${id ?? ''}|${text}`;
    if (key === this.promptKey) return;
    this.promptKey = key;
    this.host.showPrompt(text, entityId);
    this.host.emit('interaction_prompt', text === null ? null : { id, text, entityId });
  }

  // ── Introspection ─────────────────────────────────────────────────────────────

  status(): InteractionStatus {
    return {
      count: this.interactables.size,
      current: this.current,
      interactables: [...this.interactables.values()].map((rt) => ({
        id: rt.def.id,
        enabled: rt.enabled,
        prompt: rt.def.prompt ?? 'Interact',
        target: rt.def.entityId !== undefined ? `#${rt.def.entityId}`
          : rt.def.name !== undefined ? `name:${rt.def.name}`
          : rt.def.tag !== undefined ? `tag:${rt.def.tag}` : '(none)',
      })),
    };
  }

  dispose(): void {
    this.interactables.clear();
    this.current = null;
    this.promptKey = null;
  }
}

function dist(p: PlayerPose, e: IxEntity): number {
  return Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
}
