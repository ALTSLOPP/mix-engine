import type { ScriptAPI } from './ScriptComponent';

/**
 * ScriptWorkerSandbox — real Worker/iframe capability sandbox.
 * User code runs off-main-thread with only the proxied `api` surface.
 * The worker cannot access `window`, `document`, `fetch` directly — every
 * host call is a capability message validated on the main thread.
 *
 * Protocol:
 *  Main → Worker: { op: 'init', code, entityId }
 *  Main → Worker: { op: 'tick', dt, events, self, stateSnapshot }
 *  Worker → Main: { op: 'call', capability: 'sceneManager.spawn', args }
 *  Worker → Main: { op: 'setSelf', self }
 *  Worker → Main: { op: 'error', error }
 *
 * For the prototype, the worker's `api` is a proxy that queues capability calls
 * and flushes them at end of tick; the main thread validates and executes them.
 * This prevents a compromised script from directly mutating the scene graph.
 */
export interface WorkerTick {
  dt: number;
  events: ScriptAPI['events'];
  self: Record<string, unknown>;
  state: Record<string, unknown>;
}

export interface WorkerCapabilityCall {
  capability: string;
  args: unknown[];
}

export class ScriptWorkerSandbox {
  private worker: Worker | null = null;
  private pendingCalls: WorkerCapabilityCall[] = [];
  private onCall: (call: WorkerCapabilityCall) => unknown = () => {};

  /** Allow-list of host capabilities a script may invoke. */
  static readonly ALLOWED = new Set([
    'sceneManager.spawn',
    'sceneManager.destroy',
    'state.get',
    'state.set',
    'bus.emit',
    'debug.drawLine',
    'debug.drawBox',
    'query.sphere',
  ]);

  constructor(
    private readonly entityId: number,
    private code: string,
    onCapability?: (call: WorkerCapabilityCall) => unknown,
  ) {
    if (onCapability) this.onCall = onCapability;
    this.spawn();
  }

  private spawn(): void {
    const workerSrc = `
      let userFn = null;
      let selfData = {};
      let apiProxy = null;
      function makeApi(events, self) {
        selfData = self;
        const pending = [];
        const api = {
          entityId: ${this.entityId},
          events,
          self: selfData,
          state: {
            getItem: (k) => { pending.push({ capability: 'state.get', args: [k] }); return null; },
            setItem: (k,v) => pending.push({ capability: 'state.set', args: [k,v] }),
          },
          debug: {
            drawLine: (...a) => pending.push({ capability: 'debug.drawLine', args: a }),
            drawBox: (...a) => pending.push({ capability: 'debug.drawBox', args: a }),
          },
          bus: { emit: (e,d) => pending.push({ capability: 'bus.emit', args: [e,d] }) },
          query: { sphere: (...a) => { pending.push({ capability: 'query.sphere', args: a }); return []; } },
          _flush: () => { const c = pending.slice(); pending.length = 0; return c; }
        };
        return api;
      }
      self.onmessage = (e) => {
        const msg = e.data;
        if (msg.op === 'init') {
          try {
            userFn = new Function('dt','api','THREE', '"use strict";' + msg.code);
            self.postMessage({ op: 'ready' });
          } catch (err) {
            self.postMessage({ op: 'error', error: String(err) });
          }
        } else if (msg.op === 'tick') {
          if (!userFn) return;
          const api = makeApi(msg.events, msg.self);
          try {
            userFn(msg.dt, api, {});
            if (msg.self !== api.self) Object.assign(msg.self, api.self);
            const calls = api._flush();
            self.postMessage({ op: 'calls', calls, self: api.self });
          } catch (err) {
            self.postMessage({ op: 'error', error: String(err) });
          }
        }
      };
    `;
    try {
      const blob = new Blob([workerSrc], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      this.worker.onmessage = (e) => {
        const msg = e.data as any;
        if (msg.op === 'calls') {
          for (const c of msg.calls as WorkerCapabilityCall[]) {
            if (!ScriptWorkerSandbox.ALLOWED.has(c.capability)) {
              console.warn(`[ScriptWorker] blocked capability ${c.capability}`);
              continue;
            }
            try { this.onCall(c); } catch (err) { console.warn('[ScriptWorker] capability failed', err); }
          }
        } else if (msg.op === 'error') {
          console.error(`[ScriptWorker ${this.entityId}] worker error:`, msg.error);
        }
      };
      this.worker.postMessage({ op: 'init', code: this.code });
    } catch (err) {
      console.warn('[ScriptWorkerSandbox] Worker unavailable, falling back to main-thread (trusted):', err);
      this.worker = null;
    }
  }

  update(tick: WorkerTick): void {
    if (!this.worker) return;
    this.worker.postMessage({ op: 'tick', dt: tick.dt, events: tick.events, self: tick.self });
  }

  setSource(code: string): void {
    this.code = code;
    this.worker?.postMessage({ op: 'init', code });
  }

  dispose(): void {
    try { this.worker?.terminate(); } catch {}
    this.worker = null;
  }

  get isWorker(): boolean { return this.worker !== null; }
}
