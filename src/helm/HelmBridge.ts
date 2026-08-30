import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { AIBridge, AICommand } from '../ai/AIBridge';
import type { EntityId, EntityBlueprint } from '../ecs/SceneManager';
import { SceneDiagnostics, type DiagEntity, type DiagReport } from '../rendering/SceneDiagnostics';
import { SceneDiffer, type EntitySnapshotData } from '../authoring/SceneDiffer';
import { TransactionCoordinator } from '../authoring/TransactionCoordinator';
import { InverseFactory } from '../authoring/InverseOperation';
import { CapabilityGuard } from '../authoring/CapabilityGuard';
import { EditLeaseManager } from '../authoring/EditLeaseManager';
import { HELM_MANIFEST } from './manifest';
import { asCommands, preflightCommands } from './CommandPreflight';
import { resolveCommandRefs, resolveEntityRef, type CommandRefResolution, type EntityRefRecord } from './EntityRefs';
import { BatchPlanner, DataflowResolver, type PerCommandResult } from '../commands';
import type {
  HelmRequest,
  HelmResponse,
  HelmEntityInfo,
  HelmExpectation,
  HelmExpectationResult,
} from './types';

interface Snapshot {
  entities: {
    id: number;
    guid?: string;
    blueprint: EntityBlueprint;
    world: [number, number, number];
    quat: [number, number, number, number];
    scale: [number, number, number];
    bodyType?: string;
    additionalMass?: number;
    parentGuid?: string;
    name?: string;
    tags: string[];
    scriptSource?: string | null;
    components?: Record<string, Record<string, unknown>>;
  }[];
  gameplay?: string;
  inventory?: string;
  gameState?: Record<string, unknown>;
}

const IDLE_CAP_MS = 4000; // hard cap, kept well under the dev server's RPC timeout.

/**
 * HELM — HelmBridge (the control plane).
 *
 * Single entry point `handle(req)` that an IDE agent reaches via /api/helm/rpc → the
 * WS bridge → here, and whose structured result is routed back to the agent. Unlike
 * the fire-and-forget AIBridge, every op returns what actually happened: which
 * entities were created/removed, what errored, the data a query asked for, a
 * human-readable scene description, a raycast hit, etc.
 *
 * It is a thin, non-invasive layer over the existing AIBridge + SceneManager: `do`
 * runs commands through the normal queue, waits for them to settle, then diffs the
 * entity set to report results — so it inherits every command the engine already
 * supports without re-implementing any of them.
 */
export class HelmBridge {
  private aiBridge!: AIBridge;
  private readonly checkpoints = new Map<string, Snapshot>();
  private readonly warnRing: { t: number; text: string }[] = [];
  private readonly errorRing: { t: number; text: string }[] = [];
  /** Guarded applies are serialized so two IDE agents cannot interleave mutations. */
  private applyTail: Promise<void> = Promise.resolve();
  private readonly applyCache = new Map<string, { fingerprint: string; result: Partial<HelmResponse> }>();
  private readonly applyInFlight = new Map<string, { fingerprint: string; promise: Promise<Partial<HelmResponse>> }>();
  /** Originals captured by installConsoleTap, restored in dispose() so HMR reloads
   *  don't stack a new console wrapper on every reconstruction. */
  private _origWarn?: typeof console.warn;
  private _origError?: typeof console.error;

  private readonly _v = new THREE.Vector3();
  private readonly _box = new THREE.Box3();
  private readonly _size = new THREE.Vector3();
  private readonly _ndc = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  /** Render-grounded visual diagnostics (op:'observe' + visual assertions). Lazy: only
   *  built the first time an agent asks to "see", and reuses its tiny offscreen targets. */
  private diagnostics?: SceneDiagnostics;
  private txCoordinator?: TransactionCoordinator;
  private readonly leaseManager = new EditLeaseManager();

  constructor(private readonly engine: Engine, aiBridge: AIBridge | null) {
    if (aiBridge) {
      this.aiBridge = aiBridge;
      this.txCoordinator = new TransactionCoordinator(engine, aiBridge);
    }
    this.installConsoleTap();
  }

  get coordinator(): TransactionCoordinator {
    if (!this.txCoordinator) {
      this.txCoordinator = new TransactionCoordinator(this.engine, this.aiBridge);
    }
    return this.txCoordinator;
  }

  get leases(): EditLeaseManager {
    return this.leaseManager;
  }

  /** Engine constructs the bridge before AIBridge; this closes the link. */
  attachAIBridge(bridge: AIBridge): void {
    this.aiBridge = bridge;
    this.txCoordinator = new TransactionCoordinator(this.engine, bridge);
  }

  // ── Entry point ───────────────────────────────────────────────────────────

  async handle(req: HelmRequest): Promise<HelmResponse> {
    const t0 = performance.now();
    let part: Partial<HelmResponse> = {};
    try {
      switch (req.op) {
        case 'do': part = await this.opDo(req); break;
        case 'plan': part = this.opPlan(req); break;
        case 'apply': part = await this.opApply(req); break;
        case 'resolve': part = this.opResolve(req.ref); break;
        case 'describe': part = this.opDescribe(); break;
        case 'observe': part = this.opObserve(req.filter); break;
        case 'query': part = this.opQuery(req.filter); break;
        case 'get': part = this.opGet(req.entityId); break;
        case 'raycast': part = this.opRaycast(req.screen); break;
        case 'checkpoint': part = this.opCheckpoint(req.name); break;
        case 'restore': part = await this.opRestore(req.name); break;
        case 'checkpoints': part = { data: [...this.checkpoints.keys()], text: `${this.checkpoints.size} checkpoint(s): ${[...this.checkpoints.keys()].join(', ') || '(none)'}` }; break;
        case 'assert': part = this.opAssert(req.expects); break;
        case 'manifest': part = { data: HELM_MANIFEST }; break;
        case 'status': part = this.opStatus(); break;
        case 'find_path': part = this.opFindPath(req); break;
        case 'nav_status': part = this.opNavStatus(); break;
        default: part = { ok: false, error: `unknown op '${(req as { op: string }).op}'` };
      }
    } catch (err) {
      part = { ok: false, error: (err as Error)?.message ?? String(err) };
    }
    return {
      id: req.id,
      op: req.op,
      durationMs: +(performance.now() - t0).toFixed(1),
      ...part,
      ok: part.ok !== false,
    };
  }

  // ── op: do ──────────────────────────────────────────────────────────────

