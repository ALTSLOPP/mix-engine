import type { AICommand } from '../ai/AIBridge';
import type {
  GameplayDef, GameplayHost, GameplayStatus, GpAction, GpCondition, GpCompare,
  GpDialogueTree, GpEntitySnapshot, GpGameStatus, GpQuest, GpRule, GpTimer, GpTrigger,
  GpTriggerEvent, GpValue, GpZone,
} from './types';

/** Max synchronous rule cascade depth — actions raising signals that fire more rules.
 *  Beyond this we bail and warn, so an accidental A→B→A loop can't hang the frame. */
const MAX_CASCADE = 32;

interface ZoneRuntime {
  def: GpZone;
  enabled: boolean;
  /** Entity ids (or PLAYER for the player) currently inside. */
  inside: Set<number>;
  /** For `once` zones: latched after the first enter. */
  latched: boolean;
}

interface RuleRuntime {
  def: GpRule;
  id: string;
  enabled: boolean;
  fired: number;
  lastFired: number; // seconds (this.elapsed) of last fire, -Infinity if never
}

interface QuestRuntime {
  def: GpQuest;
  state: 'inactive' | 'active' | 'completed' | 'failed';
  /** objectiveId → progress count. */
  progress: Map<string, number>;
}

interface TimerRuntime {
  def: GpTimer;
  running: boolean;
  remaining: number;
}

/** Sentinel "entity id" used for the player in zone occupancy (the player has no
 *  stable physics-entity id exposed through the host's position accessor). */
const PLAYER = -1;

/**
 * GameplayDirector — the declarative, event-driven game-logic engine.
 *
 * Loads a {@link GameplayDef} and runs it: ticks timers + zone occupancy each frame,
 * listens on the global EventBus for collisions / destroys / signals, and evaluates
 * rules (WHEN trigger → IF conditions → THEN actions). Actions reach the rest of the
 * engine purely through {@link GameplayHost.execute} (AICommands), so this layer adds
 * game *rules* without re-implementing any engine capability.
 *
 * Decoupled from Engine via the small {@link GameplayHost} interface, so it unit-tests
 * standalone (like BehaviorTree / Steering).
 */
export class GameplayDirector {
  private readonly host: GameplayHost;

  private def: GameplayDef | null = null;
  private readonly vars = new Map<string, GpValue>();
  private readonly zones = new Map<string, ZoneRuntime>();
  private readonly rules: RuleRuntime[] = [];
  /** event-type → rules listening for it (dispatch index). */
  private readonly rulesByEvent = new Map<GpTriggerEvent, RuleRuntime[]>();
  private readonly quests = new Map<string, QuestRuntime>();
  private readonly timers = new Map<string, TimerRuntime>();
  private readonly dialogues = new Map<string, GpDialogueTree>();
  /** The open conversation, or null. */
  private activeDialogue: { id: string; nodeId: string } | null = null;

  private gameStatus: GpGameStatus = 'playing';
  private message: string | undefined;
  private elapsed = 0;
  private cascadeDepth = 0;

  /** Rolling cache of entity metadata, refreshed each tick. Lets `collision` and
   *  `destroyed` triggers read the tags/name/kind of an entity that may already be
   *  gone from the live scene by the time the bus event is handled. */
  private readonly entityMeta = new Map<number, { name?: string; kind?: string; tags: string[] }>();

  private readonly unsubscribers: Array<() => void> = [];

