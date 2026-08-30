export type NetMessageHandler = (data: string) => void;

/**
 * Minimal duplex channel the networking stack talks over. Deliberately string-based:
 * the snapshot codec already produces compact JSON, and keeping the transport dumb
 * means WebSocket, WebRTC data channel, BroadcastChannel and an in-process loopback
 * are all interchangeable without touching replication.
 */
export interface NetTransport {
  readonly isOpen: boolean;
  send(data: string): void;
  onMessage(handler: NetMessageHandler): () => void;
  close(): void;
}

/**
 * LoopbackTransport — two endpoints wired directly to each other, with optional
 * simulated latency. This is what makes the netcode testable and what lets a
 * single-player build run the exact same replication path as a networked one.
 */
export class LoopbackTransport implements NetTransport {
  private peer: LoopbackTransport | null = null;
  private readonly handlers = new Set<NetMessageHandler>();
  private closed = false;
  private readonly pending: Array<ReturnType<typeof setTimeout>> = [];

  /** One-way delivery delay in milliseconds. */
  latencyMs = 0;

  get isOpen(): boolean {
    return !this.closed && this.peer !== null;
  }

  /** Create a connected pair. */
  static createPair(latencyMs = 0): [LoopbackTransport, LoopbackTransport] {
    const a = new LoopbackTransport();
    const b = new LoopbackTransport();
    a.peer = b;
    b.peer = a;
    a.latencyMs = latencyMs;
    b.latencyMs = latencyMs;
    return [a, b];
  }

  send(data: string): void {
    if (!this.isOpen || !this.peer) return;
    const peer = this.peer;
    if (this.latencyMs <= 0) {
      peer.deliver(data);
      return;
    }
    const handle = setTimeout(() => peer.deliver(data), this.latencyMs);
    this.pending.push(handle);
  }

  onMessage(handler: NetMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.closed = true;
    for (const h of this.pending) clearTimeout(h);
    this.pending.length = 0;
    this.handlers.clear();
    this.peer = null;
  }

  private deliver(data: string): void {
    if (this.closed) return;
    for (const handler of this.handlers) handler(data);
  }
}

/** WebSocket-backed transport. Buffers sends made before the socket finishes opening. */
export class WebSocketTransport implements NetTransport {
  private readonly socket: WebSocket;
  private readonly handlers = new Set<NetMessageHandler>();
  private readonly sendQueue: string[] = [];

  constructor(urlOrSocket: string | WebSocket) {
    this.socket = typeof urlOrSocket === 'string' ? new WebSocket(urlOrSocket) : urlOrSocket;
    this.socket.addEventListener('open', () => {
      for (const msg of this.sendQueue) this.socket.send(msg);
      this.sendQueue.length = 0;
    });
    this.socket.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      for (const handler of this.handlers) handler(event.data);
    });
  }

  get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(data: string): void {
    if (this.isOpen) this.socket.send(data);
    else if (this.socket.readyState === WebSocket.CONNECTING) this.sendQueue.push(data);
  }

  onMessage(handler: NetMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.handlers.clear();
    this.sendQueue.length = 0;
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }
  }
}
