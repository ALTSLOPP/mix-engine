/**
 * scriptSandbox.ts — Worker/iframe capability sandbox (stub for trusted-content-only model).
 *
 * Real sandboxing requires running untrusted code off the main thread with a
 * structured capability API. This file documents the intended design and
 * provides a minimal Worker wrapper that can be wired up when the engine needs
 * to execute third-party / marketplace scripts.
 *
 * Current status (as of the export/runtime hardening pass):
 *   - ScriptComponent now rejects browser globals by default (trusted-only guard).
 *   - This module is NOT yet wired into the hot path. To run an untrusted
 *     script, create a Worker from `sandboxWorker.js` and proxy the ScriptAPI
 *     over postMessage (only capability methods, not raw engine references).
 *
 * Intended protocol (future):
 *   Main thread -> Worker: { op: 'tick', dt, events }
 *   Worker -> Main: { op: 'call', capability: 'sceneManager.spawn', args: [...] }
 *   Main thread validates args and executes, returns result.
 *
 * Until then, ANY script that needs `window`/`fetch`/etc MUST set
 * `ScriptComponent.ALLOW_UNTRUSTED_GLOBALS = true` and is considered trusted.
 */

// Worker sandbox is now implemented in `ScriptWorkerSandbox.ts`.
// This helper preserves backward compat and delegates to the real sandbox when available.
import { ScriptWorkerSandbox } from './ScriptWorkerSandbox';
export function createSandboxedScriptWorker(entityId = 0, code = '', onCall?: (c: any) => unknown): Worker | null {
  try {
    const sb = new ScriptWorkerSandbox(entityId, code, onCall);
    return (sb as any).worker as Worker | null;
  } catch {
    console.warn('[scriptSandbox] Worker sandbox unavailable — using main-thread (trusted).');
    return null;
  }
}
