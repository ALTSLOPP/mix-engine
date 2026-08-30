/**
 * TransactionJournal — Durable log of authoring transactions for auditing,
 * atomic rollbacks, idempotency checking, and crash recovery.
 */

import type { AICommand } from '../ai/AIBridge';
import { InverseFactory, type InverseOperation } from './InverseOperation';
import type { PerCommandResult } from '../commands/BatchPlanner';
import { AtomicFileOps } from '../project/AtomicFileOps';

export type TransactionStatus = 'active' | 'committed' | 'rolled_back' | 'failed';

export interface TransactionJournalEntry {
  transactionId: string;
  requestKey?: string;
  status: TransactionStatus;
  timestamp: number;
  commands: AICommand[];
  commandHashes: string[];
  beforeStateHash: string;
  afterStateHash?: string;
  inverses: InverseOperation[];
  commandResults: PerCommandResult[];
  error?: string;
  recoveryInfo?: Record<string, unknown>;
}

export class TransactionJournal {
  private readonly entries = new Map<string, TransactionJournalEntry>();
  private readonly requestKeyMap = new Map<string, string>(); // requestKey -> transactionId
  private readonly maxHistory: number;
  private persistenceTail: Promise<unknown> = Promise.resolve();

  constructor(maxHistory = 200, private readonly persistencePath?: string) {
    this.maxHistory = maxHistory;
  }

