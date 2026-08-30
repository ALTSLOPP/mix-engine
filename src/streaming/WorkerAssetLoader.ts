/**
 * WorkerAssetLoader.ts — offloads GLB fetching + parsing to a Web Worker.
 *
 * The main-thread AssetLoaderQueue does fetch + GLTFLoader.parse on the main thread,
 * which causes micro-stutters when a chunk loads a heavy GLB (the parse is ~50–200ms
 * for a 10MB model). This module moves the fetch + ArrayBuffer acquisition to a worker,
 * keeping only the GPU resource upload on the main thread (Three's GLTFLoader.parse
 * creates GPU resources, so it must run where WebGLRenderingContext is — but the
 * fetch + arrayBuffer() can be offloaded, and for JSON-based GLBs the JSON.parse can
 * too, returning a structured-cloneable parsed JSON to the main thread).
 *
 * For the engine's use case (chunk streaming + asset preloading), the fetch is the
 * dominant cost, so even just offloading the fetch is a big win. The worker is a
 * minimal inline blob (no separate .js file to manage) that:
 *   1. fetch(url) → response.arrayBuffer()
 *   2. postMessage(buffer, [buffer]) (transferable, zero-copy)
 *
 * The main thread then runs GLTFLoader.parse(buffer) on the transferred ArrayBuffer.
 * This halves the main-thread time (fetch is gone; parse remains but is unavoidable).
 *
 * For a future step: GLTFLoader.parse can be run INSIDE the worker if we use an
 * OffscreenCanvas + WebGL2 in the worker (Three supports this). That would eliminate
 * the main-thread stutters entirely. The API here is shaped so that upgrade is a drop-in.
 */

export interface WorkerLoadResult {
  buffer: ArrayBuffer;
  url: string;
}

export class WorkerAssetLoader {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, (result: WorkerLoadResult) => void>();
  private readonly errored = new Map<string, (err: Error) => void>();
  private nextId = 0;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    // Inline worker source — fetches a URL and posts the ArrayBuffer back (transferable).
    const workerSource = `
      self.onmessage = function(e) {
        var id = e.data.id, url = e.data.url;
        fetch(url)
          .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
            return res.arrayBuffer();
          })
          .then(function(buf) {
            self.postMessage({ id: id, url: url, buffer: buf }, [buf]);
          })
          .catch(function(err) {
            self.postMessage({ id: id, url: url, error: err.message });
          });
      };
    `;
    try {
      const blob = new Blob([workerSource], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      this.worker = new Worker(blobUrl);
      this.worker.onmessage = (e: MessageEvent) => {
        const data = e.data as { id: number; url: string; buffer?: ArrayBuffer; error?: string };
        const resolve = this.pending.get(data.id.toString());
        const reject = this.errored.get(data.id.toString());
        this.pending.delete(data.id.toString());
        this.errored.delete(data.id.toString());
        if (data.error) {
          reject?.(new Error(data.error));
        } else if (data.buffer) {
          resolve?.({ buffer: data.buffer, url: data.url });
        }
      };
      // Revoke the blob URL after the worker is created (the worker keeps a reference).
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.warn('[WorkerAssetLoader] Worker creation failed — falling back to main-thread fetch:', err);
      this.worker = null;
    }
  }

  /** Load a URL via the worker (offloaded fetch). Returns the ArrayBuffer. Falls back
   *  to a main-thread fetch if the worker isn't available. */
  load(url: string): Promise<WorkerLoadResult> {
    if (!this.worker) {
      // Fallback: main-thread fetch.
      return fetch(url).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const buffer = await res.arrayBuffer();
        return { buffer, url };
      });
    }
    const id = this.nextId++;
    return new Promise<WorkerLoadResult>((resolve, reject) => {
      this.pending.set(id.toString(), resolve);
      this.errored.set(id.toString(), reject);
      this.worker!.postMessage({ id, url });
    });
  }

  get isAvailable(): boolean { return this.worker !== null; }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    // Reject every pending load before clearing — otherwise an in-flight `load()`
    // caller awaits a promise that never settles (hang on HMR / engine teardown).
    for (const reject of this.errored.values()) {
      try { reject(new Error('WorkerAssetLoader disposed')); } catch { /* already settled */ }
    }
    this.pending.clear();
    this.errored.clear();
  }
}