  constructor(host: GameplayHost) {
    this.host = host;
    this.subscribeBus();
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  /** The currently-loaded definition (for save bundles), or null. */
  getDef(): GameplayDef | null { return this.def; }

  /**
   * Load (replace) the active game definition and start it. Pass `{ quiet: true }` to set
   * up the structure WITHOUT firing `start` rules or auto-starting quests — used by
   * save/load so restoring progress doesn't re-run a game's intro/setup side effects.
   */
  load(def: GameplayDef, opts: { quiet?: boolean } = {}): void {
    this.reset();
    this.def = def;

    if (def.variables) {
      for (const [k, v] of Object.entries(def.variables)) this.vars.set(k, v);
    }
    for (const z of def.zones ?? []) {
      this.zones.set(z.id, { def: z, enabled: !z.disabled, inside: new Set(), latched: false });
    }
    let autoId = 0;
    for (const r of def.rules ?? []) {
      const id = r.id ?? `rule_${autoId++}`;
      const rt: RuleRuntime = { def: r, id, enabled: !r.disabled, fired: 0, lastFired: -Infinity };
      this.rules.push(rt);
      const ev = r.on.event;
      const list = this.rulesByEvent.get(ev) ?? [];
      list.push(rt);
      this.rulesByEvent.set(ev, list);
    }
    for (const q of def.quests ?? []) {
      this.quests.set(q.id, {
        def: q,
        state: 'inactive',
        progress: new Map(q.objectives.map((o) => [o.id, 0])),
      });
    }
    for (const t of def.timers ?? []) {
      this.timers.set(t.id, { def: t, running: !!t.autoStart, remaining: t.interval });
    }
    for (const dlg of def.dialogues ?? []) {
      this.dialogues.set(dlg.id, dlg);
    }

    // Order matters: initial variables are already applied above; auto-start quests
    // next so `start` rules (and any item/advance actions they trigger) see ACTIVE
    // quests; then fire start rules. A `quest_started` rule that needs config should
    // read it from an initial variable (applied before everything).
    // Quiet load (save/restore) skips both so restoring progress doesn't re-run setup.
    if (!opts.quiet) {
      for (const q of def.quests ?? []) {
        if (q.autoStart) this.startQuest(q.id);
      }
      this.fire('start', {});
    }
    this.persist();
  }

  /** Clear all loaded state (back to an empty, 'playing' director). */
  reset(): void {
    this.def = null;
    this.vars.clear();
    this.zones.clear();
    this.rules.length = 0;
    this.rulesByEvent.clear();
    this.quests.clear();
    this.timers.clear();
    this.dialogues.clear();
    this.activeDialogue = null;
    this.entityMeta.clear();
    this.gameStatus = 'playing';
    this.message = undefined;
    this.elapsed = 0;
    this.cascadeDepth = 0;
  }

  get loaded(): boolean { return this.def !== null; }
  get status(): GpGameStatus { return this.gameStatus; }

  // ── Per-frame tick ────────────────────────────────────────────────────────

  update(dt: number): void {
    if (!this.def || this.gameStatus !== 'playing') return;
    if (!(dt > 0)) return;
    this.elapsed += dt;

    this.refreshEntityCache();
    this.tickTimers(dt);
    this.tickZones();
  }

  private refreshEntityCache(): void {
    this.entityMeta.clear();
    for (const e of this.host.listEntities()) {
      this.entityMeta.set(e.id, { name: e.name, kind: e.kind, tags: e.tags });
    }
  }

  private tickTimers(dt: number): void {
    for (const t of this.timers.values()) {
      if (!t.running) continue;
      t.remaining -= dt;
      // Guard against a huge dt firing a repeating timer many times in one frame.
      let guard = 0;
      while (t.remaining <= 0 && this.gameStatus === 'playing' && guard++ < 64) {
        this.fire('timer', { timer: t.def.id }, t.def.id);
        if (t.def.repeat) t.remaining += t.def.interval;
        else { t.running = false; break; }
      }
    }
  }

  private tickZones(): void {
    for (const zr of this.zones.values()) {
      if (!zr.enabled) continue;
      const occupants = this.zoneOccupants(zr.def);
      // Enters.
      for (const id of occupants) {
        if (!zr.inside.has(id)) {
          zr.inside.add(id);
          if (zr.def.once) {
            if (zr.latched) continue;
            zr.latched = true;
            zr.enabled = false;
          }
          this.fire('zone_enter', { zone: zr.def.id, entity: id === PLAYER ? 'player' : id }, zr.def.id);
        }
      }
      // Exits.
      for (const id of [...zr.inside]) {
        if (!occupants.has(id)) {
          zr.inside.delete(id);
          this.fire('zone_exit', { zone: zr.def.id, entity: id === PLAYER ? 'player' : id }, zr.def.id);
        }
      }
    }
  }

  /** Ids currently inside a zone (PLAYER sentinel for the watched player). */
  private zoneOccupants(z: GpZone): Set<number> {
    const out = new Set<number>();
    const watch = z.watch ?? 'player';
    if (watch === 'player') {
      const p = this.host.getPlayerPosition();
      if (p && this.pointInZone(z, p.x, p.y, p.z)) out.add(PLAYER);
      return out;
    }
    for (const e of this.host.listEntities()) {
      if (!this.entityMatchesWatch(e, watch)) continue;
      if (this.pointInZone(z, e.x, e.y, e.z)) out.add(e.id);
    }
    return out;
  }

  private entityMatchesWatch(e: GpEntitySnapshot, watch: string): boolean {
    if (watch === 'any') return true;
    const [sel, val] = watch.split(':', 2);
    if (val === undefined) return e.tags.includes(watch); // bare string ⇒ tag
    if (sel === 'tag') return e.tags.includes(val);
    if (sel === 'name') return e.name === val;
    if (sel === 'kind') return e.kind === val;
    return false;
  }

  private pointInZone(z: GpZone, x: number, y: number, zc: number): boolean {
    const [cx, cy, cz] = z.center;
    if ((z.shape ?? 'sphere') === 'box') {
      const [sx, sy, sz] = z.size ?? [1, 1, 1];
      return Math.abs(x - cx) <= sx / 2 && Math.abs(y - cy) <= sy / 2 && Math.abs(zc - cz) <= sz / 2;
    }
    const r = z.radius ?? 1;
    const dx = x - cx, dy = y - cy, dz = zc - cz;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }

  // ── EventBus wiring (collision / destroyed / signal triggers) ───────────────

  private subscribeBus(): void {
    this.unsubscribers.push(
      this.host.on('collision_start', (d) => this.onCollision(d)),
      this.host.on('entity_destroyed', (d) => this.onDestroyed(d)),
      this.host.on('item_acquired', (d) => this.onItemEvent('item_acquired', d)),
      this.host.on('item_removed', (d) => this.onItemEvent('item_removed', d)),
      this.host.on('item_used', (d) => this.onItemEvent('item_used', d)),
      this.host.on('interacted', (d) => this.onInteract(d)),
      this.host.on('spawned', (d) => this.onSpawnerEvent('spawned', d)),
      this.host.on('spawner_cleared', (d) => this.onSpawnerEvent('spawner_cleared', d)),
    );
  }

  /** Route an InteractionSystem `interacted` event to matching `interact` triggers. */
  private onInteract(data: unknown): void {
    if (this.gameStatus !== 'playing') return;
    const id = (data as { id?: string })?.id;
    const rules = this.rulesByEvent.get('interact');
    if (!rules) return;
    for (const rt of rules) {
      if (!this.canFire(rt)) continue;
      const trig = rt.def.on as Extract<GpTrigger, { event: 'interact' }>;
      if (trig.id !== undefined && trig.id !== id) continue;
      this.runRule(rt, (data ?? {}) as Record<string, unknown>);
    }
  }

  /** Route a SpawnerSystem event to matching `spawned` / `spawner_cleared` triggers. */
  private onSpawnerEvent(event: 'spawned' | 'spawner_cleared', data: unknown): void {
    if (this.gameStatus !== 'playing') return;
    const spawner = (data as { spawner?: string })?.spawner;
    const rules = this.rulesByEvent.get(event);
    if (!rules) return;
    for (const rt of rules) {
      if (!this.canFire(rt)) continue;
      const trig = rt.def.on as { spawner?: string };
      if (trig.spawner !== undefined && trig.spawner !== spawner) continue;
      this.runRule(rt, (data ?? {}) as Record<string, unknown>);
    }
  }

  /** Route an inventory bus event to matching item triggers (constrained by item/owner). */
  private onItemEvent(event: 'item_acquired' | 'item_removed' | 'item_used', data: unknown): void {
    if (this.gameStatus !== 'playing') return;
    const d = (data ?? {}) as { item?: string; owner?: string };
    const rules = this.rulesByEvent.get(event);
    if (!rules) return;
    for (const rt of rules) {
      if (!this.canFire(rt)) continue;
      const trig = rt.def.on as { item?: string; owner?: string };
      if (trig.item !== undefined && trig.item !== d.item) continue;
      if (trig.owner !== undefined && trig.owner !== d.owner) continue;
      this.runRule(rt, d as Record<string, unknown>);
    }
  }

  private onCollision(data: unknown): void {
    if (this.gameStatus !== 'playing') return;
    const d = data as { entityA?: number; entityB?: number };
    if (d?.entityA === undefined || d?.entityB === undefined) return;
    const a = this.entityMeta.get(d.entityA);
    const b = this.entityMeta.get(d.entityB);
    const rules = this.rulesByEvent.get('collision');
    if (!rules) return;
    for (const rt of rules) {
      if (!this.canFire(rt)) continue;
      const trig = rt.def.on as Extract<GpTrigger, { event: 'collision' }>;
      if (this.collisionMatches(trig, a, b)) {
        this.runRule(rt, { entityA: d.entityA, entityB: d.entityB });
      }
    }
  }

  private collisionMatches(
    trig: { tag?: string; otherTag?: string },
    a?: { tags: string[] },
    b?: { tags: string[] },
  ): boolean {
    const at = a?.tags ?? [], bt = b?.tags ?? [];
    if (trig.tag === undefined && trig.otherTag === undefined) return true;
    if (trig.otherTag === undefined) {
      return at.includes(trig.tag!) || bt.includes(trig.tag!);
    }
    // Both specified — match in either order.
    return (
      (at.includes(trig.tag!) && bt.includes(trig.otherTag)) ||
      (bt.includes(trig.tag!) && at.includes(trig.otherTag))
    );
  }

  private onDestroyed(data: unknown): void {
    if (this.gameStatus !== 'playing') return;
    const id = (data as { entityId?: number })?.entityId;
    if (id === undefined) return;
    const meta = this.entityMeta.get(id);
    const rules = this.rulesByEvent.get('destroyed');
    this.entityMeta.delete(id);
    if (!rules) return;
    for (const rt of rules) {
      if (!this.canFire(rt)) continue;
      const trig = rt.def.on as Extract<GpTrigger, { event: 'destroyed' }>;
      if (trig.tag !== undefined && !meta?.tags.includes(trig.tag)) continue;
      if (trig.name !== undefined && meta?.name !== trig.name) continue;
      if (trig.kind !== undefined && meta?.kind !== trig.kind) continue;
      this.runRule(rt, { entityId: id, ...meta });
    }
  }

  /** Raise a custom signal: fires matching `signal` rules AND echoes onto the EventBus. */
  signal(name: string, data?: unknown): void {
    this.host.emit(name, data);
    this.fire('signal', { name, data }, name);
  }

  // ── Rule firing ─────────────────────────────────────────────────────────────

  /**
   * Fire every enabled rule listening on `event` whose discriminator matches `key`
   * (zone id / timer id / signal name / quest id) and whose conditions hold.
   */
  private fire(event: GpTriggerEvent, payload: Record<string, unknown>, key?: string): void {
    // Once the game has ended, gameplay rules stop dispatching. The won/lost rules
    // themselves run via the dedicated path in endGame(), not through here.
    if (this.gameStatus !== 'playing') return;
    const rules = this.rulesByEvent.get(event);
    if (!rules || rules.length === 0) return;
    if (this.cascadeDepth >= MAX_CASCADE) {
      console.warn(`[Gameplay] rule cascade exceeded ${MAX_CASCADE} (possible loop on '${event}') — bailing.`);
      return;
    }
    for (const rt of rules) {
      if (!this.canFire(rt)) continue;
      if (key !== undefined && !this.triggerKeyMatches(rt.def.on, key)) continue;
      this.runRule(rt, payload);
    }
  }

  /** Does a keyed trigger (zone/timer/signal/quest/objective) match `key`? */
  private triggerKeyMatches(t: GpTrigger, key: string): boolean {
    switch (t.event) {
      case 'zone_enter': case 'zone_exit': return t.zone === key;
      case 'timer': return t.timer === key;
      case 'signal': return t.name === key;
      case 'var_changed': return t.var === key;
      case 'quest_started': case 'quest_completed': case 'quest_failed': return t.quest === key;
      case 'objective_completed': return key === `${t.quest}/${t.objective}`;
      case 'dialogue_ended': return t.dialogue === undefined || t.dialogue === key;
      default: return true;
    }
  }

  private canFire(rt: RuleRuntime): boolean {
    if (!rt.enabled) return false;
    if (rt.def.once && rt.fired > 0) return false;
    if (rt.def.cooldown !== undefined && this.elapsed - rt.lastFired < rt.def.cooldown) return false;
    return true;
  }

  private runRule(rt: RuleRuntime, payload: Record<string, unknown>): void {
    // Central cascade guard — protects every firing path (fire / collision / destroyed /
    // item events), not just keyed `fire()`. An action that re-triggers a rule that
    // re-runs this one will bail here rather than blow the stack.
    if (this.cascadeDepth >= MAX_CASCADE) {
      console.warn(`[Gameplay] rule cascade exceeded ${MAX_CASCADE} — bailing (possible loop).`);
      return;
    }
    if (rt.def.if && !rt.def.if.every((c) => this.evalCondition(c))) return;
    rt.fired++;
    rt.lastFired = this.elapsed;
    this.cascadeDepth++;
    try {
      for (const a of rt.def.do) {
        this.runAction(a, payload);
        if (this.gameStatus !== 'playing') break; // win/lose ends the batch
      }
    } finally {
      this.cascadeDepth--;
    }
  }

  // ── Conditions ───────────────────────────────────────────────────────────────

  private evalCondition(c: GpCondition): boolean {
    if ('not' in c) return !this.evalCondition(c.not);
    if ('var' in c) {
      const cur = this.vars.get(c.var);
      return compare(cur, c.op ?? '==', c.value);
    }
    if ('entityExists' in c) {
      return this.host.listEntities().some((e) => this.entityMatchesSelector(e, c.entityExists));
    }
    if ('entityCount' in c) {
      const n = this.host.listEntities().filter((e) => this.entityMatchesSelector(e, c.entityCount)).length;
      return compare(n, c.op, c.value);
    }
    if ('quest' in c) {
      const q = this.quests.get(c.quest);
      const state = q?.state ?? 'inactive';
      return state === c.is;
    }
    if ('objective' in c) {
      const done = this.isObjectiveComplete(c.objective.quest, c.objective.objective);
      return c.is === 'completed' ? done : !done;
    }
    if ('chance' in c) {
      return (this.host.random?.() ?? Math.random()) < c.chance;
    }
    if ('hasItem' in c) {
      const have = this.host.itemCount?.(c.owner ?? 'player', c.hasItem) ?? 0;
      return have >= (c.count ?? 1);
    }
    if ('status' in c) {
      return this.gameStatus === c.status;
    }
    return false;
  }

  private entityMatchesSelector(e: GpEntitySnapshot, sel: { tag?: string; name?: string; kind?: string }): boolean {
    if (sel.tag !== undefined && !e.tags.includes(sel.tag)) return false;
    if (sel.name !== undefined && e.name !== sel.name) return false;
    if (sel.kind !== undefined && e.kind !== sel.kind) return false;
    return true;
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  private runAction(a: GpAction, payload: Record<string, unknown>): void {
    if ('command' in a) { this.host.execute(a.command); return; }
    if ('commands' in a) { for (const c of a.commands) this.host.execute(c); return; }
    if ('setVar' in a) { this.setVar(a.setVar, a.value); return; }
    if ('addVar' in a) {
      const cur = this.vars.get(a.addVar);
      this.setVar(a.addVar, (typeof cur === 'number' ? cur : 0) + a.by);
      return;
    }
    if ('signal' in a) { this.signal(a.signal, a.data ?? payload); return; }
    if ('startQuest' in a) { this.startQuest(a.startQuest); return; }
    if ('completeQuest' in a) { this.completeQuest(a.completeQuest); return; }
    if ('failQuest' in a) { this.failQuest(a.failQuest); return; }
    if ('advance' in a) { this.advanceObjective(a.advance.quest, a.advance.objective, a.advance.by ?? 1); return; }
    if ('giveItem' in a) { this.host.execute({ type: 'inventory_give', item: a.giveItem, count: a.count, owner: a.owner } as AICommand); return; }
    if ('removeItem' in a) { this.host.execute({ type: 'inventory_remove', item: a.removeItem, count: a.count, owner: a.owner } as AICommand); return; }
    if ('useItem' in a) { this.host.execute({ type: 'inventory_use', item: a.useItem, owner: a.owner } as AICommand); return; }
    if ('startDialogue' in a) { this.startDialogue(a.startDialogue); return; }
    if ('startTimer' in a) { const t = this.timers.get(a.startTimer); if (t) { t.running = true; t.remaining = t.def.interval; } return; }
    if ('stopTimer' in a) { const t = this.timers.get(a.stopTimer); if (t) t.running = false; return; }
    if ('enableRule' in a) { this.setRuleEnabled(a.enableRule, true); return; }
    if ('disableRule' in a) { this.setRuleEnabled(a.disableRule, false); return; }
    if ('enableZone' in a) { const z = this.zones.get(a.enableZone); if (z) { z.enabled = true; z.latched = false; } return; }
    if ('disableZone' in a) { const z = this.zones.get(a.disableZone); if (z) z.enabled = false; return; }
    if ('win' in a) { this.endGame('won', a.win.message); return; }
    if ('lose' in a) { this.endGame('lost', a.lose.message); return; }
    if ('log' in a) { console.log(`[Gameplay] ${a.log}`); return; }
  }

  private setRuleEnabled(id: string, enabled: boolean): void {
    for (const rt of this.rules) if (rt.id === id) rt.enabled = enabled;
  }

  // ── Variables ────────────────────────────────────────────────────────────────

  setVar(key: string, value: GpValue): void {
    const prev = this.vars.get(key);
    if (prev === value) return;
    this.vars.set(key, value);
    this.persist();
    this.fire('var_changed', { var: key, value, previous: prev }, key);
  }

  getVar(key: string): GpValue | undefined { return this.vars.get(key); }

  // ── Quests ───────────────────────────────────────────────────────────────────

  startQuest(id: string): void {
    const q = this.quests.get(id);
    if (!q || q.state === 'active' || q.state === 'completed') return;
    q.state = 'active';
    this.persist();
    this.fire('quest_started', { quest: id }, id);
  }

  advanceObjective(questId: string, objId: string, by = 1): void {
    const q = this.quests.get(questId);
    if (!q || q.state !== 'active') return;
    const obj = q.def.objectives.find((o) => o.id === objId);
    if (!obj) return;
    const target = obj.count ?? 1;
    const wasDone = (q.progress.get(objId) ?? 0) >= target;
    const next = Math.min(target, (q.progress.get(objId) ?? 0) + by);
    q.progress.set(objId, next);
    this.persist();
    if (!wasDone && next >= target) {
      this.fire('objective_completed', { quest: questId, objective: objId }, `${questId}/${objId}`);
      this.maybeCompleteQuest(q);
    }
  }

  private maybeCompleteQuest(q: QuestRuntime): void {
    if (q.state !== 'active') return;
    const allRequiredDone = q.def.objectives
      .filter((o) => !o.optional)
      .every((o) => (q.progress.get(o.id) ?? 0) >= (o.count ?? 1));
    if (allRequiredDone) this.completeQuest(q.def.id);
  }

  completeQuest(id: string): void {
    const q = this.quests.get(id);
    if (!q || q.state === 'completed') return;
    q.state = 'completed';
    // Snap every required objective to full (e.g. completed directly via action).
    for (const o of q.def.objectives) {
      if (!o.optional) q.progress.set(o.id, o.count ?? 1);
    }
    this.persist();
    if (q.def.rewards) for (const a of q.def.rewards) this.runAction(a, { quest: id });
    this.fire('quest_completed', { quest: id }, id);
  }

  failQuest(id: string): void {
    const q = this.quests.get(id);
    if (!q || q.state === 'completed' || q.state === 'failed') return;
    q.state = 'failed';
    this.persist();
    this.fire('quest_failed', { quest: id }, id);
  }

  private isObjectiveComplete(questId: string, objId: string): boolean {
    const q = this.quests.get(questId);
    if (!q) return false;
    const obj = q.def.objectives.find((o) => o.id === objId);
    if (!obj) return false;
    return (q.progress.get(objId) ?? 0) >= (obj.count ?? 1);
  }

  // ── Dialogue trees ───────────────────────────────────────────────────────────

  /** Open a dialogue tree at its start node. */
  startDialogue(id: string): void {
    const tree = this.dialogues.get(id);
    if (!tree) { console.warn(`[Gameplay] startDialogue: no tree '${id}'`); return; }
    this.activeDialogue = { id, nodeId: tree.start };
    this.presentNode();
  }

  /** Present the current dialogue node: run its actions, compute visible choices, and
   *  show it through the engine's DialogueSystem (via the `dialogue_show` command). */
  private presentNode(): void {
    if (!this.activeDialogue) return;
    const tree = this.dialogues.get(this.activeDialogue.id);
    const node = tree?.nodes.find((n) => n.id === this.activeDialogue!.nodeId);
    if (!tree || !node) { this.endDialogue(); return; }
    if (node.actions) {
      for (const a of node.actions) {
        this.runAction(a, {});
        if (this.gameStatus !== 'playing') { this.endDialogue(); return; }
      }
    }
    // Visible choices keep their ORIGINAL index so chooseDialogue can map back.
    const choices: { text: string; command: AICommand }[] = [];
    const list = node.choices ?? [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.if && !c.if.every((cond) => this.evalCondition(cond))) continue;
      choices.push({ text: c.text, command: { type: 'gameplay_dialogue_choose', index: i } as AICommand });
    }
    if (choices.length === 0) {
      // No branching choices → a single "Continue" that follows node.next or ends.
      choices.push({ text: 'Continue', command: { type: 'gameplay_dialogue_choose', index: -1 } as AICommand });
    }
    this.host.execute({ type: 'dialogue_show', text: node.text, speaker: node.speaker, choices, pauseGame: true } as AICommand);
  }

  /** Pick a choice on the current node (index -1 = the synthesized "Continue"). */
  chooseDialogue(index: number): void {
    if (!this.activeDialogue) return;
    const tree = this.dialogues.get(this.activeDialogue.id);
    const node = tree?.nodes.find((n) => n.id === this.activeDialogue!.nodeId);
    if (!tree || !node) { this.endDialogue(); return; }
    if (index === -1) {
      if (node.next) { this.activeDialogue.nodeId = node.next; this.presentNode(); }
      else this.endDialogue();
      return;
    }
    const choice = node.choices?.[index];
    if (!choice) return;
    if (choice.do) {
      for (const a of choice.do) {
        this.runAction(a, {});
        if (this.gameStatus !== 'playing') { this.endDialogue(); return; }
      }
    }
    if (choice.next) { this.activeDialogue.nodeId = choice.next; this.presentNode(); }
    else this.endDialogue();
  }

  private endDialogue(): void {
    if (!this.activeDialogue) return;
    const id = this.activeDialogue.id;
    this.activeDialogue = null;
    this.fire('dialogue_ended', { dialogue: id }, id);
  }

  // ── Win / lose ───────────────────────────────────────────────────────────────

  private endGame(status: 'won' | 'lost', message?: string): void {
    if (this.gameStatus !== 'playing') return;
    this.gameStatus = status;
    this.message = message;
    this.persist();
    // Fire the won/lost rules (cascade allowed) before locking further processing.
    const ev: GpTriggerEvent = status === 'won' ? 'won' : 'lost';
    const rules = this.rulesByEvent.get(ev);
    if (rules) {
      // Temporarily allow rule running even though status != playing.
      for (const rt of rules) {
        if (!this.canFire(rt)) continue;
        if (rt.def.if && !rt.def.if.every((c) => this.evalCondition(c))) continue;
        rt.fired++;
        rt.lastFired = this.elapsed;
        this.cascadeDepth++;
        try { for (const a of rt.def.do) this.runActionPostGame(a); }
        finally { this.cascadeDepth--; }
      }
    }
    this.host.emit(status === 'won' ? 'game_won' : 'game_lost', { message });
  }

  /** After win/lose, only presentation-style actions run (no further state mutation
   *  that could re-trigger the game loop). Commands/log/signal are allowed. */
  private runActionPostGame(a: GpAction): void {
    if ('command' in a || 'commands' in a || 'log' in a || 'signal' in a) {
      this.runAction(a, {});
    }
  }

  // ── Introspection / persistence ──────────────────────────────────────────────

  getStatus(): GameplayStatus {
    const variables: Record<string, GpValue> = {};
    for (const [k, v] of this.vars) variables[k] = v;
    return {
      loaded: this.loaded,
      name: this.def?.name,
      status: this.gameStatus,
      message: this.message,
      elapsed: Math.round(this.elapsed * 100) / 100,
      variables,
      quests: [...this.quests.values()].map((q) => ({
        id: q.def.id,
        title: q.def.title,
        description: q.def.description,
        state: q.state,
        objectives: q.def.objectives.map((o) => ({
          id: o.id,
          description: o.description,
          progress: q.progress.get(o.id) ?? 0,
          count: o.count ?? 1,
          completed: (q.progress.get(o.id) ?? 0) >= (o.count ?? 1),
          optional: !!o.optional,
        })),
      })),
      zones: [...this.zones.values()].map((z) => ({ id: z.def.id, enabled: z.enabled, occupants: z.inside.size })),
      timers: [...this.timers.values()].map((t) => ({ id: t.def.id, running: t.running, remaining: Math.round(t.remaining * 100) / 100 })),
      ruleCount: this.rules.length,
      activeDialogue: this.activeDialogue ? { id: this.activeDialogue.id, node: this.activeDialogue.nodeId } : null,
    };
  }

  /** A token-efficient human summary (HELM-style). */
  summarize(): string {
    const s = this.getStatus();
    if (!s.loaded) return 'gameplay: no definition loaded';
    const lines: string[] = [];
    lines.push(`gameplay "${s.name ?? 'untitled'}" — ${s.status}${s.message ? ` (${s.message})` : ''} · ${s.elapsed}s · ${s.ruleCount} rules`);
    const varEntries = Object.entries(s.variables);
    if (varEntries.length) lines.push(`vars: ${varEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    for (const q of s.quests) {
      lines.push(`quest ${q.id} "${q.title}" [${q.state}]`);
      for (const o of q.objectives) {
        lines.push(`  ${o.completed ? '✓' : '○'} ${o.description} (${o.progress}/${o.count})${o.optional ? ' [optional]' : ''}`);
      }
    }
    return lines.join('\n');
  }

  /** Serialize mutable runtime (variables/quests/status/timers/rule+zone toggles). */
  serialize(): string {
    return JSON.stringify({
      v: 1,
      status: this.gameStatus,
      message: this.message,
      vars: Object.fromEntries(this.vars),
      quests: Object.fromEntries(
        [...this.quests.entries()].map(([id, q]) => [id, { state: q.state, progress: Object.fromEntries(q.progress) }]),
      ),
      timers: Object.fromEntries([...this.timers.entries()].map(([id, t]) => [id, { running: t.running, remaining: t.remaining }])),
      rules: Object.fromEntries(this.rules.map((r) => [r.id, { enabled: r.enabled, fired: r.fired }])),
      zones: Object.fromEntries([...this.zones.entries()].map(([id, z]) => [id, { enabled: z.enabled, latched: z.latched }])),
      activeDialogue: this.activeDialogue ? { id: this.activeDialogue.id, nodeId: this.activeDialogue.nodeId } : null,
    });
  }

  /** Restore mutable runtime previously produced by {@link serialize} (def must be loaded). */
  restore(serialized: string): void {
    if (!this.def) return;
    let s: any;
    try { s = JSON.parse(serialized); } catch { return; }
    if (!s || s.v !== 1) return;

    // Reset all quests, timers, rules, and zones back to their default loaded definition values
    // to prevent active session state leaking into the loaded slot.
    for (const q of this.quests.values()) {
      q.state = 'inactive';
      for (const o of q.def.objectives) {
        q.progress.set(o.id, 0);
      }
    }
    for (const t of this.timers.values()) {
      t.running = !!t.def.autoStart;
      t.remaining = t.def.interval;
    }
    for (const r of this.rules) {
      r.enabled = !r.def.disabled;
      r.fired = 0;
      r.lastFired = -Infinity;
    }
    for (const z of this.zones.values()) {
      z.enabled = !z.def.disabled;
      z.latched = false;
      z.inside.clear();
    }
    this.gameStatus = 'playing';
    this.message = undefined;
    this.activeDialogue = null;

    // Apply the serialized overrides
    this.gameStatus = s.status ?? 'playing';
    this.message = s.message;
    this.vars.clear();
    for (const [k, v] of Object.entries(s.vars ?? {})) this.vars.set(k, v as GpValue);
    for (const [id, qs] of Object.entries(s.quests ?? {})) {
      const q = this.quests.get(id);
      if (!q) continue;
      q.state = (qs as any).state ?? 'inactive';
      for (const [oid, p] of Object.entries((qs as any).progress ?? {})) q.progress.set(oid, p as number);
    }
    for (const [id, ts] of Object.entries(s.timers ?? {})) {
      const t = this.timers.get(id);
      if (t) { t.running = !!(ts as any).running; t.remaining = (ts as any).remaining ?? t.def.interval; }
    }
    for (const [id, rs] of Object.entries(s.rules ?? {})) {
      const rt = this.rules.find((r) => r.id === id);
      if (rt) { rt.enabled = !!(rs as any).enabled; rt.fired = (rs as any).fired ?? 0; }
    }
    for (const [id, zs] of Object.entries(s.zones ?? {})) {
      const z = this.zones.get(id);
      if (z) { z.enabled = !!(zs as any).enabled; z.latched = !!(zs as any).latched; }
    }
    if (s.activeDialogue) {
      this.activeDialogue = { id: s.activeDialogue.id, nodeId: s.activeDialogue.nodeId };
      this.presentNode();
    }
  }

  private persist(): void {
    this.host.persist?.(this.serialize());
  }

  dispose(): void {
    for (const u of this.unsubscribers) u();
    this.unsubscribers.length = 0;
    this.reset();
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

function compare(a: GpValue | undefined, op: GpCompare, b: GpValue): boolean {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>': return (a as number) > (b as number);
    case '>=': return (a as number) >= (b as number);
    case '<': return (a as number) < (b as number);
    case '<=': return (a as number) <= (b as number);
    default: return false;
  }
}
