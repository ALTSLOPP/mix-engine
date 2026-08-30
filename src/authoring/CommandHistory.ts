export interface HistoryRecord {
  id: string;
  name: string;
  timestamp: number;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  coalesceKey?: string;
}

export class CommandHistory {
  private readonly undoStack: HistoryRecord[] = [];
  private readonly redoStack: HistoryRecord[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries;
  }

  record(record: HistoryRecord): void {
    // Check if we can coalesce with previous entry
    if (record.coalesceKey && this.undoStack.length > 0) {
      const last = this.undoStack[this.undoStack.length - 1];
      if (last.coalesceKey === record.coalesceKey && record.timestamp - last.timestamp < 500) {
        // Keep initial undo, update redo and timestamp
        last.redo = record.redo;
        last.timestamp = record.timestamp;
        this.redoStack.length = 0;
        return;
      }
    }

    if (this.undoStack.length >= this.maxEntries) {
      this.undoStack.shift();
    }

    this.undoStack.push(record);
    this.redoStack.length = 0; // Cleared on new action
  }

  async undo(): Promise<boolean> {
    const entry = this.undoStack.pop();
    if (!entry) return false;

    try {
      await entry.undo();
      this.redoStack.push(entry);
      return true;
    } catch (err) {
      this.undoStack.push(entry);
      throw err;
    }
  }

  async redo(): Promise<boolean> {
    const entry = this.redoStack.pop();
    if (!entry) return false;

    try {
      await entry.redo();
      this.undoStack.push(entry);
      return true;
    } catch (err) {
      this.redoStack.push(entry);
      throw err;
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  getEntries(): Array<{ id: string; name: string; timestamp: number }> {
    return this.undoStack.map((e) => ({
      id: e.id,
      name: e.name,
      timestamp: e.timestamp,
    }));
  }
}
