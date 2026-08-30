export interface EntitySnapshotData {
  id: number;
  kind?: string;
  name?: string;
  tags?: string[];
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
  components?: Record<string, unknown>;
}

export interface SceneDiffResult {
  added: EntitySnapshotData[];
  removed: number[];
  modified: Array<{
    id: number;
    changes: Record<string, { before: unknown; after: unknown }>;
  }>;
}

export class SceneDiffer {
  static diff(
    beforeEntities: EntitySnapshotData[],
    afterEntities: EntitySnapshotData[],
  ): SceneDiffResult {
    const beforeMap = new Map<number, EntitySnapshotData>();
    for (const e of beforeEntities) beforeMap.set(e.id, e);

    const afterMap = new Map<number, EntitySnapshotData>();
    for (const e of afterEntities) afterMap.set(e.id, e);

    const added: EntitySnapshotData[] = [];
    const removed: number[] = [];
    const modified: SceneDiffResult['modified'] = [];

    // Detect added and modified
    for (const [id, after] of afterMap.entries()) {
      const before = beforeMap.get(id);
      if (!before) {
        added.push(after);
      } else {
        const changes: Record<string, { before: unknown; after: unknown }> = {};
        let hasChanges = false;

        // Compare transform
        if (JSON.stringify(before.position) !== JSON.stringify(after.position)) {
          changes.position = { before: before.position, after: after.position };
          hasChanges = true;
        }
        if (JSON.stringify(before.rotation) !== JSON.stringify(after.rotation)) {
          changes.rotation = { before: before.rotation, after: after.rotation };
          hasChanges = true;
        }
        if (before.name !== after.name) {
          changes.name = { before: before.name, after: after.name };
          hasChanges = true;
        }
        if (JSON.stringify(before.tags) !== JSON.stringify(after.tags)) {
          changes.tags = { before: before.tags, after: after.tags };
          hasChanges = true;
        }
        if (JSON.stringify(before.components) !== JSON.stringify(after.components)) {
          changes.components = { before: before.components, after: after.components };
          hasChanges = true;
        }

        if (hasChanges) {
          modified.push({ id, changes });
        }
      }
    }

    // Detect removed
    for (const id of beforeMap.keys()) {
      if (!afterMap.has(id)) {
        removed.push(id);
      }
    }

    return { added, removed, modified };
  }
}
