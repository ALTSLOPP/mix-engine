import { describe, it, expect, beforeEach } from 'vitest';
import {
  EditLeaseManager,
  CapabilityGuard,
  ReleaseValidator,
} from '../src/authoring';
import { createEmptyProject, type ProjectDocument } from '../src/project/ProjectDocument';

describe('EditLeaseManager Unit Tests', () => {
  let leases: EditLeaseManager;

  beforeEach(() => {
    leases = new EditLeaseManager(1000); // 1-second default lease
  });

  it('grants lease to agent and prevents concurrent modification by another agent', () => {
    const resA = leases.acquireLease('g-hero-1', 'agent-alpha', 1000, 1000);
    expect(resA.ok).toBe(true);

    // Agent alpha can edit
    expect(leases.canEdit('g-hero-1', 'agent-alpha', 1200)).toBe(true);
    // Agent beta cannot edit
    expect(leases.canEdit('g-hero-1', 'agent-beta', 1200)).toBe(false);

    // Agent beta tries to acquire lease while active -> rejected
    const resB = leases.acquireLease('g-hero-1', 'agent-beta', 1000, 1200);
    expect(resB.ok).toBe(false);
    expect(resB.holder).toBe('agent-alpha');
  });

  it('allows other agents to acquire lease after expiration', () => {
    leases.acquireLease('g-hero-1', 'agent-alpha', 1000, 1000); // expires at 2000

    // At t=2500, lease has expired
    expect(leases.canEdit('g-hero-1', 'agent-beta', 2500)).toBe(true);

    const resB = leases.acquireLease('g-hero-1', 'agent-beta', 1000, 2500);
    expect(resB.ok).toBe(true);
    expect(resB.holder).toBe('agent-beta');
  });

  it('releases lease explicitly', () => {
    const res = leases.acquireLease('g-hero-1', 'agent-alpha', 1000, 1000);
    expect(res.ok).toBe(true);

    const released = leases.releaseLease(res.leaseId!, 'agent-alpha');
    expect(released).toBe(true);

    expect(leases.canEdit('g-hero-1', 'agent-beta', 1100)).toBe(true);
  });

  it('requires the exact lease token even from the named holder', () => {
    const res = leases.acquireLease('g-hero-1', 'agent-alpha', 1000, 1000);
    expect(leases.canEditWithLease('g-hero-1', 'agent-alpha', undefined, 1100)).toBe(false);
    expect(leases.canEditWithLease('g-hero-1', 'agent-alpha', 'wrong', 1100)).toBe(false);
    expect(leases.canEditWithLease('g-hero-1', 'agent-alpha', res.leaseId, 1100)).toBe(true);
  });
});

describe('CapabilityGuard Unit Tests', () => {
  it('permits admin role for all command capabilities', () => {
    expect(CapabilityGuard.isCommandAllowed(['admin'], 'spawn_entity').allowed).toBe(true);
    expect(CapabilityGuard.isCommandAllowed(['admin'], 'destroy_entity').allowed).toBe(true);
    expect(CapabilityGuard.isCommandAllowed(['admin'], 'set_transform').allowed).toBe(true);
  });

  it('permits level_designer for scene authoring but restricts administrative actions', () => {
    expect(CapabilityGuard.isCommandAllowed(['level_designer'], 'spawn_entity').allowed).toBe(true);
    expect(CapabilityGuard.isCommandAllowed(['level_designer'], 'set_transform').allowed).toBe(true);
  });

  it('restricts viewer role from mutating scene state', () => {
    const check = CapabilityGuard.isCommandAllowed(['viewer'], 'destroy_entity');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('destructive.clear');
  });
});

describe('ReleaseValidator Unit Tests', () => {
  it('validates healthy project document successfully', () => {
    const doc: ProjectDocument = {
      ...createEmptyProject('ReleaseGame'),
      scenes: {
        main: [
          {
            guid: 'g-1',
            name: 'Hero',
            blueprint: { kind: 'box', params: {} },
            transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
          },
        ],
      },
    };

    const report = ReleaseValidator.validate({ project: doc });
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.entityCount).toBe(1);
    expect(report.sceneCount).toBe(1);
  });

  it('detects dangling parent GUID references and missing scenes', () => {
    const doc: ProjectDocument = {
      ...createEmptyProject('BrokenGame'),
      scenes: {
        main: [
          {
            guid: 'g-child',
            name: 'OrphanChild',
            parentGuid: 'non-existent-parent-guid',
            blueprint: { kind: 'box', params: {} },
            transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
          },
        ],
      },
    };

    const report = ReleaseValidator.validate({ project: doc });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes('missing parent GUID'))).toBe(true);
  });

  it('detects duplicate GUIDs across scenes and a missing entry scene', () => {
    const entity = {
      guid: 'shared-guid', blueprint: { kind: 'box', params: {} },
      transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    } as const;
    const doc = { ...createEmptyProject('Broken'), entryScene: 'missing', scenes: { a: [entity], b: [entity] } } as ProjectDocument;
    const report = ReleaseValidator.validate({ project: doc });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes('across project scenes'))).toBe(true);
    expect(report.errors.some((e) => e.includes("Entry scene 'missing'"))).toBe(true);
  });
});
