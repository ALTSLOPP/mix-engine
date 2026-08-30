/**
 * TransactionCoordinator — Master Universal Transaction Coordinator for MIX Engine.
 *
 * Coordinates fine-grained inverse operations, state hashing, journaled execution,
 * atomic rollbacks, idempotency deduplication, and crash recovery across all subsystems.
 */

import type { Engine } from '../engine/Engine';
import type { AIBridge, AICommand } from '../ai/AIBridge';
import { TransactionJournal, type TransactionJournalEntry } from './TransactionJournal';
import { SceneStateHasher, type CanonicalProjectState, type CanonicalEntityState } from './SceneStateHasher';
import { InverseFactory, type InverseOperation, type InverseExecutionContext } from './InverseOperation';
import type { PerCommandResult } from '../commands/BatchPlanner';

export interface TransactionExecutionOptions {
  requestKey?: string;
  atomic?: boolean;
  settleMs?: number;
}

export interface TransactionResult {
  ok: boolean;
  transactionId: string;
  beforeHash: string;
  afterHash?: string;
  rolledBack?: boolean;
  replayed?: boolean;
  commandResults: PerCommandResult[];
  error?: string;
}

export class TransactionCoordinator {
  private readonly journal: TransactionJournal;
  private txCounter = 0;

  constructor(
    private readonly engine: Engine,
    private readonly aiBridge: AIBridge,
    journal?: TransactionJournal
  ) {
    this.journal = journal ?? new TransactionJournal();
  }

  get activeJournal(): TransactionJournal {
    return this.journal;
  }

  /**
   * Captures the full canonical state representation for state hashing.
   */
  captureProjectState(): CanonicalProjectState {
    const sm = this.engine.sceneManager;
    const entities: CanonicalEntityState[] = sm.allEntityIds().map((id) => {
      const rb = sm.getRigidBody(id);
      const bp = sm.getBlueprint(id);
      const guid = sm.getGuid(id);
      const name = this.aiBridge.getEntityName(id);
      const tags = this.aiBridge.getEntityTags(id);
      // TransactionCoordinator is also used by lightweight/headless SceneManager
      // implementations. Parent lookup was added after those hosts existed, so keep
      // capture feature-detected instead of making every transaction fail at start.
      const parentGuid = typeof (sm as any).getParentGuid === 'function'
        ? (sm as any).getParentGuid(id)
        : undefined;
      const scriptComp: any = sm.getComponent?.(id, 'script');
      const components: Record<string, unknown> = {};
      if (typeof (sm as any).getAllComponents === 'function') {
        for (const component of (sm as any).getAllComponents(id) ?? []) {
          const type = (component?.constructor as any)?.type ?? component?.constructor?.name;
          if (!type || type === 'RigidBodyComponent' || type === 'ScriptComponent') continue;
          try {
            components[type] = typeof component.serialize === 'function'
              ? component.serialize()
              : snapshotSerializableFields(component);
          } catch {
            components[type] = snapshotSerializableFields(component);
          }
        }
      }

      let pos: [number, number, number] | undefined;
      let rot: [number, number, number, number] | undefined;
      let scale: [number, number, number] | undefined;
      if (rb) {
        pos = [rb.mesh.position.x, rb.mesh.position.y, rb.mesh.position.z];
        rot = [rb.mesh.quaternion.x, rb.mesh.quaternion.y, rb.mesh.quaternion.z, rb.mesh.quaternion.w];
        scale = [rb.mesh.scale.x, rb.mesh.scale.y, rb.mesh.scale.z];
      }

      return {
        guid,
        name,
        kind: bp?.kind,
        tags: tags.length > 0 ? tags.slice().sort() : undefined,
        parentGuid,
        position: pos,
        rotation: rot,
        scale,
        components: Object.keys(components).length > 0 ? components : undefined,
        scriptSource: scriptComp?.sourceCode ?? null,
      };
    });

    const env: Record<string, unknown> = {};
    if ((this.engine as any).sky?.timeOfDay !== undefined) env.timeOfDay = (this.engine as any).sky.timeOfDay;
    if ((this.engine as any).fog?.density !== undefined) env.fogDensity = (this.engine as any).fog.density;

    return {
      entities,
      gameplay: {
        director: typeof (this.engine as any).gameplay?.serialize === 'function' ? (this.engine as any).gameplay.serialize() : undefined,
        inventory: typeof (this.engine as any).items?.serialize === 'function' ? (this.engine as any).items.serialize() : undefined,
        persistentState: typeof (sm as any).gameState?.getAll === 'function' ? (sm as any).gameState.getAll() : undefined,
      },
      environment: Object.keys(env).length > 0 ? env : undefined,
    };
  }

