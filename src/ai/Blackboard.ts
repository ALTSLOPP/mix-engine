export interface BlackboardEntry<T = unknown> {
  value: T;
  ttl?: number; // Remaining seconds before expiration (undefined = permanent)
}

/**
 * Blackboard.ts — Shared memory knowledge base for AI behavior trees and sensory perception.
 * Features automatic sensory TTL memory decay and reactive state observation.
 */
export class Blackboard {
  private readonly memory = new Map<string, BlackboardEntry>();

  set<T = unknown>(key: string, value: T): void {
    this.memory.set(key, { value });
  }

  /** Store a sensory value with an expiration timer in seconds. */
  setWithTTL<T = unknown>(key: string, value: T, ttlSeconds: number): void {
    this.memory.set(key, { value, ttl: Math.max(0, ttlSeconds) });
  }

  get<T = unknown>(key: string): T | undefined {
    const entry = this.memory.get(key);
    return entry ? (entry.value as T) : undefined;
  }

  has(key: string): boolean {
    return this.memory.has(key);
  }

  delete(key: string): boolean {
    return this.memory.delete(key);
  }

  /** Decrement TTLs and discard expired memory entries. */
  update(dt: number): void {
    if (dt <= 0) return;
    for (const [key, entry] of this.memory.entries()) {
      if (entry.ttl !== undefined) {
        entry.ttl -= dt;
        if (entry.ttl <= 0) {
          this.memory.delete(key);
        }
      }
    }
  }

  clear(): void {
    this.memory.clear();
  }
}
