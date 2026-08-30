// Standalone DOM/UI helpers extracted from main.ts. These have no dependency on the
// editor's module-scope state, so they live here to keep main.ts focused and to make
// them independently reusable + unit-testable. (First step of the main.ts decomposition.)

/** HTML-escape arbitrary text before splicing it into innerHTML (prevents XSS). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Non-blocking toast notifications — replaces alert() for a polished UX. */
let toastContainer: HTMLDivElement | null = null;
export function showToast(message: string, kind: 'info' | 'success' | 'warn' | 'error' = 'info'): void {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText =
      'position:fixed;top:48px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
    document.body.appendChild(toastContainer);
  }
  const colors: Record<string, string> = {
    info: 'var(--accent-cyan)',
    success: 'var(--accent-green)',
    warn: 'var(--accent-gold)',
    error: '#ef4444',
  };
  const el = document.createElement('div');
  el.style.cssText = `background:rgba(10,12,16,0.95);border:1px solid ${colors[kind]};color:#fff;padding:8px 12px;border-radius:6px;font-size:11px;font-family:inherit;max-width:320px;box-shadow:0 4px 16px rgba(0,0,0,0.4);opacity:0;transform:translateX(20px);transition:all 0.25s ease;pointer-events:auto;`;
  el.textContent = message;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(0)';
  });
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

/** HELM: post a control-plane result back to the dev server, keyed by request id, so
 *  it can resolve the agent's held HTTP request. No-op if there's no id / dev server. */
export function sendHelmResult(id: string | undefined, result: unknown): void {
  if (!id) return;
  fetch('/api/helm/rpc-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, result }),
  }).catch(() => {});
}
