/**
 * EditLeaseManager — Fine-grained spatial and entity edit leases for multi-agent collaboration.
 *
 * Prevents race conditions and conflicts when multiple autonomous AI agents
 * operate concurrently on the same project scene graph.
 */

export interface EditLease {
  leaseId: string;
  targetGuid: string;
  agentId: string;
  acquiredAt: number;
  expiresAt: number;
}

export class EditLeaseManager {
  private readonly defaultTtlMs: number;
  private readonly leases = new Map<string, EditLease>(); // targetGuid -> EditLease
  private readonly leaseIdToGuid = new Map<string, string>();

  constructor(defaultTtlMs = 30000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Attempts to acquire an edit lease on a target entity or chunk GUID.
   */
  acquireLease(
    targetGuid: string,
    agentId: string,
    ttlMs = this.defaultTtlMs,
    now = Date.now()
  ): { ok: boolean; leaseId?: string; holder?: string; expiresAt?: number } {
    this.clearExpiredLeases(now);

    const existing = this.leases.get(targetGuid);
    if (existing) {
      if (existing.agentId === agentId) {
        // Agent already owns lease -> extend TTL
        existing.expiresAt = now + ttlMs;
        return { ok: true, leaseId: existing.leaseId, holder: agentId, expiresAt: existing.expiresAt };
      }
      return { ok: false, holder: existing.agentId, expiresAt: existing.expiresAt };
    }

    const leaseId = `lease-${Math.random().toString(36).slice(2, 10)}`;
    const lease: EditLease = {
      leaseId,
      targetGuid,
      agentId,
      acquiredAt: now,
      expiresAt: now + ttlMs,
    };

    this.leases.set(targetGuid, lease);
    this.leaseIdToGuid.set(leaseId, targetGuid);

    return { ok: true, leaseId, holder: agentId, expiresAt: lease.expiresAt };
  }

  /**
   * Renews an existing lease.
   */
  renewLease(leaseId: string, agentId: string, extensionMs = this.defaultTtlMs, now = Date.now()): boolean {
    const targetGuid = this.leaseIdToGuid.get(leaseId);
    if (!targetGuid) return false;

    const lease = this.leases.get(targetGuid);
    if (!lease || lease.agentId !== agentId) return false;

    lease.expiresAt = Math.max(lease.expiresAt, now) + extensionMs;
    return true;
  }

  /**
   * Releases an existing lease.
   */
  releaseLease(leaseId: string, agentId: string): boolean {
    const targetGuid = this.leaseIdToGuid.get(leaseId);
    if (!targetGuid) return false;

    const lease = this.leases.get(targetGuid);
    if (!lease || lease.agentId !== agentId) return false;

    this.leases.delete(targetGuid);
    this.leaseIdToGuid.delete(leaseId);
    return true;
  }

  /**
   * Checks if an agent has permission to edit the target entity.
   */
  canEdit(targetGuid: string, agentId: string, now = Date.now()): boolean {
    this.clearExpiredLeases(now);
    const lease = this.leases.get(targetGuid);
    if (!lease) return true; // Unlocked target can be freely edited/acquired
    return lease.agentId === agentId;
  }

  /** Validate both holder identity and the unguessable lease token. */
  canEditWithLease(targetGuid: string, agentId: string, leaseId: string | undefined, now = Date.now()): boolean {
    this.clearExpiredLeases(now);
    const lease = this.leases.get(targetGuid);
    if (!lease) return true;
    return !!leaseId && lease.agentId === agentId && lease.leaseId === leaseId;
  }

  /**
   * Cleans up expired leases.
   */
  clearExpiredLeases(now = Date.now()): number {
    let count = 0;
    for (const [targetGuid, lease] of this.leases.entries()) {
      if (now >= lease.expiresAt) {
        this.leases.delete(targetGuid);
        this.leaseIdToGuid.delete(lease.leaseId);
        count++;
      }
    }
    return count;
  }
}
