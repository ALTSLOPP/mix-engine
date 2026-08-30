export interface PredictionRecord<TInput, TState> {
  tick: number;
  input: TInput;
  state: TState;
  dt: number;
}

/**
 * PredictionBuffer.ts — Circular history buffer storing player input commands and predicted states.
 * Enables rollbacks and input re-simulations when authoritative server updates arrive.
 */
export class PredictionBuffer<TInput, TState> {
  private readonly buffer: Array<PredictionRecord<TInput, TState>> = [];
  private readonly maxCapacity: number;

  constructor(maxCapacity = 128) {
    this.maxCapacity = maxCapacity;
  }

  get length(): number {
    return this.buffer.length;
  }

  /** Append a predicted tick record. */
  add(record: PredictionRecord<TInput, TState>): void {
    if (this.buffer.length >= this.maxCapacity) {
      this.buffer.shift();
    }
    this.buffer.push(record);
  }

  /** Find the record for a specific tick. */
  get(tick: number): PredictionRecord<TInput, TState> | undefined {
    return this.buffer.find((r) => r.tick === tick);
  }

  /** Get all records starting from a given tick up to the latest predicted tick. */
  getAllFrom(startTick: number): Array<PredictionRecord<TInput, TState>> {
    const idx = this.buffer.findIndex((r) => r.tick >= startTick);
    return idx !== -1 ? this.buffer.slice(idx) : [];
  }

  /** Discard all records older than the acknowledged server tick. */
  discardOlderThan(acknowledgedTick: number): void {
    const idx = this.buffer.findIndex((r) => r.tick >= acknowledgedTick);
    if (idx > 0) {
      this.buffer.splice(0, idx);
    }
  }

  /** Get the most recently predicted record. */
  latest(): PredictionRecord<TInput, TState> | undefined {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : undefined;
  }

  clear(): void {
    this.buffer.length = 0;
  }
}
