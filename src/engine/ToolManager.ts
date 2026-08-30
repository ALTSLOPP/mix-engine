export interface EditorTool {
  readonly id: string;
  activate(): void;
  deactivate(): void;
  /** Optional per-frame tick while this tool is active (called by TerrainSystem.update). */
  tick?(dt: number): void;
}

export class ToolManager {
  active: EditorTool | null = null;

  setActive(tool: EditorTool | null): void {
    if (this.active === tool) return;
    this.active?.deactivate();
    this.active = tool;
    tool?.activate();
  }
}
