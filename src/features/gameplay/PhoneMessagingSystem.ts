import type { Engine } from '../../engine/Engine';
import type {
  ConversationThread,
  MessageChoice,
  MessageNode,
  PendingScheduledMessage,
  PhoneContact,
  PhoneMessagingConfig,
  PhoneMessagingState,
} from './types';

export const DEFAULT_PHONE_MESSAGING_CONFIG: PhoneMessagingConfig = {
  enabled: true,
  contacts: [],
};

export class PhoneMessagingSystem {
  private config: PhoneMessagingConfig;
  private readonly contacts = new Map<string, PhoneContact>();
  private readonly threads = new Map<string, ConversationThread>();
  private readonly nodeGraphs = new Map<string, Map<string, MessageNode>>(); // threadId -> (nodeId -> node)
  private readonly scheduledMessages: PendingScheduledMessage[] = [];
  private gameTimeSeconds = 0;

  constructor(private readonly engine: Engine, initialConfig: PhoneMessagingConfig = DEFAULT_PHONE_MESSAGING_CONFIG) {
    this.config = { ...initialConfig };
    for (const c of this.config.contacts) {
      this.contacts.set(c.id, { ...c });
    }
  }

  setConfig(config: Partial<PhoneMessagingConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.contacts) {
      for (const c of config.contacts) {
        this.contacts.set(c.id, { ...c });
      }
    }
  }

  getConfig(): Readonly<PhoneMessagingConfig> {
    return this.config;
  }

  registerContact(contact: PhoneContact): void {
    this.contacts.set(contact.id, { ...contact });
  }

  getContact(contactId: string): PhoneContact | undefined {
    return this.contacts.get(contactId);
  }

  getContacts(): readonly PhoneContact[] {
    return Array.from(this.contacts.values());
  }

  registerConversationGraph(threadId: string, nodes: MessageNode[]): void {
    let graph = this.nodeGraphs.get(threadId);
    if (!graph) {
      graph = new Map();
      this.nodeGraphs.set(threadId, graph);
    }
    for (const n of nodes) {
      graph.set(n.id, { ...n });
    }
  }

  startConversation(threadId: string, contactId: string, title: string, startNodeId: string): ConversationThread | null {
    if (!this.config.enabled) return null;

    const graph = this.nodeGraphs.get(threadId);
    const startNode = graph?.get(startNodeId);
    if (!startNode) return null;

    const thread: ConversationThread = {
      id: threadId,
      contactId,
      title,
      currentNodeId: startNodeId,
      history: [],
      pendingChoices: startNode.choices ?? [],
      isCompleted: false,
    };

    // If start node is from contact, deliver it
    if (startNode.sender === 'contact') {
      if ((startNode.delaySeconds ?? 0) > 0) {
        this.scheduledMessages.push({
          id: `msg_${Date.now()}_${Math.random()}`,
          threadId,
          node: startNode,
          fireGameTime: this.gameTimeSeconds + (startNode.delaySeconds ?? 0),
        });
      } else {
        this.deliverNode(thread, startNode);
      }
    }

    this.threads.set(threadId, thread);
    return thread;
  }

  private deliverNode(thread: ConversationThread, node: MessageNode): void {
    thread.currentNodeId = node.id;
    thread.history.push({
      sender: node.sender,
      text: node.text,
      timestamp: Date.now(),
    });
    thread.pendingChoices = node.choices ? [...node.choices] : undefined;

    if (!node.choices || node.choices.length === 0) {
      if (node.nextNodeId) {
        const nextNode = this.nodeGraphs.get(thread.id)?.get(node.nextNodeId);
        if (nextNode) {
          const delay = nextNode.delaySeconds ?? 1.5;
          this.scheduledMessages.push({
            id: `msg_${Date.now()}_${Math.random()}`,
            threadId: thread.id,
            node: nextNode,
            fireGameTime: this.gameTimeSeconds + delay,
          });
        }
      } else {
        thread.isCompleted = true;
      }
    }

    // Trigger custom game events linked to this message node
    if (node.eventTrigger) {
      this.engine.sceneManager?.events?.emit(node.eventTrigger, {
        threadId: thread.id,
        contactId: thread.contactId,
        nodeId: node.id,
        ...(node.eventPayload ?? {}),
      });
    }

    // Update unread badges
    const unread = this.getUnreadCount();
    this.engine.gameplayFeatures?.phoneShell?.setAppBadge('messages', unread);

    this.engine.sceneManager?.events?.emit('phone_message_received', {
      threadId: thread.id,
      contactId: thread.contactId,
      sender: node.sender,
      text: node.text,
    });
  }

  selectChoice(threadId: string, choiceId: string): boolean {
    const thread = this.threads.get(threadId);
    if (!thread || !thread.pendingChoices) return false;

    const choice = thread.pendingChoices.find((c) => c.id === choiceId);
    if (!choice) return false;

    // Record player choice in history
    thread.history.push({
      sender: 'player',
      text: choice.text,
      timestamp: Date.now(),
    });
    thread.pendingChoices = undefined;

    // Trigger choice event
    if (choice.eventTrigger) {
      this.engine.sceneManager?.events?.emit(choice.eventTrigger, {
        threadId: thread.id,
        contactId: thread.contactId,
        choiceId: choice.id,
        ...(choice.eventPayload ?? {}),
      });
    }

    // Advance to next node
    const graph = this.nodeGraphs.get(threadId);
    const nextNode = graph?.get(choice.nextNodeId);
    if (nextNode) {
      const delay = nextNode.delaySeconds ?? 1.2;
      this.scheduledMessages.push({
        id: `msg_${Date.now()}_${Math.random()}`,
        threadId,
        node: nextNode,
        fireGameTime: this.gameTimeSeconds + delay,
      });
    } else {
      thread.isCompleted = true;
    }

    return true;
  }

  getThread(threadId: string): ConversationThread | undefined {
    return this.threads.get(threadId);
  }

  getThreads(): readonly ConversationThread[] {
    return Array.from(this.threads.values());
  }

  getUnreadCount(): number {
    return Array.from(this.threads.values()).filter((t) => (t.pendingChoices?.length ?? 0) > 0 || !t.isCompleted).length;
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    this.gameTimeSeconds += dt;

    for (let i = this.scheduledMessages.length - 1; i >= 0; i--) {
      const pending = this.scheduledMessages[i];
      if (this.gameTimeSeconds >= pending.fireGameTime) {
        this.scheduledMessages.splice(i, 1);
        const thread = this.threads.get(pending.threadId);
        if (thread) {
          this.deliverNode(thread, pending.node);
        }
      }
    }
  }

  getState(): PhoneMessagingState {
    return {
      threads: new Map(this.threads),
      scheduledMessages: [...this.scheduledMessages],
    };
  }

  clear(): void {
    this.threads.clear();
    this.scheduledMessages.length = 0;
    this.gameTimeSeconds = 0;
  }

  dispose(): void {
    this.clear();
  }

  toJSON(): Record<string, unknown> {
    const serializedThreads: Record<string, unknown> = {};
    for (const [id, t] of this.threads.entries()) {
      serializedThreads[id] = {
        id: t.id,
        contactId: t.contactId,
        title: t.title,
        currentNodeId: t.currentNodeId,
        history: t.history,
        pendingChoices: t.pendingChoices,
        isCompleted: t.isCompleted,
      };
    }

    return {
      gameTimeSeconds: this.gameTimeSeconds,
      threads: serializedThreads,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    if (typeof data.gameTimeSeconds === 'number') this.gameTimeSeconds = data.gameTimeSeconds;
    if (data.threads && typeof data.threads === 'object') {
      this.threads.clear();
      for (const [id, t] of Object.entries(data.threads as Record<string, any>)) {
        this.threads.set(id, {
          id: t.id,
          contactId: t.contactId,
          title: t.title,
          currentNodeId: t.currentNodeId,
          history: t.history ?? [],
          pendingChoices: t.pendingChoices,
          isCompleted: t.isCompleted ?? false,
        });
      }
    }
  }
}