  private async opDo(req: HelmRequest): Promise<Partial<HelmResponse>> {
    const raw = req.commands;
    if (!raw || (Array.isArray(raw) && raw.length === 0)) return { ok: false, error: 'op:do requires `commands`' };

    const batchPlan = BatchPlanner.plan(raw);
    if (!batchPlan.valid) {
      return {
        ok: false,
        error: `Batch dataflow planning failed: ${batchPlan.errors.join('; ')}`,
        errors: batchPlan.errors,
      };
    }

    const beforeAll = new Set(this.engine.sceneManager.allEntityIds());
    const startT = performance.now();
    const bindingsMap = new Map<string, unknown>();
    const commandResults: PerCommandResult[] = [];
    const createdAll: HelmEntityInfo[] = [];
    const removedAll: number[] = [];

    const hasDataflow = batchPlan.bindings.size > 0 || batchPlan.nodes.some((n) => n.dependencies.length > 0);
    const authContext = this.resolveTrustedAuth(req);
    const rolesOrCaps = authContext.rolesOrCapabilities;

    if (!hasDataflow) {
      const refs = resolveCommandRefs(batchPlan.nodes.map((n) => n.command), this.entityRefRecords());
      for (const cmd of refs.commands) {
        const check = this.checkCommandAuthAndLease(cmd as AICommand, rolesOrCaps, authContext.agentId, authContext.leaseId);
        if (!check.allowed) {
          return {
            ok: false,
            error: `Authorization or edit lease check failed: ${check.error}`,
            errors: [check.error!],
          };
        }
      }

      this.aiBridge.executeAll(asCommands(refs.commands));
      await this.awaitSettle(req.settleMs ?? 200);

      const afterIds = this.engine.sceneManager.allEntityIds();
      const after = new Set(afterIds);
      const created = afterIds.filter((id) => !beforeAll.has(id)).map((id) => this.entityInfo(id)).filter((e): e is HelmEntityInfo => !!e);
      const removed = [...beforeAll].filter((id) => !after.has(id));

      const warnings = this.warnRing.filter((w) => w.t >= startT).map((w) => w.text);
      const errors = this.errorRing.filter((e) => e.t >= startT).map((e) => e.text);
      if (created.length || removed.length) this.signalSceneChanged();
      const issuedQuery = batchPlan.nodes.some((n) => n.command.type === 'query_scene');

      return {
        created,
        removed,
        warnings: warnings.length ? warnings : undefined,
        errors: errors.length ? errors : undefined,
        data: issuedQuery ? this.aiBridge.lastQueryResult : undefined,
        ok: errors.length === 0,
        text: `do: ran ${batchPlan.nodes.length} command(s) → +${created.length} entity, -${removed.length} entity` +
          (warnings.length ? `, ${warnings.length} warning(s)` : '') +
          (errors.length ? `, ${errors.length} error(s)` : ''),
      };
    }

    // Dataflow path: execute nodes in dependency order
    for (const nodeIdx of batchPlan.executionOrder) {
      const node = batchPlan.nodes[nodeIdx];
      const nodeStartT = performance.now();
      const beforeNode = new Set(this.engine.sceneManager.allEntityIds());

      // 1. Resolve $ref bindings
      const { resolved: refResolvedCmd, errors: refErrors } = DataflowResolver.resolveRefs(node.command, bindingsMap);
      if (refErrors.length > 0) {
        return {
          ok: false,
          error: `Failed to resolve $ref at command index ${node.index}: ${refErrors.join('; ')}`,
          errors: refErrors,
          commandResults,
          created: createdAll,
          removed: removedAll,
        };
      }

      // 2. Resolve semantic entity refs (@name, guid:, tag:)
      const semResolution = resolveCommandRefs([refResolvedCmd as AICommand], this.entityRefRecords());
      if (semResolution.errors.length > 0) {
        return {
          ok: false,
          error: `Semantic ref resolution failed at command index ${node.index}: ${semResolution.errors.map((e) => e.message).join('; ')}`,
          errors: semResolution.errors.map((e) => e.message),
          commandResults,
          created: createdAll,
          removed: removedAll,
        };
      }

      const finalCmd = semResolution.commands[0] as AICommand;
      const check = this.checkCommandAuthAndLease(finalCmd, rolesOrCaps, authContext.agentId, authContext.leaseId);
      if (!check.allowed) {
        return {
          ok: false,
          error: `Authorization or edit lease check failed at command index ${node.index}: ${check.error}`,
          errors: [check.error!],
          commandResults,
          created: createdAll,
          removed: removedAll,
        };
      }

      this.aiBridge.execute(finalCmd);
      await this.awaitSettle(Math.min(req.settleMs ?? 100, 150));

      const afterNodeIds = this.engine.sceneManager.allEntityIds();
      const afterNodeSet = new Set(afterNodeIds);
      const nodeCreated = afterNodeIds.filter((id) => !beforeNode.has(id)).map((id) => this.entityInfo(id)).filter((e): e is HelmEntityInfo => !!e);
      const nodeRemoved = [...beforeNode].filter((id) => !afterNodeSet.has(id));

      createdAll.push(...nodeCreated);
      removedAll.push(...nodeRemoved);

      const nodeWarnings = this.warnRing.filter((w) => w.t >= nodeStartT).map((w) => w.text);
      const nodeErrors = this.errorRing.filter((e) => e.t >= nodeStartT).map((e) => e.text);

      const nodeResult: PerCommandResult = {
        index: node.index,
        as: node.as,
        id: node.id,
        command: node.command,
        resolvedCommand: finalCmd,
        ok: nodeErrors.length === 0,
        created: nodeCreated,
        removed: nodeRemoved,
        data: this.aiBridge.lastQueryResult,
        warnings: nodeWarnings.length ? nodeWarnings : undefined,
        errors: nodeErrors.length ? nodeErrors : undefined,
      };
      commandResults.push(nodeResult);

      if (node.as) {
        bindingsMap.set(node.as, {
          id: nodeCreated[0]?.id,
          entityId: nodeCreated[0]?.id,
          created: nodeCreated,
          removed: nodeRemoved,
          data: this.aiBridge.lastQueryResult,
          ok: nodeResult.ok,
        });
      }

      if (nodeErrors.length > 0) {
        break;
      }
    }

    const totalWarnings = this.warnRing.filter((w) => w.t >= startT).map((w) => w.text);
    const totalErrors = this.errorRing.filter((e) => e.t >= startT).map((e) => e.text);
    if (createdAll.length || removedAll.length) this.signalSceneChanged();

    const bindingsRecord: Record<string, unknown> = {};
    for (const [k, v] of bindingsMap.entries()) {
      bindingsRecord[k] = v;
    }

    return {
      created: createdAll,
      removed: removedAll,
      commandResults,
      bindings: bindingsRecord,
      warnings: totalWarnings.length ? totalWarnings : undefined,
      errors: totalErrors.length ? totalErrors : undefined,
      data: this.aiBridge.lastQueryResult,
      ok: totalErrors.length === 0,
      text: `do: executed ${commandResults.length}/${batchPlan.nodes.length} command(s) → +${createdAll.length} entity, -${removedAll.length} entity` +
        (totalWarnings.length ? `, ${totalWarnings.length} warning(s)` : '') +
        (totalErrors.length ? `, ${totalErrors.length} error(s)` : ''),
    };
  }

