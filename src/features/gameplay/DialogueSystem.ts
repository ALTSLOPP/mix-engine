import type { Engine } from '../../engine/Engine';
import type { EntityId } from '../../ecs/SceneManager';
import type { DialogueConfig, DialogueNode } from './types';

export class DialogueSystem {
  private config: DialogueConfig;
  private activeNodeId: string | null = null;
  private activeNpcId: EntityId | null = null;
  private displayedCharCount = 0;
  private isDialogueActive = false;

  constructor(private readonly engine: Engine, initialConfig: DialogueConfig) {
    this.config = { ...initialConfig };
  }

  setConfig(config: Partial<DialogueConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) { if (this.isDialogueActive) this.endDialogue(); }
  }

  getConfig(): Readonly<DialogueConfig> {
    return this.config;
  }

  get isActive(): boolean {
    return this.isDialogueActive;
  }

  get currentNode(): DialogueNode | null {
    if (!this.activeNodeId) return null;
    return this.config.nodes[this.activeNodeId] ?? null;
  }

  get currentText(): string {
    const node = this.currentNode;
    if (!node) return '';
    return node.text.slice(0, Math.floor(this.displayedCharCount));
  }

  startDialogue(nodeId: string, npcEntityId?: EntityId): boolean {
    if (!this.config.enabled) return false;
    const node = this.config.nodes[nodeId];
    if (!node) return false;

    this.activeNodeId = nodeId;
    this.activeNpcId = npcEntityId ?? null;
    this.displayedCharCount = 0;
    this.isDialogueActive = true;

    // Trigger dialogue audio if present
    if (node.audio) {
      this.engine.audio.play(node.audio, { volume: 0.8, loop: false });
    }

    this.engine.sceneManager.events.emit('dialogue_started', {
      nodeId,
      speaker: node.speakerName,
      text: node.text,
      choices: node.choices,
    });
    return true;
  }

  selectChoice(choiceIndex: number): boolean {
    const node = this.currentNode;
    if (!this.config.enabled || !Number.isInteger(choiceIndex) || !node || !node.choices || choiceIndex < 0 || choiceIndex >= node.choices.length) {
      return false;
    }

    const choice = node.choices[choiceIndex];
    if (choice.action) {
      this.engine.sceneManager.events.emit('dialogue_action', { action: choice.action });
    }

    if (choice.nextId && this.config.nodes[choice.nextId]) {
      this.startDialogue(choice.nextId, this.activeNpcId ?? undefined);
    } else {
      this.endDialogue();
    }
    return true;
  }

  endDialogue(): void {
    this.isDialogueActive = false;
    this.activeNodeId = null;
    this.activeNpcId = null;
    this.displayedCharCount = 0;

    this.engine.sceneManager.events.emit('dialogue_ended', {});
  }

  update(dt: number): void {
    if (!this.isDialogueActive || !this.currentNode) return;

    const fullLength = this.currentNode.text.length;
    if (this.displayedCharCount < fullLength) {
      this.displayedCharCount = Math.min(
        fullLength,
        this.displayedCharCount + this.config.typingSpeedCharsPerSec * dt,
      );
    }
  }
}