  /**
   * Computes the current state hash of the engine scene.
   */
  computeStateHash(): string {
    const state = this.captureProjectState();
    return SceneStateHasher.hashState(state);
  }

  /**
   * Begins a new transaction.
   */
  beginTransaction(commands: AICommand[], requestKey?: string): string {
    const txId = `tx-${Date.now()}-${++this.txCounter}`;
    const beforeHash = this.computeStateHash();
    this.journal.recordStart({
      transactionId: txId,
      requestKey,
      commands,
      beforeStateHash: beforeHash,
    });
    return txId;
  }

  /**
   * Records an inverse operation for rollback.
   */
  recordInverse(txId: string, inverse: InverseOperation): void {
    this.journal.addInverse(txId, inverse);
  }

  /**
   * Commits the active transaction.
   */
  commit(txId: string, commandResults: PerCommandResult[]): string {
    const afterHash = this.computeStateHash();
    this.journal.recordCommit(txId, afterHash, commandResults);
    return afterHash;
  }

  /**
   * Rolls back an active transaction by executing registered inverse operations in reverse order.
   */
  async rollback(txId: string, error?: string): Promise<{ success: boolean; hashMatched: boolean; error?: string }> {
    const entry = this.journal.get(txId);
    if (!entry) {
      return { success: false, hashMatched: false, error: `Transaction '${txId}' not found in journal.` };
    }

    const execCtx: InverseExecutionContext = {
      engine: this.engine,
      aiBridge: this.aiBridge,
      sceneManager: this.engine.sceneManager,
    };

    let inverseError: string | undefined;
    // Execute inverse operations in reverse chronological order
    const inverses = entry.inverses.slice().reverse();
    for (const inv of inverses) {
      try {
        await inv.execute(execCtx);
      } catch (err) {
        console.error(`[TransactionCoordinator] Failed to execute inverse '${inv.description}':`, err);
        inverseError = (err as Error)?.message ?? String(err);
      }
    }

    const currentHash = this.computeStateHash();
    const hashMatched = currentHash === entry.beforeStateHash;
    this.journal.recordRollback(txId, error ?? inverseError);

    // A rollback is successful only when the authored state is demonstrably back
    // at its pre-transaction hash. An empty inverse list is not proof of recovery.
    const success = !inverseError && hashMatched;
    return {
      success,
      hashMatched,
      error: inverseError ?? (!hashMatched ? 'State hash mismatch after rollback' : error),
    };
  }

  /**
   * Check if a transaction with requestKey was already committed (for idempotency).
   */
  findCommittedRequest(requestKey: string): TransactionJournalEntry | undefined {
    const entry = this.journal.getByRequestKey(requestKey);
    return entry?.status === 'committed' ? entry : undefined;
  }

  /** Execute durable inverses for transactions interrupted before commit. */
  async recoverDanglingTransactions(): Promise<Array<{ transactionId: string; success: boolean; error?: string }>> {
    const results: Array<{ transactionId: string; success: boolean; error?: string }> = [];
    for (const entry of this.journal.detectDanglingTransactions()) {
      const recovered = await this.rollback(entry.transactionId, 'Recovered interrupted transaction.');
      results.push({ transactionId: entry.transactionId, success: recovered.success, error: recovered.error });
    }
    return results;
  }
}

function snapshotSerializableFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (typeof field === 'function' || key.startsWith('_')) continue;
    try {
      const cloned = JSON.parse(JSON.stringify(field));
      if (cloned !== undefined) out[key] = cloned;
    } catch {}
  }
  return out;
}