  private checkCommandAuthAndLease(
    cmd: AICommand,
    rolesOrCaps: string[],
    agentId: string,
    leaseId?: string,
  ): { allowed: boolean; error?: string } {
    // The roles passed here come from the trusted transport context, never from
    // caller-controlled request JSON in production.
    const auth = CapabilityGuard.isCommandAllowed(rolesOrCaps, cmd.type);
    if (!auth.allowed) {
      return { allowed: false, error: auth.reason ?? `Unauthorized command '${cmd.type}'.` };
    }

    // 2. Multi-agent edit lease check
    {
      const target = (cmd as any).entityId;
      let targetGuid: string | undefined;
      if (typeof target === 'string') {
        if (target.startsWith('guid:')) targetGuid = target.slice(5);
        else if (target.startsWith('@')) {
          const id = this.engine.sceneManager.getEntityByGuid(target.slice(1));
          if (id !== undefined) targetGuid = this.engine.sceneManager.getGuid(id);
        }
      } else if (typeof target === 'number') {
        targetGuid = this.engine.sceneManager.getGuid(target);
      }
      if (targetGuid && !this.leaseManager.canEditWithLease(targetGuid, agentId, leaseId)) {
        return {
          allowed: false,
          error: `Edit lease violation: Entity '${targetGuid}' is locked by another agent.`,
        };
      }
    }

    return { allowed: true };
  }

  private resolveTrustedAuth(req: HelmRequest): { rolesOrCapabilities: string[]; agentId: string; leaseId?: string } {
    if (req._trustedAuth && Array.isArray(req._trustedAuth.rolesOrCapabilities)) {
      return req._trustedAuth;
    }
    // Unit tests and embedded headless hosts do not cross the HTTP boundary. Keep
    // their explicit role scenarios usable while production direct calls default
    // to read-only instead of accepting self-asserted privileges.
    const isTestHost = typeof process !== 'undefined' && !!process.env.VITEST;
    if (isTestHost) {
      return {
        rolesOrCapabilities: req.roles ?? req.capabilities ?? ['admin'],
        agentId: req.agentId ?? 'vitest-local',
        leaseId: req.leaseId,
      };
    }
    return { rolesOrCapabilities: ['viewer'], agentId: 'untrusted-local' };
  }

  // ── op: plan / apply (agent-safe authoring) ─────────────────────────────

  private opPlan(req: HelmRequest): Partial<HelmResponse> {
    const raw = req.commands;
    const batchPlan = BatchPlanner.plan(raw);
    if (!batchPlan.valid) {
      return {
        ok: false,
        error: `Batch dataflow planning failed: ${batchPlan.errors.join('; ')}`,
        errors: batchPlan.errors,
        data: { valid: false, batchPlan },
        text: `✗ batch plan rejected: ${batchPlan.errors.join('; ')}`,
      };
    }

    const plainCmds = batchPlan.nodes.map((n) => n.command);
    const refs = resolveCommandRefs(plainCmds, this.entityRefRecords());
    const preflight = preflightCommands(refs.commands, req.atomic ?? false);
    const valid = preflight.valid && refs.errors.length === 0 && batchPlan.valid;
    const refLines = refs.errors.map((issue) => `✗ ${issue.path}: ${issue.message}`);
    return {
      ok: valid,
      error: valid ? undefined : 'Command preflight or entity-reference resolution failed; no changes were made.',
      data: { ...preflight, valid, batchPlan, refs: this.refReport(refs), normalizedCommands: refs.commands },
      text: preflight.summary + (preflight.issues.length
        ? `\n${preflight.issues.map((issue) => `${issue.severity === 'error' ? '✗' : '!'} ${issue.path}: ${issue.message}${issue.suggestion ? ` ${issue.suggestion}` : ''}`).join('\n')}`
        : '') + (refLines.length ? `\n${refLines.join('\n')}` : '') + (valid ? `\n✓ batch is ready · ${batchPlan.nodes.length} node(s), ${batchPlan.bindings.size} binding(s)` : ''),
    };
  }

  /** Queue, deduplicate, validate, execute, verify and (when possible) roll back a batch. */
  private opApply(req: HelmRequest): Promise<Partial<HelmResponse>> {
    const requestKey = req.requestKey?.trim();
    if (req.requestKey !== undefined && (!requestKey || requestKey.length > 128)) {
      return Promise.resolve({ ok: false, error: 'op:apply `requestKey` must be 1..128 characters.' });
    }
    const fingerprint = stableJson({ commands: req.commands, expects: req.expects, atomic: req.atomic ?? true, dryRun: !!req.dryRun, settleMs: req.settleMs });

    if (requestKey) {
      const cached = this.applyCache.get(requestKey);
      if (cached) {
        if (cached.fingerprint !== fingerprint) return Promise.resolve({ ok: false, error: `requestKey '${requestKey}' was already used for a different apply payload.` });
        return Promise.resolve({ ...cached.result, replayed: true });
      }
      const active = this.applyInFlight.get(requestKey);
      if (active) {
        if (active.fingerprint !== fingerprint) return Promise.resolve({ ok: false, error: `requestKey '${requestKey}' is already in flight with a different apply payload.` });
        return active.promise.then((result) => ({ ...result, replayed: true }));
      }
    }

    const run = this.applyTail.then(() => this.runApply(req));
    this.applyTail = run.then(() => undefined, () => undefined);
    if (requestKey) {
      this.applyInFlight.set(requestKey, { fingerprint, promise: run });
      void run.then((result) => {
        this.applyInFlight.delete(requestKey);
        this.applyCache.set(requestKey, { fingerprint, result });
        // Bound per-session memory while keeping recent IDE retries safe.
        if (this.applyCache.size > 128) this.applyCache.delete(this.applyCache.keys().next().value!);
      }, () => this.applyInFlight.delete(requestKey));
    }
    return run;
  }

