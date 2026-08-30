import type { TerrainField } from './TerrainField';

export interface TerrainSnapshot {
  data: Float32Array;
}

export class TerrainHistory {
  private undoStack: Array<{ field: TerrainField; snapshot: TerrainSnapshot }> = [];
  private redoStack: Array<{ field: TerrainField; snapshot: TerrainSnapshot }> = [];

  beginStroke(field: TerrainField): void {
    this.undoStack.push({
      field,
      snapshot: {
        data: new Float32Array(field.hm.heights),
      }
    });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  /** No-op: stroke is already snapshotted at beginStroke; kept for API symmetry. */
  commitIfNeeded(_field: TerrainField): void { /* beginStroke already captured */ }

  undo(): void {
    const op = this.undoStack.pop();
    if (!op) return;
    
    // Save current state for redo
    this.redoStack.push({
      field: op.field,
      snapshot: {
        data: new Float32Array(op.field.hm.heights),
      }
    });
    
    op.field.hm.heights.set(op.snapshot.data);
    op.field.applyRect({ i0: 0, i1: op.field.hm.res - 1, j0: 0, j1: op.field.hm.res - 1 });
    op.field.rebuildCollider();
  }

  redo(): void {
    const op = this.redoStack.pop();
    if (!op) return;
    
    // Save current state for undo
    this.undoStack.push({
      field: op.field,
      snapshot: {
        data: new Float32Array(op.field.hm.heights),
      }
    });
    
    op.field.hm.heights.set(op.snapshot.data);
    op.field.applyRect({ i0: 0, i1: op.field.hm.res - 1, j0: 0, j1: op.field.hm.res - 1 });
    op.field.rebuildCollider();
  }
}
