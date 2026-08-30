/**
 * CrashReporter.ts — robustness + diagnostics capture.
 *
 * Ported from the GTA prototype's crash-reporting (`crashReporting.ts`, `gpuMemoryManager`
 * context-lost handling, `artifacts/crash-reports/*`). The MIX engine has no crash capture:
 * a WebGL context loss silently black-screens, and an uncaught error vanishes into the
 * console. This module captures structured reports for:
 *
 *   - **WebGL context lost / restored** — the #1 open-world stability failure (VRAM pressure).
 *     We `preventDefault()` the loss so the browser will fire `webglcontextrestored`, and
 *     record a report with the live renderer/memory snapshot.
 *   - **Uncaught errors** (`window.onerror`) and **unhandled promise rejections**.
 *   - **Manual captures** (`reporter.capture('bug', 'description')`) for an in-engine "report
 *     a bug" button.
 *
 * Reports are kept in a small ring buffer in `localStorage` (so they survive a reload/restart)
 * and best-effort POSTed to `/api/crash-report` when a dev server is present. The report shape
 * mirrors the prototype's `artifacts/crash-reports/*.json` for tooling parity.
 */

export interface CrashContext {
  source: string;
  href: string;
  userAgent: string;
  language: string;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  viewport: { innerWidth: number; innerHeight: number; devicePixelRatio: number };
  performanceMemory: { jsHeapSizeLimit: number; totalJSHeapSize: number; usedJSHeapSize: number } | null;
  contextLostCount: number;
  /** Live renderer.info snapshot if a diagnostics provider is set. */
  render?: { calls: number; triangles: number; geometries: number; textures: number } | null;
}

export interface CrashReport {
  createdAt: string;
  source: string;
  message: string;
  error: { name: string; message: string; stack?: string } | null;
  context: CrashContext;
}

export interface CrashDiagnostics {
  render?: { calls: number; triangles: number; geometries: number; textures: number };
}

const STORAGE_KEY = 'mix_crash_reports';
const MAX_STORED = 20;

export class CrashReporter {
  private contextLostCount = 0;
  private installed = false;
  private canvases = new Set<HTMLCanvasElement>();
  /** Optional provider for live renderer stats (set once the engine exists). */
  private diagnosticsProvider: (() => CrashDiagnostics) | null = null;

  private readonly onError = (event: ErrorEvent): void => {
    this.capture('window-error', event.message || 'Uncaught error', event.error ?? null);
  };
  private readonly onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : null;
    this.capture('unhandled-rejection', err?.message ?? String(reason), err);
  };

  /** Install global error + rejection handlers. Idempotent. */
  install(): void {
    if (this.installed) return;
    this.installed = true;
    if (typeof window !== 'undefined') {
      window.addEventListener('error', this.onError);
      window.addEventListener('unhandledrejection', this.onRejection);
    }
  }

  /** Wire WebGL context-loss handling on a canvas (the engine's renderer canvas). */
  attachCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvases.has(canvas)) return;
    this.canvases.add(canvas);
    canvas.addEventListener('webglcontextlost', this.handleContextLost as EventListener, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored as EventListener, false);
  }

  /** Provide live renderer stats (e.g. () => ({ render: viewport.renderer.info.render })). */
  setDiagnosticsProvider(fn: () => CrashDiagnostics): void {
    this.diagnosticsProvider = fn;
  }

  private readonly handleContextLost = (event: Event): void => {
    // Preventing default tells the browser we'll restore — without this, the context never
    // comes back and the canvas stays black forever.
    event.preventDefault();
    this.contextLostCount++;
    this.capture('webgl-context-lost', 'WebGL context lost during gameplay.', null);
  };

  private readonly handleContextRestored = (): void => {
    this.capture('webgl-context-restored', 'WebGL context restored.', null);
  };

  /** Capture a structured report. `source` is a short kind; `error` an optional Error. */
  capture(source: string, message: string, error: Error | unknown | null = null): CrashReport {
    const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : null;
    const report: CrashReport = {
      createdAt: new Date().toISOString(),
      source,
      message,
      error: err,
      context: this.collectContext(source),
    };
    this.persist(report);
    void this.post(report);
    try { console.error(`[CrashReporter] ${source}: ${message}`, err ?? ''); } catch { /* noop */ }
    return report;
  }

  private collectContext(source: string): CrashContext {
    const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
    const perfMem = (typeof performance !== 'undefined' && (performance as any).memory) || null;
    let render: CrashContext['render'] = null;
    try { render = this.diagnosticsProvider?.().render ?? null; } catch { render = null; }
    return {
      source,
      href: typeof location !== 'undefined' ? location.href : '',
      userAgent: nav.userAgent ?? '',
      language: nav.language ?? '',
      hardwareConcurrency: nav.hardwareConcurrency ?? 0,
      deviceMemory: (nav as any).deviceMemory ?? null,
      viewport: {
        innerWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
        innerHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      },
      performanceMemory: perfMem
        ? { jsHeapSizeLimit: perfMem.jsHeapSizeLimit, totalJSHeapSize: perfMem.totalJSHeapSize, usedJSHeapSize: perfMem.usedJSHeapSize }
        : null,
      contextLostCount: this.contextLostCount,
      render,
    };
  }

  private persist(report: CrashReport): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list: CrashReport[] = raw ? JSON.parse(raw) : [];
      list.push(report);
      while (list.length > MAX_STORED) list.shift();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch { /* storage full / unavailable — keep going */ }
  }

  private async post(report: CrashReport): Promise<void> {
    try {
      await fetch('/api/crash-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch { /* dev server absent (prod) — the localStorage copy is the record */ }
  }

  /** All stored reports (newest last). */
  getReports(): CrashReport[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  clearReports(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }

  get lostCount(): number { return this.contextLostCount; }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('error', this.onError);
      window.removeEventListener('unhandledrejection', this.onRejection);
    }
    for (const canvas of this.canvases) {
      canvas.removeEventListener('webglcontextlost', this.handleContextLost as EventListener, false);
      canvas.removeEventListener('webglcontextrestored', this.handleContextRestored as EventListener, false);
    }
    this.canvases.clear();
    this.installed = false;
  }
}