  private async runApply(req: HelmRequest): Promise<Partial<HelmResponse>> {
    const atomic = req.atomic ?? true;
    const batchPlan = BatchPlanner.plan(req.commands);
    if (!batchPlan.valid) {
      return {
        ok: false,
        error: `Batch dataflow planning failed: ${batchPlan.errors.join('; ')}`,
        errors: batchPlan.errors,
        data: { executed: false, batchPlan },
        text: `✗ apply blocked: ${batchPlan.errors.join('; ')}`,
      };
    }

    const plainCmds = batchPlan.nodes.map((n) => n.command);
    const refs = resolveCommandRefs(plainCmds, this.entityRefRecords());
    const preflight = preflightCommands(refs.commands, atomic);
    const valid = preflight.valid && refs.errors.length === 0;
    if (!valid || req.dryRun) {
      return {
        ok: valid,
        error: valid ? undefined : 'Command preflight or entity-reference resolution failed; no changes were made.',
        data: { preflight, batchPlan, refs: this.refReport(refs), normalizedCommands: refs.commands, dryRun: !!req.dryRun, executed: false },
        text: `${preflight.summary}\n${valid ? `✓ dry run only — ${refs.resolved.length} semantic ref(s) normalized; no changes made` : '✗ apply blocked — no changes made'}`,
      };
    }
    if (req.expects !== undefined && (!Array.isArray(req.expects) || req.expects.length === 0)) {
      return { ok: false, error: 'op:apply `expects` must be a non-empty array when provided.', data: { preflight, executed: false } };
    }

    const beforeSnapshot = atomic ? this.captureSnapshot() : undefined;
    const before = this.captureDiffState();
    const txId = this.coordinator.beginTransaction(asCommands(refs.commands), req.requestKey);
    const executed = await this.opDo({ ...req, op: 'do', commands: req.commands });

    if (atomic && executed.created?.length) {
      for (const c of executed.created) {
        if (c.guid) {
          this.coordinator.recordInverse(txId, InverseFactory.spawnInverse(c.guid, c.id));
        }
      }
    }

    const verified = req.expects?.length ? this.opAssert(req.expects) : undefined;
    const failed = executed.ok === false || verified?.ok === false;
    const attemptedDiff = SceneDiffer.diff(before, this.captureDiffState());
    let rolledBack = false;
    let rollbackError: string | undefined;

    if (failed && atomic) {
      try {
        await this.coordinator.rollback(txId, executed.error ?? 'apply failed');
        if (beforeSnapshot) {
          const restored = await this.restoreSnapshot(beforeSnapshot, 'automatic apply rollback');
          rolledBack = restored.ok !== false;
          if (!rolledBack) rollbackError = restored.error ?? 'snapshot restore was incomplete';
        } else {
          rolledBack = true;
        }
      } catch (err) {
        rollbackError = (err as Error)?.message ?? String(err);
      }
    } else if (!failed) {
      this.coordinator.commit(txId, executed.commandResults ?? []);
    }

    const ok = !failed;
    const reason = executed.ok === false ? (executed.error ?? 'command errors') : verified?.ok === false ? 'postconditions failed' : undefined;
    return {
      ok,
      error: ok ? undefined : `${reason ?? 'apply failed'}${rolledBack ? '; scene restored automatically' : rollbackError ? `; rollback failed: ${rollbackError}` : ''}`,
      warnings: executed.warnings,
      errors: executed.errors,
      created: executed.created,
      removed: executed.removed,
      commandResults: executed.commandResults,
      bindings: executed.bindings,
      expectations: verified?.expectations,
      rolledBack,
      data: {
        transactionId: txId,
        preflight,
        batchPlan,
        refs: this.refReport(refs),
        normalizedCommands: refs.commands,
        executed: true,
        atomic,
        diff: attemptedDiff,
        postconditionsPassed: verified ? verified.ok !== false : undefined,
        finalEntityCount: this.engine.sceneManager.entityCount,
      },
      text: ok
        ? `apply: ${preflight.commandCount} command(s) committed · +${attemptedDiff.added.length} -${attemptedDiff.removed.length} ~${attemptedDiff.modified.length}`
        : `apply: ${reason ?? 'failed'}${rolledBack ? ' · rolled back' : atomic ? ' · ROLLBACK FAILED' : ' · atomic=false (changes kept)'}`,
    };
  }

  // ── op: resolve (stable semantic entity identity) ───────────────────────

  private opResolve(ref: unknown): Partial<HelmResponse> {
    if (ref === undefined) return { ok: false, error: 'op:resolve requires `ref`.' };
    const result = resolveEntityRef(ref, this.entityRefRecords());
    if (!result.ok) {
      return { ok: false, error: result.error, data: result, text: `resolve ${formatRef(ref)} → ${result.error}` };
    }
    const info = this.entityInfo(result.id!);
    return { data: { ref, entity: info }, text: `resolve ${formatRef(ref)} → #${result.id}${info?.name ? ` "${info.name}"` : ''}` };
  }

  // ── op: describe / query / get ────────────────────────────────────────────

  private opDescribe(): Partial<HelmResponse> {
    const ids = this.engine.sceneManager.allEntityIds();
    const withSize = ids.length <= 150;
    const entities = ids
      .map((id) => this.entityInfo(id, withSize))
      .filter((e): e is HelmEntityInfo => !!e);
    const cam = this.engine.viewport.camera;
    this.engine.worldOrigin.toWorldSpaceInto(this._v, cam.position);
    const camWorld = { x: r2(this._v.x), y: r2(this._v.y), z: r2(this._v.z) };
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const selId = this.selectedEntityId();
    const possessed = this.engine.player.getPossessedId();

    // Scene bounds in world space.
    const bounds = this.worldBounds(entities);

    const lines: string[] = [];
    lines.push(`HELM scene — ${entities.length} entities · mode=${this.engine.input.mode}` +
      (selId !== null ? ` · selected #${selId}` : '') +
      (possessed !== null ? ` · possessed #${possessed}` : ''));
    lines.push(`camera @ (${camWorld.x}, ${camWorld.y}, ${camWorld.z}) looking (${r2(dir.x)}, ${r2(dir.y)}, ${r2(dir.z)})`);
    if (bounds) lines.push(`bounds x[${bounds.min.x}, ${bounds.max.x}] y[${bounds.min.y}, ${bounds.max.y}] z[${bounds.min.z}, ${bounds.max.z}]`);
    lines.push('entities:');
    for (const e of entities.slice(0, 60)) {
      lines.push(`  #${e.id} ${e.kind ?? '?'}${e.name ? ` "${e.name}"` : ''} @ (${e.position.x}, ${e.position.y}, ${e.position.z})` +
        (e.tags && e.tags.length ? ` tags=[${e.tags.join(',')}]` : ''));
    }
    if (entities.length > 60) lines.push(`  … and ${entities.length - 60} more`);

    return {
      data: {
        entityCount: entities.length,
        mode: this.engine.input.mode,
        selected: selId,
        possessed,
        camera: { position: camWorld, direction: { x: r2(dir.x), y: r2(dir.y), z: r2(dir.z) } },
        bounds,
        entities,
      },
      text: lines.join('\n'),
    };
  }