  /** Starts a new transaction entry in the journal */
  recordStart(entry: {
    transactionId: string;
    requestKey?: string;
    commands: AICommand[];
    beforeStateHash: string;
  }): TransactionJournalEntry {
    const record: TransactionJournalEntry = {
      transactionId: entry.transactionId,
      requestKey: entry.requestKey,
      status: 'active',
      timestamp: Date.now(),
      commands: entry.commands,
      commandHashes: entry.commands.map((c) => JSON.stringify(c)),
      beforeStateHash: entry.beforeStateHash,
      inverses: [],
      commandResults: [],
    };

    if (this.entries.size >= this.maxHistory) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) {
        const oldEntry = this.entries.get(oldestKey);
        if (oldEntry?.requestKey) this.requestKeyMap.delete(oldEntry.requestKey);
        this.entries.delete(oldestKey);
      }
    }

    this.entries.set(entry.transactionId, record);
    if (entry.requestKey) {
      this.requestKeyMap.set(entry.requestKey, entry.transactionId);
    }
    this.persistConfigured();
    return record;
  }

  /** Appends an inverse operation to an active transaction */
  addInverse(transactionId: string, inverse: InverseOperation): void {
    const entry = this.entries.get(transactionId);
    if (entry && entry.status === 'active') {
      entry.inverses.push(inverse);
      this.persistConfigured();
    }
  }

  /** Marks a transaction committed */
  recordCommit(transactionId: string, afterStateHash: string, results: PerCommandResult[]): void {
    const entry = this.entries.get(transactionId);
    if (entry) {
      entry.status = 'committed';
      entry.afterStateHash = afterStateHash;
      entry.commandResults = results;
      this.persistConfigured();
    }
  }

  /** Marks a transaction rolled back */
  recordRollback(transactionId: string, error?: string): void {
    const entry = this.entries.get(transactionId);
    if (entry) {
      entry.status = 'rolled_back';
      entry.error = error;
      this.persistConfigured();
    }
  }

  /** Marks a transaction failed without rollback */
  recordFailure(transactionId: string, error: string): void {
    const entry = this.entries.get(transactionId);
    if (entry) {
      entry.status = 'failed';
      entry.error = error;
      this.persistConfigured();
    }
  }

  /** Find entry by transaction ID */
  get(transactionId: string): TransactionJournalEntry | undefined {
    return this.entries.get(transactionId);
  }

  /** Find entry by requestKey (for idempotency deduplication) */
  getByRequestKey(requestKey: string): TransactionJournalEntry | undefined {
    const txId = this.requestKeyMap.get(requestKey);
    return txId ? this.entries.get(txId) : undefined;
  }

  /** Returns recent history */
  getRecent(limit = 20): readonly TransactionJournalEntry[] {
    return Array.from(this.entries.values()).slice(-limit);
  }

  /** Check for dangling uncommitted transactions on boot/restart */
  detectDanglingTransactions(): TransactionJournalEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.status === 'active');
  }

  /** Clear journal history */
  clear(): void {
    this.entries.clear();
    this.requestKeyMap.clear();
    this.persistConfigured();
  }

  /** Serializes journal entries for durable storage */
  serialize(): string {
    const list: any[] = [];
    for (const e of this.entries.values()) {
      list.push({
        transactionId: e.transactionId,
        requestKey: e.requestKey,
        status: e.status,
        timestamp: e.timestamp,
        commands: e.commands,
        commandHashes: e.commandHashes,
        beforeStateHash: e.beforeStateHash,
        afterStateHash: e.afterStateHash,
        inverses: e.inverses.map((inv) => ({
          subsystem: inv.subsystem,
          description: inv.description,
          targetGuid: inv.targetGuid,
          recovery: inv.recovery,
        })).filter((inv) => inv.recovery),
        commandResults: e.commandResults,
        error: e.error,
        recoveryInfo: e.recoveryInfo,
      });
    }
    return JSON.stringify({ version: 1, entries: list });
  }

  /** Deserializes and restores journal state from durable storage */
  deserialize(jsonStr: string): void {
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data.entries)) {
        for (const raw of data.entries) {
          const entry: TransactionJournalEntry = {
            transactionId: raw.transactionId,
            requestKey: raw.requestKey,
            status: raw.status,
            timestamp: raw.timestamp,
            commands: raw.commands || [],
            commandHashes: raw.commandHashes || [],
            beforeStateHash: raw.beforeStateHash,
            afterStateHash: raw.afterStateHash,
            inverses: (raw.inverses || [])
              .map((inv: any) => inv.recovery ? InverseFactory.fromRecovery(inv.recovery) : undefined)
              .filter((inv: InverseOperation | undefined): inv is InverseOperation => !!inv),
            commandResults: raw.commandResults || [],
            error: raw.error,
            recoveryInfo: raw.recoveryInfo,
          };
          this.entries.set(entry.transactionId, entry);
          if (entry.requestKey) this.requestKeyMap.set(entry.requestKey, entry.transactionId);
        }
      }
    } catch (err) {
      console.warn('[TransactionJournal] Failed to deserialize journal state:', err);
    }
  }

  /** Asynchronously saves journal to file if running under Node.js */
  async saveToFile(filePath: string): Promise<boolean> {
    try {
      if (typeof process !== 'undefined' && process.versions?.node) {
        return (await AtomicFileOps.writeAtomic(filePath, this.serialize())).ok;
      }
    } catch {}
    return false;
  }

  /** Asynchronously loads journal from file if running under Node.js */
  async loadFromFile(filePath: string): Promise<boolean> {
    try {
      if (typeof process !== 'undefined' && process.versions?.node) {
        const fsModule = 'fs';
        const fs = await import(/* @vite-ignore */ fsModule);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        this.deserialize(content);
        return true;
      }
    } catch {}
    return false;
  }

  /** Open a durable journal in one step, ready for dangling-transaction recovery. */
  static async open(filePath: string, maxHistory = 200): Promise<TransactionJournal> {
    const journal = new TransactionJournal(maxHistory, filePath);
    await journal.loadFromFile(filePath);
    return journal;
  }

  /** Wait until all configured background journal writes have completed. */
  async flushPersistence(): Promise<void> { await this.persistenceTail; }

  private persistConfigured(): void {
    if (!this.persistencePath) return;
    this.persistenceTail = this.persistenceTail
      .then(() => this.saveToFile(this.persistencePath!))
      .catch(() => false);
  }
}