  // ── op: observe (render-grounded visual grounding) ──────────────────────────

  /** The agent's "look at the screen": render-ground the scene and report frame health
   *  + per-entity on-screen pixel coverage + plain-English anomalies. Reaches the truth
   *  a state query can't — an entity can exist yet draw zero pixels (invisible/occluded). */
  private opObserve(filter?: { kind?: string; tag?: string; name?: string }): Partial<HelmResponse> {
    const report = this.runDiagnostics(filter);
    if (!report) return { ok: false, error: 'op:observe needs a WebGL renderer (none available)' };
    return {
      data: report,
      warnings: report.anomalies.length ? report.anomalies : undefined,
      text: SceneDiagnostics.summarize(report),
    };
  }

  private getDiagnostics(): SceneDiagnostics | null {
    if (!this.diagnostics) {
      const vp = this.engine.viewport;
      if (!vp?.renderer || !vp.scene || !vp.camera) return null;
      this.diagnostics = new SceneDiagnostics(vp.renderer, vp.scene, vp.camera);
    }
    return this.diagnostics;
  }

  /** Build the diagnostic entity list (id + root Object3D + name/kind) for an optional filter. */
  private diagEntities(filter?: { kind?: string; tag?: string; name?: string }): DiagEntity[] {
    const sm = this.engine.sceneManager;
    const out: DiagEntity[] = [];
    for (const id of sm.allEntityIds()) {
      const rb = sm.getRigidBody(id);
      if (!rb) continue;
      const kind = sm.getBlueprint(id)?.kind;
      const name = this.aiBridge.getEntityName(id);
      const tags = this.aiBridge.getEntityTags(id);
      if (filter?.kind && kind !== filter.kind) continue;
      if (filter?.name && name !== filter.name) continue;
      if (filter?.tag && !tags?.includes(filter.tag)) continue;
      out.push({ id, object: rb.mesh, name, kind });
    }
    return out;
  }

  private runDiagnostics(filter?: { kind?: string; tag?: string; name?: string }): DiagReport | null {
    const diag = this.getDiagnostics();
    if (!diag) return null;
    return diag.analyze(this.diagEntities(filter));
  }

  private opQuery(filter?: { kind?: string; tag?: string; name?: string }): Partial<HelmResponse> {
    const ids = this.engine.sceneManager.allEntityIds();
    const withSize = ids.length <= 150;
    let entities = ids
      .map((id) => this.entityInfo(id, withSize))
      .filter((e): e is HelmEntityInfo => !!e);
    if (filter?.kind) entities = entities.filter((e) => e.kind === filter.kind);
    if (filter?.tag) entities = entities.filter((e) => e.tags?.includes(filter.tag!));
    if (filter?.name) entities = entities.filter((e) => e.name === filter.name);
    return {
      data: { count: entities.length, entities },
      text: `query → ${entities.length} entit${entities.length === 1 ? 'y' : 'ies'}` +
        (filter ? ` matching ${JSON.stringify(filter)}` : ''),
    };
  }

  private opGet(entityId?: number): Partial<HelmResponse> {
    if (entityId === undefined) return { ok: false, error: 'op:get requires `entityId`' };
    const info = this.entityInfo(entityId);
    if (!info) return { ok: false, error: `entity #${entityId} not found` };
    return { data: info, text: `#${info.id} ${info.kind ?? '?'}${info.name ? ` "${info.name}"` : ''} @ (${info.position.x}, ${info.position.y}, ${info.position.z})` };
  }

  // ── op: raycast ───────────────────────────────────────────────────────────

  private opRaycast(screen?: { x: number; y: number }): Partial<HelmResponse> {
    const x = screen?.x ?? 0.5;
    const y = screen?.y ?? 0.5;
    this._ndc.set(x * 2 - 1, -(y * 2 - 1));
    this.raycaster.setFromCamera(this._ndc, this.engine.viewport.camera);
    const meshes = this.engine.sceneManager.rigidBodyList.map((rb) => rb.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (!hits.length) return { data: { hit: false }, text: `raycast (${x}, ${y}) → nothing` };
    const rb = this.engine.sceneManager.pickRigidBody(hits[0].object);
    const id = rb ? this.engine.sceneManager.entityOf(rb) : null;
    this.engine.worldOrigin.toWorldSpaceInto(this._v, hits[0].point);
    const point = { x: r2(this._v.x), y: r2(this._v.y), z: r2(this._v.z) };
    const info = id !== null ? this.entityInfo(id) : null;
    return {
      data: { hit: true, entity: info, distance: r2(hits[0].distance), point },
      text: info
        ? `raycast → #${info.id} ${info.kind ?? '?'}${info.name ? ` "${info.name}"` : ''} at (${point.x}, ${point.y}, ${point.z}), ${r2(hits[0].distance)}m`
        : `raycast → unowned mesh at (${point.x}, ${point.y}, ${point.z})`,
    };
  }

  // ── op: checkpoint / restore ──────────────────────────────────────────────

  private opCheckpoint(name?: string): Partial<HelmResponse> {
    if (!name) return { ok: false, error: 'op:checkpoint requires `name`' };
    const snap = this.captureSnapshot();
    this.checkpoints.set(name, snap);
    return { data: { name, entities: snap.entities.length }, text: `checkpoint '${name}' saved (${snap.entities.length} entities)` };
  }

  private captureSnapshot(): Snapshot {
    const sm = this.engine.sceneManager;
    const snap: Snapshot = {
      entities: [],
      gameplay: typeof (this.engine as any).gameplay?.serialize === 'function' ? (this.engine as any).gameplay.serialize() : undefined,
      inventory: typeof (this.engine as any).items?.serialize === 'function' ? (this.engine as any).items.serialize() : undefined,
      gameState: typeof (sm as any).gameState?.getAll === 'function' ? cloneJson((sm as any).gameState.getAll()) : undefined,
    };
    const guidById = new Map<number, string>();
    for (const id of sm.allEntityIds()) {
      const guid = sm.getGuid(id) ?? sm.ensureGuid(id);
      guidById.set(id, guid);
    }
    for (const id of sm.allEntityIds()) {
      const rb = sm.getRigidBody(id);
      const bp = sm.getBlueprint(id);
      if (!rb || !bp) continue;
      this.engine.worldOrigin.toWorldSpaceInto(this._v, rb.mesh.position);
      const q = rb.mesh.quaternion;
      const s = rb.mesh.scale;
      const parent = sm.getParent(id);
      const scriptComp: any = sm.getComponent?.(id, 'script');
      const components: Record<string, Record<string, unknown>> = {};
      for (const component of sm.getAllComponents?.(id) ?? []) {
        const componentType = (component?.constructor as any)?.type ?? component?.constructor?.name;
        if (!componentType || componentType === 'RigidBodyComponent' || componentType === 'ScriptComponent') continue;
        try {
          components[componentType] = cloneJson(typeof (component as any).serialize === 'function' ? (component as any).serialize() : {});
        } catch {}
      }
      snap.entities.push({
        id,
        guid: guidById.get(id),
        blueprint: cloneJson(bp),
        world: [r4(this._v.x), r4(this._v.y), r4(this._v.z)],
        quat: [q.x, q.y, q.z, q.w],
        scale: [s.x, s.y, s.z],
        bodyType: this.bodyTypeStr(rb),
        additionalMass: rb.additionalMass,
        parentGuid: parent !== undefined ? guidById.get(parent) : undefined,
        name: this.aiBridge.getEntityName(id),
        tags: this.aiBridge.getEntityTags(id),
        scriptSource: scriptComp?.sourceCode ?? null,
        components: Object.keys(components).length ? components : undefined,
      });
    }
    return snap;
  }

  private async opRestore(name?: string): Promise<Partial<HelmResponse>> {
    if (!name) return { ok: false, error: 'op:restore requires `name`' };
    const snap = this.checkpoints.get(name);
    if (!snap) return { ok: false, error: `checkpoint '${name}' not found` };
    return this.restoreSnapshot(snap, `checkpoint '${name}'`);
  }

  private async restoreSnapshot(snap: Snapshot, label: string): Promise<Partial<HelmResponse>> {
    const sm = this.engine.sceneManager;
    this.engine.gizmo.detach();

    // Preload any GLB-backed assets the snapshot needs BEFORE clearing the scene.
    // Destroying the last instance of an asset drops its cache refcount to zero (the
    // asset is evicted), so without this re-preload a character/glbInstance rebuild
    // would throw and the restore would abort partway. Preloading is idempotent.
    const assetIds = [...new Set(
      snap.entities.map((e) => (e.blueprint.params as { assetId?: string })?.assetId).filter((x): x is string => !!x),
    )];
    if (assetIds.length && this.engine.manifest?.preload) { try { await this.engine.manifest.preload(assetIds); } catch (err) { console.warn('[HELM] restore preload failed:', err); } }

    for (const id of sm.allEntityIds()) sm.requestDestroy(id);
    sm.flushDeferredOperations();

    let restored = 0;
    let failed = 0;
    const guidToId = new Map<string, number>();
    for (const e of snap.entities) {
      try {
        const id = sm.spawnNow(new THREE.Vector3(e.world[0], e.world[1], e.world[2]), e.blueprint, {
          rootMotion: e.blueprint.kind === 'character',
          guid: e.guid,
        });
        const rb = sm.getRigidBody(id);
        if (e.guid) { sm.setGuid(id, e.guid); guidToId.set(e.guid, id); }
        if (rb) {
          rb.mesh.scale.set(e.scale[0], e.scale[1], e.scale[2]);
          rb.rescaleCollider();
          rb.teleport(rb.mesh.position.clone(), new THREE.Quaternion(e.quat[0], e.quat[1], e.quat[2], e.quat[3]));
          if (e.additionalMass !== undefined) rb.setAdditionalMass(e.additionalMass);
          try {
            const R = this.engine.physicsWorld.RAPIER;
            if (e.bodyType === 'fixed') rb.rapierBody.setBodyType(R.RigidBodyType.Fixed, true);
            else if (e.bodyType === 'kinematic') rb.rapierBody.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
            else if (e.bodyType === 'dynamic') rb.rapierBody.setBodyType(R.RigidBodyType.Dynamic, true);
          } catch { /* mock/unsupported Rapier body type API */ }
        }
        if (e.name) this.aiBridge.setEntityName(id, e.name);
        for (const tag of e.tags) this.aiBridge.addEntityTag(id, tag);
        if (e.scriptSource && typeof (sm as any).addScript === 'function') {
          (sm as any).addScript(id, e.scriptSource);
        }
        for (const [component, props] of Object.entries(e.components ?? {})) {
          this.aiBridge.execute({ type: 'component_add', entityId: id, component, props });
        }
        restored++;
      } catch (err) {
        failed++;
        console.warn(`[HELM] restore: failed to rebuild ${e.blueprint.kind}:`, (err as Error).message);
      }
    }
    for (const e of snap.entities) {
      if (!e.guid || !e.parentGuid) continue;
      const child = guidToId.get(e.guid); const parent = guidToId.get(e.parentGuid);
      if (child !== undefined && parent !== undefined) sm.parentEntity(child, parent);
    }
    sm.flushDeferredOperations();
    await this.awaitSettle(0);
    if (snap.gameState && typeof (sm as any).gameState?.clear === 'function') {
      (sm as any).gameState.clear();
      for (const [key, value] of Object.entries(snap.gameState)) (sm as any).gameState.setItem(key, value);
    }
    if (snap.gameplay && typeof (this.engine as any).gameplay?.restore === 'function') (this.engine as any).gameplay.restore(snap.gameplay);
    if (snap.inventory && typeof (this.engine as any).items?.restore === 'function') (this.engine as any).items.restore(snap.inventory);
    this.signalSceneChanged();
    return {
      data: { label, restored, failed },
      ok: failed === 0,
      error: failed ? `${failed} entity/entities could not be restored` : undefined,
      text: `restored ${label} (${restored} entities${failed ? `, ${failed} failed` : ''}). Note: entity ids are reissued; GUIDs are preserved.`,
    };
  }

  // ── op: assert ────────────────────────────────────────────────────────────

  private opAssert(expects?: HelmExpectation[]): Partial<HelmResponse> {
    if (!expects || !expects.length) return { ok: false, error: 'op:assert requires `expects`' };
    // Render-grounded assertions (entity_visible / frame_renders) need ONE diagnostics
    // pass; compute it once and share it across every expectation in the batch.
    const needsVisual = expects.some((e) => e.kind === 'entity_visible' || e.kind === 'frame_renders');
    const report = needsVisual ? this.runDiagnostics() : null;
    const results: HelmExpectationResult[] = expects.map((ex) => this.evalExpectation(ex, report));
    const ok = results.every((r) => r.passed);
    const text = results.map((r) => `${r.passed ? '✓' : '✗'} ${r.message}`).join('\n');
    return { expectations: results, ok, text };
  }

  private evalExpectation(ex: HelmExpectation, report?: DiagReport | null): HelmExpectationResult {
    const sm = this.engine.sceneManager;
    const infos = sm.allEntityIds().map((id) => this.entityInfo(id)).filter((e): e is HelmEntityInfo => !!e);
    switch (ex.kind) {
      case 'entity_exists': {
        const hit = infos.find((e) =>
          (ex.name === undefined || e.name === ex.name) &&
          (ex.tag === undefined || e.tags?.includes(ex.tag)) &&
          (ex.entityKind === undefined || e.kind === ex.entityKind));
        const sel = [ex.name && `name="${ex.name}"`, ex.tag && `tag="${ex.tag}"`, ex.entityKind && `kind="${ex.entityKind}"`].filter(Boolean).join(' ');
        return { expectation: ex, passed: !!hit, message: `entity_exists ${sel || '(any)'} → ${hit ? `found #${hit.id}` : 'not found'}` };
      }
      case 'entity_count': {
        let matched = infos;
        if (ex.entityKind) matched = matched.filter((e) => e.kind === ex.entityKind);
        if (ex.tag) matched = matched.filter((e) => e.tags?.includes(ex.tag!));
        const n = matched.length;
        const passed = ex.op === 'eq' ? n === ex.value : ex.op === 'gte' ? n >= ex.value : n <= ex.value;
        return { expectation: ex, passed, message: `entity_count ${ex.entityKind ?? 'all'} = ${n} (want ${ex.op} ${ex.value})` };
      }
      case 'entity_near': {
        const e = infos.find((i) => i.name === ex.name);
        if (!e) return { expectation: ex, passed: false, message: `entity_near "${ex.name}" → not found` };
        const d = Math.hypot(e.position.x - ex.position[0], e.position.y - ex.position[1], e.position.z - ex.position[2]);
        return { expectation: ex, passed: d <= ex.radius, message: `entity_near "${ex.name}" → ${r2(d)}m from target (want ≤ ${ex.radius})` };
      }
      case 'no_errors': {
        const recent = this.errorRing.filter((e) => performance.now() - e.t < 3000);
        return { expectation: ex, passed: recent.length === 0, message: `no_errors → ${recent.length} console error(s) in last 3s` };
      }
      case 'entity_visible': {
        const sel = [ex.name && `name="${ex.name}"`, ex.tag && `tag="${ex.tag}"`, ex.entityKind && `kind="${ex.entityKind}"`].filter(Boolean).join(' ') || '(any)';
        if (!report) return { expectation: ex, passed: false, message: `entity_visible ${sel} → no render available (need a WebGL viewport)` };
        const minPct = ex.minCoveragePct ?? 0; // percent of screen
        const cand = report.entities.filter((e) =>
          (ex.name === undefined || e.name === ex.name) &&
          (ex.entityKind === undefined || e.kind === ex.entityKind) &&
          (ex.tag === undefined || this.aiBridge.getEntityTags(e.id)?.includes(ex.tag)));
        if (!cand.length) return { expectation: ex, passed: false, message: `entity_visible ${sel} → no matching entity in scene` };
        const best = cand.reduce((a, b) => (b.coveragePct > a.coveragePct ? b : a));
        const passed = best.visible && best.coveragePct * 100 >= minPct;
        const where = best.visible ? `${(best.coveragePct * 100).toFixed(2)}% of screen @ (${best.screen?.x}, ${best.screen?.y})` : 'NOT VISIBLE (0 px)';
        return { expectation: ex, passed, message: `entity_visible ${sel} → #${best.id} ${where}${best.flags.length ? ` [${best.flags.join(',')}]` : ''} (want ≥ ${minPct}%)` };
      }
      case 'frame_renders': {
        if (!report) return { expectation: ex, passed: false, message: 'frame_renders → no render available (need a WebGL viewport)' };
        const f = report.frame;
        const passed = !f.isBlack && !f.isBlownOut;
        const state = f.isBlack ? 'BLACK' : f.isBlownOut ? 'BLOWN OUT' : 'ok';
        return { expectation: ex, passed, message: `frame_renders → avg luminance ${f.avgLuminance}/255 — ${state}` };
      }
      default:
        return { expectation: ex, passed: false, message: `unknown expectation ${JSON.stringify(ex)}` };
    }
  }

  // ── op: status ────────────────────────────────────────────────────────────

  private opStatus(): Partial<HelmResponse> {
    const data = {
      alive: true,
      entityCount: this.engine.sceneManager.entityCount,
      mode: this.engine.input.mode,
      possessed: this.engine.player.getPossessedId(),
      selected: this.selectedEntityId(),
      testMode: this.engine.isTestMode,
      sensoriumActive: this.engine.sensorium.isActive,
      recentErrors: this.errorRing.filter((e) => performance.now() - e.t < 5000).length,
    };
    return { data, text: `HELM alive · ${data.entityCount} entities · mode=${data.mode}` + (data.sensoriumActive ? ' · SENSORIUM running' : '') };
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private entityInfo(id: EntityId, withSize = true): HelmEntityInfo | null {
    const sm = this.engine.sceneManager;
    const rb = sm.getRigidBody(id);
    if (!rb) return null;
    const bp = sm.getBlueprint(id);
    this.engine.worldOrigin.toWorldSpaceInto(this._v, rb.mesh.position);
    const info: HelmEntityInfo = {
      id,
      guid: sm.getGuid(id),
      kind: bp?.kind,
      name: this.aiBridge.getEntityName(id),
      tags: this.aiBridge.getEntityTags(id),
      position: { x: r2(this._v.x), y: r2(this._v.y), z: r2(this._v.z) },
      bodyType: this.bodyTypeStr(rb),
    };
    // Box3.setFromObject is O(verts) — skip it on large scenes to keep describe/query snappy.
    if (withSize) {
      try {
        this._box.setFromObject(rb.mesh);
        if (!this._box.isEmpty() && isFinite(this._box.min.x) && isFinite(this._box.max.x)) {
          this._box.getSize(this._size);
          info.size = { x: r2(this._size.x), y: r2(this._size.y), z: r2(this._size.z) };
        }
      } catch { /* skinned/empty mesh — skip size */ }
    }
    return info;
  }

  private entityRefRecords(): EntityRefRecord[] {
    const sm = this.engine.sceneManager;
    return sm.allEntityIds().map((id) => ({
      id,
      guid: sm.getGuid(id),
      name: this.aiBridge.getEntityName(id),
      tags: this.aiBridge.getEntityTags(id),
    }));
  }

  private refReport(refs: CommandRefResolution): Pick<CommandRefResolution, 'resolved' | 'errors'> {
    return { resolved: refs.resolved, errors: refs.errors };
  }

  /** Canonical lightweight state used to make every apply response diff-friendly. */
  private captureDiffState(): EntitySnapshotData[] {
    const sm = this.engine.sceneManager;
    return sm.allEntityIds().map((id) => {
      const info = this.entityInfo(id, false);
      const rb = sm.getRigidBody(id);
      return {
        id,
        kind: info?.kind,
        name: info?.name,
        tags: info?.tags,
        position: info?.position,
        rotation: rb ? { x: r4(rb.mesh.quaternion.x), y: r4(rb.mesh.quaternion.y), z: r4(rb.mesh.quaternion.z), w: r4(rb.mesh.quaternion.w) } : undefined,
      };
    });
  }

  /** Notify the editor UI (outliner/inspector) that the scene changed under it. */
  private signalSceneChanged(): void {
    if (typeof window === 'undefined') return;
    try { window.dispatchEvent(new CustomEvent('mix:scene-changed')); } catch { /* non-DOM env */ }
  }

  private bodyTypeStr(rb: ReturnType<Engine['sceneManager']['getRigidBody']>): string {
    const b = (rb as NonNullable<typeof rb>).rapierBody;
    if (b.isFixed()) return 'fixed';
    if (b.isKinematic()) return 'kinematic';
    return 'dynamic';
  }

  private selectedEntityId(): EntityId | null {
    const rb = this.engine.gizmo.attached;
    if (!rb) return null;
    return this.engine.sceneManager.entityOf(rb);
  }

  private worldBounds(entities: HelmEntityInfo[]): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null {
    if (!entities.length) return null;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const e of entities) {
      min.x = Math.min(min.x, e.position.x); max.x = Math.max(max.x, e.position.x);
      min.y = Math.min(min.y, e.position.y); max.y = Math.max(max.y, e.position.y);
      min.z = Math.min(min.z, e.position.z); max.z = Math.max(max.z, e.position.z);
    }
    return {
      min: { x: r1(min.x), y: r1(min.y), z: r1(min.z) },
      max: { x: r1(max.x), y: r1(max.y), z: r1(max.z) },
    };
  }

  /**
   * Wait for a `do` batch to actually take effect: first the command queue drains
   * (commands dispatched), then the entity count holds steady for `settleMs` (so async
   * GLB spawns / destroys that land later — when the engine loop flushes the deferred
   * op — are captured even on a slow or throttled engine, instead of being missed by a
   * fixed timer). Capped at IDLE_CAP_MS so a fully-stalled loop still returns a result.
   *
   * Polls with setTimeout (NOT requestAnimationFrame) on purpose: the engine tab is
   * usually backgrounded while the agent works in its IDE, and browsers pause rAF in
   * background tabs — a timer keeps firing, so HELM never hangs.
   */
  private awaitSettle(settleMs: number): Promise<void> {
    return new Promise((resolve) => {
      const deadline = performance.now() + IDLE_CAP_MS;
      let steadySince = 0;
      const settled = () =>
        this.aiBridge.pendingCommandCount === 0 &&   // all commands dispatched
        this.aiBridge.inFlightAsync === 0 &&         // async handlers (GLB spawn, load) done
        !this.engine.sceneManager.hasPendingDeferredOps(); // deferred spawns/destroys flushed
      const check = () => {
        const now = performance.now();
        if (settled()) { if (steadySince === 0) steadySince = now; }
        else steadySince = 0;
        if ((steadySince !== 0 && now - steadySince >= settleMs) || now >= deadline) resolve();
        else setTimeout(check, 20);
      };
      setTimeout(check, 20);
    });
  }

  /** Permanent, additive console tap → rolling rings used by op:do error reporting + no_errors. */
  private installConsoleTap(): void {
    const tap = (ring: { t: number; text: string }[], orig: (...a: unknown[]) => void) =>
      (...args: unknown[]) => {
        orig(...args);
        ring.push({ t: performance.now(), text: args.map(stringify).join(' ') });
        if (ring.length > 100) ring.shift();
      };
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);
    this._origWarn = console.warn;
    this._origError = console.error;
    console.warn = tap(this.warnRing, origWarn);
    console.error = tap(this.errorRing, origError);
  }

  /** Restore the console functions this bridge wrapped. Called by Engine.dispose. */
  dispose(): void {
    if (this._origWarn) { console.warn = this._origWarn; this._origWarn = undefined; }
    if (this._origError) { console.error = this._origError; this._origError = undefined; }
    this.diagnostics?.dispose();
    this.diagnostics = undefined;
  }

  // ── op: find_path / nav_status (NavigationSystem) ──────────────────────────

  private opFindPath(req: HelmRequest): Partial<HelmResponse> {
    if (!req.from || !req.to) return { ok: false, error: 'op:find_path requires `from` and `to` (world [x,y,z])' };
    const nav = this.engine.nav;
    if (!nav.hasNavMesh) return { ok: false, error: 'no navmesh — send a navmesh_build command first' };
    const from = new THREE.Vector3(req.from[0], req.from[1], req.from[2]);
    const to = new THREE.Vector3(req.to[0], req.to[1], req.to[2]);
    const r = nav.findPath(from, to, { smooth: req.smooth ?? true, goalTolerance: req.goalTolerance });
    const waypoints = r.waypoints.map((p) => [r4(p.x), r4(p.y), r4(p.z)] as [number, number, number]);
    return {
      data: { found: r.found, reason: r.reason, expansions: r.expansions, length: r2(r.length), waypoints },
      ok: r.found,
      error: r.found ? undefined : `no path (${r.reason ?? 'unreachable'})`,
      text: r.found
        ? `path: ${waypoints.length} waypoints, ${r2(r.length)}m (expanded ${r.expansions} cells)`
        : `no path from [${req.from}] to [${req.to}] (${r.reason ?? 'unreachable'})`,
    };
  }

  private opNavStatus(): Partial<HelmResponse> {
    const nav = this.engine.nav;
    const stats = nav.lastBuildStats;
    const agents = nav.listAgents();
    return {
      data: {
        hasNavMesh: nav.hasNavMesh,
        building: nav.navMeshBuilding,
        agentCount: nav.agentCount,
        stats,
        agents,
      },
      text: `nav: ${nav.hasNavMesh ? `mesh ${stats?.cells ?? 0} cells (${stats?.walkable ?? 0} walkable)` : 'no mesh'}, ${agents.length} agent(s)`,
    };
  }
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
function r1(n: number): number { return Math.round(n * 10) / 10; }
function r2(n: number): number { return Math.round(n * 100) / 100; }
function r4(n: number): number { return Math.round(n * 10000) / 10000; }
function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function formatRef(ref: unknown): string { try { return JSON.stringify(ref); } catch { return String(ref); } }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}
